from __future__ import annotations

import json
import logging
import threading
from typing import Any

import paho.mqtt.client as mqtt

from config_py import (
    MQTT_BROKER_HOST,
    MQTT_BROKER_PORT,
    MQTT_DEVICE_TOPIC_PREFIX,
    MQTT_ENABLED,
    MQTT_PASSWORD,
    MQTT_SENSOR_TOPIC_PREFIX,
    MQTT_USERNAME,
)
from device_service_py import DEVICE_SERVICE, DeviceActionValidationError

logger = logging.getLogger(__name__)


class MqttBridge:
    def __init__(self):
        self._client: mqtt.Client | None = None
        self._thread: threading.Thread | None = None

    def start(self):
        if not MQTT_ENABLED:
            logger.info("MQTT bridge disabled")
            return

        if self._client is not None:
            return

        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        if MQTT_USERNAME:
            client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)

        client.on_connect = self._on_connect
        client.on_message = self._on_message
        client.connect(MQTT_BROKER_HOST, MQTT_BROKER_PORT, 60)

        self._client = client
        self._thread = threading.Thread(target=client.loop_forever, daemon=True)
        self._thread.start()
        logger.info("MQTT bridge connected to %s:%s", MQTT_BROKER_HOST, MQTT_BROKER_PORT)

    def stop(self):
        if self._client is None:
            return

        self._client.disconnect()
        self._client = None
        logger.info("MQTT bridge stopped")

    def publish_device_state(self, device: dict[str, Any]):
        if self._client is None:
            return

        topic = f"{MQTT_DEVICE_TOPIC_PREFIX}/{device.get('id')}/state"
        payload = json.dumps(device.get("state") or {}, ensure_ascii=False)
        self._client.publish(topic, payload, qos=0, retain=True)

    def _on_connect(self, client: mqtt.Client, _userdata: Any, _flags: Any, reason_code: Any, _props: Any):
        if getattr(reason_code, "is_failure", False):
            logger.error("MQTT connect failed: %s", reason_code)
            return

        topic = f"{MQTT_SENSOR_TOPIC_PREFIX}/+/state"
        client.subscribe(topic)
        logger.info("Subscribed to MQTT sensor topic %s", topic)

    def _on_message(self, _client: mqtt.Client, _userdata: Any, message: mqtt.MQTTMessage):
        try:
            payload = json.loads(message.payload.decode("utf-8"))
        except json.JSONDecodeError:
            logger.warning("Invalid JSON on topic %s", message.topic)
            return

        parts = message.topic.split("/")
        if len(parts) < 2:
            return

        device_id = parts[-2]
        try:
            DEVICE_SERVICE.update_state(device_id, {"state": payload, "merge": True})
        except DeviceActionValidationError as exc:
            logger.warning("Skipping MQTT update for %s: %s", device_id, exc.message)


MQTT_BRIDGE = MqttBridge()
