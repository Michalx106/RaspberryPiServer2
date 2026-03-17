import metrics_service_py


def test_extract_temperature_metrics_handles_missing_sensors(monkeypatch):
    def _raise_not_implemented(*args, **kwargs):
        raise NotImplementedError

    monkeypatch.setattr(metrics_service_py.psutil, "sensors_temperatures", _raise_not_implemented)

    metrics = metrics_service_py._extract_temperature_metrics()

    assert metrics == {"main": None, "cores": [], "max": None}


def test_extract_temperature_metrics_collects_main_and_max(monkeypatch):
    class Reading:
        def __init__(self, current, high=None, critical=None):
            self.current = current
            self.high = high
            self.critical = critical

    def _fake_sensors(*args, **kwargs):
        return {
            "cpu_thermal": [
                Reading(current=51.2, high=85.0),
                Reading(current=53.8, critical=95.0),
            ],
            "gpu": [Reading(current=47.1)],
        }

    monkeypatch.setattr(metrics_service_py.psutil, "sensors_temperatures", _fake_sensors)

    metrics = metrics_service_py._extract_temperature_metrics()

    assert metrics["main"] == 51.2
    assert metrics["cores"] == [51.2, 53.8, 47.1]
    assert metrics["max"] == 95.0
