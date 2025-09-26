import express from 'express';
import cors from 'cors';
import si from 'systeminformation';

const PORT = Number(process.env.PORT) || 3000;
const SAMPLE_INTERVAL_MS = Number.parseInt(process.env.SAMPLE_INTERVAL_MS ?? '1000', 10);
const MAX_SAMPLES = Number.parseInt(process.env.MAX_METRIC_SAMPLES ?? '1000', 10);
const SHELLY_BASE_URL = process.env.SHELLY_BASE_URL ?? 'http://192.168.0.122/';
const SHELLY_TIMEOUT_MS = Number.parseInt(process.env.SHELLY_TIMEOUT_MS ?? '5000', 10);
const SHELLY_DEFAULT_DEVICE_ID = process.env.SHELLY_DEFAULT_DEVICE_ID ?? 'swiatlo-michal-pokoj';
const SHELLY_DEFAULT_DEVICE_NAME =
  process.env.SHELLY_DEFAULT_DEVICE_NAME ?? 'Światło Michał Pokój';

function normalizeBaseUrl(url) {
  if (!url) return '';
  return url.endsWith('/') ? url : `${url}/`;
}

function parseShellyDevices() {
  const raw = process.env.SHELLY_DEVICES;

  if (!raw) {
    return [
      {
        id: SHELLY_DEFAULT_DEVICE_ID,
        name: SHELLY_DEFAULT_DEVICE_NAME,
        host: normalizeBaseUrl(SHELLY_BASE_URL)
      }
    ];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('SHELLY_DEVICES must be a JSON array');
    }

    const sanitized = parsed
      .map((device) => ({
        id: String(device.id ?? '').trim(),
        name: String(device.name ?? '').trim(),
        host: normalizeBaseUrl(device.host ?? device.baseUrl ?? '')
      }))
      .filter((device) => device.id && device.name && device.host);

    return sanitized.length
      ? sanitized
      : [
          {
            id: SHELLY_DEFAULT_DEVICE_ID,
            name: SHELLY_DEFAULT_DEVICE_NAME,
            host: normalizeBaseUrl(SHELLY_BASE_URL)
          }
        ];
  } catch (error) {
    console.warn('Failed to parse SHELLY_DEVICES environment variable:', error);
    return [
      {
        id: SHELLY_DEFAULT_DEVICE_ID,
        name: SHELLY_DEFAULT_DEVICE_NAME,
        host: normalizeBaseUrl(SHELLY_BASE_URL)
      }
    ];
  }
}

const shellyDevices = parseShellyDevices();
const shellyDeviceMap = new Map(shellyDevices.map((device) => [device.id, device]));

const app = express();
app.use(cors());
app.use(express.json());

const metricsHistory = [];

function getShellyDevice(deviceId) {
  const device = shellyDeviceMap.get(deviceId);
  if (!device) {
    const error = new Error(`Unknown Shelly device: ${deviceId}`);
    error.statusCode = 404;
    throw error;
  }
  return device;
}

function buildShellyUrl(device, path, query = {}) {
  const normalizedBase = normalizeBaseUrl(device.host);
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  const url = new URL(normalizedPath, normalizedBase);

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    url.searchParams.set(key, String(value));
  });

  return url;
}

async function fetchShelly(device, path, { query } = {}) {
  const url = buildShellyUrl(device, path, query);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SHELLY_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new Error(
        `Shelly request failed with status ${response.status} ${response.statusText}: ${message}`.trim()
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return await response.json();
    }

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (error) {
      return { raw: text };
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

function addToHistory(sample) {
  metricsHistory.push(sample);
  if (metricsHistory.length > MAX_SAMPLES) {
    metricsHistory.splice(0, metricsHistory.length - MAX_SAMPLES);
  }
}

async function gatherMetrics() {
  const [load, memory, disks, temperature] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.cpuTemperature()
  ]);

  const totalDiskBytes = disks.reduce((total, disk) => total + disk.size, 0);
  const usedDiskBytes = disks.reduce((total, disk) => total + disk.used, 0);

  return {
    timestamp: new Date().toISOString(),
    cpu: {
      load: load.currentLoad,
      cores: load.cpus?.map((cpu) => cpu.load) ?? []
    },
    memory: {
      total: memory.total,
      available: memory.available,
      used: memory.total - memory.available,
      free: memory.free
    },
    disk: {
      total: totalDiskBytes,
      used: usedDiskBytes,
      available: totalDiskBytes - usedDiskBytes
    },
    temperature: {
      main: temperature.main,
      cores: temperature.cores,
      max: temperature.max
    }
  };
}

async function sampleAndStoreMetrics() {
  try {
    const sample = await gatherMetrics();
    addToHistory(sample);
  } catch (error) {
    console.error('Failed to gather system metrics:', error);
  }
}

// Prime the history buffer with an initial reading so history is never empty.
sampleAndStoreMetrics();

setInterval(sampleAndStoreMetrics, SAMPLE_INTERVAL_MS);

app.get('/api/metrics/current', async (req, res) => {
  try {
    const metrics = await gatherMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Error retrieving current metrics:', error);
    res.status(500).json({ error: 'Failed to retrieve current metrics' });
  }
});

app.get('/api/metrics/history', (req, res) => {
  res.json({
    intervalMs: SAMPLE_INTERVAL_MS,
    maxSamples: MAX_SAMPLES,
    samples: metricsHistory
  });
});

function summarizeDevice(device) {
  try {
    const { hostname, host } = new URL(device.host);
    return {
      id: device.id,
      name: device.name,
      address: hostname || host || device.host,
      baseUrl: device.host
    };
  } catch (error) {
    return {
      id: device.id,
      name: device.name,
      address: device.host,
      baseUrl: device.host
    };
  }
}

async function respondWithShellyStatus(res, device) {
  try {
    const status = await fetchShelly(device, 'status');
    res.json(status);
  } catch (error) {
    const isTimeout = error?.name === 'AbortError';
    console.error('Error retrieving Shelly status:', error);
    res.status(isTimeout ? 504 : 502).json({
      error: isTimeout
        ? 'Timed out while contacting Shelly device.'
        : 'Failed to retrieve Shelly device status.'
    });
  }
}

async function updateShellyRelay(req, res, device) {
  const { turn } = req.body ?? {};
  const allowedActions = new Set(['on', 'off', 'toggle']);

  if (typeof turn !== 'string' || !allowedActions.has(turn)) {
    res.status(400).json({
      error: "Expected 'turn' to be one of: 'on', 'off', or 'toggle'."
    });
    return;
  }

  try {
    const response = await fetchShelly(device, 'relay/0', { query: { turn } });
    res.json(response);
  } catch (error) {
    const isTimeout = error?.name === 'AbortError';
    console.error('Error updating Shelly relay state:', error);
    res.status(isTimeout ? 504 : 502).json({
      error: isTimeout
        ? 'Timed out while updating Shelly relay state.'
        : 'Failed to update Shelly relay state.'
    });
  }
}

app.get('/api/shelly/devices', (req, res) => {
  res.json({ devices: shellyDevices.map(summarizeDevice) });
});

app.get('/api/shelly/status', async (req, res) => {
  await respondWithShellyStatus(res, shellyDevices[0]);
});

app.post('/api/shelly/relay', async (req, res) => {
  await updateShellyRelay(req, res, shellyDevices[0]);
});

app.get('/api/shelly/:deviceId/status', async (req, res) => {
  try {
    const device = getShellyDevice(req.params.deviceId);
    await respondWithShellyStatus(res, device);
  } catch (error) {
    if (error.statusCode === 404) {
      res.status(404).json({ error: error.message });
      return;
    }
    throw error;
  }
});

app.post('/api/shelly/:deviceId/relay', async (req, res) => {
  try {
    const device = getShellyDevice(req.params.deviceId);
    await updateShellyRelay(req, res, device);
  } catch (error) {
    if (error.statusCode === 404) {
      res.status(404).json({ error: error.message });
      return;
    }
    throw error;
  }
});

if (!global.__metricsServerStarted) {
  global.__metricsServerStarted = true;
  app.listen(PORT, () => {
    console.log(`Metrics server listening on port ${PORT}`);
  });
}
