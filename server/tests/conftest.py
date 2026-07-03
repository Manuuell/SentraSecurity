"""
Fixtures de tests: BD SQLite temporal + usuarios de los tres roles.
DATABASE_URL se fija ANTES de importar módulos del server.
"""

import os
import tempfile

_DB_PATH = os.path.join(tempfile.gettempdir(), "sentra_test.db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_DB_PATH}"
os.environ["LOGIN_RATE_MAX"] = "1000"  # la suite hace muchos logins desde la misma IP

import asyncio  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server.auth import hash_password  # noqa: E402
from server.database import engine, AsyncSessionLocal  # noqa: E402
from server.models import Base, User, Vehicle, user_vehicles  # noqa: E402
from server.main import app  # noqa: E402


async def _setup_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        session.add_all([
            User(id=1, email="admin@test.local", full_name="Admin",
                 role="admin", password_hash=hash_password("admin12345")),
            User(id=2, email="cliente@test.local", full_name="Cliente",
                 role="client", password_hash=hash_password("cliente12345")),
            Vehicle(id="1111111111", name="Moto asignada", plate="AAA11A"),
            Vehicle(id="2222222222", name="Moto ajena", plate="BBB22B"),
        ])
        await session.flush()
        await session.execute(
            user_vehicles.insert().values(user_id=2, vehicle_id="1111111111")
        )
        await session.commit()


@pytest.fixture(scope="session")
def client():
    asyncio.run(_setup_db())
    # Sin context manager: no corre el lifespan (ni TCP server ni jobs)
    yield TestClient(app)
    if os.path.exists(_DB_PATH):
        os.remove(_DB_PATH)


def login(client: TestClient, email: str, password: str) -> dict:
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def bearer(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access_token']}"}
