import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { test } from 'node:test';

import { DEVICES_FILE_PATH } from '../config.js';
import {
  findDeviceById,
  initializeDeviceStore,
  updateDeviceState,
} from '../deviceStore.js';

test('rack sensor refresh preserves existing state fields from store', async (t) => {
  const deviceId = 'rack-sensor-1';
  const originalDevices = await readFile(DEVICES_FILE_PATH, 'utf-8');

  const testDevices = [
    {
      id: deviceId,
      name: 'Rack Sensor',
      type: 'sensor',
      integration: { type: 'rack-sensor-http', ip: '192.168.1.2' },
      state: { temperatureC: 20 },
    },
  ];

  await writeFile(
    DEVICES_FILE_PATH,
    `${JSON.stringify(testDevices, null, 2)}\n`,
    'utf-8',
  );
  await initializeDeviceStore();

  const originalFetch = global.fetch;
  global.fetch = async () => {
    await updateDeviceState(deviceId, (state) => ({
      ...state,
      extraField: 'persist-me',
    }));

    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ temperature_c: 25 }),
      text: async () => '',
    };
  };

  t.after(async () => {
    global.fetch = originalFetch;
    await writeFile(DEVICES_FILE_PATH, originalDevices, 'utf-8');
    await initializeDeviceStore();
  });

  const { refreshRackTemperatureSensors } = await import('./deviceStateService.js');

  await refreshRackTemperatureSensors();

  const liveDevice = findDeviceById(deviceId);

  assert.deepEqual(liveDevice.state, {
    temperatureC: 25,
    extraField: 'persist-me',
  });
});
