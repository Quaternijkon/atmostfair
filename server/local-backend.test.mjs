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

test('HTTP data API limits user document writes to the current user and preserves identity fields', async () => {
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

      const ownSync = await fetchJson(`${baseUrl}/api/data/set`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'users',
          id: alice.user.uid,
          data: {
            uid: alice.user.uid,
            email: alice.user.email,
            displayName: 'Alice Synced',
            isAnonymous: false,
            lastSeen: 1,
          },
          options: { merge: true },
        },
      });
      assert.equal(ownSync.doc.displayName, 'Alice Synced');
      assert.equal(ownSync.doc.email, 'alice@example.com');

      const foreignUpdate = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'users',
          id: alice.user.uid,
          data: { displayName: 'Bob Took Over' },
        },
      });
      assert.equal(foreignUpdate.status, 403);
      assert.equal(foreignUpdate.body.error.code, 'data/forbidden');
      assert.equal((await store.get('users', alice.user.uid)).displayName, 'Alice Synced');

      const foreignSet = await fetchJsonResponse(`${baseUrl}/api/data/set`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'users',
          id: alice.user.uid,
          data: { uid: alice.user.uid, email: 'alice@example.com', displayName: 'Still Bob' },
          options: { merge: true },
        },
      });
      assert.equal(foreignSet.status, 403);
      assert.equal(foreignSet.body.error.code, 'data/forbidden');

      const identityUpdate = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'users',
          id: alice.user.uid,
          data: { email: 'spoof@example.com' },
        },
      });
      assert.equal(identityUpdate.status, 403);
      assert.equal(identityUpdate.body.error.code, 'data/forbidden');
      assert.equal((await store.get('users', alice.user.uid)).email, 'alice@example.com');

      const ownUpdate = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'users',
          id: alice.user.uid,
          data: { displayName: 'Alice Updated' },
        },
      });
      assert.equal(ownUpdate.doc.displayName, 'Alice Updated');

      const ownDelete = await fetchJsonResponse(`${baseUrl}/api/data/delete`, {
        method: 'POST',
        token: alice.token,
        body: { collection: 'users', id: alice.user.uid },
      });
      assert.equal(ownDelete.status, 403);
      assert.equal(ownDelete.body.error.code, 'data/forbidden');
      assert.notEqual(await store.get('users', alice.user.uid), null);

      const blockedBatch = await fetchJsonResponse(`${baseUrl}/api/data/batch`, {
        method: 'POST',
        token: alice.token,
        body: {
          operations: [
            { type: 'update', collection: 'users', id: alice.user.uid, data: { displayName: 'Batch partial' } },
            { type: 'update', collection: 'users', id: bob.user.uid, data: { displayName: 'Foreign batch' } },
          ],
        },
      });
      assert.equal(blockedBatch.status, 403);
      assert.equal(blockedBatch.body.error.code, 'data/forbidden');
      assert.equal((await store.get('users', alice.user.uid)).displayName, 'Alice Updated');

      const readable = await fetchJson(`${baseUrl}/api/data/list`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'users',
          query: { filters: [{ field: 'email', op: '==', value: 'alice@example.com' }] },
        },
      });
      assert.deepEqual(readable.docs.map((entry) => entry.id), [alice.user.uid]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('HTTP data API limits announcement writes to admins while keeping announcements readable', async () => {
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
      const user = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'user@example.com', password: 'secret123', displayName: 'User' },
      });
      const admin = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'quaternijkon@mail.ustc.edu.cn', password: 'secret123', displayName: 'Admin' },
      });

      const userAdd = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: user.token,
        body: {
          collection: 'announcements',
          data: { title: 'Forged', content: 'Not allowed', createdAt: 1 },
        },
      });
      assert.equal(userAdd.status, 403);
      assert.equal(userAdd.body.error.code, 'data/forbidden');
      assert.deepEqual(await store.list('announcements'), []);

      const adminAdd = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: admin.token,
        body: {
          collection: 'announcements',
          data: { title: 'Release', content: 'Admin authored', createdAt: 2 },
        },
      });
      assert.equal(adminAdd.doc.title, 'Release');

      const userUpdate = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: user.token,
        body: {
          collection: 'announcements',
          id: adminAdd.doc.id,
          data: { title: 'Hijacked' },
        },
      });
      assert.equal(userUpdate.status, 403);
      assert.equal(userUpdate.body.error.code, 'data/forbidden');
      assert.equal((await store.get('announcements', adminAdd.doc.id)).title, 'Release');

      const blockedBatch = await fetchJsonResponse(`${baseUrl}/api/data/batch`, {
        method: 'POST',
        token: user.token,
        body: {
          operations: [
            { type: 'add', collection: 'project_activities', data: { projectId: 'visible', subject: 'partial' } },
            { type: 'add', collection: 'announcements', data: { title: 'Batch forged', createdAt: 3 } },
          ],
        },
      });
      assert.equal(blockedBatch.status, 403);
      assert.equal(blockedBatch.body.error.code, 'data/forbidden');
      assert.deepEqual(await store.list('project_activities'), []);

      const readable = await fetchJson(`${baseUrl}/api/data/list`, {
        method: 'POST',
        token: user.token,
        body: { collection: 'announcements', query: {} },
      });
      assert.deepEqual(readable.docs.map((entry) => entry.id), [adminAdd.doc.id]);

      const adminDelete = await fetchJson(`${baseUrl}/api/data/delete`, {
        method: 'POST',
        token: admin.token,
        body: { collection: 'announcements', id: adminAdd.doc.id },
      });
      assert.equal(adminDelete.ok, true);
      assert.equal(await store.get('announcements', adminAdd.doc.id), null);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('HTTP data API restricts notification creation to verified app events', async () => {
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

      const arbitrarySelfNotification = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'notifications',
          data: {
            recipientId: alice.user.uid,
            type: 'system',
            title: 'Self spam',
            read: false,
            createdAt: 1,
          },
        },
      });
      assert.equal(arbitrarySelfNotification.status, 403);
      assert.equal(arbitrarySelfNotification.body.error.code, 'data/forbidden');

      const forgedFriendNotification = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'notifications',
          data: {
            recipientId: bob.user.uid,
            type: 'friend_req',
            title: 'Forged request',
            read: false,
            createdAt: 2,
          },
        },
      });
      assert.equal(forgedFriendNotification.status, 403);
      assert.equal(forgedFriendNotification.body.error.code, 'data/forbidden');

      const friendship = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'friendships',
          data: {
            members: [alice.user.uid, bob.user.uid],
            names: { [alice.user.uid]: 'Alice', [bob.user.uid]: 'Bob' },
            status: 'pending',
            initiator: alice.user.uid,
            createdAt: 3,
          },
        },
      });
      assert.equal(friendship.doc.status, 'pending');

      const validFriendNotification = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'notifications',
          data: {
            recipientId: bob.user.uid,
            type: 'friend_req',
            title: 'New friend request',
            read: true,
            createdAt: 4,
          },
        },
      });
      assert.equal(validFriendNotification.doc.recipientId, bob.user.uid);
      assert.equal(validFriendNotification.doc.senderId, alice.user.uid);
      assert.equal(validFriendNotification.doc.read, false);

      const duplicateFriendNotification = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'notifications',
          data: {
            recipientId: bob.user.uid,
            type: 'friend_req',
            title: 'Duplicate friend request',
            read: false,
            createdAt: 5,
          },
        },
      });
      assert.equal(duplicateFriendNotification.status, 409);
      assert.equal(duplicateFriendNotification.body.error.code, 'data/duplicate-notification');

      const project = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: { collection: 'projects', data: { title: 'Booking', status: 'active', createdAt: 6 } },
      });
      const stoppedProject = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: { collection: 'projects', data: { title: 'Stopped Booking', status: 'stopped', createdAt: 7 } },
      });

      const projectNotification = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'notifications',
          data: {
            recipientId: charlie.user.uid,
            type: 'kicked',
            title: 'Booking cancelled',
            projectId: project.doc.id,
            read: true,
            createdAt: 8,
          },
        },
      });
      assert.equal(projectNotification.doc.recipientId, charlie.user.uid);
      assert.equal(projectNotification.doc.read, false);

      const foreignProjectNotification = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'notifications',
          data: {
            recipientId: charlie.user.uid,
            type: 'kicked',
            title: 'Forged booking',
            projectId: project.doc.id,
            read: false,
            createdAt: 9,
          },
        },
      });
      assert.equal(foreignProjectNotification.status, 403);
      assert.equal(foreignProjectNotification.body.error.code, 'data/forbidden');

      const lockedProjectNotification = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'notifications',
          data: {
            recipientId: charlie.user.uid,
            type: 'booking_promoted',
            title: 'Locked booking',
            projectId: stoppedProject.doc.id,
            read: false,
            createdAt: 10,
          },
        },
      });
      assert.equal(lockedProjectNotification.status, 409);
      assert.equal(lockedProjectNotification.body.error.code, 'data/project-locked');

      const blockedBatch = await fetchJsonResponse(`${baseUrl}/api/data/batch`, {
        method: 'POST',
        token: bob.token,
        body: {
          operations: [
            { type: 'add', collection: 'project_activities', data: { projectId: project.doc.id, subject: 'partial' } },
            {
              type: 'add',
              collection: 'notifications',
              data: {
                recipientId: charlie.user.uid,
                type: 'kicked',
                title: 'Batch forged',
                projectId: project.doc.id,
                read: false,
                createdAt: 11,
              },
            },
          ],
        },
      });
      assert.equal(blockedBatch.status, 403);
      assert.equal(blockedBatch.body.error.code, 'data/forbidden');
      assert.deepEqual(await store.list('project_activities'), []);

      const adminNotification = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: admin.token,
        body: {
          collection: 'notifications',
          data: {
            recipientId: charlie.user.uid,
            type: 'system',
            title: 'Admin notice',
            read: true,
            createdAt: 12,
          },
        },
      });
      assert.equal(adminNotification.doc.recipientId, charlie.user.uid);
      assert.equal(adminNotification.doc.read, true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('HTTP data API rejects child writes against stopped and finished projects without partial writes', async () => {
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
      const member = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'member@example.com', password: 'secret123' },
      });

      const activeProject = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: { collection: 'projects', data: { title: 'Active', status: 'active', createdAt: 1 } },
      });
      const stoppedProject = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: { collection: 'projects', data: { title: 'Stopped', status: 'stopped', createdAt: 2 } },
      });
      const finishedProject = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: { collection: 'projects', data: { title: 'Finished', status: 'finished', createdAt: 3 } },
      });

      const activeItem = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: member.token,
        body: {
          collection: 'voting_items',
          data: { projectId: activeProject.doc.id, title: 'Allowed while active', creatorId: member.user.uid },
        },
      });
      assert.equal(activeItem.doc.projectId, activeProject.doc.id);

      const stoppedAdd = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: member.token,
        body: {
          collection: 'voting_items',
          data: { projectId: stoppedProject.doc.id, title: 'Should not persist', creatorId: member.user.uid },
        },
      });
      assert.equal(stoppedAdd.status, 409);
      assert.equal(stoppedAdd.body.error.code, 'data/project-locked');
      assert.deepEqual(await store.list('voting_items', {
        filters: [{ field: 'projectId', op: '==', value: stoppedProject.doc.id }],
      }), []);

      const finishedAdd = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: member.token,
        body: {
          collection: 'project_chats',
          data: { projectId: finishedProject.doc.id, userId: member.user.uid, text: 'Should not persist' },
        },
      });
      assert.equal(finishedAdd.status, 409);
      assert.equal(finishedAdd.body.error.code, 'data/project-locked');
      assert.deepEqual(await store.list('project_chats'), []);

      const stoppedQueueEntry = await store.add('queue_participants', {
        projectId: stoppedProject.doc.id,
        userId: member.user.uid,
        name: 'Member',
      });
      const stoppedUpdate = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: member.token,
        body: {
          collection: 'queue_participants',
          id: stoppedQueueEntry.id,
          data: { name: 'Mutated' },
        },
      });
      assert.equal(stoppedUpdate.status, 409);
      assert.equal(stoppedUpdate.body.error.code, 'data/project-locked');
      assert.equal((await store.get('queue_participants', stoppedQueueEntry.id)).name, 'Member');

      const activeMove = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: member.token,
        body: {
          collection: 'voting_items',
          id: activeItem.doc.id,
          data: { projectId: stoppedProject.doc.id },
        },
      });
      assert.equal(activeMove.status, 403);
      assert.equal(activeMove.body.error.code, 'data/forbidden');
      assert.equal((await store.get('voting_items', activeItem.doc.id)).projectId, activeProject.doc.id);

      const stoppedDelete = await fetchJsonResponse(`${baseUrl}/api/data/delete`, {
        method: 'POST',
        token: member.token,
        body: {
          collection: 'queue_participants',
          id: stoppedQueueEntry.id,
        },
      });
      assert.equal(stoppedDelete.status, 403);
      assert.equal(stoppedDelete.body.error.code, 'data/forbidden');
      assert.notEqual(await store.get('queue_participants', stoppedQueueEntry.id), null);

      const ownerCleanup = await fetchJson(`${baseUrl}/api/data/delete`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'queue_participants',
          id: stoppedQueueEntry.id,
        },
      });
      assert.equal(ownerCleanup.ok, true);
      assert.equal(await store.get('queue_participants', stoppedQueueEntry.id), null);

      const blockedBatch = await fetchJsonResponse(`${baseUrl}/api/data/batch`, {
        method: 'POST',
        token: member.token,
        body: {
          operations: [
            {
              type: 'add',
              collection: 'voting_items',
              data: { projectId: activeProject.doc.id, title: 'Batch partial', creatorId: member.user.uid },
            },
            {
              type: 'add',
              collection: 'booking_slots',
              data: { projectId: stoppedProject.doc.id, label: 'Locked slot' },
            },
          ],
        },
      });
      assert.equal(blockedBatch.status, 409);
      assert.equal(blockedBatch.body.error.code, 'data/project-locked');
      assert.deepEqual(await store.list('booking_slots'), []);
      assert.deepEqual(
        (await store.list('voting_items', {
          filters: [{ field: 'title', op: '==', value: 'Batch partial' }],
        })),
        [],
      );

      const auditActivity = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: member.token,
        body: {
          collection: 'project_activities',
          data: { projectId: stoppedProject.doc.id, subject: 'pause audit' },
        },
      });
      assert.equal(auditActivity.doc.projectId, stoppedProject.doc.id);
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
