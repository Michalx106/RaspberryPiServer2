from fastapi.testclient import TestClient

import main


def _configure_admin(monkeypatch):
    monkeypatch.setattr(main, "ADMIN_USERNAME", "admin")
    monkeypatch.setattr(main, "ADMIN_PASSWORD", "secret")
    monkeypatch.setattr(main, "ADMIN_JWT_SECRET", "jwt-secret")
    monkeypatch.setattr(main, "ADMIN_JWT_ALGORITHM", "HS256")


def _create_admin_token(client):
    response = client.post("/api/admin/login", json={"username": "admin", "password": "secret"})
    assert response.status_code == 200
    return response.json()["access_token"]


def test_admin_endpoints_require_token(monkeypatch):
    _configure_admin(monkeypatch)
    monkeypatch.setattr(main.DEVICE_SERVICE, "create_device", lambda payload: payload)
    client = TestClient(main.app)

    response = client.post(
        "/api/admin/devices",
        json={"id": "desk-light", "name": "Desk Light", "type": "switch", "state": {"on": False}},
    )

    assert response.status_code == 401


def test_admin_login_rejects_invalid_credentials(monkeypatch):
    _configure_admin(monkeypatch)
    client = TestClient(main.app)

    response = client.post("/api/admin/login", json={"username": "admin", "password": "bad-password"})

    assert response.status_code == 401


def test_admin_endpoints_accept_valid_jwt(monkeypatch):
    _configure_admin(monkeypatch)
    monkeypatch.setattr(main.DEVICE_SERVICE, "create_device", lambda payload: payload)
    client = TestClient(main.app)
    access_token = _create_admin_token(client)

    response = client.post(
        "/api/admin/devices",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"id": "desk-light-auth", "name": "Desk Light", "type": "switch", "state": {"on": False}},
    )

    assert response.status_code == 200
    assert response.json()["id"] == "desk-light-auth"


def test_healthcheck_endpoint():
    client = TestClient(main.app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
