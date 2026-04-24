import json
import asyncio
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


def test_subscribe_stream_receives_device_updates(tmp_path: Path):
    devices_path = tmp_path / "devices.json"
    devices_path.write_text(
        json.dumps([{"id": "lamp", "type": "switch", "state": {"on": False}}]),
        encoding="utf-8",
    )

    service = DeviceService(devices_path)

    async def run_scenario():
        stream = service.subscribe()
        first_message_task = asyncio.create_task(stream.__anext__())

        await asyncio.sleep(0)
        service.apply_action("lamp", {"action": "toggle"})
        update = await asyncio.wait_for(first_message_task, timeout=1.0)

        assert update["id"] == "lamp"
        assert update["state"]["on"] is True
        await stream.aclose()

    asyncio.run(run_scenario())


def test_create_update_delete_device(tmp_path: Path):
    devices_path = tmp_path / "devices.json"
    devices_path.write_text("[]", encoding="utf-8")
    service = DeviceService(devices_path)

    created = service.create_device(
        {
            "id": "desk-light",
            "name": "Desk Light",
            "type": "switch",
            "topic": "roompi/devices/desk-light/state",
            "state": {"on": False},
        }
    )
    assert created["id"] == "desk-light"
    assert created["state"]["on"] is False

    updated = service.update_device(
        "desk-light",
        {
            "name": "Desk Light Updated",
            "type": "dimmer",
            "state": {"level": 65},
        },
    )
    assert updated["type"] == "dimmer"
    assert updated["state"]["level"] == 65
    assert "topic" not in updated

    removed = service.delete_device("desk-light")
    assert removed["id"] == "desk-light"
    assert service.list_devices() == []


def test_delete_device_broadcasts_deleted_event(tmp_path: Path):
    devices_path = tmp_path / "devices.json"
    devices_path.write_text(
        json.dumps([{"id": "lamp", "name": "Lamp", "type": "switch", "state": {"on": False}}]),
        encoding="utf-8",
    )
    service = DeviceService(devices_path)

    async def run_scenario():
        stream = service.subscribe()
        first_message_task = asyncio.create_task(stream.__anext__())

        await asyncio.sleep(0)
        service.delete_device("lamp")
        update = await asyncio.wait_for(first_message_task, timeout=1.0)

        assert update["id"] == "lamp"
        assert update["_deleted"] is True
        await stream.aclose()

    asyncio.run(run_scenario())


def test_persist_uses_atomic_replace_without_temp_leak(tmp_path: Path):
    devices_path = tmp_path / "devices.json"
    devices_path.write_text(
        json.dumps([{"id": "lamp", "name": "Lamp", "type": "switch", "state": {"on": False}}]),
        encoding="utf-8",
    )

    service = DeviceService(devices_path)
    service.apply_action("lamp", {"action": "toggle"})

    persisted = json.loads(devices_path.read_text(encoding="utf-8"))
    assert persisted[0]["state"]["on"] is True
    assert not (tmp_path / "devices.json.tmp").exists()
