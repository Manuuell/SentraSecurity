"""
El endpoint de posiciones excluye por defecto los fixes GPS inválidos
(valid=false), que de dibujarse meten picos falsos en el recorrido.
"""

import asyncio
import datetime as dt

from sqlalchemy import delete

from server.database import AsyncSessionLocal
from server.models import Position
from server.tests.conftest import bearer, login


def _seed_positions() -> None:
    async def _run():
        async with AsyncSessionLocal() as s:
            # "Hoy" real, para que track/today (que usa la fecha actual) las vea.
            base = dt.datetime.now(dt.timezone.utc).replace(hour=1, minute=0, second=0, microsecond=0)
            s.add_all([
                Position(vehicle_id="1111111111", timestamp=base,
                         latitude=10.0, longitude=-75.0, speed_kmh=10, direction=0, valid=True),
                Position(vehicle_id="1111111111", timestamp=base + dt.timedelta(seconds=3),
                         latitude=10.001, longitude=-75.001, speed_kmh=12, direction=0, valid=True),
                # Sin fix: salto lejano que ensuciaría el trazo
                Position(vehicle_id="1111111111", timestamp=base + dt.timedelta(seconds=6),
                         latitude=10.05, longitude=-75.05, speed_kmh=0, direction=0, valid=False),
            ])
            await s.commit()
    asyncio.run(_run())


def _clear_positions() -> None:
    async def _run():
        async with AsyncSessionLocal() as s:
            await s.execute(delete(Position).where(Position.vehicle_id == "1111111111"))
            await s.commit()
    asyncio.run(_run())


def test_positions_excluye_invalidos_por_defecto(client):
    _seed_positions()
    try:
        cli = bearer(login(client, "cliente@test.local", "cliente12345"))
        # Por defecto: solo los 2 válidos
        r = client.get("/api/vehicles/1111111111/positions", headers=cli)
        assert r.status_code == 200, r.text
        pts = r.json()
        assert len(pts) == 2
        assert all(p["valid"] for p in pts)

        # Con la bandera explícita: aparecen los 3 (para diagnóstico)
        r = client.get("/api/vehicles/1111111111/positions?include_invalid=true", headers=cli)
        assert r.status_code == 200
        assert len(r.json()) == 3

        # track/today llama a get_positions como función (no vía HTTP): también
        # debe excluir inválidos (regresión del default Query sin resolver).
        r = client.get("/api/vehicles/1111111111/track/today", headers=cli)
        assert r.status_code == 200
        pts = r.json()
        assert all(p["valid"] for p in pts)
        assert len(pts) == 2
    finally:
        _clear_positions()
