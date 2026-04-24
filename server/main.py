from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from config_py import (
    ADMIN_JWT_ALGORITHM,
    ADMIN_JWT_EXPIRES_MINUTES,
    ADMIN_JWT_SECRET,
    ADMIN_PASSWORD,
    ADMIN_USERNAME,
)
from device_service_py import DEVICE_SERVICE, DeviceActionValidationError
from metrics_service_py import gather_metrics, metrics_history, sample_loop, subscribe
from mqtt_bridge_py import MQTT_BRIDGE

app = FastAPI(title="Raspberry Pi Python Backend")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


def create_admin_access_token() -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=ADMIN_JWT_EXPIRES_MINUTES)
    payload = {
        "sub": "admin",
        "exp": expires_at,
    }
    return jwt.encode(payload, ADMIN_JWT_SECRET, algorithm=ADMIN_JWT_ALGORITHM)


def verify_admin_token(authorization: str | None = Header(default=None)) -> None:
    if not ADMIN_JWT_SECRET:
        raise HTTPException(status_code=503, detail="ADMIN_JWT_SECRET is not configured on the server.")

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token.")

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing Bearer token.")

    try:
        payload = jwt.decode(token, ADMIN_JWT_SECRET, algorithms=[ADMIN_JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token.") from exc

    if payload.get("sub") != "admin":
        raise HTTPException(status_code=401, detail="Invalid token subject.")


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(sample_loop())
    MQTT_BRIDGE.start()


@app.on_event("shutdown")
async def shutdown_event():
    MQTT_BRIDGE.stop()


@app.get("/health")
async def healthcheck():
    return {"status": "ok"}


@app.post("/api/admin/login")
async def admin_login(payload: dict):
    if not ADMIN_USERNAME or not ADMIN_PASSWORD:
        raise HTTPException(status_code=503, detail="ADMIN_USERNAME/ADMIN_PASSWORD are not configured on the server.")

    username = payload.get("username")
    password = payload.get("password")
    if username != ADMIN_USERNAME or password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid admin credentials.")

    return {
        "access_token": create_admin_access_token(),
        "token_type": "bearer",
        "expires_in_minutes": ADMIN_JWT_EXPIRES_MINUTES,
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
async def post_device_action(device_id: str, payload: dict):
    try:
        device = DEVICE_SERVICE.apply_action(device_id, payload or {})
        MQTT_BRIDGE.publish_device_state(device)
        return device
    except DeviceActionValidationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@app.post("/api/devices/{device_id}/state")
async def post_device_state(device_id: str, payload: dict):
    try:
        return DEVICE_SERVICE.update_state(device_id, payload or {})
    except DeviceActionValidationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@app.post("/api/admin/devices")
async def post_admin_device(payload: dict, _: None = Depends(verify_admin_token)):
    try:
        return DEVICE_SERVICE.create_device(payload or {})
    except DeviceActionValidationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@app.put("/api/admin/devices/{device_id}")
async def put_admin_device(device_id: str, payload: dict, _: None = Depends(verify_admin_token)):
    try:
        return DEVICE_SERVICE.update_device(device_id, payload or {})
    except DeviceActionValidationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@app.delete("/api/admin/devices/{device_id}")
async def delete_admin_device(device_id: str, _: None = Depends(verify_admin_token)):
    try:
        return DEVICE_SERVICE.delete_device(device_id)
    except DeviceActionValidationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
