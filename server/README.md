# Raspberry Pi Backend (Python)

Backend został przeniesiony z Node/Express do Pythona (FastAPI), a stan urządzeń jest przechowywany **w zwykłym JSON** (`devices.json`).

## Uruchomienie

```bash
cd server
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 3000
```

## Przechowywanie urządzeń

- Dane urządzeń są trzymane jako czytelny JSON w `server/devices.json`.
- Backend ładuje dane z pliku przy starcie i zapisuje je po każdej akcji (`POST /api/devices/{id}/actions`) i aktualizacji stanu (`POST /api/devices/{id}/state`).

## Zmienne środowiskowe

- `PORT` (domyślnie `3000`)
- `SAMPLE_INTERVAL_MS` (domyślnie `1000`)
- `MAX_METRIC_SAMPLES` (domyślnie `1000`)
- `METRICS_DB_PATH` (domyślnie `server/metrics.sqlite3`)
- `MQTT_ENABLED` (`true/false`, domyślnie `false`)
- `MQTT_BROKER_HOST` (domyślnie `127.0.0.1`)
- `MQTT_BROKER_PORT` (domyślnie `1883`)
- `MQTT_SENSOR_TOPIC_PREFIX` (domyślnie `roompi/sensors`)
- `MQTT_DEVICE_TOPIC_PREFIX` (domyślnie `roompi/devices`)
- `MQTT_USERNAME` (opcjonalnie, np. `hauser`)
- `MQTT_PASSWORD` (opcjonalnie, hasło do brokera)

## API

- `GET /api/metrics/current`
- `GET /api/metrics/history`
- `GET /api/metrics/stream` (SSE)
- `GET /api/devices`
- `POST /api/devices/{id}/actions`
- `POST /api/devices/{id}/state` (aktualizacja stanu sensora)

## Historia metryk

- Historia metryk nie jest już trzymana w RAM (`deque`), tylko w lekkiej bazie SQLite.
- Plik bazy domyślnie: `server/metrics.sqlite3` (zmienisz przez `METRICS_DB_PATH`).
- Po przekroczeniu `MAX_METRIC_SAMPLES` najstarsze rekordy są automatycznie usuwane.

## Integracja z Node-RED + Mosquitto (MQTT)

1. Włącz bridge MQTT po stronie backendu:

```bash
export MQTT_ENABLED=true
export MQTT_BROKER_HOST=127.0.0.1
export MQTT_BROKER_PORT=1883
export MQTT_SENSOR_TOPIC_PREFIX=roompi/sensors
export MQTT_DEVICE_TOPIC_PREFIX=roompi/devices
export MQTT_USERNAME=hauser
export MQTT_PASSWORD=Kowies1234
```

2. Uruchom backend i Mosquitto.

3. Node-RED (sensor -> backend przez MQTT):
   - publikuj na temat: `roompi/sensors/<device_id>/state`
   - payload JSON, np.:

```json
{
  "temperatureC": 23.7,
  "humidityPercent": 41.2,
  "stale": false
}
```

4. Backend automatycznie scali payload z aktualnym `state` urządzenia typu `sensor` i zapisze do `devices.json`.

5. Zmiany urządzeń sterowalnych z API są publikowane do MQTT:
   - temat: `<MQTT_DEVICE_TOPIC_PREFIX>/<device_id>/state` (domyślnie `roompi/devices/<device_id>/state`)
   - payload: JSON z aktualnym `state`


6. Aby urządzenie pojawiało się w zakładce **Devices** frontendu, musi istnieć w `server/devices.json` jako `type: "switch"` lub `type: "dimmer"` (kamery są filtrowane do osobnej zakładki).
   Przykład dla Shelly Gen3 sterowanego przez Node-RED:

```json
{
  "id": "shelly1g3-28372f2a9038",
  "name": "Salon Light (Shelly)",
  "type": "switch",
  "state": { "on": false }
}
```
Dzięki temu możesz w Node-RED odbierać stan przekaźników/ściemniaczy i budować automatyzacje zwrotne.

## Status migracji

- Katalog `server/` jest teraz Python-only: usunięto pliki Node/Express (`*.js`) oraz `package.json`.
- Do uruchomienia backendu używaj wyłącznie zależności z `requirements.txt`.
