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

router.get('/history', async (req, res) => {
  try {
    const history = await getMetricsHistory();
    res.json(history);
  } catch (error) {
    console.error('Error retrieving metrics history:', error);
    res.status(500).json({ error: 'Failed to retrieve metrics history' });
  }
});

export default router;
