"""
Administración de usuarios y clientes (solo rol admin).
Cierra el ciclo de onboarding B2C: crear cliente → asignar motos →
el cliente entra y ve únicamente las suyas.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from server.auth import get_current_user, hash_password, require_role
from server.database import get_db
from server.models import (
    ROLE_ADMIN,
    ROLES,
    User,
    Vehicle,
    user_vehicles,
)

router = APIRouter(prefix="/admin")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CreateUserBody(BaseModel):
    email: str
    password: str = Field(min_length=8)
    full_name: str = ""
    phone: Optional[str] = None
    role: str = "client"

    @field_validator("email")
    @classmethod
    def _email_basico(cls, v: str) -> str:
        v = v.strip()
        local, _, domain = v.partition("@")
        if not local or "." not in domain:
            raise ValueError("Correo inválido")
        return v


class UpdateUserBody(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class ResetPasswordBody(BaseModel):
    new_password: str = Field(min_length=8)


class AssignVehiclesBody(BaseModel):
    vehicle_ids: list[str]


def _admin_user_dict(u: User, vehicle_count: int) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "full_name": u.full_name,
        "phone": u.phone,
        "role": u.role,
        "is_active": u.is_active,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "vehicle_count": vehicle_count,
    }


# ---------------------------------------------------------------------------
# Usuarios
# ---------------------------------------------------------------------------

@router.get("/users")
async def list_users(
    _: User = Depends(require_role(ROLE_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    users = (await db.execute(select(User).order_by(User.full_name, User.email))).scalars().all()
    counts = dict(
        (
            await db.execute(
                select(user_vehicles.c.user_id, func.count())
                .group_by(user_vehicles.c.user_id)
            )
        ).all()
    )
    return [_admin_user_dict(u, counts.get(u.id, 0)) for u in users]


@router.post("/users", status_code=201)
async def create_user(
    body: CreateUserBody,
    _: User = Depends(require_role(ROLE_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    if body.role not in ROLES:
        raise HTTPException(status_code=400, detail="Rol inválido")
    email = body.email.strip().lower()
    exists = (
        await db.execute(select(User.id).where(func.lower(User.email) == email))
    ).scalar_one_or_none()
    if exists is not None:
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese correo")

    user = User(
        email=email,
        password_hash=hash_password(body.password),
        full_name=body.full_name.strip(),
        phone=(body.phone or "").strip() or None,
        role=body.role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return _admin_user_dict(user, 0)


@router.patch("/users/{user_id}")
async def update_user(
    user_id: int,
    body: UpdateUserBody,
    admin: User = Depends(require_role(ROLE_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if body.role is not None:
        if body.role not in ROLES:
            raise HTTPException(status_code=400, detail="Rol inválido")
        user.role = body.role
    if body.full_name is not None:
        user.full_name = body.full_name.strip()
    if body.phone is not None:
        user.phone = body.phone.strip() or None
    if body.is_active is not None:
        # No permitir que un admin se desactive a sí mismo (se quedaría fuera)
        if user.id == admin.id and body.is_active is False:
            raise HTTPException(status_code=400, detail="No puedes desactivar tu propia cuenta")
        user.is_active = body.is_active

    await db.commit()
    count = await _vehicle_count(db, user.id)
    return _admin_user_dict(user, count)


@router.post("/users/{user_id}/reset-password")
async def reset_password(
    user_id: int,
    body: ResetPasswordBody,
    _: User = Depends(require_role(ROLE_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Asignación de motos a clientes (B2C)
# ---------------------------------------------------------------------------

@router.get("/users/{user_id}/vehicles")
async def get_user_vehicles(
    user_id: int,
    _: User = Depends(require_role(ROLE_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    ids = (
        await db.execute(
            select(user_vehicles.c.vehicle_id).where(user_vehicles.c.user_id == user_id)
        )
    ).scalars().all()
    return {"vehicle_ids": list(ids)}


@router.put("/users/{user_id}/vehicles")
async def set_user_vehicles(
    user_id: int,
    body: AssignVehiclesBody,
    _: User = Depends(require_role(ROLE_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    wanted = list(dict.fromkeys(body.vehicle_ids))  # dedup, conserva orden
    if wanted:
        found = set(
            (
                await db.execute(select(Vehicle.id).where(Vehicle.id.in_(wanted)))
            ).scalars().all()
        )
        missing = [v for v in wanted if v not in found]
        if missing:
            raise HTTPException(status_code=400, detail=f"Vehículos inexistentes: {missing}")

    # Reemplazo completo del conjunto asignado
    await db.execute(delete(user_vehicles).where(user_vehicles.c.user_id == user_id))
    if wanted:
        await db.execute(
            user_vehicles.insert(),
            [{"user_id": user_id, "vehicle_id": v} for v in wanted],
        )
    await db.commit()
    return {"vehicle_ids": wanted}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _vehicle_count(db: AsyncSession, user_id: int) -> int:
    return (
        await db.execute(
            select(func.count()).select_from(user_vehicles).where(
                user_vehicles.c.user_id == user_id
            )
        )
    ).scalar() or 0
