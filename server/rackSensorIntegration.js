function normalizeRackSensorIntegration(rawIp) {
  const ip = typeof rawIp === 'string' ? rawIp.trim() : '';

  if (!ip) {
    throw new Error('Rack sensor integration requires an IP address');
  }

  const hasProtocol = /^[a-z]+:\/\//i.test(ip);
  const base = hasProtocol ? ip : `http://${ip}`;
  const trimmedBase = base.replace(/\/+$/, '');
  const apiUrl = trimmedBase.endsWith('/api')
    ? trimmedBase
    : `${trimmedBase}/api`;

  return { ip, apiUrl };
}

export function getRackSensorIntegration(device) {
  const integration = device.integration;
  if (!integration || integration.type !== 'rack-sensor-http') {
    throw new Error('Rack sensor integration is not configured for this device');
  }

  return normalizeRackSensorIntegration(integration.ip);
}

export async function fetchRackSensorPayload(deviceOrIntegration) {
  let integration;

  if (
    deviceOrIntegration &&
    typeof deviceOrIntegration === 'object' &&
    'ip' in deviceOrIntegration
  ) {
    integration = normalizeRackSensorIntegration(deviceOrIntegration.ip);
  } else {
    integration = getRackSensorIntegration(deviceOrIntegration);
  }

  const { ip, apiUrl } = integration;

  let response;

  try {
    response = await fetch(apiUrl, {
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    throw new Error(
      `Failed to connect to rack temperature sensor at ${apiUrl}: ${error.message}`,
    );
  }

  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    throw new Error(
      `Rack temperature sensor at ${apiUrl} responded with ${response.status} ${response.statusText}: ${responseText}`,
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(
      `Rack temperature sensor at ${apiUrl} returned invalid JSON: ${error.message}`,
    );
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error(
      `Rack temperature sensor at ${apiUrl} returned an unexpected payload`,
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
