"""
Geocercas (Fase 5): geometría (punto dentro de círculo/polígono) y evaluación
de transiciones entrar/salir durante la ingesta.

La evaluación es transaccional: recibe la sesión abierta por el handler de
ingesta, crea las filas `Alarm` (tipo GEOFENCE_ENTER/EXIT) de las transiciones
y actualiza el estado `last_inside` de cada asignación. Devuelve los eventos
nuevos para que el llamador dispare el push fuera de la transacción.
"""

from __future__ import annotations
import math
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from server.models import (
    Alarm,
    EVENT_GEOFENCE_ENTER,
    EVENT_GEOFENCE_EXIT,
    GEOFENCE_CIRCLE,
    Geofence,
    GeofenceVehicle,
)

# Banda muerta (m) alrededor del borde de un círculo: ya dentro, hay que
# alejarse el radio + este margen para contar como "salida". Evita el
# parpadeo entrar/salir por el ruido del GPS cuando la moto está en el borde.
CIRCLE_HYSTERESIS_M = 25.0

_EARTH_R = 6_371_000.0


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distancia en metros entre dos puntos (lat/lon en grados)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return _EARTH_R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def point_in_circle(lat: float, lon: float, geometry: dict, margin_m: float = 0.0) -> bool:
    center = geometry["center"]
    return haversine_m(lat, lon, center[0], center[1]) <= geometry["radius_m"] + margin_m


def point_in_polygon(lat: float, lon: float, geometry: dict) -> bool:
    """Ray casting (PNPOLY). `points` es [[lat, lon], ...]; a escala de ciudad
    la distorsión de tratar lat/lon como plano es despreciable."""
    pts = geometry["points"]
    n = len(pts)
    if n < 3:
        return False
    x, y = lon, lat
    inside = False
    j = n - 1
    for i in range(n):
        yi, xi = pts[i][0], pts[i][1]
        yj, xj = pts[j][0], pts[j][1]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def is_inside(kind: str, geometry: dict, lat: float, lon: float, prev_inside: bool) -> bool:
    """Dentro/fuera con hysteresis en el círculo (según el estado previo)."""
    if kind == GEOFENCE_CIRCLE:
        margin = CIRCLE_HYSTERESIS_M if prev_inside else 0.0
        return point_in_circle(lat, lon, geometry, margin)
    return point_in_polygon(lat, lon, geometry)


async def evaluate_geofences(
    session: AsyncSession,
    vehicle_id: str,
    lat: float,
    lon: float,
    timestamp: datetime,
) -> list[dict]:
    """Evalúa las geocercas activas asignadas al vehículo. Crea las alarmas de
    transición y actualiza `last_inside` en la sesión abierta. Devuelve los
    eventos nuevos (`{alarm_type, geofence}`) para el push."""
    rows = await session.execute(
        select(Geofence, GeofenceVehicle)
        .join(GeofenceVehicle, GeofenceVehicle.geofence_id == Geofence.id)
        .where(
            GeofenceVehicle.vehicle_id == vehicle_id,
            Geofence.is_active == True,  # noqa: E712
        )
    )

    events: list[dict] = []
    for geofence, link in rows.all():
        now_inside = is_inside(geofence.kind, geofence.geometry, lat, lon, bool(link.last_inside))

        # Primera evaluación: se siembra el estado sin emitir evento (así un
        # reinicio o una asignación nueva no dispara una falsa entrada/salida).
        if link.last_inside is None:
            link.last_inside = now_inside
            continue

        if now_inside == link.last_inside:
            continue

        link.last_inside = now_inside
        entering = now_inside
        if entering and not link.notify_enter:
            continue
        if not entering and not link.notify_exit:
            continue

        alarm_type = EVENT_GEOFENCE_ENTER if entering else EVENT_GEOFENCE_EXIT
        session.add(
            Alarm(
                vehicle_id=vehicle_id,
                alarm_type=alarm_type,
                timestamp=timestamp,
                latitude=lat,
                longitude=lon,
                notes=geofence.name,
            )
        )
        events.append({"alarm_type": alarm_type, "geofence": geofence.name})

    return events
