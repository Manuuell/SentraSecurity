"""
Tests de autenticación (JWT + refresh rotatorio) y RBAC (B2C).
"""

from server.tests.conftest import bearer, login


def test_login_ok(client):
    tokens = login(client, "admin@test.local", "admin12345")
    assert tokens["access_token"]
    assert tokens["refresh_token"]
    assert tokens["user"]["role"] == "admin"


def test_login_password_incorrecta(client):
    r = client.post("/api/auth/login", json={"email": "admin@test.local", "password": "mala"})
    assert r.status_code == 401


def test_endpoints_requieren_token(client):
    assert client.get("/api/vehicles").status_code == 401
    assert client.get("/api/alarms").status_code == 401
    assert client.get("/api/stats").status_code == 401


def test_me(client):
    tokens = login(client, "admin@test.local", "admin12345")
    r = client.get("/api/auth/me", headers=bearer(tokens))
    assert r.status_code == 200
    assert r.json()["email"] == "admin@test.local"


def test_refresh_rota_y_revoca(client):
    tokens = login(client, "admin@test.local", "admin12345")
    old_refresh = tokens["refresh_token"]

    r = client.post("/api/auth/refresh", json={"refresh_token": old_refresh})
    assert r.status_code == 200
    new_refresh = r.json()["refresh_token"]
    assert new_refresh != old_refresh

    # El refresh usado queda revocado: reutilizarlo es 401
    r2 = client.post("/api/auth/refresh", json={"refresh_token": old_refresh})
    assert r2.status_code == 401

    # El nuevo sí funciona
    r3 = client.post("/api/auth/refresh", json={"refresh_token": new_refresh})
    assert r3.status_code == 200


def test_logout_revoca_refresh(client):
    tokens = login(client, "admin@test.local", "admin12345")
    r = client.post("/api/auth/logout", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200
    r2 = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r2.status_code == 401


# ---------------------------------------------------------------------------
# RBAC / visibilidad B2C
# ---------------------------------------------------------------------------

def test_admin_ve_toda_la_flota(client):
    tokens = login(client, "admin@test.local", "admin12345")
    r = client.get("/api/vehicles", headers=bearer(tokens))
    assert r.status_code == 200
    assert {v["id"] for v in r.json()} == {"1111111111", "2222222222"}


def test_cliente_solo_ve_sus_motos(client):
    tokens = login(client, "cliente@test.local", "cliente12345")
    r = client.get("/api/vehicles", headers=bearer(tokens))
    assert r.status_code == 200
    assert {v["id"] for v in r.json()} == {"1111111111"}


def test_cliente_no_accede_a_moto_ajena(client):
    tokens = login(client, "cliente@test.local", "cliente12345")
    # 404, no 403: no se revela qué IDs existen
    assert client.get("/api/vehicles/2222222222", headers=bearer(tokens)).status_code == 404
    assert client.get("/api/vehicles/2222222222/positions", headers=bearer(tokens)).status_code == 404


def test_cliente_edita_nombre_y_placa_de_su_moto(client):
    tokens = login(client, "cliente@test.local", "cliente12345")
    r = client.patch(
        "/api/vehicles/1111111111",
        json={"name": "Mi moto", "plate": "XYZ99Z"},
        headers=bearer(tokens),
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Mi moto"
    assert r.json()["plate"] == "XYZ99Z"
    # Restaurar para no afectar otros tests de la sesión
    admin = login(client, "admin@test.local", "admin12345")
    client.patch(
        "/api/vehicles/1111111111",
        json={"name": "Moto asignada", "plate": "AAA11A"},
        headers=bearer(admin),
    )


def test_cliente_no_toca_canal_de_comandos(client):
    # sim_phone y command_password son la puerta al corte de motor: solo staff
    tokens = login(client, "cliente@test.local", "cliente12345")
    for body in ({"sim_phone": "+57 300 000 0000"}, {"command_password": "1234"}):
        r = client.patch("/api/vehicles/1111111111", json=body, headers=bearer(tokens))
        assert r.status_code == 403


def test_cliente_no_edita_moto_ajena(client):
    tokens = login(client, "cliente@test.local", "cliente12345")
    r = client.patch("/api/vehicles/2222222222", json={"name": "X"}, headers=bearer(tokens))
    assert r.status_code == 404  # no se revela que existe


def test_stats_por_rol(client):
    # Fix B3: /stats respondía 500 por count() sin select()
    admin = login(client, "admin@test.local", "admin12345")
    r = client.get("/api/stats", headers=bearer(admin))
    assert r.status_code == 200
    assert r.json()["total_vehicles"] == 2

    cliente = login(client, "cliente@test.local", "cliente12345")
    r2 = client.get("/api/stats", headers=bearer(cliente))
    assert r2.status_code == 200
    assert r2.json()["total_vehicles"] == 1
