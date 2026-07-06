"""
CRUD de geocercas (Fase 5). RBAC:
- admin/operador: ven y gestionan todas.
- client: crea las suyas, solo las ve/gestiona si las creó, y solo puede
  asignarlas a SUS vehículos (user_vehicles).
La evaluación entrar/salir vive en la ingesta (server/geofences.py).
"""

from __future__ import annotations
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from server.auth import allowed_vehicle_ids, get_current_user
from server.database import get_db
from server.models import (
    GEOFENCE_CIRCLE,
    GEOFENCE_KINDS,
    Geofence,
    GeofenceVehicle,
    ROLE_ADMIN,
    ROLE_OPERATOR,
    User,
    Vehicle,
    utcnow,
)

router = APIRouter(prefix="/geofences", tags=["geofences"])


def _is_staff(user: User) -> bool:
    return user.role in (ROLE_ADMIN, ROLE_OPERATOR)


def _validate_geometry(kind: Optional[str], geometry) -> None:
    if kind not in GEOFENCE_KINDS:
        raise HTTPException(400, "Tipo de geocerca inválido (circle | polygon)")
    if not isinstance(geometry, dict):
        raise HTTPException(400, "Geometría inválida")
    if kind == GEOFENCE_CIRCLE:
        center = geometry.get("center")
        radius = geometry.get("radius_m")
        ok = (
            isinstance(center, list)
            and len(center) == 2
            and all(isinstance(v, (int, float)) for v in center)
            and isinstance(radius, (int, float))
            and radius > 0
        )
        if not ok:
            raise HTTPException(400, "Círculo inválido: center [lat, lon] + radius_m > 0")
    else:
        pts = geometry.get("points")
        ok = (
            isinstance(pts, list)
            and len(pts) >= 3
            and all(
                isinstance(p, list) and len(p) == 2 and all(isinstance(v, (int, float)) for v in p)
                for p in pts
            )
        )
        if not ok:
            raise HTTPException(400, "Polígono inválido: al menos 3 puntos [lat, lon]")


async def _check_vehicle_perms(db: AsyncSession, user: User, vehicle_ids: list[str]) -> None:
    """Los vehículos deben existir; un client solo puede tocar los suyos."""
    if not vehicle_ids:
        return
    existing = set(
        (await db.execute(select(Vehicle.id).where(Vehicle.id.in_(vehicle_ids)))).scalars().all()
    )
    missing = [v for v in vehicle_ids if v not in existing]
    if missing:
        raise HTTPException(404, f"Vehículo(s) no encontrados: {', '.join(missing)}")
    allowed = await allowed_vehicle_ids(db, user)
    if allowed is not None:
        forbidden = [v for v in vehicle_ids if v not in allowed]
        if forbidden:
            raise HTTPException(403, "No puedes asignar motos que no son tuyas")


async def _links_for(db: AsyncSession, geofence_ids: list[int]) -> dict[int, list[GeofenceVehicle]]:
    if not geofence_ids:
        return {}
    rows = (
        await db.execute(
            select(GeofenceVehicle).where(GeofenceVehicle.geofence_id.in_(geofence_ids))
        )
    ).scalars().all()
    out: dict[int, list[GeofenceVehicle]] = {}
    for link in rows:
        out.setdefault(link.geofence_id, []).append(link)
    return out


async def _require_geofence(db: AsyncSession, gid: int, user: User, *, manage: bool = False) -> Geofence:
    gf = await db.get(Geofence, gid)
    if gf is None:
        raise HTTPException(404, "Geocerca no encontrada")
    if _is_staff(user):
        return gf

    is_creator = gf.created_by == user.id
    # Visible para el cliente si la creó o está asignada a una moto suya.
    allowed = await allowed_vehicle_ids(db, user)
    linked = (
        await db.execute(
            select(GeofenceVehicle.geofence_id).where(
                GeofenceVehicle.geofence_id == gid,
                GeofenceVehicle.vehicle_id.in_(allowed or []),
            )
        )
    ).first()
    if not (is_creator or linked is not None):
        # No la ve → 404 (no revelar que existe una geocerca sobre otra moto)
        raise HTTPException(404, "Geocerca no encontrada")
    if manage and not is_creator:
        # La ve (está sobre su moto) pero no la creó → puede verla, no gestionarla
        raise HTTPException(403, "No puedes gestionar esta geocerca")
    return gf


def _geofence_dict(gf: Geofence, links: list[GeofenceVehicle], visible_ids: Optional[set]) -> dict:
    shown = [l for l in links if visible_ids is None or l.vehicle_id in visible_ids]
    return {
        "id": gf.id,
        "name": gf.name,
        "color": gf.color,
        "kind": gf.kind,
        "geometry": gf.geometry,
        "is_active": gf.is_active,
        "created_by": gf.created_by,
        "created_at": gf.created_at.isoformat() if gf.created_at else None,
        "vehicles": [
            {"vehicle_id": l.vehicle_id, "notify_enter": l.notify_enter, "notify_exit": l.notify_exit}
            for l in shown
        ],
    }


@router.get("")
async def list_geofences(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    allowed = await allowed_vehicle_ids(db, user)
    q = select(Geofence).order_by(Geofence.name)
    if allowed is not None:
        linked = select(GeofenceVehicle.geofence_id).where(GeofenceVehicle.vehicle_id.in_(allowed))
        q = q.where(or_(Geofence.created_by == user.id, Geofence.id.in_(linked)))
    geofences = (await db.execute(q)).scalars().all()
    links = await _links_for(db, [g.id for g in geofences])
    return [_geofence_dict(g, links.get(g.id, []), allowed) for g in geofences]


@router.post("", status_code=201)
async def create_geofence(
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "El nombre es obligatorio")
    kind = body.get("kind")
    geometry = body.get("geometry")
    _validate_geometry(kind, geometry)

    vehicles = body.get("vehicles") or []
    await _check_vehicle_perms(db, user, [v["vehicle_id"] for v in vehicles])

    gf = Geofence(
        name=name,
        color=(body.get("color") or "#2563eb"),
        kind=kind,
        geometry=geometry,
        is_active=bool(body.get("is_active", True)),
        created_by=user.id,
    )
    db.add(gf)
    await db.flush()
    for v in vehicles:
        db.add(
            GeofenceVehicle(
                geofence_id=gf.id,
                vehicle_id=v["vehicle_id"],
                notify_enter=bool(v.get("notify_enter", True)),
                notify_exit=bool(v.get("notify_exit", True)),
            )
        )
    await db.commit()
    links = await _links_for(db, [gf.id])
    allowed = await allowed_vehicle_ids(db, user)
    return _geofence_dict(gf, links.get(gf.id, []), allowed)


@router.patch("/{gid}")
async def update_geofence(
    gid: int,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    gf = await _require_geofence(db, gid, user, manage=True)
    if "name" in body:
        gf.name = (body["name"] or "").strip() or gf.name
    if "color" in body:
        gf.color = body["color"]
    if "is_active" in body:
        gf.is_active = bool(body["is_active"])
    if "geometry" in body or "kind" in body:
        kind = body.get("kind", gf.kind)
        geometry = body.get("geometry", gf.geometry)
        _validate_geometry(kind, geometry)
        gf.kind = kind
        gf.geometry = geometry
    gf.updated_at = utcnow()
    await db.commit()
    links = await _links_for(db, [gf.id])
    allowed = await allowed_vehicle_ids(db, user)
    return _geofence_dict(gf, links.get(gf.id, []), allowed)


@router.delete("/{gid}", status_code=204)
async def delete_geofence(
    gid: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    gf = await _require_geofence(db, gid, user, manage=True)
    await db.delete(gf)
    await db.commit()


@router.put("/{gid}/vehicles")
async def set_geofence_vehicles(
    gid: int,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    gf = await _require_geofence(db, gid, user, manage=True)
    vehicles = body.get("vehicles") or []
    ids = [v["vehicle_id"] for v in vehicles]
    await _check_vehicle_perms(db, user, ids)

    existing = (
        await db.execute(select(GeofenceVehicle).where(GeofenceVehicle.geofence_id == gid))
    ).scalars().all()
    allowed = await allowed_vehicle_ids(db, user)
    # Staff reemplaza todo; un client solo toca sus propias asignaciones y
    # conserva las que un admin pudiera haber puesto sobre motos ajenas.
    for link in existing:
        if allowed is None or link.vehicle_id in allowed:
            await db.delete(link)
    await db.flush()
    for v in vehicles:
        db.add(
            GeofenceVehicle(
                geofence_id=gid,
                vehicle_id=v["vehicle_id"],
                notify_enter=bool(v.get("notify_enter", True)),
                notify_exit=bool(v.get("notify_exit", True)),
            )
        )
    await db.commit()
    links = await _links_for(db, [gid])
    return _geofence_dict(gf, links.get(gid, []), allowed)
