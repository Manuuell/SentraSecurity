"""
Async TCP server that listens for Sinotrack tracker connections.
Each device maintains a persistent TCP connection and sends V6/V8 packets.
"""

from __future__ import annotations
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, desc

from server.parser import parse_packet, get_active_alarms, GPSPacket
from server.database import AsyncSessionLocal
from server.models import Vehicle, Position, Alarm, user_vehicles, EVENT_GEOFENCE_ENTER
from server.geofences import evaluate_geofences
from server.push import send_push_to_users
from server.ws import manager as ws_manager

logger = logging.getLogger(__name__)

TCP_HOST = "0.0.0.0"
TCP_PORT = 8090

# Seconds without data before a vehicle is marked offline
ONLINE_TIMEOUT = 120

# Ventana de supresión de alarmas repetidas (fix B6): mientras el bit siga
# activo, cada paquete re-reportaría la misma alarma cada pocos segundos
ALARM_DEDUPE_WINDOW = timedelta(minutes=10)

# Push al dueño del vehículo cuando entra una alarma nueva (Fase 4 — FCM).
# Geocercas y "offline prolongado" quedan para cuando existan (Fase 5 / ajuste
# de umbral); esto cubre las alarmas del propio tracker.
ALARM_PUSH_TITLE = {
    "EMERGENCY": "Alerta de emergencia",
    "DISPLACEMENT": "Tu moto se movió sin encendido",
    "OVERSPEED": "Exceso de velocidad",
    "VIBRATION": "Vibración detectada",
    "LOW_BATTERY": "Batería del rastreador baja",
}

# Referencias a tareas en vuelo (fix B7): sin referencia, asyncio puede
# recolectarlas y las excepciones se pierden en silencio
_inflight: set[asyncio.Task] = set()


def _spawn(coro) -> None:
    task = asyncio.create_task(coro)
    _inflight.add(task)

    def _done(t: asyncio.Task) -> None:
        _inflight.discard(t)
        if not t.cancelled() and t.exception() is not None:
            logger.error("Packet handler failed", exc_info=t.exception())

    task.add_done_callback(_done)


async def _get_or_create_vehicle(session, device_id: str) -> Vehicle:
    result = await session.execute(select(Vehicle).where(Vehicle.id == device_id))
    vehicle = result.scalar_one_or_none()
    if vehicle is None:
        vehicle = Vehicle(id=device_id, name=f"Vehículo {device_id}")
        session.add(vehicle)
        await session.flush()
        logger.info("New vehicle registered: %s", device_id)
    return vehicle


async def _handle_packet(packet: GPSPacket) -> None:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            vehicle = await _get_or_create_vehicle(session, packet.device_id)

            # Update ICCID when V6 boot packet arrives
            if packet.packet_type == "V6" and packet.iccid:
                vehicle.iccid = packet.iccid

            # Always update the last-known state
            vehicle.last_seen      = packet.timestamp
            vehicle.is_online      = True
            vehicle.acc_off        = packet.vehicle_status.acc_off
            vehicle.battery_pct    = packet.battery_pct
            vehicle.voltage        = packet.voltage
            vehicle.gsm_signal     = packet.gsm_signal
            vehicle.satellites     = packet.satellites

            if packet.valid:
                vehicle.last_lat       = packet.latitude
                vehicle.last_lon       = packet.longitude
                vehicle.last_speed     = packet.speed_kmh
                vehicle.last_direction = packet.direction
                vehicle.last_valid     = True

                pos = Position(
                    vehicle_id  = packet.device_id,
                    timestamp   = packet.timestamp,
                    latitude    = packet.latitude,
                    longitude   = packet.longitude,
                    speed_kmh   = packet.speed_kmh,
                    direction   = packet.direction,
                    valid       = True,
                    satellites  = packet.satellites,
                    gsm_signal  = packet.gsm_signal,
                    voltage     = packet.voltage,
                    battery_pct = packet.battery_pct,
                    acc_off     = packet.vehicle_status.acc_off,
                )
                session.add(pos)

            # Persist active alarms con deduplicación (fix B6): no se crea una
            # alarma nueva si ya existe una igual sin reconocer en la ventana
            new_alarm_types: list[str] = []
            for alarm_type in get_active_alarms(packet):
                recent = await session.execute(
                    select(Alarm)
                    .where(
                        Alarm.vehicle_id == packet.device_id,
                        Alarm.alarm_type == alarm_type,
                        Alarm.acknowledged == False,  # noqa: E712
                    )
                    .order_by(desc(Alarm.timestamp))
                    .limit(1)
                )
                last = recent.scalar_one_or_none()
                if last is not None:
                    last_ts = last.timestamp if last.timestamp.tzinfo else last.timestamp.replace(tzinfo=timezone.utc)
                    if packet.timestamp - last_ts < ALARM_DEDUPE_WINDOW:
                        continue
                alarm = Alarm(
                    vehicle_id = packet.device_id,
                    alarm_type = alarm_type,
                    timestamp  = packet.timestamp,
                    latitude   = packet.latitude if packet.valid else None,
                    longitude  = packet.longitude if packet.valid else None,
                    speed_kmh  = packet.speed_kmh,
                )
                session.add(alarm)
                new_alarm_types.append(alarm_type)
                logger.warning("ALARM %s — device %s", alarm_type, packet.device_id)

            # Geocercas (Fase 5): transiciones entrar/salir sobre la posición nueva
            geofence_events: list[dict] = []
            if packet.valid:
                geofence_events = await evaluate_geofences(
                    session, packet.device_id, packet.latitude, packet.longitude, packet.timestamp
                )

            owner_ids: list[int] = []
            if new_alarm_types or geofence_events:
                owners = await session.execute(
                    select(user_vehicles.c.user_id).where(user_vehicles.c.vehicle_id == packet.device_id)
                )
                owner_ids = [row[0] for row in owners]

    # Push a los dueños del vehículo (fuera de la transacción: nunca debe
    # bloquearla ni tumbarla si FCM falla — ver server/push.py).
    if owner_ids and (new_alarm_types or geofence_events):
        async with AsyncSessionLocal() as push_session:
            for alarm_type in new_alarm_types:
                await send_push_to_users(
                    push_session, owner_ids,
                    title=ALARM_PUSH_TITLE.get(alarm_type, "Alerta de tu moto"),
                    body=f"{vehicle.name or vehicle.id} — revisa la app para más detalles.",
                    data={"vehicle_id": vehicle.id, "alarm_type": alarm_type},
                )
            for ev in geofence_events:
                entering = ev["alarm_type"] == EVENT_GEOFENCE_ENTER
                await send_push_to_users(
                    push_session, owner_ids,
                    title="Tu moto entró a una zona" if entering else "Tu moto salió de una zona",
                    body=f"{vehicle.name or vehicle.id} — {ev['geofence']}",
                    data={"vehicle_id": vehicle.id, "alarm_type": ev["alarm_type"], "geofence": ev["geofence"]},
                )

    # Broadcast real-time update via WebSocket (filtrado por permisos)
    await ws_manager.broadcast(vehicle_id=packet.device_id, payload={
        "event": "position",
        "device_id": packet.device_id,
        "timestamp": packet.timestamp.isoformat(),
        "valid": packet.valid,
        "lat": packet.latitude,
        "lon": packet.longitude,
        "speed_kmh": packet.speed_kmh,
        "direction": packet.direction,
        "acc_off": packet.vehicle_status.acc_off,
        "battery_pct": packet.battery_pct,
        "voltage": packet.voltage,
        "gsm_signal": packet.gsm_signal,
        "satellites": packet.satellites,
        "alarms": get_active_alarms(packet),
        "packet_type": packet.packet_type,
    })


async def _handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    addr = writer.get_extra_info("peername")
    logger.info("Tracker connected from %s", addr)
    buffer = ""

    try:
        while True:
            try:
                data = await asyncio.wait_for(reader.read(1024), timeout=ONLINE_TIMEOUT)
            except asyncio.TimeoutError:
                logger.info("Tracker %s timed out", addr)
                break

            if not data:
                break

            buffer += data.decode("ascii", errors="ignore")

            # A packet ends with #; one TCP read may contain multiple packets
            while "#" in buffer:
                end = buffer.index("#")
                raw_packet = buffer[: end + 1]
                buffer = buffer[end + 1 :]

                packet = parse_packet(raw_packet)
                if packet:
                    logger.debug("Parsed %s from %s", packet.packet_type, packet.device_id)
                    _spawn(_handle_packet(packet))
    except ConnectionResetError:
        pass
    finally:
        logger.info("Tracker disconnected from %s", addr)
        writer.close()
        await writer.wait_closed()


async def start_tcp_server() -> asyncio.Server:
    server = await asyncio.start_server(_handle_client, TCP_HOST, TCP_PORT)
    logger.info("TCP server listening on %s:%d", TCP_HOST, TCP_PORT)
    return server
