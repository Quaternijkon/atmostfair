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

test('friend relationship guards reject stale or unauthorized actions', async () => {
  const friendDomain = await loadFriendDomain();
  assert.equal(typeof friendDomain.createFriendAcceptPatch, 'function');
  assert.equal(typeof friendDomain.getRejectableFriendRequestId, 'function');
  assert.equal(typeof friendDomain.createFriendMessageData, 'function');

  const currentUser = { uid: 'u1', displayName: 'Ada' };
  const incomingRequest = { id: 'rel-incoming', members: ['u1', 'u2'], status: 'pending', initiator: 'u2' };
  const outgoingRequest = { id: 'rel-outgoing', members: ['u1', 'u3'], status: 'pending', initiator: 'u1' };
  const confirmedFriend = { id: 'rel-confirmed', members: ['u1', 'u4'], status: 'confirmed', initiator: 'u4' };
  const unrelatedRequest = { id: 'rel-unrelated', members: ['u5', 'u6'], status: 'pending', initiator: 'u5' };

  assert.deepEqual(friendDomain.createFriendAcceptPatch(incomingRequest, currentUser), { status: 'confirmed' });
  assert.equal(friendDomain.createFriendAcceptPatch(outgoingRequest, currentUser), null, 'initiators cannot accept their own sent requests');
  assert.equal(friendDomain.createFriendAcceptPatch(confirmedFriend, currentUser), null, 'confirmed relationships cannot be accepted again');
  assert.equal(friendDomain.createFriendAcceptPatch(unrelatedRequest, currentUser), null, 'non-members cannot accept requests');

  assert.equal(friendDomain.getRejectableFriendRequestId(incomingRequest, currentUser), 'rel-incoming');
  assert.equal(friendDomain.getRejectableFriendRequestId(outgoingRequest, currentUser), null, 'initiators cannot use the recipient ignore action');
  assert.equal(friendDomain.getRejectableFriendRequestId(confirmedFriend, currentUser), null, 'confirmed friendships cannot be deleted through request rejection');
  assert.equal(friendDomain.getRejectableFriendRequestId(unrelatedRequest, currentUser), null, 'non-members cannot reject requests');

  const relationships = [incomingRequest, outgoingRequest, confirmedFriend, unrelatedRequest];
  assert.deepEqual(
    friendDomain.createFriendMessageData(relationships, { id: 'rel-confirmed' }, currentUser, '  hello  ', 2000),
    {
      chatId: 'rel-confirmed',
      text: 'hello',
      senderId: 'u1',
      createdAt: 2000,
    },
  );
  assert.equal(
    friendDomain.createFriendMessageData(relationships, { id: 'rel-incoming' }, currentUser, 'hello', 2001),
    null,
    'pending relationships cannot receive messages',
  );
  assert.equal(
    friendDomain.createFriendMessageData(relationships, { id: 'rel-unrelated' }, currentUser, 'hello', 2002),
    null,
    'relationships that do not include the user cannot receive messages',
  );
  assert.equal(
    friendDomain.createFriendMessageData(relationships, { id: 'missing' }, currentUser, 'hello', 2003),
    null,
    'stale active chats must resolve against the current relationship snapshot',
  );
  assert.equal(
    friendDomain.createFriendMessageData(relationships, { id: 'rel-confirmed' }, currentUser, '   ', 2004),
    null,
    'blank messages should not be written',
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

test('friend system routes relationship writes through authorization guards', async () => {
  const friendSystem = await readFile(path.join(root, 'src/components/FriendSystem.jsx'), 'utf8');

  for (const helper of ['createFriendAcceptPatch', 'getRejectableFriendRequestId', 'createFriendMessageData']) {
    assert.match(friendSystem, new RegExp(helper), `FriendSystem should import and use ${helper}`);
  }
  assert.match(
    friendSystem,
    /const acceptPatch = createFriendAcceptPatch\(rel, user\);/,
    'acceptRequest should derive the update payload through the accept guard',
  );
  assert.match(
    friendSystem,
    /await updateDoc\(doc\(db, 'friendships', rel\.id\), acceptPatch\);/,
    'acceptRequest should only write the guarded accept patch',
  );
  assert.match(
    friendSystem,
    /const rejectableId = getRejectableFriendRequestId\(rel, user\);/,
    'rejectRequest should derive the delete target through the reject guard',
  );
  assert.match(
    friendSystem,
    /await deleteDoc\(doc\(db, 'friendships', rejectableId\)\);/,
    'rejectRequest should only delete the guarded request id',
  );
  assert.match(
    friendSystem,
    /const messageData = createFriendMessageData\(relationships, activeChatFriend, user, chatInput, nowMs\(\)\);/,
    'sendMessage should derive message writes from current relationships and active chat',
  );
  assert.match(
    friendSystem,
    /await addDoc\(collection\(db, 'friend_messages'\), messageData\);/,
    'sendMessage should write only the guarded message payload',
  );
  assert.match(
    friendSystem,
    /await addDoc\(collection\(db, 'notifications'\),[\s\S]{0,500}type:\s*'friend_message'/,
    'sendMessage should create a notification for the recipient',
  );
  assert.match(
    friendSystem,
    /recipientId:\s*activeChatFriend\.otherId/,
    'friend message notifications should target the active chat recipient',
  );
  assert.match(
    friendSystem,
    /title:\s*t\('friendMessageTitle'[\s\S]{0,120}currentUserName\(\)/,
    'friend message notifications should use localized sender-aware titles',
  );

  for (const key of ['friendActionUnavailable', 'friendMessageTitle']) {
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }
});
