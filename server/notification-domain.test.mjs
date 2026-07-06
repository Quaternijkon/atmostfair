import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { TRANSLATIONS } from '../src/constants/translations.js';
import {
  createClearReadNotificationOperations,
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
  assert.match(app, /disabled=\{!notifications\.some\(n => !n\.read\) \|\| isMarkingAllNotificationsRead\}/, 'Mark-all button should be disabled while pending');
  assert.match(app, /aria-busy=\{isMarkingAllNotificationsRead\}/, 'Mark-all button should expose busy state');
  assert.match(app, /isMarkingAllNotificationsRead \? t\('processing'\) : t\('markAllRead'\)/, 'Mark-all button should show localized pending copy');
  assert.match(app, /disabled=\{!notifications\.some\(n => n\.read\) \|\| isClearingReadNotifications\}/, 'Clear-read button should be disabled while pending');
  assert.match(app, /aria-busy=\{isClearingReadNotifications\}/, 'Clear-read button should expose busy state');
  assert.match(app, /isClearingReadNotifications \? t\('processing'\) : t\('clearRead'\)/, 'Clear-read button should show localized pending copy');
  assert.match(app, /pendingNotificationActionKeys\.includes\(`read:\$\{n\.id\}`\)/, 'Notification rows should derive pending state from the notification id');
  assert.match(app, /disabled=\{isNotificationReadPending\}/, 'Notification rows should be disabled while marking read');
  assert.match(app, /aria-busy=\{isNotificationReadPending\}/, 'Notification rows should expose busy state');
});
