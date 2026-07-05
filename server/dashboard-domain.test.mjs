import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { TRANSLATIONS } from '../src/constants/translations.js';
import {
  DASHBOARD_SORT_OPTIONS,
  DASHBOARD_STATUS_FILTERS,
  createProjectArchivePatch,
  filterAndSortDashboardProjects,
} from '../src/lib/dashboardDomain.js';

const root = process.cwd();

const sampleProjects = [
  { id: 'vote-a', title: 'Alpha Vote', type: 'vote', status: 'active', createdAt: 1000 },
  { id: 'team-b', title: 'Beta Team', type: 'team', status: 'stopped', createdAt: 5000 },
  { id: 'book-c', title: 'Gamma Booking', type: 'book', status: 'finished', createdAt: 4000 },
  { id: 'book-d', title: 'Archived Booking', type: 'book', status: 'active', archived: true, archivedAt: 7000, createdAt: 2000 },
  { id: 'game-e', title: 'Game Room', type: 'game_hub', status: 'active', createdAt: 9000 },
];

test('dashboard filters hide archived projects by default and expose archived as a separate status', () => {
  assert.deepEqual(DASHBOARD_STATUS_FILTERS.map((filter) => filter.id), ['all', 'active', 'paused', 'finished', 'archived']);
  assert.deepEqual(DASHBOARD_SORT_OPTIONS.map((option) => option.id), ['recent', 'title', 'status']);

  const visibleCollect = filterAndSortDashboardProjects(sampleProjects, {
    categoryTypes: ['vote', 'gather', 'schedule', 'book'],
    searchTerm: '',
    statusFilter: 'all',
    sortKey: 'recent',
  });
  assert.deepEqual(visibleCollect.map((project) => project.id), ['book-c', 'vote-a']);

  const archivedCollect = filterAndSortDashboardProjects(sampleProjects, {
    categoryTypes: ['vote', 'gather', 'schedule', 'book'],
    searchTerm: '',
    statusFilter: 'archived',
    sortKey: 'recent',
  });
  assert.deepEqual(archivedCollect.map((project) => project.id), ['book-d']);
});

test('dashboard filters support status, search, and stable sorting', () => {
  assert.deepEqual(
    filterAndSortDashboardProjects(sampleProjects, {
      categoryTypes: ['vote', 'gather', 'schedule', 'book'],
      searchTerm: '',
      statusFilter: 'active',
      sortKey: 'recent',
    }).map((project) => project.id),
    ['vote-a'],
  );

  assert.deepEqual(
    filterAndSortDashboardProjects(sampleProjects, {
      categoryTypes: ['vote', 'gather', 'schedule', 'book'],
      searchTerm: 'booking',
      statusFilter: 'all',
      sortKey: 'title',
    }).map((project) => project.id),
    ['book-c'],
  );

  assert.deepEqual(
    filterAndSortDashboardProjects(sampleProjects, {
      categoryTypes: ['vote', 'gather', 'schedule', 'book'],
      searchTerm: '',
      statusFilter: 'all',
      sortKey: 'title',
    }).map((project) => project.id),
    ['vote-a', 'book-c'],
  );
});

test('project archive patch records reversible archive state', () => {
  assert.deepEqual(createProjectArchivePatch({ id: 'project-1' }, true, 8000), {
    archived: true,
    archivedAt: 8000,
  });
  assert.deepEqual(createProjectArchivePatch({ id: 'project-1', archived: true }, false, 9000), {
    archived: false,
    archivedAt: null,
  });
  assert.equal(createProjectArchivePatch(null, true, 8000), null);
});

test('dashboard and project detail expose localized archive filter controls', async () => {
  const dashboard = await readFile(path.join(root, 'src/pages/Dashboard.jsx'), 'utf8');
  const detail = await readFile(path.join(root, 'src/pages/ProjectDetail.jsx'), 'utf8');
  const app = await readFile(path.join(root, 'src/App.jsx'), 'utf8');

  assert.match(dashboard, /filterAndSortDashboardProjects/, 'Dashboard should use the shared filter/sort helper');
  assert.match(dashboard, /DASHBOARD_STATUS_FILTERS/, 'Dashboard should render status filters from the shared options');
  assert.match(dashboard, /DASHBOARD_SORT_OPTIONS/, 'Dashboard should render sort options from the shared options');
  assert.match(app, /createProjectArchivePatch/, 'App should use archive patch helper before writing archive state');
  assert.match(detail, /handleArchiveProject/, 'Project detail should expose archive/restore actions');
  assert.match(dashboard, /t\(filter\.labelKey\)/, 'Dashboard status filters should localize shared filter labels');
  assert.match(dashboard, /t\(option\.labelKey\)/, 'Dashboard sort options should localize shared sort labels');

  for (const key of ['filterAll', 'filterActive', 'filterPaused', 'filterFinished', 'filterArchived']) {
    assert.equal(DASHBOARD_STATUS_FILTERS.some((filter) => filter.labelKey === key), true, `missing dashboard filter option ${key}`);
  }

  for (const key of ['sortRecent', 'sortTitle', 'sortStatus']) {
    assert.equal(DASHBOARD_SORT_OPTIONS.some((option) => option.labelKey === key), true, `missing dashboard sort option ${key}`);
  }

  for (const key of [
    'dashboardFilter',
    'dashboardSort',
    'archived',
    'archive',
    'restore',
    'archiveProject',
    'archiveProjectConfirm',
    'restoreProject',
    'restoreProjectConfirm',
  ]) {
    assert.match(`${dashboard}\n${detail}`, new RegExp(`t\\('${key}'`), `UI should localize ${key}`);
  }

  for (const key of [
    'dashboardFilter',
    'dashboardSort',
    'filterAll',
    'filterActive',
    'filterPaused',
    'filterFinished',
    'filterArchived',
    'sortRecent',
    'sortTitle',
    'sortStatus',
    'archived',
    'archive',
    'restore',
    'archiveProject',
    'archiveProjectConfirm',
    'restoreProject',
    'restoreProjectConfirm',
  ]) {
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }
});
