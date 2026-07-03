"""
Crea o actualiza un usuario desde la terminal.

Uso:
  python -m server.create_admin correo@dominio.com contraseña [--role admin|operator|client] [--name "Nombre"]

Ejemplos:
  python -m server.create_admin admin@sentra.local S3guro123 --role admin --name "Admin Sentra"
  python -m server.create_admin cliente@gmail.com Cl4ve1234 --role client --name "Carlos Pérez"
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from sqlalchemy import func, select

from server.auth import hash_password
from server.database import AsyncSessionLocal, init_db
from server.models import ROLES, User


async def upsert_user(email: str, password: str, role: str, name: str) -> None:
    await init_db()
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(func.lower(User.email) == email.lower())
        )
        user = result.scalar_one_or_none()
        if user is None:
            user = User(email=email.lower(), full_name=name, role=role,
                        password_hash=hash_password(password))
            session.add(user)
            action = "creado"
        else:
            user.password_hash = hash_password(password)
            user.role = role
            if name:
                user.full_name = name
            user.is_active = True
            action = "actualizado"
        await session.commit()
        print(f"Usuario {action}: {user.email} (rol {user.role})")


def main() -> None:
    parser = argparse.ArgumentParser(description="Crear/actualizar usuario")
    parser.add_argument("email")
    parser.add_argument("password")
    parser.add_argument("--role", choices=ROLES, default="admin")
    parser.add_argument("--name", default="")
    args = parser.parse_args()

    if len(args.password) < 8:
        print("La contraseña debe tener al menos 8 caracteres", file=sys.stderr)
        sys.exit(1)

    asyncio.run(upsert_user(args.email, args.password, args.role, args.name))


if __name__ == "__main__":
    main()
