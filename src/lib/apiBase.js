export const DEFAULT_PUBLIC_API_ORIGIN = 'https://atmostfair.quaternijkon.xyz';

const SAME_ORIGIN_API_HOSTNAMES = new Set([
  'atmostfair.quaternijkon.xyz',
  'localhost',
  '127.0.0.1',
  '::1',
]);

const STATIC_FRONTEND_HOSTNAMES = new Set([
  'atmostfair.quaternijkon.online',
  'quaternijkon.github.io',
]);

export function resolveApiBaseUrl({
  configuredBaseUrl = '',
  location = globalThis.location,
} = {}) {
  const configured = normalizeBaseUrl(configuredBaseUrl);
  if (configured) return configured;

  const hostname = String(location?.hostname || '').toLowerCase();
  if (!hostname || SAME_ORIGIN_API_HOSTNAMES.has(hostname)) return '';

  if (STATIC_FRONTEND_HOSTNAMES.has(hostname)) {
    return DEFAULT_PUBLIC_API_ORIGIN;
  }

  return DEFAULT_PUBLIC_API_ORIGIN;
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}
