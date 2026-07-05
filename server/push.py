"""
Envío de notificaciones push por FCM (Fase 4 — ver PLAN_DE_TRABAJO.md §7).

Usa firebase-admin con una cuenta de servicio cuya ruta va en la variable de
entorno GOOGLE_APPLICATION_CREDENTIALS. Si no está configurada (dev sin
Firebase todavía), el envío se omite sin romper la ingestión ni la API.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Iterable, Optional

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from server.models import PushToken

logger = logging.getLogger(__name__)

_enabled = bool(os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))
_app = None


def _firebase_app():
    global _app
    if not _enabled:
        return None
    if _app is None:
        import firebase_admin
        _app = firebase_admin.initialize_app()
    return _app


async def send_push_to_users(
    db: AsyncSession,
    user_ids: Iterable[int],
    title: str,
    body: str,
    data: Optional[dict] = None,
) -> None:
    """Envía un push a todos los tokens registrados de esos usuarios.

    Nunca lanza: un fallo de FCM no debe tumbar la ingestión GPS ni la API.
    """
    if _firebase_app() is None:
        return
    user_ids = list(user_ids)
    if not user_ids:
        return

    result = await db.execute(select(PushToken).where(PushToken.user_id.in_(user_ids)))
    tokens = result.scalars().all()
    if not tokens:
        return

    try:
        invalid = await asyncio.to_thread(
            _send_sync, [t.fcm_token for t in tokens], title, body, data or {}
        )
    except Exception:
        logger.exception("Fallo enviando push a %d token(s)", len(tokens))
        return

    if invalid:
        await db.execute(delete(PushToken).where(PushToken.fcm_token.in_(invalid)))
        await db.commit()


def _send_sync(tokens: list[str], title: str, body: str, data: dict) -> list[str]:
    """Llamada bloqueante a FCM — se ejecuta en un hilo aparte (to_thread)."""
    from firebase_admin import messaging

    message = messaging.MulticastMessage(
        notification=messaging.Notification(title=title, body=body),
        data={k: str(v) for k, v in data.items()},
        tokens=tokens,
    )
    response = messaging.send_each_for_multicast(message)

    # Tokens de instalaciones desinstaladas/inválidas: se limpian para no
    # reintentarlos en cada evento futuro.
    invalid_codes = {"NOT_FOUND", "UNREGISTERED", "INVALID_ARGUMENT"}
    return [
        tokens[i]
        for i, r in enumerate(response.responses)
        if not r.success and getattr(getattr(r, "exception", None), "code", None) in invalid_codes
    ]
