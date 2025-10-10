import { findDeviceById, listDevices, updateDeviceState } from '../deviceStore.js';
import {
  applyShellySwitchState,
  extractShellySwitchState,
  fetchShellySwitchState,
} from '../shellyIntegration.js';
const RACK_TEMPERATURE_SENSOR_ID = 'rack-temperature-sensor';

function getRackSensorIntegration(device) {
  const integration = device.integration;
  if (!integration || integration.type !== 'rack-sensor-http') {
    throw new Error('Rack sensor integration is not configured for this device');
  }

  const baseUrl =
    typeof integration.baseUrl === 'string' ? integration.baseUrl.trim() : '';

  if (!baseUrl) {
    throw new Error('Rack sensor integration requires a baseUrl');
  }

  return { baseUrl };
}

function normalizeRackSensorPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const statePatch = {};

  if (Number.isFinite(payload.temperature_c)) {
    statePatch.temperatureC = payload.temperature_c;
  }
  if (Number.isFinite(payload.humidity_pct)) {
    statePatch.humidityPercent = payload.humidity_pct;
  }
  if (Number.isFinite(payload.temperature_avg_c)) {
    statePatch.temperatureAvgC = payload.temperature_avg_c;
  }
  if (Number.isFinite(payload.humidity_avg_pct)) {
    statePatch.humidityAvgPercent = payload.humidity_avg_pct;
  }
  if (Number.isFinite(payload.avg_window)) {
    statePatch.avgWindow = payload.avg_window;
  }
  if (Number.isFinite(payload.avg_samples)) {
    statePatch.avgSamples = payload.avg_samples;
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

  return Object.keys(statePatch).length > 0 ? statePatch : null;
}

async function fetchRackSensorPayload({ baseUrl }) {
  let response;

  try {
    response = await fetch(baseUrl, {
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    console.warn(
      `Failed to connect to rack temperature sensor at ${baseUrl}:`,
      error,
    );
    return null;
  }

  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    console.warn(
      `Rack temperature sensor at ${baseUrl} responded with ${response.status} ${response.statusText}: ${responseText}`,
    );
    return null;
  }

  try {
    return await response.json();
  } catch (error) {
    console.warn('Rack temperature sensor returned invalid JSON payload:', error);
    return null;
  }
}

export async function refreshRackTemperatureSensor() {
  const device = findDeviceById(RACK_TEMPERATURE_SENSOR_ID);
  if (!device) {
    return;
  }

  let integration;

  try {
    integration = getRackSensorIntegration(device);
  } catch (error) {
    console.warn(
      `Rack temperature sensor ${device.id} is misconfigured: ${error.message}`,
    );
    return;
  }

  const payload = await fetchRackSensorPayload(integration);
  if (!payload) {
    return;
  }

  const statePatch = normalizeRackSensorPayload(payload);
  if (!statePatch) {
    console.warn('Rack temperature sensor returned an unexpected payload:', payload);
    return;
  }

  const existingState = device.state ?? {};
  const nextState = { ...existingState, ...statePatch };

  const hasChanges = Array.from(
    new Set([...Object.keys(existingState), ...Object.keys(nextState)]),
  ).some((key) => !Object.is(existingState[key], nextState[key]));

  if (!hasChanges) {
    return;
  }

  try {
    await updateDeviceState(device.id, () => nextState);
  } catch (error) {
    console.warn('Failed to persist rack temperature sensor state:', error);
  }
}

export async function refreshShellySwitchStates() {
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

export async function refreshAllDeviceStates() {
  await Promise.all([refreshShellySwitchStates(), refreshRackTemperatureSensor()]);
}

export class DeviceActionValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'DeviceActionValidationError';
    this.statusCode = statusCode;
  }
}

async function resolveShellySwitchDesiredState(device, { action, on }) {
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
        `Failed to read current state from Shelly device ${device.id}:`,
        statusError,
      );
    }
  }

  if (action === 'toggle') {
    desiredOn = !currentOn;
  } else if (typeof on === 'boolean') {
    desiredOn = on;
  } else {
    throw new DeviceActionValidationError(
      'Switch actions require { action: "toggle" } or { on: boolean }',
    );
  }

  return desiredOn;
}

async function applyShellySwitchUpdate(device, desiredOn) {
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
      `Failed to refresh state from Shelly device ${device.id} after update:`,
      statusError,
    );
  }

  const statePatch = { ...(latestState ?? {}) };
  if (typeof statePatch.on !== 'boolean') {
    statePatch.on = desiredOn;
  }

  return updateDeviceState(device.id, (state) => ({
    ...state,
    ...statePatch,
  }));
}

async function handleSwitchAction(device, payload) {
  const desiredOn = await resolveShellySwitchDesiredState(device, payload ?? {});

  if (device.integration?.type === 'shelly-gen3') {
    return applyShellySwitchUpdate(device, desiredOn);
  }

  return updateDeviceState(device.id, (state) => ({
    ...state,
    on: desiredOn,
  }));
}

async function handleDimmerAction(device, payload) {
  const parsedLevel = Number.parseInt(payload?.level, 10);
  if (!Number.isFinite(parsedLevel) || parsedLevel < 0 || parsedLevel > 100) {
    throw new DeviceActionValidationError(
      'Dimmer actions require a level between 0 and 100',
    );
  }

  return updateDeviceState(device.id, (state) => ({
    ...state,
    level: parsedLevel,
  }));
}

export async function performDeviceAction(device, payload) {
  switch (device.type) {
    case 'switch':
      return handleSwitchAction(device, payload);
    case 'dimmer':
      return handleDimmerAction(device, payload);
    case 'sensor':
      throw new DeviceActionValidationError('Sensor devices are read-only');
    default:
      throw new DeviceActionValidationError(
        `Device type "${device.type}" does not support actions`,
      );
  }
}
