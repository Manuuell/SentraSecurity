"""
Fase 4 — la ingesta debe notificar a los dueños del vehículo cuando entra
una alarma nueva (server/push.py), y no llamar al envío si nadie es dueño.
"""

import asyncio

from sqlalchemy import select

from server.database import AsyncSessionLocal
from server.models import Alarm
from server.parser import parse_packet
from server.tcp_server import _handle_packet


def _raw_alarm_packet(device_id: str) -> str:
    # vstatus FFFFFEF9 -> EMERGENCY + OVERSPEED activos (ver test_parser.py)
    return (
        f"*HQ,{device_id},V8,143005,A,1023.4600,N,07528.7640,W,"
        f"012.3,045,030726,FFFFFEF9,732,101,1234,5678,09,24,410,82#"
    )


def test_alarma_dispara_push_al_dueno(client, monkeypatch):
    calls = []

    async def fake_send(db, user_ids, title, body, data=None):
        calls.append((list(user_ids), title, body, data))

    monkeypatch.setattr("server.tcp_server.send_push_to_users", fake_send)

    packet = parse_packet(_raw_alarm_packet("1111111111"))
    assert packet is not None
    asyncio.run(_handle_packet(packet))

    async def _load_alarms():
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Alarm).where(Alarm.vehicle_id == "1111111111"))
            return result.scalars().all()

    alarms = asyncio.run(_load_alarms())
    assert any(a.alarm_type == "EMERGENCY" for a in alarms)

    assert calls, "no se notificó a ningún dueño"
    for user_ids, title, body, data in calls:
        # user 2 es el dueño fijado en conftest; otros tests de la suite
        # (test_admin.py) pueden asignar usuarios adicionales a esta misma
        # moto compartida — no debe romper la aserción, solo confirmar que
        # el dueño original sigue recibiendo el push.
        assert 2 in user_ids
        assert data["vehicle_id"] == "1111111111"


def test_sin_dueno_no_llama_push(client, monkeypatch):
    calls = []
    monkeypatch.setattr(
        "server.tcp_server.send_push_to_users",
        lambda *a, **k: calls.append(1),
    )

    # "Moto ajena" existe en conftest pero no tiene usuario asignado.
    packet = parse_packet(_raw_alarm_packet("2222222222"))
    assert packet is not None
    asyncio.run(_handle_packet(packet))

    assert calls == []
