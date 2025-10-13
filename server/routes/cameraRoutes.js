import express from 'express';

import { listDevices, findDeviceById } from '../deviceStore.js';
import {
  buildCamspot45Urls,
  getCamspot45Integration,
  getCamspot45Metadata,
  CameraIntegrationError,
} from '../cameraIntegration.js';

const router = express.Router();

function isCameraDevice(device) {
  return device?.type === 'camera' && device.integration?.type === 'camspot-45';
}

function buildBasicAuthHeader(username, password) {
  const encoded = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${encoded}`;
}

router.get('/', (req, res) => {
  const devices = listDevices();
  const cameras = devices
    .filter(isCameraDevice)
    .map((device) => getCamspot45Metadata(device));

  res.json({ cameras });
});

function notFound(res) {
  res.set('Cache-Control', 'no-store');
  res.status(404).json({ error: 'Camera not found' });
}

async function proxyCameraRequest(res, targetUrl, authorizationHeader) {
  try {
    const response = await fetch(targetUrl, {
      headers: { Authorization: authorizationHeader },
    });

    res.set('Cache-Control', 'no-store');

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      const message = errorBody || `Camera request failed with status ${response.status}`;
      res.status(response.status).send(message);
      return;
    }

    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.set('Content-Type', contentType);
    }
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      res.set('Content-Length', contentLength);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (error) {
    res.set('Cache-Control', 'no-store');
    res.status(502).json({ error: 'Failed to fetch data from camera' });
  }
}

router.get('/:id/snapshot', async (req, res) => {
  const device = findDeviceById(req.params.id);
  if (!isCameraDevice(device)) {
    notFound(res);
    return;
  }

  let integration;
  try {
    integration = getCamspot45Integration(device);
  } catch (error) {
    if (error instanceof CameraIntegrationError) {
      res.set('Cache-Control', 'no-store');
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  const { snapshotUrl } = buildCamspot45Urls(integration);
  const authorizationHeader = buildBasicAuthHeader(
    integration.username,
    integration.password,
  );

  await proxyCameraRequest(res, snapshotUrl, authorizationHeader);
});

router.get('/:id/stream', async (req, res) => {
  const device = findDeviceById(req.params.id);
  if (!isCameraDevice(device)) {
    notFound(res);
    return;
  }

  let integration;
  try {
    integration = getCamspot45Integration(device);
  } catch (error) {
    if (error instanceof CameraIntegrationError) {
      res.set('Cache-Control', 'no-store');
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  const { streamUrl } = buildCamspot45Urls(integration, { includeCredentials: false });
  const authorizationHeader = buildBasicAuthHeader(
    integration.username,
    integration.password,
  );

  if (streamUrl.startsWith('rtsp://')) {
    res.set('Cache-Control', 'no-store');
    res.status(501).json({
      error: 'RTSP streams cannot be proxied over HTTP. Use the direct RTSP URL.',
      streamUrl: buildCamspot45Urls(integration, { includeCredentials: true }).streamUrl,
    });
    return;
  }

  await proxyCameraRequest(res, streamUrl, authorizationHeader);
});

export default router;
