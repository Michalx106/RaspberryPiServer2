import { Router } from 'express';

import {
  getMetricsHistory,
  subscribeToMetrics,
} from '../metricsService.js';

const router = Router();

const sendEvent = (res, eventName, payload) => {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

router.get('/stream', async (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  res.flushHeaders?.();

  const heartbeatInterval = setInterval(() => {
    res.write(`event: heartbeat\n`);
    res.write(`data: ${Date.now()}\n\n`);
  }, 25000);

  try {
    const history = await getMetricsHistory();
    sendEvent(res, 'history', history);
  } catch (error) {
    console.error('Failed to deliver metrics history to stream client:', error);
    sendEvent(res, 'stream-error', { message: 'Failed to load metrics history.' });
  }

  const unsubscribe = subscribeToMetrics((sample) => {
    sendEvent(res, 'sample', sample);
  });

  req.on('close', () => {
    clearInterval(heartbeatInterval);
    unsubscribe();
    res.end();
  });
});

export default router;
