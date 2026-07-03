"""
REST API endpoints. Todos requieren autenticación (ADR-4):
- admin/operator ven y gestionan toda la flota
- client solo ve sus vehículos asignados (user_vehicles)
"""

from __future__ import annotations
import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from server.auth import (
    allowed_vehicle_ids,
    decode_access_token,
    get_current_user,
    require_role,
)
from server.database import AsyncSessionLocal, get_db
from server.models import ROLE_ADMIN, ROLE_OPERATOR, User, Vehicle, Position, Alarm
from server.ws import manager as ws_manager
from server.api.auth_routes import router as auth_router

logger = logging.getLogger(__name__)

router = APIRouter()
router.include_router(auth_router)


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
    user: User = Depends(require_role(ROLE_ADMIN, ROLE_OPERATOR)),
    db: AsyncSession = Depends(get_db),
):
    vehicle = await _require_vehicle(db, device_id, user)
    for field in ("name", "plate"):
        if field in body:
            setattr(vehicle, field, body[field])
    vehicle.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return _vehicle_dict(vehicle)


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
    }


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
