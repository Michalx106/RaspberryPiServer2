from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DEVICES_FILE_PATH = BASE_DIR / "devices.json"

PORT = int(os.environ.get("PORT", 3000))
SAMPLE_INTERVAL_MS = int(os.environ.get("SAMPLE_INTERVAL_MS", 1000))
MAX_METRIC_SAMPLES = int(os.environ.get("MAX_METRIC_SAMPLES", 1000))

MQTT_ENABLED = os.environ.get("MQTT_ENABLED", "false").lower() in {"1", "true", "yes", "on"}
MQTT_BROKER_HOST = os.environ.get("MQTT_BROKER_HOST", "127.0.0.1")
MQTT_BROKER_PORT = int(os.environ.get("MQTT_BROKER_PORT", 1883))
MQTT_SENSOR_TOPIC_PREFIX = os.environ.get("MQTT_SENSOR_TOPIC_PREFIX", "roompi/sensors")
