from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import json
import sqlite3
import threading
import psutil

from config_py import MAX_METRIC_SAMPLES, METRICS_DB_PATH, SAMPLE_INTERVAL_MS

_subscribers: set[asyncio.Queue] = set()
_db_lock = threading.Lock()


def _connect() -> sqlite3.Connection:
    return sqlite3.connect(METRICS_DB_PATH)


def _init_db() -> None:
    with _db_lock, _connect() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS metric_samples (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                payload TEXT NOT NULL
            )
            """
        )
        connection.commit()


def _store_sample(sample: dict) -> None:
    serialized = json.dumps(sample)
    timestamp = sample.get("timestamp") or datetime.now(timezone.utc).isoformat()
    with _db_lock, _connect() as connection:
        connection.execute(
            "INSERT INTO metric_samples (timestamp, payload) VALUES (?, ?)",
            (timestamp, serialized),
        )
        connection.execute(
            """
            DELETE FROM metric_samples
            WHERE id NOT IN (
                SELECT id FROM metric_samples
                ORDER BY id DESC
                LIMIT ?
            )
            """,
            (MAX_METRIC_SAMPLES,),
        )
        connection.commit()


def _load_samples() -> list[dict]:
    with _db_lock, _connect() as connection:
        rows = connection.execute(
            """
            SELECT payload
            FROM metric_samples
            ORDER BY id ASC
            """
        ).fetchall()
    return [json.loads(payload) for (payload,) in rows]


def _extract_temperature_metrics() -> dict:
    try:
        temperatures_by_sensor = psutil.sensors_temperatures(fahrenheit=False)
    except (AttributeError, NotImplementedError):
        temperatures_by_sensor = {}

    readings: list[float] = []
    max_candidates: list[float] = []

    for entries in temperatures_by_sensor.values():
        for entry in entries:
            current_temp = getattr(entry, "current", None)
            if isinstance(current_temp, (int, float)):
                readings.append(float(current_temp))

            high_temp = getattr(entry, "high", None)
            critical_temp = getattr(entry, "critical", None)
            for max_value in (high_temp, critical_temp):
                if isinstance(max_value, (int, float)):
                    max_candidates.append(float(max_value))

    return {
        "main": readings[0] if readings else None,
        "cores": readings,
        "max": max(max_candidates) if max_candidates else (max(readings) if readings else None),
    }


def gather_metrics() -> dict:
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    load_pct = psutil.cpu_percent(interval=None)
    core_loads = psutil.cpu_percent(interval=None, percpu=True)

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "cpu": {"load": load_pct, "cores": core_loads},
        "memory": {
            "total": memory.total,
            "available": memory.available,
            "used": memory.used,
            "free": memory.free,
        },
        "disk": {
            "total": disk.total,
            "used": disk.used,
            "available": disk.free,
        },
        "temperature": _extract_temperature_metrics(),
    }


def metrics_history() -> dict:
    return {
        "intervalMs": SAMPLE_INTERVAL_MS,
        "maxSamples": MAX_METRIC_SAMPLES,
        "samples": _load_samples(),
    }


async def sample_loop():
    while True:
        sample = gather_metrics()
        _store_sample(sample)
        for queue in list(_subscribers):
            await queue.put(sample)
        await asyncio.sleep(SAMPLE_INTERVAL_MS / 1000)


async def subscribe():
    queue = asyncio.Queue()
    _subscribers.add(queue)
    try:
        while True:
            item = await queue.get()
            yield item
    finally:
        _subscribers.discard(queue)


_init_db()
