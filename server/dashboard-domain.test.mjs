import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { TRANSLATIONS } from '../src/constants/translations.js';
import {
  DASHBOARD_SORT_OPTIONS,
  DASHBOARD_STATUS_FILTERS,
  createProjectArchivePatch,
  createProjectShareUrl,
  createRecentDashboardProjects,
  createRecentProjectIdsPatch,
  filterAndSortDashboardProjects,
  getProjectRoutePrefix,
  normalizeRecentProjectIds,
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

test('dashboard pinned projects stay first within the current filters', () => {
  assert.deepEqual(
    filterAndSortDashboardProjects(sampleProjects, {
      categoryTypes: ['vote', 'gather', 'schedule', 'book'],
      searchTerm: '',
      statusFilter: 'all',
      sortKey: 'recent',
      pinnedProjectIds: ['vote-a'],
    }).map((project) => project.id),
    ['vote-a', 'book-c'],
  );

  assert.deepEqual(
    filterAndSortDashboardProjects(sampleProjects, {
      categoryTypes: ['vote', 'gather', 'schedule', 'book'],
      searchTerm: '',
      statusFilter: 'all',
      sortKey: 'title',
      pinnedProjectIds: ['book-c', 'vote-a'],
    }).map((project) => project.id),
    ['vote-a', 'book-c'],
  );

  assert.deepEqual(
    filterAndSortDashboardProjects(sampleProjects, {
      categoryTypes: ['vote', 'gather', 'schedule', 'book'],
      searchTerm: '',
      statusFilter: 'archived',
      sortKey: 'recent',
      pinnedProjectIds: ['book-d', 'vote-a'],
    }).map((project) => project.id),
    ['book-d'],
  );
});

test('dashboard recent projects keep newest existing projects first', () => {
  assert.deepEqual(
    normalizeRecentProjectIds([' game-e ', '', 'vote-a', 'game-e', 42, 'book-c']),
    ['game-e', 'vote-a', 'book-c'],
  );

  assert.deepEqual(createRecentProjectIdsPatch(' book-c ', ['vote-a', 'book-c', 'missing'], 3), {
    recentProjectIds: ['book-c', 'vote-a', 'missing'],
  });
  assert.deepEqual(createRecentProjectIdsPatch('game-e', ['vote-a', 'book-c', 'missing'], 3), {
    recentProjectIds: ['game-e', 'vote-a', 'book-c'],
  });
  assert.equal(createRecentProjectIdsPatch('', ['vote-a']), null);

  const recent = createRecentDashboardProjects(sampleProjects, ['missing', 'book-c', 'vote-a', 'book-c', 'game-e'], 3);
  assert.deepEqual(recent.map((project) => project.id), ['book-c', 'vote-a', 'game-e']);

  const archivedRecent = createRecentDashboardProjects(sampleProjects, ['book-d', 'missing'], 4);
  assert.deepEqual(archivedRecent.map((project) => project.id), ['book-d']);
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

test('project route prefixes cover every dashboard module consistently', () => {
  assert.deepEqual(
    {
      vote: getProjectRoutePrefix('vote'),
      gather: getProjectRoutePrefix('gather'),
      schedule: getProjectRoutePrefix('schedule'),
      book: getProjectRoutePrefix('book'),
      team: getProjectRoutePrefix('team'),
      claim: getProjectRoutePrefix('claim'),
      roulette: getProjectRoutePrefix('roulette'),
      queue: getProjectRoutePrefix('queue'),
      game_hub: getProjectRoutePrefix('game_hub'),
      project: getProjectRoutePrefix('project'),
      unknown: getProjectRoutePrefix('unknown'),
    },
    {
      vote: 'collect',
      gather: 'collect',
      schedule: 'collect',
      book: 'collect',
      team: 'connect',
      claim: 'connect',
      roulette: 'select',
      queue: 'select',
      game_hub: 'games',
      project: 'projects',
      unknown: 'projects',
    },
  );
});

test('project share URLs use canonical module routes without transient page state', () => {
  assert.equal(typeof createProjectShareUrl, 'function');

  assert.equal(
    createProjectShareUrl('https://atmostfair.example/projects/vote-1?room=stale#panel', { id: ' vote-1 ', type: 'vote' }),
    'https://atmostfair.example/collect/vote-1',
  );
  assert.equal(
    createProjectShareUrl('https://atmostfair.example/games/game-1?room=room-a', { id: 'game-1', type: 'game_hub' }),
    'https://atmostfair.example/games/game-1',
  );
  assert.equal(
    createProjectShareUrl('/projects/raw?tab=old#section', { id: 'queue/with space', type: 'queue' }),
    '/select/queue%2Fwith%20space',
  );
  assert.equal(
    createProjectShareUrl('https://atmostfair.example/anything', { id: 'legacy-1', type: 'unknown' }),
    'https://atmostfair.example/projects/legacy-1',
  );
  assert.equal(createProjectShareUrl('', { id: 'vote-1', type: 'vote' }), '');
  assert.equal(createProjectShareUrl('https://atmostfair.example/projects/vote-1', { id: '   ', type: 'vote' }), '');
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

test('dashboard create form blocks whitespace and overlong project titles before submitting', async () => {
  const dashboard = await readFile(path.join(root, 'src/pages/Dashboard.jsx'), 'utf8');

  assert.match(dashboard, /PROJECT_TITLE_MAX_LENGTH/, 'Dashboard should share the project title limit with the domain helper');
  assert.match(dashboard, /const canCreateProject = Boolean\(selectedModule && newTitle\.trim\(\) && newTitle\.length <= PROJECT_TITLE_MAX_LENGTH\)/, 'Dashboard should derive a stable create-enabled state');
  assert.match(dashboard, /if \(!canCreateProject \|\| isCreatingProject\) return;/, 'Dashboard should keep the create form open when input is invalid or already submitting');
  assert.match(dashboard, /maxLength=\{PROJECT_TITLE_MAX_LENGTH\}/, 'Dashboard title input should enforce the same max length in the UI');
  assert.match(dashboard, /disabled=\{!canCreateProject \|\| isCreatingProject\}/, 'Dashboard create button should be disabled until the project shell is valid and idle');
});

test('dashboard create flow prevents duplicate submissions and preserves drafts on failure', async () => {
  const files = {
    app: await readFile(path.join(root, 'src/App.jsx'), 'utf8'),
    dashboard: await readFile(path.join(root, 'src/pages/Dashboard.jsx'), 'utf8'),
  };

  for (const key of ['createProjectSuccess', 'createProjectFailed']) {
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }

  assert.match(files.dashboard, /\[isCreatingProject,\s*setIsCreatingProject\]\s*=\s*useState\(false\)/, 'Dashboard should track project creation progress');
  assert.match(files.dashboard, /\[createError,\s*setCreateError\]\s*=\s*useState\(''\)/, 'Dashboard should keep an inline create error');
  assert.match(files.dashboard, /const handleCreateSubmit = async \(e\) =>/, 'Create submit should await the async project write');
  assert.match(files.dashboard, /if \(!canCreateProject \|\| isCreatingProject\) return;/, 'Create submit should ignore duplicate submissions while pending');
  assert.match(files.dashboard, /setIsCreatingProject\(true\)/, 'Create submit should enter a pending state before writing');
  assert.match(files.dashboard, /const result = await onCreateProject/, 'Create submit should wait for the app create action result');
  assert.match(files.dashboard, /if \(result\?\.ok === false\)/, 'Create submit should detect failed create attempts');
  assert.match(files.dashboard, /setCreateError\(t\('createProjectFailed'\)\)/, 'Failed create attempts should show localized inline feedback');
  assert.match(files.dashboard, /disabled=\{!canCreateProject \|\| isCreatingProject\}/, 'Create button should be disabled while submitting');
  assert.match(files.dashboard, /isCreatingProject \? t\('processing'\) : t\('createBtn'/, 'Create button should show localized progress copy');

  assert.match(files.app, /return \{ ok: true, projectId: projectRef\.id \}/, 'App create action should report a successful project id');
  assert.match(files.app, /showToast\(t\('createProjectSuccess'/, 'Successful project creation should use app toast feedback');
  assert.match(files.app, /showToast\(t\('createProjectFailed'/, 'Failed project creation should use app toast feedback');
  assert.match(files.app, /return \{ ok: false \}/, 'Failed project creation should report failure to keep the dashboard draft open');
});

test('dashboard opens the newly created project after a successful create', async () => {
  const dashboard = await readFile(path.join(root, 'src/pages/Dashboard.jsx'), 'utf8');

  assert.match(dashboard, /const result = await onCreateProject/, 'Dashboard should wait for the created project id');
  assert.match(dashboard, /if \(result\?\.ok === false\)/, 'Dashboard should keep the draft open on failed creates');
  assert.match(dashboard, /if \(result\?\.projectId\)/, 'Dashboard should only navigate when a created project id is available');
  assert.match(dashboard, /const routePrefix = getProjectRoutePrefix\(selectedModule\.id\)/, 'Dashboard should route new projects with the shared route-prefix helper');
  assert.match(dashboard, /void onRecordProjectOpen\(result\.projectId\)/, 'Dashboard should add the created project to recent projects');
  assert.match(dashboard, /navigate\(`\/\$\{routePrefix\}\/\$\{result\.projectId\}`\)/, 'Dashboard should open the newly created project directly');
  assert.doesNotMatch(dashboard, /navigate\(`\/projects\/\$\{result\.projectId\}`\)/, 'Dashboard should not hard-code the generic project route for every module');
});

test('dashboard exposes accessible user-scoped project pinning', async () => {
  const files = {
    app: await readFile(path.join(root, 'src/App.jsx'), 'utf8'),
    dashboard: await readFile(path.join(root, 'src/pages/Dashboard.jsx'), 'utf8'),
  };

  for (const key of ['pinProject', 'unpinProject', 'pinnedProject']) {
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }

  assert.match(files.app, /\[userProfile,\s*setUserProfile\]\s*=\s*useState\(null\)/, 'App should keep the current user document separately from auth identity');
  assert.match(files.app, /onSnapshot\(doc\(db,\s*'users',\s*user\.uid\)/, 'App should subscribe to the current user document for per-user dashboard preferences');
  assert.match(files.app, /const pinnedProjectIds = normalizePinnedProjectIds\(userProfile\?\.pinnedProjectIds\)/, 'App should normalize pinned project ids before rendering');
  assert.match(files.app, /handleToggleProjectPin/, 'App should expose a user-scoped project pin action');
  assert.match(files.app, /pinnedProjectIds=\{pinnedProjectIds\}/, 'Dashboard should receive current user pins');
  assert.match(files.app, /onToggleProjectPin=\{actions\.handleToggleProjectPin\}/, 'Dashboard should receive the shared pin action');

  assert.match(files.dashboard, /PinIcon/, 'Dashboard should use a vector pin icon rather than emoji');
  assert.match(files.dashboard, /aria-pressed=\{isPinned\}/, 'Pin control should expose pressed state');
  assert.match(files.dashboard, /aria-label=\{t\(isPinned \? 'unpinProject' : 'pinProject'/, 'Pin control should use localized accessible labels');
  assert.match(files.dashboard, /event\.stopPropagation\(\)/, 'Pin control should not trigger project navigation');
  assert.match(files.dashboard, /pinnedProjectIds/, 'Dashboard filtering should receive user pins');
  assert.match(files.dashboard, /filterAndSortDashboardProjects\([^)]*pinnedProjectIds/s, 'Dashboard sort should include pinned ids');
});

test('dashboard exposes durable recent-project continuation', async () => {
  const files = {
    app: await readFile(path.join(root, 'src/App.jsx'), 'utf8'),
    dashboard: await readFile(path.join(root, 'src/pages/Dashboard.jsx'), 'utf8'),
  };

  for (const key of ['continueWork', 'recentProjects', 'recentProjectCount']) {
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }

  assert.match(files.app, /normalizeRecentProjectIds/, 'App should normalize recent project ids before rendering');
  assert.match(files.app, /createRecentProjectIdsPatch/, 'App should use a shared patch helper before persisting recent projects');
  assert.match(files.app, /const recentProjectIds = normalizeRecentProjectIds\(userProfile\?\.recentProjectIds\)/, 'App should read recent projects from the user document');
  assert.match(files.app, /handleRecordProjectOpen/, 'App should expose a user-scoped recent project action');
  assert.match(files.app, /recentProjectIds=\{recentProjectIds\}/, 'Dashboard should receive recent project ids');
  assert.match(files.app, /onRecordProjectOpen=\{actions\.handleRecordProjectOpen\}/, 'Dashboard should receive the shared recent project action');
  assert.match(files.app, /setDoc\(doc\(db,\s*'users',\s*user\.uid\),\s*\{\s*recentProjectIds:/, 'Recent projects should persist to the user document');
  assert.match(files.app, /if \(!user \|\| !cleanProjectId\) return;/, 'Recent project writes should allow newly created projects before the project snapshot refreshes');
  assert.doesNotMatch(files.app, /handleRecordProjectOpen[\s\S]{0,260}projects\.some/, 'Recent project writes should not require the project to already exist in the current snapshot');

  assert.match(files.dashboard, /createRecentDashboardProjects/, 'Dashboard should use the shared recent project selector');
  assert.match(files.dashboard, /const recentProjects = useMemo/, 'Dashboard should memoize the continue-work list');
  assert.match(files.dashboard, /t\('continueWork'\)/, 'Continue-work heading should be localized');
  assert.match(files.dashboard, /t\('recentProjectCount'/, 'Continue-work count should be localized');
  assert.match(files.dashboard, /Clock/, 'Continue-work surface should use a vector icon');
  assert.match(files.dashboard, /onRecordProjectOpen\(project\.id\)/, 'Project navigation should record a recent project only when opening');
  assert.match(files.dashboard, /onClick=\{\(\) => handleProjectClick\(project\)\}/, 'Recent project buttons should reuse the normal project open path');
});
