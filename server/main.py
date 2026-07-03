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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import update

from server.database import engine, init_db, AsyncSessionLocal
from server.models import Vehicle
from server.tcp_server import start_tcp_server
from server.api.routes import router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Minutos sin reportar para marcar el vehículo fuera de línea (fix B4)
OFFLINE_AFTER = timedelta(minutes=5)
OFFLINE_CHECK_EVERY_S = 60


async def _mark_offline_loop() -> None:
    """Job periódico: desmarca is_online cuando el tracker deja de reportar."""
    while True:
        await asyncio.sleep(OFFLINE_CHECK_EVERY_S)
        try:
            cutoff = datetime.now(timezone.utc) - OFFLINE_AFTER
            if engine.dialect.name == "sqlite":
                # SQLite guarda datetimes naive-UTC; comparar aware corrompe el filtro
                cutoff = cutoff.replace(tzinfo=None)
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


_tcp_server = None
_offline_task: Optional[asyncio.Task] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _tcp_server, _offline_task
    await init_db()
    _tcp_server = await start_tcp_server()
    _offline_task = asyncio.create_task(_mark_offline_loop())
    yield
    _offline_task.cancel()
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
