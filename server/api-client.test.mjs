import assert from 'node:assert/strict';
import test from 'node:test';

import { apiRequest, checkApiHealth, getAuthToken, setAuthToken } from '../src/lib/apiClient.js';

test('apiRequest hides raw status text for server outages', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html>bad gateway</html>', {
    status: 502,
    headers: { 'content-type': 'text/html' },
  });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await assert.rejects(
    () => apiRequest('/api/auth/email/login', {
      body: { email: 'user@example.com', password: 'secret123' },
      token: null,
    }),
    (error) => {
      assert.equal(error.status, 502);
      assert.equal(error.code, 'request/service-unavailable');
      assert.equal(error.message, 'Service is temporarily unavailable.');
      assert.doesNotMatch(error.message, /Request failed with status 502/);
      return true;
    },
  );
});

test('apiRequest hides raw thrown status text for gateway outages', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    const error = new Error('Request failed with status 502');
    error.status = 502;
    throw error;
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await assert.rejects(
    () => apiRequest('/api/auth/email/login', {
      body: { email: 'user@example.com', password: 'secret123' },
      token: null,
    }),
    (error) => {
      assert.equal(error.status, 502);
      assert.equal(error.code, 'request/service-unavailable');
      assert.equal(error.message, 'Service is temporarily unavailable.');
      assert.doesNotMatch(error.message, /Request failed with status 502/);
      return true;
    },
  );
});

test('apiRequest retries transient gateway failures with short backoff', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  let calls = 0;
  const retryDelays = [];
  globalThis.fetch = async () => {
    calls += 1;
    if (calls < 3) {
      return new Response('<html>bad gateway</html>', {
        status: 502,
        headers: { 'content-type': 'text/html' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  globalThis.setTimeout = (callback, delay) => {
    retryDelays.push(delay);
    callback();
    return 0;
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  });

  const result = await apiRequest('/api/auth/email/login', {
    body: { email: 'user@example.com', password: 'secret123' },
    token: null,
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 3);
  assert.deepEqual(retryDelays, [250, 750]);
});

test('apiRequest hides raw status text for non-json client failures', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html>not found</html>', {
    status: 404,
    headers: { 'content-type': 'text/html' },
  });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await assert.rejects(
    () => apiRequest('/api/auth/email/login', {
      body: { email: 'user@example.com', password: 'secret123' },
      token: null,
    }),
    (error) => {
      assert.equal(error.status, 404);
      assert.equal(error.code, 'request-failed');
      assert.equal(error.message, 'Request failed.');
      assert.doesNotMatch(error.message, /Request failed with status 404/);
      return true;
    },
  );
});

test('checkApiHealth returns the health payload with a GET request', async (t) => {
  const originalFetch = globalThis.fetch;
  let requestUrl = '';
  let requestInit = null;
  globalThis.fetch = async (url, init) => {
    requestUrl = url;
    requestInit = init;
    return new Response(JSON.stringify({ ok: true, service: 'atmostfair-local-backend' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await checkApiHealth();

  assert.deepEqual(result, { ok: true, service: 'atmostfair-local-backend' });
  assert.match(requestUrl, /\/api\/health$/);
  assert.equal(requestInit.method, 'GET');
  assert.equal(requestInit.body, undefined);
  assert.deepEqual(requestInit.headers, {});
});

test('checkApiHealth hides raw gateway health failures', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html>bad gateway</html>', {
    status: 502,
    headers: { 'content-type': 'text/html' },
  });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await assert.rejects(
    () => checkApiHealth(),
    (error) => {
      assert.equal(error.status, 502);
      assert.equal(error.code, 'request/service-unavailable');
      assert.equal(error.message, 'Service is temporarily unavailable.');
      assert.doesNotMatch(error.message, /Request failed with status 502/);
      return true;
    },
  );
});

test('auth token storage tolerates disabled browser storage', (t) => {
  const originalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem() {
        throw new Error('storage disabled');
      },
      setItem() {
        throw new Error('storage disabled');
      },
      removeItem() {
        throw new Error('storage disabled');
      },
    },
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

  assert.equal(getAuthToken(), null);
  assert.doesNotThrow(() => setAuthToken('token-123'));
  assert.doesNotThrow(() => setAuthToken(null));
});
