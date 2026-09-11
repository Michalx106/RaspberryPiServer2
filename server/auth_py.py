from __future__ import annotations

from hmac import compare_digest
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config_py import ADMIN_PASSWORD, ADMIN_USERNAME, JWT_ALGORITHM, JWT_EXPIRE_MINUTES, JWT_SECRET, SENSOR_API_KEY

bearer_scheme = HTTPBearer(auto_error=False)


def create_access_token(username: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES)
    payload = {
        "sub": username,
        "exp": expires_at,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def authenticate_admin(username: str, password: str) -> str | None:
    if not ADMIN_USERNAME or not ADMIN_PASSWORD:
        return None
    if not compare_digest(username, ADMIN_USERNAME) or not compare_digest(password, ADMIN_PASSWORD):
        return None
    return create_access_token(username)


def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nieprawidłowy lub wygasły token.",
        ) from exc

    if not isinstance(payload, dict) or not payload.get("sub") or not ADMIN_USERNAME:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nieprawidłowy token.",
        )

    if not compare_digest(str(payload["sub"]), ADMIN_USERNAME):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nieprawidłowy token.",
        )

    return payload


def require_admin(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Brak tokenu autoryzacyjnego.",
        )

    payload = decode_access_token(credentials.credentials)
    return str(payload["sub"])


def require_sensor_api_key(sensor_api_key: str | None = Header(default=None)) -> None:
    """Allow direct sensor writes only from an explicitly provisioned producer."""
    if not SENSOR_API_KEY or not sensor_api_key or not compare_digest(sensor_api_key, SENSOR_API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nieprawidłowy klucz urządzenia.",
        )
