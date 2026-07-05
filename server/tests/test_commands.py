"""
Tests de la cola de comandos (Fase 3 — corte de motor, modo manual).
"""

from server.crypto import decrypt_secret, encrypt_secret
from server.tests.conftest import bearer, login


def _admin(client):
    return bearer(login(client, "admin@test.local", "admin12345"))


def _cliente(client):
    return bearer(login(client, "cliente@test.local", "cliente12345"))


def _configure_channel(client):
    """La moto 1111111111 (asignada al cliente) queda con teléfono/contraseña."""
    r = client.patch(
        "/api/vehicles/1111111111",
        json={"sim_phone": "+573001112233", "command_password": "0000"},
        headers=_admin(client),
    )
    assert r.status_code == 200
    assert r.json()["has_command_password"] is True
    assert r.json()["sim_phone"] == "+573001112233"


def _finish(client, cmd_id: int):
    """Cierra un comando (terminal) para no bloquear la moto en tests siguientes."""
    client.patch(f"/api/commands/{cmd_id}/status", json={"status": "confirmed"}, headers=_admin(client))


def test_encrypt_decrypt_roundtrip():
    token = encrypt_secret("0000")
    assert token != "0000"
    assert decrypt_secret(token) == "0000"


def test_password_nunca_se_expone_en_get_vehicle(client):
    _configure_channel(client)
    r = client.get("/api/vehicles/1111111111", headers=_cliente(client))
    assert r.status_code == 200
    assert "command_password_enc" not in r.json()
    assert "command_password" not in r.json()


def test_cliente_solicita_corte_sin_ver_sms(client):
    _configure_channel(client)
    r = client.post(
        "/api/vehicles/1111111111/commands",
        json={"type": "ENGINE_STOP"},
        headers=_cliente(client),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "pending"
    assert "sms_text" not in body  # el cliente nunca ve la contraseña del equipo
    _finish(client, body["id"])


def test_admin_ve_sms_text_con_password_configurada(client):
    _configure_channel(client)
    r = client.post(
        "/api/vehicles/1111111111/commands",
        json={"type": "ENGINE_STOP"},
        headers=_admin(client),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["sms_text"] == "9400000"
    assert body["sms_phone"] == "+573001112233"

    # Sobrevive a un refresh: el listado también lo expone mientras esté activo
    listed = client.get("/api/vehicles/1111111111/commands", headers=_admin(client)).json()
    assert listed[0]["sms_text"] == "9400000"

    _finish(client, body["id"])

    # Una vez cerrado (confirmed), el listado ya no revela la contraseña
    listed_after = client.get("/api/vehicles/1111111111/commands", headers=_admin(client)).json()
    assert "sms_text" not in listed_after[0]


def test_sin_password_configurada_no_hay_sms_text(client):
    r = client.post(
        "/api/vehicles/2222222222/commands",
        json={"type": "ENGINE_STOP"},
        headers=_admin(client),
    )
    assert r.status_code == 201
    body = r.json()
    assert "sms_text" not in body
    _finish(client, body["id"])


def test_tipo_invalido_rechazado(client):
    r = client.post(
        "/api/vehicles/1111111111/commands",
        json={"type": "REBOOT_NUCLEAR"},
        headers=_admin(client),
    )
    assert r.status_code == 400


def test_no_permite_dos_comandos_en_vuelo(client):
    _configure_channel(client)
    r1 = client.post(
        "/api/vehicles/1111111111/commands",
        json={"type": "ENGINE_STOP"},
        headers=_admin(client),
    )
    assert r1.status_code == 201
    r2 = client.post(
        "/api/vehicles/1111111111/commands",
        json={"type": "ENGINE_RESUME"},
        headers=_admin(client),
    )
    assert r2.status_code == 409
    _finish(client, r1.json()["id"])


def test_ciclo_estado_completo(client):
    _configure_channel(client)
    created = client.post(
        "/api/vehicles/1111111111/commands",
        json={"type": "ENGINE_RESUME"},
        headers=_admin(client),
    ).json()
    cmd_id = created["id"]
    assert created["status"] == "pending"

    r_sent = client.patch(f"/api/commands/{cmd_id}/status", json={"status": "sent"}, headers=_admin(client))
    assert r_sent.status_code == 200
    assert r_sent.json()["status"] == "sent"
    assert r_sent.json()["sent_at"] is not None

    r_confirmed = client.patch(
        f"/api/commands/{cmd_id}/status", json={"status": "confirmed"}, headers=_admin(client)
    )
    assert r_confirmed.status_code == 200
    assert r_confirmed.json()["status"] == "confirmed"
    assert r_confirmed.json()["confirmed_at"] is not None

    # El vehículo vuelve a estar libre para un nuevo comando
    r_new = client.post(
        "/api/vehicles/1111111111/commands",
        json={"type": "ENGINE_STOP"},
        headers=_admin(client),
    )
    assert r_new.status_code == 201
    _finish(client, r_new.json()["id"])


def test_cliente_no_puede_cambiar_estado(client):
    _configure_channel(client)
    created = client.post(
        "/api/vehicles/1111111111/commands",
        json={"type": "ENGINE_STOP"},
        headers=_admin(client),
    ).json()
    r = client.patch(
        f"/api/commands/{created['id']}/status", json={"status": "sent"}, headers=_cliente(client)
    )
    assert r.status_code == 403
    _finish(client, created["id"])


def test_cliente_no_ve_comandos_de_moto_ajena(client):
    r = client.get("/api/vehicles/2222222222/commands", headers=_cliente(client))
    assert r.status_code == 404


def test_falla_registra_error(client):
    _configure_channel(client)
    created = client.post(
        "/api/vehicles/1111111111/commands",
        json={"type": "ENGINE_STOP"},
        headers=_admin(client),
    ).json()
    r = client.patch(
        f"/api/commands/{created['id']}/status",
        json={"status": "failed", "error": "Sin respuesta del equipo"},
        headers=_admin(client),
    )
    assert r.status_code == 200
    assert r.json()["status"] == "failed"
    assert r.json()["error"] == "Sin respuesta del equipo"
