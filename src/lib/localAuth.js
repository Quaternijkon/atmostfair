import { apiRequest, getAuthToken, setAuthToken } from './apiClient';

export const auth = {
  currentUser: null,
};

const listeners = new Set();
let initPromise = null;
let initialized = false;

export function onAuthStateChanged(_auth, callback) {
  listeners.add(callback);
  ensureSession().then(() => callback(auth.currentUser));
  return () => listeners.delete(callback);
}

export async function signInWithEmailAndPassword(_auth, email, password) {
  const session = await apiRequest('/api/auth/email/login', {
    body: { email, password },
  });
  return applySession(session);
}

export async function createUserWithEmailAndPassword(_auth, email, password) {
  const session = await apiRequest('/api/auth/email/register', {
    body: { email, password },
  });
  return applySession(session);
}

export async function signInAnonymously(_auth, displayName) {
  const cleanName = String(displayName || '').trim();
  if (!cleanName) throw authError('auth/missing-display-name', 'Missing display name.');
  const session = await apiRequest('/api/auth/guest', {
    body: { displayName: cleanName },
  });
  return applySession(session);
}

export async function signOut() {
  try {
    await apiRequest('/api/auth/logout');
  } catch {
    // Local logout should still clear the browser session if the server is unavailable.
  }
  setAuthToken(null);
  auth.currentUser = null;
  emit();
}

export async function updateProfile(user, profile) {
  const result = await apiRequest('/api/auth/profile', {
    body: profile,
  });
  const updatedUser = normalizeUser(result.user);
  auth.currentUser = updatedUser;
  if (user) Object.assign(user, updatedUser);
  emit();
  return updatedUser;
}

async function ensureSession() {
  if (initialized) return auth.currentUser;
  if (!initPromise) {
    initPromise = apiRequest('/api/auth/session', {
      method: 'GET',
      token: getAuthToken(),
    })
      .then((session) => {
        auth.currentUser = session.user ? normalizeUser(session.user) : null;
        initialized = true;
        return auth.currentUser;
      })
      .catch(() => {
        setAuthToken(null);
        auth.currentUser = null;
        initialized = true;
        return null;
      });
  }
  return initPromise;
}

function applySession(session) {
  setAuthToken(session.token);
  auth.currentUser = normalizeUser(session.user);
  initialized = true;
  emit();
  return { user: auth.currentUser };
}

function normalizeUser(user) {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName || user.email?.split('@')[0] || '',
    isAnonymous: Boolean(user.isAnonymous),
    metadata: {
      creationTime: user.metadata?.creationTime || new Date().toISOString(),
    },
  };
}

function emit() {
  for (const listener of listeners) listener(auth.currentUser);
}

function authError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
