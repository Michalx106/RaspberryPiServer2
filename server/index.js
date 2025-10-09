import express from 'express';
import cors from 'cors';

import { PORT } from './config.js';
import { initializeDeviceStore } from './deviceStore.js';
import metricsRoutes from './routes/metricsRoutes.js';
import metricsStreamRoutes from './routes/metricsStreamRoutes.js';
import deviceRoutes from './routes/deviceRoutes.js';
import { startMetricsSampling } from './metricsService.js';
import { initializeMetricsHistoryStore } from './services/metricsHistoryStore.js';

const app = express();
app.disable('etag');
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.use('/api/metrics', metricsRoutes);
app.use('/api/metrics', metricsStreamRoutes);
app.use('/api/devices', deviceRoutes);

await initializeDeviceStore();
await initializeMetricsHistoryStore();
startMetricsSampling();

if (!global.__metricsServerStarted) {
  global.__metricsServerStarted = true;
  app.listen(PORT, () => {
    console.log(`Metrics server listening on port ${PORT}`);
  });
}
