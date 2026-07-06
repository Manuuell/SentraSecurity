"""
Tests del alta manual de rastreadores y la vinculación vehículo→clientes.

OJO: este archivo crea vehículos nuevos en la BD compartida de la sesión de
tests. Debe ejecutarse DESPUÉS de test_auth.py (que asume exactamente las 2
motos sembradas) — pytest recorre los archivos en orden alfabético, así que
el nombre "test_vehicles_admin" lo garantiza; no renombrar sin revisar eso.
"""

from server.tests.conftest import bearer, login


def _admin(client):
    return bearer(login(client, "admin@test.local", "admin12345"))


def _cliente(client):
    return bearer(login(client, "cliente@test.local", "cliente12345"))


def test_cliente_no_crea_rastreadores(client):
    r = client.post(
        "/api/admin/vehicles",
        json={"id": "3333333333", "name": "Moto nueva"},
        headers=_cliente(client),
    )
    assert r.status_code == 403


def test_id_no_numerico_rechazado(client):
    r = client.post(
        "/api/admin/vehicles",
        json={"id": "ABC1234567", "name": "Moto mala"},
        headers=_admin(client),
    )
    assert r.status_code == 422


def test_duplicado_rechazado(client):
    r = client.post(
        "/api/admin/vehicles",
        json={"id": "1111111111", "name": "Ya existe"},
        headers=_admin(client),
    )
    assert r.status_code == 409


def test_owner_inexistente_o_no_cliente(client):
    r = client.post(
        "/api/admin/vehicles",
        json={"id": "3333333333", "owner_user_id": 99999},
        headers=_admin(client),
    )
    assert r.status_code == 400
    # user_id=1 es admin, no cliente
    r = client.post(
        "/api/admin/vehicles",
        json={"id": "3333333333", "owner_user_id": 1},
        headers=_admin(client),
    )
    assert r.status_code == 400


def test_alta_con_cliente_asignado(client):
    r = client.post(
        "/api/admin/vehicles",
        json={
            "id": "3333333333",
            "name": "Moto de alta manual",
            "plate": "ccc33c",
            "sim_phone": "+57 300 111 2233",
            "owner_user_id": 2,
        },
        headers=_admin(client),
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["plate"] == "CCC33C"  # normalizada a mayúsculas
    assert data["owner_user_id"] == 2

    # El cliente la ve de inmediato junto a la que ya tenía
    visibles = {v["id"] for v in client.get("/api/vehicles", headers=_cliente(client)).json()}
    assert {"1111111111", "3333333333"} <= visibles

    # Y aparece en el mapa de dueños
    owners = client.get("/api/admin/vehicles/owners", headers=_admin(client)).json()
    assert any(o["email"] == "cliente@test.local" for o in owners["3333333333"])


def test_alta_sin_nombre_usa_default(client):
    r = client.post(
        "/api/admin/vehicles",
        json={"id": "4444444444"},
        headers=_admin(client),
    )
    assert r.status_code == 201
    assert r.json()["name"] == "Vehículo 4444444444"


def test_vincular_desde_el_vehiculo(client):
    # Reemplazo completo del conjunto de clientes del vehículo 4444444444
    r = client.put(
        "/api/admin/vehicles/4444444444/users",
        json={"user_ids": [2]},
        headers=_admin(client),
    )
    assert r.status_code == 200
    assert r.json()["user_ids"] == [2]

    visibles = {v["id"] for v in client.get("/api/vehicles", headers=_cliente(client)).json()}
    assert "4444444444" in visibles

    # Quitar la vinculación también funciona
    r = client.put(
        "/api/admin/vehicles/4444444444/users",
        json={"user_ids": []},
        headers=_admin(client),
    )
    assert r.status_code == 200
    visibles = {v["id"] for v in client.get("/api/vehicles", headers=_cliente(client)).json()}
    assert "4444444444" not in visibles


def test_vincular_usuario_no_cliente_falla(client):
    r = client.put(
        "/api/admin/vehicles/4444444444/users",
        json={"user_ids": [1]},  # admin
        headers=_admin(client),
    )
    assert r.status_code == 400


def test_vincular_vehiculo_inexistente(client):
    r = client.put(
        "/api/admin/vehicles/9999999999/users",
        json={"user_ids": [2]},
        headers=_admin(client),
    )
    assert r.status_code == 404
