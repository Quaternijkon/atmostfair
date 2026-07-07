export function getBrowserStorageItem(key, fallback = null) {
  try {
    if (typeof globalThis.localStorage === 'undefined') return fallback;
    const value = globalThis.localStorage.getItem(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export function setBrowserStorageItem(key, value) {
  try {
    if (typeof globalThis.localStorage === 'undefined') return false;
    globalThis.localStorage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

export function removeBrowserStorageItem(key) {
  try {
    if (typeof globalThis.localStorage === 'undefined') return false;
    globalThis.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function getJsonBrowserStorageItem(key, fallback) {
  const raw = getBrowserStorageItem(key, null);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function setJsonBrowserStorageItem(key, value) {
  try {
    return setBrowserStorageItem(key, JSON.stringify(value));
  } catch {
    return false;
  }
}
