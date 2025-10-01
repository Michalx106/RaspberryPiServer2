import path from 'node:path';
import { fileURLToPath } from 'node:url';

const filePath = fileURLToPath(import.meta.url);
const directoryPath = path.dirname(filePath);

function getNumericConfig(envValue, defaultValue, minThreshold = -Infinity) {
  if (envValue == null || envValue === '') {
    return defaultValue;
  }

  const parsedValue = Number.parseInt(String(envValue).trim(), 10);

  if (!Number.isFinite(parsedValue) || Number.isNaN(parsedValue) || parsedValue < minThreshold) {
    return defaultValue;
  }

  return parsedValue;
}

export const PORT = Number(process.env.PORT) || 3000;
export const SAMPLE_INTERVAL_MS = getNumericConfig(process.env.SAMPLE_INTERVAL_MS, 1000, 1);
export const MAX_SAMPLES = getNumericConfig(process.env.MAX_METRIC_SAMPLES, 1000, 1);
export const DEVICES_FILE_PATH = path.join(directoryPath, 'devices.json');
