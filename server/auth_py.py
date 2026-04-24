from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config_py import ADMIN_PASSWORD, ADMIN_USERNAME, JWT_ALGORITHM, JWT_EXPIRE_MINUTES, JWT_SECRET

bearer_scheme = HTTPBearer(auto_error=False)


def create_access_token(username: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES)
    payload = {
        "sub": username,
        "exp": expires_at,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def authenticate_admin(username: str, password: str) -> str | None:
    if username != ADMIN_USERNAME or password != ADMIN_PASSWORD:
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

    if not isinstance(payload, dict) or not payload.get("sub"):
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
