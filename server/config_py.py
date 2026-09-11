from __future__ import annotations

import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DEVICES_FILE_PATH = BASE_DIR / "devices.json"

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
SWITCH_TOGGLE_COOLDOWN_SECONDS = float(os.environ.get("SWITCH_TOGGLE_COOLDOWN_SECONDS", "2"))

# Credentials must be supplied by the deployment.  In particular, never add a
# fallback password here: this module is imported by the web server as well as
# by background workers.
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
# A process-local fallback makes an accidentally unconfigured instance unable
# to validate tokens created after a restart.  Admin token issuance remains
# disabled until an explicit environment secret is supplied.
JWT_SECRET = os.environ.get("JWT_SECRET") or secrets.token_urlsafe(48)
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", 120))

SENSOR_API_KEY = os.environ.get("SENSOR_API_KEY")
API_ALLOWED_ORIGINS = tuple(
    origin.strip() for origin in os.environ.get("API_ALLOWED_ORIGINS", "").split(",") if origin.strip()
)
LOGIN_MAX_ATTEMPTS = int(os.environ.get("LOGIN_MAX_ATTEMPTS", 5))
LOGIN_WINDOW_SECONDS = int(os.environ.get("LOGIN_WINDOW_SECONDS", 900))


def admin_auth_is_configured() -> bool:
    """Report whether issuing admin tokens is safe without stopping public telemetry."""
    return bool(
        ADMIN_USERNAME
        and ADMIN_PASSWORD
        and os.environ.get("JWT_SECRET")
        and len(JWT_SECRET) >= 32
        and JWT_EXPIRE_MINUTES > 0
    )
