import express from 'express';
import cors from 'cors';

import { PORT } from './config.js';
import { initializeDeviceStore } from './deviceStore.js';
import metricsRoutes from './routes/metricsRoutes.js';
import deviceRoutes from './routes/deviceRoutes.js';
import { startMetricsSampling } from './metricsService.js';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/metrics', metricsRoutes);
app.use('/api/devices', deviceRoutes);

await initializeDeviceStore();
startMetricsSampling();

if (!global.__metricsServerStarted) {
  global.__metricsServerStarted = true;
  app.listen(PORT, () => {
    console.log(`Metrics server listening on port ${PORT}`);
  });
}
