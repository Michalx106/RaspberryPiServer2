import { readFile, writeFile } from 'node:fs/promises';

import { DEVICES_FILE_PATH } from './config.js';

let devices = [];
const devicesById = new Map();

function cloneDevice(device) {
  return {
    ...device,
    state: device.state ? { ...device.state } : device.state,
  };
}

function syncDeviceCache(freshDevices) {
  devices = freshDevices.map(cloneDevice);
  devicesById.clear();
  for (const device of devices) {
    devicesById.set(device.id, device);
  }
}

async function loadDevicesFromDisk() {
  const fileContents = await readFile(DEVICES_FILE_PATH, 'utf-8');
  const parsed = JSON.parse(fileContents);

  if (!Array.isArray(parsed)) {
    throw new Error('Device configuration file must contain an array');
  }

  syncDeviceCache(parsed);
}

async function persistDevicesToDisk() {
  const serialized = JSON.stringify(devices, null, 2);
  await writeFile(DEVICES_FILE_PATH, `${serialized}\n`, 'utf-8');
}

export async function initializeDeviceStore() {
  try {
    await loadDevicesFromDisk();
  } catch (error) {
    console.error('Failed to load device configuration:', error);
    syncDeviceCache([]);
  }
}

export function listDevices() {
  return devices.map(cloneDevice);
}

export function findDeviceById(deviceId) {
  return devicesById.get(deviceId);
}

export async function updateDeviceState(deviceId, mutator) {
  const index = devices.findIndex((device) => device.id === deviceId);
  if (index === -1) {
    throw new Error('Device not found');
  }

  const existingDevice = devices[index];
  const nextState = mutator({ ...(existingDevice.state ?? {}) });

  const updatedDevice = {
    ...existingDevice,
    state: nextState,
  };

  devices.splice(index, 1, updatedDevice);
  devicesById.set(deviceId, updatedDevice);

  await persistDevicesToDisk();
  return cloneDevice(updatedDevice);
}
