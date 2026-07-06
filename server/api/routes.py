"""
REST API endpoints. Todos requieren autenticación (ADR-4):
- admin/operator ven y gestionan toda la flota
- client solo ve sus vehículos asignados (user_vehicles)
"""

from __future__ import annotations
import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Response, WebSocket, WebSocketDisconnect
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from server.auth import (
    allowed_vehicle_ids,
    decode_access_token,
    get_current_user,
    require_role,
)
from server.crypto import decrypt_secret, encrypt_secret
from server.database import AsyncSessionLocal, get_db
from server.models import (
    CMD_CONFIRMED,
    CMD_FAILED,
    CMD_SENT,
    COMMAND_ACTIVE_STATUSES,
    COMMAND_ENGINE_RESUME,
    COMMAND_ENGINE_STOP,
    COMMAND_TYPES,
    ROLE_ADMIN,
    ROLE_OPERATOR,
    User,
    Vehicle,
    Position,
    Alarm,
    DeviceCommand,
    PushToken,
)
from server.ws import manager as ws_manager
from server.api.auth_routes import router as auth_router
from server.api.admin_routes import router as admin_router

logger = logging.getLogger(__name__)

router = APIRouter()
router.include_router(auth_router)
router.include_router(admin_router)


@router.get("/healthz")
async def healthz():
    """Chequeo de salud sin autenticación (monitoreo y CI/CD)."""
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Vehicles
# ---------------------------------------------------------------------------

@router.get("/vehicles")
async def list_vehicles(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    allowed = await allowed_vehicle_ids(db, user)
    q = select(Vehicle).order_by(Vehicle.name)
    if allowed is not None:
        q = q.where(Vehicle.id.in_(allowed))
    result = await db.execute(q)
    return [_vehicle_dict(v) for v in result.scalars().all()]


@router.get("/vehicles/{device_id}")
async def get_vehicle(
    device_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    vehicle = await _require_vehicle(db, device_id, user)
    return _vehicle_dict(vehicle)


@router.patch("/vehicles/{device_id}")
async def update_vehicle(
    device_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin/operador editan todo; el cliente puede renombrar y cambiar la
    placa de SUS vehículos, pero no tocar el canal de comandos
    (sim_phone / command_password), que es la puerta al corte de motor."""
    vehicle = await _require_vehicle(db, device_id, user)

    is_staff = user.role in (ROLE_ADMIN, ROLE_OPERATOR)
    if not is_staff and ({"sim_phone", "command_password"} & set(body)):
        raise HTTPException(403, "No tienes permiso para editar esos campos")

    editable = ("name", "plate", "sim_phone") if is_staff else ("name", "plate")
    for field in editable:
        if field in body:
            setattr(vehicle, field, body[field])
    if is_staff and "command_password" in body:
        pw = (body["command_password"] or "").strip()
        vehicle.command_password_enc = encrypt_secret(pw) if pw else None
    vehicle.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return _vehicle_dict(vehicle)


@router.get("/vehicles/{device_id}/streetview")
async def vehicle_streetview(
    device_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Proxy server-side a Street View Static API: la API key de Google nunca
    llega al navegador (el cliente solo llama a nuestra propia API con JWT)."""
    vehicle = await _require_vehicle(db, device_id, user)
    if vehicle.last_lat is None or vehicle.last_lon is None:
        raise HTTPException(404, "El vehículo no tiene una posición registrada")

    api_key = os.environ.get("GOOGLE_STREETVIEW_API_KEY")
    if not api_key:
        raise HTTPException(503, "Street View no está configurado en el servidor")

    params = {
        "size": "640x400",
        "location": f"{vehicle.last_lat},{vehicle.last_lon}",
        "fov": 80,
        "source": "outdoor",
        "return_error_code": "true",
        "key": api_key,
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get("https://maps.googleapis.com/maps/api/streetview", params=params)
    except httpx.HTTPError:
        raise HTTPException(502, "No se pudo contactar Street View")

    if resp.status_code == 404:
        raise HTTPException(404, "Sin imagen de Street View para esta ubicación")
    if resp.status_code != 200:
        raise HTTPException(502, "Street View no respondió correctamente")

    return Response(content=resp.content, media_type=resp.headers.get("content-type", "image/jpeg"))


# ---------------------------------------------------------------------------
# Positions / history
# ---------------------------------------------------------------------------

@router.get("/vehicles/{device_id}/positions")
async def get_positions(
    device_id: str,
    since: Optional[datetime] = Query(None),
    until: Optional[datetime] = Query(None),
    limit: int = Query(500, le=5000),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_vehicle(db, device_id, user)

    q = select(Position).where(Position.vehicle_id == device_id)

    if since:
        q = q.where(Position.timestamp >= since)
    if until:
        q = q.where(Position.timestamp <= until)

    q = q.order_by(desc(Position.timestamp)).limit(limit)
    result = await db.execute(q)
    positions = result.scalars().all()

    return [_position_dict(p) for p in reversed(positions)]


@router.get("/vehicles/{device_id}/track/today")
async def track_today(
    device_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return await get_positions(device_id, since=start, until=now, limit=5000, user=user, db=db)


# ---------------------------------------------------------------------------
# Device commands (Fase 3 — corte de motor, modo manual)
#
# Máquina de estados: pending -> sent -> confirmed (o failed/expired).
# Nunca "éxito optimista": el estado lo confirma un humano (hoy no hay
# gateway SMS automatizado — ver docs/corte-motor.md) hasta recibir el
# SET OK del equipo o comprobar el corte en campo.
# ---------------------------------------------------------------------------

SMS_CODE_BY_TYPE = {COMMAND_ENGINE_STOP: "940", COMMAND_ENGINE_RESUME: "941"}


@router.post("/vehicles/{device_id}/commands", status_code=201)
async def create_command(
    device_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    vehicle = await _require_vehicle(db, device_id, user)
    cmd_type = body.get("type")
    if cmd_type not in COMMAND_TYPES:
        raise HTTPException(status_code=400, detail="Tipo de comando inválido")

    in_flight = await db.execute(
        select(DeviceCommand).where(
            DeviceCommand.vehicle_id == device_id,
            DeviceCommand.status.in_(COMMAND_ACTIVE_STATUSES),
        )
    )
    if in_flight.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Ya hay un comando en curso para este vehículo")

    command = DeviceCommand(vehicle_id=device_id, type=cmd_type, requested_by=user.id)
    db.add(command)
    await db.commit()
    await db.refresh(command)

    # El texto del SMS solo se revela a quien puede operarlo (admin/operator):
    # un cliente puede solicitar el corte, pero no ve la contraseña del equipo.
    sms_text = sms_phone = None
    if user.role in (ROLE_ADMIN, ROLE_OPERATOR) and vehicle.command_password_enc:
        password = decrypt_secret(vehicle.command_password_enc)
        sms_text = f"{SMS_CODE_BY_TYPE[cmd_type]}{password}"
        sms_phone = vehicle.sim_phone

    return _command_dict(command, sms_text=sms_text, sms_phone=sms_phone)


@router.get("/vehicles/{device_id}/commands")
async def list_commands(
    device_id: str,
    limit: int = Query(20, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    vehicle = await _require_vehicle(db, device_id, user)
    q = (
        select(DeviceCommand)
        .where(DeviceCommand.vehicle_id == device_id)
        .order_by(desc(DeviceCommand.created_at))
        .limit(limit)
    )
    result = await db.execute(q)
    commands = result.scalars().all()

    # La contraseña se descifra una vez y solo se adjunta a los comandos aún
    # accionables (pending/sent) de un admin/operator — nunca al cliente ni
    # a comandos ya cerrados. Sobrevive a un refresh de la página.
    password = None
    if user.role in (ROLE_ADMIN, ROLE_OPERATOR) and vehicle.command_password_enc:
        password = decrypt_secret(vehicle.command_password_enc)

    out = []
    for c in commands:
        sms_text = sms_phone = None
        if password and c.status in COMMAND_ACTIVE_STATUSES:
            sms_text = f"{SMS_CODE_BY_TYPE[c.type]}{password}"
            sms_phone = vehicle.sim_phone
        out.append(_command_dict(c, sms_text=sms_text, sms_phone=sms_phone))
    return out


@router.patch("/commands/{command_id}/status")
async def update_command_status(
    command_id: int,
    body: dict,
    user: User = Depends(require_role(ROLE_ADMIN, ROLE_OPERATOR)),
    db: AsyncSession = Depends(get_db),
):
    command = await db.get(DeviceCommand, command_id)
    if command is None:
        raise HTTPException(status_code=404, detail="Comando no encontrado")

    new_status = body.get("status")
    if new_status not in (CMD_SENT, CMD_CONFIRMED, CMD_FAILED):
        raise HTTPException(status_code=400, detail="Estado inválido")

    now = datetime.now(timezone.utc)
    if new_status == CMD_SENT:
        command.sent_at = now
    elif new_status == CMD_CONFIRMED:
        command.confirmed_at = now
        if command.sent_at is None:
            command.sent_at = now
    elif new_status == CMD_FAILED:
        command.error = (body.get("error") or "").strip() or None

    command.status = new_status
    await db.commit()
    return _command_dict(command)


# ---------------------------------------------------------------------------
# Alarms
# ---------------------------------------------------------------------------

@router.get("/alarms")
async def list_alarms(
    device_id: Optional[str] = None,
    alarm_type: Optional[str] = None,
    acknowledged: Optional[bool] = None,
    limit: int = Query(100, le=1000),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    allowed = await allowed_vehicle_ids(db, user)
    q = select(Alarm).order_by(desc(Alarm.timestamp)).limit(limit)
    if allowed is not None:
        q = q.where(Alarm.vehicle_id.in_(allowed))
    if device_id:
        q = q.where(Alarm.vehicle_id == device_id)
    if alarm_type:
        q = q.where(Alarm.alarm_type == alarm_type.upper())
    if acknowledged is not None:
        q = q.where(Alarm.acknowledged == acknowledged)
    result = await db.execute(q)
    return [_alarm_dict(a) for a in result.scalars().all()]


@router.patch("/alarms/{alarm_id}/acknowledge")
async def acknowledge_alarm(
    alarm_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Alarm).where(Alarm.id == alarm_id))
    alarm = result.scalar_one_or_none()
    if alarm is None:
        raise HTTPException(status_code=404, detail="Alarm not found")
    allowed = await allowed_vehicle_ids(db, user)
    if allowed is not None and alarm.vehicle_id not in allowed:
        raise HTTPException(status_code=403, detail="Permisos insuficientes")
    alarm.acknowledged = True
    await db.commit()
    return _alarm_dict(alarm)


# ---------------------------------------------------------------------------
# Push notifications (Fase 4 — FCM, ver server/push.py)
# ---------------------------------------------------------------------------

@router.post("/push_tokens", status_code=201)
async def register_push_token(
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    token = (body.get("fcm_token") or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="fcm_token requerido")
    platform = (body.get("platform") or "android").strip()

    result = await db.execute(select(PushToken).where(PushToken.fcm_token == token))
    existing = result.scalar_one_or_none()
    if existing is not None:
        # Mismo token, posible cambio de cuenta en el dispositivo (upsert).
        existing.user_id = user.id
        existing.platform = platform
        existing.updated_at = datetime.now(timezone.utc)
    else:
        db.add(PushToken(user_id=user.id, fcm_token=token, platform=platform))
    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Stats  (fix B3: count con select(); conteos según el rol)
# ---------------------------------------------------------------------------

@router.get("/stats")
async def stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    allowed = await allowed_vehicle_ids(db, user)

    vehicles_q = select(func.count()).select_from(Vehicle)
    online_q = select(func.count()).select_from(Vehicle).where(Vehicle.is_online == True)  # noqa: E712
    alarms_q = select(func.count()).select_from(Alarm).where(Alarm.acknowledged == False)  # noqa: E712
    if allowed is not None:
        vehicles_q = vehicles_q.where(Vehicle.id.in_(allowed))
        online_q = online_q.where(Vehicle.id.in_(allowed))
        alarms_q = alarms_q.where(Alarm.vehicle_id.in_(allowed))

    return {
        "total_vehicles": (await db.execute(vehicles_q)).scalar(),
        "online_vehicles": (await db.execute(online_q)).scalar(),
        "unacknowledged_alarms": (await db.execute(alarms_q)).scalar(),
    }


# ---------------------------------------------------------------------------
# WebSocket (autenticado: primer mensaje {"type":"auth","token":...})
# ---------------------------------------------------------------------------

AUTH_TIMEOUT_S = 5
WS_POLICY_VIOLATION = 4401


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    try:
        raw = await asyncio.wait_for(ws.receive_text(), timeout=AUTH_TIMEOUT_S)
    except asyncio.TimeoutError:
        await ws.close(code=WS_POLICY_VIOLATION)
        return

    try:
        msg = json.loads(raw)
        payload = decode_access_token(msg.get("token", "")) if msg.get("type") == "auth" else None
    except (json.JSONDecodeError, AttributeError):
        payload = None

    if payload is None:
        try:
            await ws.send_text('{"type":"auth_error"}')
        finally:
            await ws.close(code=WS_POLICY_VIOLATION)
        return

    async with AsyncSessionLocal() as db:
        user = await db.get(User, int(payload["sub"]))
        if user is None or not user.is_active:
            await ws.close(code=WS_POLICY_VIOLATION)
            return
        allowed = await allowed_vehicle_ids(db, user)

    await ws.send_text('{"type":"auth_ok"}')
    ws_manager.register(ws, allowed)
    try:
        while True:
            await ws.receive_text()  # keep-alive pings del cliente
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect(ws)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _require_vehicle(db: AsyncSession, device_id: str, user: User) -> Vehicle:
    result = await db.execute(select(Vehicle).where(Vehicle.id == device_id))
    vehicle = result.scalar_one_or_none()
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    allowed = await allowed_vehicle_ids(db, user)
    if allowed is not None and device_id not in allowed:
        # 404 (no 403) para no revelar qué IDs existen
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return vehicle


def _vehicle_dict(v: Vehicle) -> dict:
    return {
        "id": v.id,
        "name": v.name,
        "plate": v.plate,
        "iccid": v.iccid,
        "is_online": v.is_online,
        "acc_off": v.acc_off,
        "last_lat": v.last_lat,
        "last_lon": v.last_lon,
        "last_speed": v.last_speed,
        "last_direction": v.last_direction,
        "last_seen": v.last_seen.isoformat() if v.last_seen else None,
        "battery_pct": v.battery_pct,
        "voltage": v.voltage,
        "gsm_signal": v.gsm_signal,
        "satellites": v.satellites,
        "sim_phone": v.sim_phone,
        "has_command_password": v.command_password_enc is not None,
    }


def _command_dict(c: DeviceCommand, sms_text: Optional[str] = None, sms_phone: Optional[str] = None) -> dict:
    d = {
        "id": c.id,
        "vehicle_id": c.vehicle_id,
        "type": c.type,
        "status": c.status,
        "requested_by": c.requested_by,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "sent_at": c.sent_at.isoformat() if c.sent_at else None,
        "confirmed_at": c.confirmed_at.isoformat() if c.confirmed_at else None,
        "error": c.error,
    }
    if sms_text is not None:
        d["sms_text"] = sms_text
    if sms_phone is not None:
        d["sms_phone"] = sms_phone
    return d


def _position_dict(p: Position) -> dict:
    return {
        "id": p.id,
        "vehicle_id": p.vehicle_id,
        "timestamp": p.timestamp.isoformat(),
        "lat": p.latitude,
        "lon": p.longitude,
        "speed_kmh": p.speed_kmh,
        "direction": p.direction,
        "valid": p.valid,
        "acc_off": p.acc_off,
        "battery_pct": p.battery_pct,
        "voltage": p.voltage,
        "gsm_signal": p.gsm_signal,
        "satellites": p.satellites,
    }


def _alarm_dict(a: Alarm) -> dict:
    return {
        "id": a.id,
        "vehicle_id": a.vehicle_id,
        "alarm_type": a.alarm_type,
        "timestamp": a.timestamp.isoformat(),
        "lat": a.latitude,
        "lon": a.longitude,
        "speed_kmh": a.speed_kmh,
        "acknowledged": a.acknowledged,
        "notes": a.notes,
    }
