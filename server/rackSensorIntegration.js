export function getRackSensorIntegration(device) {
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

export async function fetchRackSensorPayload(deviceOrIntegration) {
  let baseUrl = '';

  if (
    deviceOrIntegration &&
    typeof deviceOrIntegration === 'object' &&
    'baseUrl' in deviceOrIntegration
  ) {
    const candidate = deviceOrIntegration.baseUrl;
    if (typeof candidate === 'string') {
      baseUrl = candidate.trim();
    }
    if (!baseUrl) {
      throw new Error('Rack sensor integration requires a baseUrl');
    }
  } else {
    ({ baseUrl } = getRackSensorIntegration(deviceOrIntegration));
  }

  let response;

  try {
    response = await fetch(baseUrl, {
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    throw new Error(
      `Failed to connect to rack temperature sensor at ${baseUrl}: ${error.message}`,
    );
  }

  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    throw new Error(
      `Rack temperature sensor at ${baseUrl} responded with ${response.status} ${response.statusText}: ${responseText}`,
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(
      `Rack temperature sensor at ${baseUrl} returned invalid JSON: ${error.message}`,
    );
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error(
      `Rack temperature sensor at ${baseUrl} returned an unexpected payload`,
    );
  }

  return payload;
}

export function extractRackSensorState(payload) {
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
