import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createAuthService } from './auth-service.mjs';
import { arrayRemove, arrayUnion, createDataStore } from './data-store.mjs';
import { createLocalBackendServer } from './local-backend.mjs';

async function withTempStore(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'atmostfair-'));
  try {
    return await fn({
      dir,
      store: await createDataStore({ filePath: path.join(dir, 'db.json') }),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('local auth supports email password accounts and guest sessions only', async () => {
  await withTempStore(async ({ store }) => {
    const auth = createAuthService({
      store,
      sessionSecret: 'test-secret',
      now: () => 1700000000000,
    });

    const created = await auth.registerEmail('ALICE@example.com', 'correct horse battery staple');
    assert.equal(created.user.email, 'alice@example.com');
    assert.equal(created.user.displayName, 'alice');
    assert.equal(created.user.isAnonymous, false);
    assert.ok(created.token);

    const verified = await auth.verifyToken(created.token);
    assert.equal(verified.uid, created.user.uid);

    await assert.rejects(
      () => auth.loginEmail('alice@example.com', 'bad password'),
      /auth\/wrong-password/,
    );

    const loggedIn = await auth.loginEmail('alice@example.com', 'correct horse battery staple');
    assert.equal(loggedIn.user.uid, created.user.uid);

    const guest = await auth.createGuest('Visitor');
    assert.equal(guest.user.email, null);
    assert.equal(guest.user.displayName, 'Visitor');
    assert.equal(guest.user.isAnonymous, true);
    assert.ok(guest.token);

    await assert.rejects(
      () => auth.updateProfile(created.user.uid, { email: 'not-an-email' }),
      /auth\/invalid-email/,
    );
    await assert.rejects(
      () => auth.registerEmail('not-an-email', 'secret123'),
      /auth\/invalid-email/,
    );
    await assert.rejects(
      () => auth.loginEmail('not-an-email', 'secret123'),
      /auth\/invalid-email/,
    );
  });
});

test('local data store supports CRUD, queries, and array transforms', async () => {
  await withTempStore(async ({ store }) => {
    const alpha = await store.add('projects', {
      title: 'Alpha',
      status: 'active',
      votes: [],
      createdAt: 10,
    });
    const beta = await store.add('projects', {
      title: 'Beta',
      status: 'finished',
      votes: ['u1'],
      createdAt: 20,
    });

    await store.update('projects', alpha.id, { votes: arrayUnion('u1', 'u2') });
    await store.update('projects', alpha.id, { votes: arrayRemove('u2') });

    const savedAlpha = await store.get('projects', alpha.id);
    assert.deepEqual(savedAlpha.votes, ['u1']);

    await store.set('projects', beta.id, { status: 'active' }, { merge: true });

    const active = await store.list('projects', {
      filters: [{ field: 'status', op: '==', value: 'active' }],
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
      limit: 1,
    });

    assert.equal(active.length, 1);
    assert.equal(active[0].id, beta.id);

    await store.batch([
      { type: 'update', collection: 'projects', id: beta.id, data: { title: 'Beta 2' } },
      { type: 'delete', collection: 'projects', id: alpha.id },
    ]);

    assert.equal(await store.get('projects', alpha.id), null);
    assert.equal((await store.get('projects', beta.id)).title, 'Beta 2');
  });
});

test('HTTP backend exposes local auth and authenticated data APIs', async () => {
  await withTempStore(async ({ store }) => {
    const server = createLocalBackendServer({
      store,
      sessionSecret: 'test-secret',
      staticDir: path.join(process.cwd(), 'dist-missing-for-test'),
      now: () => 1700000000000,
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const health = await fetchJson(`${baseUrl}/api/health`);
      assert.equal(health.ok, true);

      const session = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'owner@example.com', password: 'secret123' },
      });
      assert.equal(session.user.email, 'owner@example.com');
      assert.ok(session.token);

      const created = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: session.token,
        body: { collection: 'projects', data: { title: 'Local', createdAt: 1 } },
      });
      assert.equal(created.doc.title, 'Local');

      const listed = await fetchJson(`${baseUrl}/api/data/list`, {
        method: 'POST',
        token: session.token,
        body: { collection: 'projects', query: {} },
      });
      assert.equal(listed.docs.length, 1);
      assert.equal(listed.docs[0].id, created.doc.id);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('HTTP data API rejects non-app and internal collections', async () => {
  await withTempStore(async ({ store }) => {
    const server = createLocalBackendServer({
      store,
      sessionSecret: 'test-secret',
      staticDir: path.join(process.cwd(), 'dist-missing-for-test'),
      now: () => 1700000000000,
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const session = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'owner@example.com', password: 'secret123' },
      });

      const arbitrary = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: session.token,
        body: { collection: 'evil_collection', data: { title: 'Bad' } },
      });
      assert.equal(arbitrary.status, 400);
      assert.equal(arbitrary.body.error.code, 'data/invalid-collection');
      assert.equal(store.state.collections.evil_collection, undefined);

      const internal = await fetchJsonResponse(`${baseUrl}/api/data/set`, {
        method: 'POST',
        token: session.token,
        body: { collection: 'auth_accounts', id: 'takeover', data: { email: 'attacker@example.com' } },
      });
      assert.equal(internal.status, 400);
      assert.equal(internal.body.error.code, 'data/invalid-collection');
      assert.equal(await store.get('auth_accounts', 'takeover'), null);

      const listed = await fetchJson(`${baseUrl}/api/data/list`, {
        method: 'POST',
        token: session.token,
        body: { collection: 'projects', query: {} },
      });
      assert.deepEqual(listed.docs, []);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('HTTP data API rejects invalid batch operations without partial writes', async () => {
  await withTempStore(async ({ store }) => {
    const server = createLocalBackendServer({
      store,
      sessionSecret: 'test-secret',
      staticDir: path.join(process.cwd(), 'dist-missing-for-test'),
      now: () => 1700000000000,
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const session = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'owner@example.com', password: 'secret123' },
      });

      const mixedCollection = await fetchJsonResponse(`${baseUrl}/api/data/batch`, {
        method: 'POST',
        token: session.token,
        body: {
          operations: [
            { type: 'add', collection: 'projects', data: { title: 'Should not persist' } },
            { type: 'add', collection: 'evil_collection', data: { title: 'Bad' } },
          ],
        },
      });
      assert.equal(mixedCollection.status, 400);
      assert.equal(mixedCollection.body.error.code, 'data/invalid-collection');
      assert.deepEqual(await store.list('projects'), []);
      assert.equal(store.state.collections.evil_collection, undefined);

      const unknownType = await fetchJsonResponse(`${baseUrl}/api/data/batch`, {
        method: 'POST',
        token: session.token,
        body: {
          operations: [
            { type: 'add', collection: 'projects', data: { title: 'Still should not persist' } },
            { type: 'touch', collection: 'projects', id: 'project-1', data: { title: 'Bad op' } },
          ],
        },
      });
      assert.equal(unknownType.status, 400);
      assert.equal(unknownType.body.error.code, 'data/invalid-operation');
      assert.deepEqual(await store.list('projects'), []);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('HTTP data API rejects missing document ids without partial writes', async () => {
  await withTempStore(async ({ store }) => {
    const server = createLocalBackendServer({
      store,
      sessionSecret: 'test-secret',
      staticDir: path.join(process.cwd(), 'dist-missing-for-test'),
      now: () => 1700000000000,
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const session = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'owner@example.com', password: 'secret123' },
      });

      for (const [pathName, body] of [
        ['/api/data/get', { collection: 'projects' }],
        ['/api/data/set', { collection: 'projects', data: { title: 'Missing id' } }],
        ['/api/data/update', { collection: 'projects', id: '', data: { title: 'Empty id' } }],
        ['/api/data/delete', { collection: 'projects', id: '   ' }],
      ]) {
        const response = await fetchJsonResponse(`${baseUrl}${pathName}`, {
          method: 'POST',
          token: session.token,
          body,
        });
        assert.equal(response.status, 400, `${pathName} should reject missing ids`);
        assert.equal(response.body.error.code, 'data/invalid-id');
      }

      assert.equal(store.state.collections.projects, undefined);

      const batch = await fetchJsonResponse(`${baseUrl}/api/data/batch`, {
        method: 'POST',
        token: session.token,
        body: {
          operations: [
            { type: 'add', collection: 'projects', data: { title: 'Should not persist' } },
            { type: 'set', collection: 'projects', data: { title: 'Missing id' } },
          ],
        },
      });
      assert.equal(batch.status, 400);
      assert.equal(batch.body.error.code, 'data/invalid-id');
      assert.equal(store.state.collections.projects, undefined);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('HTTP backend translates auth failures into HTTP responses', async () => {
  await withTempStore(async ({ store }) => {
    const server = createLocalBackendServer({
      store,
      sessionSecret: 'test-secret',
      staticDir: path.join(process.cwd(), 'dist-missing-for-test'),
      now: () => 1700000000000,
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const missingUser = await fetch(`${baseUrl}/api/auth/email/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'missing@example.com', password: 'secret123' }),
      });
      assert.equal(missingUser.status, 401);
      assert.equal((await missingUser.json()).error.code, 'auth/user-not-found');

      const invalidEmail = await fetch(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email', password: 'secret123' }),
      });
      assert.equal(invalidEmail.status, 400);
      assert.equal((await invalidEmail.json()).error.code, 'auth/invalid-email');

      await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'owner@example.com', password: 'secret123' },
      });

      const duplicateUser = await fetch(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com', password: 'secret123' }),
      });
      assert.equal(duplicateUser.status, 409);
      assert.equal((await duplicateUser.json()).error.code, 'auth/email-already-in-use');

      const health = await fetchJson(`${baseUrl}/api/health`);
      assert.equal(health.ok, true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

async function fetchJson(url, { method = 'GET', token, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || `HTTP ${response.status}`);
  }
  return payload;
}

async function fetchJsonResponse(url, { method = 'GET', token, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}
