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

The server listens on port `3001` by default. Override the port or sampling behaviour with environment variables:

- `PORT` – HTTP port to listen on (default: `3001`)
- `SAMPLE_INTERVAL_MS` – Interval between metric samples stored in history (default: `5000` ms)
- `MAX_METRIC_SAMPLES` – Maximum number of samples kept in the ring buffer (default: `1000`)
- `SHELLY_DEVICES_FILE` – Absolute or relative path to a JSON file describing Shelly devices (default: `./shelly-devices.json`)

### API Endpoints

- `GET /api/metrics/current` – Returns a fresh snapshot collected on request.
- `GET /api/metrics/history` – Returns the in-memory history of recent samples.

### Shelly device configuration

The server loads Shelly device metadata from `shelly-devices.json` located next to `index.js`. Edit that file to add or modify the devices exposed by the `/api/shelly/*` endpoints:

```json
[
  {
    "id": "swiatlo-michal-pokoj",
    "name": "Światło Michał Pokój",
    "host": "http://192.168.0.122/",
    "channel": 0
  }
]
```

Each entry must include:

- `id` – unique identifier used in API routes
- `name` – friendly label shown in the UI
- `host` – base URL (including protocol) of the device, ending with a trailing slash
- `channel` – switch identifier (numeric) passed to `Switch.GetStatus`/`Switch.Set` RPC calls (default: `0`)

To store the configuration elsewhere, set `SHELLY_DEVICES_FILE` to point at an alternate JSON file.

## Keeping the server running

To keep the service running in the background after reboot, you can use a process manager such as [PM2](https://pm2.keymetrics.io/):

```bash
sudo npm install -g pm2
pm2 start index.js --name raspi-metrics
pm2 save
pm2 startup
```

Alternatively, create a `systemd` service that runs `node /path/to/RaspberryPiServer2/server/index.js` at boot.
