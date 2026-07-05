import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { TRANSLATIONS } from '../src/constants/translations.js';

const root = process.cwd();

async function loadFriendDomain() {
  try {
    return await import('../src/lib/friendDomain.js');
  } catch {
    return {};
  }
}

test('friend request guard prevents duplicate, self, and existing relationships', async () => {
  const friendDomain = await loadFriendDomain();
  assert.equal(typeof friendDomain.createFriendRequestData, 'function');

  const currentUser = { uid: 'u1', displayName: 'Ada' };
  const targetUser = { uid: 'u2', displayName: 'Grace' };
  const existing = [
    { id: 'rel-1', members: ['u1', 'u3'], status: 'confirmed' },
    { id: 'rel-2', members: ['u4', 'u1'], status: 'pending' },
  ];

  assert.deepEqual(
    friendDomain.createFriendRequestData(existing, currentUser, targetUser, 1000),
    {
      members: ['u1', 'u2'],
      names: {
        u1: 'Ada',
        u2: 'Grace',
      },
      status: 'pending',
      initiator: 'u1',
      createdAt: 1000,
    },
  );

  assert.equal(
    friendDomain.createFriendRequestData(
      [...existing, { id: 'rel-3', members: ['u2', 'u1'], status: 'pending' }],
      currentUser,
      targetUser,
      1001,
    ),
    null,
    'existing pending request should block duplicate requests regardless of member order',
  );

  assert.equal(
    friendDomain.createFriendRequestData(
      [...existing, { id: 'rel-4', members: ['u1', 'u2'], status: 'confirmed' }],
      currentUser,
      targetUser,
      1002,
    ),
    null,
    'existing friendship should block new requests',
  );

  assert.equal(
    friendDomain.createFriendRequestData(existing, currentUser, { uid: 'u1', displayName: 'Ada' }, 1003),
    null,
    'users should not be able to send friend requests to themselves',
  );
});

test('friend system routes requests through the domain guard', async () => {
  const friendSystem = await readFile(path.join(root, 'src/components/FriendSystem.jsx'), 'utf8');

  assert.match(friendSystem, /createFriendRequestData/, 'FriendSystem should import and use the request guard');
  assert.match(friendSystem, /const \[relationships, setRelationships\] = useState\(\[\]\);/, 'FriendSystem should retain the full relationship snapshot');
  assert.match(friendSystem, /setRelationships\(all\);/, 'FriendSystem should update the full relationship snapshot from live data');
  assert.match(
    friendSystem,
    /const requestData = createFriendRequestData\(relationships, user, targetUser, nowMs\(\)\);/,
    'FriendSystem should derive friend request writes through the domain helper',
  );
  assert.match(friendSystem, /friendRequestUnavailable/, 'FriendSystem should show localized recovery copy when a duplicate request is blocked');
  assert.doesNotMatch(friendSystem, /Skipped for brevity|assume check done/, 'FriendSystem should not keep the duplicate-check placeholder');

  for (const key of ['friendRequestUnavailable']) {
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }
});
