import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getBrowserStorageItem,
  getJsonBrowserStorageItem,
  removeBrowserStorageItem,
  setBrowserStorageItem,
  setJsonBrowserStorageItem,
} from '../src/lib/browserStorage.js';

function installStorage(t, storage) {
  const originalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
  t.after(() => {
    if (originalStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: originalStorage,
      });
    }
  });
}

test('browser storage helpers read, write, and remove safe local values', (t) => {
  const values = new Map();
  installStorage(t, {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  });

  assert.equal(getBrowserStorageItem('missing', 'fallback'), 'fallback');
  assert.equal(setBrowserStorageItem('plain', 'value'), true);
  assert.equal(getBrowserStorageItem('plain', 'fallback'), 'value');
  assert.equal(setJsonBrowserStorageItem('json', ['a', 'b']), true);
  assert.deepEqual(getJsonBrowserStorageItem('json', []), ['a', 'b']);
  assert.equal(removeBrowserStorageItem('plain'), true);
  assert.equal(getBrowserStorageItem('plain', null), null);
});

test('browser storage helpers fall back when browser storage is disabled', (t) => {
  installStorage(t, {
    getItem() {
      throw new Error('storage disabled');
    },
    setItem() {
      throw new Error('storage disabled');
    },
    removeItem() {
      throw new Error('storage disabled');
    },
  });

  assert.equal(getBrowserStorageItem('plain', 'fallback'), 'fallback');
  assert.deepEqual(getJsonBrowserStorageItem('json', []), []);
  assert.equal(setBrowserStorageItem('plain', 'value'), false);
  assert.equal(setJsonBrowserStorageItem('json', ['a']), false);
  assert.equal(removeBrowserStorageItem('plain'), false);
});
