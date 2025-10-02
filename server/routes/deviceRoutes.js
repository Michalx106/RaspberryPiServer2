import { Router } from 'express';

import { findDeviceById, listDevices, updateDeviceState } from '../deviceStore.js';
import {
  applyShellySwitchState,
  extractShellySwitchState,
  fetchShellySwitchState,
} from '../shellyIntegration.js';
import { RACK_TEMPERATURE_SENSOR_URL } from '../config.js';

const router = Router();

const RACK_TEMPERATURE_SENSOR_ID = 'rack-temperature-sensor';

async function refreshRackTemperatureSensor() {
  const device = findDeviceById(RACK_TEMPERATURE_SENSOR_ID);
  if (!device) {
    return;
  }

  let response;
  try {
    response = await fetch(RACK_TEMPERATURE_SENSOR_URL, {
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    console.warn(
      `Failed to connect to rack temperature sensor at ${RACK_TEMPERATURE_SENSOR_URL}:`,
      error,
    );
    return;
  }

  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    console.warn(
      `Rack temperature sensor at ${RACK_TEMPERATURE_SENSOR_URL} responded with ${response.status} ${response.statusText}: ${responseText}`,
    );
    return;
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    console.warn('Rack temperature sensor returned invalid JSON payload:', error);
    return;
  }

  if (!payload || typeof payload !== 'object') {
    console.warn('Rack temperature sensor returned an unexpected payload:', payload);
    return;
  }

  const existingState = device.state ?? {};
  const statePatch = {};

  if (Number.isFinite(payload.temperature_c)) {
    statePatch.temperatureC = payload.temperature_c;
  }

  if (Number.isFinite(payload.humidity_pct)) {
    statePatch.humidityPercent = payload.humidity_pct;
  }

  if (Number.isFinite(payload.uptime_ms)) {
    statePatch.uptimeMs = payload.uptime_ms;
  }

  if (typeof payload.stale === 'boolean') {
    statePatch.stale = payload.stale;
  }

  if (typeof payload.sensor === 'string' && payload.sensor.trim()) {
    statePatch.sensor = payload.sensor.trim();
  }

  if (typeof payload.pin === 'string' && payload.pin.trim()) {
    statePatch.pin = payload.pin.trim();
  }

  const nextState = { ...existingState, ...statePatch };
  const comparisonKeys = new Set([
    ...Object.keys(existingState),
    ...Object.keys(nextState),
  ]);

  const hasChanges = Array.from(comparisonKeys).some(
    (key) => !Object.is(existingState[key], nextState[key]),
  );

  if (!hasChanges) {
    return;
  }

  try {
    await updateDeviceState(device.id, () => nextState);
  } catch (error) {
    console.warn('Failed to persist rack temperature sensor state:', error);
  }
}

async function refreshShellySwitchStates() {
  const devices = listDevices();

  const shellySwitches = devices.filter(
    (device) => device.type === 'switch' && device.integration?.type === 'shelly-gen3',
  );

  await Promise.all(
    shellySwitches.map(async (device) => {
      try {
        const status = await fetchShellySwitchState(device);
        const parsedState = extractShellySwitchState(status);

        if (!parsedState || typeof parsedState.on !== 'boolean') {
          return;
        }

        const currentState = findDeviceById(device.id)?.state ?? {};
        const hasChanges = Object.entries(parsedState).some(
          ([key, value]) => currentState?.[key] !== value,
        );

        if (!hasChanges) {
          return;
        }

        await updateDeviceState(device.id, (state) => ({
          ...state,
          ...parsedState,
        }));
      } catch (error) {
        console.warn(`Failed to refresh state from Shelly device ${device.id}:`, error);
      }
    }),
  );
}

router.get('/', async (req, res) => {
  try {
    await Promise.all([refreshShellySwitchStates(), refreshRackTemperatureSensor()]);
  } catch (error) {
    console.warn('Unexpected error while refreshing device states:', error);
  }

  res.json(listDevices());
});

router.post('/:id/actions', async (req, res) => {
  const deviceId = req.params.id;
  const device = findDeviceById(deviceId);

  if (!device) {
    return res.status(404).json({ error: `Unknown device: ${deviceId}` });
  }

  try {
    let updatedDevice = device;

    switch (device.type) {
      case 'switch': {
        const { action, on } = req.body ?? {};
        let desiredOn;
        let currentOn = device.state?.on ?? false;

        if (device.integration?.type === 'shelly-gen3' && action === 'toggle') {
          try {
            const shellyStatus = await fetchShellySwitchState(device);
            const parsedState = extractShellySwitchState(shellyStatus);

            if (parsedState && typeof parsedState.on === 'boolean') {
              currentOn = parsedState.on;
            }
          } catch (statusError) {
            console.warn(
              `Failed to read current state from Shelly device ${deviceId}:`,
              statusError,
            );
          }
        }

        if (action === 'toggle') {
          desiredOn = !currentOn;
        } else if (typeof on === 'boolean') {
          desiredOn = on;
        } else {
          return res.status(400).json({
            error: 'Switch actions require { action: "toggle" } or { on: boolean }',
          });
        }

        if (device.integration?.type === 'shelly-gen3') {
          const shellyResult = await applyShellySwitchState(device, desiredOn);
          const immediateState = extractShellySwitchState(shellyResult);
          let latestState = immediateState ?? null;

          try {
            const shellyStatus = await fetchShellySwitchState(device);
            const refreshedState = extractShellySwitchState(shellyStatus);
            if (refreshedState) {
              latestState = { ...(latestState ?? {}), ...refreshedState };
            }
          } catch (statusError) {
            console.warn(
              `Failed to refresh state from Shelly device ${deviceId} after update:`,
              statusError,
            );
          }

          const statePatch = { ...(latestState ?? {}) };
          if (typeof statePatch.on !== 'boolean') {
            statePatch.on = desiredOn;
          }

          updatedDevice = await updateDeviceState(deviceId, (state) => ({
            ...state,
            ...statePatch,
          }));
        } else {
          updatedDevice = await updateDeviceState(deviceId, (state) => ({
            ...state,
            on: desiredOn,
          }));
        }
        break;
      }
      case 'dimmer': {
        const { level } = req.body ?? {};
        const parsedLevel = Number.parseInt(level, 10);
        if (!Number.isFinite(parsedLevel) || parsedLevel < 0 || parsedLevel > 100) {
          return res.status(400).json({
            error: 'Dimmer actions require a level between 0 and 100',
          });
        }

        updatedDevice = await updateDeviceState(deviceId, (state) => ({
          ...state,
          level: parsedLevel,
        }));
        break;
      }
      case 'sensor': {
        return res.status(400).json({ error: 'Sensor devices are read-only' });
      }
      default: {
        return res.status(400).json({
          error: `Device type "${device.type}" does not support actions`,
        });
      }
    }

    res.json(updatedDevice);
  } catch (error) {
    console.error(`Failed to update device ${deviceId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: `Failed to update device state: ${errorMessage}` });
  }
});

export default router;
