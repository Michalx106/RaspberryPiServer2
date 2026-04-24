from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
DEVICES_FILE_PATH = BASE_DIR / "devices.json"

load_dotenv(BASE_DIR / ".env")

PORT = int(os.environ.get("PORT", 3000))
SAMPLE_INTERVAL_MS = int(os.environ.get("SAMPLE_INTERVAL_MS", 1000))
MAX_METRIC_SAMPLES = int(os.environ.get("MAX_METRIC_SAMPLES", 1000))
METRICS_DB_PATH = Path(os.environ.get("METRICS_DB_PATH", BASE_DIR / "metrics.sqlite3"))

MQTT_ENABLED = os.environ.get("MQTT_ENABLED", "false").lower() in {"1", "true", "yes", "on"}
MQTT_BROKER_HOST = os.environ.get("MQTT_BROKER_HOST", "127.0.0.1")
MQTT_BROKER_PORT = int(os.environ.get("MQTT_BROKER_PORT", 1883))
MQTT_SENSOR_TOPIC_PREFIX = os.environ.get("MQTT_SENSOR_TOPIC_PREFIX", "roompi/sensors")
MQTT_DEVICE_TOPIC_PREFIX = os.environ.get("MQTT_DEVICE_TOPIC_PREFIX", "roompi/devices")
MQTT_USERNAME = os.environ.get("MQTT_USERNAME")
MQTT_PASSWORD = os.environ.get("MQTT_PASSWORD")

ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
ADMIN_JWT_SECRET = os.environ.get("ADMIN_JWT_SECRET")
ADMIN_JWT_ALGORITHM = os.environ.get("ADMIN_JWT_ALGORITHM", "HS256")
ADMIN_JWT_EXPIRES_MINUTES = int(os.environ.get("ADMIN_JWT_EXPIRES_MINUTES", 120))
