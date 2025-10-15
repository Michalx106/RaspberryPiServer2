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

function applyCredentialsToUrl(urlString, username, password) {
  try {
    const url = new URL(urlString);
    if (!url.username && username) {
      url.username = username;
    }
    if (!url.password && password) {
      url.password = password;
    }
    return url.toString();
  } catch (error) {
    return urlString;
  }
}

function buildHttpUrl({ ip, httpPort, snapshotPath, username, password }, includeCredentials) {
  const isAbsolute = snapshotPath.startsWith('http://') || snapshotPath.startsWith('https://');

  if (isAbsolute) {
    return includeCredentials
      ? applyCredentialsToUrl(snapshotPath, username, password)
      : snapshotPath;
  }

  const portSegment = httpPort && httpPort !== 80 ? `:${httpPort}` : '';
  const base = `http://${ip}${portSegment}${snapshotPath}`;
  if (!includeCredentials) {
    return base;
  }

  return applyCredentialsToUrl(base, username, password);
}

function buildRtspUrl(
  { ip, username, password, rtspPort, streamPath },
  includeCredentials,
) {
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

export function buildCamspot45Urls(
  integration,
  { includeCredentials = false, includeSnapshotCredentials, includeStreamCredentials } = {},
) {
  if (!integration || integration.type !== 'camspot-45') {
    throw new CameraIntegrationError('Camspot 4.5 integration details are required');
  }

  const snapshotWithCreds = includeSnapshotCredentials ?? includeCredentials;
  const streamWithCreds = includeStreamCredentials ?? includeCredentials;

  const snapshotUrl = buildHttpUrl(integration, snapshotWithCreds);
  const streamUrl = buildRtspUrl(integration, streamWithCreds);

  return { snapshotUrl, streamUrl };
}

export function getCamspot45Metadata(device) {
  const integration = getCamspot45Integration(device);
  const urls = buildCamspot45Urls(integration);
  const urlsWithCredentials = buildCamspot45Urls(integration, {
    includeSnapshotCredentials: true,
    includeStreamCredentials: true,
  });

  const snapshotProxyUrl = `/api/cameras/${device.id}/snapshot`;
  const streamProxyUrl = `/api/cameras/${device.id}/stream`;
  const hasRtspStream = urls.streamUrl.startsWith('rtsp://');
  const preferredStreamUrl = hasRtspStream
    ? urlsWithCredentials.streamUrl
    : streamProxyUrl;

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
      snapshotWithCredentials: urlsWithCredentials.snapshotUrl,
      snapshotProxy: snapshotProxyUrl,
      stream: urlsWithCredentials.streamUrl,
      streamNoAuth: urls.streamUrl,
      streamProxy: streamProxyUrl,
    },
  };
}

export { CameraIntegrationError };
