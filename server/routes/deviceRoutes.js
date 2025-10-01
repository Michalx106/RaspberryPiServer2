import { Router } from 'express';

import { findDeviceById, listDevices, updateDeviceState } from '../deviceStore.js';
import { applyShellySwitchState } from '../shellyIntegration.js';

const router = Router();

router.get('/', (req, res) => {
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

        if (action === 'toggle') {
          desiredOn = !(device.state?.on ?? false);
        } else if (typeof on === 'boolean') {
          desiredOn = on;
        } else {
          return res.status(400).json({
            error: 'Switch actions require { action: "toggle" } or { on: boolean }',
          });
        }

        if (device.integration?.type === 'shelly-gen3') {
          const shellyResult = await applyShellySwitchState(device, desiredOn);
          const shellyOn = typeof shellyResult.on === 'boolean' ? shellyResult.on : desiredOn;
          const extraState = {};

          if (shellyResult && typeof shellyResult === 'object') {
            const { source, timer_started, timer_duration, has_timer } = shellyResult;
            if (source !== undefined) {
              extraState.source = source;
            }
            if (timer_started !== undefined) {
              extraState.timer_started = timer_started;
            }
            if (timer_duration !== undefined) {
              extraState.timer_duration = timer_duration;
            }
            if (has_timer !== undefined) {
              extraState.has_timer = has_timer;
            }
          }

          updatedDevice = await updateDeviceState(deviceId, (state) => ({
            ...state,
            ...extraState,
            on: shellyOn,
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
