# Raspberry Pi Metrics Server

This lightweight Express server exposes REST endpoints that report CPU load, memory usage, disk usage, and temperature for a Raspberry Pi 5.

## Requirements

- Node.js 18 or later (preinstalled on Raspberry Pi OS Bookworm)
- npm (included with Node.js)

## Installation

```bash
cd /path/to/RaspberryPiServer2/server
npm install
```

## Usage

Start the metrics API:

```bash
node index.js
```

The server listens on port `3000` by default. Override the port or sampling behaviour with environment variables:

- `PORT` – HTTP port to listen on (default: `3000`; accepts `0` for an ephemeral port, values outside `0-65535` fall back to the default)
- `SAMPLE_INTERVAL_MS` – Interval between metric samples stored in history (default: `1000` ms)
- `MAX_METRIC_SAMPLES` – Maximum number of samples stored for history responses and retained on disk (default: `1000`)
- `METRICS_DB_PATH` – Filesystem path for the SQLite database that stores historical samples (default: `./data/metrics-history.db` within the server directory)

### API Endpoints

- `GET /api/metrics/current` – Returns a fresh snapshot collected on request.
- `GET /api/metrics/history` – Returns the most recent samples persisted in the metrics history database.
- `GET /api/devices` – Returns the list of devices loaded from `devices.json`, including current in-memory state.
- `POST /api/devices/:id/actions` – Applies an action to the specified device. Supported actions depend on the `type` field (see below).

### Device configuration and manual tests

- Device definitions live in [`devices.json`](./devices.json). The file contains an array of objects with the following fields:
  - `id` – A unique identifier used by the API and frontend.
  - `name` – Human readable label displayed in the UI.
  - `type` – Determines how actions are handled. Supported values:
    - `switch` – Boolean devices. Accepts `{ "action": "toggle" }` to flip state or `{ "on": boolean }` to set explicitly. State is stored under `state.on`.
    - `dimmer` – Range-based devices. Accepts `{ "level": 0-100 }` and stores the value in `state.level`.
    - `sensor` – Read-only devices. They expose data from `state` but reject write actions.
  - `state` – Arbitrary JSON payload that captures the current state. Update handlers persist the full object back to disk.
- Sample entries ship with the repository so the manual tests below can run end-to-end:
  - `shelly1plus-relay` – A Shelly Plus 1 relay exposed as a `switch`. Its state synchronises with the physical device using the `integration` block (`type: "shelly-gen3"`, `ip`, and `switchId`).
  - `bedroom-dimmer` – A virtual `dimmer` whose `state.level` defaults to `42`. Posting a new level updates both the in-memory state and `devices.json`.
  - `rack-temperature-sensor` – A read-only `sensor` that publishes `state.temperatureC`, `state.humidityPercent`, and moving average metadata (`state.temperatureAvgC`, `state.humidityAvgPercent`, `state.avgWindow`, `state.avgSamples`, plus uptime/staleness details). It integrates with an HTTP rack sensor using the `integration` block (`type: "rack-sensor-http"`, `baseUrl`).

### Rack temperature sensor integration

- Set up the rack sensor by adding an `integration` block to its entry in [`devices.json`](./devices.json):

  ```json
  {
    "id": "rack-temperature-sensor",
    "name": "Rack Temperature Sensor",
    "type": "sensor",
    "integration": {
      "type": "rack-sensor-http",
      "baseUrl": "http://192.168.0.60/api"
    }
  }
  ```

- The `baseUrl` must point to the HTTP endpoint that returns the sensor payload as JSON. If the field is missing or empty the server skips refreshing the device until the configuration is corrected.
- **Manual test plan:**
  1. Start the server (`node index.js`) and verify that `GET /api/devices` returns the contents of `devices.json`.
  2. Send `POST /api/devices/shelly1plus-relay/actions` with `{ "action": "toggle" }` and ensure the response flips `state.on` and that `devices.json` updates accordingly (the server will also call the Shelly REST API using the metadata from the sample entry).
  3. Send `POST /api/devices/bedroom-dimmer/actions` with `{ "level": 75 }` and confirm the response shows the new `state.level` and the file persists the change.
  4. Attempt to POST to the `rack-temperature-sensor` device and verify a `400` error is returned indicating the device is read-only.
  5. Refresh the frontend Devices view and confirm that device states match the latest updates.

## Keeping the server running

To keep the service running in the background after reboot, you can use a process manager such as [PM2](https://pm2.keymetrics.io/):

```bash
sudo npm install -g pm2
pm2 start index.js --name raspi-metrics
pm2 save
pm2 startup
```

Alternatively, create a `systemd` service that runs `node /path/to/RaspberryPiServer2/server/index.js` at boot.

## Persistent metrics history storage

Historical samples are written to a local SQLite database powered by the `sql.js` WebAssembly driver, avoiding the need for
native build toolchains during deployment. By default the database file lives at `./data/metrics-history.db` (relative to the
`server/` directory). The folder is created automatically when the server starts. Set the `METRICS_DB_PATH` environment
variable to move the database elsewhere—relative values are resolved from the server directory, while absolute values are used
as-is. Regardless of location, the file should be stored on persistent storage (for example the Raspberry Pi's SD card) so that
history survives restarts.
