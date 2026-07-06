"""
SQLAlchemy models for the GPS tracking platform.
"""

from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Float, Integer, Boolean,
    DateTime, ForeignKey, Table, Text, Index, JSON,
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Usuarios y sesión (ADR-4: JWT + refresh rotatorio, RBAC de 3 roles)
# ---------------------------------------------------------------------------

ROLE_ADMIN = "admin"
ROLE_OPERATOR = "operator"
ROLE_CLIENT = "client"
ROLES = (ROLE_ADMIN, ROLE_OPERATOR, ROLE_CLIENT)

# B2C: asignación de motos a clientes
user_vehicles = Table(
    "user_vehicles",
    Base.metadata,
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("vehicle_id", ForeignKey("vehicles.id", ondelete="CASCADE"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    email         = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name     = Column(String(120), nullable=False, default="")
    phone         = Column(String(30), nullable=True)
    role          = Column(String(20), nullable=False, default=ROLE_CLIENT)
    is_active     = Column(Boolean, nullable=False, default=True)
    created_at    = Column(DateTime(timezone=True), default=utcnow)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    user_agent = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


# ---------------------------------------------------------------------------
# Vehículos y telemetría
# ---------------------------------------------------------------------------

class Vehicle(Base):
    __tablename__ = "vehicles"

    id         = Column(String(10), primary_key=True)   # Serial de 10 dígitos del ST-907L (no es el IMEI)
    name       = Column(String(100), nullable=False, default="")
    plate      = Column(String(20), nullable=True)
    iccid      = Column(String(20), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Canal de comandos SMS (Fase 3, modo manual — ver docs/corte-motor.md).
    # command_password_enc se guarda cifrada (server/crypto.py); nunca en claro.
    sim_phone            = Column(String(20), nullable=True)
    command_password_enc = Column(String(255), nullable=True)

    # Last known position cache (denormalized for fast reads)
    last_lat       = Column(Float, nullable=True)
    last_lon       = Column(Float, nullable=True)
    last_speed     = Column(Float, nullable=True)
    last_direction = Column(Integer, nullable=True)
    last_seen      = Column(DateTime(timezone=True), nullable=True)
    last_valid     = Column(Boolean, nullable=True)
    battery_pct    = Column(Integer, nullable=True)
    voltage        = Column(Float, nullable=True)
    gsm_signal     = Column(Integer, nullable=True)
    satellites     = Column(Integer, nullable=True)
    acc_off        = Column(Boolean, default=True)
    is_online      = Column(Boolean, default=False)

    positions = relationship("Position", back_populates="vehicle",
                             cascade="all, delete-orphan")
    alarms    = relationship("Alarm", back_populates="vehicle",
                             cascade="all, delete-orphan")


class Position(Base):
    __tablename__ = "positions"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    vehicle_id  = Column(String(10), ForeignKey("vehicles.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    timestamp   = Column(DateTime(timezone=True), nullable=False)
    latitude    = Column(Float, nullable=False)
    longitude   = Column(Float, nullable=False)
    speed_kmh   = Column(Float, nullable=False, default=0)
    direction   = Column(Integer, nullable=False, default=0)
    valid       = Column(Boolean, nullable=False, default=True)
    altitude    = Column(Float, nullable=True)
    satellites  = Column(Integer, nullable=True)
    gsm_signal  = Column(Integer, nullable=True)
    voltage     = Column(Float, nullable=True)
    battery_pct = Column(Integer, nullable=True)
    acc_off     = Column(Boolean, default=True)

    vehicle = relationship("Vehicle", back_populates="positions")

    __table_args__ = (
        Index("ix_positions_vehicle_timestamp", "vehicle_id", "timestamp"),
    )


# ---------------------------------------------------------------------------
# Comandos al dispositivo (Fase 3 — corte de motor)
# ---------------------------------------------------------------------------

COMMAND_ENGINE_STOP = "ENGINE_STOP"
COMMAND_ENGINE_RESUME = "ENGINE_RESUME"
COMMAND_TYPES = (COMMAND_ENGINE_STOP, COMMAND_ENGINE_RESUME)

# pending -> sent -> confirmed (o failed/expired). Nunca "éxito optimista":
# el estado real lo fija un humano hasta que exista el gateway automatizado.
CMD_PENDING = "pending"
CMD_SENT = "sent"
CMD_CONFIRMED = "confirmed"
CMD_FAILED = "failed"
CMD_EXPIRED = "expired"
COMMAND_STATUSES = (CMD_PENDING, CMD_SENT, CMD_CONFIRMED, CMD_FAILED, CMD_EXPIRED)
COMMAND_ACTIVE_STATUSES = (CMD_PENDING, CMD_SENT)


class DeviceCommand(Base):
    __tablename__ = "device_commands"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    vehicle_id   = Column(String(10), ForeignKey("vehicles.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    type         = Column(String(20), nullable=False)
    status       = Column(String(20), nullable=False, default=CMD_PENDING)
    requested_by = Column(ForeignKey("users.id"), nullable=False)
    created_at   = Column(DateTime(timezone=True), default=utcnow)
    sent_at      = Column(DateTime(timezone=True), nullable=True)
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
    error        = Column(Text, nullable=True)


# ---------------------------------------------------------------------------
# Notificaciones push (Fase 4 — FCM)
# ---------------------------------------------------------------------------

class PushToken(Base):
    __tablename__ = "push_tokens"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    fcm_token  = Column(String(255), unique=True, nullable=False)
    platform   = Column(String(20), nullable=False, default="android")
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Alarm(Base):
    __tablename__ = "alarms"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    vehicle_id  = Column(String(10), ForeignKey("vehicles.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    alarm_type  = Column(String(30), nullable=False)   # EMERGENCY, OVERSPEED, etc.
    timestamp   = Column(DateTime(timezone=True), nullable=False)
    latitude    = Column(Float, nullable=True)
    longitude   = Column(Float, nullable=True)
    speed_kmh   = Column(Float, nullable=True)
    acknowledged = Column(Boolean, default=False)
    notes       = Column(Text, nullable=True)

    vehicle = relationship("Vehicle", back_populates="alarms")


# ---------------------------------------------------------------------------
# Geocercas (Fase 5) — círculos y polígonos; eventos entrar/salir por moto
# ---------------------------------------------------------------------------

GEOFENCE_CIRCLE = "circle"
GEOFENCE_POLYGON = "polygon"
GEOFENCE_KINDS = (GEOFENCE_CIRCLE, GEOFENCE_POLYGON)

# Tipos de evento de geocerca (se guardan como Alarm.alarm_type, reusando el
# mismo flujo de notificaciones/push del rastreador).
EVENT_GEOFENCE_ENTER = "GEOFENCE_ENTER"
EVENT_GEOFENCE_EXIT = "GEOFENCE_EXIT"


class Geofence(Base):
    __tablename__ = "geofences"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    name       = Column(String(120), nullable=False, default="")
    color      = Column(String(20), nullable=False, default="#2563eb")
    kind       = Column(String(20), nullable=False)   # circle | polygon
    # circle:  {"center": [lat, lon], "radius_m": <float>}
    # polygon: {"points": [[lat, lon], ...]}   (portable JSON: JSONB en PG, TEXT/JSON en SQLite)
    geometry   = Column(JSON, nullable=False)
    is_active  = Column(Boolean, nullable=False, default=True)
    created_by = Column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class GeofenceVehicle(Base):
    __tablename__ = "geofence_vehicles"

    geofence_id  = Column(ForeignKey("geofences.id", ondelete="CASCADE"), primary_key=True)
    vehicle_id   = Column(ForeignKey("vehicles.id", ondelete="CASCADE"), primary_key=True)
    notify_enter = Column(Boolean, nullable=False, default=True)
    notify_exit  = Column(Boolean, nullable=False, default=True)
    # Estado dentro/fuera para detectar transiciones en la ingesta.
    # None = aún sin evaluar (se siembra sin emitir evento).
    last_inside  = Column(Boolean, nullable=True)
