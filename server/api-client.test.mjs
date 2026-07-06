import assert from 'node:assert/strict';
import test from 'node:test';

import { apiRequest } from '../src/lib/apiClient.js';

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
