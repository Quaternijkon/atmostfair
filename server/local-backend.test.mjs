import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createAuthService } from './auth-service.mjs';
import { arrayRemove, arrayUnion, createDataStore } from './data-store.mjs';
import { createLocalBackendServer } from './local-backend.mjs';
import { PROJECT_ACTIVITY_TYPES } from '../src/lib/activityDomain.js';
import { PROJECT_CASCADE_COLLECTIONS, createProjectCascadeDeleteOperations } from '../src/lib/projectDomain.js';

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
            {
              type: 'add',
              collection: 'project_activities',
              data: {
                projectId: created.doc.id,
                type: PROJECT_ACTIVITY_TYPES.projectBriefUpdated,
                subject: 'partial write',
                createdAt: 2,
              },
            },
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

test('HTTP data API rejects invalid project state metadata and config payloads without partial writes', async () => {
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

      const invalidCreate = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'projects',
          data: { title: 'Impossible', status: 'banana', createdAt: 1 },
        },
      });
      assert.equal(invalidCreate.status, 400);
      assert.equal(invalidCreate.body.error.code, 'data/invalid-project-status');
      assert.deepEqual(await store.list('projects'), []);

      const project = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'projects',
          data: { title: 'Valid', status: 'active', createdAt: 2 },
        },
      });

      const invalidStatusUpdate = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'projects',
          id: project.doc.id,
          data: { status: 'paused' },
        },
      });
      assert.equal(invalidStatusUpdate.status, 400);
      assert.equal(invalidStatusUpdate.body.error.code, 'data/invalid-project-status');
      assert.equal((await store.get('projects', project.doc.id)).status, 'active');

      const invalidArchiveUpdate = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'projects',
          id: project.doc.id,
          data: { archived: 'yes', archivedAt: 'later' },
        },
      });
      assert.equal(invalidArchiveUpdate.status, 400);
      assert.equal(invalidArchiveUpdate.body.error.code, 'data/invalid-project-archive');
      assert.equal((await store.get('projects', project.doc.id)).archived, false);

      const invalidConfigCreate = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'projects',
          data: {
            title: 'Broken schedule',
            type: 'schedule',
            status: 'active',
            scheduleConfig: { mode: 'time', start: '2026-02-10', end: '2026-02-01' },
            createdAt: 3,
          },
        },
      });
      assert.equal(invalidConfigCreate.status, 400);
      assert.equal(invalidConfigCreate.body.error.code, 'data/invalid-project-config');
      assert.equal((await store.list('projects')).some((entry) => entry.title === 'Broken schedule'), false);

      const invalidVotingConfigUpdate = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'projects',
          id: project.doc.id,
          data: { votingConfig: { mode: 'ranked' } },
        },
      });
      assert.equal(invalidVotingConfigUpdate.status, 400);
      assert.equal(invalidVotingConfigUpdate.body.error.code, 'data/invalid-project-config');
      assert.equal(Object.hasOwn((await store.get('projects', project.doc.id)), 'votingConfig'), false);

      const validBookingConfigUpdate = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'projects',
          id: project.doc.id,
          data: {
            bookingConfig: {
              mode: 'date',
              start: '2026-02-01',
              end: '2026-02-03',
              requiredFields: ' Name, Name，Email ',
              unexpected: 'drop me',
            },
          },
        },
      });
      assert.deepEqual(validBookingConfigUpdate.doc.bookingConfig, {
        mode: 'date',
        start: '2026-02-01',
        end: '2026-02-03',
        requiredFields: 'Name, Email',
      });

      const blockedBatch = await fetchJsonResponse(`${baseUrl}/api/data/batch`, {
        method: 'POST',
        token: owner.token,
        body: {
          operations: [
            {
              type: 'add',
              collection: 'project_activities',
              data: {
                projectId: project.doc.id,
                type: PROJECT_ACTIVITY_TYPES.projectBriefUpdated,
                subject: 'partial write',
                createdAt: 3,
              },
            },
            {
              type: 'update',
              collection: 'projects',
              id: project.doc.id,
              data: { bookingConfig: { mode: 'slot', start: '2026-02-01', end: '2026-02-03' } },
            },
          ],
        },
      });
      assert.equal(blockedBatch.status, 400);
      assert.equal(blockedBatch.body.error.code, 'data/invalid-project-config');
      assert.equal((await store.get('projects', project.doc.id)).status, 'active');
      assert.deepEqual(await store.list('project_activities'), []);
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

      const pinUpdate = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'users',
          id: alice.user.uid,
          data: { pinnedProjectIds: ['project-1', ' project-2 ', 'project-1', '', null] },
        },
      });
      assert.deepEqual(pinUpdate.doc.pinnedProjectIds, ['project-1', 'project-2']);

      const invalidPins = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'users',
          id: alice.user.uid,
          data: { pinnedProjectIds: 'project-3' },
        },
      });
      assert.equal(invalidPins.status, 400);
      assert.equal(invalidPins.body.error.code, 'data/invalid-user-settings');
      assert.deepEqual((await store.get('users', alice.user.uid)).pinnedProjectIds, ['project-1', 'project-2']);

      const foreignPins = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'users',
          id: alice.user.uid,
          data: { pinnedProjectIds: ['project-3'] },
        },
      });
      assert.equal(foreignPins.status, 403);
      assert.deepEqual((await store.get('users', alice.user.uid)).pinnedProjectIds, ['project-1', 'project-2']);

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

      for (const data of [
        { title: '   ', content: 'No title', createdAt: 1 },
        { title: 'No content', content: '   ', createdAt: 1 },
        { title: 'Bad type', content: 'Unsupported type', type: 'critical', createdAt: 1 },
        { title: 'Bad active', content: 'Active must be boolean', active: 'yes', createdAt: 1 },
        { title: 'Bad window', content: 'Ends before it starts', startsAt: 3000, endsAt: 2000, createdAt: 1 },
        { title: 'Long title', content: 'Too long', createdAt: 1 },
      ].map((data) => (data.title === 'Long title' ? { ...data, title: 'x'.repeat(121) } : data))) {
        const invalid = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
          method: 'POST',
          token: admin.token,
          body: { collection: 'announcements', data },
        });
        assert.equal(invalid.status, 400);
        assert.equal(invalid.body.error.code, 'data/invalid-announcement');
      }

      const adminAdd = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: admin.token,
        body: {
          collection: 'announcements',
          data: { title: '  Release  ', content: '  Admin authored  ', type: 'warning', createdAt: 2 },
        },
      });
      assert.equal(adminAdd.doc.title, 'Release');
      assert.equal(adminAdd.doc.content, 'Admin authored');
      assert.equal(adminAdd.doc.type, 'warning');
      assert.equal(adminAdd.doc.active, true);
      assert.equal(adminAdd.doc.startsAt, null);
      assert.equal(adminAdd.doc.endsAt, null);

      const hiddenInactive = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: admin.token,
        body: {
          collection: 'announcements',
          data: { title: 'Inactive', content: 'Hidden inactive', active: false, createdAt: 5 },
        },
      });
      const hiddenFuture = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: admin.token,
        body: {
          collection: 'announcements',
          data: { title: 'Future', content: 'Hidden future', active: true, startsAt: 1700000100000, createdAt: 6 },
        },
      });
      const hiddenExpired = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: admin.token,
        body: {
          collection: 'announcements',
          data: { title: 'Expired', content: 'Hidden expired', active: true, endsAt: 1699999999999, createdAt: 7 },
        },
      });

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

      const visibleProject = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: user.token,
        body: { collection: 'projects', data: { title: 'Visible', status: 'active', createdAt: 3 } },
      });

      const blockedBatch = await fetchJsonResponse(`${baseUrl}/api/data/batch`, {
        method: 'POST',
        token: user.token,
        body: {
          operations: [
            {
              type: 'add',
              collection: 'project_activities',
              data: {
                projectId: visibleProject.doc.id,
                type: PROJECT_ACTIVITY_TYPES.projectCreated,
                subject: 'partial',
                createdAt: 4,
              },
            },
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

      const hiddenGet = await fetchJson(`${baseUrl}/api/data/get`, {
        method: 'POST',
        token: user.token,
        body: { collection: 'announcements', id: hiddenInactive.doc.id },
      });
      assert.equal(hiddenGet.doc, null);

      const adminReadable = await fetchJson(`${baseUrl}/api/data/list`, {
        method: 'POST',
        token: admin.token,
        body: { collection: 'announcements', query: {} },
      });
      assert.deepEqual(
        adminReadable.docs.map((entry) => entry.title).sort(),
        ['Expired', 'Future', 'Inactive', 'Release'],
      );

      const invalidUpdate = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: admin.token,
        body: {
          collection: 'announcements',
          id: adminAdd.doc.id,
          data: { title: '   ' },
        },
      });
      assert.equal(invalidUpdate.status, 400);
      assert.equal(invalidUpdate.body.error.code, 'data/invalid-announcement');
      assert.equal((await store.get('announcements', adminAdd.doc.id)).title, 'Release');

      const adminDelete = await fetchJson(`${baseUrl}/api/data/delete`, {
        method: 'POST',
        token: admin.token,
        body: { collection: 'announcements', id: adminAdd.doc.id },
      });
      assert.equal(adminDelete.ok, true);
      assert.equal(await store.get('announcements', adminAdd.doc.id), null);

      for (const id of [hiddenInactive.doc.id, hiddenFuture.doc.id, hiddenExpired.doc.id]) {
        await fetchJson(`${baseUrl}/api/data/delete`, {
          method: 'POST',
          token: admin.token,
          body: { collection: 'announcements', id },
        });
      }
      assert.deepEqual(await store.list('announcements'), []);
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

      const unconfirmedMessageNotification = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'notifications',
          data: {
            recipientId: bob.user.uid,
            type: 'friend_message',
            title: 'New message',
            message: 'pending chat',
            chatId: friendship.doc.id,
            read: true,
            createdAt: 5,
          },
        },
      });
      assert.equal(unconfirmedMessageNotification.status, 403);
      assert.equal(unconfirmedMessageNotification.body.error.code, 'data/forbidden');

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
            createdAt: 6,
          },
        },
      });
      assert.equal(duplicateFriendNotification.status, 409);
      assert.equal(duplicateFriendNotification.body.error.code, 'data/duplicate-notification');

      const confirmedFriendship = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: bob.token,
        body: { collection: 'friendships', id: friendship.doc.id, data: { status: 'confirmed' } },
      });
      assert.equal(confirmedFriendship.doc.status, 'confirmed');

      const forgedFriendMessageNotification = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: charlie.token,
        body: {
          collection: 'notifications',
          data: {
            recipientId: bob.user.uid,
            type: 'friend_message',
            title: 'Forged message',
            message: 'not a friend',
            chatId: friendship.doc.id,
            read: false,
            createdAt: 7,
          },
        },
      });
      assert.equal(forgedFriendMessageNotification.status, 403);
      assert.equal(forgedFriendMessageNotification.body.error.code, 'data/forbidden');

      const selfFriendMessageNotification = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'notifications',
          data: {
            recipientId: alice.user.uid,
            type: 'friend_message',
            title: 'Self message',
            message: 'self',
            chatId: friendship.doc.id,
            read: false,
            createdAt: 8,
          },
        },
      });
      assert.equal(selfFriendMessageNotification.status, 403);
      assert.equal(selfFriendMessageNotification.body.error.code, 'data/forbidden');

      const blankFriendMessageNotification = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'notifications',
          data: {
            recipientId: bob.user.uid,
            type: 'friend_message',
            title: 'Blank message',
            message: '   ',
            chatId: friendship.doc.id,
            read: false,
            createdAt: 9,
          },
        },
      });
      assert.equal(blankFriendMessageNotification.status, 400);
      assert.equal(blankFriendMessageNotification.body.error.code, 'data/invalid-message');

      const longFriendMessageNotification = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'notifications',
          data: {
            recipientId: bob.user.uid,
            type: 'friend_message',
            title: 'Long message',
            message: 'x'.repeat(1001),
            chatId: friendship.doc.id,
            read: false,
            createdAt: 10,
          },
        },
      });
      assert.equal(longFriendMessageNotification.status, 400);
      assert.equal(longFriendMessageNotification.body.error.code, 'data/invalid-message');

      const validFriendMessageNotification = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'notifications',
          data: {
            recipientId: bob.user.uid,
            type: 'friend_message',
            title: 'New message',
            message: '  Hello Bob  ',
            chatId: friendship.doc.id,
            senderId: charlie.user.uid,
            read: true,
            createdAt: 11,
          },
        },
      });
      assert.equal(validFriendMessageNotification.doc.recipientId, bob.user.uid);
      assert.equal(validFriendMessageNotification.doc.chatId, friendship.doc.id);
      assert.equal(validFriendMessageNotification.doc.senderId, alice.user.uid);
      assert.equal(validFriendMessageNotification.doc.read, false);
      assert.equal(validFriendMessageNotification.doc.message, 'Hello Bob');

      const project = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: { collection: 'projects', data: { title: 'Booking', status: 'active', createdAt: 12 } },
      });
      const stoppedProject = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: { collection: 'projects', data: { title: 'Stopped Booking', status: 'stopped', createdAt: 12 } },
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
            createdAt: 13,
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
            createdAt: 14,
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
            createdAt: 15,
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
            {
              type: 'add',
              collection: 'project_activities',
              data: {
                projectId: project.doc.id,
                type: PROJECT_ACTIVITY_TYPES.bookingCancelled,
                subject: 'partial',
                createdAt: 11,
              },
            },
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

test('HTTP data API rejects child writes against stopped, finished, and archived projects without partial writes', async () => {
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
      const archivedProject = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'projects',
          data: { title: 'Archived', status: 'active', archived: true, archivedAt: 4, createdAt: 4 },
        },
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

      const archivedAdd = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: member.token,
        body: {
          collection: 'voting_items',
          data: { projectId: archivedProject.doc.id, title: 'Should not persist', creatorId: member.user.uid },
        },
      });
      assert.equal(archivedAdd.status, 409);
      assert.equal(archivedAdd.body.error.code, 'data/project-locked');
      assert.deepEqual(await store.list('voting_items', {
        filters: [{ field: 'projectId', op: '==', value: archivedProject.doc.id }],
      }), []);

      const stoppedQueueEntry = await store.add('queue_participants', {
        projectId: stoppedProject.doc.id,
        uid: member.user.uid,
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
          data: {
            projectId: stoppedProject.doc.id,
            type: PROJECT_ACTIVITY_TYPES.projectPaused,
            subject: 'pause audit',
            createdAt: 4,
          },
        },
      });
      assert.equal(auditActivity.doc.projectId, stoppedProject.doc.id);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('HTTP data API normalizes project chat messages and keeps them append-only', async () => {
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
      const alice = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'alice@example.com', password: 'secret123' },
      });
      const bob = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'bob@example.com', password: 'secret123' },
      });
      const project = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: { collection: 'projects', data: { title: 'Chat rules', type: 'project', status: 'active', createdAt: 1 } },
      });

      const aliceMessage = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'project_chats',
          data: {
            projectId: project.doc.id,
            uid: bob.user.uid,
            name: 'Bob',
            text: '  Hello team  ',
            createdAt: 2,
          },
        },
      });
      assert.equal(aliceMessage.doc.uid, alice.user.uid);
      assert.equal(aliceMessage.doc.name, 'alice');
      assert.equal(aliceMessage.doc.text, 'Hello team');
      assert.equal(aliceMessage.doc.createdAt, 2);

      const blankMessage = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'project_chats',
          data: { projectId: project.doc.id, uid: bob.user.uid, name: 'Bob', text: '   ', createdAt: 3 },
        },
      });
      assert.equal(blankMessage.status, 400);
      assert.equal(blankMessage.body.error.code, 'data/invalid-message');
      assert.equal((await store.list('project_chats')).length, 1);

      const longMessage = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'project_chats',
          data: { projectId: project.doc.id, uid: bob.user.uid, name: 'Bob', text: 'x'.repeat(1001), createdAt: 4 },
        },
      });
      assert.equal(longMessage.status, 400);
      assert.equal(longMessage.body.error.code, 'data/invalid-message');
      assert.equal((await store.list('project_chats')).length, 1);

      const bobDeletesAlice = await fetchJsonResponse(`${baseUrl}/api/data/delete`, {
        method: 'POST',
        token: bob.token,
        body: { collection: 'project_chats', id: aliceMessage.doc.id },
      });
      assert.equal(bobDeletesAlice.status, 403);
      assert.equal(bobDeletesAlice.body.error.code, 'data/forbidden');
      assert.notEqual(await store.get('project_chats', aliceMessage.doc.id), null);

      const aliceEdit = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'project_chats',
          id: aliceMessage.doc.id,
          data: { text: 'Edited message' },
        },
      });
      assert.equal(aliceEdit.status, 403);
      assert.equal(aliceEdit.body.error.code, 'data/forbidden');
      assert.equal((await store.get('project_chats', aliceMessage.doc.id)).text, 'Hello team');

      const ownerSet = await fetchJsonResponse(`${baseUrl}/api/data/set`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'project_chats',
          id: aliceMessage.doc.id,
          data: { projectId: project.doc.id, uid: owner.user.uid, name: 'Owner', text: 'Moderated', createdAt: 5 },
        },
      });
      assert.equal(ownerSet.status, 403);
      assert.equal(ownerSet.body.error.code, 'data/forbidden');
      assert.equal((await store.get('project_chats', aliceMessage.doc.id)).text, 'Hello team');

      const bobMessage = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'project_chats',
          data: { projectId: project.doc.id, uid: alice.user.uid, name: 'Alice', text: 'Hi Alice', createdAt: 6 },
        },
      });
      assert.equal(bobMessage.doc.uid, bob.user.uid);
      assert.equal(bobMessage.doc.name, 'bob');
      assert.equal(bobMessage.doc.text, 'Hi Alice');

      const ownerDeletesBob = await fetchJson(`${baseUrl}/api/data/delete`, {
        method: 'POST',
        token: owner.token,
        body: { collection: 'project_chats', id: bobMessage.doc.id },
      });
      assert.equal(ownerDeletesBob.ok, true);
      assert.equal(await store.get('project_chats', bobMessage.doc.id), null);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('HTTP data API normalizes project activity records and keeps them append-only', async () => {
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
      const alice = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'alice@example.com', password: 'secret123', displayName: 'Alice Actual' },
      });
      const bob = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'bob@example.com', password: 'secret123', displayName: 'Bob Actual' },
      });
      const project = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: { collection: 'projects', data: { title: 'Activity rules', type: 'queue', status: 'active', createdAt: 1 } },
      });

      const activity = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'project_activities',
          data: {
            projectId: project.doc.id,
            type: PROJECT_ACTIVITY_TYPES.queueJoined,
            actorId: bob.user.uid,
            actorName: 'Bob Actual',
            subject: '  Queue spot  ',
            createdAt: 2,
            metadata: { value: 7 },
          },
        },
      });
      assert.equal(activity.doc.projectId, project.doc.id);
      assert.equal(activity.doc.type, PROJECT_ACTIVITY_TYPES.queueJoined);
      assert.equal(activity.doc.actorId, alice.user.uid);
      assert.equal(activity.doc.actorName, 'Alice Actual');
      assert.equal(activity.doc.subject, 'Queue spot');
      assert.deepEqual(activity.doc.metadata, { value: 7 });
      assert.equal(activity.doc.createdAt, 2);

      const unknownType = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'project_activities',
          data: {
            projectId: project.doc.id,
            type: 'mystery_event',
            actorId: alice.user.uid,
            actorName: 'Alice Actual',
            subject: 'Mystery',
            createdAt: 3,
          },
        },
      });
      assert.equal(unknownType.status, 400);
      assert.equal(unknownType.body.error.code, 'data/invalid-activity');
      assert.equal((await store.list('project_activities')).length, 1);

      const aliceEdit = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'project_activities',
          id: activity.doc.id,
          data: { subject: 'Edited audit' },
        },
      });
      assert.equal(aliceEdit.status, 403);
      assert.equal(aliceEdit.body.error.code, 'data/forbidden');
      assert.equal((await store.get('project_activities', activity.doc.id)).subject, 'Queue spot');

      const bobDeletesAlice = await fetchJsonResponse(`${baseUrl}/api/data/delete`, {
        method: 'POST',
        token: bob.token,
        body: { collection: 'project_activities', id: activity.doc.id },
      });
      assert.equal(bobDeletesAlice.status, 403);
      assert.equal(bobDeletesAlice.body.error.code, 'data/forbidden');
      assert.notEqual(await store.get('project_activities', activity.doc.id), null);

      const stoppedProject = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: { collection: 'projects', data: { title: 'Paused', type: 'queue', status: 'stopped', createdAt: 4 } },
      });
      const lockedActivity = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'project_activities',
          data: {
            projectId: stoppedProject.doc.id,
            type: PROJECT_ACTIVITY_TYPES.projectPaused,
            actorId: bob.user.uid,
            actorName: 'Bob Actual',
            subject: ' Paused ',
            createdAt: 5,
          },
        },
      });
      assert.equal(lockedActivity.doc.projectId, stoppedProject.doc.id);
      assert.equal(lockedActivity.doc.actorId, alice.user.uid);

      const ownerDeletesAlice = await fetchJson(`${baseUrl}/api/data/delete`, {
        method: 'POST',
        token: owner.token,
        body: { collection: 'project_activities', id: activity.doc.id },
      });
      assert.equal(ownerDeletesAlice.ok, true);
      assert.equal(await store.get('project_activities', activity.doc.id), null);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('HTTP data API normalizes participant identities and rejects duplicate direct entries', async () => {
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
      const alice = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'alice@example.com', password: 'secret123' },
      });
      const bob = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'bob@example.com', password: 'secret123' },
      });

      const queueProject = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: { collection: 'projects', data: { title: 'Queue', type: 'queue', status: 'active', createdAt: 1 } },
      });
      const queueEntry = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'queue_participants',
          data: {
            projectId: queueProject.doc.id,
            uid: alice.user.uid,
            name: 'Bob Alias',
            value: 7,
            queueOrder: 1,
            joinedAt: 10,
          },
        },
      });
      assert.equal(queueEntry.doc.uid, bob.user.uid);
      assert.equal(queueEntry.doc.name, 'Bob Alias');
      assert.equal(queueEntry.doc.queueOrder, null);

      const duplicateQueue = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'queue_participants',
          data: { projectId: queueProject.doc.id, uid: bob.user.uid, name: 'Bob Again', value: 9, joinedAt: 11 },
        },
      });
      assert.equal(duplicateQueue.status, 409);
      assert.equal(duplicateQueue.body.error.code, 'data/duplicate-entry');

      const rouletteProject = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: { collection: 'projects', data: { title: 'Roulette', type: 'roulette', status: 'active', createdAt: 2 } },
      });
      const rouletteEntry = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'roulette_participants',
          data: {
            projectId: rouletteProject.doc.id,
            uid: bob.user.uid,
            name: 'Alice Alias',
            value: 4,
            isWinner: true,
            joinedAt: 12,
          },
        },
      });
      assert.equal(rouletteEntry.doc.uid, alice.user.uid);
      assert.equal(rouletteEntry.doc.name, 'Alice Alias');
      assert.equal(rouletteEntry.doc.isWinner, false);

      const duplicateRoulette = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'roulette_participants',
          data: { projectId: rouletteProject.doc.id, uid: alice.user.uid, name: 'Alice Again', value: 5, joinedAt: 13 },
        },
      });
      assert.equal(duplicateRoulette.status, 409);
      assert.equal(duplicateRoulette.body.error.code, 'data/duplicate-entry');

      const gatherProject = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: { collection: 'projects', data: { title: 'Gather', type: 'gather', status: 'active', createdAt: 3 } },
      });
      const gatherSubmission = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'gather_submissions',
          data: {
            projectId: gatherProject.doc.id,
            uid: bob.user.uid,
            name: 'Alice Alias',
            data: { field: 'answer' },
            submittedAt: 20,
          },
        },
      });
      assert.equal(gatherSubmission.doc.uid, alice.user.uid);
      assert.equal(gatherSubmission.doc.name, 'Alice Alias');

      const duplicateGather = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'gather_submissions',
          data: { projectId: gatherProject.doc.id, uid: alice.user.uid, name: 'Alice Again', data: {}, submittedAt: 21 },
        },
      });
      assert.equal(duplicateGather.status, 409);
      assert.equal(duplicateGather.body.error.code, 'data/duplicate-entry');

      const scheduleProject = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: { collection: 'projects', data: { title: 'Schedule', type: 'schedule', status: 'active', createdAt: 4 } },
      });
      const scheduleSubmission = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'schedule_submissions',
          data: {
            projectId: scheduleProject.doc.id,
            uid: bob.user.uid,
            name: 'Alice Alias',
            availability: ['2026-07-05'],
            submittedAt: 30,
          },
        },
      });
      assert.equal(scheduleSubmission.doc.uid, alice.user.uid);
      assert.equal(scheduleSubmission.doc.name, 'Alice Alias');

      const duplicateSchedule = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'schedule_submissions',
          data: { projectId: scheduleProject.doc.id, uid: alice.user.uid, name: 'Alice Again', availability: [], submittedAt: 31 },
        },
      });
      assert.equal(duplicateSchedule.status, 409);
      assert.equal(duplicateSchedule.body.error.code, 'data/duplicate-entry');

      const aliceScheduleUpdate = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'schedule_submissions',
          id: scheduleSubmission.doc.id,
          data: { availability: ['2026-07-06'], submittedAt: 32 },
        },
      });
      assert.deepEqual(aliceScheduleUpdate.doc.availability, ['2026-07-06']);
      assert.equal(aliceScheduleUpdate.doc.uid, alice.user.uid);

      const bobScheduleUpdate = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'schedule_submissions',
          id: scheduleSubmission.doc.id,
          data: { availability: ['2026-07-07'], submittedAt: 33 },
        },
      });
      assert.equal(bobScheduleUpdate.status, 403);
      assert.equal(bobScheduleUpdate.body.error.code, 'data/forbidden');
      assert.deepEqual((await store.get('schedule_submissions', scheduleSubmission.doc.id)).availability, ['2026-07-06']);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('HTTP data API rejects unauthorized active project child deletes', async () => {
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
      const alice = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'alice@example.com', password: 'secret123' },
      });
      const bob = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'bob@example.com', password: 'secret123' },
      });

      const project = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: { collection: 'projects', data: { title: 'Active', status: 'active', createdAt: 1 } },
      });

      const votingItem = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'voting_items',
          data: { projectId: project.doc.id, title: 'Alice item', creatorId: alice.user.uid, votes: [], createdAt: 2 },
        },
      });
      const bobVotingDelete = await fetchJsonResponse(`${baseUrl}/api/data/delete`, {
        method: 'POST',
        token: bob.token,
        body: { collection: 'voting_items', id: votingItem.doc.id },
      });
      assert.equal(bobVotingDelete.status, 403);
      assert.equal(bobVotingDelete.body.error.code, 'data/forbidden');
      assert.notEqual(await store.get('voting_items', votingItem.doc.id), null);

      const aliceVotingDelete = await fetchJson(`${baseUrl}/api/data/delete`, {
        method: 'POST',
        token: alice.token,
        body: { collection: 'voting_items', id: votingItem.doc.id },
      });
      assert.equal(aliceVotingDelete.ok, true);
      assert.equal(await store.get('voting_items', votingItem.doc.id), null);

      const bookingSlot = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'booking_slots',
          data: { projectId: project.doc.id, start: '2026-07-05', end: '2026-07-05', label: 'Owner slot' },
        },
      });
      const bobSlotDelete = await fetchJsonResponse(`${baseUrl}/api/data/delete`, {
        method: 'POST',
        token: bob.token,
        body: { collection: 'booking_slots', id: bookingSlot.doc.id },
      });
      assert.equal(bobSlotDelete.status, 403);
      assert.equal(bobSlotDelete.body.error.code, 'data/forbidden');
      assert.notEqual(await store.get('booking_slots', bookingSlot.doc.id), null);

      const ownerSlotDelete = await fetchJson(`${baseUrl}/api/data/delete`, {
        method: 'POST',
        token: owner.token,
        body: { collection: 'booking_slots', id: bookingSlot.doc.id },
      });
      assert.equal(ownerSlotDelete.ok, true);
      assert.equal(await store.get('booking_slots', bookingSlot.doc.id), null);

      const queueEntry = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'queue_participants',
          data: { projectId: project.doc.id, name: 'Alice', value: 3, joinedAt: 3 },
        },
      });
      const bobQueueDelete = await fetchJsonResponse(`${baseUrl}/api/data/delete`, {
        method: 'POST',
        token: bob.token,
        body: { collection: 'queue_participants', id: queueEntry.doc.id },
      });
      assert.equal(bobQueueDelete.status, 403);
      assert.equal(bobQueueDelete.body.error.code, 'data/forbidden');
      assert.notEqual(await store.get('queue_participants', queueEntry.doc.id), null);

      const ownerQueueDelete = await fetchJson(`${baseUrl}/api/data/delete`, {
        method: 'POST',
        token: owner.token,
        body: { collection: 'queue_participants', id: queueEntry.doc.id },
      });
      assert.equal(ownerQueueDelete.ok, true);
      assert.equal(await store.get('queue_participants', queueEntry.doc.id), null);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('HTTP data API accepts app-generated project cascade delete batches', async () => {
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
      const bob = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'bob@example.com', password: 'secret123' },
      });
      const charlie = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'charlie@example.com', password: 'secret123' },
      });
      const project = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: { collection: 'projects', data: { title: 'Cascade', type: 'vote', status: 'active', createdAt: 1 } },
      });
      const item = await store.add('voting_items', {
        projectId: project.doc.id,
        title: 'Child vote',
        creatorId: owner.user.uid,
        creatorName: 'Owner',
        votes: [],
        createdAt: 2,
      });
      const gameRoom = await store.add('game_rooms', {
        projectId: project.doc.id,
        name: 'Cascade game',
        game: 'mine',
        createdBy: owner.user.uid,
        players: [],
        status: 'playing',
        config: { difficulty: 'easy' },
        createdAt: 3,
      });
      const activity = await store.add('project_activities', {
        projectId: project.doc.id,
        type: PROJECT_ACTIVITY_TYPES.projectCreated,
        actorId: owner.user.uid,
        actorName: 'Owner',
        subject: 'Cascade',
        metadata: {},
        createdAt: 4,
      });
      const notification = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'notifications',
          data: {
            recipientId: bob.user.uid,
            type: 'kicked',
            title: 'Cascade notice',
            projectId: project.doc.id,
            read: false,
            createdAt: 5,
          },
        },
      });
      const strangerNotifications = await fetchJson(`${baseUrl}/api/data/list`, {
        method: 'POST',
        token: charlie.token,
        body: {
          collection: 'notifications',
          query: { filters: [{ field: 'projectId', op: '==', value: project.doc.id }] },
        },
      });
      assert.deepEqual(strangerNotifications.docs, []);

      const docsByCollection = {
        projects: [project.doc],
      };
      for (const { name, field } of PROJECT_CASCADE_COLLECTIONS.filter(({ name }) => name !== 'projects')) {
        const listed = await fetchJson(`${baseUrl}/api/data/list`, {
          method: 'POST',
          token: owner.token,
          body: {
            collection: name,
            query: { filters: [{ field, op: '==', value: project.doc.id }] },
          },
        });
        docsByCollection[name] = listed.docs;
      }

      const operations = createProjectCascadeDeleteOperations(project.doc.id, docsByCollection);

      const deleted = await fetchJson(`${baseUrl}/api/data/batch`, {
        method: 'POST',
        token: owner.token,
        body: { operations },
      });

      assert.equal(deleted.results.length, operations.length);
      assert.equal(await store.get('voting_items', item.id), null);
      assert.equal(await store.get('game_rooms', gameRoom.id), null);
      assert.equal(await store.get('project_activities', activity.id), null);
      assert.equal(await store.get('notifications', notification.doc.id), null);
      assert.equal(await store.get('projects', project.doc.id), null);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('HTTP data API restricts room member writes to self-join and managed removal', async () => {
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
      const alice = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'alice@example.com', password: 'secret123' },
      });
      const bob = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'bob@example.com', password: 'secret123' },
      });
      const carol = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'carol@example.com', password: 'secret123' },
      });
      const project = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: { collection: 'projects', data: { title: 'Team rules', type: 'team', status: 'active', createdAt: 1 } },
      });

      const room = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'rooms',
          data: {
            projectId: project.doc.id,
            name: 'Red team',
            ownerId: bob.user.uid,
            maxMembers: 2,
            members: [
              { uid: bob.user.uid, name: 'Bob', joinedAt: 2 },
              { uid: carol.user.uid, name: 'Carol', joinedAt: 2 },
            ],
            createdAt: 2,
          },
        },
      });
      assert.equal(room.doc.ownerId, alice.user.uid);
      assert.deepEqual(room.doc.members, [{ uid: alice.user.uid, name: 'alice', joinedAt: 2 }]);

      const memberMetadataUpdate = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'rooms',
          id: room.doc.id,
          data: { name: 'Hijacked team', maxMembers: 99 },
        },
      });
      assert.equal(memberMetadataUpdate.status, 403);
      assert.equal(memberMetadataUpdate.body.error.code, 'data/forbidden');
      assert.equal((await store.get('rooms', room.doc.id)).name, 'Red team');

      const forgedJoin = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'rooms',
          id: room.doc.id,
          data: { members: arrayUnion({ uid: carol.user.uid, name: 'Carol', joinedAt: 3 }) },
        },
      });
      assert.equal(forgedJoin.status, 403);
      assert.equal(forgedJoin.body.error.code, 'data/forbidden');

      const bobMember = { uid: bob.user.uid, name: 'Bob', joinedAt: 4 };
      const bobJoin = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'rooms',
          id: room.doc.id,
          data: { members: arrayUnion(bobMember) },
        },
      });
      assert.deepEqual(bobJoin.doc.members, [
        { uid: alice.user.uid, name: 'alice', joinedAt: 2 },
        bobMember,
      ]);

      const carolOverCapacity = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: carol.token,
        body: {
          collection: 'rooms',
          id: room.doc.id,
          data: { members: arrayUnion({ uid: carol.user.uid, name: 'Carol', joinedAt: 5 }) },
        },
      });
      assert.equal(carolOverCapacity.status, 409);
      assert.equal(carolOverCapacity.body.error.code, 'data/room-full');

      const directRewrite = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: carol.token,
        body: {
          collection: 'rooms',
          id: room.doc.id,
          data: { members: [{ uid: carol.user.uid, name: 'Carol', joinedAt: 6 }] },
        },
      });
      assert.equal(directRewrite.status, 403);
      assert.equal(directRewrite.body.error.code, 'data/forbidden');

      const forgedRemoval = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: carol.token,
        body: {
          collection: 'rooms',
          id: room.doc.id,
          data: { members: arrayRemove(bobMember) },
        },
      });
      assert.equal(forgedRemoval.status, 403);
      assert.equal(forgedRemoval.body.error.code, 'data/forbidden');
      assert.deepEqual((await store.get('rooms', room.doc.id)).members, [
        { uid: alice.user.uid, name: 'alice', joinedAt: 2 },
        bobMember,
      ]);

      const bobLeave = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'rooms',
          id: room.doc.id,
          data: { members: arrayRemove(bobMember) },
        },
      });
      assert.deepEqual(bobLeave.doc.members, [{ uid: alice.user.uid, name: 'alice', joinedAt: 2 }]);

      await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'rooms',
          id: room.doc.id,
          data: { members: arrayUnion(bobMember) },
        },
      });

      const roomOwnerKick = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'rooms',
          id: room.doc.id,
          data: { members: arrayRemove(bobMember) },
        },
      });
      assert.deepEqual(roomOwnerKick.doc.members, [{ uid: alice.user.uid, name: 'alice', joinedAt: 2 }]);

      const projectOwnerMetadata = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'rooms',
          id: room.doc.id,
          data: { name: 'Blue team', maxMembers: 3 },
        },
      });
      assert.equal(projectOwnerMetadata.doc.name, 'Blue team');
      assert.equal(projectOwnerMetadata.doc.maxMembers, 3);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('HTTP data API restricts game room writes to current-player transitions', async () => {
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
      const alice = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'alice@example.com', password: 'secret123', displayName: 'Alice' },
      });
      const bob = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'bob@example.com', password: 'secret123', displayName: 'Bob' },
      });
      const carol = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'carol@example.com', password: 'secret123', displayName: 'Carol' },
      });
      const project = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: { collection: 'projects', data: { title: 'Game rules', type: 'game_hub', status: 'active', createdAt: 1 } },
      });

      const spoofedRoom = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'game_rooms',
          data: {
            projectId: project.doc.id,
            name: '  Spoofed match  ',
            game: 'rps',
            status: 'finished',
            createdBy: alice.user.uid,
            winnerId: alice.user.uid,
            players: [
              { uid: alice.user.uid, name: 'Alice', score: 9, move: 'rock' },
              { uid: carol.user.uid, name: 'Carol', score: 0, move: 'scissors' },
            ],
            config: { bestOf: 3, timeout: 30 },
            createdAt: 2,
          },
        },
      });
      assert.equal(spoofedRoom.doc.createdBy, bob.user.uid);
      assert.equal(spoofedRoom.doc.name, 'Spoofed match');
      assert.equal(spoofedRoom.doc.status, 'waiting');
      assert.deepEqual(spoofedRoom.doc.players, []);
      assert.equal(spoofedRoom.doc.winnerId, undefined);

      const rpsRoom = await store.add('game_rooms', {
        projectId: project.doc.id,
        name: 'RPS',
        game: 'rps',
        status: 'waiting',
        createdBy: alice.user.uid,
        players: [{ uid: alice.user.uid, name: 'Alice', score: 0, move: null }],
        config: { bestOf: 3, timeout: 30 },
        createdAt: 3,
      });
      const bobJoin = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'game_rooms',
          id: rpsRoom.id,
          data: {
            players: [
              { uid: alice.user.uid, name: 'Alice', score: 0, move: null },
              { uid: bob.user.uid, name: 'Bob', score: 0, move: null },
            ],
            status: 'playing',
            roundStartTime: 4,
            currentRound: 1,
          },
        },
      });
      assert.equal(bobJoin.doc.status, 'playing');
      assert.equal(bobJoin.doc.players[1].uid, bob.user.uid);

      const carolJoinFull = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: carol.token,
        body: {
          collection: 'game_rooms',
          id: rpsRoom.id,
          data: {
            players: [
              { uid: alice.user.uid, name: 'Alice', score: 0, move: null },
              { uid: bob.user.uid, name: 'Bob', score: 0, move: null },
              { uid: carol.user.uid, name: 'Carol', score: 0, move: null },
            ],
          },
        },
      });
      assert.equal(carolJoinFull.status, 409);
      assert.equal(carolJoinFull.body.error.code, 'data/game-full');

      const bobMovesAlice = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'game_rooms',
          id: rpsRoom.id,
          data: {
            players: [
              { uid: alice.user.uid, name: 'Alice', score: 1, move: 'paper' },
              { uid: bob.user.uid, name: 'Bob', score: 0, move: 'rock' },
            ],
            status: 'showdown',
            history: [{ round: 1, p1Move: 'paper', p2Move: 'rock', winnerId: alice.user.uid, timestamp: 5 }],
            showdownEndTime: 8,
          },
        },
      });
      assert.equal(bobMovesAlice.status, 403);
      assert.equal(bobMovesAlice.body.error.code, 'data/forbidden');
      assert.equal((await store.get('game_rooms', rpsRoom.id)).players[0].move, null);

      const bobMove = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'game_rooms',
          id: rpsRoom.id,
          data: {
            players: [
              { uid: alice.user.uid, name: 'Alice', score: 0, move: null },
              { uid: bob.user.uid, name: 'Bob', score: 0, move: 'rock' },
            ],
          },
        },
      });
      assert.equal(bobMove.doc.players[1].move, 'rock');

      const aliceShowdown = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'game_rooms',
          id: rpsRoom.id,
          data: {
            players: [
              { uid: alice.user.uid, name: 'Alice', score: 0, move: 'scissors' },
              { uid: bob.user.uid, name: 'Bob', score: 1, move: 'rock' },
            ],
            history: [{ round: 1, p1Move: 'scissors', p2Move: 'rock', winnerId: bob.user.uid, timestamp: 7 }],
            status: 'showdown',
            showdownEndTime: 10,
          },
        },
      });
      assert.equal(aliceShowdown.doc.status, 'showdown');
      assert.equal(aliceShowdown.doc.players[1].score, 1);

      const aliceNextRound = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'game_rooms',
          id: rpsRoom.id,
          data: {
            status: 'playing',
            currentRound: 2,
            roundStartTime: 11,
            players: [
              { uid: alice.user.uid, name: 'Alice', score: 0, move: null, lastMove: 'scissors' },
              { uid: bob.user.uid, name: 'Bob', score: 1, move: null, lastMove: 'rock' },
            ],
          },
        },
      });
      assert.equal(aliceNextRound.doc.currentRound, 2);
      assert.equal(aliceNextRound.doc.players[0].move, null);

      const mineRoom = await store.add('game_rooms', {
        projectId: project.doc.id,
        name: 'Mine',
        game: 'mine',
        status: 'playing',
        createdBy: alice.user.uid,
        players: [
          { uid: alice.user.uid, name: 'Alice', progress: 0, status: 'playing' },
          { uid: bob.user.uid, name: 'Bob', progress: 0, status: 'playing' },
        ],
        config: { difficulty: 'easy', rows: 9, cols: 9, mines: 10, mineLocations: [] },
        createdAt: 6,
      });

      const bobWinsForAlice = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'game_rooms',
          id: mineRoom.id,
          data: {
            players: [
              { uid: alice.user.uid, name: 'Alice', progress: 100, status: 'won' },
              { uid: bob.user.uid, name: 'Bob', progress: 0, status: 'playing' },
            ],
          },
        },
      });
      assert.equal(bobWinsForAlice.status, 403);
      assert.equal(bobWinsForAlice.body.error.code, 'data/forbidden');

      const bobProgress = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'game_rooms',
          id: mineRoom.id,
          data: {
            players: [
              { uid: alice.user.uid, name: 'Alice', progress: 0, status: 'playing' },
              { uid: bob.user.uid, name: 'Bob', progress: 42, status: 'playing' },
            ],
          },
        },
      });
      assert.equal(bobProgress.doc.players[1].progress, 42);

      const bobLowersProgress = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'game_rooms',
          id: mineRoom.id,
          data: {
            players: [
              { uid: alice.user.uid, name: 'Alice', progress: 0, status: 'playing' },
              { uid: bob.user.uid, name: 'Bob', progress: 12, status: 'playing' },
            ],
          },
        },
      });
      assert.equal(bobLowersProgress.status, 403);
      assert.equal((await store.get('game_rooms', mineRoom.id)).players[1].progress, 42);

      const bobWinsEarly = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'game_rooms',
          id: mineRoom.id,
          data: {
            players: [
              { uid: alice.user.uid, name: 'Alice', progress: 0, status: 'playing' },
              { uid: bob.user.uid, name: 'Bob', progress: 99, status: 'won' },
            ],
          },
        },
      });
      assert.equal(bobWinsEarly.status, 403);

      const bobWins = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'game_rooms',
          id: mineRoom.id,
          data: {
            players: [
              { uid: alice.user.uid, name: 'Alice', progress: 0, status: 'playing' },
              { uid: bob.user.uid, name: 'Bob', progress: 100, status: 'won' },
            ],
          },
        },
      });
      assert.equal(bobWins.doc.status, 'finished');
      assert.equal(bobWins.doc.winnerId, bob.user.uid);
      assert.equal(bobWins.doc.finishedAt, 1700000000000);
      assert.deepEqual(bobWins.doc.resultSummary, {
        game: 'mine',
        status: 'finished',
        winnerId: bob.user.uid,
        winnerName: 'Bob',
        roundsPlayed: 0,
        scoreLine: '100%',
        playerCount: 2,
      });
      assert.equal(bobWins.doc.players[1].status, 'won');
      assert.equal(bobWins.doc.players[1].progress, 100);

      const bobRevives = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'game_rooms',
          id: mineRoom.id,
          data: {
            players: [
              { uid: alice.user.uid, name: 'Alice', progress: 0, status: 'playing' },
              { uid: bob.user.uid, name: 'Bob', progress: 100, status: 'playing' },
            ],
          },
        },
      });
      assert.equal(bobRevives.status, 403);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('HTTP data API restricts managed child creation to project owners and normalizes runtime fields', async () => {
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
      const project = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: { collection: 'projects', data: { title: 'Managed children', type: 'gather', status: 'active', createdAt: 1 } },
      });

      for (const body of [
        {
          collection: 'gather_fields',
          data: { projectId: project.doc.id, label: 'Injected field', type: 'text', creatorId: member.user.uid },
        },
        {
          collection: 'booking_slots',
          data: {
            projectId: project.doc.id,
            start: '2026-07-05',
            end: '2026-07-05',
            label: 'Injected slot',
            bookedBy: member.user.uid,
            waitlist: [{ uid: member.user.uid }],
          },
        },
        {
          collection: 'claim_items',
          data: {
            projectId: project.doc.id,
            title: 'Injected claim',
            maxClaims: 3,
            creatorId: member.user.uid,
            claimants: [{ uid: member.user.uid }],
          },
        },
      ]) {
        const response = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
          method: 'POST',
          token: member.token,
          body,
        });
        assert.equal(response.status, 403);
        assert.equal(response.body.error.code, 'data/forbidden');
      }

      assert.deepEqual(await store.list('gather_fields'), []);
      assert.deepEqual(await store.list('booking_slots'), []);
      assert.deepEqual(await store.list('claim_items'), []);

      const field = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'gather_fields',
          data: { projectId: project.doc.id, label: 'Owner field', type: 'text', creatorId: member.user.uid, createdAt: 2 },
        },
      });
      assert.equal(field.doc.creatorId, owner.user.uid);

      const slot = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'booking_slots',
          data: {
            projectId: project.doc.id,
            start: '2026-07-05',
            end: '2026-07-05',
            label: 'Owner slot',
            bookedBy: member.user.uid,
            bookerName: 'Member',
            bookingData: { phone: '123' },
            bookedAt: 3,
            waitlist: [{ uid: member.user.uid }],
            createdAt: 3,
          },
        },
      });
      assert.equal(slot.doc.bookedBy, null);
      assert.equal(slot.doc.bookerName, null);
      assert.equal(slot.doc.bookingData, null);
      assert.equal(slot.doc.bookedAt, null);
      assert.deepEqual(slot.doc.waitlist, []);

      const memberBooking = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: member.token,
        body: {
          collection: 'booking_slots',
          id: slot.doc.id,
          data: {
            bookedBy: member.user.uid,
            bookerName: 'Member',
            bookingData: { phone: '123' },
            bookedAt: 5,
          },
        },
      });
      assert.equal(memberBooking.doc.bookedBy, member.user.uid);

      const claim = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'claim_items',
          data: {
            projectId: project.doc.id,
            title: 'Owner claim',
            maxClaims: 2,
            creatorId: member.user.uid,
            creatorName: 'Member',
            claimants: [{ uid: member.user.uid }],
            createdAt: 4,
          },
        },
      });
      assert.equal(claim.doc.creatorId, owner.user.uid);
      assert.equal(claim.doc.creatorName, 'owner');
      assert.deepEqual(claim.doc.claimants, []);

      const memberClaim = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: member.token,
        body: {
          collection: 'claim_items',
          id: claim.doc.id,
          data: { claimants: arrayUnion({ uid: member.user.uid, name: 'Member', at: 6 }) },
        },
      });
      assert.deepEqual(memberClaim.doc.claimants, [{ uid: member.user.uid, name: 'Member', at: 6 }]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('HTTP data API rejects invalid project child display text without partial writes', async () => {
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
      const project = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: { collection: 'projects', data: { title: 'Display text rules', type: 'vote', status: 'active', createdAt: 1 } },
      });
      const longText = 'x'.repeat(121);

      for (const body of [
        { collection: 'voting_items', data: { projectId: project.doc.id, title: '   ', createdAt: 2 } },
        { collection: 'voting_items', data: { projectId: project.doc.id, title: longText, createdAt: 3 } },
        { collection: 'rooms', data: { projectId: project.doc.id, name: '', maxMembers: 4, createdAt: 4 } },
        { collection: 'rooms', data: { projectId: project.doc.id, name: longText, maxMembers: 4, createdAt: 5 } },
        { collection: 'gather_fields', data: { projectId: project.doc.id, label: '', type: 'text', createdAt: 6 } },
        { collection: 'gather_fields', data: { projectId: project.doc.id, label: longText, type: 'text', createdAt: 7 } },
        { collection: 'booking_slots', data: { projectId: project.doc.id, start: '2026-07-05', end: '2026-07-05', label: '', createdAt: 8 } },
        { collection: 'booking_slots', data: { projectId: project.doc.id, start: '2026-07-06', end: '2026-07-06', label: longText, createdAt: 9 } },
        { collection: 'claim_items', data: { projectId: project.doc.id, title: '', maxClaims: 1, createdAt: 10 } },
        { collection: 'claim_items', data: { projectId: project.doc.id, title: longText, maxClaims: 1, createdAt: 11 } },
      ]) {
        const response = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
          method: 'POST',
          token: owner.token,
          body,
        });
        assert.equal(response.status, 400);
        assert.equal(response.body.error.code, 'data/invalid-project-child-text');
      }

      assert.deepEqual(await store.list('voting_items'), []);
      assert.deepEqual(await store.list('rooms'), []);
      assert.deepEqual(await store.list('gather_fields'), []);
      assert.deepEqual(await store.list('booking_slots'), []);
      assert.deepEqual(await store.list('claim_items'), []);

      const vote = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: { collection: 'voting_items', data: { projectId: project.doc.id, title: '  Valid vote  ', createdAt: 12 } },
      });
      assert.equal(vote.doc.title, 'Valid vote');

      const room = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: { collection: 'rooms', data: { projectId: project.doc.id, name: '  Valid room  ', maxMembers: 4, createdAt: 13 } },
      });
      assert.equal(room.doc.name, 'Valid room');

      const slot = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'booking_slots',
          data: { projectId: project.doc.id, start: '2026-07-07', end: '2026-07-07', label: '  Valid slot  ', createdAt: 14 },
        },
      });
      assert.equal(slot.doc.label, 'Valid slot');

      for (const body of [
        { collection: 'voting_items', id: vote.doc.id, data: { title: longText } },
        { collection: 'rooms', id: room.doc.id, data: { name: longText } },
        { collection: 'booking_slots', id: slot.doc.id, data: { label: longText } },
      ]) {
        const response = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
          method: 'POST',
          token: owner.token,
          body,
        });
        assert.equal(response.status, 400);
        assert.equal(response.body.error.code, 'data/invalid-project-child-text');
      }

      assert.equal((await store.get('voting_items', vote.doc.id)).title, 'Valid vote');
      assert.equal((await store.get('rooms', room.doc.id)).name, 'Valid room');
      assert.equal((await store.get('booking_slots', slot.doc.id)).label, 'Valid slot');

      const blockedBatch = await fetchJsonResponse(`${baseUrl}/api/data/batch`, {
        method: 'POST',
        token: owner.token,
        body: {
          operations: [
            {
              type: 'add',
              collection: 'voting_items',
              data: { projectId: project.doc.id, title: 'Should not persist', createdAt: 15 },
            },
            {
              type: 'add',
              collection: 'claim_items',
              data: { projectId: project.doc.id, title: longText, maxClaims: 1, createdAt: 16 },
            },
          ],
        },
      });
      assert.equal(blockedBatch.status, 400);
      assert.equal(blockedBatch.body.error.code, 'data/invalid-project-child-text');
      assert.deepEqual(
        (await store.list('voting_items', { filters: [{ field: 'projectId', op: '==', value: project.doc.id }] }))
          .map((item) => item.title),
        ['Valid vote'],
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('HTTP data API restricts booking slot updates to booking and waitlist guards', async () => {
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
      const alice = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'alice@example.com', password: 'secret123' },
      });
      const bob = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'bob@example.com', password: 'secret123' },
      });
      const carol = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'carol@example.com', password: 'secret123' },
      });
      const project = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: { collection: 'projects', data: { title: 'Booking rules', type: 'book', status: 'active', createdAt: 1 } },
      });

      const slot = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'booking_slots',
          data: { projectId: project.doc.id, start: '2026-07-05', end: '2026-07-05', label: 'Morning', createdAt: 2 },
        },
      });

      const memberMetadataUpdate = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'booking_slots',
          id: slot.doc.id,
          data: { label: 'Hijacked slot' },
        },
      });
      assert.equal(memberMetadataUpdate.status, 403);
      assert.equal(memberMetadataUpdate.body.error.code, 'data/forbidden');
      assert.equal((await store.get('booking_slots', slot.doc.id)).label, 'Morning');

      const forgedBooking = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'booking_slots',
          id: slot.doc.id,
          data: {
            bookedBy: bob.user.uid,
            bookerName: 'Bob',
            bookingData: { phone: '222' },
            bookedAt: 3,
          },
        },
      });
      assert.equal(forgedBooking.status, 403);
      assert.equal(forgedBooking.body.error.code, 'data/forbidden');

      const forgedOpenWaitlist = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'booking_slots',
          id: slot.doc.id,
          data: { waitlist: [{ uid: bob.user.uid, name: 'Bob', bookingData: { phone: '222' }, joinedAt: 4 }] },
        },
      });
      assert.equal(forgedOpenWaitlist.status, 403);
      assert.equal(forgedOpenWaitlist.body.error.code, 'data/forbidden');

      const aliceBooking = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'booking_slots',
          id: slot.doc.id,
          data: {
            bookedBy: alice.user.uid,
            bookerName: 'Alice',
            bookingData: { phone: '111' },
            bookedAt: 5,
          },
        },
      });
      assert.equal(aliceBooking.doc.bookedBy, alice.user.uid);
      assert.equal(aliceBooking.doc.bookerName, 'Alice');
      assert.deepEqual(aliceBooking.doc.bookingData, { phone: '111' });

      const stealBooking = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'booking_slots',
          id: slot.doc.id,
          data: {
            bookedBy: bob.user.uid,
            bookerName: 'Bob',
            bookingData: { phone: '222' },
            bookedAt: 6,
          },
        },
      });
      assert.equal(stealBooking.status, 409);
      assert.equal(stealBooking.body.error.code, 'data/slot-booked');

      const bobWaitlist = [{ uid: bob.user.uid, name: 'Bob', bookingData: { phone: '222' }, joinedAt: 7 }];
      const bobJoinWaitlist = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'booking_slots',
          id: slot.doc.id,
          data: { waitlist: bobWaitlist },
        },
      });
      assert.deepEqual(bobJoinWaitlist.doc.waitlist, bobWaitlist);

      const forgedWaitlistRewrite = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: carol.token,
        body: {
          collection: 'booking_slots',
          id: slot.doc.id,
          data: {
            waitlist: [
              { uid: bob.user.uid, name: 'Changed Bob', bookingData: { phone: '999' }, joinedAt: 7 },
              { uid: carol.user.uid, name: 'Carol', bookingData: { phone: '333' }, joinedAt: 8 },
            ],
          },
        },
      });
      assert.equal(forgedWaitlistRewrite.status, 403);
      assert.equal(forgedWaitlistRewrite.body.error.code, 'data/forbidden');
      assert.deepEqual((await store.get('booking_slots', slot.doc.id)).waitlist, bobWaitlist);

      const forgedRelease = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'booking_slots',
          id: slot.doc.id,
          data: {
            bookedBy: bob.user.uid,
            bookerName: 'Bob',
            bookingData: { phone: '222' },
            bookedAt: 9,
            waitlist: [],
          },
        },
      });
      assert.equal(forgedRelease.status, 403);
      assert.equal(forgedRelease.body.error.code, 'data/forbidden');

      const ownerRelease = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'booking_slots',
          id: slot.doc.id,
          data: {
            bookedBy: bob.user.uid,
            bookerName: 'Bob',
            bookingData: { phone: '222' },
            bookedAt: 10,
            waitlist: [],
          },
        },
      });
      assert.equal(ownerRelease.doc.bookedBy, bob.user.uid);
      assert.equal(ownerRelease.doc.bookerName, 'Bob');
      assert.deepEqual(ownerRelease.doc.bookingData, { phone: '222' });
      assert.deepEqual(ownerRelease.doc.waitlist, []);

      const ownerMetadataUpdate = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'booking_slots',
          id: slot.doc.id,
          data: { label: 'Updated morning' },
        },
      });
      assert.equal(ownerMetadataUpdate.doc.label, 'Updated morning');
      assert.equal(ownerMetadataUpdate.doc.bookedBy, bob.user.uid);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('HTTP data API restricts claim item updates to current-user claim toggles', async () => {
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
      const alice = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'alice@example.com', password: 'secret123' },
      });
      const bob = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'bob@example.com', password: 'secret123' },
      });
      const project = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: { collection: 'projects', data: { title: 'Claim rules', type: 'claim', status: 'active', createdAt: 1 } },
      });

      const claim = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'claim_items',
          data: {
            projectId: project.doc.id,
            title: 'Bring snacks',
            maxClaims: 1,
            creatorId: bob.user.uid,
            claimants: [{ uid: bob.user.uid, name: 'Bob', at: 2 }],
            createdAt: 2,
          },
        },
      });
      assert.equal(claim.doc.creatorId, owner.user.uid);
      assert.deepEqual(claim.doc.claimants, []);

      const memberMetadataUpdate = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'claim_items',
          id: claim.doc.id,
          data: { title: 'Hijacked title', maxClaims: 99 },
        },
      });
      assert.equal(memberMetadataUpdate.status, 403);
      assert.equal(memberMetadataUpdate.body.error.code, 'data/forbidden');
      assert.equal((await store.get('claim_items', claim.doc.id)).title, 'Bring snacks');

      const forgedDirectClaimants = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'claim_items',
          id: claim.doc.id,
          data: { claimants: [{ uid: alice.user.uid, name: 'Alice', at: 3 }, { uid: bob.user.uid, name: 'Bob', at: 3 }] },
        },
      });
      assert.equal(forgedDirectClaimants.status, 403);
      assert.equal(forgedDirectClaimants.body.error.code, 'data/forbidden');

      const forgedOtherClaim = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'claim_items',
          id: claim.doc.id,
          data: { claimants: arrayUnion({ uid: bob.user.uid, name: 'Bob', at: 4 }) },
        },
      });
      assert.equal(forgedOtherClaim.status, 403);
      assert.equal(forgedOtherClaim.body.error.code, 'data/forbidden');

      const aliceClaimant = { uid: alice.user.uid, name: 'Alice', at: 5 };
      const aliceClaim = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'claim_items',
          id: claim.doc.id,
          data: { claimants: arrayUnion(aliceClaimant) },
        },
      });
      assert.deepEqual(aliceClaim.doc.claimants, [aliceClaimant]);

      const overCapacityClaim = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'claim_items',
          id: claim.doc.id,
          data: { claimants: arrayUnion({ uid: bob.user.uid, name: 'Bob', at: 6 }) },
        },
      });
      assert.equal(overCapacityClaim.status, 409);
      assert.equal(overCapacityClaim.body.error.code, 'data/claim-full');
      assert.deepEqual((await store.get('claim_items', claim.doc.id)).claimants, [aliceClaimant]);

      const forgedRemoval = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'claim_items',
          id: claim.doc.id,
          data: { claimants: arrayRemove(aliceClaimant) },
        },
      });
      assert.equal(forgedRemoval.status, 403);
      assert.equal(forgedRemoval.body.error.code, 'data/forbidden');
      assert.deepEqual((await store.get('claim_items', claim.doc.id)).claimants, [aliceClaimant]);

      const aliceDrop = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'claim_items',
          id: claim.doc.id,
          data: { claimants: arrayRemove(aliceClaimant) },
        },
      });
      assert.deepEqual(aliceDrop.doc.claimants, []);

      const ownerMetadataUpdate = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'claim_items',
          id: claim.doc.id,
          data: { title: 'Updated snacks', maxClaims: 2 },
        },
      });
      assert.equal(ownerMetadataUpdate.doc.title, 'Updated snacks');
      assert.equal(ownerMetadataUpdate.doc.maxClaims, 2);
      assert.deepEqual(ownerMetadataUpdate.doc.claimants, []);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('HTTP data API restricts voting item writes to current-user vote toggles', async () => {
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
      const alice = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'alice@example.com', password: 'secret123' },
      });
      const bob = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'bob@example.com', password: 'secret123' },
      });
      const project = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'projects',
          data: { title: 'Single vote', type: 'vote', status: 'active', votingConfig: { mode: 'single' }, createdAt: 1 },
        },
      });

      const firstItem = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'voting_items',
          data: {
            projectId: project.doc.id,
            title: 'First',
            creatorId: bob.user.uid,
            creatorName: 'Alice Display',
            votes: [bob.user.uid],
            createdAt: 2,
          },
        },
      });
      assert.equal(firstItem.doc.creatorId, alice.user.uid);
      assert.equal(firstItem.doc.creatorName, 'Alice Display');
      assert.deepEqual(firstItem.doc.votes, []);

      const secondItem = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'voting_items',
          data: { projectId: project.doc.id, title: 'Second', votes: [bob.user.uid], createdAt: 3 },
        },
      });
      assert.deepEqual(secondItem.doc.votes, []);

      const forgedDirectVotes = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'voting_items',
          id: firstItem.doc.id,
          data: { votes: [alice.user.uid, bob.user.uid] },
        },
      });
      assert.equal(forgedDirectVotes.status, 403);
      assert.equal(forgedDirectVotes.body.error.code, 'data/forbidden');

      const forgedOtherUserVote = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'voting_items',
          id: firstItem.doc.id,
          data: { votes: arrayUnion(bob.user.uid) },
        },
      });
      assert.equal(forgedOtherUserVote.status, 403);
      assert.equal(forgedOtherUserVote.body.error.code, 'data/forbidden');

      const firstVote = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'voting_items',
          id: firstItem.doc.id,
          data: { votes: arrayUnion(alice.user.uid) },
        },
      });
      assert.deepEqual(firstVote.doc.votes, [alice.user.uid]);

      const singleModeBypass = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'voting_items',
          id: secondItem.doc.id,
          data: { votes: arrayUnion(alice.user.uid) },
        },
      });
      assert.equal(singleModeBypass.status, 403);
      assert.equal(singleModeBypass.body.error.code, 'data/forbidden');

      const singleModeSwitch = await fetchJson(`${baseUrl}/api/data/batch`, {
        method: 'POST',
        token: alice.token,
        body: {
          operations: [
            {
              type: 'update',
              collection: 'voting_items',
              id: firstItem.doc.id,
              data: { votes: arrayRemove(alice.user.uid) },
            },
            {
              type: 'update',
              collection: 'voting_items',
              id: secondItem.doc.id,
              data: { votes: arrayUnion(alice.user.uid) },
            },
          ],
        },
      });
      assert.deepEqual(singleModeSwitch.results[0].votes, []);
      assert.deepEqual(singleModeSwitch.results[1].votes, [alice.user.uid]);

      const forgedRemoval = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'voting_items',
          id: secondItem.doc.id,
          data: { votes: arrayRemove(alice.user.uid) },
        },
      });
      assert.equal(forgedRemoval.status, 403);
      assert.equal(forgedRemoval.body.error.code, 'data/forbidden');
      assert.deepEqual((await store.get('voting_items', secondItem.doc.id)).votes, [alice.user.uid]);
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

test('HTTP data API hides private project contents until password unlock', async () => {
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
        body: { email: 'owner@example.com', password: 'secret123', displayName: 'Owner' },
      });
      const viewer = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'viewer@example.com', password: 'secret123', displayName: 'Viewer' },
      });
      const admin = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'quaternijkon@mail.ustc.edu.cn', password: 'secret123', displayName: 'Admin' },
      });

      const privateProject = await store.add('projects', {
        title: 'Secret Plan',
        type: 'vote',
        creatorId: owner.user.uid,
        creatorName: 'Owner',
        password: 'open-sesame',
        brief: 'Hidden launch plan',
        votingConfig: { mode: 'single' },
        createdAt: 1,
      });
      const publicProject = await store.add('projects', {
        title: 'Public Plan',
        type: 'vote',
        creatorId: owner.user.uid,
        creatorName: 'Owner',
        password: '',
        brief: 'Visible launch plan',
        createdAt: 2,
      });
      const privateItem = await store.add('voting_items', {
        projectId: privateProject.id,
        title: 'Secret option',
        creatorId: owner.user.uid,
        creatorName: 'Owner',
        votes: [],
        createdAt: 3,
      });
      const publicItem = await store.add('voting_items', {
        projectId: publicProject.id,
        title: 'Public option',
        creatorId: owner.user.uid,
        creatorName: 'Owner',
        votes: [],
        createdAt: 4,
      });

      const viewerProjectsBefore = await fetchJson(`${baseUrl}/api/data/list`, {
        method: 'POST',
        token: viewer.token,
        body: { collection: 'projects', query: {} },
      });
      const privatePreview = viewerProjectsBefore.docs.find((entry) => entry.id === privateProject.id);
      assert.equal(privatePreview.title, 'Secret Plan');
      assert.equal(privatePreview.type, 'vote');
      assert.equal(privatePreview.hasPassword, true);
      assert.equal(privatePreview.accessGranted, false);
      assert.equal(Object.hasOwn(privatePreview, 'password'), false);
      assert.equal(Object.hasOwn(privatePreview, 'brief'), false);
      assert.equal(Object.hasOwn(privatePreview, 'votingConfig'), false);
      assert.equal(
        viewerProjectsBefore.docs.find((entry) => entry.id === publicProject.id).brief,
        'Visible launch plan',
      );

      const viewerPrivateBefore = await fetchJson(`${baseUrl}/api/data/get`, {
        method: 'POST',
        token: viewer.token,
        body: { collection: 'projects', id: privateProject.id },
      });
      assert.equal(viewerPrivateBefore.doc.hasPassword, true);
      assert.equal(viewerPrivateBefore.doc.accessGranted, false);
      assert.equal(Object.hasOwn(viewerPrivateBefore.doc, 'password'), false);
      assert.equal(Object.hasOwn(viewerPrivateBefore.doc, 'brief'), false);

      const viewerItemsBefore = await fetchJson(`${baseUrl}/api/data/list`, {
        method: 'POST',
        token: viewer.token,
        body: { collection: 'voting_items', query: {} },
      });
      assert.deepEqual(viewerItemsBefore.docs.map((entry) => entry.id), [publicItem.id]);

      const viewerPrivateItemBefore = await fetchJson(`${baseUrl}/api/data/get`, {
        method: 'POST',
        token: viewer.token,
        body: { collection: 'voting_items', id: privateItem.id },
      });
      assert.equal(viewerPrivateItemBefore.doc, null);

      const blockedPrivateItem = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: viewer.token,
        body: {
          collection: 'voting_items',
          data: {
            projectId: privateProject.id,
            title: 'Intrusion option',
            createdAt: 5,
          },
        },
      });
      assert.equal(blockedPrivateItem.status, 403);
      assert.equal(blockedPrivateItem.body.error.code, 'data/forbidden');

      const ownerProject = await fetchJson(`${baseUrl}/api/data/get`, {
        method: 'POST',
        token: owner.token,
        body: { collection: 'projects', id: privateProject.id },
      });
      assert.equal(ownerProject.doc.brief, 'Hidden launch plan');
      assert.equal(ownerProject.doc.hasPassword, true);
      assert.equal(ownerProject.doc.accessGranted, true);
      assert.equal(Object.hasOwn(ownerProject.doc, 'password'), false);

      const adminItems = await fetchJson(`${baseUrl}/api/data/list`, {
        method: 'POST',
        token: admin.token,
        body: { collection: 'voting_items', query: {} },
      });
      assert.deepEqual(
        adminItems.docs.map((entry) => entry.id).sort(),
        [privateItem.id, publicItem.id].sort(),
      );

      const wrongUnlock = await fetchJsonResponse(`${baseUrl}/api/project-access/unlock`, {
        method: 'POST',
        token: viewer.token,
        body: { projectId: privateProject.id, password: 'wrong-password' },
      });
      assert.equal(wrongUnlock.status, 403);
      assert.equal(wrongUnlock.body.error.code, 'project-access/invalid-password');

      const unlock = await fetchJson(`${baseUrl}/api/project-access/unlock`, {
        method: 'POST',
        token: viewer.token,
        body: { projectId: privateProject.id, password: 'open-sesame' },
      });
      assert.equal(unlock.ok, true);
      assert.equal(unlock.project.brief, 'Hidden launch plan');
      assert.equal(unlock.project.hasPassword, true);
      assert.equal(unlock.project.accessGranted, true);
      assert.equal(Object.hasOwn(unlock.project, 'password'), false);

      const viewerPrivateAfter = await fetchJson(`${baseUrl}/api/data/get`, {
        method: 'POST',
        token: viewer.token,
        body: { collection: 'projects', id: privateProject.id },
      });
      assert.equal(viewerPrivateAfter.doc.brief, 'Hidden launch plan');
      assert.equal(viewerPrivateAfter.doc.votingConfig.mode, 'single');
      assert.equal(viewerPrivateAfter.doc.accessGranted, true);
      assert.equal(Object.hasOwn(viewerPrivateAfter.doc, 'password'), false);

      const viewerItemsAfter = await fetchJson(`${baseUrl}/api/data/list`, {
        method: 'POST',
        token: viewer.token,
        body: { collection: 'voting_items', query: {} },
      });
      assert.deepEqual(
        viewerItemsAfter.docs.map((entry) => entry.id).sort(),
        [privateItem.id, publicItem.id].sort(),
      );

      const allowedPrivateItem = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: viewer.token,
        body: {
          collection: 'voting_items',
          data: {
            projectId: privateProject.id,
            title: 'Unlocked option',
            createdAt: 6,
          },
        },
      });
      assert.equal(allowedPrivateItem.doc.creatorId, viewer.user.uid);
      assert.equal(allowedPrivateItem.doc.title, 'Unlocked option');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('HTTP data API revokes private project unlock grants when password changes', async () => {
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
        body: { email: 'owner@example.com', password: 'secret123', displayName: 'Owner' },
      });
      const viewer = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'viewer@example.com', password: 'secret123', displayName: 'Viewer' },
      });

      const privateProject = await store.add('projects', {
        title: 'Secret Plan',
        type: 'vote',
        creatorId: owner.user.uid,
        creatorName: 'Owner',
        password: 'first-secret',
        brief: 'Hidden launch plan',
        votingConfig: { mode: 'single' },
        createdAt: 1,
      });
      const privateItem = await store.add('voting_items', {
        projectId: privateProject.id,
        title: 'Secret option',
        creatorId: owner.user.uid,
        creatorName: 'Owner',
        votes: [],
        createdAt: 2,
      });

      const firstUnlock = await fetchJson(`${baseUrl}/api/project-access/unlock`, {
        method: 'POST',
        token: viewer.token,
        body: { projectId: privateProject.id, password: 'first-secret' },
      });
      assert.equal(firstUnlock.project.accessGranted, true);

      const viewerBeforePasswordChange = await fetchJson(`${baseUrl}/api/data/get`, {
        method: 'POST',
        token: viewer.token,
        body: { collection: 'projects', id: privateProject.id },
      });
      assert.equal(viewerBeforePasswordChange.doc.brief, 'Hidden launch plan');

      const ownerUpdate = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'projects',
          id: privateProject.id,
          data: { password: 'second-secret', updatedAt: 3 },
        },
      });
      assert.equal(ownerUpdate.doc.hasPassword, true);
      assert.equal(ownerUpdate.doc.accessGranted, true);
      assert.equal(Object.hasOwn(ownerUpdate.doc, 'password'), false);

      const viewerAfterPasswordChange = await fetchJson(`${baseUrl}/api/data/get`, {
        method: 'POST',
        token: viewer.token,
        body: { collection: 'projects', id: privateProject.id },
      });
      assert.equal(viewerAfterPasswordChange.doc.hasPassword, true);
      assert.equal(viewerAfterPasswordChange.doc.accessGranted, false);
      assert.equal(Object.hasOwn(viewerAfterPasswordChange.doc, 'brief'), false);
      assert.equal(Object.hasOwn(viewerAfterPasswordChange.doc, 'votingConfig'), false);
      assert.equal(Object.hasOwn(viewerAfterPasswordChange.doc, 'password'), false);

      const viewerItemsAfterPasswordChange = await fetchJson(`${baseUrl}/api/data/list`, {
        method: 'POST',
        token: viewer.token,
        body: { collection: 'voting_items', query: {} },
      });
      assert.equal(
        viewerItemsAfterPasswordChange.docs.some((entry) => entry.id === privateItem.id),
        false,
      );

      const staleUnlock = await fetchJsonResponse(`${baseUrl}/api/project-access/unlock`, {
        method: 'POST',
        token: viewer.token,
        body: { projectId: privateProject.id, password: 'first-secret' },
      });
      assert.equal(staleUnlock.status, 403);
      assert.equal(staleUnlock.body.error.code, 'project-access/invalid-password');

      const freshUnlock = await fetchJson(`${baseUrl}/api/project-access/unlock`, {
        method: 'POST',
        token: viewer.token,
        body: { projectId: privateProject.id, password: 'second-secret' },
      });
      assert.equal(freshUnlock.project.accessGranted, true);
      assert.equal(freshUnlock.project.brief, 'Hidden launch plan');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('HTTP data API preserves private project passwords during authorized duplication', async () => {
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
        body: { email: 'owner@example.com', password: 'secret123', displayName: 'Owner' },
      });
      const viewer = await fetchJson(`${baseUrl}/api/auth/email/register`, {
        method: 'POST',
        body: { email: 'viewer@example.com', password: 'secret123', displayName: 'Viewer' },
      });

      const privateProject = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'projects',
          data: {
            title: 'Private Source',
            type: 'vote',
            creatorId: owner.user.uid,
            creatorName: 'Owner',
            password: 'source-secret',
            brief: 'Reusable private context',
            votingConfig: { mode: 'single' },
            createdAt: 1,
            winners: [],
          },
        },
      });
      assert.equal(privateProject.doc.hasPassword, true);
      assert.equal(Object.hasOwn(privateProject.doc, 'password'), false);

      const ownerSource = await fetchJson(`${baseUrl}/api/data/get`, {
        method: 'POST',
        token: owner.token,
        body: { collection: 'projects', id: privateProject.doc.id },
      });
      assert.equal(ownerSource.doc.hasPassword, true);
      assert.equal(Object.hasOwn(ownerSource.doc, 'password'), false);

      const forgedDuplicate = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: viewer.token,
        body: {
          collection: 'projects',
          data: {
            title: 'Forged Private Copy',
            type: 'vote',
            creatorId: viewer.user.uid,
            creatorName: 'Viewer',
            password: '',
            duplicateSourceId: privateProject.doc.id,
            createdAt: 2,
            winners: [],
          },
        },
      });
      assert.equal(forgedDuplicate.status, 403);
      assert.equal(forgedDuplicate.body.error.code, 'data/forbidden');

      const duplicate = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: owner.token,
        body: {
          collection: 'projects',
          data: {
            title: 'Private Source (Copy)',
            type: 'vote',
            creatorId: owner.user.uid,
            creatorName: 'Owner',
            password: '',
            duplicateSourceId: privateProject.doc.id,
            brief: ownerSource.doc.brief,
            votingConfig: ownerSource.doc.votingConfig,
            status: 'active',
            createdAt: 3,
            winners: [],
          },
        },
      });
      assert.equal(duplicate.doc.hasPassword, true);
      assert.equal(duplicate.doc.accessGranted, true);
      assert.equal(Object.hasOwn(duplicate.doc, 'password'), false);
      assert.equal(Object.hasOwn(duplicate.doc, 'duplicateSourceId'), false);

      const rawDuplicate = await store.get('projects', duplicate.doc.id);
      assert.equal(rawDuplicate.password, 'source-secret');
      assert.equal(Object.hasOwn(rawDuplicate, 'duplicateSourceId'), false);

      const viewerPreview = await fetchJson(`${baseUrl}/api/data/get`, {
        method: 'POST',
        token: viewer.token,
        body: { collection: 'projects', id: duplicate.doc.id },
      });
      assert.equal(viewerPreview.doc.hasPassword, true);
      assert.equal(viewerPreview.doc.accessGranted, false);
      assert.equal(Object.hasOwn(viewerPreview.doc, 'brief'), false);
      assert.equal(Object.hasOwn(viewerPreview.doc, 'password'), false);

      const unlockDuplicate = await fetchJson(`${baseUrl}/api/project-access/unlock`, {
        method: 'POST',
        token: viewer.token,
        body: { projectId: duplicate.doc.id, password: 'source-secret' },
      });
      assert.equal(unlockDuplicate.ok, true);
      assert.equal(unlockDuplicate.project.brief, 'Reusable private context');

      const batchPrivateProject = await fetchJson(`${baseUrl}/api/data/batch`, {
        method: 'POST',
        token: owner.token,
        body: {
          operations: [
            {
              type: 'add',
              collection: 'projects',
              data: {
                title: 'Batch Private',
                type: 'vote',
                creatorId: owner.user.uid,
                creatorName: 'Owner',
                password: 'batch-secret',
                createdAt: 4,
                winners: [],
              },
            },
          ],
        },
      });
      assert.equal(batchPrivateProject.results[0].hasPassword, true);
      assert.equal(batchPrivateProject.results[0].accessGranted, true);
      assert.equal(Object.hasOwn(batchPrivateProject.results[0], 'password'), false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('HTTP data API rejects duplicate friendships and keeps friend messages append-only', async () => {
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

      const request = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'friendships',
          data: {
            members: [alice.user.uid, bob.user.uid],
            names: { [alice.user.uid]: 'Alice', [bob.user.uid]: 'Bob' },
            status: 'pending',
            initiator: alice.user.uid,
            createdAt: 1,
          },
        },
      });
      const confirmed = await fetchJson(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: bob.token,
        body: { collection: 'friendships', id: request.doc.id, data: { status: 'confirmed' } },
      });
      assert.equal(confirmed.doc.status, 'confirmed');

      const duplicateForward = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'friendships',
          data: {
            members: [alice.user.uid, bob.user.uid],
            names: { [alice.user.uid]: 'Alice', [bob.user.uid]: 'Bob' },
            status: 'pending',
            initiator: alice.user.uid,
            createdAt: 2,
          },
        },
      });
      assert.equal(duplicateForward.status, 409);
      assert.equal(duplicateForward.body.error.code, 'data/duplicate-friendship');

      const duplicateReverse = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: bob.token,
        body: {
          collection: 'friendships',
          data: {
            members: [bob.user.uid, alice.user.uid],
            names: { [alice.user.uid]: 'Alice', [bob.user.uid]: 'Bob' },
            status: 'pending',
            initiator: bob.user.uid,
            createdAt: 3,
          },
        },
      });
      assert.equal(duplicateReverse.status, 409);
      assert.equal(duplicateReverse.body.error.code, 'data/duplicate-friendship');
      assert.equal((await store.list('friendships')).length, 1);

      const strangerMessage = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: charlie.token,
        body: {
          collection: 'friend_messages',
          data: { chatId: request.doc.id, senderId: charlie.user.uid, text: 'forged', createdAt: 4 },
        },
      });
      assert.equal(strangerMessage.status, 403);
      assert.equal(strangerMessage.body.error.code, 'data/forbidden');

      const blankMessage = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'friend_messages',
          data: { chatId: request.doc.id, senderId: alice.user.uid, text: '   ', createdAt: 5 },
        },
      });
      assert.equal(blankMessage.status, 400);
      assert.equal(blankMessage.body.error.code, 'data/invalid-message');

      const longMessage = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'friend_messages',
          data: { chatId: request.doc.id, senderId: alice.user.uid, text: 'x'.repeat(1001), createdAt: 6 },
        },
      });
      assert.equal(longMessage.status, 400);
      assert.equal(longMessage.body.error.code, 'data/invalid-message');
      assert.deepEqual(await store.list('friend_messages'), []);

      const sentMessage = await fetchJson(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'friend_messages',
          data: { chatId: request.doc.id, senderId: bob.user.uid, text: '  hello Bob  ', createdAt: 7 },
        },
      });
      assert.equal(sentMessage.doc.senderId, alice.user.uid);
      assert.equal(sentMessage.doc.text, 'hello Bob');

      const editMessage = await fetchJsonResponse(`${baseUrl}/api/data/update`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'friend_messages',
          id: sentMessage.doc.id,
          data: { text: 'rewritten', createdAt: 8 },
        },
      });
      assert.equal(editMessage.status, 403);
      assert.equal(editMessage.body.error.code, 'data/forbidden');
      assert.equal((await store.get('friend_messages', sentMessage.doc.id)).text, 'hello Bob');

      await fetchJson(`${baseUrl}/api/data/delete`, {
        method: 'POST',
        token: alice.token,
        body: { collection: 'friendships', id: request.doc.id },
      });
      const staleChatMessage = await fetchJsonResponse(`${baseUrl}/api/data/add`, {
        method: 'POST',
        token: alice.token,
        body: {
          collection: 'friend_messages',
          data: { chatId: request.doc.id, senderId: alice.user.uid, text: 'after delete', createdAt: 9 },
        },
      });
      assert.equal(staleChatMessage.status, 403);
      assert.equal(staleChatMessage.body.error.code, 'data/forbidden');
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
