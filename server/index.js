import express from 'express';
import cors from 'cors';
import si from 'systeminformation';

const PORT = Number(process.env.PORT) || 3000;
const SAMPLE_INTERVAL_MS = Number.parseInt(process.env.SAMPLE_INTERVAL_MS ?? '1000', 10);
const MAX_SAMPLES = Number.parseInt(process.env.MAX_METRIC_SAMPLES ?? '1000', 10);

const app = express();
app.use(cors());
app.use(express.json());

const metricsHistory = [];

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

if (!global.__metricsServerStarted) { global.__metricsServerStarted = true;
app.listen(PORT, () => {
  console.log(`Metrics server listening on port ${PORT}`);
});
}
