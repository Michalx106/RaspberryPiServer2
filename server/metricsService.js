import { EventEmitter } from 'node:events';

import si from 'systeminformation';

import { MAX_SAMPLES, SAMPLE_INTERVAL_MS } from './config.js';
import { appendSample, getRecentSamples } from './services/metricsHistoryStore.js';

const metricsEmitter = new EventEmitter();
metricsEmitter.setMaxListeners(0);

export const METRICS_SAMPLE_EVENT = 'sample';

export const subscribeToMetrics = (listener) => {
  metricsEmitter.on(METRICS_SAMPLE_EVENT, listener);
  return () => {
    metricsEmitter.off(METRICS_SAMPLE_EVENT, listener);
  };
};

export async function gatherMetrics() {
  const [load, memory, disks, temperature] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.cpuTemperature(),
  ]);

  const totalDiskBytes = disks.reduce((total, disk) => total + disk.size, 0);
  const usedDiskBytes = disks.reduce((total, disk) => total + disk.used, 0);

  return {
    timestamp: new Date().toISOString(),
    cpu: {
      load: load.currentLoad,
      cores: load.cpus?.map((cpu) => cpu.load) ?? [],
    },
    memory: {
      total: memory.total,
      available: memory.available,
      used: memory.total - memory.available,
      free: memory.free,
    },
    disk: {
      total: totalDiskBytes,
      used: usedDiskBytes,
      available: totalDiskBytes - usedDiskBytes,
    },
    temperature: {
      main: temperature.main,
      cores: temperature.cores,
      max: temperature.max,
    },
  };
}

export async function sampleAndStoreMetrics() {
  try {
    const sample = await gatherMetrics();
    await appendSample(sample);
    metricsEmitter.emit(METRICS_SAMPLE_EVENT, sample);
  } catch (error) {
    console.error('Failed to gather system metrics:', error);
  }
}

export async function getMetricsHistory() {
  const samples = await getRecentSamples(MAX_SAMPLES);

  return {
    intervalMs: SAMPLE_INTERVAL_MS,
    maxSamples: MAX_SAMPLES,
    samples,
  };
}

export function startMetricsSampling() {
  sampleAndStoreMetrics();
  return setInterval(sampleAndStoreMetrics, SAMPLE_INTERVAL_MS);
}
