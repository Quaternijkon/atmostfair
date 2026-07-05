import { resolveApiBaseUrl } from './apiBase.js';

const TOKEN_KEY = 'atmostfair.localAuthToken';
const API_BASE_URL = resolveApiBaseUrl({
  configuredBaseUrl: import.meta.env?.VITE_API_BASE_URL || '',
});

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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const serviceUnavailable = response.status >= 500;
    const error = new Error(
      payload.error?.message
      || (serviceUnavailable ? 'Service is temporarily unavailable.' : `Request failed with status ${response.status}`)
    );
    error.code = payload.error?.code || (serviceUnavailable ? 'request/service-unavailable' : 'request-failed');
    error.status = response.status;
    throw error;
  }
  return payload;
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
