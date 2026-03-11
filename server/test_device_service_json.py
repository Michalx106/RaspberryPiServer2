import json
from pathlib import Path

import pytest

from device_service_py import DeviceActionValidationError, DeviceService


def test_device_service_persists_plain_json(tmp_path: Path):
    devices_path = tmp_path / "devices.json"
    devices_path.write_text(
        json.dumps([{"id": "lamp", "type": "switch", "state": {"on": False}}]),
        encoding="utf-8",
    )

    service = DeviceService(devices_path)
    updated = service.apply_action("lamp", {"action": "toggle"})

    assert updated["state"]["on"] is True

    persisted = json.loads(devices_path.read_text(encoding="utf-8"))
    assert persisted[0]["state"]["on"] is True
    assert "lamp" in devices_path.read_text(encoding="utf-8")


def test_update_sensor_state_merges_payload(tmp_path: Path):
    devices_path = tmp_path / "devices.json"
    devices_path.write_text(
        json.dumps(
            [
                {
                    "id": "rack-temperature-sensor",
                    "type": "sensor",
                    "state": {"temperatureC": 24.0, "humidityPercent": 40},
                }
            ]
        ),
        encoding="utf-8",
    )

    service = DeviceService(devices_path)
    updated = service.update_state(
        "rack-temperature-sensor",
        {"state": {"temperatureC": 25.1, "stale": False}, "merge": True},
    )

    assert updated["state"]["temperatureC"] == 25.1
    assert updated["state"]["humidityPercent"] == 40
    assert updated["state"]["stale"] is False


def test_update_state_rejects_non_sensor_device(tmp_path: Path):
    devices_path = tmp_path / "devices.json"
    devices_path.write_text(
        json.dumps([{"id": "lamp", "type": "switch", "state": {"on": False}}]),
        encoding="utf-8",
    )

    service = DeviceService(devices_path)

    with pytest.raises(DeviceActionValidationError):
        service.update_state("lamp", {"state": {"on": True}})
