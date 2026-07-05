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

test('HTTP data API protects project documents from non-owner writes', async () => {
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
      const owner = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'owner@example.com', password: 'secret123' },
      });
      const viewer = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'viewer@example.com', password: 'secret123' },
      });
      const admin = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'quaternijkon@mail.ustc.edu.cn', password: 'secret123' },
      });

      const created = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'projects',
          data: {
            title: 'Owned Project',
            creatorId: viewer.user.uid,
            createdAt: 1,
          },
        },
      });
      assert.equal(created.doc.creatorId, owner.user.uid);

      const hijack = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: viewer.token,
        body: {
          collection: 'projects',
          id: created.doc.id,
          data: { title: 'Hijacked' },
        },
      });
      assert.equal(hijack.status, 403);
      assert.equal(hijack.body.error.code, 'data/forbidden');
      assert.equal((await store.get('projects', created.doc.id)).title, 'Owned Project');

      const batchHijack = await fetchJsonResponse(`${baseUrl}/api/data/batch`, {
        method: 'POST',
        token: viewer.token,
        body: {
          operations: [
            { type: 'add', collection: 'project_activities', data: { projectId: created.doc.id, subject: 'partial write' } },
            { type: 'update', collection: 'projects', id: created.doc.id, data: { title: 'Batch Hijacked' } },
          ],
        },
      });
      assert.equal(batchHijack.status, 403);
      assert.equal(batchHijack.body.error.code, 'data/forbidden');
      assert.equal((await store.list('project_activities')).length, 0);
      assert.equal((await store.get('projects', created.doc.id)).title, 'Owned Project');

      const ownerReplace = await fetchJson(`${baseUrl}/api/data/set`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'projects',
          id: created.doc.id,
          data: { title: 'Owner Replaced' },
        },
      });
      assert.equal(ownerReplace.doc.title, 'Owner Replaced');
      assert.equal(ownerReplace.doc.creatorId, owner.user.uid);

      const adminUpdate = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: admin.token,
        body: {
          collection: 'projects',
          id: created.doc.id,
          data: { title: 'Admin Updated' },
        },
      });
      assert.equal(adminUpdate.doc.title, 'Admin Updated');
      assert.equal(adminUpdate.doc.creatorId, owner.user.uid);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('HTTP data API filters private notifications and friend records by current user', async () => {
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
      const alice = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'alice@example.com', password: 'secret123', displayName: 'Alice' },
      });
      const bob = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'bob@example.com', password: 'secret123', displayName: 'Bob' },
      });
      const charlie = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'charlie@example.com', password: 'secret123', displayName: 'Charlie' },
      });
      const admin = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'quaternijkon@mail.ustc.edu.cn', password: 'secret123', displayName: 'Admin' },
      });

      const aliceNotification = await store.add('notifications', {
        recipientId: alice.user.uid,
        title: 'Alice only',
        read: false,
      });
      const bobNotification = await store.add('notifications', {
        recipientId: bob.user.uid,
        title: 'Bob only',
        read: false,
      });
      const aliceBobFriendship = await store.add('friendships', {
        members: [alice.user.uid, bob.user.uid],
        names: { [alice.user.uid]: 'Alice', [bob.user.uid]: 'Bob' },
        status: 'confirmed',
        initiator: alice.user.uid,
        createdAt: 1,
      });
      const bobCharlieFriendship = await store.add('friendships', {
        members: [bob.user.uid, charlie.user.uid],
        names: { [bob.user.uid]: 'Bob', [charlie.user.uid]: 'Charlie' },
        status: 'confirmed',
        initiator: bob.user.uid,
        createdAt: 2,
      });
      const aliceMessage = await store.add('friend_messages', {
        chatId: aliceBobFriendship.id,
        senderId: alice.user.uid,
        text: 'secret for Bob',
        createdAt: 3,
      });
      await store.add('friend_messages', {
        chatId: bobCharlieFriendship.id,
        senderId: bob.user.uid,
        text: 'secret for Charlie',
        createdAt: 4,
      });

      const aliceNotifications = await fetchJson(`${baseUrl}/api/data/list`, {
        method: 'POST',
        token: alice.token,
        body: { collection: 'notifications', query: {} },
      });
      assert.deepEqual(aliceNotifications.docs.map((entry) => entry.id), [aliceNotification.id]);

      const aliceReadBobNotification = await fetchJson(`${baseUrl}/api/data/get`, {
        method: 'POST',
        token: alice.token,
        body: { collection: 'notifications', id: bobNotification.id },
      });
      assert.equal(aliceReadBobNotification.doc, null);

      const aliceUpdatesBobNotification = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: alice.token,
        body: { collection: 'notifications', id: bobNotification.id, data: { read: true } },
      });
      assert.equal(aliceUpdatesBobNotification.status, 403);
      assert.equal(aliceUpdatesBobNotification.body.error.code, 'data/forbidden');
      assert.equal((await store.get('notifications', bobNotification.id)).read, false);

      const aliceFriendships = await fetchJson(`${baseUrl}/api/data/list`, {
        method: 'POST',
        token: alice.token,
        body: { collection: 'friendships', query: {} },
      });
      assert.deepEqual(aliceFriendships.docs.map((entry) => entry.id), [aliceBobFriendship.id]);

      const aliceReadForeignFriendship = await fetchJson(`${baseUrl}/api/data/get`, {
        method: 'POST',
        token: alice.token,
        body: { collection: 'friendships', id: bobCharlieFriendship.id },
      });
      assert.equal(aliceReadForeignFriendship.doc, null);

      const forgedFriendship = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'friendships',
          data: {
            members: [bob.user.uid, charlie.user.uid],
            status: 'confirmed',
            initiator: bob.user.uid,
          },
        },
      });
      assert.equal(forgedFriendship.status, 403);
      assert.equal(forgedFriendship.body.error.code, 'data/forbidden');

      const validFriendRequest = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'friendships',
          data: {
            members: [alice.user.uid, charlie.user.uid],
            names: { [alice.user.uid]: 'Alice', [charlie.user.uid]: 'Charlie' },
            status: 'pending',
            initiator: alice.user.uid,
            createdAt: 5,
          },
        },
      });
      assert.equal(validFriendRequest.doc.status, 'pending');
      assert.equal(validFriendRequest.doc.initiator, alice.user.uid);

      const selfConfirm = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: alice.token,
        body: { collection: 'friendships', id: validFriendRequest.doc.id, data: { status: 'confirmed' } },
      });
      assert.equal(selfConfirm.status, 403);
      assert.equal(selfConfirm.body.error.code, 'data/forbidden');

      const recipientConfirm = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: charlie.token,
        body: { collection: 'friendships', id: validFriendRequest.doc.id, data: { status: 'confirmed' } },
      });
      assert.equal(recipientConfirm.doc.status, 'confirmed');

      const aliceMessages = await fetchJson(`${baseUrl}/api/data/list`, {
        method: 'POST',
        token: alice.token,
        body: { collection: 'friend_messages', query: {} },
      });
      assert.deepEqual(aliceMessages.docs.map((entry) => entry.id), [aliceMessage.id]);

      const forgedMessage = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'friend_messages',
          data: {
            chatId: bobCharlieFriendship.id,
            senderId: bob.user.uid,
            text: 'forged',
            createdAt: 5,
          },
        },
      });
      assert.equal(forgedMessage.status, 403);
      assert.equal(forgedMessage.body.error.code, 'data/forbidden');

      const sentMessage = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'friend_messages',
          data: {
            chatId: aliceBobFriendship.id,
            senderId: bob.user.uid,
            text: 'from Alice',
            createdAt: 6,
          },
        },
      });
      assert.equal(sentMessage.doc.senderId, alice.user.uid);

      const adminNotifications = await fetchJson(`${baseUrl}/api/data/list`, {
        method: 'POST',
        token: admin.token,
        body: { collection: 'notifications', query: {} },
      });
      assert.deepEqual(
        adminNotifications.docs.map((entry) => entry.id).sort(),
        [aliceNotification.id, bobNotification.id].sort(),
      );
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
