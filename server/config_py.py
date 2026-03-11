from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PORT = int(os.getenv("PORT", "3000"))
SAMPLE_INTERVAL_MS = max(200, int(os.getenv("SAMPLE_INTERVAL_MS", "1000")))
MAX_METRIC_SAMPLES = max(1, int(os.getenv("MAX_METRIC_SAMPLES", "1000")))
DEVICES_FILE_PATH = BASE_DIR / "devices.json"
