import { resolveApiBaseUrl } from './apiBase.js';

const TOKEN_KEY = 'atmostfair.localAuthToken';
const API_BASE_URL = resolveApiBaseUrl({
  configuredBaseUrl: import.meta.env?.VITE_API_BASE_URL || '',
});
const RETRYABLE_STATUS_CODES = new Set([502, 503, 504]);
const MAX_RETRY_ATTEMPTS = 1;

export function getAuthToken() {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token) {
  if (typeof localStorage === 'undefined') return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function apiRequest(path, { method = 'POST', body, token = getAuthToken() } = {}) {
  const requestUrl = `${API_BASE_URL}${path}`;
  const requestInit = {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };

  for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetch(requestUrl, requestInit);
    } catch (error) {
      const status = getTransportErrorStatus(error);
      if ((!status || RETRYABLE_STATUS_CODES.has(status)) && attempt < MAX_RETRY_ATTEMPTS) continue;
      throwApiError({
        payload: {},
        serviceUnavailable: !status || status >= 500,
        status: status || 503,
      });
    }
    const payload = await response.json().catch(() => ({}));
    if (response.ok) return payload;
    if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < MAX_RETRY_ATTEMPTS) continue;

    const serviceUnavailable = response.status >= 500;
    throwApiError({ payload, serviceUnavailable, status: response.status });
  }
}

function getTransportErrorStatus(error) {
  const directStatus = Number(error?.status || error?.response?.status);
  if (Number.isInteger(directStatus) && directStatus >= 100 && directStatus <= 599) return directStatus;

  const statusMatch = String(error?.message || '').match(/\bstatus\s+(\d{3})\b/i);
  if (!statusMatch) return null;

  const messageStatus = Number(statusMatch[1]);
  return Number.isInteger(messageStatus) ? messageStatus : null;
}

function throwApiError({ payload, serviceUnavailable, status }) {
  const error = new Error(
    payload.error?.message
    || (serviceUnavailable ? 'Service is temporarily unavailable.' : 'Request failed.')
  );
  error.code = payload.error?.code || (serviceUnavailable ? 'request/service-unavailable' : 'request-failed');
  error.status = status;
  throw error;
}

export function hasProjectPassword(project) {
  return Boolean(project?.hasPassword || String(project?.password || '').trim());
}

export async function unlockProjectAccess(projectId, password) {
  const cleanProjectId = String(projectId || '').trim();
  if (!cleanProjectId) {
    const error = new Error('Project id is required.');
    error.code = 'project-access/invalid-project';
    throw error;
  }

  return apiRequest('/api/project-access/unlock', {
    body: {
      projectId: cleanProjectId,
      password: String(password || ''),
    },
  });
}
