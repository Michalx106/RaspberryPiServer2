const CAMSPOT_DEFAULT_HTTP_PORT = 80;
const CAMSPOT_DEFAULT_RTSP_PORT = 554;
const CAMSPOT_DEFAULT_SNAPSHOT_PATH = '/tmpfs/auto.jpg';
const CAMSPOT_DEFAULT_STREAM_PATH = '/live/ch0';

class CameraIntegrationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CameraIntegrationError';
  }
}

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CameraIntegrationError(`${fieldName} must be a non-empty string`);
  }
  return value.trim();
}

function assertOptionalPort(value, fieldName, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }

  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 65535) {
    throw new CameraIntegrationError(
      `${fieldName} must be an integer between 1 and 65535`,
    );
  }

  return numeric;
}

function normalizePath(path, defaultPath) {
  const effective = typeof path === 'string' && path.trim() !== '' ? path.trim() : defaultPath;
  if (/^[a-z]+:\/\//i.test(effective)) {
    return effective;
  }

  if (!effective.startsWith('/')) {
    return `/${effective}`;
  }

  return effective;
}

function buildHttpUrl({ ip, httpPort, snapshotPath }) {
  if (snapshotPath.startsWith('http://') || snapshotPath.startsWith('https://')) {
    return snapshotPath;
  }

  const portSegment = httpPort && httpPort !== 80 ? `:${httpPort}` : '';
  return `http://${ip}${portSegment}${snapshotPath}`;
}

function buildRtspUrl({ ip, username, password, rtspPort, streamPath }, includeCredentials) {
  if (streamPath.startsWith('rtsp://')) {
    return streamPath;
  }

  const encodedUser = encodeURIComponent(username);
  const encodedPassword = encodeURIComponent(password);
  const credentials = includeCredentials ? `${encodedUser}:${encodedPassword}@` : '';
  const portSegment = rtspPort && rtspPort !== 554 ? `:${rtspPort}` : '';
  return `rtsp://${credentials}${ip}${portSegment}${streamPath}`;
}

export function getCamspot45Integration(device) {
  if (!device || device.integration?.type !== 'camspot-45') {
    throw new CameraIntegrationError('Device is not configured for Camspot 4.5 integration');
  }

  const { integration } = device;
  const ip = assertNonEmptyString(integration.ip, 'integration.ip');
  const username = assertNonEmptyString(
    integration.username ?? integration.user,
    'integration.username',
  );
  const password = assertNonEmptyString(
    integration.password ?? integration.pass,
    'integration.password',
  );

  const httpPort = assertOptionalPort(
    integration.httpPort ?? integration.port,
    'integration.httpPort',
    CAMSPOT_DEFAULT_HTTP_PORT,
  );
  const rtspPort = assertOptionalPort(
    integration.rtspPort ?? integration.port,
    'integration.rtspPort',
    CAMSPOT_DEFAULT_RTSP_PORT,
  );

  const snapshotPath = normalizePath(
    integration.snapshotPath,
    CAMSPOT_DEFAULT_SNAPSHOT_PATH,
  );
  const streamPath = normalizePath(integration.streamPath, CAMSPOT_DEFAULT_STREAM_PATH);

  return {
    type: 'camspot-45',
    ip,
    username,
    password,
    httpPort,
    rtspPort,
    snapshotPath,
    streamPath,
  };
}

export function buildCamspot45Urls(integration, { includeCredentials = false } = {}) {
  if (!integration || integration.type !== 'camspot-45') {
    throw new CameraIntegrationError('Camspot 4.5 integration details are required');
  }

  const snapshotUrl = buildHttpUrl(integration);
  const streamUrl = buildRtspUrl(integration, includeCredentials);

  return { snapshotUrl, streamUrl };
}

export function getCamspot45Metadata(device) {
  const integration = getCamspot45Integration(device);
  const urls = buildCamspot45Urls(integration);
  const urlsWithCredentials = buildCamspot45Urls(integration, { includeCredentials: true });

  const snapshotProxyUrl = `/api/cameras/${device.id}/snapshot`;
  const streamProxyUrl = `/api/cameras/${device.id}/stream`;
  const proxiedStreamUrl = streamProxyUrl;
  const hasRtspStream = urls.streamUrl.startsWith('rtsp://');
  const preferredStreamUrl = hasRtspStream
    ? proxiedStreamUrl
    : proxiedStreamUrl || urls.streamUrl;

  return {
    id: device.id,
    name: device.name,
    type: device.type,
    integration: {
      type: integration.type,
      ip: integration.ip,
      httpPort: integration.httpPort,
      rtspPort: integration.rtspPort,
      snapshotPath: integration.snapshotPath,
      streamPath: integration.streamPath,
      username: integration.username,
    },
    thumbnailUrl: snapshotProxyUrl,
    streamUrl: preferredStreamUrl,
    streamType: hasRtspStream ? 'rtsp' : undefined,
    urls: {
      snapshot: urls.snapshotUrl,
      snapshotProxy: snapshotProxyUrl,
      stream: urlsWithCredentials.streamUrl,
      streamNoAuth: urls.streamUrl,
      streamProxy: streamProxyUrl,
    },
  };
}

export { CameraIntegrationError };
