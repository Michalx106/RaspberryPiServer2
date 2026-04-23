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

    @staticmethod
    def _validate_device_identity(payload: dict, require_id: bool = True) -> dict:
        device_id = payload.get("id")
        if require_id:
            if not isinstance(device_id, str) or not device_id.strip():
                raise DeviceActionValidationError('Device requires non-empty string field "id"')
            device_id = device_id.strip()

        name = payload.get("name")
        if not isinstance(name, str) or not name.strip():
            raise DeviceActionValidationError('Device requires non-empty string field "name"')

        dtype = payload.get("type")
        allowed_types = {"switch", "dimmer", "sensor", "camera"}
        if dtype not in allowed_types:
            raise DeviceActionValidationError(
                f'Device type must be one of: {", ".join(sorted(allowed_types))}'
            )

        topic = payload.get("topic")
        if topic is not None and not isinstance(topic, str):
            raise DeviceActionValidationError('Device field "topic" must be a string when provided')

        state_payload = payload.get("state")
        if state_payload is not None and not isinstance(state_payload, dict):
            raise DeviceActionValidationError('Device field "state" must be an object when provided')

        result = {
            "name": name.strip(),
            "type": dtype,
            "state": dict(state_payload or {}),
        }
        if require_id:
            result["id"] = device_id
        if isinstance(topic, str) and topic.strip():
            result["topic"] = topic.strip()
        return result

    @staticmethod
    def _normalize_state(dtype: str, state: dict) -> dict:
        normalized = dict(state or {})
        if dtype == "switch":
            on = normalized.get("on", False)
            if not isinstance(on, bool):
                raise DeviceActionValidationError('Switch state requires boolean field "on"')
            normalized["on"] = on
        elif dtype == "dimmer":
            level = normalized.get("level", 0)
            if not isinstance(level, int) or level < 0 or level > 100:
                raise DeviceActionValidationError('Dimmer state requires integer field "level" between 0 and 100')
            normalized["level"] = level
        return normalized

    def create_device(self, payload: dict):
        if not isinstance(payload, dict):
            raise DeviceActionValidationError("Invalid device payload")

        validated = self._validate_device_identity(payload, require_id=True)
        validated["state"] = self._normalize_state(validated["type"], validated["state"])

        with self._lock:
            if self._find(validated["id"]):
                raise DeviceActionValidationError(f'Device with id "{validated["id"]}" already exists', 409)
            self._devices.append(validated)
            self._persist()
            created_device = deepcopy(validated)

        self._broadcast_update(created_device)
        return created_device

    def update_device(self, device_id: str, payload: dict):
        if not isinstance(payload, dict):
            raise DeviceActionValidationError("Invalid device payload")

        validated = self._validate_device_identity(payload, require_id=False)
        validated["state"] = self._normalize_state(validated["type"], validated["state"])

        with self._lock:
            device = self._find(device_id)
            if not device:
                raise DeviceActionValidationError(f"Unknown device: {device_id}", 404)

            device["name"] = validated["name"]
            device["type"] = validated["type"]
            device["state"] = validated["state"]
            if "topic" in validated:
                device["topic"] = validated["topic"]
            else:
                device.pop("topic", None)

            self._persist()
            updated_device = deepcopy(device)

        self._broadcast_update(updated_device)
        return updated_device

    def delete_device(self, device_id: str):
        with self._lock:
            index = next((idx for idx, item in enumerate(self._devices) if item.get("id") == device_id), -1)
            if index < 0:
                raise DeviceActionValidationError(f"Unknown device: {device_id}", 404)

            removed_device = deepcopy(self._devices.pop(index))
            self._persist()

        self._broadcast_update({"id": device_id, "_deleted": True})
        return removed_device

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
