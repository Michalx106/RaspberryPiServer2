import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildCamspot45Urls,
  getCamspot45Integration,
  getCamspot45Metadata,
  CameraIntegrationError,
} from './cameraIntegration.js';

test('camspot integration defaults match Camspot 4.5 documentation', () => {
  const device = {
    id: 'cam-1',
    type: 'camera',
    integration: {
      type: 'camspot-45',
      ip: '192.168.0.150',
      username: 'admin',
      password: '123456',
    },
  };

  const integration = getCamspot45Integration(device);
  assert.equal(integration.snapshotPath, '/tmpfs/auto.jpg');
  assert.equal(integration.streamPath, '/live/ch0');
  assert.equal(integration.httpPort, 80);
  assert.equal(integration.rtspPort, 554);

  const urls = buildCamspot45Urls(integration);
  assert.equal(urls.snapshotUrl, 'http://192.168.0.150/tmpfs/auto.jpg');

  const urlsWithCredentials = buildCamspot45Urls(integration, { includeCredentials: true });
  assert.equal(urlsWithCredentials.streamUrl, 'rtsp://admin:123456@192.168.0.150/live/ch0');
  assert.equal(urls.streamUrl, 'rtsp://192.168.0.150/live/ch0');
});

test('camspot metadata exposes backward compatible snapshot and stream fields', () => {
  const device = {
    id: 'cam-1',
    name: 'Balkon',
    type: 'camera',
    integration: {
      type: 'camspot-45',
      ip: '192.168.0.150',
      username: 'admin',
      password: '123456',
    },
  };

  const metadata = getCamspot45Metadata(device);
  assert.equal(metadata.thumbnailUrl, '/api/cameras/cam-1/snapshot');
  assert.equal(metadata.streamUrl, '/api/cameras/cam-1/stream');
  assert.equal(metadata.streamType, 'rtsp');
  assert.equal(metadata.urls.snapshotProxy, '/api/cameras/cam-1/snapshot');
  assert.equal(metadata.urls.streamProxy, '/api/cameras/cam-1/stream');
  assert.equal(metadata.urls.stream, 'rtsp://admin:123456@192.168.0.150/live/ch0');
  assert.equal(metadata.urls.streamNoAuth, 'rtsp://192.168.0.150/live/ch0');
});

test('camspot integration accepts overrides for ports and paths', () => {
  const device = {
    id: 'cam-override',
    type: 'camera',
    integration: {
      type: 'camspot-45',
      ip: '10.0.0.2',
      username: 'admin',
      password: '123456',
      httpPort: 8080,
      rtspPort: 8554,
      snapshotPath: 'custom/snap.jpg',
      streamPath: 'rtsp/custom',
    },
  };

  const integration = getCamspot45Integration(device);
  assert.equal(integration.snapshotPath, '/custom/snap.jpg');
  assert.equal(integration.streamPath, '/rtsp/custom');
  assert.equal(integration.httpPort, 8080);
  assert.equal(integration.rtspPort, 8554);

  const urls = buildCamspot45Urls(integration, { includeCredentials: true });
  assert.equal(urls.snapshotUrl, 'http://10.0.0.2:8080/custom/snap.jpg');
  assert.equal(urls.streamUrl, 'rtsp://admin:123456@10.0.0.2:8554/rtsp/custom');
});

test('camspot integration keeps absolute RTSP overrides untouched', () => {
  const device = {
    id: 'cam-absolute',
    type: 'camera',
    integration: {
      type: 'camspot-45',
      ip: '10.0.0.3',
      username: 'admin',
      password: '123456',
      streamPath: 'rtsp://example.com:9000/stream',
    },
  };

  const integration = getCamspot45Integration(device);
  const urls = buildCamspot45Urls(integration);
  assert.equal(urls.streamUrl, 'rtsp://example.com:9000/stream');
});

test('camspot integration validation requires ip, username, and password', () => {
  const baseDevice = {
    id: 'invalid-cam',
    type: 'camera',
    integration: { type: 'camspot-45' },
  };

  assert.throws(() => getCamspot45Integration(baseDevice), CameraIntegrationError);

  assert.throws(
    () =>
      getCamspot45Integration({
        ...baseDevice,
        integration: { type: 'camspot-45', ip: '192.168.1.2' },
      }),
    CameraIntegrationError,
  );

  assert.throws(
    () =>
      getCamspot45Integration({
        ...baseDevice,
        integration: {
          type: 'camspot-45',
          ip: '192.168.1.2',
          username: 'admin',
        },
      }),
    CameraIntegrationError,
  );
});
