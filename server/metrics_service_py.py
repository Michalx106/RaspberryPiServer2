from __future__ import annotations

import asyncio
from collections import deque
from datetime import datetime, timezone
import psutil

from config_py import MAX_METRIC_SAMPLES, SAMPLE_INTERVAL_MS

_metrics_history = deque(maxlen=MAX_METRIC_SAMPLES)
_subscribers: set[asyncio.Queue] = set()


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
        "samples": list(_metrics_history),
    }


async def sample_loop():
    while True:
        sample = gather_metrics()
        _metrics_history.append(sample)
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
