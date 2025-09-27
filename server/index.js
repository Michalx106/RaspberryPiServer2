import express from 'express';
import cors from 'cors';
import si from 'systeminformation';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PORT = Number(process.env.PORT) || 3000;
const SAMPLE_INTERVAL_MS = Number.parseInt(process.env.SAMPLE_INTERVAL_MS ?? '1000', 10);
const MAX_SAMPLES = Number.parseInt(process.env.MAX_METRIC_SAMPLES ?? '1000', 10);
const SHELLY_BASE_URL = process.env.SHELLY_BASE_URL ?? 'http://192.168.0.122/';
const SHELLY_TIMEOUT_MS = Number.parseInt(process.env.SHELLY_TIMEOUT_MS ?? '5000', 10);
const SHELLY_DEFAULT_DEVICE_ID = process.env.SHELLY_DEFAULT_DEVICE_ID ?? 'swiatlo-michal-pokoj';
const SHELLY_DEFAULT_DEVICE_NAME =
  process.env.SHELLY_DEFAULT_DEVICE_NAME ?? 'Światło Michał Pokój';
const SHELLY_DEVICES_FILE = process.env.SHELLY_DEVICES_FILE;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_SHELLY_DEVICES_PATH = path.join(__dirname, 'shelly-devices.json');

function getShellyDeviceConfigPaths() {
  const customPath = SHELLY_DEVICES_FILE?.trim();
  const candidates = [];

  if (customPath) {
    candidates.push(customPath);
  }

  candidates.push(DEFAULT_SHELLY_DEVICES_PATH);

  return candidates
    .map((candidate) =>
      path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate)
    )
    .filter((candidate, index, array) => array.indexOf(candidate) === index);
}

function normalizeBaseUrl(url) {
  if (!url) return '';
  return url.endsWith('/') ? url : `${url}/`;
}

function toNonNegativeInteger(value, defaultValue = 0) {
  if (value === null || value === undefined) {
    return defaultValue;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return defaultValue;
  }

  return parsed;
}

function sanitizeShellyDevices(devices) {
  return devices
    .map((device) => ({
      id: String(device.id ?? '').trim(),
      name: String(device.name ?? '').trim(),
      host: normalizeBaseUrl(device.host ?? device.baseUrl ?? ''),
      channel: toNonNegativeInteger(
        device.channel ?? device.switchId ?? device.relayId ?? 0,
        0
      )
    }))
    .filter((device) => device.id && device.name && device.host);
}

function parseShellyDevicesFromJson(raw, sourceLabel) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('Expected a JSON array of devices');
    }

    const sanitized = sanitizeShellyDevices(parsed);

    if (!sanitized.length) {
      console.warn(`No valid Shelly devices found in ${sourceLabel}.`);
      return null;
    }

    return sanitized;
  } catch (error) {
    console.warn(`Failed to parse Shelly device configuration from ${sourceLabel}:`, error);
    return null;
  }
}

function loadShellyDevicesFromFile() {
  for (const candidate of getShellyDeviceConfigPaths()) {
    try {
      if (!fs.existsSync(candidate)) {
        continue;
      }

      const contents = fs.readFileSync(candidate, 'utf8');
      const devices = parseShellyDevicesFromJson(contents, `file ${candidate}`);
      if (devices?.length) {
        return devices;
      }
    } catch (error) {
      console.warn(`Failed to read Shelly device configuration file ${candidate}:`, error);
    }
  }

  return null;
}

function parseShellyDevices() {
  const envDevices = parseShellyDevicesFromJson(
    process.env.SHELLY_DEVICES,
    'environment variable SHELLY_DEVICES'
  );
  if (envDevices?.length) {
    return envDevices;
  }

  const fileDevices = loadShellyDevicesFromFile();
  if (fileDevices?.length) {
    return fileDevices;
  }

  return [
    {
      id: SHELLY_DEFAULT_DEVICE_ID,
      name: SHELLY_DEFAULT_DEVICE_NAME,
      host: normalizeBaseUrl(SHELLY_BASE_URL),
      channel: 0
    }
  ];
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

async function fetchShelly(device, path, { query, method = 'GET', body, headers } = {}) {
  const url = buildShellyUrl(device, path, query);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SHELLY_TIMEOUT_MS);

  try {
    const requestInit = {
      method,
      signal: controller.signal
    };

    if (headers && Object.keys(headers).length) {
      requestInit.headers = { ...headers };
    }

    if (body !== undefined) {
      const shouldSerializeBody =
        body !== null &&
        typeof body === 'object' &&
        !Buffer.isBuffer(body) &&
        !(body instanceof URLSearchParams);

      if (shouldSerializeBody) {
        requestInit.body = JSON.stringify(body);
        const headerKeys = Object.keys(requestInit.headers ?? {});
        const hasContentType = headerKeys.some((key) => key.toLowerCase() === 'content-type');
        if (!hasContentType) {
          requestInit.headers = {
            ...(requestInit.headers ?? {}),
            'Content-Type': 'application/json'
          };
        }
      } else {
        requestInit.body = body;
      }
    }

    const response = await fetch(url, requestInit);

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
      baseUrl: device.host,
      channel: device.channel
    };
  } catch (error) {
    return {
      id: device.id,
      name: device.name,
      address: device.host,
      baseUrl: device.host,
      channel: device.channel
    };
  }
}

function normalizeShellyStatusResponse(rawStatus, device) {
  if (!rawStatus || typeof rawStatus !== 'object') {
    return rawStatus;
  }

  const channel = toNonNegativeInteger(device.channel, 0);
  const normalized = { ...rawStatus };

  const switchEntry = { ...rawStatus, id: rawStatus.id ?? channel };
  const switches = Array.isArray(rawStatus.switches)
    ? rawStatus.switches
    : Array.isArray(rawStatus.switch)
    ? rawStatus.switch
    : [switchEntry];

  const inferredIsOn =
    typeof rawStatus.output === 'boolean'
      ? rawStatus.output
      : typeof rawStatus.state === 'string'
      ? rawStatus.state.toLowerCase() === 'on'
      : null;

  const relayEntry = {
    id: switchEntry.id,
    ison: inferredIsOn,
    output: rawStatus.output,
    state:
      inferredIsOn === null
        ? rawStatus.state
        : inferredIsOn
        ? 'on'
        : 'off',
    value: inferredIsOn === null ? null : inferredIsOn ? 1 : 0,
    source: rawStatus.source ?? rawStatus.apower_source ?? ''
  };

  const relays =
    Array.isArray(rawStatus.relays) && rawStatus.relays.length
      ? rawStatus.relays
      : [relayEntry];

  const meterEntry = {
    power: Number.isFinite(rawStatus.apower) ? rawStatus.apower : null,
    total:
      rawStatus.aenergy && Number.isFinite(rawStatus.aenergy.total)
        ? rawStatus.aenergy.total
        : null,
    energy:
      rawStatus.aenergy && Number.isFinite(rawStatus.aenergy.total)
        ? rawStatus.aenergy.total
        : null,
    voltage: Number.isFinite(rawStatus.voltage) ? rawStatus.voltage : null,
    current: Number.isFinite(rawStatus.current) ? rawStatus.current : null
  };

  const meters =
    Array.isArray(rawStatus.meters) && rawStatus.meters.length
      ? rawStatus.meters
      : [meterEntry];

  normalized.switches = switches;
  normalized.switch = switches;
  normalized.relays = relays;
  normalized.meters = meters;
  normalized.device = {
    id: device.id,
    name: device.name,
    host: device.host,
    channel
  };

  return normalized;
}

async function respondWithShellyStatus(res, device) {
  try {
    const status = await fetchShelly(device, 'rpc/Switch.GetStatus', {
      query: { id: device.channel }
    });
    res.json(normalizeShellyStatusResponse(status, device));
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
    const payload = { id: device.channel };

    if (turn === 'toggle') {
      payload.toggle = true;
    } else {
      payload.on = turn === 'on';
    }

    const response = await fetchShelly(device, 'rpc/Switch.Set', {
      method: 'POST',
      body: payload
    });
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
