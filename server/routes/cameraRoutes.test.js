import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import express from 'express';
import { test } from 'node:test';

import cameraRoutes from './cameraRoutes.js';
import { DEVICES_FILE_PATH } from '../config.js';
import { initializeDeviceStore } from '../deviceStore.js';

async function withCameraDevices(devices, fn) {
  const originalDevices = await readFile(DEVICES_FILE_PATH, 'utf-8');
  await writeFile(DEVICES_FILE_PATH, `${JSON.stringify(devices, null, 2)}\n`, 'utf-8');
  await initializeDeviceStore();

  try {
    await fn();
  } finally {
    await writeFile(DEVICES_FILE_PATH, originalDevices, 'utf-8');
    await initializeDeviceStore();
  }
}

test('GET /api/cameras returns camera metadata', async (t) => {
  await withCameraDevices(
    [
      {
        id: 'cam-1',
        name: 'Test Camera',
        type: 'camera',
        integration: {
          type: 'camspot-45',
          ip: '192.168.50.20',
          username: 'admin',
          password: '123456',
        },
      },
      {
        id: 'switch-1',
        name: 'Switch',
        type: 'switch',
      },
    ],
    async () => {
      const app = express();
      app.use('/api/cameras', cameraRoutes);
      const server = app.listen(0);
      t.after(() => server.close());

      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}/api/cameras`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.ok(Array.isArray(body.cameras));
      assert.equal(body.cameras.length, 1);

      const camera = body.cameras[0];
      assert.equal(camera.id, 'cam-1');
      assert.equal(camera.integration.type, 'camspot-45');
      assert.equal(camera.integration.username, 'admin');
      assert.ok(!('password' in camera.integration));
      assert.equal(camera.thumbnailUrl, '/api/cameras/cam-1/snapshot');
      assert.equal(
        camera.streamUrl,
        'rtsp://admin:123456@192.168.50.20/live/ch0',
      );
      assert.equal(camera.streamType, 'rtsp');
      assert.equal(camera.urls.snapshot, 'http://192.168.50.20/tmpfs/auto.jpg');
      assert.equal(
        camera.urls.snapshotWithCredentials,
        'http://admin:123456@192.168.50.20/tmpfs/auto.jpg',
      );
      assert.equal(camera.urls.stream, 'rtsp://admin:123456@192.168.50.20/live/ch0');
      assert.equal(camera.urls.snapshotProxy, '/api/cameras/cam-1/snapshot');
    },
  );
});

test('GET /api/cameras/:id/snapshot returns 502 when camera is unreachable', async (t) => {
  const originalFetch = global.fetch;

  await withCameraDevices(
    [
      {
        id: 'cam-1',
        name: 'Test Camera',
        type: 'camera',
        integration: {
          type: 'camspot-45',
          ip: '192.168.50.20',
          username: 'admin',
          password: '123456',
        },
      },
    ],
    async () => {
      const app = express();
      app.use('/api/cameras', cameraRoutes);
      const server = app.listen(0);

      global.fetch = async (input, init) => {
        if (typeof input === 'string' && input.includes('192.168.50.20')) {
          throw new Error('connect ECONNREFUSED');
        }
        return originalFetch(input, init);
      };

      t.after(() => {
        server.close();
        global.fetch = originalFetch;
      });

      const { port } = server.address();
      const response = await originalFetch(
        `http://127.0.0.1:${port}/api/cameras/cam-1/snapshot`,
      );
      assert.equal(response.status, 502);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const body = await response.json();
      assert.deepEqual(body, { error: 'Failed to fetch data from camera' });
    },
  );
  global.fetch = originalFetch;
});

test('GET /api/cameras/:id/snapshot retries with embedded credentials after 401', async (t) => {
  const originalFetch = global.fetch;

  await withCameraDevices(
    [
      {
        id: 'cam-1',
        name: 'Test Camera',
        type: 'camera',
        integration: {
          type: 'camspot-45',
          ip: '192.168.50.20',
          username: 'admin',
          password: '123456',
        },
      },
    ],
    async () => {
      const app = express();
      app.use('/api/cameras', cameraRoutes);
      const server = app.listen(0);

      let callCount = 0;
      global.fetch = async (input, init = {}) => {
        if (typeof input === 'string' && input.includes('192.168.50.20')) {
          callCount += 1;
          if (callCount === 1) {
            assert.equal(init.headers.Authorization, 'Basic YWRtaW46MTIzNDU2');
            return new Response('Unauthorized', {
              status: 401,
              headers: { 'content-type': 'text/plain' },
            });
          }

          assert.ok(input.includes('admin:123456@'));
          const authHeader = init.headers?.get
            ? init.headers.get('Authorization')
            : init.headers?.Authorization;
          assert.equal(authHeader, undefined);
          const body = new Uint8Array([0xff, 0xd8, 0xff]);
          return new Response(body, {
            status: 200,
            headers: {
              'content-type': 'image/jpeg',
              'content-length': String(body.length),
            },
          });
        }

        return originalFetch(input, init);
      };

      t.after(() => {
        server.close();
        global.fetch = originalFetch;
      });

      const { port } = server.address();
      const response = await originalFetch(
        `http://127.0.0.1:${port}/api/cameras/cam-1/snapshot`,
      );

      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('content-type'), 'image/jpeg');
      assert.equal(response.headers.get('content-length'), '3');
      const buffer = new Uint8Array(await response.arrayBuffer());
      assert.deepEqual(Array.from(buffer), [0xff, 0xd8, 0xff]);
      assert.equal(callCount, 2);
    },
  );

  global.fetch = originalFetch;
});

test('GET /api/cameras/:id/snapshot retries with embedded credentials when fetch throws', async (t) => {
  const originalFetch = global.fetch;

  await withCameraDevices(
    [
      {
        id: 'cam-1',
        name: 'Test Camera',
        type: 'camera',
        integration: {
          type: 'camspot-45',
          ip: '192.168.50.20',
          username: 'admin',
          password: '123456',
        },
      },
    ],
    async () => {
      const app = express();
      app.use('/api/cameras', cameraRoutes);
      const server = app.listen(0);

      let callCount = 0;
      global.fetch = async (input, init = {}) => {
        if (typeof input === 'string' && input.includes('192.168.50.20')) {
          callCount += 1;
          if (callCount === 1) {
            assert.equal(init.headers.Authorization, 'Basic YWRtaW46MTIzNDU2');
            throw new Error('connect ECONNREFUSED');
          }

          assert.ok(input.includes('admin:123456@'));
          const authHeader = init.headers?.get
            ? init.headers.get('Authorization')
            : init.headers?.Authorization;
          assert.equal(authHeader, undefined);
          const body = new Uint8Array([0xff, 0xd8, 0xff]);
          return new Response(body, {
            status: 200,
            headers: {
              'content-type': 'image/jpeg',
            },
          });
        }

        return originalFetch(input, init);
      };

      t.after(() => {
        server.close();
        global.fetch = originalFetch;
      });

      const { port } = server.address();
      const response = await originalFetch(
        `http://127.0.0.1:${port}/api/cameras/cam-1/snapshot`,
      );

      assert.equal(response.status, 200);
      const buffer = new Uint8Array(await response.arrayBuffer());
      assert.deepEqual(Array.from(buffer), [0xff, 0xd8, 0xff]);
      assert.equal(callCount, 2);
    },
  );

  global.fetch = originalFetch;
});
