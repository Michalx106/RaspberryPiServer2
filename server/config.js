import path from 'node:path';
import { fileURLToPath } from 'node:url';

const filePath = fileURLToPath(import.meta.url);
const directoryPath = path.dirname(filePath);

export const PORT = Number(process.env.PORT) || 3000;
export const SAMPLE_INTERVAL_MS = Number.parseInt(process.env.SAMPLE_INTERVAL_MS ?? '1000', 10);
export const MAX_SAMPLES = Number.parseInt(process.env.MAX_METRIC_SAMPLES ?? '1000', 10);
export const DEVICES_FILE_PATH = path.join(directoryPath, 'devices.json');
