import assert from 'node:assert/strict';
import test from 'node:test';

import { apiRequest, checkApiHealth } from '../src/lib/apiClient.js';

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

test('apiRequest retries transient gateway failures once', async (t) => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
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
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await apiRequest('/api/auth/email/login', {
    body: { email: 'user@example.com', password: 'secret123' },
    token: null,
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 2);
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
