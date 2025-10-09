import path from 'node:path';
import { fileURLToPath } from 'node:url';

const filePath = fileURLToPath(import.meta.url);
const directoryPath = path.dirname(filePath);

function getNumericConfig(
  envValue,
  defaultValue,
  minThreshold = -Infinity,
  maxThreshold = Infinity,
) {
  if (envValue == null || envValue === '') {
    return defaultValue;
  }

  const parsedValue = Number.parseInt(String(envValue).trim(), 10);

  if (
    !Number.isFinite(parsedValue) ||
    Number.isNaN(parsedValue) ||
    parsedValue < minThreshold ||
    parsedValue > maxThreshold
  ) {
    return defaultValue;
  }

  return parsedValue;
}

function getStringConfig(envValue, defaultValue) {
  if (envValue == null) {
    return defaultValue;
  }

  const trimmedValue = String(envValue).trim();
  return trimmedValue === '' ? defaultValue : trimmedValue;
}

function getPathConfig(envValue, defaultRelativePath) {
  const configuredValue = getStringConfig(envValue, defaultRelativePath);
  if (path.isAbsolute(configuredValue)) {
    return configuredValue;
  }

  return path.resolve(directoryPath, configuredValue);
}

export const PORT = getNumericConfig(process.env.PORT, 3000, 0, 65535);
export const SAMPLE_INTERVAL_MS = getNumericConfig(process.env.SAMPLE_INTERVAL_MS, 1000, 1);
export const MAX_SAMPLES = getNumericConfig(process.env.MAX_METRIC_SAMPLES, 1000, 1);
export const DEVICES_FILE_PATH = path.join(directoryPath, 'devices.json');
export const RACK_TEMPERATURE_SENSOR_URL = getStringConfig(
  process.env.RACK_TEMPERATURE_SENSOR_URL,
  'http://192.168.0.60/api',
);
export const METRICS_DB_PATH = getPathConfig(
  process.env.METRICS_DB_PATH,
  path.join('data', 'metrics-history.db'),
);
