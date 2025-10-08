import { Router } from 'express';

import { findDeviceById, listDevices } from '../deviceStore.js';
import {
  DeviceActionValidationError,
  performDeviceAction,
  refreshAllDeviceStates,
} from '../services/deviceStateService.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    await refreshAllDeviceStates();
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
    const updatedDevice = await performDeviceAction(device, req.body ?? {});
    res.json(updatedDevice);
  } catch (error) {
    if (error instanceof DeviceActionValidationError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error(`Failed to update device ${deviceId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: `Failed to update device state: ${errorMessage}` });
  }
});

export default router;
