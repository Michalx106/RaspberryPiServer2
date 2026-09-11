from fastapi.testclient import TestClient

import main


def test_device_actions_require_admin_token(monkeypatch):
    monkeypatch.setattr(main, "validate_security_configuration", lambda: None)

    with TestClient(main.app) as client:
        response = client.post("/api/devices/unknown/actions", json={"action": "toggle"})

    assert response.status_code == 401


def test_sensor_state_requires_device_api_key(monkeypatch):
    monkeypatch.setattr(main, "validate_security_configuration", lambda: None)

    with TestClient(main.app) as client:
        response = client.post("/api/devices/sensor/state", json={"state": {"temperatureC": 20}})

    assert response.status_code == 401


def test_api_response_has_security_headers(monkeypatch):
    monkeypatch.setattr(main, "validate_security_configuration", lambda: None)

    with TestClient(main.app) as client:
        response = client.get("/api/devices")

    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["cache-control"] == "no-store"
