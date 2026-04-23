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


def test_metrics_history_uses_sqlite_and_respects_limit(monkeypatch, tmp_path):
    db_path = tmp_path / "metrics_test.sqlite3"
    monkeypatch.setattr(metrics_service_py, "METRICS_DB_PATH", db_path)
    monkeypatch.setattr(metrics_service_py, "MAX_METRIC_SAMPLES", 2)
    metrics_service_py._init_db()

    metrics_service_py._store_sample({"timestamp": "2026-01-01T00:00:00+00:00", "cpu": {"load": 10}})
    metrics_service_py._store_sample({"timestamp": "2026-01-01T00:00:01+00:00", "cpu": {"load": 20}})
    metrics_service_py._store_sample({"timestamp": "2026-01-01T00:00:02+00:00", "cpu": {"load": 30}})

    history = metrics_service_py.metrics_history()

    assert history["maxSamples"] == 2
    assert [sample["cpu"]["load"] for sample in history["samples"]] == [20, 30]
