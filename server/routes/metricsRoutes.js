import { Router } from 'express';

import { gatherMetrics, getMetricsHistory } from '../metricsService.js';

const router = Router();

router.get('/current', async (req, res) => {
  try {
    const metrics = await gatherMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Error retrieving current metrics:', error);
    res.status(500).json({ error: 'Failed to retrieve current metrics' });
  }
});

router.get('/history', (req, res) => {
  res.json(getMetricsHistory());
});

export default router;
