from __future__ import annotations

import json
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from threading import RLock

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
            return deepcopy(device)

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
            return deepcopy(device)


DEVICE_SERVICE = DeviceService(DEVICES_FILE_PATH)
