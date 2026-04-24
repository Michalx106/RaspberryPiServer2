from __future__ import annotations

import asyncio
import json

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from device_service_py import DEVICE_SERVICE, DeviceActionValidationError
from metrics_service_py import gather_metrics, metrics_history, sample_loop, subscribe
from mqtt_bridge_py import MQTT_BRIDGE
from config_py import ADMIN_API_TOKEN

app = FastAPI(title="Raspberry Pi Python Backend")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


def verify_admin_token(x_admin_token: str | None = Header(default=None)) -> None:
    configured_token = ADMIN_API_TOKEN
    if not configured_token:
        raise HTTPException(status_code=503, detail="ADMIN_API_TOKEN is not configured on the server.")

    if x_admin_token != configured_token:
        raise HTTPException(status_code=401, detail="Unauthorized admin token.")


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
