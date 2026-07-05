"""
Entry point: starts the FastAPI app and the TCP server concurrently.
Run with:  uvicorn server.main:app --reload --port 8000
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import update

# Antes de importar módulos propios: varios leen variables de entorno al
# cargarse (DATABASE_URL, GOOGLE_APPLICATION_CREDENTIALS...). En Docker las
# variables ya vienen inyectadas y esto no hace nada (no pisa las existentes).
load_dotenv()

from server.database import engine, init_db, AsyncSessionLocal  # noqa: E402
from server.models import COMMAND_ACTIVE_STATUSES, CMD_EXPIRED, DeviceCommand, Vehicle  # noqa: E402
from server.tcp_server import start_tcp_server  # noqa: E402
from server.api.routes import router  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Minutos sin reportar para marcar el vehículo fuera de línea (fix B4)
OFFLINE_AFTER = timedelta(minutes=5)
OFFLINE_CHECK_EVERY_S = 60

# TTL de comandos sin confirmar (§5.2 del plan): en modo manual, un comando
# olvidado no debe quedar bloqueando el botón de corte indefinidamente.
COMMAND_TTL = timedelta(minutes=10)
COMMAND_CHECK_EVERY_S = 60


def _naive_if_sqlite(dt: datetime) -> datetime:
    return dt.replace(tzinfo=None) if engine.dialect.name == "sqlite" else dt


async def _mark_offline_loop() -> None:
    """Job periódico: desmarca is_online cuando el tracker deja de reportar."""
    while True:
        await asyncio.sleep(OFFLINE_CHECK_EVERY_S)
        try:
            cutoff = _naive_if_sqlite(datetime.now(timezone.utc) - OFFLINE_AFTER)
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    update(Vehicle)
                    .where(Vehicle.is_online == True, Vehicle.last_seen < cutoff)  # noqa: E712
                    .values(is_online=False)
                )
                await session.commit()
                if result.rowcount:
                    logger.info("Marcados %d vehículos fuera de línea", result.rowcount)
        except Exception:
            logger.exception("mark_offline_loop failed")


async def _expire_commands_loop() -> None:
    """Job periódico: expira comandos pending/sent que nadie confirmó a tiempo."""
    while True:
        await asyncio.sleep(COMMAND_CHECK_EVERY_S)
        try:
            cutoff = _naive_if_sqlite(datetime.now(timezone.utc) - COMMAND_TTL)
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    update(DeviceCommand)
                    .where(
                        DeviceCommand.status.in_(COMMAND_ACTIVE_STATUSES),
                        DeviceCommand.created_at < cutoff,
                    )
                    .values(status=CMD_EXPIRED)
                )
                await session.commit()
                if result.rowcount:
                    logger.info("Expirados %d comandos sin confirmar", result.rowcount)
        except Exception:
            logger.exception("expire_commands_loop failed")


_tcp_server = None
_offline_task: Optional[asyncio.Task] = None
_expire_commands_task: Optional[asyncio.Task] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _tcp_server, _offline_task, _expire_commands_task
    # En producción (Postgres) el esquema lo gestiona Alembic desde el entrypoint.
    # En dev con SQLite, create_all como conveniencia para no exigir migraciones.
    if engine.dialect.name == "sqlite":
        await init_db()
    _tcp_server = await start_tcp_server()
    _offline_task = asyncio.create_task(_mark_offline_loop())
    _expire_commands_task = asyncio.create_task(_expire_commands_loop())
    yield
    _offline_task.cancel()
    _expire_commands_task.cancel()
    _tcp_server.close()
    await _tcp_server.wait_closed()


app = FastAPI(
    title="SentraSecurity GPS",
    version="0.2.0",
    lifespan=lifespan,
)

# En dev queda abierto; en producción exportar CORS_ORIGINS=https://app.dominio.com
_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")
