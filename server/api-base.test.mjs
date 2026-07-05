import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_PUBLIC_API_ORIGIN,
  resolveApiBaseUrl,
} from '../src/lib/apiBase.js';

test('API base stays same-origin for the self-hosted app domain', () => {
  assert.equal(
    resolveApiBaseUrl({
      location: { hostname: 'atmostfair.quaternijkon.xyz', protocol: 'https:' },
    }),
    '',
  );
});

test('API base targets the live backend when the app is served from static hosts', () => {
  for (const hostname of ['atmostfair.quaternijkon.online', 'quaternijkon.github.io']) {
    assert.equal(
      resolveApiBaseUrl({
        location: { hostname, protocol: 'https:' },
      }),
      DEFAULT_PUBLIC_API_ORIGIN,
    );
  }
});

test('API base honors explicit build configuration', () => {
  assert.equal(
    resolveApiBaseUrl({
      configuredBaseUrl: 'https://api.example.com/',
      location: { hostname: 'atmostfair.quaternijkon.online', protocol: 'https:' },
    }),
    'https://api.example.com',
  );
});
