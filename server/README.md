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
- Backend ładuje dane z pliku przy starcie i zapisuje je po każdej akcji (`POST /api/devices/{id}/actions`).

## Zmienne środowiskowe

- `PORT` (domyślnie `3000`)
- `SAMPLE_INTERVAL_MS` (domyślnie `1000`)
- `MAX_METRIC_SAMPLES` (domyślnie `1000`)

## API

- `GET /api/metrics/current`
- `GET /api/metrics/history`
- `GET /api/metrics/stream` (SSE)
- `GET /api/devices`
- `POST /api/devices/{id}/actions`
