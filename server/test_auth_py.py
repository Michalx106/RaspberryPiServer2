import jwt
import pytest
from fastapi import HTTPException

import auth_py


def test_authenticate_admin_returns_token_for_valid_credentials(monkeypatch):
    monkeypatch.setattr(auth_py, "ADMIN_USERNAME", "admin")
    monkeypatch.setattr(auth_py, "ADMIN_PASSWORD", "secret")

    token = auth_py.authenticate_admin("admin", "secret")

    assert isinstance(token, str)
    payload = jwt.decode(token, auth_py.JWT_SECRET, algorithms=[auth_py.JWT_ALGORITHM])
    assert payload["sub"] == "admin"


def test_authenticate_admin_rejects_invalid_credentials(monkeypatch):
    monkeypatch.setattr(auth_py, "ADMIN_USERNAME", "admin")
    monkeypatch.setattr(auth_py, "ADMIN_PASSWORD", "secret")

    token = auth_py.authenticate_admin("admin", "bad")

    assert token is None


def test_decode_access_token_raises_for_invalid_token():
    with pytest.raises(HTTPException) as exc:
        auth_py.decode_access_token("invalid-token")

    assert exc.value.status_code == 401
