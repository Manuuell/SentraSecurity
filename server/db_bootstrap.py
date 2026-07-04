"""
Prepara la BD antes de arrancar la API (lo corre el entrypoint del contenedor).

Decide qué hacer según el estado de la BD, de forma idempotente y segura:
  - BD nueva (sin tablas)            -> alembic upgrade head   (crea el esquema)
  - BD ya con tablas pero sin Alembic-> alembic stamp head      (adopta el esquema
                                        existente sin recrearlo — caso de la BD de
                                        producción creada con create_all)
  - BD ya gestionada por Alembic     -> alembic upgrade head    (aplica migraciones nuevas)
"""

from __future__ import annotations

import asyncio
import logging
import os

from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import command
from alembic.config import Config

logging.basicConfig(level=logging.INFO, format="%(levelname)s [bootstrap] %(message)s")
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://sentra:sentra@localhost:5432/sentra_gps",
)


async def _inspect_state() -> tuple[bool, bool]:
    engine = create_async_engine(DATABASE_URL)
    try:
        async with engine.connect() as conn:
            def check(sync_conn) -> tuple[bool, bool]:
                tables = set(inspect(sync_conn).get_table_names())
                return ("alembic_version" in tables, "users" in tables)
            return await conn.run_sync(check)
    finally:
        await engine.dispose()


def main() -> None:
    has_version, has_users = asyncio.run(_inspect_state())
    cfg = Config("alembic.ini")

    if not has_version and has_users:
        logger.info("Esquema preexistente sin Alembic: aplicando 'stamp head'.")
        command.stamp(cfg, "head")
    else:
        logger.info("Aplicando 'upgrade head'.")
        command.upgrade(cfg, "head")
    logger.info("BD lista.")


if __name__ == "__main__":
    main()
