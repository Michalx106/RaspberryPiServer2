from __future__ import annotations

import asyncio
import json

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from device_service_py import DEVICE_SERVICE, DeviceActionValidationError
from metrics_service_py import gather_metrics, metrics_history, sample_loop, subscribe

app = FastAPI(title="Raspberry Pi Python Backend")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(sample_loop())


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


@app.post("/api/devices/{device_id}/actions")
async def post_device_action(device_id: str, payload: dict):
    try:
        return DEVICE_SERVICE.apply_action(device_id, payload or {})
    except DeviceActionValidationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
