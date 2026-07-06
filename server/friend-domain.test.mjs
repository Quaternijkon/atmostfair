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
  assert.equal(typeof friendDomain.getRemovableFriendshipId, 'function');
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

  assert.equal(friendDomain.getRemovableFriendshipId(confirmedFriend, currentUser), 'rel-confirmed');
  assert.equal(friendDomain.getRemovableFriendshipId(incomingRequest, currentUser), null, 'pending requests are handled by request rejection');
  assert.equal(friendDomain.getRemovableFriendshipId(unrelatedRequest, currentUser), null, 'non-members cannot remove unrelated friendships');

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
  assert.equal(
    friendDomain.createFriendMessageData(relationships, { id: 'rel-confirmed' }, currentUser, 'x'.repeat(1001), 2005),
    null,
    'overlong messages should not be written',
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

  for (const helper of ['createFriendAcceptPatch', 'getRejectableFriendRequestId', 'getRemovableFriendshipId', 'createFriendMessageData']) {
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
    /const removableId = getRemovableFriendshipId\(friend, user\);/,
    'removeFriend should derive the delete target through the friendship removal guard',
  );
  assert.match(
    friendSystem,
    /await deleteDoc\(doc\(db, 'friendships', removableId\)\);/,
    'removeFriend should only delete the guarded friendship id',
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

  for (const key of ['friendActionUnavailable', 'friendMessageTitle', 'friendRemoved']) {
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }
});

test('friend removal actions are confirmed, pending, and localized', async () => {
  const friendSystem = await readFile(path.join(root, 'src/components/FriendSystem.jsx'), 'utf8');

  for (const key of ['removeFriend', 'removeFriendConfirm', 'friendRemoved']) {
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
    assert.match(friendSystem, new RegExp(`t\\('${key}'`), `Friend system should localize ${key}`);
  }

  assert.match(friendSystem, /const \{ showToast, confirm \} = useUI\(\);/, 'Friend removal should use the app confirm dialog instead of native dialogs');
  assert.match(friendSystem, /runFriendAction\(`remove:\$\{friend\.id\}`/, 'Friend removal should run through the shared pending action guard');
  assert.match(friendSystem, /confirm\(\{[\s\S]{0,500}title:\s*t\('removeFriend'\)/, 'Friend removal should ask for confirmation');
  assert.match(friendSystem, /confirm\(\{[\s\S]{0,500}message:\s*t\('removeFriendConfirm'/, 'Friend removal confirmation should use localized copy');
  assert.match(friendSystem, /showToast\(t\('friendRemoved'\), 'success'\)/, 'Friend removal should show localized success feedback');
  assert.match(friendSystem, /setActiveChatFriend\(null\)/, 'Friend removal should leave stale chats safely');
  assert.match(friendSystem, /const isRemovingFriend = isFriendActionPending\(`remove:\$\{f\.id\}`\);/, 'Friend rows should expose removal pending state');
  assert.match(friendSystem, /aria-busy=\{isRemovingFriend\}/, 'Friend removal buttons should expose busy state');
  assert.match(friendSystem, /disabled=\{isRemovingFriend\}/, 'Friend removal buttons should be disabled while pending');
  assert.match(friendSystem, /isRemovingFriend \? t\('processing'\) : <Trash2/, 'Friend removal buttons should show localized progress copy');
  assert.doesNotMatch(friendSystem, /window\.confirm|confirm\(['"`]/, 'Friend removal should not use native confirm dialogs');
});

test('friend request actions prevent duplicate submits and expose pending state', async () => {
  const friendSystem = await readFile(path.join(root, 'src/components/FriendSystem.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.friendActionFailed, 'missing English friend action failure translation');
  assert.ok(TRANSLATIONS.zh.friendActionFailed, 'missing Chinese friend action failure translation');

  assert.match(friendSystem, /pendingFriendActionIdsRef\s*=\s*useRef\(new Set\(\)\)/, 'Friend actions should use a synchronous action lock');
  assert.match(friendSystem, /pendingFriendActionIdsRef\.current\.has\(actionId\)/, 'Friend actions should ignore duplicate clicks before state rerenders');
  assert.match(friendSystem, /setPendingFriendActionIds\(new Set\(pendingFriendActionIdsRef\.current\)\)/, 'Friend actions should expose pending state in React state');
  assert.match(friendSystem, /showToast\(t\('friendActionFailed'\), 'error'\)/, 'Friend action failures should use localized app feedback');
  assert.match(friendSystem, /runFriendAction\(`request:\$\{targetUser\.uid\}`/, 'Friend requests should run through the shared pending action guard');
  assert.match(friendSystem, /runFriendAction\(`accept:\$\{rel\.id\}`/, 'Friend accepts should run through the shared pending action guard');
  assert.match(friendSystem, /runFriendAction\(`reject:\$\{rel\.id\}`/, 'Friend rejects should run through the shared pending action guard');
  assert.match(friendSystem, /aria-busy=\{isAcceptingRequest\}/, 'Accept buttons should expose pending state to assistive technology');
  assert.match(friendSystem, /aria-busy=\{isRejectingRequest\}/, 'Reject buttons should expose pending state to assistive technology');
  assert.match(friendSystem, /aria-busy=\{isRequestingFriend\}/, 'Friend request buttons should expose pending state to assistive technology');
  assert.match(friendSystem, /disabled=\{isAcceptingRequest \|\| isRejectingRequest\}/, 'Request decision buttons should be disabled while either decision is pending');
  assert.match(friendSystem, /disabled=\{isRequestingFriend\}/, 'Friend request buttons should be disabled while sending');
  assert.match(friendSystem, /isAcceptingRequest \? t\('processing'\) : t\('accept'\)/, 'Accept buttons should show localized progress copy');
  assert.match(friendSystem, /isRejectingRequest \? t\('processing'\) : t\('ignore'\)/, 'Reject buttons should show localized progress copy');
  assert.match(friendSystem, /isRequestingFriend \? t\('processing'\) :/, 'Friend request buttons should show localized progress copy');
});

test('friend search prevents duplicate submits and exposes pending state', async () => {
  const friendSystem = await readFile(path.join(root, 'src/components/FriendSystem.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.friendSearchFailed, 'missing English friend search failure translation');
  assert.ok(TRANSLATIONS.zh.friendSearchFailed, 'missing Chinese friend search failure translation');

  assert.match(friendSystem, /\[isSearchingFriends,\s*setIsSearchingFriends\]\s*=\s*useState\(false\)/, 'Friend search should track pending requests');
  assert.match(friendSystem, /isSearchingFriendsRef\s*=\s*useRef\(false\)/, 'Friend search should use a synchronous search lock');
  assert.match(friendSystem, /if \(isSearchingFriendsRef\.current\) return;/, 'Friend search should ignore duplicate searches before rerender');
  assert.match(friendSystem, /isSearchingFriendsRef\.current = true[\s\S]{0,160}setIsSearchingFriends\(true\)/, 'Friend search should expose pending state before querying');
  assert.match(friendSystem, /finally \{[\s\S]{0,160}isSearchingFriendsRef\.current = false[\s\S]{0,120}setIsSearchingFriends\(false\)/, 'Friend search should clear pending state when it settles');
  assert.match(friendSystem, /showToast\(t\('friendSearchFailed'\), 'error'\)/, 'Friend search failures should use localized app feedback');
  assert.match(friendSystem, /disabled=\{isSearchingFriends\}/, 'Friend search input should be disabled while querying');
  assert.match(friendSystem, /disabled=\{!searchTerm\.trim\(\) \|\| isSearchingFriends\}/, 'Friend search button should be disabled for blank or pending searches');
  assert.match(friendSystem, /aria-busy=\{isSearchingFriends\}/, 'Friend search button should expose busy state');
  assert.match(friendSystem, /isSearchingFriends \? t\('processing'\) : t\('go'\)/, 'Friend search button should show localized progress copy');
});
