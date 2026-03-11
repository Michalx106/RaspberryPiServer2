import json
from pathlib import Path

from device_service_py import DeviceService


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
