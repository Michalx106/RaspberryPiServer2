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

### API Endpoints

- `GET /api/metrics/current` – Returns a fresh snapshot collected on request.
- `GET /api/metrics/history` – Returns the in-memory history of recent samples.

## Keeping the server running

To keep the service running in the background after reboot, you can use a process manager such as [PM2](https://pm2.keymetrics.io/):

```bash
sudo npm install -g pm2
pm2 start index.js --name raspi-metrics
pm2 save
pm2 startup
```

Alternatively, create a `systemd` service that runs `node /path/to/RaspberryPiServer2/server/index.js` at boot.
