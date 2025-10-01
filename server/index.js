import express from 'express';
import cors from 'cors';
import si from 'systeminformation';
import { readFile, writeFile } from 'fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 3000;
const SAMPLE_INTERVAL_MS = Number.parseInt(process.env.SAMPLE_INTERVAL_MS ?? '1000', 10);
const MAX_SAMPLES = Number.parseInt(process.env.MAX_METRIC_SAMPLES ?? '1000', 10);

const filePath = fileURLToPath(import.meta.url);
const directoryPath = path.dirname(filePath);
const DEVICES_FILE_PATH = path.join(directoryPath, 'devices.json');

const app = express();
app.use(cors());
app.use(express.json());

const metricsHistory = [];
let devices = [];
const devicesById = new Map();

function syncDeviceCache(freshDevices) {
  devices = freshDevices.map((device) => ({ ...device }));
  devicesById.clear();
  for (const device of devices) {
    devicesById.set(device.id, device);
  }
}

async function loadDevicesFromDisk() {
  const fileContents = await readFile(DEVICES_FILE_PATH, 'utf-8');
  const parsed = JSON.parse(fileContents);

  if (!Array.isArray(parsed)) {
    throw new Error('Device configuration file must contain an array');
  }

  syncDeviceCache(parsed);
}

async function persistDevicesToDisk() {
  const serialized = JSON.stringify(devices, null, 2);
  await writeFile(DEVICES_FILE_PATH, `${serialized}\n`, 'utf-8');
}

async function updateDeviceState(deviceId, mutator) {
  const index = devices.findIndex((device) => device.id === deviceId);
  if (index === -1) {
    throw new Error('Device not found');
  }

  const existingDevice = devices[index];
  const nextState = mutator({ ...(existingDevice.state ?? {}) });

  const updatedDevice = {
    ...existingDevice,
    state: nextState,
  };

  devices.splice(index, 1, updatedDevice);
  devicesById.set(deviceId, updatedDevice);

  await persistDevicesToDisk();
  return updatedDevice;
}

async function applyShellySwitchState(device, desiredOn) {
  const integration = device.integration;
  if (!integration || integration.type !== 'shelly-gen3') {
    throw new Error('Shelly integration is not configured for this device');
  }

  const { ip, switchId } = integration;
  if (!ip) {
    throw new Error('Shelly integration is missing the device IP address');
  }
  if (switchId === undefined) {
    throw new Error('Shelly integration is missing the switch identifier');
  }

  const url = `http://${ip}/rpc/Switch.Set`;
  let response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: switchId, on: desiredOn }),
    });
  } catch (error) {
    throw new Error(`Failed to connect to Shelly device at ${ip}: ${error.message}`);
  }

  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    throw new Error(
      `Shelly device at ${ip} responded with ${response.status} ${response.statusText}: ${responseText}`,
    );
  }

  let result;
  try {
    result = await response.json();
  } catch (error) {
    throw new Error(`Shelly device at ${ip} returned invalid JSON: ${error.message}`);
  }

  if (!result || typeof result !== 'object') {
    throw new Error(`Shelly device at ${ip} returned an unexpected payload`);
  }

  return result;
}

function addToHistory(sample) {
  metricsHistory.push(sample);
  if (metricsHistory.length > MAX_SAMPLES) {
    metricsHistory.splice(0, metricsHistory.length - MAX_SAMPLES);
  }
}

try {
  await loadDevicesFromDisk();
} catch (error) {
  console.error('Failed to load device configuration:', error);
  syncDeviceCache([]);
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

app.get('/api/devices', (req, res) => {
  res.json(devices);
});

app.post('/api/devices/:id/actions', async (req, res) => {
  const deviceId = req.params.id;
  const device = devicesById.get(deviceId);

  if (!device) {
    return res.status(404).json({ error: `Unknown device: ${deviceId}` });
  }

  try {
    let updatedDevice = device;

    switch (device.type) {
      case 'switch': {
        const { action, on } = req.body ?? {};
        let desiredOn;

        if (action === 'toggle') {
          desiredOn = !(device.state?.on ?? false);
        } else if (typeof on === 'boolean') {
          desiredOn = on;
        } else {
          return res.status(400).json({
            error: 'Switch actions require { action: "toggle" } or { on: boolean }',
          });
        }

        if (device.integration?.type === 'shelly-gen3') {
          const shellyResult = await applyShellySwitchState(device, desiredOn);
          const shellyOn = typeof shellyResult.on === 'boolean' ? shellyResult.on : desiredOn;
          const extraState = {};

          if (shellyResult && typeof shellyResult === 'object') {
            const { source, timer_started, timer_duration, has_timer } = shellyResult;
            if (source !== undefined) {
              extraState.source = source;
            }
            if (timer_started !== undefined) {
              extraState.timer_started = timer_started;
            }
            if (timer_duration !== undefined) {
              extraState.timer_duration = timer_duration;
            }
            if (has_timer !== undefined) {
              extraState.has_timer = has_timer;
            }
          }

          updatedDevice = await updateDeviceState(deviceId, (state) => ({
            ...state,
            ...extraState,
            on: shellyOn,
          }));
        } else {
          updatedDevice = await updateDeviceState(deviceId, (state) => ({
            ...state,
            on: desiredOn,
          }));
        }
        break;
      }
      case 'dimmer': {
        const { level } = req.body ?? {};
        const parsedLevel = Number.parseInt(level, 10);
        if (!Number.isFinite(parsedLevel) || parsedLevel < 0 || parsedLevel > 100) {
          return res.status(400).json({
            error: 'Dimmer actions require a level between 0 and 100',
          });
        }

        updatedDevice = await updateDeviceState(deviceId, (state) => ({
          ...state,
          level: parsedLevel,
        }));
        break;
      }
      case 'sensor': {
        return res.status(400).json({ error: 'Sensor devices are read-only' });
      }
      default: {
        return res.status(400).json({
          error: `Device type "${device.type}" does not support actions`,
        });
      }
    }

    res.json(updatedDevice);
  } catch (error) {
    console.error(`Failed to update device ${deviceId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: `Failed to update device state: ${errorMessage}` });
  }
});

if (!global.__metricsServerStarted) { global.__metricsServerStarted = true;
app.listen(PORT, () => {
  console.log(`Metrics server listening on port ${PORT}`);
});
}
