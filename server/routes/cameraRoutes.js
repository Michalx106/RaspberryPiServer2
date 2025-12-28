import express from 'express';

import { listDevices, findDeviceById } from '../deviceStore.js';
import {
  buildCamspot45Urls,
  getCamspot45Integration,
  getCamspot45Metadata,
  CameraIntegrationError,
} from '../cameraIntegration.js';

const router = express.Router();
const FETCH_TIMEOUT_MS = 10000; // 10 seconds timeout

function isCameraDevice(device) {
  return device?.type === 'camera' && device.integration?.type === 'camspot-45';
}

function buildBasicAuthHeader(username, password) {
  const encoded = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${encoded}`;
}

router.get('/', (req, res) => {
  try {
    const devices = listDevices();
    const cameras = devices
      .filter(isCameraDevice)
      .map((device) => {
        try {
          return getCamspot45Metadata(device);
        } catch (error) {
          console.error(`Error getting metadata for camera ${device.id}:`, error.message);
          return null;
        }
      })
      .filter(camera => camera !== null);

    console.log(`[Camera API] Returning ${cameras.length} cameras`);
    res.json({ cameras });
  } catch (error) {
    console.error('[Camera API] Error listing cameras:', error);
    res.status(500).json({ error: 'Failed to list cameras' });
  }
});

function notFound(res) {
  res.set('Cache-Control', 'no-store');
  res.status(404).json({ error: 'Camera not found' });
}

async function proxyCameraRequest(res, targetUrl, authorizationHeader, options = {}) {
  const { fallbackUrl, fallbackAuthorizationHeader, deviceId } = options;

  console.log(`[Camera ${deviceId}] Attempting to fetch from: ${targetUrl}`);
  console.log(`[Camera ${deviceId}] Using Basic Auth: ${authorizationHeader ? 'Yes' : 'No'}`);
  if (fallbackUrl) {
    console.log(`[Camera ${deviceId}] Fallback URL available: ${fallbackUrl}`);
  }

  async function performFetch(url, header, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = {};
      if (header) {
        headers.Authorization = header;
      }

      console.log(`[Camera ${deviceId}] Fetching: ${url}`);
      const response = await fetch(url, { 
        headers,
        signal: controller.signal 
      });
      
      clearTimeout(timeoutId);
      console.log(`[Camera ${deviceId}] Response status: ${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      console.error(`[Camera ${deviceId}] Fetch error:`, error.message);
      throw error;
    }
  }

  try {
    let response;
    let usedFallback = false;

    try {
      response = await performFetch(targetUrl, authorizationHeader);
    } catch (error) {
      console.log(`[Camera ${deviceId}] Primary URL failed, trying fallback...`);
      // Try fallback only on connection error, not on HTTP errors
      if (fallbackUrl && fallbackUrl !== targetUrl) {
        try {
          response = await performFetch(fallbackUrl, fallbackAuthorizationHeader);
          usedFallback = true;
          console.log(`[Camera ${deviceId}] Fallback succeeded`);
        } catch (fallbackError) {
          console.error(`[Camera ${deviceId}] Fallback also failed:`, fallbackError.message);
          throw error; // Throw original error if fallback also fails
        }
      } else {
        throw error;
      }
    }

    // Try fallback on 401 only if we haven't used it yet
    if (!usedFallback && response.status === 401 && fallbackUrl && fallbackUrl !== targetUrl) {
      console.log(`[Camera ${deviceId}] Got 401, trying fallback URL with embedded credentials...`);
      try {
        const fallbackResponse = await performFetch(fallbackUrl, fallbackAuthorizationHeader);
        // Only use fallback response if it's successful
        if (fallbackResponse.ok) {
          response = fallbackResponse;
          console.log(`[Camera ${deviceId}] Fallback with credentials succeeded`);
        } else {
          console.log(`[Camera ${deviceId}] Fallback returned ${fallbackResponse.status}, keeping original response`);
        }
      } catch (error) {
        console.log(`[Camera ${deviceId}] Fallback threw error, keeping original response`);
        // Keep original response if fallback fails
      }
    }

    res.set('Cache-Control', 'no-store');

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      const message = errorBody || `Camera request failed with status ${response.status}`;
      console.error(`[Camera ${deviceId}] Request failed: ${response.status} - ${errorBody.substring(0, 200)}`);
      res.status(response.status).send(message);
      return;
    }

    const contentType = response.headers.get('content-type');
    const contentLength = response.headers.get('content-length');
    
    console.log(`[Camera ${deviceId}] Success! Content-Type: ${contentType}, Length: ${contentLength || 'unknown'}`);
    
    if (contentType) {
      res.set('Content-Type', contentType);
    }
    if (contentLength) {
      res.set('Content-Length', contentLength);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    console.log(`[Camera ${deviceId}] Sending ${buffer.length} bytes to client`);
    res.send(buffer);
  } catch (error) {
    res.set('Cache-Control', 'no-store');
    
    console.error(`[Camera ${deviceId}] Final error:`, error);
    
    // Provide more specific error messages
    if (error.name === 'AbortError') {
      res.status(504).json({ error: 'Camera request timeout' });
    } else if (error.code === 'ECONNREFUSED') {
      res.status(502).json({ 
        error: 'Connection refused by camera',
        details: 'Camera is unreachable or not responding' 
      });
    } else if (error.code === 'ENOTFOUND') {
      res.status(502).json({ 
        error: 'Camera host not found',
        details: 'Check camera IP address' 
      });
    } else {
      res.status(502).json({ 
        error: 'Failed to fetch data from camera',
        details: error.message 
      });
    }
  }
}

router.get('/:id/snapshot', async (req, res) => {
  const device = findDeviceById(req.params.id);
  console.log(`[Camera API] Snapshot request for device: ${req.params.id}`);
  
  if (!device) {
    console.log(`[Camera API] Device ${req.params.id} not found`);
    notFound(res);
    return;
  }
  
  if (!isCameraDevice(device)) {
    console.log(`[Camera API] Device ${req.params.id} is not a camera (type: ${device.type})`);
    notFound(res);
    return;
  }

  let integration;
  try {
    integration = getCamspot45Integration(device);
    console.log(`[Camera API] Camera ${device.id} integration:`, {
      ip: integration.ip,
      httpPort: integration.httpPort,
      snapshotPath: integration.snapshotPath,
      username: integration.username,
      passwordLength: integration.password?.length
    });
  } catch (error) {
    if (error instanceof CameraIntegrationError) {
      console.error(`[Camera API] Configuration error for ${device.id}:`, error.message);
      res.set('Cache-Control', 'no-store');
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  const { snapshotUrl } = buildCamspot45Urls(integration);
  const { snapshotUrl: snapshotUrlWithCredentials } = buildCamspot45Urls(integration, {
    includeSnapshotCredentials: true,
  });
  const authorizationHeader = buildBasicAuthHeader(
    integration.username,
    integration.password,
  );

  await proxyCameraRequest(res, snapshotUrl, authorizationHeader, {
    fallbackUrl: snapshotUrlWithCredentials,
    fallbackAuthorizationHeader: undefined,
    deviceId: device.id,
  });
});

router.get('/:id/stream', async (req, res) => {
  const device = findDeviceById(req.params.id);
  console.log(`[Camera API] Stream request for device: ${req.params.id}`);
  
  if (!device) {
    console.log(`[Camera API] Device ${req.params.id} not found`);
    notFound(res);
    return;
  }
  
  if (!isCameraDevice(device)) {
    console.log(`[Camera API] Device ${req.params.id} is not a camera`);
    notFound(res);
    return;
  }

  let integration;
  try {
    integration = getCamspot45Integration(device);
  } catch (error) {
    if (error instanceof CameraIntegrationError) {
      console.error(`[Camera API] Configuration error:`, error.message);
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
    const rtspUrlWithCreds = buildCamspot45Urls(integration, { includeCredentials: true }).streamUrl;
    console.log(`[Camera API] RTSP stream cannot be proxied, returning direct URL`);
    res.set('Cache-Control', 'no-store');
    res.status(501).json({
      error: 'RTSP streams cannot be proxied over HTTP. Use the direct RTSP URL.',
      streamUrl: rtspUrlWithCreds,
    });
    return;
  }

  await proxyCameraRequest(res, streamUrl, authorizationHeader, {
    deviceId: device.id,
  });
});

export default router;
