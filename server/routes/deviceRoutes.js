import { Router } from 'express';

import { findDeviceById, listDevices, updateDeviceState } from '../deviceStore.js';
import { applyShellySwitchState, fetchShellySwitchState } from '../shellyIntegration.js';

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
        let currentOn = device.state?.on ?? false;

        if (device.integration?.type === 'shelly-gen3' && action === 'toggle') {
          try {
            const shellyStatus = await fetchShellySwitchState(device);
            if (shellyStatus && typeof shellyStatus.output === 'boolean') {
              currentOn = shellyStatus.output;
            } else if (shellyStatus && typeof shellyStatus.on === 'boolean') {
              currentOn = shellyStatus.on;
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
          let shellyOn = desiredOn;
          const extraState = {};

          const mergeShellyPayload = (payload) => {
            if (!payload || typeof payload !== 'object') {
              return;
            }

            const {
              source,
              timer_started,
              timer_duration,
              has_timer,
              timer_remaining,
            } = payload;

            if (typeof payload.output === 'boolean') {
              shellyOn = payload.output;
            } else if (typeof payload.on === 'boolean') {
              shellyOn = payload.on;
            }

            if (source !== undefined) {
              extraState.source = source;
            }
            if (timer_started !== undefined) {
              extraState.timer_started = timer_started;
            }
            if (timer_duration !== undefined) {
              extraState.timer_duration = timer_duration;
            }
            if (timer_remaining !== undefined) {
              extraState.timer_remaining = timer_remaining;
            }
            if (has_timer !== undefined) {
              extraState.has_timer = has_timer;
            }
          };

          mergeShellyPayload(shellyResult);

          try {
            const shellyStatus = await fetchShellySwitchState(device);
            mergeShellyPayload(shellyStatus);
          } catch (statusError) {
            console.warn(
              `Failed to refresh state from Shelly device ${deviceId} after update:`,
              statusError,
            );
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
