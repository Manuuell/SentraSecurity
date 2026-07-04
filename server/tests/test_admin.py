"""
Tests de administración de usuarios y clientes (solo rol admin).
"""

from server.tests.conftest import bearer, login


def _admin(client):
    return bearer(login(client, "admin@test.local", "admin12345"))


def _cliente(client):
    return bearer(login(client, "cliente@test.local", "cliente12345"))


def test_cliente_no_accede_a_admin(client):
    assert client.get("/api/admin/users", headers=_cliente(client)).status_code == 403


def test_admin_lista_usuarios(client):
    r = client.get("/api/admin/users", headers=_admin(client))
    assert r.status_code == 200
    emails = {u["email"] for u in r.json()}
    assert {"admin@test.local", "cliente@test.local"} <= emails


def test_crear_cliente_y_login(client):
    r = client.post(
        "/api/admin/users",
        json={"email": "nuevo@cliente.local", "password": "nuevo12345",
              "full_name": "Cliente Nuevo", "role": "client"},
        headers=_admin(client),
    )
    assert r.status_code == 201
    assert r.json()["role"] == "client"
    assert r.json()["vehicle_count"] == 0
    # El cliente recién creado puede autenticarse
    tokens = login(client, "nuevo@cliente.local", "nuevo12345")
    assert tokens["user"]["email"] == "nuevo@cliente.local"


def test_no_duplicar_correo(client):
    r = client.post(
        "/api/admin/users",
        json={"email": "admin@test.local", "password": "otraclave1", "role": "admin"},
        headers=_admin(client),
    )
    assert r.status_code == 409


def test_password_corta_rechazada(client):
    r = client.post(
        "/api/admin/users",
        json={"email": "x@y.local", "password": "corta", "role": "client"},
        headers=_admin(client),
    )
    assert r.status_code == 422  # validación de pydantic (min_length=8)


def test_asignar_motos_y_visibilidad(client):
    # Crear cliente sin motos
    uid = client.post(
        "/api/admin/users",
        json={"email": "asigna@cliente.local", "password": "asigna12345", "role": "client"},
        headers=_admin(client),
    ).json()["id"]

    # Sin motos asignadas: no ve ninguna
    tok = bearer(login(client, "asigna@cliente.local", "asigna12345"))
    assert client.get("/api/vehicles", headers=tok).json() == []

    # Asignar la moto 1111111111
    r = client.put(
        f"/api/admin/users/{uid}/vehicles",
        json={"vehicle_ids": ["1111111111"]},
        headers=_admin(client),
    )
    assert r.status_code == 200
    assert r.json()["vehicle_ids"] == ["1111111111"]

    # Ahora el cliente ve exactamente esa moto
    visibles = {v["id"] for v in client.get("/api/vehicles", headers=tok).json()}
    assert visibles == {"1111111111"}


def test_asignar_moto_inexistente_falla(client):
    uid = client.post(
        "/api/admin/users",
        json={"email": "malmoto@cliente.local", "password": "malmoto12345", "role": "client"},
        headers=_admin(client),
    ).json()["id"]
    r = client.put(
        f"/api/admin/users/{uid}/vehicles",
        json={"vehicle_ids": ["0000000000"]},
        headers=_admin(client),
    )
    assert r.status_code == 400


def test_desactivar_usuario_bloquea_login(client):
    uid = client.post(
        "/api/admin/users",
        json={"email": "baja@cliente.local", "password": "baja12345", "role": "client"},
        headers=_admin(client),
    ).json()["id"]
    # Desactivar
    r = client.patch(f"/api/admin/users/{uid}", json={"is_active": False}, headers=_admin(client))
    assert r.status_code == 200
    # No puede autenticarse
    assert client.post(
        "/api/auth/login",
        json={"email": "baja@cliente.local", "password": "baja12345"},
    ).status_code == 401


def test_admin_no_se_desactiva_a_si_mismo(client):
    me = client.get("/api/auth/me", headers=_admin(client)).json()
    r = client.patch(f"/api/admin/users/{me['id']}", json={"is_active": False}, headers=_admin(client))
    assert r.status_code == 400


def test_reset_password(client):
    uid = client.post(
        "/api/admin/users",
        json={"email": "reset@cliente.local", "password": "reset12345", "role": "client"},
        headers=_admin(client),
    ).json()["id"]
    r = client.post(
        f"/api/admin/users/{uid}/reset-password",
        json={"new_password": "cambiada999"},
        headers=_admin(client),
    )
    assert r.status_code == 200
    assert login(client, "reset@cliente.local", "cambiada999")["user"]["email"] == "reset@cliente.local"
