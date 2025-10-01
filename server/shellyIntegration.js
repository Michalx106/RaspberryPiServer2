function getShellySwitchIntegration(device) {
  const integration = device.integration;
  if (!integration || integration.type !== 'shelly-gen3') {
    throw new Error('Shelly integration is not configured for this device');
  }

  const { ip, switchId } = integration;
  if (!ip) {
    throw new Error('Shelly integration is missing the device IP address');
  }
  if (switchId === undefined) {
    throw new Error('Shelly integration is missing the switch identifier');
  }

  return { ip, switchId };
}

async function performShellyRequest({ ip, path, body }) {
  const url = `http://${ip}${path}`;
  let response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(`Failed to connect to Shelly device at ${ip}: ${error.message}`);
  }

  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    throw new Error(
      `Shelly device at ${ip} responded with ${response.status} ${response.statusText}: ${responseText}`,
    );
  }

  let result;
  try {
    result = await response.json();
  } catch (error) {
    throw new Error(`Shelly device at ${ip} returned invalid JSON: ${error.message}`);
  }

  if (!result || typeof result !== 'object') {
    throw new Error(`Shelly device at ${ip} returned an unexpected payload`);
  }

  return result;
}

export async function applyShellySwitchState(device, desiredOn) {
  const { ip, switchId } = getShellySwitchIntegration(device);

  return performShellyRequest({
    ip,
    path: '/rpc/Switch.Set',
    body: { id: switchId, on: desiredOn },
  });
}

export async function fetchShellySwitchState(device) {
  const { ip, switchId } = getShellySwitchIntegration(device);

  return performShellyRequest({
    ip,
    path: '/rpc/Switch.GetStatus',
    body: { id: switchId },
  });
}
