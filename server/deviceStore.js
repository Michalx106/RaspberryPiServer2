import { readFile, writeFile } from 'node:fs/promises';

import { DEVICES_FILE_PATH } from './config.js';

let devices = [];
const devicesById = new Map();

function cloneState(state) {
  if (Array.isArray(state)) {
    return state.map((item) => cloneState(item));
  }

  if (!state || typeof state !== 'object') {
    return state;
  }

  return Object.fromEntries(
    Object.entries(state).map(([key, value]) => [key, cloneState(value)]),
  );
}

function cloneDevice(device) {
  return {
    ...device,
    state: cloneState(device.state),
  };
}

function statesAreEqual(previousState, nextState) {
  if (Object.is(previousState, nextState)) {
    return true;
  }

  if (Array.isArray(previousState) && Array.isArray(nextState)) {
    if (previousState.length !== nextState.length) {
      return false;
    }

    return previousState.every((value, index) =>
      statesAreEqual(value, nextState[index]),
    );
  }

  if (
    !previousState ||
    typeof previousState !== 'object' ||
    !nextState ||
    typeof nextState !== 'object'
  ) {
    return false;
  }

  const previousKeys = Object.keys(previousState);
  const nextKeys = Object.keys(nextState);

  if (previousKeys.length !== nextKeys.length) {
    return false;
  }

  return previousKeys.every((key) =>
    Object.prototype.hasOwnProperty.call(nextState, key) &&
    statesAreEqual(previousState[key], nextState[key]),
  );
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
  const previousStateSnapshot = cloneState(existingDevice.state);
  const draftState =
    existingDevice.state && typeof existingDevice.state === 'object'
      ? cloneState(existingDevice.state)
      : {};
  const nextState = mutator(draftState);
  const effectiveNextState =
    nextState && typeof nextState === 'object' ? cloneState(nextState) : nextState;

  if (statesAreEqual(previousStateSnapshot, effectiveNextState)) {
    return cloneDevice(existingDevice);
  }

  const updatedDevice = {
    ...existingDevice,
    state: effectiveNextState,
  };

  devices.splice(index, 1, updatedDevice);
  devicesById.set(deviceId, updatedDevice);

  await persistDevicesToDisk();
  return cloneDevice(updatedDevice);
}
