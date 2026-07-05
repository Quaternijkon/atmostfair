import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { TRANSLATIONS } from '../src/constants/translations.js';
import {
  createClearReadNotificationOperations,
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

  for (const helper of ['createMarkNotificationsReadOperations', 'createClearReadNotificationOperations']) {
    assert.match(app, new RegExp(helper), `App should use ${helper}`);
  }

  for (const key of ['markAllRead', 'clearRead']) {
    assert.match(app, new RegExp(`t\\('${key}'\\)`), `App should localize ${key}`);
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }
});
