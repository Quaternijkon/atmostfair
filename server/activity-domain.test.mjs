import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { TRANSLATIONS } from '../src/constants/translations.js';
import {
  createProjectActivityData,
  getActivityMessageKey,
  PROJECT_ACTIVITY_TYPES,
} from '../src/lib/activityDomain.js';

const root = process.cwd();

test('project activity records are structured, localized, and project-scoped', () => {
  const actor = { uid: 'user-1', displayName: 'Ada' };

  assert.deepEqual(
    createProjectActivityData({
      projectId: 'project-1',
      type: PROJECT_ACTIVITY_TYPES.queueJoined,
      actor,
      actorName: ' Ada Lovelace ',
      subject: 'Queue',
      createdAt: 1000,
      metadata: { value: 7 },
    }),
    {
      projectId: 'project-1',
      type: 'queue_joined',
      actorId: 'user-1',
      actorName: 'Ada Lovelace',
      subject: 'Queue',
      createdAt: 1000,
      metadata: { value: 7 },
    },
  );

  assert.equal(createProjectActivityData({ type: PROJECT_ACTIVITY_TYPES.queueJoined, actor, createdAt: 1000 }), null);
  assert.equal(getActivityMessageKey('queue_joined'), 'activityQueueJoined');
  assert.equal(getActivityMessageKey('unknown_action'), 'activityUpdated');

  for (const key of ['activityTimeline', 'noActivities', 'activityQueueJoined', 'activityUpdated']) {
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }
});

test('project activity domain includes project brief update events', () => {
  assert.equal(PROJECT_ACTIVITY_TYPES.projectBriefUpdated, 'project_brief_updated');
  assert.equal(
    getActivityMessageKey(PROJECT_ACTIVITY_TYPES.projectBriefUpdated),
    'activityProjectBriefUpdated',
  );

  const activity = createProjectActivityData({
    projectId: 'project-1',
    type: PROJECT_ACTIVITY_TYPES.projectBriefUpdated,
    actor: { uid: 'user-1', displayName: 'Alice' },
    subject: '  Brief  ',
    createdAt: 1700000000000,
  });

  assert.equal(activity.type, 'project_brief_updated');
  assert.equal(activity.subject, 'Brief');
  assert.ok(TRANSLATIONS.en.activityProjectBriefUpdated);
  assert.ok(TRANSLATIONS.zh.activityProjectBriefUpdated);
});

test('app records project activity without blocking primary actions', async () => {
  const app = await readFile(path.join(root, 'src/App.jsx'), 'utf8');

  assert.match(app, /projectActivities/, 'App should keep project activity state');
  assert.match(app, /collection\(db,\s*'project_activities'\)/, 'App should subscribe to project activity records');
  assert.match(app, /recordProjectActivity/, 'App should use a non-blocking activity writer');
  assert.match(app, /catch\s*\([^)]*\)\s*\{[\s\S]{0,120}console\.error\(['"]Error recording project activity/, 'Activity writes should not block primary actions');

  for (const type of [
    'PROJECT_ACTIVITY_TYPES.queueJoined',
    'PROJECT_ACTIVITY_TYPES.gatherSubmitted',
    'PROJECT_ACTIVITY_TYPES.bookingBooked',
    'PROJECT_ACTIVITY_TYPES.bookingCancelled',
    'PROJECT_ACTIVITY_TYPES.winnerRecorded',
    'PROJECT_ACTIVITY_TYPES.projectArchived',
  ]) {
    assert.match(app, new RegExp(type.replace('.', '\\.')), `App should record ${type}`);
  }
});

test('project detail exposes a localized activity timeline', async () => {
  const detail = await readFile(path.join(root, 'src/pages/ProjectDetail.jsx'), 'utf8');

  assert.match(detail, /projectActivities/, 'Project detail should receive project activities');
  assert.match(detail, /ActivityTimeline/, 'Project detail should render an activity timeline');
  assert.match(detail, /getActivityMessageKey/, 'Project detail should localize activity messages from domain mapping');
  assert.match(detail, /t\('activityTimeline'\)/, 'Activity timeline heading should be localized');
  assert.match(detail, /t\('noActivities'\)/, 'Activity timeline empty state should be localized');
});
