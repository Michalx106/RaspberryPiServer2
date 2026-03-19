from __future__ import annotations

import asyncio
import json
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from threading import RLock
from typing import AsyncIterator

from config_py import DEVICES_FILE_PATH


@dataclass
class DeviceActionValidationError(Exception):
    message: str
    status_code: int = 400


class DeviceService:
    def __init__(self, devices_path: Path):
        self._lock = RLock()
        self._devices_path = devices_path
        self._devices = []
        self._subscribers = set()
        self._load()

    def _load(self):
        with self._lock:
            if self._devices_path.exists():
                self._devices = json.loads(self._devices_path.read_text("utf-8"))
            else:
                self._devices = []
                self._persist()

    def _persist(self):
        serialized = json.dumps(self._devices, ensure_ascii=False, indent=2)
        self._devices_path.write_text(serialized + "\n", encoding="utf-8")

    def list_devices(self):
        with self._lock:
            return deepcopy(self._devices)

    def _broadcast_update(self, device: dict):
        with self._lock:
            subscribers = list(self._subscribers)

        for subscriber in subscribers:
            try:
                subscriber.put_nowait(deepcopy(device))
            except asyncio.QueueFull:
                # If the consumer is too slow, we drop old updates and keep
                # streaming the newest state.
                try:
                    subscriber.get_nowait()
                    subscriber.put_nowait(deepcopy(device))
                except (asyncio.QueueEmpty, asyncio.QueueFull):
                    continue

    def _find(self, device_id: str):
        for device in self._devices:
            if device.get("id") == device_id:
                return device
        return None

    def apply_action(self, device_id: str, payload: dict):
        with self._lock:
            device = self._find(device_id)
            if not device:
                raise DeviceActionValidationError(f"Unknown device: {device_id}", 404)

            dtype = device.get("type")
            state = dict(device.get("state") or {})

            if dtype == "sensor":
                raise DeviceActionValidationError("Sensor devices are read-only")

            if dtype == "switch":
                action = payload.get("action")
                if action == "toggle":
                    state["on"] = not bool(state.get("on", False))
                elif isinstance(payload.get("on"), bool):
                    state["on"] = payload["on"]
                else:
                    raise DeviceActionValidationError('Switch actions require {"action":"toggle"} or {"on": boolean}')

            elif dtype == "dimmer":
                level = payload.get("level")
                if not isinstance(level, int) or level < 0 or level > 100:
                    raise DeviceActionValidationError("Dimmer actions require a level between 0 and 100")
                state["level"] = level
            else:
                raise DeviceActionValidationError(f'Device type "{dtype}" does not support actions')

            device["state"] = state
            self._persist()
            updated_device = deepcopy(device)

        self._broadcast_update(updated_device)
        return updated_device

    def update_state(self, device_id: str, payload: dict):
        with self._lock:
            device = self._find(device_id)
            if not device:
                raise DeviceActionValidationError(f"Unknown device: {device_id}", 404)

            if device.get("type") != "sensor":
                raise DeviceActionValidationError("Only sensor devices support direct state updates")

            state_payload = payload.get("state") if isinstance(payload, dict) else None
            if not isinstance(state_payload, dict):
                raise DeviceActionValidationError('State updates require {"state": {...}} payload')

            merge = payload.get("merge", True)
            if not isinstance(merge, bool):
                raise DeviceActionValidationError('State updates require boolean "merge" field when provided')

            current_state = dict(device.get("state") or {})
            device["state"] = {**current_state, **state_payload} if merge else dict(state_payload)
            self._persist()
            updated_device = deepcopy(device)

        self._broadcast_update(updated_device)
        return updated_device

    async def subscribe(self) -> AsyncIterator[dict]:
        queue: asyncio.Queue = asyncio.Queue(maxsize=20)
        with self._lock:
            self._subscribers.add(queue)

        try:
            while True:
                yield await queue.get()
        finally:
            with self._lock:
                self._subscribers.discard(queue)


DEVICE_SERVICE = DeviceService(DEVICES_FILE_PATH)
