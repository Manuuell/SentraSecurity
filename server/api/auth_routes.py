"""
Endpoints de autenticación: login, refresh rotatorio, logout, perfil.

El refresh token viaja en el body (app móvil) y también en una cookie
httpOnly (web). El refresh es rotatorio: cada uso revoca el token anterior
y emite uno nuevo; un token revocado o expirado siempre responde 401.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from server.auth import (
    REFRESH_TOKEN_TTL,
    as_utc,
    check_login_rate_limit,
    create_access_token,
    get_current_user,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    verify_password,
)
from server.database import get_db
from server.models import RefreshToken, User

router = APIRouter(prefix="/auth")

REFRESH_COOKIE = "sentra_refresh"


class LoginBody(BaseModel):
    email: str
    password: str


class RefreshBody(BaseModel):
    refresh_token: Optional[str] = None


class PasswordBody(BaseModel):
    current_password: str
    new_password: str


def user_dict(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "full_name": u.full_name,
        "phone": u.phone,
        "role": u.role,
    }


async def _issue_tokens(db: AsyncSession, user: User, request: Request) -> dict:
    refresh = new_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh),
            expires_at=datetime.now(timezone.utc) + REFRESH_TOKEN_TTL,
            user_agent=(request.headers.get("user-agent") or "")[:255],
        )
    )
    await db.commit()
    return {
        "access_token": create_access_token(user),
        "refresh_token": refresh,
        "user": user_dict(user),
    }


def _set_refresh_cookie(response: Response, refresh: str) -> None:
    # secure=False en dev (HTTP local); en producción Caddy termina TLS y la
    # Fase 7 activa COOKIE_SECURE. SameSite=lax + path acotado al refresh.
    response.set_cookie(
        REFRESH_COOKIE,
        refresh,
        max_age=int(REFRESH_TOKEN_TTL.total_seconds()),
        httponly=True,
        samesite="lax",
        path="/api/auth",
    )


@router.post("/login")
async def login(
    body: LoginBody,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    check_login_rate_limit(request.client.host if request.client else "?")

    result = await db.execute(
        select(User).where(func.lower(User.email) == body.email.strip().lower())
    )
    user = result.scalar_one_or_none()
    # Mismo error para "no existe" y "contraseña mala": no filtrar cuál falló
    if user is None or not user.is_active or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos")

    tokens = await _issue_tokens(db, user, request)
    _set_refresh_cookie(response, tokens["refresh_token"])
    return tokens


async def _find_valid_refresh(
    db: AsyncSession, raw_token: str
) -> tuple[RefreshToken, User]:
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_token))
    )
    stored = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if stored is None or stored.revoked_at is not None or as_utc(stored.expires_at) < now:
        raise HTTPException(status_code=401, detail="Sesión expirada")
    user = await db.get(User, stored.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuario inactivo")
    return stored, user


@router.post("/refresh")
async def refresh(
    request: Request,
    response: Response,
    body: Optional[RefreshBody] = None,
    db: AsyncSession = Depends(get_db),
):
    raw = (body.refresh_token if body else None) or request.cookies.get(REFRESH_COOKIE)
    if not raw:
        raise HTTPException(status_code=401, detail="Sin sesión")

    stored, user = await _find_valid_refresh(db, raw)
    # Rotación: el token usado queda revocado y se emite uno nuevo
    stored.revoked_at = datetime.now(timezone.utc)
    tokens = await _issue_tokens(db, user, request)
    _set_refresh_cookie(response, tokens["refresh_token"])
    return tokens


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    body: Optional[RefreshBody] = None,
    db: AsyncSession = Depends(get_db),
):
    raw = (body.refresh_token if body else None) or request.cookies.get(REFRESH_COOKIE)
    if raw:
        result = await db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw))
        )
        stored = result.scalar_one_or_none()
        if stored is not None and stored.revoked_at is None:
            stored.revoked_at = datetime.now(timezone.utc)
            await db.commit()
    response.delete_cookie(REFRESH_COOKIE, path="/api/auth")
    return {"ok": True}


@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return user_dict(user)


@router.patch("/me/password")
async def change_password(
    body: PasswordBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="La contraseña actual no coincide")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="La nueva contraseña debe tener al menos 8 caracteres")
    user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"ok": True}
