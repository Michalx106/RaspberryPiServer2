from __future__ import annotations

import asyncio
from collections import deque
from datetime import datetime, timezone
import psutil

from config_py import MAX_METRIC_SAMPLES, SAMPLE_INTERVAL_MS

_metrics_history = deque(maxlen=MAX_METRIC_SAMPLES)
_subscribers: set[asyncio.Queue] = set()


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
        "temperature": {"main": None, "cores": [], "max": None},
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
