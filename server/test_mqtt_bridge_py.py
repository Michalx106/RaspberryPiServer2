import json

import mqtt_bridge_py
from mqtt_bridge_py import MqttBridge


class DummyClient:
    def __init__(self):
        self.username = None
        self.password = None
        self.on_connect = None
        self.on_message = None
        self.connected = None
        self.published = []
        self.subscriptions = []

    def username_pw_set(self, username, password):
        self.username = username
        self.password = password

    def connect(self, host, port, keepalive):
        self.connected = (host, port, keepalive)

    def loop_forever(self):
        return None

    def publish(self, topic, payload, qos, retain):
        self.published.append((topic, payload, qos, retain))

    def subscribe(self, topic):
        self.subscriptions.append(topic)

    def disconnect(self):
        return None


class DummyThread:
    def __init__(self, target, daemon):
        self.target = target
        self.daemon = daemon
        self.started = False

    def start(self):
        self.started = True


class DummyReasonCode:
    is_failure = False


def test_publish_device_state_uses_device_topic_prefix(monkeypatch):
    bridge = MqttBridge()
    client = DummyClient()
    bridge._client = client

    monkeypatch.setattr(mqtt_bridge_py, "MQTT_DEVICE_TOPIC_PREFIX", "roompi/devices")

    bridge.publish_device_state({"id": "shelly1g3-28372f2a9038", "state": {"on": True}})

    assert client.published == [
        (
            "roompi/devices/shelly1g3-28372f2a9038/state",
            json.dumps({"on": True}, ensure_ascii=False),
            0,
            True,
        )
    ]


def test_start_sets_credentials_and_connects(monkeypatch):
    created_clients = []

    def fake_client(_api_version):
        client = DummyClient()
        created_clients.append(client)
        return client

    monkeypatch.setattr(mqtt_bridge_py, "MQTT_ENABLED", True)
    monkeypatch.setattr(mqtt_bridge_py, "MQTT_USERNAME", "hauser")
    monkeypatch.setattr(mqtt_bridge_py, "MQTT_PASSWORD", "mqtt-test-password")
    monkeypatch.setattr(mqtt_bridge_py, "MQTT_BROKER_HOST", "192.168.0.151")
    monkeypatch.setattr(mqtt_bridge_py, "MQTT_BROKER_PORT", 1883)
    monkeypatch.setattr(mqtt_bridge_py.mqtt, "Client", fake_client)
    monkeypatch.setattr(mqtt_bridge_py.threading, "Thread", DummyThread)

    bridge = MqttBridge()
    bridge.start()

    assert len(created_clients) == 1
    client = created_clients[0]
    assert client.username == "hauser"
    assert client.password == "mqtt-test-password"
    assert client.connected == ("192.168.0.151", 1883, 60)
    assert bridge._thread.started is True


def test_on_connect_subscribes_to_sensor_topic_prefix(monkeypatch):
    bridge = MqttBridge()
    client = DummyClient()

    monkeypatch.setattr(mqtt_bridge_py, "MQTT_SENSOR_TOPIC_PREFIX", "roompi/sensors")

    bridge._on_connect(client, None, None, DummyReasonCode(), None)

    assert client.subscriptions == ["roompi/sensors/+/state"]
