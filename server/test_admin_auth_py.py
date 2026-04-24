from fastapi.testclient import TestClient

import main


def test_admin_endpoints_require_token(monkeypatch):
    monkeypatch.setattr(main, "ADMIN_API_TOKEN", "secret-token")
    monkeypatch.setattr(main.DEVICE_SERVICE, "create_device", lambda payload: payload)
    client = TestClient(main.app)

    response = client.post(
        "/api/admin/devices",
        json={"id": "desk-light", "name": "Desk Light", "type": "switch", "state": {"on": False}},
    )

    assert response.status_code == 401


def test_admin_endpoints_accept_valid_token(monkeypatch):
    monkeypatch.setattr(main, "ADMIN_API_TOKEN", "secret-token")
    monkeypatch.setattr(main.DEVICE_SERVICE, "create_device", lambda payload: payload)
    client = TestClient(main.app)

    response = client.post(
        "/api/admin/devices",
        headers={"X-Admin-Token": "secret-token"},
        json={"id": "desk-light-auth", "name": "Desk Light", "type": "switch", "state": {"on": False}},
    )

    assert response.status_code == 200
    assert response.json()["id"] == "desk-light-auth"
