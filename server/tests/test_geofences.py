"""Tests de geocercas: geometría, transiciones de la evaluación y RBAC del CRUD."""

import asyncio
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from server.geofences import evaluate_geofences, is_inside, point_in_circle, point_in_polygon
from server.models import (
    Base,
    EVENT_GEOFENCE_ENTER,
    EVENT_GEOFENCE_EXIT,
    GEOFENCE_CIRCLE,
    Geofence,
    GeofenceVehicle,
    Vehicle,
)
from server.tests.conftest import bearer, login

CIRCLE = {"center": [10.0, -75.0], "radius_m": 100}


# ── Geometría pura ──────────────────────────────────────────────

def test_point_in_circle():
    assert point_in_circle(10.0, -75.0, CIRCLE)          # el centro está dentro
    assert not point_in_circle(10.01, -75.0, CIRCLE)     # ~1.1 km al norte: fuera


def test_point_in_polygon():
    square = {"points": [[10.0, -75.0], [10.0, -75.01], [10.01, -75.01], [10.01, -75.0]]}
    assert point_in_polygon(10.005, -75.005, square)     # centro del cuadrado
    assert not point_in_polygon(10.02, -75.005, square)  # al norte, fuera
    assert not point_in_polygon(10.005, -74.5, square)   # muy al este, fuera


def test_circle_hysteresis():
    # ~110 m al este del centro (entre el radio 100 y radio+margen 125):
    # cuenta como fuera si venía de fuera, pero como dentro si ya estaba dentro.
    lat, lon = 10.0, -75.0 + 0.0010
    assert not is_inside(GEOFENCE_CIRCLE, CIRCLE, lat, lon, prev_inside=False)
    assert is_inside(GEOFENCE_CIRCLE, CIRCLE, lat, lon, prev_inside=True)


# ── Evaluación de transiciones (engine propio, aislado del TestClient) ──

def _run_scenario(tmp_path, name, notify_enter=True, notify_exit=True):
    async def scenario():
        eng = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / name}")
        async with eng.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        Session = async_sessionmaker(eng, expire_on_commit=False)
        async with Session() as s:
            s.add(Vehicle(id="1111111111", name="Moto"))
            gf = Geofence(
                name="Casa", kind=GEOFENCE_CIRCLE, color="#2563eb",
                geometry=CIRCLE, is_active=True,
            )
            s.add(gf)
            await s.flush()
            s.add(GeofenceVehicle(
                geofence_id=gf.id, vehicle_id="1111111111",
                notify_enter=notify_enter, notify_exit=notify_exit,
            ))
            await s.commit()

        ts = datetime.now(timezone.utc)

        async def ev(lat, lon):
            async with Session() as s:
                out = await evaluate_geofences(s, "1111111111", lat, lon, ts)
                await s.commit()
                return [e["alarm_type"] for e in out]

        results = {
            "seed": await ev(10.0, -75.0),    # dentro → siembra, sin evento
            "exit": await ev(10.02, -75.0),   # fuera → salida
            "enter": await ev(10.0, -75.0),   # dentro → entrada
        }
        await eng.dispose()
        return results

    return asyncio.run(scenario())


def test_evaluate_transitions(tmp_path):
    r = _run_scenario(tmp_path, "gf_trans.db")
    assert r["seed"] == []
    assert r["exit"] == [EVENT_GEOFENCE_EXIT]
    assert r["enter"] == [EVENT_GEOFENCE_ENTER]


def test_notify_enter_disabled_suppresses_event(tmp_path):
    # notify_enter=False: la entrada no emite evento, pero el estado igual se
    # actualiza, así que la salida posterior sí dispara.
    r = _run_scenario(tmp_path, "gf_notify.db", notify_enter=False)
    assert r["seed"] == []
    assert r["exit"] == [EVENT_GEOFENCE_EXIT]
    assert r["enter"] == []


# ── CRUD + RBAC vía API ─────────────────────────────────────────

def test_geofence_crud_rbac(client):
    admin = bearer(login(client, "admin@test.local", "admin12345"))
    cli = bearer(login(client, "cliente@test.local", "cliente12345"))

    # El cliente crea una geocerca sobre SU moto → 201
    r = client.post("/api/geofences", headers=cli, json={
        "name": "Mi casa", "kind": "circle", "geometry": {"center": [10.0, -75.0], "radius_m": 150},
        "vehicles": [{"vehicle_id": "1111111111"}],
    })
    assert r.status_code == 201, r.text
    gid_client = r.json()["id"]
    assert r.json()["vehicles"][0]["vehicle_id"] == "1111111111"

    # El cliente NO puede asignar una moto ajena → 403
    r = client.post("/api/geofences", headers=cli, json={
        "name": "Ajena", "kind": "circle", "geometry": {"center": [10.0, -75.0], "radius_m": 150},
        "vehicles": [{"vehicle_id": "2222222222"}],
    })
    assert r.status_code == 403, r.text

    # El admin crea una geocerca sobre la moto ajena → 201
    r = client.post("/api/geofences", headers=admin, json={
        "name": "Zona admin", "kind": "circle", "geometry": {"center": [10.0, -75.0], "radius_m": 150},
        "vehicles": [{"vehicle_id": "2222222222"}],
    })
    assert r.status_code == 201, r.text
    gid_admin = r.json()["id"]

    # El cliente solo ve la suya; el admin ve ambas
    cli_ids = {g["id"] for g in client.get("/api/geofences", headers=cli).json()}
    assert gid_client in cli_ids and gid_admin not in cli_ids
    admin_ids = {g["id"] for g in client.get("/api/geofences", headers=admin).json()}
    assert {gid_client, gid_admin} <= admin_ids

    # El cliente no puede borrar la geocerca del admin → 404 (no es suya)
    assert client.delete(f"/api/geofences/{gid_admin}", headers=cli).status_code == 404

    # Geometría inválida (polígono con <3 puntos) → 400
    r = client.post("/api/geofences", headers=admin, json={
        "name": "Mala", "kind": "polygon", "geometry": {"points": [[10.0, -75.0]]},
    })
    assert r.status_code == 400, r.text
