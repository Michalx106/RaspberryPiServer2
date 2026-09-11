from __future__ import annotations

import asyncio
import json
from collections import defaultdict, deque
from time import monotonic

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from auth_py import authenticate_admin, require_admin, require_sensor_api_key
from config_py import API_ALLOWED_ORIGINS, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_SECONDS, admin_auth_is_configured
from device_service_py import DEVICE_SERVICE, DeviceActionValidationError
from metrics_service_py import gather_metrics, metrics_history, sample_loop, subscribe
from mqtt_bridge_py import MQTT_BRIDGE

app = FastAPI(title="Raspberry Pi Python Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(API_ALLOWED_ORIGINS),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Sensor-Api-Key"],
)

_login_attempts: dict[str, deque[float]] = defaultdict(deque)
MAX_REQUEST_BODY_BYTES = 16 * 1024


class LoginPayload(BaseModel):
    username: str
    password: str


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(sample_loop())
    MQTT_BRIDGE.start()


@app.on_event("shutdown")
async def shutdown_event():
    MQTT_BRIDGE.stop()


@app.middleware("http")
async def add_security_headers_and_limit_request_size(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > MAX_REQUEST_BODY_BYTES:
        return JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={"detail": "Żądanie jest zbyt duże."},
        )

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store" if request.url.path.startswith("/api/") else "no-cache"
    return response


@app.post("/api/admin/login")
async def post_admin_login(payload: LoginPayload, request: Request):
    # Telemetry remains available when a new installation has not configured
    # secrets yet; administrative access remains fail-closed.
    if not admin_auth_is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Logowanie administratora nie zostało skonfigurowane.",
        )

    client_ip = request.client.host if request.client else "unknown"
    now = monotonic()
    attempts = _login_attempts[client_ip]
    while attempts and now - attempts[0] >= LOGIN_WINDOW_SECONDS:
        attempts.popleft()
    if len(attempts) >= LOGIN_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Zbyt wiele prób logowania. Spróbuj ponownie później.",
            headers={"Retry-After": str(max(1, int(LOGIN_WINDOW_SECONDS - (now - attempts[0]))))},
        )

    token = authenticate_admin(payload.username, payload.password)
    if token is None:
        attempts.append(now)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Niepoprawny login lub hasło.")

    _login_attempts.pop(client_ip, None)

    return {
        "accessToken": token,
        "tokenType": "Bearer",
    }


@app.get("/api/metrics/current")
async def get_metrics_current():
    return gather_metrics()


@app.get("/api/metrics/history")
async def get_metrics_history():
    return metrics_history()


@app.get("/api/metrics/stream")
async def metrics_stream():
    async def event_stream():
        yield f"event: history\ndata: {json.dumps(metrics_history())}\n\n"
        async for sample in subscribe():
            yield f"event: sample\ndata: {json.dumps(sample)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/api/devices")
async def get_devices():
    return DEVICE_SERVICE.list_devices()


@app.get("/api/devices/stream")
async def devices_stream():
    async def event_stream():
        yield f"event: devices\ndata: {json.dumps(DEVICE_SERVICE.list_devices())}\n\n"
        async for device in DEVICE_SERVICE.subscribe():
            yield f"event: device\ndata: {json.dumps(device)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/devices/{device_id}/actions")
async def post_device_action(device_id: str, payload: dict, _admin_username: str = Depends(require_admin)):
    try:
        device = DEVICE_SERVICE.apply_action(device_id, payload or {})
        MQTT_BRIDGE.publish_device_state(device)
        return device
    except DeviceActionValidationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@app.post("/api/devices/{device_id}/state")
async def post_device_state(device_id: str, payload: dict, _sensor_api_key: None = Depends(require_sensor_api_key)):
    try:
        return DEVICE_SERVICE.update_state(device_id, payload or {})
    except DeviceActionValidationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@app.post("/api/admin/devices")
async def post_admin_device(payload: dict, _admin_username: str = Depends(require_admin)):
    try:
        return DEVICE_SERVICE.create_device(payload or {})
    except DeviceActionValidationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@app.put("/api/admin/devices/{device_id}")
async def put_admin_device(device_id: str, payload: dict, _admin_username: str = Depends(require_admin)):
    try:
        return DEVICE_SERVICE.update_device(device_id, payload or {})
    except DeviceActionValidationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@app.delete("/api/admin/devices/{device_id}")
async def delete_admin_device(device_id: str, _admin_username: str = Depends(require_admin)):
    try:
        return DEVICE_SERVICE.delete_device(device_id)
    except DeviceActionValidationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
