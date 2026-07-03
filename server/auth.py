"""
Autenticación y autorización (ADR-4 del plan):
JWT de acceso (15 min) + refresh token rotatorio (30 días, revocable),
contraseñas con argon2id y RBAC de 3 roles (admin / operator / client).
"""

from __future__ import annotations

import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import Argon2Error, VerifyMismatchError
from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from server.database import get_db
from server.models import ROLE_ADMIN, ROLE_OPERATOR, User, user_vehicles

logger = logging.getLogger(__name__)

SECRET_KEY = os.getenv("SECRET_KEY", "")
if not SECRET_KEY:
    SECRET_KEY = "dev-secret-NO-usar-en-produccion"
    logger.warning(
        "SECRET_KEY no definido en el entorno: usando clave de DESARROLLO insegura. "
        "En producción exportar SECRET_KEY con un valor aleatorio largo."
    )

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_TTL = timedelta(minutes=15)
REFRESH_TOKEN_TTL = timedelta(days=30)

_hasher = PasswordHasher()  # argon2id por defecto


# ---------------------------------------------------------------------------
# Contraseñas
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, Argon2Error):
        return False


# ---------------------------------------------------------------------------
# Tokens
# ---------------------------------------------------------------------------

def as_utc(dt: datetime) -> datetime:
    """SQLite devuelve datetimes naive; se interpretan siempre como UTC."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def create_access_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "iat": now,
        "exp": now + ACCESS_TOKEN_TTL,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    # En BD solo se guarda el hash: un dump de la tabla no sirve para robar sesiones
    return hashlib.sha256(token.encode()).hexdigest()


# ---------------------------------------------------------------------------
# Dependencias FastAPI
# ---------------------------------------------------------------------------

async def get_current_user(
    request: Request, db: AsyncSession = Depends(get_db)
) -> User:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    payload = decode_access_token(header[7:])
    if payload is None:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    user = await db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuario inactivo")
    return user


def require_role(*roles: str):
    async def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Permisos insuficientes")
        return user

    return dependency


async def allowed_vehicle_ids(db: AsyncSession, user: User) -> Optional[set[str]]:
    """Vehículos visibles para el usuario. None = todos (roles de empresa)."""
    if user.role in (ROLE_ADMIN, ROLE_OPERATOR):
        return None
    result = await db.execute(
        select(user_vehicles.c.vehicle_id).where(user_vehicles.c.user_id == user.id)
    )
    return {row[0] for row in result}


# ---------------------------------------------------------------------------
# Rate limit simple para login (por proceso; suficiente para el MVP)
# ---------------------------------------------------------------------------

_LOGIN_WINDOW = timedelta(minutes=1)
_LOGIN_MAX_ATTEMPTS = int(os.getenv("LOGIN_RATE_MAX", "10"))
_login_attempts: dict[str, tuple[int, datetime]] = {}


def check_login_rate_limit(ip: str) -> None:
    now = datetime.now(timezone.utc)
    count, window_start = _login_attempts.get(ip, (0, now))
    if now - window_start > _LOGIN_WINDOW:
        count, window_start = 0, now
    if count >= _LOGIN_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail="Demasiados intentos. Espera un minuto e inténtalo de nuevo.",
        )
    _login_attempts[ip] = (count + 1, window_start)
