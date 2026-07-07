import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { TRANSLATIONS } from '../src/constants/translations.js';
import {
  createClearReadNotificationOperations,
  createMarkFriendChatNotificationsReadOperations,
  createMarkNotificationReadOperation,
  createMarkNotificationsReadOperations,
} from '../src/lib/notificationDomain.js';

const root = process.cwd();

test('mark all read only updates unread notifications', () => {
  const operations = createMarkNotificationsReadOperations([
    { id: 'n1', read: false },
    { id: 'n2', read: true },
    { id: 'n3' },
  ]);

  assert.deepEqual(operations, [
    { type: 'update', collection: 'notifications', id: 'n1', data: { read: true } },
    { type: 'update', collection: 'notifications', id: 'n3', data: { read: true } },
  ]);
});

test('single notification read only updates an unread notification from the current snapshot', () => {
  const notifications = [
    { id: 'n1', read: false },
    { id: 'n2', read: true },
  ];

  assert.deepEqual(createMarkNotificationReadOperation(notifications, 'n1'), {
    type: 'update',
    collection: 'notifications',
    id: 'n1',
    data: { read: true },
  });
  assert.equal(createMarkNotificationReadOperation(notifications, 'n2'), null, 'already-read notifications should not be rewritten');
  assert.equal(createMarkNotificationReadOperation(notifications, 'missing'), null, 'stale or foreign ids must not be written');
});

test('clear read deletes only read notifications', () => {
  const operations = createClearReadNotificationOperations([
    { id: 'n1', read: false },
    { id: 'n2', read: true },
    { id: 'n3', read: true },
  ]);

  assert.deepEqual(operations, [
    { type: 'delete', collection: 'notifications', id: 'n2' },
    { type: 'delete', collection: 'notifications', id: 'n3' },
  ]);
});

test('friend chat read operations update only unread matching message notifications', () => {
  const operations = createMarkFriendChatNotificationsReadOperations([
    { id: 'n1', type: 'friend_message', chatId: 'chat-1', read: false },
    { id: 'n2', type: 'friend_message', chatId: 'chat-1', read: true },
    { id: 'n3', type: 'friend_message', chatId: 'chat-2', read: false },
    { id: 'n4', type: 'friend_req', chatId: 'chat-1', read: false },
  ], 'chat-1');

  assert.deepEqual(operations, [
    { type: 'update', collection: 'notifications', id: 'n1', data: { read: true } },
  ]);
  assert.deepEqual(createMarkFriendChatNotificationsReadOperations([{ id: 'n5', type: 'friend_message', chatId: 'chat-1' }], ''), []);
});

test('notification operations normalize legacy chat ids and read flags', () => {
  assert.deepEqual(createMarkFriendChatNotificationsReadOperations([
    { id: 'n1', type: 'friend_message', chatId: ' chat-1 ', read: false },
    { id: 'n2', type: 'friend_message', chatId: 'chat-1', read: 'false' },
    { id: 'n3', type: 'friend_message', chatId: 'chat-1', read: true },
  ], 'chat-1'), [
    { type: 'update', collection: 'notifications', id: 'n1', data: { read: true } },
    { type: 'update', collection: 'notifications', id: 'n2', data: { read: true } },
  ]);

  assert.deepEqual(createMarkNotificationsReadOperations([
    { id: 'n1', read: 'false' },
    { id: 'n2', read: true },
  ]), [
    { type: 'update', collection: 'notifications', id: 'n1', data: { read: true } },
  ]);

  assert.deepEqual(createClearReadNotificationOperations([
    { id: 'n1', read: 'false' },
    { id: 'n2', read: true },
  ]), [
    { type: 'delete', collection: 'notifications', id: 'n2' },
  ]);
});

test('notification center exposes bulk read and clear-read actions', async () => {
  const app = await readFile(path.join(root, 'src/App.jsx'), 'utf8');

  for (const helper of ['createMarkNotificationReadOperation', 'createMarkNotificationsReadOperations', 'createClearReadNotificationOperations']) {
    assert.match(app, new RegExp(helper), `App should use ${helper}`);
  }
  assert.match(
    app,
    /const operation = createMarkNotificationReadOperation\(notifications, nId\);/,
    'single notification reads should resolve against the current notification snapshot',
  );
  assert.match(
    app,
    /await updateDoc\(doc\(db, operation\.collection, operation\.id\), operation\.data\);/,
    'single notification reads should write only the guarded operation',
  );

  for (const key of ['markAllRead', 'clearRead']) {
    assert.match(app, new RegExp(`t\\('${key}'\\)`), `App should localize ${key}`);
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }
});

test('notification center actions prevent duplicate submits and expose pending state', async () => {
  const app = await readFile(path.join(root, 'src/App.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.errorWithMessage, 'missing English error template');
  assert.ok(TRANSLATIONS.zh.errorWithMessage, 'missing Chinese error template');

  assert.match(app, /pendingNotificationActionKeysRef\s*=\s*useRef\(new Set\(\)\)/, 'Notification actions should track pending keys in a ref');
  assert.match(app, /if \(pendingNotificationActionKeysRef\.current\.has\(actionKey\)\) return;/, 'Notification actions should ignore duplicate submits for the same action');
  assert.match(app, /pendingNotificationActionKeysRef\.current\.add\(actionKey\)[\s\S]{0,220}setPendingNotificationActionKeys\(\[\.\.\.pendingNotificationActionKeysRef\.current\]\)/, 'Notification actions should expose pending keys immediately');
  assert.match(app, /await action\(\)/, 'Notification actions should await writes while pending');
  assert.match(app, /finally[\s\S]{0,260}pendingNotificationActionKeysRef\.current\.delete\(actionKey\)[\s\S]{0,160}setPendingNotificationActionKeys\(\[\.\.\.pendingNotificationActionKeysRef\.current\]\)/, 'Notification actions should clear pending state after writes settle');
  assert.match(app, /showToast\(t\('errorWithMessage', \{ title: actionLabel, message: error\?\.message \|\| t\('failed'\) \}\), 'error'\)/, 'Notification failures should use localized app feedback');
  assert.match(app, /await runNotificationAction\(`read:\$\{nId\}`/, 'Single notification reads should route through the pending action guard');
  assert.match(app, /await runNotificationAction\('mark-all-read'/, 'Mark-all notification reads should route through the pending action guard');
  assert.match(app, /await runNotificationAction\('clear-read'/, 'Clear-read notification actions should route through the pending action guard');
  assert.match(app, /disabled=\{notificationsLoadError \|\| !notifications\.some\(n => isNotificationUnread\(n\)\) \|\| isMarkingAllNotificationsRead\}/, 'Mark-all button should be disabled while pending or notification loading failed');
  assert.match(app, /aria-busy=\{isMarkingAllNotificationsRead\}/, 'Mark-all button should expose busy state');
  assert.match(app, /isMarkingAllNotificationsRead \? t\('processing'\) : t\('markAllRead'\)/, 'Mark-all button should show localized pending copy');
  assert.match(app, /disabled=\{notificationsLoadError \|\| !notifications\.some\(n => isNotificationRead\(n\)\) \|\| isClearingReadNotifications\}/, 'Clear-read button should be disabled while pending or notification loading failed');
  assert.match(app, /aria-busy=\{isClearingReadNotifications\}/, 'Clear-read button should expose busy state');
  assert.match(app, /isClearingReadNotifications \? t\('processing'\) : t\('clearRead'\)/, 'Clear-read button should show localized pending copy');
  assert.match(app, /pendingNotificationActionKeys\.includes\(`read:\$\{n\.id\}`\)/, 'Notification rows should derive pending state from the notification id');
  assert.match(app, /disabled=\{isNotificationReadPending\}/, 'Notification rows should be disabled while marking read');
  assert.match(app, /aria-busy=\{isNotificationReadPending\}/, 'Notification rows should expose busy state');
});

test('notification center filters and badges by normalized recipient and read state', async () => {
  const app = await readFile(path.join(root, 'src/App.jsx'), 'utf8');

  assert.match(app, /isNotificationForRecipient\(n,\s*user\.uid\)/, 'Notification center should not hide legacy recipient ids with surrounding whitespace');
  assert.match(app, /isNotificationUnread\(n\)/, 'Notification unread badges and disabled states should treat only boolean true as read');
});

test('notification center exposes a recoverable load error state', async () => {
  const app = await readFile(path.join(root, 'src/App.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.notificationsLoadFailed, 'missing English notification load failure translation');
  assert.ok(TRANSLATIONS.zh.notificationsLoadFailed, 'missing Chinese notification load failure translation');
  assert.ok(TRANSLATIONS.en.chatRetry, 'missing English retry translation');
  assert.ok(TRANSLATIONS.zh.chatRetry, 'missing Chinese retry translation');

  assert.match(app, /RotateCcw/, 'Notification retry should use the shared retry icon');
  assert.match(app, /\[notificationsLoadError,\s*setNotificationsLoadError\]\s*=\s*useState\(false\)/, 'App should track notification load errors separately from an empty notification center');
  assert.match(app, /\[notificationsReloadKey,\s*setNotificationsReloadKey\]\s*=\s*useState\(0\)/, 'App should expose a retry trigger for failed notification subscriptions');
  assert.match(app, /setNotificationsLoadError\(false\)[\s\S]{0,360}setNotifications\(/, 'Successful notification reads should clear the load error before rendering notifications');
  assert.match(app, /onSnapshot\(collection\(db, 'notifications'\),[\s\S]{0,900}\(error\) => \{[\s\S]{0,300}setNotificationsLoadError\(true\)/, 'Notification center should handle subscription errors');
  assert.match(app, /\}, \[notificationsReloadKey, projectActivitiesReloadKey, projectsReloadKey, userProfileReloadKey, workspaceDataReloadKey, user\]\)/, 'Notification retry should recreate the data subscriptions');
  assert.match(app, /notificationsLoadError[\s\S]{0,260}role="alert"[\s\S]{0,420}t\('notificationsLoadFailed'\)/, 'Notification center should render announced localized load failure copy');
  assert.match(app, /onClick=\{\(\) => setNotificationsReloadKey\(\(current\) => current \+ 1\)\}/, 'Notification retry should refresh the subscription');
  assert.match(app, /t\('chatRetry'\)/, 'Notification retry button should use localized copy');
  assert.match(app, /notificationsLoadError \? \(/, 'Notification empty state should be gated behind the notification load error state');
});

test('friend chat opens mark matching message notifications read', async () => {
  const app = await readFile(path.join(root, 'src/App.jsx'), 'utf8');
  const friendSystem = await readFile(path.join(root, 'src/components/FriendSystem.jsx'), 'utf8');

  assert.match(app, /createMarkFriendChatNotificationsReadOperations/, 'App should import the friend chat notification read helper');
  assert.match(app, /handleReadFriendChatNotifications:\s*async \(chatId\) =>/, 'App should expose a friend-chat notification read action');
  assert.match(app, /runNotificationAction\(`friend-chat:\$\{chatId\}`/, 'Friend chat notification reads should use the shared pending guard');
  assert.match(
    app,
    /const operations = createMarkFriendChatNotificationsReadOperations\(notifications, chatId\);/,
    'Friend chat notification reads should resolve against the current notification snapshot',
  );
  assert.match(app, /<FriendSystem[\s\S]{0,260}onReadFriendChatNotifications=\{actions\.handleReadFriendChatNotifications\}/, 'App should pass the friend-chat read action into FriendSystem');
  assert.match(friendSystem, /onReadFriendChatNotifications/, 'FriendSystem should accept the friend-chat read callback');
  assert.match(
    friendSystem,
    /onClick=\{\(\) => \{[\s\S]{0,180}setActiveChatFriend\(f\);[\s\S]{0,180}void onReadFriendChatNotifications\?\.\(f\.id\)/,
    'FriendSystem should mark the friend chat notifications read when the chat row is opened without blocking navigation',
  );
});
