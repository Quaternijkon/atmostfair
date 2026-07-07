import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { TRANSLATIONS } from '../src/constants/translations.js';

const root = process.cwd();

test('frontend exposes a Google Material design foundation', async () => {
  const css = await readFile(path.join(root, 'src/index.css'), 'utf8');
  const tailwind = await readFile(path.join(root, 'tailwind.config.js'), 'utf8');

  for (const token of [
    '--amf-blue',
    '--amf-red',
    '--amf-yellow',
    '--amf-green',
    '--amf-surface',
    '--amf-focus-ring',
    '--amf-ease-emphasized',
  ]) {
    assert.match(css, new RegExp(token), `missing design token ${token}`);
  }

  for (const utility of [
    '.app-shell',
    '.app-topbar',
    '.app-card',
    '.app-button',
    '.app-icon-button',
    '.app-input',
    '.app-chip',
    '.workspace-grid',
    '.touch-target',
    '.skip-link',
  ]) {
    assert.match(css, new RegExp(utility.replace('.', '\\.')), `missing utility ${utility}`);
  }

  assert.match(css, /prefers-reduced-motion/, 'missing reduced-motion support');
  assert.match(css, /min-height:\s*44px/, 'missing minimum touch target height');
  assert.match(css, /focus-visible/, 'missing keyboard focus-visible styling');
  assert.doesNotMatch(css, /fonts\.googleapis\.com/, 'remote font imports can delay first render and should not be required');
  assert.match(tailwind, /amf:/, 'missing Atmostfair design tokens in Tailwind config');
  assert.match(tailwind, /system-ui/, 'font stack should include local system fallbacks');
});

test('core pages use the shared app interaction primitives', async () => {
  const files = {
    app: await readFile(path.join(root, 'src/App.jsx'), 'utf8'),
    login: await readFile(path.join(root, 'src/pages/Login.jsx'), 'utf8'),
    dashboard: await readFile(path.join(root, 'src/pages/Dashboard.jsx'), 'utf8'),
    detail: await readFile(path.join(root, 'src/pages/ProjectDetail.jsx'), 'utf8'),
    ui: await readFile(path.join(root, 'src/components/UIComponents.jsx'), 'utf8'),
  };

  assert.match(files.app, /app-shell/, 'App shell should use app-shell');
  assert.match(files.app, /app-topbar/, 'Top navigation should use app-topbar');
  assert.match(files.app, /app-main/, 'Main content should use app-main');
  assert.match(files.app, /href="#main-content"/, 'App shell should expose a skip link');
  assert.match(files.app, /t\('skipToContent'\)/, 'Skip link should use localized copy');
  assert.match(files.app, /id="main-content"/, 'Main content should be targetable by the skip link');
  assert.equal(TRANSLATIONS.en.skipToContent, 'Skip to main content');
  assert.equal(TRANSLATIONS.zh.skipToContent, '跳到主要内容');

  for (const [name, source] of Object.entries(files)) {
    assert.match(source, /app-button|app-icon-button/, `${name} should use shared button primitives`);
  }

  for (const [name, source] of Object.entries({
    login: files.login,
    dashboard: files.dashboard,
    detail: files.detail,
    ui: files.ui,
  })) {
    assert.match(source, /app-card|app-dialog/, `${name} should use shared surface primitives`);
  }

  for (const [name, source] of Object.entries({
    login: files.login,
    dashboard: files.dashboard,
    detail: files.detail,
  })) {
    assert.match(source, /app-input/, `${name} should use shared input primitives`);
  }
});

test('global confirm dialog awaits async actions and exposes pending state', async () => {
  const ui = await readFile(path.join(root, 'src/components/UIComponents.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.match(ui, /useRef/, 'Confirm dialog should use an immediate ref guard for async confirmations');
  assert.match(ui, /confirmPendingRef\s*=\s*useRef\(false\)/, 'Confirm dialog should keep pending state in a ref');
  assert.match(ui, /if \(confirmPendingRef\.current\) return;/, 'Confirm dialog should ignore duplicate confirm attempts before rerender');
  assert.match(ui, /confirmPendingRef\.current\s*=\s*true[\s\S]{0,220}setDialog\(prev => \(\{ \.\.\.prev, isPending: true \}\)\)/, 'Confirm dialog should expose pending state before awaiting');
  assert.match(ui, /await onConfirm\?\.\(\)/, 'Confirm dialog should await async confirm actions');
  assert.match(ui, /finally[\s\S]{0,260}confirmPendingRef\.current\s*=\s*false[\s\S]{0,220}isOpen: false[\s\S]{0,120}isPending: false/, 'Confirm dialog should close and clear pending state after confirm settles');
  assert.match(ui, /if \(confirmPendingRef\.current\) return;/, 'Cancel should not interrupt a pending confirm action');
  assert.match(ui, /const Dialog = \(\{[\s\S]{0,160}isPending = false/, 'Dialog should receive pending state');
  assert.match(ui, /disabled=\{isPending\}[\s\S]{0,180}\{cancelText \|\| t\('cancel'\)\}/, 'Cancel button should be disabled while confirming');
  assert.match(ui, /disabled=\{isPending\}[\s\S]{0,120}aria-busy=\{isPending\}/, 'Confirm button should be disabled and expose busy state while confirming');
  assert.match(ui, /isPending \? t\('processing'\) : \(confirmText \|\| t\('confirm'\)\)/, 'Confirm button should show localized pending copy');
});

test('global account actions prevent duplicate submits and expose pending state', async () => {
  const app = await readFile(path.join(root, 'src/App.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.logout, 'missing English logout translation');
  assert.ok(TRANSLATIONS.zh.logout, 'missing Chinese logout translation');
  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');

  assert.match(app, /isSigningOutRef\s*=\s*useRef\(false\)/, 'Sign-out should use a synchronous action lock');
  assert.match(app, /if \(isSigningOutRef\.current\) return;/, 'Sign-out should ignore duplicate clicks before state rerenders');
  assert.match(app, /isSigningOutRef\.current\s*=\s*true[\s\S]{0,220}setIsSigningOut\(true\)/, 'Sign-out should expose pending state immediately');
  assert.match(app, /await signOut\(auth\)/, 'Sign-out should await the auth write while pending');
  assert.match(app, /finally[\s\S]{0,220}isSigningOutRef\.current\s*=\s*false[\s\S]{0,160}setIsSigningOut\(false\)/, 'Sign-out should clear pending state when the operation settles');
  assert.match(app, /onClick=\{handleSignOut\}/, 'Logout button should use the guarded sign-out handler');
  assert.match(app, /disabled=\{isSigningOut\}/, 'Logout button should be disabled while signing out');
  assert.match(app, /aria-busy=\{isSigningOut\}/, 'Logout button should expose busy state');
  assert.match(app, /title=\{isSigningOut \? t\('processing'\) : t\('logout'\)\}/, 'Logout button should expose localized pending copy');
});

test('project surfaces stay compact and keyboard ergonomic', async () => {
  const files = {
    dashboard: await readFile(path.join(root, 'src/pages/Dashboard.jsx'), 'utf8'),
    detail: await readFile(path.join(root, 'src/pages/ProjectDetail.jsx'), 'utf8'),
    infoCard: await readFile(path.join(root, 'src/components/InfoCard.jsx'), 'utf8'),
  };

  assert.match(files.dashboard, /<button[\s\S]{0,260}onClick=\{\(\) => handleProjectClick\(project\)\}/, 'Dashboard project cards should open through semantic buttons');
  assert.doesNotMatch(files.dashboard, /<motion\.div[^>]*onClick=/, 'Dashboard motion containers should not be clickable divs');

  assert.match(files.detail, /shortProjectId/, 'Project detail should derive a short scannable ID');
  assert.match(files.detail, /project\.id\.slice\(0,\s*8\)/, 'Project detail should show a compact project ID');
  assert.doesNotMatch(files.detail, /\{project\.id\}<\/span>/, 'Project detail should not show the full UUID in the header');

  assert.match(files.infoCard, /role="note"/, 'Workspace help cards should be announced as notes');
  assert.doesNotMatch(files.infoCard, /<ol|list-decimal/, 'Workspace help cards should use compact guidance instead of long numbered instructions');
});

test('project detail distinguishes loading from missing projects with recovery copy', async () => {
  const files = {
    app: await readFile(path.join(root, 'src/App.jsx'), 'utf8'),
    detail: await readFile(path.join(root, 'src/pages/ProjectDetail.jsx'), 'utf8'),
  };

  for (const key of ['projectNotFound', 'projectNotFoundDesc', 'backToDash']) {
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }

  assert.match(files.app, /\[projectsLoaded,\s*setProjectsLoaded\]\s*=\s*useState\(false\)/, 'App should track whether the projects snapshot has loaded');
  assert.match(files.app, /setProjectsLoaded\(true\)/, 'App should mark the projects snapshot as loaded after it arrives');
  assert.match(files.app, /projectsLoaded=\{projectsLoaded\}/, 'Project detail routes should receive the project snapshot loaded state');

  assert.match(files.detail, /projectsLoaded\s*=\s*false/, 'Project detail should default to a loading state before snapshot evidence arrives');
  assert.match(files.detail, /if \(!project && !projectsLoaded\)[\s\S]{0,240}t\('loading'\)/, 'Missing projects before data load should still show loading');
  assert.match(files.detail, /if \(!project\)[\s\S]{0,520}t\('projectNotFound'\)/, 'Missing projects after data load should show a not-found state');
  assert.match(files.detail, /t\('projectNotFoundDesc'\)/, 'Project not-found detail copy should be localized');
  assert.doesNotMatch(files.detail, /<h2[^>]*>\{t\('loading'\)\}<\/h2>[\s\S]{0,160}<button/, 'Project detail should not show an infinite loading state with only a dashboard button');
});

test('project list exposes a recoverable load error state', async () => {
  const app = await readFile(path.join(root, 'src/App.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.projectsLoadFailed, 'missing English project list load failure translation');
  assert.ok(TRANSLATIONS.zh.projectsLoadFailed, 'missing Chinese project list load failure translation');
  assert.ok(TRANSLATIONS.en.chatRetry, 'missing English retry translation');
  assert.ok(TRANSLATIONS.zh.chatRetry, 'missing Chinese retry translation');

  assert.match(app, /RotateCcw/, 'Project list retry should use the shared retry icon');
  assert.match(app, /\[projectsLoadError,\s*setProjectsLoadError\]\s*=\s*useState\(false\)/, 'App should track project list load errors separately from an empty dashboard');
  assert.match(app, /\[projectsReloadKey,\s*setProjectsReloadKey\]\s*=\s*useState\(0\)/, 'App should expose a retry trigger for failed project subscriptions');
  assert.match(app, /setProjectsLoadError\(false\)[\s\S]{0,360}setProjects\(/, 'Successful project reads should clear the load error before rendering projects');
  assert.match(app, /onSnapshot\(collection\(db, 'projects'\),[\s\S]{0,900}\(error\) => \{[\s\S]{0,300}setProjectsLoadError\(true\)/, 'Project list should handle subscription errors');
  assert.match(app, /\}, \[notificationsReloadKey, projectActivitiesReloadKey, projectsReloadKey, userProfileReloadKey, workspaceDataReloadKey, user\]\)/, 'Project list retry should recreate the data subscriptions');
  assert.match(app, /projectsLoadError[\s\S]{0,260}role="alert"[\s\S]{0,420}t\('projectsLoadFailed'\)/, 'Project list should render announced localized load failure copy');
  assert.match(app, /onClick=\{\(\) => setProjectsReloadKey\(\(current\) => current \+ 1\)\}/, 'Project list retry should refresh the subscription');
  assert.match(app, /t\('chatRetry'\)/, 'Project list retry button should use localized copy');
  assert.match(app, /projectsLoadError \? \(/, 'Project routes should be gated behind the project list load error state');
});

test('user profile exposes a recoverable load error state', async () => {
  const app = await readFile(path.join(root, 'src/App.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.userProfileLoadFailed, 'missing English user profile load failure translation');
  assert.ok(TRANSLATIONS.zh.userProfileLoadFailed, 'missing Chinese user profile load failure translation');
  assert.ok(TRANSLATIONS.en.chatRetry, 'missing English retry translation');
  assert.ok(TRANSLATIONS.zh.chatRetry, 'missing Chinese retry translation');

  assert.match(app, /\[userProfileLoadError,\s*setUserProfileLoadError\]\s*=\s*useState\(false\)/, 'App should track user profile subscription failures');
  assert.match(app, /\[userProfileReloadKey,\s*setUserProfileReloadKey\]\s*=\s*useState\(0\)/, 'App should expose a retry trigger for failed user profile subscriptions');
  assert.match(app, /setUserProfileLoadError\(false\)[\s\S]{0,260}setUserProfile\(/, 'Successful user profile reads should clear the load error before rendering preferences');
  assert.match(app, /onSnapshot\(doc\(db, 'users', user\.uid\),[\s\S]{0,520}\(error\) => \{[\s\S]{0,220}setUserProfileLoadError\(true\)/, 'User profile subscription failures should set a recoverable error state');
  assert.match(app, /\}, \[notificationsReloadKey, projectActivitiesReloadKey, projectsReloadKey, userProfileReloadKey, workspaceDataReloadKey, user\]\)/, 'User profile retry should recreate the subscription');
  assert.match(app, /setUserProfileLoadError\(false\)/, 'Auth state changes should clear stale user profile load errors');
  assert.match(app, /userProfileLoadError[\s\S]{0,420}role="alert"[\s\S]{0,420}t\('userProfileLoadFailed'\)/, 'Account preferences should render announced localized load failure copy');
  assert.match(app, /onClick=\{\(\) => setUserProfileReloadKey\(\(current\) => current \+ 1\)\}/, 'User profile retry should refresh the subscription');
  assert.match(app, /isUserProfileAvailable=\{!userProfileLoadError\}/, 'Dashboard should receive whether user profile actions are trusted');
  assert.match(app, /if \(userProfileLoadError\) return;[\s\S]{0,900}setDoc\(doc\(db, 'users', user\.uid\), \{ pinnedProjectIds:/, 'Project pin writes should pause while user profile data is untrusted');
  assert.match(app, /if \(userProfileLoadError\) return;[\s\S]{0,900}setDoc\(doc\(db, 'users', user\.uid\), \{ recentProjectIds:/, 'Recent project writes should pause while user profile data is untrusted');

  const dashboard = await readFile(path.join(root, 'src/pages/Dashboard.jsx'), 'utf8');
  assert.match(dashboard, /isUserProfileAvailable = true/, 'Dashboard should default user profile actions to available');
  assert.match(dashboard, /disabled=\{!isUserProfileAvailable\}/, 'Project pin buttons should be disabled while user profile data is untrusted');
});

test('service health failures are visible before auth and globally recoverable', async () => {
  const files = {
    app: await readFile(path.join(root, 'src/App.jsx'), 'utf8'),
    login: await readFile(path.join(root, 'src/pages/Login.jsx'), 'utf8'),
    apiClient: await readFile(path.join(root, 'src/lib/apiClient.js'), 'utf8'),
  };

  assert.ok(TRANSLATIONS.en.serviceHealthUnavailable, 'missing English service health failure translation');
  assert.ok(TRANSLATIONS.zh.serviceHealthUnavailable, 'missing Chinese service health failure translation');
  assert.ok(TRANSLATIONS.en.chatRetry, 'missing English retry translation');
  assert.ok(TRANSLATIONS.zh.chatRetry, 'missing Chinese retry translation');

  assert.match(files.apiClient, /export async function checkApiHealth\(\)/, 'API client should expose a reusable health check');
  assert.match(files.apiClient, /apiRequest\('\/api\/health', \{[\s\S]{0,120}method: 'GET'[\s\S]{0,120}token: null/, 'Health check should call the public health endpoint without auth');
  assert.match(files.app, /import \{ checkApiHealth \} from '\.\/lib\/apiClient'/, 'App should use the shared health check');
  assert.match(files.app, /\[serviceHealthError,\s*setServiceHealthError\]\s*=\s*useState\(false\)/, 'App should track API availability failures');
  assert.match(files.app, /\[serviceHealthReloadKey,\s*setServiceHealthReloadKey\]\s*=\s*useState\(0\)/, 'App should expose a health retry trigger');
  assert.match(files.app, /checkApiHealth\(\)[\s\S]{0,220}setServiceHealthError\(false\)[\s\S]{0,220}setServiceHealthError\(true\)/, 'App should clear or set service health failures from the health check');
  assert.match(files.app, /\}, \[serviceHealthReloadKey\]\)/, 'Service health retry should recreate the health check');
  assert.match(files.app, /const retryServiceHealth = \(\) => \{[\s\S]{0,120}setServiceHealthReloadKey\(\(current\) => current \+ 1\)/, 'App should provide a retry action for service health');
  assert.match(files.app, /<Login[\s\S]{0,220}isServiceUnavailable=\{serviceHealthError\}[\s\S]{0,220}onRetryServiceHealth=\{retryServiceHealth\}/, 'Login should receive service health state and retry action');
  assert.match(files.app, /<Login[\s\S]{0,260}onServiceHealthFailure=\{\(\) => setServiceHealthError\(true\)\}/, 'Login should be able to mark service health failed after auth outages');
  assert.match(files.app, /serviceHealthError[\s\S]{0,420}role="alert"[\s\S]{0,420}t\('serviceHealthUnavailable'\)/, 'Authenticated shell should announce service health failures');
  assert.match(files.app, /serviceHealthError[\s\S]{0,700}onClick=\{retryServiceHealth\}/, 'Global service health alert should retry the health check');
  assert.match(files.app, /serviceHealthError[\s\S]{0,700}RotateCcw/, 'Global service health retry should use the shared retry icon');

  assert.match(files.login, /isServiceUnavailable = false/, 'Login should default service health state for isolated rendering');
  assert.match(files.login, /onRetryServiceHealth = \(\) => \{\}/, 'Login should default health retry for isolated rendering');
  assert.match(files.login, /onServiceHealthFailure = \(\) => \{\}/, 'Login should default health failure reporting for isolated rendering');
  assert.match(files.login, /authError\?\.status >= 500[\s\S]{0,120}onServiceHealthFailure\(\)/, 'Login should mark service health failed when auth requests return server outages');
  assert.match(files.login, /isServiceUnavailable[\s\S]{0,420}role="alert"[\s\S]{0,420}t\('serviceHealthUnavailable'\)/, 'Login should announce service health failures');
  assert.match(files.login, /onClick=\{onRetryServiceHealth\}/, 'Login service health alert should retry the health check');
  assert.match(files.login, /RotateCcw/, 'Login service health retry should use the shared retry icon');
  assert.match(files.login, /const isAuthDisabled = isAuthPending \|\| isServiceUnavailable/, 'Login should disable auth actions while service health is failed');
  assert.match(files.login, /disabled=\{isAuthDisabled\}/, 'Login auth buttons should use the combined disabled state');
});

test('quick-start templates create initialized projects through rollback-safe writes', async () => {
  const files = {
    app: await readFile(path.join(root, 'src/App.jsx'), 'utf8'),
    dashboard: await readFile(path.join(root, 'src/pages/Dashboard.jsx'), 'utf8'),
    dashboardDomain: await readFile(path.join(root, 'src/lib/dashboardDomain.js'), 'utf8'),
    projectDomain: await readFile(path.join(root, 'src/lib/projectDomain.js'), 'utf8'),
  };

  const seedKeys = [
    'templateSeedLunchVegetarian',
    'templateSeedLunchNoodles',
    'templateSeedLunchRiceBowl',
    'templateSeedFeedbackMood',
    'templateSeedBookingRequiredInfo',
    'templateSeedHackathonFrontend',
    'templateSeedClaimVenue',
    'templateSeedGameRoomRps',
  ];
  for (const key of seedKeys) {
    assert.ok(TRANSLATIONS.en[key], `missing English template seed copy ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese template seed copy ${key}`);
  }

  assert.match(files.dashboardDomain, /export function getDashboardProjectTemplate\(templateId\)/, 'Dashboard domain should expose a stable template lookup helper');
  assert.match(files.dashboardDomain, /seed:\s*\{[\s\S]{0,260}textKeys:/, 'Dashboard templates should include localized seed metadata');
  assert.match(files.projectDomain, /export function createProjectTemplateSeedData\(/, 'Project domain should create template seed data');
  assert.match(files.projectDomain, /export async function commitProjectCreateWithRollback\(/, 'Project domain should expose rollback-safe project creation');
  assert.match(files.projectDomain, /kind === 'game_rooms'[\s\S]{0,900}createGameRoomCreateData/, 'Game templates should reuse shared game-room creation guards');

  assert.match(files.dashboard, /\[selectedTemplateId,\s*setSelectedTemplateId\]\s*=\s*useState\(null\)/, 'Dashboard should track the selected quick-start template');
  assert.match(files.dashboard, /setSelectedTemplateId\(template\.id\)/, 'Template selection should remember the selected template id');
  assert.match(files.dashboard, /aria-pressed=\{selectedTemplateId === template\.id\}/, 'Template buttons should expose pressed state');
  assert.match(files.dashboard, /setSelectedTemplateId\(null\)[\s\S]{0,160}setSelectedModule\(mod\)/, 'Manual module selection should clear template id');
  assert.match(files.dashboard, /onCreateProject\(newTitle,\s*selectedModule\.id,\s*creatorName,\s*newPassword,\s*selectedTemplateId\)/, 'Dashboard should pass the template id to App');

  assert.match(files.app, /createProjectTemplateSeedData/, 'App should create seed operations for template-created projects');
  assert.match(files.app, /commitProjectCreateWithRollback/, 'App should use rollback-safe creation when seeding child records');
  assert.match(files.app, /handleCreateProject = async \(title,\s*type,\s*creatorName,\s*password,\s*showToast,\s*templateId(?:\s*=\s*null)?\)/, 'App create handler should accept a template id');
  assert.match(files.app, /projectData = \{ \.\.\.projectData, \.\.\.templateSeed\.projectPatch \}/, 'Project create data should include template configuration before the parent write');
  assert.match(files.app, /createChildOperations:\s*\(projectRef\) => createProjectTemplateSeedData\(/, 'Seed child operations should be created after the project id is known');
  assert.match(files.app, /onCreateProject=\{\(title,\s*type,\s*creatorName,\s*password,\s*templateId\) => handleCreateProject\(title,\s*type,\s*creatorName,\s*password,\s*showToast,\s*templateId\)\}/, 'Route wiring should preserve template id through the create boundary');
});

test('project workspaces expose recoverable child data load errors', async () => {
  const files = {
    app: await readFile(path.join(root, 'src/App.jsx'), 'utf8'),
    detail: await readFile(path.join(root, 'src/pages/ProjectDetail.jsx'), 'utf8'),
  };
  const childCollections = [
    'voting_items',
    'rooms',
    'roulette_participants',
    'queue_participants',
    'gather_fields',
    'gather_submissions',
    'schedule_submissions',
    'booking_slots',
    'claim_items',
    'game_rooms',
  ];

  assert.ok(TRANSLATIONS.en.workspaceDataLoadFailed, 'missing English workspace data load failure translation');
  assert.ok(TRANSLATIONS.zh.workspaceDataLoadFailed, 'missing Chinese workspace data load failure translation');
  assert.ok(TRANSLATIONS.en.chatRetry, 'missing English retry translation');
  assert.ok(TRANSLATIONS.zh.chatRetry, 'missing Chinese retry translation');

  assert.match(files.app, /workspaceDataLoadErrors/, 'App should track child collection load failures');
  assert.match(files.app, /workspaceDataReloadKey/, 'App should expose a retry trigger for child collection subscriptions');
  assert.match(files.app, /subscribeWorkspaceCollection/, 'App should route child collection subscriptions through a shared error handler');
  assert.match(files.app, /setWorkspaceDataLoadErrors\(\(current\) => \(\{ \.\.\.current, \[collectionName\]: false \}\)\)/, 'Successful child snapshots should clear collection load errors');
  assert.match(files.app, /setWorkspaceDataLoadErrors\(\(current\) => \(\{ \.\.\.current, \[collectionName\]: true \}\)\)/, 'Child subscription errors should mark the failed collection');
  assert.match(files.app, /console\.error\(`Error loading workspace data \$\{collectionName\}:`, error\)/, 'Child subscription errors should identify the failed collection');
  for (const collectionName of childCollections) {
    assert.match(files.app, new RegExp(`subscribeWorkspaceCollection\\('${collectionName}'`), `App should recover ${collectionName} subscriptions`);
  }
  assert.match(files.app, /\}, \[notificationsReloadKey, projectActivitiesReloadKey, projectsReloadKey, userProfileReloadKey, workspaceDataReloadKey, user\]\)/, 'Workspace data retry should recreate child collection subscriptions');
  assert.match(files.app, /workspaceDataLoadErrors=\{workspaceDataLoadErrors\}/, 'Project detail should receive child collection load errors');
  assert.match(files.app, /onRetryWorkspaceData=\{retryWorkspaceData\}/, 'Project detail should receive a child data retry action');

  for (const [projectType, collectionPattern] of [
    ['vote', 'voting_items'],
    ['team', 'rooms'],
    ['roulette', 'roulette_participants'],
    ['queue', 'queue_participants'],
    ['gather', 'gather_fields[\\s\\S]{0,80}gather_submissions'],
    ['schedule', 'schedule_submissions'],
    ['book', 'booking_slots'],
    ['claim', 'claim_items'],
    ['game_hub', 'game_rooms'],
  ]) {
    assert.match(files.detail, new RegExp(`${projectType}:[\\s\\S]{0,140}${collectionPattern}`), `Project detail should map ${projectType} to its child data collections`);
  }
  assert.match(files.detail, /workspaceDataLoadErrors = \{\}/, 'Project detail should default child collection load errors');
  assert.match(files.detail, /onRetryWorkspaceData = \(\) => \{\}/, 'Project detail should default child data retry action');
  assert.match(files.detail, /hasWorkspaceDataLoadError/, 'Project detail should derive a workspace load error for the current project type');
  assert.match(files.detail, /hasWorkspaceDataLoadError[\s\S]{0,900}role="alert"[\s\S]{0,520}t\('workspaceDataLoadFailed'\)/, 'Project detail should announce localized workspace data failures');
  assert.match(files.detail, /onClick=\{onRetryWorkspaceData\}/, 'Workspace data retry should call the retry action');
  assert.match(files.detail, /t\('chatRetry'\)/, 'Workspace data retry should use localized copy');
  assert.match(files.detail, /hasWorkspaceDataLoadError \? \(/, 'Workspace content should be gated behind the child data load error state');
});

test('project detail actions await writes before navigation and expose pending state', async () => {
  const detail = await readFile(path.join(root, 'src/pages/ProjectDetail.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.actionFailed, 'missing English action failure template');
  assert.ok(TRANSLATIONS.zh.actionFailed, 'missing Chinese action failure template');

  assert.match(detail, /pendingProjectActionRef\s*=\s*useRef\(null\)/, 'Project actions should use a synchronous action lock');
  assert.match(detail, /if \(pendingProjectActionRef\.current\) return fallbackResult;/, 'Project actions should ignore duplicate confirmations before state rerenders');
  assert.match(detail, /setPendingProjectAction\(actionKey\)[\s\S]{0,900}finally[\s\S]{0,240}setPendingProjectAction\(null\)/, 'Project actions should expose pending state for the whole write');
  assert.match(detail, /showToast\(t\('actionFailed', \{ action: actionLabel, message: error\?\.message \|\| t\('failed'\) \}\), 'error'\)/, 'Project action failures should use localized app feedback');
  assert.match(detail, /onConfirm:\s*handleDuplicateProjectConfirm/, 'Project duplicate confirmation should route through the guarded duplicate handler');
  assert.match(detail, /onConfirm:\s*\(\) => handleArchiveProjectConfirm\(archived\)/, 'Project archive confirmation should route through the guarded archive handler');
  assert.match(detail, /onConfirm:\s*handleDeleteProjectConfirm/, 'Project delete confirmation should route through the guarded delete handler');
  assert.match(detail, /await actions\.handleDeleteProject\(project\.id\)[\s\S]{0,180}return true/, 'Project deletion should await the write and return success before navigation');
  assert.match(detail, /if \(deleted\) navigate\('\/'\)/, 'Project deletion should navigate only after the delete write succeeds');
  assert.doesNotMatch(detail, /onConfirm:\s*\(\) => \{ actions\.handleDeleteProject\(project\.id\); navigate\('\/'\); \}/, 'Project deletion should not navigate before the async delete resolves');
  assert.match(detail, /disabled=\{isProjectActionPending\}/, 'Project action buttons should be disabled while another project action is pending');
  assert.match(detail, /aria-busy=\{isDuplicateProjectPending\}/, 'Project duplicate button should expose pending state');
  assert.match(detail, /aria-busy=\{isArchiveProjectPending\}/, 'Project archive button should expose pending state');
  assert.match(detail, /aria-busy=\{isDeleteProjectPending\}/, 'Project delete button should expose pending state');
  assert.match(detail, /isDeleteProjectPending \? t\('processing'\) :/, 'Project delete button should show localized pending copy');
});

test('project detail exposes localized project insights', async () => {
  const files = {
    app: await readFile(path.join(root, 'src/App.jsx'), 'utf8'),
    detail: await readFile(path.join(root, 'src/pages/ProjectDetail.jsx'), 'utf8'),
  };

  for (const key of [
    'projectInsights',
    'projectInsightNextAction',
    'insightItems',
    'insightVotes',
    'insightFields',
    'insightResponses',
    'insightParticipants',
    'insightSlots',
    'insightBooked',
    'insightWaitlist',
    'insightTasks',
    'insightClaimed',
    'insightActivity',
    'insightFinishSetup',
    'insightInviteParticipants',
    'insightOpenSlots',
    'insightRunResult',
    'insightReviewProgress',
    'insightReviewResults',
    'insightRestoreToEdit',
    'insightResumeToEdit',
  ]) {
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }

  assert.match(files.detail, /createProjectInsightSummary/, 'Project detail should derive insights through the domain helper');
  assert.match(files.detail, /ProjectInsightsCard/, 'Project detail should render a reusable insights card');
  assert.match(files.detail, /aria-label=\{t\('projectInsights'\)\}/, 'Insights card should expose a localized accessible label');
  assert.match(files.detail, /projectInsightSummary\.metrics\.map/, 'Insights card should render metric rows from the domain summary');
  assert.match(files.detail, /t\(projectInsightSummary\.nextActionKey\)/, 'Insights next action should be localized from the domain summary');
  assert.match(files.detail, /gameRooms = \[\]/, 'Project detail should accept game room data for insights');
  assert.match(files.detail, /const projectGameRooms = \(gameRooms \|\| \[\]\)\.filter\(\(room\) => room\.projectId === project\.id\);/, 'Project detail should scope game room data before building insights');
  assert.match(files.detail, /gameRooms: projectGameRooms/, 'Project detail should pass scoped game room data into the insight summary');
  assert.match(files.app, /const \[gameRooms,\s*setGameRooms\] = useState\(\[\]\)/, 'App should keep game room data available for project insights');
  assert.match(files.app, /subscribeWorkspaceCollection\('game_rooms', setGameRooms\)/, 'App should subscribe to game rooms for project insights');
  assert.doesNotMatch(files.detail, />Project Insights<|>Next action<|>Review progress/, 'Project insights visible copy should be localized');
});

test('password-protected project unlocks use server access grants', async () => {
  const files = {
    dashboard: await readFile(path.join(root, 'src/pages/Dashboard.jsx'), 'utf8'),
    detail: await readFile(path.join(root, 'src/pages/ProjectDetail.jsx'), 'utf8'),
    apiClient: await readFile(path.join(root, 'src/lib/apiClient.js'), 'utf8'),
  };
  const combinedSource = Object.values(files).join('\n');

  assert.match(combinedSource, /\/api\/project-access\/unlock/, 'Project unlocks should call the backend grant endpoint');
  assert.match(files.dashboard, /unlockProjectAccess/, 'Dashboard password modal should request a server grant');
  assert.match(files.detail, /unlockProjectAccess/, 'Project detail password guard should request a server grant');
  assert.match(files.dashboard, /hasProjectPassword/, 'Dashboard should use lock metadata instead of raw project passwords');
  assert.match(files.detail, /hasProjectPassword/, 'Project detail should use lock metadata instead of raw project passwords');
  assert.match(
    files.dashboard,
    /state:\s*\{\s*unlockedProjectId:\s*project\.id\s*\}/,
    'Dashboard should pass a project-scoped unlock state after a successful grant',
  );
  assert.doesNotMatch(
    files.dashboard,
    /state:\s*\{\s*unlocked:\s*true\s*\}/,
    'Dashboard should not pass a reusable boolean unlock state',
  );
  assert.doesNotMatch(
    files.dashboard,
    /inputPassword\s*===\s*passwordPromptProject\.password/,
    'Dashboard should not compare private project passwords in browser state',
  );
  assert.doesNotMatch(
    files.detail,
    /inputPassword\s*===\s*project\.password/,
    'Project detail should not compare private project passwords in browser state',
  );
});

test('password-protected project unlocks expose pending and accessible error states', async () => {
  const files = {
    dashboard: await readFile(path.join(root, 'src/pages/Dashboard.jsx'), 'utf8'),
    detail: await readFile(path.join(root, 'src/pages/ProjectDetail.jsx'), 'utf8'),
  };

  assert.match(files.dashboard, /\[isUnlockingProject,\s*setIsUnlockingProject\]\s*=\s*useState\(false\)/, 'Dashboard unlock modal should track pending unlock requests');
  assert.match(files.detail, /\[isUnlockingProject,\s*setIsUnlockingProject\]\s*=\s*useState\(false\)/, 'Project detail unlock guard should track pending unlock requests');

  for (const [fileKey, source] of Object.entries(files)) {
    assert.match(source, /if \([^)]*isUnlockingProject[^)]*\) return;/, `${fileKey} unlock submit should ignore duplicate submissions`);
    assert.match(source, /setIsUnlockingProject\(true\)[\s\S]{0,520}finally\s*\{[\s\S]{0,160}setIsUnlockingProject\(false\)/, `${fileKey} unlock submit should reset pending state in a finally block`);
    assert.match(source, /disabled=\{isUnlockingProject\}/, `${fileKey} unlock password input should be disabled while submitting`);
    assert.match(source, /aria-invalid=\{passwordError\}/, `${fileKey} unlock password input should expose invalid state`);
    assert.match(source, /aria-describedby=\{passwordError \? 'project-unlock-error' : undefined\}/, `${fileKey} unlock password input should reference the current error`);
    assert.match(source, /PROJECT_PASSWORD_MAX_LENGTH/, `${fileKey} unlock password input should share the project password limit`);
    assert.match(source, /maxLength=\{PROJECT_PASSWORD_MAX_LENGTH\}/, `${fileKey} unlock password input should cap text before submit`);
    assert.match(source, /setInputPassword\(normalizeProjectPasswordInput\(e\.target\.value\)\)/, `${fileKey} unlock password edits should use the shared input cap`);
    assert.match(source, /id="project-unlock-error" role="alert" aria-live="assertive"/, `${fileKey} unlock error should be announced assertively`);
    assert.match(source, /isUnlockingProject \? t\('processing'\) : t\('unlock'\)/, `${fileKey} unlock submit button should show localized progress copy`);
  }
});

test('game and booking workspaces use localized ergonomic states', async () => {
  const files = {
    gameHub: await readFile(path.join(root, 'src/components/GameHubView.jsx'), 'utf8'),
    booking: await readFile(path.join(root, 'src/components/BookingView.jsx'), 'utf8'),
  };

  for (const key of [
    'gameHub',
    'createRoom',
    'startNewGame',
    'selectGame',
    'roomName',
    'bestOfRounds',
    'turnTimeout',
    'playVsComputer',
    'noActiveRooms',
    'createdBy',
    'you',
    'bot',
    'waitingForOpponent',
    'joinGame',
    'players',
    'score',
    'leaveRoom',
    'previousRounds',
    'victory',
    'defeat',
    'ready',
    'gameOver',
    'missionAccomplished',
    'spectateOthers',
  ]) {
    assert.match(files.gameHub, new RegExp(`t\\('${key}'\\)`), `Game hub should localize ${key}`);
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }

  assert.doesNotMatch(files.gameHub, />Game Hub<|Create Room|Start a New Game|Select Game|Room Name|Waiting for opponent|Join Game|Leave Room|Previous Rounds|BOOM! Game Over|Mission Accomplished|Spectate others/, 'Game hub should avoid hardcoded visible English');
  assert.match(files.booking, /app-card-quiet[\s\S]{0,300}configureFirst/, 'Booking unconfigured state should use a designed empty-state surface');
});

test('game hub exposes localized active and finished room summaries', async () => {
  const files = {
    gameHub: await readFile(path.join(root, 'src/components/GameHubView.jsx'), 'utf8'),
    projectDomain: await readFile(path.join(root, 'src/lib/projectDomain.js'), 'utf8'),
  };

  for (const key of [
    'activeRooms',
    'finishedRooms',
    'noFinishedRooms',
    'gameMyHistory',
    'gameHistoryEmpty',
    'gameHistoryRecord',
    'gameHistoryRecent',
    'gameHistoryWins',
    'gameHistoryLosses',
    'gameHistoryDraws',
    'gameHistoryWin',
    'gameHistoryLoss',
    'gameHistoryDraw',
    'copyRoomInvite',
    'roomInviteCopied',
    'roomInviteUnavailable',
    'roomInviteManualCopy',
    'roomInviteManualCopyHint',
    'gameResult',
    'gameWinner',
    'gameRoundsPlayed',
    'gameLastRound',
    'gameScoreLine',
  ]) {
    assert.match(files.gameHub, new RegExp(`t\\('${key}'(?:,|\\))`), `Game hub should localize ${key}`);
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }

  assert.match(files.gameHub, /createGameRoomSummary/, 'Game hub should derive list summaries through the domain helper');
  assert.match(files.gameHub, /createUserGameResultHistory/, 'Game hub should derive per-user result history through the domain helper');
  assert.match(files.gameHub, /createGameRoomInviteUrl/, 'Game hub should build shareable room invite URLs through the domain helper');
  assert.match(files.gameHub, /getGameRoomInviteId/, 'Game hub should read room invites from the URL through the domain helper');
  assert.match(files.gameHub, /navigator\.clipboard\.writeText/, 'Game hub should copy room invite links to the clipboard');
  assert.match(files.gameHub, /\[manualRoomInviteUrl,\s*setManualRoomInviteUrl\]\s*=\s*useState\(''\)/, 'Game hub should keep a manual invite fallback URL');
  assert.match(files.gameHub, /setManualRoomInviteUrl\(inviteUrl\)/, 'Clipboard failures should preserve the invite URL for manual copy');
  assert.match(files.gameHub, /roomInviteManualCopy/, 'Clipboard failures should use localized manual-copy recovery copy');
  assert.match(files.gameHub, /readOnly[\s\S]{0,240}value=\{manualRoomInviteUrl\}/, 'Manual room invite fallback should render the URL in a read-only field');
  assert.match(files.gameHub, /setManualRoomInviteUrl\(''\)/, 'Manual room invite fallback should be dismissible');
  assert.match(files.gameHub, /history\.replaceState/, 'Game hub should keep active room URL state in sync without navigation');
  assert.match(files.gameHub, /roomInviteUnavailable/, 'Invalid room invite links should use localized feedback');
  assert.match(files.gameHub, /userResultHistory/, 'Game hub should expose a current-user result history panel');
  assert.match(files.gameHub, /createRpsNextRoundPatch/, 'RPS room transitions should use the domain helper');
  assert.match(files.gameHub, /normalizeRpsScoreInput/, 'RPS score badges should normalize legacy scores before rendering');
  assert.doesNotMatch(files.gameHub, /\{opponent\.score\}/, 'RPS opponent score badge should not render raw score values');
  assert.doesNotMatch(files.gameHub, /\{me\.score\}/, 'RPS current-user score should not render raw score values');
  assert.match(files.gameHub, /createMineRoomProgressPatch/, 'Minesweeper progress should use the domain helper for terminal room summaries');
  assert.match(files.gameHub, /normalizeMineProgressInput/, 'Minesweeper player list should normalize legacy progress before sorting and rendering');
  assert.doesNotMatch(files.gameHub, /room\.players\?\.sort/, 'Minesweeper player list should not mutate live room player snapshots while sorting');
  assert.match(files.gameHub, /setActiveTab\('finished'\)/, 'Game hub should expose finished rooms');
  assert.match(files.gameHub, /setActiveTab\('lobby'\)/, 'Game hub should expose active rooms');
  assert.match(files.gameHub, /currentActiveRoom/, 'Active game room should be derived from live room snapshots');
  assert.match(files.gameHub, /visibleRooms/, 'Room tabs should filter the full project room snapshot');
  assert.match(files.gameHub, /roomSummary\.winnerName/, 'Room cards should show the finished winner');
  assert.match(files.gameHub, /roomSummary\.scoreLine/, 'Room cards should show the score line');
  assert.match(files.projectDomain, /resultSummary/, 'Finished game rooms should persist a reusable result summary');
  assert.match(files.projectDomain, /createMineRoomProgressPatch/, 'Minesweeper completion should persist a reusable result summary');
  assert.doesNotMatch(files.gameHub, />Finished|>Active|>Winner|>Rounds|>Last round|No finished rooms/, 'Game hub result copy should be localized');
});

test('game hub exposes a recoverable room load error state', async () => {
  const gameHub = await readFile(path.join(root, 'src/components/GameHubView.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.gameRoomsLoadFailed, 'missing English game room load failure translation');
  assert.ok(TRANSLATIONS.zh.gameRoomsLoadFailed, 'missing Chinese game room load failure translation');
  assert.ok(TRANSLATIONS.en.chatRetry, 'missing English retry translation');
  assert.ok(TRANSLATIONS.zh.chatRetry, 'missing Chinese retry translation');

  assert.match(gameHub, /RotateCcw/, 'Game room retry should use the shared retry icon');
  assert.match(gameHub, /\[gameRoomsLoadError,\s*setGameRoomsLoadError\]\s*=\s*useState\(false\)/, 'Game hub should track room load errors separately from an empty room list');
  assert.match(gameHub, /\[gameRoomsReloadKey,\s*setGameRoomsReloadKey\]\s*=\s*useState\(0\)/, 'Game hub should expose a retry trigger for failed room subscriptions');
  assert.match(gameHub, /setGameRoomsLoadError\(false\)[\s\S]{0,360}setRoomsSnapshot\(/, 'Successful room reads should clear the load error before rendering rooms');
  assert.match(gameHub, /onSnapshot\(q,[\s\S]{0,1600}\(error\) => \{[\s\S]{0,300}setGameRoomsLoadError\(true\)/, 'Game hub should handle room subscription errors');
  assert.match(gameHub, /\}, \[gameRoomsReloadKey, project\.id, replaceRoomInviteUrl, showToast, t\]\)/, 'Game room retry should recreate the subscription');
  assert.match(gameHub, /if \(gameRoomsLoadError\)[\s\S]{0,900}role="alert"[\s\S]{0,420}t\('gameRoomsLoadFailed'\)/, 'Game hub should render announced localized room load failure copy');
  assert.match(gameHub, /onClick=\{\(\) => setGameRoomsReloadKey\(\(current\) => current \+ 1\)\}/, 'Game room retry should refresh the subscription');
  assert.match(gameHub, /t\('chatRetry'\)/, 'Game room retry button should use localized copy');
});

test('game hub room actions prevent duplicate submits and expose pending state', async () => {
  const gameHub = await readFile(path.join(root, 'src/components/GameHubView.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.gameActionFailed, 'missing English game action failure translation');
  assert.ok(TRANSLATIONS.zh.gameActionFailed, 'missing Chinese game action failure translation');

  assert.match(gameHub, /isCreatingGameRoomRef\s*=\s*useRef\(false\)/, 'Game room creation should use a synchronous action lock');
  assert.match(gameHub, /if \(isCreatingGameRoomRef\.current\) return;/, 'Game room creation should ignore duplicate submits before state rerenders');
  assert.match(gameHub, /setIsCreatingGameRoom\(true\)[\s\S]{0,1100}finally[\s\S]{0,240}setIsCreatingGameRoom\(false\)/, 'Game room creation should expose pending state for the whole write');
  assert.match(gameHub, /showToast\(t\('gameActionFailed'\), 'error'\)/, 'Game room actions should use localized failure feedback');
  assert.match(gameHub, /aria-busy=\{isCreatingGameRoom\}/, 'Game room creation form should expose pending state to assistive technology');
  assert.match(gameHub, /disabled=\{isCreatingGameRoom\}/, 'Game room creation controls should be disabled while creating');
  assert.match(gameHub, /isCreatingGameRoom \? t\('processing'\) : t\('createRoom'\)/, 'Game room create button should show localized progress copy');

  assert.match(gameHub, /isJoiningRpsGameRef\s*=\s*useRef\(false\)/, 'RPS joins should use a synchronous action lock');
  assert.match(gameHub, /if \(isJoiningRpsGameRef\.current\) return;/, 'RPS joins should ignore duplicate clicks before state rerenders');
  assert.match(gameHub, /setIsJoiningRpsGame\(true\)[\s\S]{0,700}finally[\s\S]{0,220}setIsJoiningRpsGame\(false\)/, 'RPS joins should expose pending state for the whole write');
  assert.match(gameHub, /disabled=\{!canInteract \|\| isJoiningRpsGame\}/, 'RPS join button should be disabled while joining');
  assert.match(gameHub, /aria-busy=\{isJoiningRpsGame\}/, 'RPS join button should expose pending state to assistive technology');
  assert.match(gameHub, /isJoiningRpsGame \? t\('processing'\) : t\('joinGame'\)/, 'RPS join button should show localized progress copy');

  assert.match(gameHub, /isJoiningMinesweeperRef\s*=\s*useRef\(false\)/, 'Minesweeper joins should use a synchronous action lock');
  assert.match(gameHub, /if \(isJoiningMinesweeperRef\.current\) return;/, 'Minesweeper joins should ignore duplicate clicks before state rerenders');
  assert.match(gameHub, /setIsJoiningMinesweeper\(true\)[\s\S]{0,700}finally[\s\S]{0,220}setIsJoiningMinesweeper\(false\)/, 'Minesweeper joins should expose pending state for the whole write');
  assert.match(gameHub, /disabled=\{!canInteract \|\| isJoiningMinesweeper\}/, 'Minesweeper join button should be disabled while joining');
  assert.match(gameHub, /aria-busy=\{isJoiningMinesweeper\}/, 'Minesweeper join button should expose pending state to assistive technology');
  assert.match(gameHub, /isJoiningMinesweeper \? t\('processing'\) : t\('joinMinesweeper'\)/, 'Minesweeper join button should show localized progress copy');
});

test('collaboration workspaces avoid fallback copy and clickable divs', async () => {
  const files = {
    friends: await readFile(path.join(root, 'src/components/FriendSystem.jsx'), 'utf8'),
    claim: await readFile(path.join(root, 'src/components/ClaimView.jsx'), 'utf8'),
    gather: await readFile(path.join(root, 'src/components/GatherView.jsx'), 'utf8'),
  };

  for (const key of [
    'friends',
    'addFriend',
    'backToList',
    'requests',
    'accept',
    'ignore',
    'searchPlaceholderUser',
    'go',
    'searchHint',
    'tapToChat',
    'noFriends',
    'selectFriend',
    'typeMessage',
    'unknownUser',
    'friendRequestSent',
    'friendAdded',
  ]) {
    assert.match(files.friends, new RegExp(`t\\('${key}'\\)`), `Friend system should localize ${key}`);
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }

  assert.doesNotMatch(files.friends, /\|\|\s*['"][A-Za-z][^'"]*['"]/, 'Friend system should not rely on visible English fallback strings');
  assert.match(files.friends, /<button[\s\S]{0,300}setActiveChatFriend\(f\)/, 'Friend rows should use semantic buttons');
  assert.doesNotMatch(files.friends, /<div\s+key=\{f\.id\}[\s\S]{0,300}setActiveChatFriend\(f\)/, 'Friend rows should not use clickable divs');

  assert.match(files.claim, /app-card-quiet[\s\S]{0,300}noTasks/, 'Claim empty state should use a designed surface');
  assert.doesNotMatch(files.claim, />[^<]*only</, 'Claim filters should localize the only label');
  assert.doesNotMatch(files.claim, /\(Open\)/, 'Claim open state should be localized');

  for (const key of ['nameLabel', 'timeLabel', 'submittedOn', 'enterField', 'yourResponse']) {
    assert.match(files.gather, new RegExp(`t\\('${key}'(?:,|\\))`), `Gather should localize ${key}`);
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }
  assert.doesNotMatch(files.gather, new RegExp('>Name<|>Time<|Name / Nickname|Submitted on|`Enter \\\\$\\\\{field\\\\.label\\\\}`'), 'Gather should avoid hardcoded visible English');
});

test('gather workspace supports localized typed fields', async () => {
  const gather = await readFile(path.join(root, 'src/components/GatherView.jsx'), 'utf8');

  for (const key of [
    'fieldType',
    'fieldTypeText',
    'fieldTypeNumber',
    'fieldTypeDate',
    'fieldTypeOption',
    'fieldOptions',
    'fieldOptionsPlaceholder',
    'selectOption',
  ]) {
    assert.match(gather, new RegExp(`t\\('${key}'(?:,|\\))`), `Gather should localize ${key}`);
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }

  assert.match(gather, /newFieldType/, 'Gather creator controls should track the selected field type');
  assert.match(gather, /newFieldOptions/, 'Gather option fields should collect option choices');
  assert.match(gather, /<select[\s\S]{0,300}fieldType/, 'Gather field type should use a semantic select');
  assert.match(gather, /type="number"/, 'Gather number fields should render a numeric input');
  assert.match(gather, /type="date"/, 'Gather date fields should render a date input');
  assert.match(gather, /<select[\s\S]{0,500}selectOption/, 'Gather option fields should render a semantic select');
  assert.doesNotMatch(gather, />Text<|>Number<|>Date<|>Option<|placeholder="Yes, No/, 'Gather typed field visible copy should be localized');
});

test('gather submission form prevents duplicate submits and exposes pending state', async () => {
  const gather = await readFile(path.join(root, 'src/components/GatherView.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.submitError, 'missing English gather submit error translation');
  assert.ok(TRANSLATIONS.zh.submitError, 'missing Chinese gather submit error translation');

  assert.match(gather, /isSubmittingGatherRef\s*=\s*useRef\(false\)/, 'Gather submit should use a synchronous action lock');
  assert.match(gather, /if \(isSubmittingGatherRef\.current\) return;/, 'Gather submit should ignore duplicate writes before state rerenders');
  assert.match(gather, /setIsSubmittingGather\(true\)[\s\S]{0,900}finally[\s\S]{0,240}setIsSubmittingGather\(false\)/, 'Gather submit should expose pending state for the whole write');
  assert.match(gather, /await actions\.handleSubmitGather\(project\.id, formData, submitterName\)/, 'Gather submit should await the write while pending');
  assert.match(gather, /showToast\(t\('submitSuccess'\), 'success'\)/, 'Gather submit success should keep localized app feedback');
  assert.match(gather, /showToast\(t\('errorWithMessage', \{ title: t\('submitError'\), message: error\.message \}\), 'error'\)/, 'Gather submit failures should use localized app feedback');
  assert.match(gather, /<form onSubmit=\{handleSubmit\} aria-busy=\{isSubmittingGather\}/, 'Gather form should expose pending state to assistive technology');
  assert.match(gather, /disabled=\{isSubmittingGather\}/, 'Gather form controls should be disabled while submitting');
  assert.match(gather, /isSubmittingGather \? t\('processing'\) : t\('submit'\)/, 'Gather submit button should show localized progress copy');
});

test('gather field management prevents duplicate actions and exposes pending state', async () => {
  const gather = await readFile(path.join(root, 'src/components/GatherView.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.gatherActionFailed, 'missing English gather action failure translation');
  assert.ok(TRANSLATIONS.zh.gatherActionFailed, 'missing Chinese gather action failure translation');

  assert.match(gather, /isCreatingGatherFieldRef\s*=\s*useRef\(false\)/, 'Gather field creation should use a synchronous submit lock');
  assert.match(gather, /if \(isCreatingGatherFieldRef\.current\) return;/, 'Gather field creation should ignore duplicate submits before state rerenders');
  assert.match(gather, /setIsCreatingGatherField\(true\)[\s\S]{0,780}finally[\s\S]{0,220}setIsCreatingGatherField\(false\)/, 'Gather field creation should expose pending state for the whole write');
  assert.match(gather, /await actions\.handleCreateGatherField\(project\.id, newField\.trim\(\), newFieldType, newFieldOptions\)/, 'Gather field creation should await the write while pending');
  assert.match(gather, /showToast\(t\('gatherActionFailed'\), 'error'\)/, 'Gather field failures should use localized app feedback');
  assert.match(gather, /<form onSubmit=\{handleAddField\} aria-busy=\{isCreatingGatherField\}/, 'Gather field creation form should expose pending state to assistive technology');
  assert.match(gather, /disabled=\{isCreatingGatherField\}/, 'Gather field creation controls should be disabled while creating');
  assert.match(gather, /disabled=\{isCreatingGatherField \|\| !canCreateField\}/, 'Gather field creation button should be disabled while pending or invalid');
  assert.match(gather, /isCreatingGatherField \? t\('processing'\) : t\('create'\)/, 'Gather field creation button should show localized progress copy');

  assert.match(gather, /pendingGatherFieldIdsRef\s*=\s*useRef\(new Set\(\)\)/, 'Gather field deletion should track pending field ids in a ref');
  assert.match(gather, /if \(pendingGatherFieldIdsRef\.current\.has\(fieldId\)\) return;/, 'Gather field deletion should ignore duplicate clicks for the same field');
  assert.match(gather, /pendingGatherFieldIdsRef\.current\.add\(fieldId\)[\s\S]{0,220}setPendingGatherFieldIds\(\[\.\.\.pendingGatherFieldIdsRef\.current\]\)/, 'Gather field deletion should expose pending ids immediately');
  assert.match(gather, /await actions\.handleDeleteGatherField\(fieldId\)/, 'Gather field deletion should await the write while pending');
  assert.match(gather, /finally[\s\S]{0,260}pendingGatherFieldIdsRef\.current\.delete\(fieldId\)[\s\S]{0,160}setPendingGatherFieldIds\(\[\.\.\.pendingGatherFieldIdsRef\.current\]\)/, 'Gather field deletion should clear pending state after writes settle');
  assert.match(gather, /pendingGatherFieldIds\.includes\(field\.id\)/, 'Gather field chips should derive pending state from the field id');
  assert.match(gather, /disabled=\{isFieldDeletePending\}/, 'Gather field delete buttons should be disabled while deleting');
  assert.match(gather, /aria-busy=\{isFieldDeletePending\}/, 'Gather field delete buttons should expose busy state');
  assert.match(gather, /title=\{isFieldDeletePending \? t\('processing'\) : t\('deleteField'\)\}/, 'Gather field delete buttons should expose localized pending copy');
});

test('voting workspace exposes localized admin vote-mode controls', async () => {
  const files = {
    voting: await readFile(path.join(root, 'src/components/VotingView.jsx'), 'utf8'),
    detail: await readFile(path.join(root, 'src/pages/ProjectDetail.jsx'), 'utf8'),
  };

  for (const key of ['voteMode', 'voteModeMultiple', 'voteModeSingle']) {
    assert.match(files.voting, new RegExp(`t\\('${key}'(?:,|\\))`), `Voting view should localize ${key}`);
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }

  assert.match(files.voting, /votingConfig/, 'Voting view should receive project votingConfig');
  assert.match(files.voting, /onUpdateVotingConfig/, 'Voting view should expose a config update callback');
  assert.match(files.voting, /role="group"/, 'Vote mode control should be grouped for assistive technology');
  assert.match(files.voting, /aria-pressed/, 'Vote mode buttons should expose selected state');
  assert.match(files.voting, /hasAdminRights/, 'Vote mode controls should only be visible to owner/admin users');
  assert.match(files.detail, /onUpdateVotingConfig=\{actions\.handleUpdateVotingConfig\}/, 'Project detail should wire voting config updates');
  assert.doesNotMatch(files.voting, />Multiple<|>Single<|>Mode</, 'Voting mode visible copy should be localized');
});

test('voting mode updates prevent duplicate submits and expose pending state', async () => {
  const voting = await readFile(path.join(root, 'src/components/VotingView.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.voteActionFailed, 'missing English vote action failure translation');
  assert.ok(TRANSLATIONS.zh.voteActionFailed, 'missing Chinese vote action failure translation');

  assert.match(voting, /isUpdatingVoteModeRef\s*=\s*useRef\(false\)/, 'Vote mode updates should use a synchronous submit lock');
  assert.match(voting, /if \(isUpdatingVoteModeRef\.current\) return;/, 'Vote mode updates should ignore duplicate clicks before state rerenders');
  assert.match(voting, /setIsUpdatingVoteMode\(true\)[\s\S]{0,760}finally[\s\S]{0,220}setIsUpdatingVoteMode\(false\)/, 'Vote mode updates should expose pending state for the whole write');
  assert.match(voting, /await onUpdateVotingConfig\(projectId, \{ \.\.\.\(votingConfig \|\| \{\}\), mode \}\)/, 'Vote mode updates should await the write while pending');
  assert.match(voting, /showToast\(t\('voteActionFailed'\), 'error'\)/, 'Vote mode update failures should use localized app feedback');
  assert.match(voting, /disabled=\{isStopped \|\| isUpdatingVoteMode\}/, 'Vote mode controls should be disabled while updating');
  assert.match(voting, /aria-busy=\{isUpdatingVoteMode && !selected\}/, 'Vote mode buttons should expose pending state');
  assert.match(voting, /isUpdatingVoteMode && !selected \? t\('processing'\) : mode\.label/, 'Vote mode buttons should show localized progress copy');
});

test('voting item vote actions prevent duplicate toggles and expose pending state', async () => {
  const voting = await readFile(path.join(root, 'src/components/VotingView.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.voteActionFailed, 'missing English vote action failure translation');
  assert.ok(TRANSLATIONS.zh.voteActionFailed, 'missing Chinese vote action failure translation');
  assert.ok(TRANSLATIONS.en.voteActionLabel, 'missing English vote action label translation');
  assert.ok(TRANSLATIONS.zh.voteActionLabel, 'missing Chinese vote action label translation');

  assert.match(voting, /pendingVoteItemIdsRef\s*=\s*useRef\(new Set\(\)\)/, 'Voting toggles should track pending item ids in a ref');
  assert.match(voting, /if \(pendingVoteItemIdsRef\.current\.has\(itemId\)\) return;/, 'Voting toggles should ignore duplicate clicks for the same item');
  assert.match(voting, /pendingVoteItemIdsRef\.current\.add\(itemId\)[\s\S]{0,220}setPendingVoteItemIds\(\[\.\.\.pendingVoteItemIdsRef\.current\]\)/, 'Voting toggles should expose pending ids immediately');
  assert.match(voting, /await onVote\(item\)/, 'Voting toggles should await the write while pending');
  assert.match(voting, /showToast\(t\('voteActionFailed'\), 'error'\)/, 'Voting toggle failures should use localized app feedback');
  assert.match(voting, /finally[\s\S]{0,260}pendingVoteItemIdsRef\.current\.delete\(itemId\)[\s\S]{0,160}setPendingVoteItemIds\(\[\.\.\.pendingVoteItemIdsRef\.current\]\)/, 'Voting toggles should clear pending state after the write settles');
  assert.match(voting, /pendingVoteItemIds\.includes\(item\.id\)/, 'Voting rows should derive pending state from the item id');
  assert.match(voting, /disabled=\{isStopped \|\| isVotePending\}/, 'Voting toggle buttons should be disabled while pending');
  assert.match(voting, /aria-busy=\{isVotePending\}/, 'Voting toggle buttons should expose busy state');
  assert.match(voting, /aria-label=\{isVotePending \? t\('processing'\) : t\('voteActionLabel'\)\}/, 'Voting toggle buttons should expose localized pending labels');
});

test('voting item creation prevents duplicate submits and exposes pending state', async () => {
  const voting = await readFile(path.join(root, 'src/components/VotingView.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.voteActionFailed, 'missing English vote action failure translation');
  assert.ok(TRANSLATIONS.zh.voteActionFailed, 'missing Chinese vote action failure translation');

  assert.match(voting, /isAddingVoteItemRef\s*=\s*useRef\(false\)/, 'Voting item creation should use a synchronous submit lock');
  assert.match(voting, /if \(isAddingVoteItemRef\.current\) return;/, 'Voting item creation should ignore duplicate submits before state rerenders');
  assert.match(voting, /setIsAddingVoteItem\(true\)[\s\S]{0,760}finally[\s\S]{0,220}setIsAddingVoteItem\(false\)/, 'Voting item creation should expose pending state for the whole write');
  assert.match(voting, /await onAdd\(newItem, myName\)/, 'Voting item creation should await the write while pending');
  assert.match(voting, /showToast\(t\('voteActionFailed'\), 'error'\)/, 'Voting item creation failures should use localized app feedback');
  assert.match(voting, /<form onSubmit=\{handleAddItem\} aria-busy=\{isAddingVoteItem\}/, 'Voting item creation should use an accessible pending form');
  assert.match(voting, /disabled=\{isAddingVoteItem\}/, 'Voting item creation inputs should be disabled while creating');
  assert.match(voting, /disabled=\{isAddingVoteItem \|\| !newItem\.trim\(\)\}/, 'Voting item create button should be disabled while pending or blank');
  assert.match(voting, /isAddingVoteItem \? t\('processing'\) : t\('add'\)/, 'Voting item create button should show localized progress copy');
});

test('voting item deletion prevents duplicate submits and exposes pending state', async () => {
  const voting = await readFile(path.join(root, 'src/components/VotingView.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.voteActionFailed, 'missing English vote action failure translation');
  assert.ok(TRANSLATIONS.zh.voteActionFailed, 'missing Chinese vote action failure translation');

  assert.match(voting, /pendingDeleteVoteItemIdsRef\s*=\s*useRef\(new Set\(\)\)/, 'Voting deletes should track pending item ids in a ref');
  assert.match(voting, /if \(pendingDeleteVoteItemIdsRef\.current\.has\(itemId\)\) return;/, 'Voting deletes should ignore duplicate clicks for the same item');
  assert.match(voting, /pendingDeleteVoteItemIdsRef\.current\.add\(itemId\)[\s\S]{0,220}setPendingDeleteVoteItemIds\(\[\.\.\.pendingDeleteVoteItemIdsRef\.current\]\)/, 'Voting deletes should expose pending ids immediately');
  assert.match(voting, /await onDelete\(itemId\)/, 'Voting deletes should await the write while pending');
  assert.match(voting, /showToast\(t\('voteActionFailed'\), 'error'\)/, 'Voting delete failures should use localized app feedback');
  assert.match(voting, /finally[\s\S]{0,260}pendingDeleteVoteItemIdsRef\.current\.delete\(itemId\)[\s\S]{0,160}setPendingDeleteVoteItemIds\(\[\.\.\.pendingDeleteVoteItemIdsRef\.current\]\)/, 'Voting deletes should clear pending state after writes settle');
  assert.match(voting, /pendingDeleteVoteItemIds\.includes\(item\.id\)/, 'Voting rows should derive delete pending state from the item id');
  assert.match(voting, /disabled=\{isDeletePending\}/, 'Voting delete buttons should be disabled while deleting');
  assert.match(voting, /aria-busy=\{isDeletePending\}/, 'Voting delete buttons should expose busy state');
  assert.match(voting, /title=\{isDeletePending \? t\('processing'\) : t\('delete'\)\}/, 'Voting delete buttons should expose localized pending copy');
});

test('shared utility surfaces localize visible copy and retain ergonomic controls', async () => {
  const files = {
    detail: await readFile(path.join(root, 'src/pages/ProjectDetail.jsx'), 'utf8'),
    qr: await readFile(path.join(root, 'src/components/QRCodeShare.jsx'), 'utf8'),
    announcements: await readFile(path.join(root, 'src/components/AnnouncementSystem.jsx'), 'utf8'),
    chat: await readFile(path.join(root, 'src/components/ChatRoom.jsx'), 'utf8'),
    queue: await readFile(path.join(root, 'src/components/QueueView.jsx'), 'utf8'),
    booking: await readFile(path.join(root, 'src/components/BookingView.jsx'), 'utf8'),
    roulette: await readFile(path.join(root, 'src/components/RouletteView.jsx'), 'utf8'),
    ui: await readFile(path.join(root, 'src/components/UIComponents.jsx'), 'utf8'),
  };

  for (const [fileKey, keys] of Object.entries({
    detail: ['copyFullProjectId', 'projectIdCopied', 'projectIdManualCopy', 'projectIdManualCopyHint', 'projectView', 'share', 'chat', 'shareUnavailable'],
    qr: ['linkCopied', 'shareProject', 'copyLink', 'qrCodeAlt', 'shareUnavailable', 'shareManualCopy', 'shareManualCopyHint', 'qrCodeLoadFailed', 'qrCodeRetry'],
    announcements: ['announcements'],
    chat: ['chatRoom', 'noMessagesYet', 'messageSendFailed', 'anonymousUser', 'typeMessage'],
    queue: ['noParticipantsYet', 'currentUserBadge'],
    booking: ['bookingOwnerHint', 'requiredInfoPlaceholder', 'currentUserBadge'],
    roulette: ['replaySpeed', 'replayMaxSpeed', 'defaultWinner', 'projectStopped', 'youHaveJoined', 'waitForDraw', 'nameLabel', 'shortValueLabel'],
    ui: ['close', 'confirm', 'cancel'],
  })) {
    for (const key of keys) {
      assert.match(files[fileKey], new RegExp(`t\\('${key}'(?:,|\\))`), `${fileKey} should localize ${key}`);
      assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
      assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
    }
  }

  for (const [fileKey, source] of Object.entries(files)) {
    assert.doesNotMatch(source, /\|\|\s*['"][A-Z][^'"]*['"]/, `${fileKey} should not rely on visible English fallback strings`);
  }

  assert.doesNotMatch(files.detail, /Copy full ID|Copy full project ID|>Project View</, 'Project detail utility copy should be localized');
  assert.doesNotMatch(files.qr, /Link copied!|Share Project|Copy Link|alt="QR Code"/, 'QR share modal should localize all visible and accessible copy');
  assert.match(files.detail, /createProjectShareUrl/, 'Project detail should build canonical share links through the shared route helper');
  assert.match(files.detail, /const projectShareUrl = createProjectShareUrl/, 'Project detail should derive one canonical share URL per project');
  assert.match(files.detail, /<QRCodeShare url=\{projectShareUrl\}/, 'Project QR modal should share the canonical project URL instead of transient browser state');
  assert.match(files.detail, /showToast\(t\('projectIdCopied'\), 'success'\)/, 'Project ID copy should provide localized success feedback');
  assert.match(files.detail, /\[manualProjectId,\s*setManualProjectId\]\s*=\s*useState\(''\)/, 'Project ID copy should keep a manual fallback value');
  assert.match(files.detail, /await navigator\.clipboard\.writeText\(project\.id\)[\s\S]{0,160}setManualProjectId\(''\)/, 'Project ID copy success should clear stale manual fallback state');
  assert.match(files.detail, /catch[\s\S]{0,220}setManualProjectId\(project\.id\)[\s\S]{0,160}projectIdManualCopy/, 'Project ID copy failure should preserve the full ID and use localized recovery feedback');
  assert.match(files.detail, /manualProjectId[\s\S]{0,520}role="alert"[\s\S]{0,520}t\('projectIdManualCopy'\)/, 'Project ID copy failure should render announced manual-copy recovery copy');
  assert.match(files.detail, /readOnly[\s\S]{0,240}value=\{manualProjectId\}/, 'Project ID manual fallback should render the full ID in a read-only field');
  assert.match(files.detail, /onFocus=\{\(event\) => event\.target\.select\(\)\}/, 'Project ID manual fallback should select the full ID on focus');
  assert.match(files.detail, /setManualProjectId\(''\)/, 'Project ID manual fallback should be dismissible');
  assert.match(files.qr, /navigator\.clipboard\?\.writeText/, 'QR share copy should guard clipboard availability');
  assert.match(files.qr, /\[manualShareUrl,\s*setManualShareUrl\]\s*=\s*useState\(''\)/, 'QR share should keep a manual link fallback URL');
  assert.match(files.qr, /catch[\s\S]{0,220}setManualShareUrl\(url\)[\s\S]{0,160}shareManualCopy/, 'QR share copy failures should preserve the URL and use localized recovery feedback');
  assert.match(files.qr, /manualShareUrl[\s\S]{0,420}role="alert"[\s\S]{0,420}t\('shareManualCopy'\)/, 'QR share copy failures should render announced manual-copy recovery copy');
  assert.match(files.qr, /readOnly[\s\S]{0,240}value=\{manualShareUrl\}/, 'QR share manual fallback should render the URL in a read-only field');
  assert.match(files.qr, /setManualShareUrl\(''\)/, 'QR share manual fallback should be dismissible');
  assert.match(files.qr, /\[qrLoadError,\s*setQrLoadError\]\s*=\s*useState\(false\)/, 'QR share should track QR image load failures separately from the copy path');
  assert.match(files.qr, /onError=\{\(\) => setQrLoadError\(true\)\}/, 'QR image failures should switch the modal into a recoverable state');
  assert.match(files.qr, /qrLoadError[\s\S]{0,360}role="alert"[\s\S]{0,360}t\('qrCodeLoadFailed'\)/, 'QR load failures should render announced localized recovery copy');
  assert.match(files.qr, /setQrRetryKey\(\(current\) => current \+ 1\)[\s\S]{0,180}setQrLoadError\(false\)/, 'QR retry should force a new image request and clear the failure state');
  assert.match(files.qr, /RotateCcw/, 'QR retry should use the shared retry icon');
  assert.doesNotMatch(files.announcements, />Announcements<|title=["']Announcements|\|\|\s*['"]Announcements/, 'Announcement launcher and dialog should localize labels');
  assert.doesNotMatch(files.chat, /Chat Room|No messages yet|Type a message|Failed to send message|Anonymous/, 'Chat room should localize visible states and fallbacks');
  assert.match(files.queue, /app-card-quiet[\s\S]{0,300}noParticipantsYet/, 'Queue empty state should use a designed surface');
  assert.doesNotMatch(files.queue, /No participants yet|\(You\)/, 'Queue visible participant state should be localized');
  assert.doesNotMatch(files.booking, /Click empty slots|Red slots|\(You\)|placeholder="e\.g\. Name, Phone"/, 'Booking hints and current-user marker should be localized');
  assert.doesNotMatch(files.roulette, />Speed<|'MAX'|'Winner'|Project Stopped|You have joined|Your entry has been recorded|>Name<|>Val</, 'Roulette visible utility copy should be localized');
});

test('schedule workspace exposes localized owner recommendation summary', async () => {
  const schedule = await readFile(path.join(root, 'src/components/ScheduleView.jsx'), 'utf8');

  for (const key of [
    'scheduleRecommendations',
    'bestTime',
    'participantCoverage',
    'noRecommendations',
  ]) {
    assert.match(schedule, new RegExp(`t\\('${key}'(?:,|\\))`), `Schedule should localize ${key}`);
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }

  assert.match(schedule, /createScheduleRecommendationSummary/, 'Schedule should derive recommendations through the domain helper');
  assert.match(schedule, /scheduleSummary\.recommendations\.map/, 'Schedule should render recommendation rows from computed summary data');
  assert.match(schedule, /participantCoverage/, 'Schedule recommendation rows should show coverage');
  assert.match(schedule, /app-card[\s\S]{0,500}scheduleRecommendations/, 'Recommendation summary should use the shared app surface');
  assert.doesNotMatch(schedule, />Recommendations<|>Best time<|>No recommendations/, 'Schedule recommendation copy should be localized');
});

test('schedule config saves prevent duplicate submits and expose pending state', async () => {
  const schedule = await readFile(path.join(root, 'src/components/ScheduleView.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.scheduleConfigSaveFailed, 'missing English schedule config failure translation');
  assert.ok(TRANSLATIONS.zh.scheduleConfigSaveFailed, 'missing Chinese schedule config failure translation');

  assert.match(schedule, /isSavingScheduleConfigRef\s*=\s*useRef\(false\)/, 'Schedule config saves should use a synchronous action lock');
  assert.match(schedule, /if \(isSavingScheduleConfigRef\.current\) return;/, 'Schedule config saves should ignore duplicate clicks before rerender');
  assert.match(schedule, /isSavingScheduleConfigRef\.current = true[\s\S]{0,160}setIsSavingScheduleConfig\(true\)/, 'Schedule config saves should expose pending state before writing');
  assert.match(schedule, /await actions\.handleUpdateScheduleConfig\(project\.id, scheduleConfig\)/, 'Schedule config saves should await the write while pending');
  assert.match(schedule, /finally \{[\s\S]{0,160}isSavingScheduleConfigRef\.current = false[\s\S]{0,120}setIsSavingScheduleConfig\(false\)/, 'Schedule config saves should clear pending state when they settle');
  assert.match(schedule, /showToast\(t\('scheduleConfigSaveFailed'\), 'error'\)/, 'Schedule config save failures should use localized app feedback');
  assert.match(schedule, /disabled=\{isSavingScheduleConfig\}/, 'Schedule config form controls should be disabled while saving');
  assert.match(schedule, /aria-busy=\{isSavingScheduleConfig\}/, 'Schedule config save button should expose busy state');
  assert.match(schedule, /isSavingScheduleConfig \? t\('processing'\) : t\('saveConfig'\)/, 'Schedule config save button should show localized progress copy');
});

test('queue workspace exposes localized replayable audit steps', async () => {
  const files = {
    app: await readFile(path.join(root, 'src/App.jsx'), 'utf8'),
    queue: await readFile(path.join(root, 'src/components/QueueView.jsx'), 'utf8'),
  };

  for (const key of [
    'queueAuditTrail',
    'queueAuditFormula',
    'queueAuditStep',
    'queueAuditEmpty',
  ]) {
    assert.match(files.queue, new RegExp(`t\\('${key}'(?:,|\\))`), `Queue should localize ${key}`);
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }

  assert.match(files.queue, /project\.queueResult\?\.steps/, 'Queue should read persisted replay steps from the project result');
  assert.match(files.queue, /queueAuditSteps\.map/, 'Queue should render replay steps from computed audit data');
  assert.match(files.queue, /app-card[\s\S]{0,500}queueAuditTrail/, 'Queue audit should use the shared app surface');
  assert.match(files.app, /createQueueResultData/, 'App should derive queue result through the domain helper');
  assert.match(files.app, /queueResult:\s*queueResult/, 'App should persist queueResult on the project');
  assert.doesNotMatch(files.queue, />Audit|>Formula|>Step|No audit/i, 'Queue audit visible copy should be localized');
});

test('roulette workspace exposes localized replayable audit steps', async () => {
  const files = {
    app: await readFile(path.join(root, 'src/App.jsx'), 'utf8'),
    roulette: await readFile(path.join(root, 'src/components/RouletteView.jsx'), 'utf8'),
  };

  for (const key of [
    'rouletteAuditTrail',
    'rouletteAuditFormula',
    'rouletteAuditStep',
    'rouletteAuditEmpty',
    'rouletteAuditWinner',
    'rouletteAuditEliminated',
  ]) {
    assert.match(files.roulette, new RegExp(`t\\('${key}'(?:,|\\))`), `Roulette should localize ${key}`);
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }

  assert.match(files.roulette, /project\.rouletteResult\?\.steps/, 'Roulette should read persisted replay steps from the project result');
  assert.match(files.roulette, /rouletteAuditSteps\.map/, 'Roulette should render replay steps from persisted audit data');
  assert.match(files.roulette, /app-card[\s\S]{0,500}rouletteAuditTrail/, 'Roulette audit should use the shared app surface');
  assert.match(files.app, /createRouletteResultData/, 'App should derive roulette result through the domain helper');
  assert.match(files.app, /rouletteResult:\s*rouletteResult/, 'App should persist rouletteResult on the project');
  assert.doesNotMatch(files.roulette, />Audit|>Formula|>Step|No audit/i, 'Roulette audit visible copy should be localized');
});

test('roulette config saves prevent duplicate submits and expose pending state', async () => {
  const roulette = await readFile(path.join(root, 'src/components/RouletteView.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.rouletteConfigSaveFailed, 'missing English roulette config failure translation');
  assert.ok(TRANSLATIONS.zh.rouletteConfigSaveFailed, 'missing Chinese roulette config failure translation');

  assert.match(roulette, /isSavingRouletteConfigRef\s*=\s*useRef\(false\)/, 'Roulette config saves should use a synchronous action lock');
  assert.match(roulette, /if \(isSavingRouletteConfigRef\.current\) return;/, 'Roulette config saves should ignore duplicate clicks before rerender');
  assert.match(roulette, /isSavingRouletteConfigRef\.current = true[\s\S]{0,160}setIsSavingRouletteConfig\(true\)/, 'Roulette config saves should expose pending state before writing');
  assert.match(roulette, /normalizeRouletteConfigInput/, 'Roulette config saves should use the shared config normalizer');
  assert.match(roulette, /function createInitialRouletteConfig\(project\) \{\s*return normalizeRouletteConfigInput\(\{ \.\.\.DEFAULT_ROULETTE_CONFIG, \.\.\.\(project\.rouletteConfig \|\| \{\}\) \}\);\s*\}/, 'Roulette initial config should normalize persisted values before rendering controls');
  assert.match(roulette, /\[activeTab,\s*setActiveTab\]\s*=\s*useState\(\(\) => createInitialRouletteConfig\(project\)\.mode \|\| 'classic'\)/, 'Roulette active tab should initialize from normalized persisted mode');
  assert.match(roulette, /const simulationConfig = useMemo\(\(\) => normalizeRouletteConfigInput\(config\), \[config\]\)/, 'Roulette previews should use normalized config while the user edits');
  assert.match(roulette, /const mode = simulationConfig\.mode \|\| 'classic'/, 'Roulette preview mode should be read from normalized config');
  assert.match(roulette, /let survivorsNeeded = simulationConfig\.survivorCount/, 'Roulette survivor previews should use normalized survivor count');
  assert.match(roulette, /\(simulationConfig\.prizes \|\| \[\]\)\.forEach/, 'Roulette prize previews should use normalized prize counts');
  assert.match(roulette, /simulationConfig\.replaySpeed/, 'Roulette replay timing should use normalized replay speed');
  assert.match(roulette, /const normalizedConfig = normalizeRouletteConfigInput\(\{ \.\.\.config, mode: activeTab \}\)/, 'Roulette config should be normalized at save time');
  assert.match(roulette, /await actions\.handleUpdateRouletteConfig\(project\.id, normalizedConfig\)/, 'Roulette config saves should await the normalized write while pending');
  assert.match(roulette, /await actions\.handleUpdateRouletteConfig[\s\S]{0,220}showToast\(t\('rSaveConfig'\), 'success'\)/, 'Roulette config saves should show success only after the write resolves');
  assert.match(roulette, /finally \{[\s\S]{0,160}isSavingRouletteConfigRef\.current = false[\s\S]{0,120}setIsSavingRouletteConfig\(false\)/, 'Roulette config saves should clear pending state when they settle');
  assert.match(roulette, /showToast\(t\('rouletteConfigSaveFailed'\), 'error'\)/, 'Roulette config save failures should use localized app feedback');
  assert.match(roulette, /disabled=\{isSavingRouletteConfig\}/, 'Roulette config controls should be disabled while saving');
  assert.match(roulette, /aria-busy=\{isSavingRouletteConfig\}/, 'Roulette config save button should expose busy state');
  assert.match(roulette, /isSavingRouletteConfig \? t\('processing'\) : t\('rSaveConfig'\)/, 'Roulette config save button should show localized progress copy');
  assert.match(roulette, /n\[idx\]\.count=e\.target\.value/, 'Roulette prize count input should keep a string-backed editable value');
  assert.doesNotMatch(roulette, /n\[idx\]\.count=parseInt\(e\.target\.value\)/, 'Roulette prize count input should not parse partial edits into NaN while typing');
});

test('roulette config writes are normalized before persistence', async () => {
  const app = await readFile(path.join(root, 'src/App.jsx'), 'utf8');
  const domain = await readFile(path.join(root, 'src/lib/projectDomain.js'), 'utf8');

  assert.match(domain, /export function normalizeRouletteConfigInput/, 'Project domain should expose a reusable roulette config normalizer');
  assert.match(app, /normalizeRouletteConfigInput/, 'App roulette writes should use the shared config normalizer');
  assert.match(app, /rouletteConfig: normalizeRouletteConfigInput\(config\)/, 'Roulette config updates should persist normalized config');
  assert.match(app, /createRouletteResultData\(parts, normalizeRouletteConfigInput\(config\), nowMs\(\)\)/, 'Roulette result generation should use normalized config');
});

test('queue and roulette result actions prevent duplicate submits and expose pending state', async () => {
  const files = {
    queue: await readFile(path.join(root, 'src/components/QueueView.jsx'), 'utf8'),
    roulette: await readFile(path.join(root, 'src/components/RouletteView.jsx'), 'utf8'),
  };

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.resultGenerationFailed, 'missing English result failure translation');
  assert.ok(TRANSLATIONS.zh.resultGenerationFailed, 'missing Chinese result failure translation');

  assert.match(files.queue, /isGeneratingQueueRef\s*=\s*useRef\(false\)/, 'Queue generation should use a synchronous action lock');
  assert.match(files.queue, /if \(isGeneratingQueueRef\.current\) return;/, 'Queue generation should ignore duplicate confirms before state rerenders');
  assert.match(files.queue, /setIsGeneratingQueue\(true\)[\s\S]{0,700}finally[\s\S]{0,220}setIsGeneratingQueue\(false\)/, 'Queue generation should expose pending state for the whole write');
  assert.match(files.queue, /showToast\(t\('resultGenerationFailed'\), 'error'\)/, 'Queue generation failures should use localized app feedback');
  assert.match(files.queue, /onConfirm:\s*generateQueue/, 'Queue confirm dialog should call the guarded generation action');
  assert.match(files.queue, /aria-busy=\{isGeneratingQueue\}/, 'Queue generation button should expose pending state to assistive technology');
  assert.match(files.queue, /disabled=\{isGeneratingQueue\}/, 'Queue generation button should be disabled while pending');
  assert.match(files.queue, /isGeneratingQueue \? t\('processing'\) : t\('startQueue'\)/, 'Queue generation button should show localized progress copy');

  assert.match(files.roulette, /isDrawingRouletteRef\s*=\s*useRef\(false\)/, 'Roulette drawing should use a synchronous action lock');
  assert.match(files.roulette, /if \(isDrawingRouletteRef\.current\) return;/, 'Roulette drawing should ignore duplicate clicks before state rerenders');
  assert.match(files.roulette, /setIsDrawingRoulette\(true\)[\s\S]{0,700}finally[\s\S]{0,220}setIsDrawingRoulette\(false\)/, 'Roulette drawing should expose pending state for the whole write');
  assert.match(files.roulette, /const normalizedConfig = normalizeRouletteConfigInput\(\{ \.\.\.config, mode: activeTab \}\)/, 'Roulette drawing should normalize editable config before generating results');
  assert.match(files.roulette, /await actions\.handleSaveRouletteResult\(project\.id, normalizedConfig\)/, 'Roulette drawing should pass normalized config to result generation');
  assert.match(files.roulette, /showToast\(t\('resultGenerationFailed'\), 'error'\)/, 'Roulette drawing failures should use localized app feedback');
  assert.match(files.roulette, /aria-busy=\{isDrawingRoulette\}/, 'Roulette draw buttons should expose pending state to assistive technology');
  assert.match(files.roulette, /disabled=\{isDrawingRoulette \|\| participants\.length < 1\}/, 'Roulette draw button should be disabled while pending or empty');
  assert.match(files.roulette, /isDrawingRoulette \? t\('processing'\) : t\('rStartDraw'\)/, 'Roulette draw buttons should show localized progress copy');
});

test('queue and roulette join actions prevent duplicate submits and expose pending state', async () => {
  const files = {
    queue: await readFile(path.join(root, 'src/components/QueueView.jsx'), 'utf8'),
    roulette: await readFile(path.join(root, 'src/components/RouletteView.jsx'), 'utf8'),
  };

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.participantJoinFailed, 'missing English participant join failure translation');
  assert.ok(TRANSLATIONS.zh.participantJoinFailed, 'missing Chinese participant join failure translation');

  assert.match(files.queue, /isJoiningQueueRef\s*=\s*useRef\(false\)/, 'Queue joins should use a synchronous action lock');
  assert.match(files.queue, /if \(isJoiningQueueRef\.current\) return;/, 'Queue joins should ignore duplicate clicks before state rerenders');
  assert.match(files.queue, /setIsJoiningQueue\(true\)[\s\S]{0,700}finally[\s\S]{0,220}setIsJoiningQueue\(false\)/, 'Queue joins should expose pending state for the whole write');
  assert.match(files.queue, /await actions\.handleJoinQueue\(project\.id, joinName, joinValue\)/, 'Queue join should await the write while pending');
  assert.match(files.queue, /showToast\(t\('participantJoinFailed'\), 'error'\)/, 'Queue join failures should use localized app feedback');
  assert.match(files.queue, /disabled=\{isJoiningQueue\}/, 'Queue join controls should be disabled while joining');
  assert.match(files.queue, /aria-busy=\{isJoiningQueue\}/, 'Queue join button should expose pending state to assistive technology');
  assert.match(files.queue, /isJoiningQueue \? t\('processing'\) : t\('submitEntry'\)/, 'Queue join button should show localized progress copy');

  assert.match(files.roulette, /isJoiningRouletteRef\s*=\s*useRef\(false\)/, 'Roulette joins should use a synchronous action lock');
  assert.match(files.roulette, /if \(isJoiningRouletteRef\.current\) return;/, 'Roulette joins should ignore duplicate clicks before state rerenders');
  assert.match(files.roulette, /setIsJoiningRoulette\(true\)[\s\S]{0,700}finally[\s\S]{0,220}setIsJoiningRoulette\(false\)/, 'Roulette joins should expose pending state for the whole write');
  assert.match(files.roulette, /await actions\.handleJoinRoulette\(project\.id, joinName, joinValue\)/, 'Roulette join should await the write while pending');
  assert.match(files.roulette, /showToast\(t\('participantJoinFailed'\), 'error'\)/, 'Roulette join failures should use localized app feedback');
  assert.match(files.roulette, /disabled=\{isJoiningRoulette\}/, 'Roulette join controls should be disabled while joining');
  assert.match(files.roulette, /aria-busy=\{isJoiningRoulette\}/, 'Roulette join button should expose pending state to assistive technology');
  assert.match(files.roulette, /isJoiningRoulette \? t\('processing'\) : t\('submitEntry'\)/, 'Roulette join button should show localized progress copy');
});

test('booking workspace exposes localized waitlist states for full slots', async () => {
  const files = {
    app: await readFile(path.join(root, 'src/App.jsx'), 'utf8'),
    booking: await readFile(path.join(root, 'src/components/BookingView.jsx'), 'utf8'),
  };

  for (const key of [
    'joinWaitlist',
    'leaveWaitlist',
    'waitlistCount',
    'waitlisted',
    'waitlistPromoted',
    'waitlistJoined',
    'waitlistLeft',
  ]) {
    assert.match(files.booking + files.app, new RegExp(`t\\('${key}'(?:,|\\))`), `Booking waitlist should localize ${key}`);
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }

  assert.match(files.booking, /handleToggleBookingWaitlist/, 'Booking view should call the waitlist action for full slots');
  assert.match(files.booking, /waitlist\.some/, 'Booking view should derive whether the current user is already waitlisted');
  assert.match(files.booking, /waitlistCount/, 'Booking view should show the waitlist size');
  assert.match(files.booking, /bookModalMode/, 'Booking modal should distinguish direct booking from waitlist join');
  assert.match(files.booking, /const canInteract = !isStopped && !isFinished;/, 'Booking should derive a stopped/finished interaction guard');
  assert.match(files.booking, /isInteractive = canInteract &&/, 'Booking slot interactions should respect stopped and finished state');
  assert.match(files.app, /createBookingWaitlistPatch/, 'App waitlist action should use the domain helper');
  assert.match(files.app, /createBookingReleasePatch/, 'App release action should use the promotion helper');
  assert.doesNotMatch(files.booking, />Join waitlist<|>Leave waitlist<|>Waitlisted<|waitlist:/i, 'Booking waitlist visible copy should be localized');
});

test('booking config saves prevent duplicate submits and expose pending state', async () => {
  const booking = await readFile(path.join(root, 'src/components/BookingView.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.bookingConfigSaveFailed, 'missing English booking config failure translation');
  assert.ok(TRANSLATIONS.zh.bookingConfigSaveFailed, 'missing Chinese booking config failure translation');

  assert.match(booking, /isSavingBookingConfigRef\s*=\s*useRef\(false\)/, 'Booking config saves should use a synchronous action lock');
  assert.match(booking, /if \(isSavingBookingConfigRef\.current\) return;/, 'Booking config saves should ignore duplicate clicks before rerender');
  assert.match(booking, /isSavingBookingConfigRef\.current = true[\s\S]{0,160}setIsSavingBookingConfig\(true\)/, 'Booking config saves should expose pending state before writing');
  assert.match(booking, /await actions\.handleUpdateBookingConfig\(project\.id, bookingConfig\)/, 'Booking config saves should await the write while pending');
  assert.match(booking, /finally \{[\s\S]{0,160}isSavingBookingConfigRef\.current = false[\s\S]{0,120}setIsSavingBookingConfig\(false\)/, 'Booking config saves should clear pending state when they settle');
  assert.match(booking, /showToast\(t\('bookingConfigSaveFailed'\), 'error'\)/, 'Booking config save failures should use localized app feedback');
  assert.match(booking, /disabled=\{isSavingBookingConfig\}/, 'Booking config form controls should be disabled while saving');
  assert.match(booking, /aria-busy=\{isSavingBookingConfig\}/, 'Booking config save button should expose busy state');
  assert.match(booking, /isSavingBookingConfig \? t\('processing'\) : t\('saveConfig'\)/, 'Booking config save button should show localized progress copy');
});

test('booking waitlist toggles prevent duplicate submits and expose pending state', async () => {
  const booking = await readFile(path.join(root, 'src/components/BookingView.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.bookingFailed, 'missing English booking failure translation');
  assert.ok(TRANSLATIONS.zh.bookingFailed, 'missing Chinese booking failure translation');

  assert.match(booking, /\[pendingWaitlistSlotIds,\s*setPendingWaitlistSlotIds\]\s*=\s*useState\(\[\]\)/, 'Booking waitlist toggles should track pending slot ids');
  assert.match(booking, /pendingWaitlistSlotIdsRef\s*=\s*useRef\(new Set\(\)\)/, 'Booking waitlist toggles should use a synchronous slot lock');
  assert.match(booking, /if \(pendingWaitlistSlotIdsRef\.current\.has\(slot\.id\)\) return;/, 'Booking waitlist toggles should ignore duplicate clicks for the same slot');
  assert.match(booking, /pendingWaitlistSlotIdsRef\.current\.add\(slot\.id\)[\s\S]{0,220}setPendingWaitlistSlotIds\(\[\.\.\.pendingWaitlistSlotIdsRef\.current\]\)/, 'Booking waitlist toggles should expose pending ids immediately');
  assert.match(booking, /await actions\.handleToggleBookingWaitlist\(slot\.id\)/, 'Booking waitlist toggles should await the write while pending');
  assert.match(booking, /finally[\s\S]{0,260}pendingWaitlistSlotIdsRef\.current\.delete\(slot\.id\)[\s\S]{0,160}setPendingWaitlistSlotIds\(\[\.\.\.pendingWaitlistSlotIdsRef\.current\]\)/, 'Booking waitlist toggles should clear pending state after the write settles');
  assert.match(booking, /showToast\(t\('bookingFailed'\), 'error'\)/, 'Booking waitlist failures should use localized app feedback');
  assert.match(booking, /pendingWaitlistSlotIds\.includes\(existing\.id\)/, 'Booking slot cells should derive waitlist pending state from the slot id');
  assert.match(booking, /isWaitlistTogglePending/, 'Booking slot cells should expose a waitlist pending flag');
  assert.match(booking, /disabled: isSlotTogglePending \|\| isWaitlistTogglePending/, 'Pending waitlist controls should be disabled');
  assert.match(booking, /'aria-busy': isSlotTogglePending \|\| isWaitlistTogglePending/, 'Pending waitlist controls should expose busy state');
  assert.match(booking, /isWaitlistTogglePending[\s\S]{0,220}t\('processing'\)/, 'Pending waitlist controls should show localized progress copy');
});

test('booking modal submissions prevent duplicate submits and expose pending state', async () => {
  const booking = await readFile(path.join(root, 'src/components/BookingView.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.bookingFailed, 'missing English booking failure translation');
  assert.ok(TRANSLATIONS.zh.bookingFailed, 'missing Chinese booking failure translation');

  assert.match(booking, /isSubmittingBookingRef\s*=\s*useRef\(false\)/, 'Booking modal submit should use a synchronous action lock');
  assert.match(booking, /if \(isSubmittingBookingRef\.current\) return;/, 'Booking modal submit should ignore duplicate clicks before state rerenders');
  assert.match(booking, /setIsSubmittingBooking\(true\)[\s\S]{0,1100}finally[\s\S]{0,240}setIsSubmittingBooking\(false\)/, 'Booking modal submit should expose pending state for the whole write');
  assert.match(booking, /aria-busy=\{isSubmittingBooking\}/, 'Booking modal should expose pending state to assistive technology');
  assert.match(booking, /disabled=\{isSubmittingBooking\}/, 'Booking modal controls should be disabled while submitting');
  assert.match(booking, /isSubmittingBooking \? t\('processing'\) : \(bookModalMode === 'waitlist' \? t\('joinWaitlist'\) : t\('bookSlot'\)\)/, 'Booking modal submit button should show localized progress copy');
  assert.match(booking, /showToast\(t\('bookingFailed'\), 'error'\)/, 'Booking modal failures should use localized app feedback');
});

test('booking owner kick confirmations await writes and expose pending state', async () => {
  const booking = await readFile(path.join(root, 'src/components/BookingView.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.bookingCancelFailed, 'missing English booking cancellation failure translation');
  assert.ok(TRANSLATIONS.zh.bookingCancelFailed, 'missing Chinese booking cancellation failure translation');

  assert.match(booking, /isKickingBookingRef\s*=\s*useRef\(false\)/, 'Booking kick should use a synchronous action lock');
  assert.match(booking, /if \(isKickingBookingRef\.current\) return;/, 'Booking kick should ignore duplicate confirms before rerender');
  assert.match(booking, /isKickingBookingRef\.current = true[\s\S]{0,160}setIsKickingBooking\(true\)/, 'Booking kick should expose pending state before writing');
  assert.match(booking, /await actions\.handleKickUser\(kickModal\.id, kickModal\.bookedBy, project\.id, kickReason\.trim\(\) \|\| t\('adminCancelled'\)\)/, 'Booking kick should await the write while pending');
  assert.match(booking, /await actions\.handleKickUser[\s\S]{0,220}setKickModal\(null\)/, 'Booking kick should close only after the write resolves');
  assert.match(booking, /finally \{[\s\S]{0,160}isKickingBookingRef\.current = false[\s\S]{0,120}setIsKickingBooking\(false\)/, 'Booking kick should clear pending state when it settles');
  assert.match(booking, /showToast\(t\('bookingCancelFailed'\), 'error'\)/, 'Booking kick failures should use localized app feedback');
  assert.match(booking, /app-dialog animate-scale-in" aria-busy=\{isKickingBooking\}/, 'Booking kick modal should expose busy state');
  assert.match(booking, /disabled=\{isKickingBooking\}/, 'Booking kick controls should be disabled while submitting');
  assert.match(booking, /aria-busy=\{isKickingBooking\}/, 'Booking kick submit should expose busy state');
  assert.match(booking, /isKickingBooking \? t\('processing'\) : t\('bookingCancelled'\)/, 'Booking kick submit should show localized progress copy');
});

test('booking owner slot toggles prevent duplicate writes without blocking batch toggles', async () => {
  const booking = await readFile(path.join(root, 'src/components/BookingView.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.bookingSlotActionFailed, 'missing English booking slot action failure translation');
  assert.ok(TRANSLATIONS.zh.bookingSlotActionFailed, 'missing Chinese booking slot action failure translation');

  assert.match(booking, /pendingSlotToggleKeysRef\s*=\s*useRef\(new Set\(\)\)/, 'Booking slot toggles should track pending keys in a ref');
  assert.match(booking, /const slotKey = getSlotToggleKey\(start, end\)/, 'Booking slot toggles should derive a stable key per start and end');
  assert.match(booking, /if \(pendingSlotToggleKeysRef\.current\.has\(slotKey\)\) return;/, 'Booking slot toggles should ignore duplicate clicks for the same slot');
  assert.match(booking, /pendingSlotToggleKeysRef\.current\.add\(slotKey\)[\s\S]{0,220}setPendingSlotToggleKeys\(\[\.\.\.pendingSlotToggleKeysRef\.current\]\)/, 'Booking slot toggles should expose pending keys immediately');
  assert.match(booking, /await actions\.handleCreateBookingSlot\(project\.id, start, end, label\)/, 'Booking slot creation should be awaited while pending');
  assert.match(booking, /await actions\.handleDeleteBookingSlot\(existing\.id\)/, 'Booking slot deletion should be awaited while pending');
  assert.match(booking, /finally[\s\S]{0,260}pendingSlotToggleKeysRef\.current\.delete\(slotKey\)[\s\S]{0,160}setPendingSlotToggleKeys\(\[\.\.\.pendingSlotToggleKeysRef\.current\]\)/, 'Booking slot toggles should clear pending state after the write settles');
  assert.match(booking, /showToast\(t\('bookingSlotActionFailed'\), 'error'\)/, 'Booking slot toggle failures should use localized app feedback');
  assert.match(booking, /pendingSlotToggleKeys\.includes\(slotKey\)/, 'Booking slot cells should derive pending state from the slot key');
  assert.match(booking, /disabled: isSlotTogglePending/, 'Pending slot controls should be disabled');
  assert.match(booking, /'aria-busy': isSlotTogglePending/, 'Pending slot controls should expose busy state');
  assert.match(booking, /isSlotTogglePending[\s\S]{0,180}t\('processing'\)/, 'Pending slot controls should show localized progress copy');
});

test('schedule availability submissions prevent duplicate submits and expose pending state', async () => {
  const schedule = await readFile(path.join(root, 'src/components/ScheduleView.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.scheduleSubmitFailed, 'missing English schedule submit failure translation');
  assert.ok(TRANSLATIONS.zh.scheduleSubmitFailed, 'missing Chinese schedule submit failure translation');

  assert.match(schedule, /isSubmittingScheduleRef\s*=\s*useRef\(false\)/, 'Schedule submit should use a synchronous action lock');
  assert.match(schedule, /if \(isSubmittingScheduleRef\.current\) return;/, 'Schedule submit should ignore duplicate clicks before state rerenders');
  assert.match(schedule, /setIsSubmittingSchedule\(true\)[\s\S]{0,760}finally[\s\S]{0,220}setIsSubmittingSchedule\(false\)/, 'Schedule submit should expose pending state for the whole write');
  assert.match(schedule, /await actions\.handleSubmitSchedule\(project\.id, myAvailability\)/, 'Schedule submit should await the write while pending');
  assert.match(schedule, /showToast\(t\('scheduleSubmitFailed'\), 'error'\)/, 'Schedule submit failures should use localized app feedback');
  assert.match(schedule, /disabled=\{viewHeatmap \|\| isSubmittingSchedule\}/, 'Schedule date controls should be disabled while submitting');
  assert.match(schedule, /disabled=\{isSubmittingSchedule\}/, 'Schedule time controls and submit button should be disabled while submitting');
  assert.match(schedule, /aria-busy=\{isSubmittingSchedule\}/, 'Schedule submit button should expose busy state to assistive technology');
  assert.match(schedule, /isSubmittingSchedule \? t\('processing'\) : \(mySubmission \? t\('update'\) : t\('submit'\)\)/, 'Schedule submit button should show localized progress copy');
});

test('schedule time heatmap uses normalized domain buckets', async () => {
  const schedule = await readFile(path.join(root, 'src/components/ScheduleView.jsx'), 'utf8');

  assert.match(schedule, /createScheduleHeatmapData/, 'Schedule heatmap should use the shared domain bucket helper');
  assert.match(schedule, /createScheduleHeatmapData\(submissions, config\)/, 'Schedule heatmap should derive buckets from submissions and the active config');
  assert.doesNotMatch(schedule, /range\.start\.replace/, 'Schedule heatmap should not assume legacy range.start is a string');
  assert.doesNotMatch(schedule, /parseInt\(range\.start/, 'Schedule heatmap should not parse time strings ad hoc in the component');
});

test('claim workspace actions prevent duplicate submits and expose pending state', async () => {
  const claim = await readFile(path.join(root, 'src/components/ClaimView.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.claimActionFailed, 'missing English claim action failure translation');
  assert.ok(TRANSLATIONS.zh.claimActionFailed, 'missing Chinese claim action failure translation');

  assert.match(claim, /isCreatingClaimItemRef\s*=\s*useRef\(false\)/, 'Claim item creation should use a synchronous submit lock');
  assert.match(claim, /normalizeClaimCapacityInput/, 'Claim item creation should use the shared capacity normalizer');
  assert.match(claim, /\[maxClaims,\s*setMaxClaims\]\s*=\s*useState\('1'\)/, 'Claim capacity input should stay string-backed so it can be cleared while editing');
  assert.match(claim, /const normalizedMaxClaims = normalizeClaimCapacityInput\(maxClaims\)/, 'Claim item creation should normalize capacity at submit time');
  assert.match(claim, /if \(isCreatingClaimItemRef\.current\) return;/, 'Claim item creation should ignore duplicate submits before state rerenders');
  assert.match(claim, /setIsCreatingClaimItem\(true\)[\s\S]{0,760}finally[\s\S]{0,220}setIsCreatingClaimItem\(false\)/, 'Claim item creation should expose pending state for the whole write');
  assert.match(claim, /await actions\.handleCreateClaimItem\(project\.id, newItem\.trim\(\), normalizedMaxClaims\)/, 'Claim item creation should await the write with normalized capacity while pending');
  assert.match(claim, /setMaxClaims\('1'\)/, 'Claim item creation should reset capacity input to the default editable string');
  assert.match(claim, /onChange=\{\(e\) => setMaxClaims\(e\.target\.value\)\}/, 'Claim capacity input should not parse partial edits into NaN while typing');
  assert.match(claim, /showToast\(t\('claimActionFailed'\), 'error'\)/, 'Claim item creation failures should use localized app feedback');
  assert.match(claim, /aria-busy=\{isCreatingClaimItem\}/, 'Claim creation form should expose pending state to assistive technology');
  assert.match(claim, /disabled=\{isCreatingClaimItem\}/, 'Claim creation controls should be disabled while creating');
  assert.match(claim, /isCreatingClaimItem \? t\('processing'\) : t\('create'\)/, 'Claim creation button should show localized progress copy');

  assert.match(claim, /pendingClaimItemIdsRef\s*=\s*useRef\(new Set\(\)\)/, 'Claim toggles should track pending item ids in a ref');
  assert.match(claim, /if \(pendingClaimItemIdsRef\.current\.has\(itemId\)\) return;/, 'Claim toggles should ignore duplicate clicks for the same item');
  assert.match(claim, /pendingClaimItemIdsRef\.current\.add\(itemId\)[\s\S]{0,220}setPendingClaimItemIds\(\[\.\.\.pendingClaimItemIdsRef\.current\]\)/, 'Claim toggles should expose pending ids immediately');
  assert.match(claim, /await actions\.handleToggleClaim\(item\)/, 'Claim toggles should await the write while pending');
  assert.match(claim, /finally[\s\S]{0,260}pendingClaimItemIdsRef\.current\.delete\(itemId\)[\s\S]{0,160}setPendingClaimItemIds\(\[\.\.\.pendingClaimItemIdsRef\.current\]\)/, 'Claim toggles should clear pending state after the write settles');
  assert.match(claim, /pendingClaimItemIds\.includes\(item\.id\)/, 'Claim rows should derive pending state from the item id');
  assert.match(claim, /disabled=\{isClaimTogglePending\}/, 'Claim toggle buttons should be disabled while pending');
  assert.match(claim, /aria-busy=\{isClaimTogglePending\}/, 'Claim toggle buttons should expose busy state');
  assert.match(claim, /isClaimTogglePending \? t\('processing'\) : t\('unclaim'\)/, 'Unclaim button should show localized progress copy');
  assert.match(claim, /isClaimTogglePending \? t\('processing'\) : t\('claim'\)/, 'Claim button should show localized progress copy');
});

test('claim item deletion prevents duplicate submits and exposes pending state', async () => {
  const claim = await readFile(path.join(root, 'src/components/ClaimView.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.claimActionFailed, 'missing English claim action failure translation');
  assert.ok(TRANSLATIONS.zh.claimActionFailed, 'missing Chinese claim action failure translation');

  assert.match(claim, /pendingDeleteClaimItemIdsRef\s*=\s*useRef\(new Set\(\)\)/, 'Claim deletes should track pending item ids in a ref');
  assert.match(claim, /if \(pendingDeleteClaimItemIdsRef\.current\.has\(itemId\)\) return;/, 'Claim deletes should ignore duplicate confirmations for the same item');
  assert.match(claim, /pendingDeleteClaimItemIdsRef\.current\.add\(itemId\)[\s\S]{0,220}setPendingDeleteClaimItemIds\(\[\.\.\.pendingDeleteClaimItemIdsRef\.current\]\)/, 'Claim deletes should expose pending ids immediately');
  assert.match(claim, /await actions\.handleDeleteClaimItem\(itemId\)/, 'Claim deletes should await the write while pending');
  assert.match(claim, /showToast\(t\('claimActionFailed'\), 'error'\)/, 'Claim delete failures should use localized app feedback');
  assert.match(claim, /finally[\s\S]{0,260}pendingDeleteClaimItemIdsRef\.current\.delete\(itemId\)[\s\S]{0,160}setPendingDeleteClaimItemIds\(\[\.\.\.pendingDeleteClaimItemIdsRef\.current\]\)/, 'Claim deletes should clear pending state after writes settle');
  assert.match(claim, /pendingDeleteClaimItemIds\.includes\(item\.id\)/, 'Claim rows should derive delete pending state from the item id');
  assert.match(claim, /onConfirm:\s*\(\) => handleDeleteClaimItem\(item\.id\)/, 'Claim delete confirmations should route through the pending delete handler');
  assert.match(claim, /disabled=\{isDeletePending\}/, 'Claim delete buttons should be disabled while deleting');
  assert.match(claim, /aria-busy=\{isDeletePending\}/, 'Claim delete buttons should expose busy state');
  assert.match(claim, /title=\{isDeletePending \? t\('processing'\) : t\('delete'\)\}/, 'Claim delete buttons should expose localized pending copy');
});

test('claim capacity writes are normalized before persistence', async () => {
  const app = await readFile(path.join(root, 'src/App.jsx'), 'utf8');
  const domain = await readFile(path.join(root, 'src/lib/projectDomain.js'), 'utf8');

  assert.match(domain, /export function normalizeClaimCapacityInput/, 'Project domain should expose a reusable claim capacity normalizer');
  assert.match(app, /normalizeClaimCapacityInput/, 'App claim writes should use the shared capacity normalizer');
  assert.match(app, /maxClaims: normalizeClaimCapacityInput\(maxClaims\)/, 'Claim item creation should persist normalized capacity');
  assert.doesNotMatch(app, /maxClaims:\s*parseInt\(maxClaims\)\|\|1/, 'Claim item creation should not persist ad hoc parsed capacity');
});

test('paused and finished collaboration workspaces hide item deletion controls', async () => {
  const files = {
    voting: await readFile(path.join(root, 'src/components/VotingView.jsx'), 'utf8'),
    claim: await readFile(path.join(root, 'src/components/ClaimView.jsx'), 'utf8'),
  };

  assert.match(
    files.voting,
    /const canDelete = !isStopped && \([^;\n]*isAdmin[^;\n]*item\.creatorId === user\.uid[^;\n]*isProjectOwner[^;\n]*\);/,
    'Voting item deletion should be gated by stopped/finished state before role checks',
  );
  assert.doesNotMatch(
    files.voting,
    /const canDelete = isAdmin \|\|/,
    'Voting admins should not bypass the stopped/finished deletion guard',
  );
  assert.match(
    files.claim,
    /\(isOwner \|\| isAdmin\) && !isStopped && \([\s\S]{0,320}handleDeleteClaimItem/,
    'Claim item deletion should be hidden when the project is stopped or finished',
  );
});

test('paused and finished team workspaces hide membership mutation controls', async () => {
  const team = await readFile(path.join(root, 'src/components/TeamView.jsx'), 'utf8');

  assert.match(
    team,
    /canManage && !isStopped \? <button[\s\S]{0,220}onDelete\(currentRoom\.id\)/,
    'Team disband should be hidden when the project is stopped or finished',
  );
  assert.doesNotMatch(
    team,
    /\(canManage && !isStopped\) \|\| isAdmin/,
    'Team admins should not bypass the stopped/finished disband guard',
  );
  assert.match(
    team,
    /canManage && m\.uid !== user\.uid && !isStopped && <button[\s\S]{0,220}onKick\(currentRoom\.id, m\)/,
    'Team member kick controls should be hidden when the project is stopped or finished',
  );
  assert.doesNotMatch(
    team,
    /\(!isStopped \|\| isAdmin\)/,
    'Team admins should not bypass the stopped/finished member kick guard',
  );
  assert.match(
    team,
    /!isStopped && <button[\s\S]{0,220}onKick\(currentRoom\.id, currentRoom\.members\.find/,
    'Team leave control should be hidden when the project is stopped or finished',
  );
});

test('team workspace actions prevent duplicate submits and expose pending state', async () => {
  const team = await readFile(path.join(root, 'src/components/TeamView.jsx'), 'utf8');
  const app = await readFile(path.join(root, 'src/App.jsx'), 'utf8');
  const domain = await readFile(path.join(root, 'src/lib/projectDomain.js'), 'utf8');

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.teamActionFailed, 'missing English team action failure translation');
  assert.ok(TRANSLATIONS.zh.teamActionFailed, 'missing Chinese team action failure translation');

  assert.match(team, /isCreatingTeamRef\s*=\s*useRef\(false\)/, 'Team creation should use a synchronous submit lock');
  assert.match(team, /if \(isCreatingTeamRef\.current\) return;/, 'Team creation should ignore duplicate submits before state rerenders');
  assert.match(team, /setIsCreatingTeam\(true\)[\s\S]{0,760}finally[\s\S]{0,220}setIsCreatingTeam\(false\)/, 'Team creation should expose pending state for the whole write');
  assert.match(team, /await onCreate\(newRoomName, 4, myName\)/, 'Team creation should await the write while pending');
  assert.match(team, /<form onSubmit=\{handleCreateTeam\} aria-busy=\{isCreatingTeam\}/, 'Team creation should use an accessible pending form');
  assert.match(team, /disabled=\{isCreatingTeam\}/, 'Team creation inputs should be disabled while creating');
  assert.match(team, /disabled=\{isCreatingTeam \|\| !newRoomName\.trim\(\)\}/, 'Team creation button should be disabled while pending or blank');
  assert.match(team, /isCreatingTeam \? t\('processing'\) : t\('createTeam'\)/, 'Team creation button should show localized progress copy');

  assert.match(team, /pendingTeamActionKeysRef\s*=\s*useRef\(new Set\(\)\)/, 'Team membership actions should track pending action keys in a ref');
  assert.match(team, /if \(pendingTeamActionKeysRef\.current\.has\(actionKey\)\) return;/, 'Team membership actions should ignore duplicate clicks for the same action');
  assert.match(team, /pendingTeamActionKeysRef\.current\.add\(actionKey\)[\s\S]{0,220}setPendingTeamActionKeys\(\[\.\.\.pendingTeamActionKeysRef\.current\]\)/, 'Team membership actions should expose pending keys immediately');
  assert.match(team, /await action\(\)/, 'Team membership actions should await writes while pending');
  assert.match(team, /showToast\(t\('teamActionFailed'\), 'error'\)/, 'Team failures should use localized app feedback');
  assert.match(team, /finally[\s\S]{0,260}pendingTeamActionKeysRef\.current\.delete\(actionKey\)[\s\S]{0,160}setPendingTeamActionKeys\(\[\.\.\.pendingTeamActionKeysRef\.current\]\)/, 'Team actions should clear pending state after writes settle');
  assert.match(team, /pendingTeamActionKeys\.includes\(`join:\$\{room\.id\}`\)/, 'Team join buttons should derive pending state from the room id');
  assert.match(team, /disabled=\{isJoinPending\}/, 'Team join buttons should be disabled while joining');
  assert.match(team, /aria-busy=\{isJoinPending\}/, 'Team join buttons should expose pending state');
  assert.match(team, /isJoinPending \? t\('processing'\) : t\('joinTeam'\)/, 'Team join buttons should show localized progress copy');
  assert.match(team, /disabled=\{isDisbandPending\}/, 'Team disband button should be disabled while deleting');
  assert.match(team, /disabled=\{isLeavePending\}/, 'Team leave button should be disabled while leaving');
  assert.match(team, /disabled=\{isKickPending\}/, 'Team kick button should be disabled while removing a member');

  assert.match(domain, /export function normalizeTeamRoomCapacityInput/, 'Project domain should expose a reusable team room capacity normalizer');
  assert.match(app, /normalizeTeamRoomCapacityInput/, 'App room creation should use the shared team capacity normalizer');
  assert.match(app, /maxMembers: normalizeTeamRoomCapacityInput\(maxMembers\)/, 'Room creation should persist normalized team capacity');
  assert.doesNotMatch(app, /maxMembers:\s*parseInt\(maxMembers\)\|\|4/, 'Room creation should not persist ad hoc parsed team capacity');
  assert.match(team, /normalizeTeamRoomCapacityInput/, 'Team view should normalize legacy room capacity before display and join checks');
});

test('paused and finished gather workspaces keep submissions read-only', async () => {
  const gather = await readFile(path.join(root, 'src/components/GatherView.jsx'), 'utf8');

  assert.match(
    gather,
    /const canShowSubmissionCard = !isStopped \|\| hasSubmitted;/,
    'Gather should only show the submission card while active or for an existing read-only submission',
  );
  assert.match(
    gather,
    /\{canShowSubmissionCard && \(/,
    'Gather should render the submission card through the stopped-state guard',
  );
  assert.doesNotMatch(
    gather,
    /\(!isStopped \|\| isOwner \|\| isAdmin\)/,
    'Gather owners and admins should not bypass stopped/finished submission locking',
  );
  assert.match(
    gather,
    /\(isOwner \|\| isAdmin\) && \(/,
    'Gather owners and admins should retain the read-only response table',
  );
});

test('paused and finished game and chat workspaces keep direct writes read-only', async () => {
  const files = {
    detail: await readFile(path.join(root, 'src/pages/ProjectDetail.jsx'), 'utf8'),
    gameHub: await readFile(path.join(root, 'src/components/GameHubView.jsx'), 'utf8'),
    chat: await readFile(path.join(root, 'src/components/ChatRoom.jsx'), 'utf8'),
  };

  assert.match(
    files.detail,
    /<GameHubView project=\{project\} user=\{user\} isStopped=\{isStopped \|\| isFinished\} t=\{t\} \/>/,
    'Project detail should pass stopped/finished state into the game hub',
  );
  assert.match(
    files.detail,
    /<ChatRoom projectId=\{project\.id\} currentUser=\{user\} isStopped=\{isStopped \|\| isFinished\} t=\{t\} \/>/,
    'Project detail should pass stopped/finished state into project chat',
  );
  assert.match(files.gameHub, /export default function GameHubView\(\{ project, user, isStopped = false, t \}\)/, 'Game hub should accept a read-only state');
  assert.match(files.gameHub, /const canInteract = !isStopped;/, 'Game hub should derive a single read-only interaction guard');
  assert.match(files.gameHub, /createGameRoomJoinPatch/, 'Game hub joins should use the domain join guard');
  assert.match(files.gameHub, /handleCreateRoom[\s\S]{0,160}if \(!canInteract/, 'Game room creation should reject stopped or finished projects before writing');
  assert.match(files.gameHub, /joinGame[\s\S]{0,180}if \(!canInteract/, 'Game room joins should reject stopped or finished projects before writing');
  assert.match(files.gameHub, /handleMove[\s\S]{0,180}if \(!canInteract/, 'RPS moves should reject stopped or finished projects before writing');
  assert.match(files.chat, /export default function ChatRoom\(\{ projectId, user, currentUser, isStopped = false, t \}\)/, 'Project chat should accept a read-only state');
  assert.match(files.chat, /if \(isStopped \|\| !inputText\.trim\(\)\) return;/, 'Chat send should reject stopped or finished projects before writing');
  assert.match(files.chat, /disabled=\{isStopped \|\| isSendingMessage \|\| !inputText\.trim\(\)\}/, 'Chat send control should be disabled for stopped, finished, or pending projects');
});

test('chat inputs expose a shared message length limit', async () => {
  const files = {
    chat: await readFile(path.join(root, 'src/components/ChatRoom.jsx'), 'utf8'),
    friends: await readFile(path.join(root, 'src/components/FriendSystem.jsx'), 'utf8'),
    backend: await readFile(path.join(root, 'server/local-backend.mjs'), 'utf8'),
  };

  assert.match(files.chat, /MESSAGE_TEXT_MAX_LENGTH/, 'Project chat should import the shared message length limit');
  assert.match(files.chat, /maxLength=\{MESSAGE_TEXT_MAX_LENGTH\}/, 'Project chat input should cap message length before submit');
  assert.match(files.friends, /MESSAGE_TEXT_MAX_LENGTH/, 'Friend chat should import the shared message length limit');
  assert.match(files.friends, /maxLength=\{MESSAGE_TEXT_MAX_LENGTH\}/, 'Friend chat input should cap message length before submit');
  assert.match(files.backend, /MESSAGE_TEXT_MAX_LENGTH/, 'Backend message guards should enforce the same shared limit');
});

test('chat send forms prevent duplicate submits and expose pending state', async () => {
  const files = {
    chat: await readFile(path.join(root, 'src/components/ChatRoom.jsx'), 'utf8'),
    friends: await readFile(path.join(root, 'src/components/FriendSystem.jsx'), 'utf8'),
  };

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.messageSendFailed, 'missing English message failure translation');
  assert.ok(TRANSLATIONS.zh.messageSendFailed, 'missing Chinese message failure translation');

  assert.match(files.chat, /isSendingMessageRef\s*=\s*useRef\(false\)/, 'Project chat should use a synchronous send lock');
  assert.match(files.chat, /isSendingMessageRef\.current/, 'Project chat should check the synchronous send lock before writing');
  assert.match(files.chat, /setIsSendingMessage\(true\)[\s\S]{0,900}finally[\s\S]{0,240}setIsSendingMessage\(false\)/, 'Project chat should expose pending state for the whole send');
  assert.match(files.chat, /aria-busy=\{isSendingMessage\}/, 'Project chat form should expose pending state to assistive technology');
  assert.match(files.chat, /disabled=\{isStopped \|\| isSendingMessage\}/, 'Project chat input should be disabled while sending');
  assert.match(files.chat, /disabled=\{isStopped \|\| isSendingMessage \|\| !inputText\.trim\(\)\}/, 'Project chat send button should be disabled while sending');
  assert.match(files.chat, /isSendingMessage \? t\('processing'\) :/, 'Project chat send button should expose localized progress copy');

  assert.match(files.friends, /isSendingFriendMessageRef\s*=\s*useRef\(false\)/, 'Friend chat should use a synchronous send lock');
  assert.match(files.friends, /isSendingFriendMessageRef\.current/, 'Friend chat should check the synchronous send lock before writing');
  assert.match(files.friends, /setIsSendingFriendMessage\(true\)[\s\S]{0,1100}finally[\s\S]{0,260}setIsSendingFriendMessage\(false\)/, 'Friend chat should expose pending state for the whole send');
  assert.match(files.friends, /aria-busy=\{isSendingFriendMessage\}/, 'Friend chat form should expose pending state to assistive technology');
  assert.match(files.friends, /disabled=\{isSendingFriendMessage\}/, 'Friend chat input should be disabled while sending');
  assert.match(files.friends, /disabled=\{isSendingFriendMessage \|\| !chatInput\.trim\(\)\}/, 'Friend chat send button should be disabled while sending');
  assert.match(files.friends, /isSendingFriendMessage \? t\('processing'\) :/, 'Friend chat send button should expose localized progress copy');
  assert.match(files.friends, /showToast\(t\('messageSendFailed'\), 'error'\)/, 'Friend chat send failures should use localized app feedback');
});

test('project chat exposes a recoverable load error state', async () => {
  const chat = await readFile(path.join(root, 'src/components/ChatRoom.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.chatLoadFailed, 'missing English chat load failure translation');
  assert.ok(TRANSLATIONS.zh.chatLoadFailed, 'missing Chinese chat load failure translation');
  assert.ok(TRANSLATIONS.en.chatRetry, 'missing English chat retry translation');
  assert.ok(TRANSLATIONS.zh.chatRetry, 'missing Chinese chat retry translation');

  assert.match(chat, /const \[chatLoadError, setChatLoadError\] = useState\(false\)/, 'Project chat should track load errors separately from an empty thread');
  assert.match(chat, /const \[chatReloadKey, setChatReloadKey\] = useState\(0\)/, 'Project chat should expose a retry trigger for failed subscriptions');
  assert.match(chat, /setChatLoadError\(false\)[\s\S]{0,360}setMessages\(msgs\)/, 'Successful chat reads should clear the load error before rendering messages');
  assert.match(chat, /onSnapshot\(q,[\s\S]{0,520}\(error\) => \{[\s\S]{0,260}setChatLoadError\(true\)/, 'Project chat should handle subscription errors');
  assert.match(chat, /\}, \[projectId, chatReloadKey\]\)/, 'Project chat retry should recreate the subscription');
  assert.match(chat, /chatLoadError[\s\S]{0,220}role="alert"[\s\S]{0,360}t\('chatLoadFailed'\)/, 'Project chat should render announced localized load failure copy');
  assert.match(chat, /onClick=\{\(\) => setChatReloadKey\(\(current\) => current \+ 1\)\}/, 'Project chat retry should refresh the subscription');
  assert.match(chat, /t\('chatRetry'\)/, 'Project chat retry button should use localized copy');
});

test('friend chat exposes a recoverable load error state', async () => {
  const friends = await readFile(path.join(root, 'src/components/FriendSystem.jsx'), 'utf8');

  assert.match(friends, /RotateCcw/, 'Friend chat retry should use the shared retry icon');
  assert.match(friends, /const \[friendChatLoadError, setFriendChatLoadError\] = useState\(false\)/, 'Friend chat should track load errors separately from an empty thread');
  assert.match(friends, /const \[friendChatReloadKey, setFriendChatReloadKey\] = useState\(0\)/, 'Friend chat should expose a retry trigger for failed subscriptions');
  assert.match(friends, /setFriendChatLoadError\(false\)[\s\S]{0,360}setChatMessages\(msgs\)/, 'Successful friend chat reads should clear the load error');
  assert.match(friends, /onSnapshot\(q,[\s\S]{0,520}\(error\) => \{[\s\S]{0,260}setFriendChatLoadError\(true\)/, 'Friend chat should handle subscription errors');
  assert.match(friends, /\}, \[activeChatFriend, friendChatReloadKey\]\)/, 'Friend chat retry should recreate the subscription');
  assert.match(friends, /friendChatLoadError[\s\S]{0,220}role="alert"[\s\S]{0,360}t\('chatLoadFailed'\)/, 'Friend chat should render announced localized load failure copy');
  assert.match(friends, /onClick=\{\(\) => setFriendChatReloadKey\(\(current\) => current \+ 1\)\}/, 'Friend chat retry should refresh the subscription');
  assert.match(friends, /t\('chatRetry'\)/, 'Friend chat retry button should use localized copy');
});

test('friend list exposes a recoverable load error state', async () => {
  const friends = await readFile(path.join(root, 'src/components/FriendSystem.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.friendsLoadFailed, 'missing English friend list load failure translation');
  assert.ok(TRANSLATIONS.zh.friendsLoadFailed, 'missing Chinese friend list load failure translation');
  assert.ok(TRANSLATIONS.en.chatRetry, 'missing English retry translation');
  assert.ok(TRANSLATIONS.zh.chatRetry, 'missing Chinese retry translation');

  assert.match(friends, /const \[friendsLoadError, setFriendsLoadError\] = useState\(false\)/, 'Friend list should track load errors separately from an empty list');
  assert.match(friends, /const \[friendsReloadKey, setFriendsReloadKey\] = useState\(0\)/, 'Friend list should expose a retry trigger for failed subscriptions');
  assert.match(friends, /setFriendsLoadError\(false\)[\s\S]{0,1200}setFriends\(confirmed\)/, 'Successful friend list reads should clear the load error');
  assert.match(friends, /onSnapshot\(q,[\s\S]{0,1600}\(error\) => \{[\s\S]{0,260}setFriendsLoadError\(true\)/, 'Friend list should handle subscription errors');
  assert.match(friends, /\}, \[friendsReloadKey, t, user\]\)/, 'Friend list retry should recreate the subscription');
  assert.match(friends, /friendsLoadError[\s\S]{0,240}role="alert"[\s\S]{0,360}t\('friendsLoadFailed'\)/, 'Friend list should render announced localized load failure copy');
  assert.match(friends, /onClick=\{\(\) => setFriendsReloadKey\(\(current\) => current \+ 1\)\}/, 'Friend list retry should refresh the subscription');
  assert.match(friends, /t\('chatRetry'\)/, 'Friend list retry button should use localized copy');
  assert.match(friends, /!friendsLoadError && friends\.length === 0 && requests\.length === 0/, 'Friend list should not show the empty state when loading failed');
});

test('project child text inputs expose a shared display length limit', async () => {
  const files = {
    voting: await readFile(path.join(root, 'src/components/VotingView.jsx'), 'utf8'),
    team: await readFile(path.join(root, 'src/components/TeamView.jsx'), 'utf8'),
    gather: await readFile(path.join(root, 'src/components/GatherView.jsx'), 'utf8'),
    claim: await readFile(path.join(root, 'src/components/ClaimView.jsx'), 'utf8'),
    gameHub: await readFile(path.join(root, 'src/components/GameHubView.jsx'), 'utf8'),
    app: await readFile(path.join(root, 'src/App.jsx'), 'utf8'),
    backend: await readFile(path.join(root, 'server/local-backend.mjs'), 'utf8'),
  };

  for (const [name, source] of Object.entries(files)) {
    if (name === 'app') continue;
    assert.match(source, /PROJECT_CHILD_TEXT_MAX_LENGTH/, `${name} should use the shared project-child display text limit`);
  }

  assert.match(files.app, /normalizeProjectChildText/, 'App write handlers should use the shared project-child display text guard');
  assert.match(files.voting, /maxLength=\{PROJECT_CHILD_TEXT_MAX_LENGTH\}/, 'Voting item input should cap text before submit');
  assert.match(files.team, /maxLength=\{PROJECT_CHILD_TEXT_MAX_LENGTH\}/, 'Team room input should cap text before submit');
  assert.match(files.gather, /maxLength=\{PROJECT_CHILD_TEXT_MAX_LENGTH\}/, 'Gather field input should cap text before submit');
  assert.match(files.claim, /maxLength=\{PROJECT_CHILD_TEXT_MAX_LENGTH\}/, 'Claim item input should cap text before submit');
  assert.match(files.gameHub, /maxLength=\{PROJECT_CHILD_TEXT_MAX_LENGTH\}/, 'Game room input should cap text before submit');
  assert.match(files.gameHub, /createGameRoomCreateData/, 'Game hub should route room creation through the shared domain guard');
});

test('read-only project write attempts show localized app feedback', async () => {
  const files = {
    app: await readFile(path.join(root, 'src/App.jsx'), 'utf8'),
    ui: await readFile(path.join(root, 'src/components/UIComponents.jsx'), 'utf8'),
  };

  assert.ok(TRANSLATIONS.en.projectReadOnly, 'missing English project read-only feedback');
  assert.ok(TRANSLATIONS.zh.projectReadOnly, 'missing Chinese project read-only feedback');
  assert.match(
    files.ui,
    /typeof children === ['"]function['"][\s\S]{0,160}children\(contextValue\)/,
    'UIProvider should support render-prop children so app-level actions can use toast feedback',
  );
  assert.match(
    files.app,
    /const requireProjectWritable = \(projectId, showToast\) => \{[\s\S]{0,360}isProjectWritable\(projectId\)[\s\S]{0,360}showToast\(t\('projectReadOnly'\), 'info'\)[\s\S]{0,120}return false;/,
    'App should centralize project read-only feedback instead of silently returning',
  );
  assert.match(
    files.app,
    /<UIProvider t=\{t\}>\s*\{\(\{ showToast \}\) =>/,
    'App should receive toast feedback from UIProvider where actions are assembled',
  );

  for (const action of [
    'handleAddItem',
    'handleUpdateVotingConfig',
    'handleCreateRoom',
    'handleJoinQueue',
    'handleGenerateQueue',
    'handleJoinRoulette',
    'handleUpdateRouletteConfig',
    'handleSaveRouletteResult',
    'handleRecordWinner',
    'handleCreateGatherField',
    'handleSubmitGather',
    'handleUpdateScheduleConfig',
    'handleSubmitSchedule',
    'handleUpdateBookingConfig',
    'handleCreateBookingSlot',
    'handleCreateClaimItem',
  ]) {
    assert.match(
      files.app,
      new RegExp(`${action}: async[\\s\\S]{0,280}requireProjectWritable\\(projectId, showToast\\)`),
      `${action} should show app feedback when a project is read-only`,
    );
  }
});

test('workspaces avoid native browser dialogs and user-name fallbacks', async () => {
  const files = {
    app: await readFile(path.join(root, 'src/App.jsx'), 'utf8'),
    dashboard: await readFile(path.join(root, 'src/pages/Dashboard.jsx'), 'utf8'),
    admin: await readFile(path.join(root, 'src/components/AdminDashboard.jsx'), 'utf8'),
    schedule: await readFile(path.join(root, 'src/components/ScheduleView.jsx'), 'utf8'),
    booking: await readFile(path.join(root, 'src/components/BookingView.jsx'), 'utf8'),
  };

  for (const [fileKey, keys] of Object.entries({
    app: ['anonymousUser'],
    dashboard: ['games'],
    admin: ['cleanOrphans', 'orphanExtraCounts'],
    schedule: ['rangeError'],
    booking: ['adminCancelled', 'kickConfirm', 'kickReason'],
  })) {
    for (const key of keys) {
      assert.match(files[fileKey], new RegExp(`t\\('${key}'(?:,|\\))`), `${fileKey} should localize ${key}`);
      assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
      assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
    }
  }

  assert.doesNotMatch(files.app, /\|\|\s*['"](?:User|Anonymous|Guest)['"]/, 'App data writes should not use visible English user-name fallbacks');
  assert.doesNotMatch(files.dashboard, /\|\|\s*["']Games["']/, 'Dashboard project tab should not rely on English fallback copy');
  assert.doesNotMatch(files.admin, /Clean Orphans|fields,|subs,|bookings,|tasks,|queue\)/, 'Admin cleanup copy should be localized as one message');
  assert.doesNotMatch(files.schedule, /\balert\(/, 'Schedule validation should use app feedback instead of native alert');
  assert.match(files.schedule, /app-card-quiet[\s\S]{0,400}configureFirst/, 'Schedule unconfigured state should use a designed empty-state surface');
  assert.doesNotMatch(files.booking, /\b(?:alert|prompt)\(/, 'Booking cancellation and errors should use app surfaces instead of native dialogs');
  assert.match(files.booking, /app-dialog[\s\S]{0,500}kickReason/, 'Booking cancellation should use a designed dialog with a reason field');
});

test('date-heavy workspaces format dates with the app locale', async () => {
  const files = {
    app: await readFile(path.join(root, 'src/App.jsx'), 'utf8'),
    admin: await readFile(path.join(root, 'src/components/AdminDashboard.jsx'), 'utf8'),
    announcements: await readFile(path.join(root, 'src/components/AnnouncementSystem.jsx'), 'utf8'),
    chat: await readFile(path.join(root, 'src/components/ChatRoom.jsx'), 'utf8'),
    gather: await readFile(path.join(root, 'src/components/GatherView.jsx'), 'utf8'),
    claim: await readFile(path.join(root, 'src/components/ClaimView.jsx'), 'utf8'),
    schedule: await readFile(path.join(root, 'src/components/ScheduleView.jsx'), 'utf8'),
    booking: await readFile(path.join(root, 'src/components/BookingView.jsx'), 'utf8'),
  };

  for (const [fileKey, source] of Object.entries(files)) {
    assert.match(source, /getAppLocale|formatDate/, `${fileKey} should derive visible dates from the app language`);
    assert.doesNotMatch(source, /toLocale(?:DateString|String|TimeString)\(\s*(?:undefined)?\s*(?:,|\))/, `${fileKey} should not let browser locale override app language`);
  }
});

test('announcement read tracking happens from explicit open actions instead of render', async () => {
  const announcements = await readFile(path.join(root, 'src/components/AnnouncementSystem.jsx'), 'utf8');

  assert.match(
    announcements,
    /const markVisibleAnnouncementsAsRead = \(\) => \{[\s\S]{0,700}setJsonBrowserStorageItem\('readAnnouncements', newReadIds\)/,
    'Announcements should batch read-state persistence in an explicit action helper',
  );
  assert.match(
    announcements,
    /const handleOpen = \(\) => \{[\s\S]{0,160}markVisibleAnnouncementsAsRead\(\)[\s\S]{0,160}setIsOpen\(true\)/,
    'Opening the announcement dialog should mark currently visible announcements as read',
  );
  assert.doesNotMatch(
    announcements,
    /announcements\.map\(\(item\) => \{[\s\S]{0,240}markAsRead\(item\.id\)/,
    'Announcement rendering should not update state or localStorage while mapping visible rows',
  );
});

test('announcement system exposes a recoverable load error state', async () => {
  const announcements = await readFile(path.join(root, 'src/components/AnnouncementSystem.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.announcementsLoadFailed, 'missing English announcement load failure translation');
  assert.ok(TRANSLATIONS.zh.announcementsLoadFailed, 'missing Chinese announcement load failure translation');
  assert.ok(TRANSLATIONS.en.chatRetry, 'missing English retry translation');
  assert.ok(TRANSLATIONS.zh.chatRetry, 'missing Chinese retry translation');

  assert.match(announcements, /announcementsLoadError/, 'Announcement launcher should track subscription failures');
  assert.match(announcements, /announcementsReloadKey/, 'Announcement retry should recreate the subscription');
  assert.match(announcements, /setAnnouncementsLoadError\(false\)/, 'Successful announcement snapshots should clear the load error');
  assert.match(announcements, /onSnapshot\(\s*q,[\s\S]{0,800}\(error\)\s*=>\s*\{[\s\S]{0,240}setAnnouncementsLoadError\(true\)/, 'Announcement subscription failures should set a recoverable error state');
  assert.match(announcements, /announcementsLoadFailed/, 'Announcement load failure copy should be rendered');
  assert.match(announcements, /role="alert"/, 'Announcement load failures should be announced to assistive technology');
  assert.match(announcements, /t\('chatRetry'\)/, 'Announcement retry button should use localized copy');
  assert.match(announcements, /RotateCcw/, 'Announcement retry action should use the shared retry icon');
  assert.match(announcements, /announcements\.length === 0 && !announcementsLoadError/, 'Announcement launcher should remain visible when the subscription fails');
});

test('announcement lifecycle management is visible and time-window aware', async () => {
  const files = {
    announcements: await readFile(path.join(root, 'src/components/AnnouncementSystem.jsx'), 'utf8'),
    admin: await readFile(path.join(root, 'src/components/AdminDashboard.jsx'), 'utf8'),
  };

  for (const key of [
    'createAnnouncement',
    'announcementTitle',
    'announcementContent',
    'announcementType',
    'announcementTypeInfo',
    'announcementTypeWarning',
    'announcementStartsAt',
    'announcementEndsAt',
    'activeAnnouncement',
    'noAnnouncements',
  ]) {
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }

  assert.match(files.announcements, /isAnnouncementVisible/, 'Announcement launcher should filter by active state and time window');
  assert.match(files.announcements, /\.filter\(isAnnouncementVisible\)/, 'Announcement list should only render currently visible announcements');
  assert.match(files.admin, /addDoc\(collection\(db,\s*'announcements'\)/, 'Admin dashboard should create announcements');
  assert.match(files.admin, /updateDoc\(doc\(db,\s*'announcements'/, 'Admin dashboard should update announcement publish state');
  assert.match(files.admin, /deleteDoc\(doc\(db,\s*'announcements'/, 'Admin dashboard should delete announcements');
  assert.match(files.admin, /type="datetime-local"/, 'Admin dashboard should support announcement start/end windows');
  assert.match(files.admin, /isCreatingAnnouncementRef\s*=\s*useRef\(false\)/, 'Admin announcement creation should use a synchronous submit lock');
  assert.match(files.admin, /if \(isCreatingAnnouncementRef\.current\) return;/, 'Admin announcement creation should ignore repeated submits before state rerenders');
  assert.match(files.admin, /setIsCreatingAnnouncement\(true\)[\s\S]{0,800}finally[\s\S]{0,220}setIsCreatingAnnouncement\(false\)/, 'Admin announcement creation should expose a loading state for the whole request');
  assert.match(files.admin, /aria-busy=\{isCreatingAnnouncement\}/, 'Admin announcement form should expose pending state to assistive technology');
  assert.match(files.admin, /disabled=\{isCreatingAnnouncement\}/, 'Admin announcement form controls should be disabled while submitting');
  assert.match(files.admin, /isCreatingAnnouncement \? t\('processing'\) : t\('createAnnouncement'\)/, 'Admin announcement submit button should show localized progress copy');
});

test('announcement publish and delete actions prevent duplicate submits and expose pending state', async () => {
  const admin = await readFile(path.join(root, 'src/components/AdminDashboard.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.errorWithMessage, 'missing English error template');
  assert.ok(TRANSLATIONS.zh.errorWithMessage, 'missing Chinese error template');

  assert.match(admin, /pendingAnnouncementActionKeysRef\s*=\s*useRef\(new Set\(\)\)/, 'Admin announcement row actions should track pending keys in a ref');
  assert.match(admin, /if \(pendingAnnouncementActionKeysRef\.current\.has\(actionKey\)\) return;/, 'Admin announcement row actions should ignore duplicate clicks for the same row action');
  assert.match(admin, /pendingAnnouncementActionKeysRef\.current\.add\(actionKey\)[\s\S]{0,220}setPendingAnnouncementActionKeys\(\[\.\.\.pendingAnnouncementActionKeysRef\.current\]\)/, 'Admin announcement row actions should expose pending keys immediately');
  assert.match(admin, /await action\(\)/, 'Admin announcement row actions should await writes while pending');
  assert.match(admin, /finally[\s\S]{0,260}pendingAnnouncementActionKeysRef\.current\.delete\(actionKey\)[\s\S]{0,160}setPendingAnnouncementActionKeys\(\[\.\.\.pendingAnnouncementActionKeysRef\.current\]\)/, 'Admin announcement row actions should clear pending state after writes settle');
  assert.match(admin, /showToast\(t\('errorWithMessage', \{ title: actionLabel, message: error\?\.message \|\| t\('failed'\) \}\), 'error'\)/, 'Admin announcement row failures should use localized app feedback');
  assert.match(admin, /await runAnnouncementAction\(`toggle:\$\{announcement\.id\}`/, 'Announcement publish toggles should route through the pending action guard');
  assert.match(admin, /onConfirm:\s*\(\) => handleDeleteAnnouncementConfirm\(announcement\)/, 'Announcement delete confirmation should route through the pending delete handler');
  assert.match(admin, /await runAnnouncementAction\(`delete:\$\{announcement\.id\}`/, 'Announcement deletes should route through the pending action guard');
  assert.match(admin, /pendingAnnouncementActionKeys\.includes\(`toggle:\$\{announcement\.id\}`\)/, 'Announcement rows should derive toggle pending state from the announcement id');
  assert.match(admin, /pendingAnnouncementActionKeys\.includes\(`delete:\$\{announcement\.id\}`\)/, 'Announcement rows should derive delete pending state from the announcement id');
  assert.match(admin, /disabled=\{isAnnouncementRowPending\}/, 'Announcement row actions should be disabled while a row action is pending');
  assert.match(admin, /aria-busy=\{isToggleAnnouncementPending\}/, 'Announcement publish buttons should expose busy state');
  assert.match(admin, /aria-busy=\{isDeleteAnnouncementPending\}/, 'Announcement delete buttons should expose busy state');
  assert.match(admin, /isToggleAnnouncementPending \? t\('processing'\) : t\(announcement\.active \? 'unpublishAnnouncement' : 'publishAnnouncement'\)/, 'Announcement publish buttons should show localized pending copy');
  assert.match(admin, /title=\{isDeleteAnnouncementPending \? t\('processing'\) : t\('delete'\)\}/, 'Announcement delete buttons should expose localized pending copy');
});

test('admin destructive maintenance actions prevent duplicate submits and expose pending state', async () => {
  const admin = await readFile(path.join(root, 'src/components/AdminDashboard.jsx'), 'utf8');

  assert.ok(TRANSLATIONS.en.processing, 'missing English processing translation');
  assert.ok(TRANSLATIONS.zh.processing, 'missing Chinese processing translation');
  assert.ok(TRANSLATIONS.en.errorWithMessage, 'missing English error template');
  assert.ok(TRANSLATIONS.zh.errorWithMessage, 'missing Chinese error template');
  assert.ok(TRANSLATIONS.en.projectDeleted, 'missing English project deleted feedback');
  assert.ok(TRANSLATIONS.zh.projectDeleted, 'missing Chinese project deleted feedback');

  assert.match(admin, /pendingAdminActionKeysRef\s*=\s*useRef\(new Set\(\)\)/, 'Admin destructive actions should track pending keys in a ref');
  assert.match(admin, /if \(pendingAdminActionKeysRef\.current\.has\(actionKey\)\) return;/, 'Admin destructive actions should ignore duplicate confirms for the same action');
  assert.match(admin, /pendingAdminActionKeysRef\.current\.add\(actionKey\)[\s\S]{0,220}setPendingAdminActionKeys\(\[\.\.\.pendingAdminActionKeysRef\.current\]\)/, 'Admin destructive actions should expose pending keys immediately');
  assert.match(admin, /await action\(\)/, 'Admin destructive actions should await writes while pending');
  assert.match(admin, /finally[\s\S]{0,260}pendingAdminActionKeysRef\.current\.delete\(actionKey\)[\s\S]{0,160}setPendingAdminActionKeys\(\[\.\.\.pendingAdminActionKeysRef\.current\]\)/, 'Admin destructive actions should clear pending state after writes settle');
  assert.match(admin, /showToast\(t\('errorWithMessage', \{ title: actionLabel, message: error\?\.message \|\| t\('failed'\) \}\), 'error'\)/, 'Admin destructive action failures should use localized app feedback');
  assert.match(admin, /await runAdminAction\('clean-orphans'/, 'Orphan cleanup should route through the pending action guard');
  assert.match(admin, /onConfirm:\s*handleCleanOrphansConfirm/, 'Orphan cleanup confirmation should route through the guarded cleanup handler');
  assert.match(admin, /disabled=\{!hasOrphans \|\| isCleaningOrphans\}/, 'Orphan cleanup button should be disabled while cleaning');
  assert.match(admin, /aria-busy=\{isCleaningOrphans\}/, 'Orphan cleanup button should expose busy state');
  assert.match(admin, /isCleaningOrphans \? t\('processing'\) : t\('cleanOrphans'\)/, 'Orphan cleanup button should show localized pending copy');
  assert.match(admin, /await runAdminAction\(`delete-project:\$\{project\.id\}`/, 'Admin project deletes should route through the pending action guard');
  assert.match(admin, /onConfirm:\s*\(\) => handleDeleteProjectConfirm\(project\)/, 'Admin project delete confirmation should route through the guarded delete handler');
  assert.match(admin, /showToast\(t\('projectDeleted'\), 'success'\)/, 'Admin project deletes should provide localized success feedback');
  assert.match(admin, /pendingAdminActionKeys\.includes\(`delete-project:\$\{p\.id\}`\)/, 'Admin project rows should derive delete pending state from the project id');
  assert.match(admin, /disabled=\{isProjectDeletePending\}/, 'Admin project delete buttons should be disabled while deleting');
  assert.match(admin, /aria-busy=\{isProjectDeletePending\}/, 'Admin project delete buttons should expose busy state');
  assert.match(admin, /title=\{isProjectDeletePending \? t\('processing'\) : t\('forceDelete'\)\}/, 'Admin project delete buttons should expose localized pending copy');
  assert.doesNotMatch(admin, /showToast\(t\('orphanError'\) \+/, 'Admin cleanup errors should not concatenate localized fragments with raw messages');
});

test('auth and user fallbacks avoid visible English fragments', async () => {
  const files = {
    login: await readFile(path.join(root, 'src/pages/Login.jsx'), 'utf8'),
    localAuth: await readFile(path.join(root, 'src/lib/localAuth.js'), 'utf8'),
    authService: await readFile(path.join(root, 'server/auth-service.mjs'), 'utf8'),
    gather: await readFile(path.join(root, 'src/components/GatherView.jsx'), 'utf8'),
    admin: await readFile(path.join(root, 'src/components/AdminDashboard.jsx'), 'utf8'),
  };

  for (const key of [
    'actionFailed',
    'authServiceUnavailable',
    'errorWithMessage',
    'exportFile',
    'activeStatus',
    'invalidEmail',
    'weakPassword',
  ]) {
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }

  assert.match(files.login, /role="alert"/, 'Login form errors should be announced to assistive technology');
  assert.match(files.login, /aria-live="assertive"/, 'Login form errors should be treated as assertive live updates');
  assert.match(files.login, /id="auth-error"/, 'Login inputs should be able to reference the current auth error');
  assert.match(files.login, /aria-describedby=\{error \? 'auth-error' : undefined\}/, 'Login inputs should describe their current auth error');
  assert.match(files.login, /isEmailInputValid/, 'Login should validate email format before calling the backend');
  assert.match(files.login, /AUTH_EMAIL_MAX_LENGTH/, 'Login email input should share the auth email length limit');
  assert.match(files.login, /AUTH_PASSWORD_MAX_LENGTH/, 'Login password input should share the auth password length limit');
  assert.match(files.login, /maxLength=\{AUTH_EMAIL_MAX_LENGTH\}/, 'Login email input should cap text before submit');
  assert.match(files.login, /maxLength=\{AUTH_PASSWORD_MAX_LENGTH\}/, 'Login password input should cap text before submit');
  assert.match(files.login, /setError\(t\('invalidEmail'\)\)/, 'Invalid email should use localized frontend copy');
  assert.match(files.login, /auth\/invalid-email[\s\S]{0,160}t\('invalidEmail'\)/, 'Backend invalid-email errors should use localized copy');
  assert.match(files.login, /auth\/weak-password[\s\S]{0,160}t\('weakPassword'\)/, 'Backend weak-password errors should use localized copy');
  assert.match(files.login, /USER_DISPLAY_NAME_MAX_LENGTH/, 'Guest nickname input should share the user display-name limit');
  assert.match(files.login, /maxLength=\{USER_DISPLAY_NAME_MAX_LENGTH\}/, 'Guest nickname input should cap names before submit');
  assert.match(files.login, /t\('actionFailed'/, 'Login failures should use a localized action-failed template');
  assert.match(files.login, /status\s*>=\s*500[\s\S]{0,160}t\('authServiceUnavailable'\)/, 'Login should replace server outage responses with localized service-unavailable copy');
  assert.doesNotMatch(files.login, /setError\(e\.message\)/, 'Login should not expose raw transport errors such as Request failed with status 502');
  assert.doesNotMatch(files.login, /['"]\s*failed:\s*['"]/, 'Login should not concatenate a hardcoded English failed label');
  assert.doesNotMatch(files.localAuth, /Guest \$\{|['"]User['"]/, 'Local auth should not inject visible English user-name fallbacks');
  assert.doesNotMatch(files.authService, /displayName:\s*user\.displayName\s*\|\|\s*['"]User['"]/, 'Backend public user payload should not force a visible English fallback name');
  assert.doesNotMatch(files.gather, /submitError'\)\s*\+\s*['"]:/, 'Gather errors should use the localized error template');
  assert.doesNotMatch(files.gather, /project\.title\s*\|\|\s*['"]export['"]/, 'CSV export fallback filename should be localized');
  assert.match(files.admin, /activeStatus/, 'Admin project status should localize active status copy');
});

test('browser storage access is guarded behind safe helpers', async () => {
  const files = {
    app: await readFile(path.join(root, 'src/App.jsx'), 'utf8'),
    apiClient: await readFile(path.join(root, 'src/lib/apiClient.js'), 'utf8'),
    announcements: await readFile(path.join(root, 'src/components/AnnouncementSystem.jsx'), 'utf8'),
  };

  const helper = await readFile(path.join(root, 'src/lib/browserStorage.js'), 'utf8');

  assert.match(helper, /try[\s\S]{0,220}localStorage\.getItem/, 'Storage helper should catch getItem failures');
  assert.match(helper, /try[\s\S]{0,220}localStorage\.setItem/, 'Storage helper should catch setItem failures');
  assert.match(helper, /try[\s\S]{0,220}localStorage\.removeItem/, 'Storage helper should catch removeItem failures');

  assert.match(files.app, /getBrowserStorageItem\('app_lang', 'zh'\)/, 'App language bootstrap should read storage through the safe helper');
  assert.match(files.app, /setBrowserStorageItem\('app_lang', newLang\)/, 'Language toggles should write storage through the safe helper');
  assert.match(files.apiClient, /getBrowserStorageItem\(TOKEN_KEY, null\)/, 'Auth token reads should tolerate disabled browser storage');
  assert.match(files.apiClient, /setBrowserStorageItem\(TOKEN_KEY, token\)/, 'Auth token writes should tolerate disabled browser storage');
  assert.match(files.apiClient, /removeBrowserStorageItem\(TOKEN_KEY\)/, 'Auth token clears should tolerate disabled browser storage');
  assert.match(files.announcements, /getJsonBrowserStorageItem\('readAnnouncements', \[\]\)/, 'Announcement read state should tolerate disabled browser storage');
  assert.match(files.announcements, /setJsonBrowserStorageItem\('readAnnouncements', newReadIds\)/, 'Announcement read writes should tolerate disabled browser storage');

  assert.doesNotMatch(files.app, /(?<!getBrowserStorageItem\()localStorage\.(getItem|setItem|removeItem)/, 'App should not access localStorage directly');
  assert.doesNotMatch(files.apiClient, /(?<!getBrowserStorageItem\()localStorage\.(getItem|setItem|removeItem)/, 'API client should not access localStorage directly');
  assert.doesNotMatch(files.announcements, /(?<!getJsonBrowserStorageItem\()localStorage\.(getItem|setItem|removeItem)/, 'Announcement system should not access localStorage directly');
});

test('auth submit actions prevent duplicate submits and expose pending state', async () => {
  const login = await readFile(path.join(root, 'src/pages/Login.jsx'), 'utf8');

  assert.match(login, /useRef/, 'Login should use an immediate ref guard for auth submits');
  assert.match(login, /pendingAuthActionRef\s*=\s*useRef\(null\)/, 'Auth submit guard should keep the pending action in a ref');
  assert.match(login, /const startAuthAction = \(action\) => \{[\s\S]{0,180}if \(pendingAuthActionRef\.current\) return false;/, 'Auth submits should ignore duplicate attempts before rerender');
  assert.match(login, /pendingAuthActionRef\.current = action[\s\S]{0,140}setPendingAuthAction\(action\)/, 'Auth submit guard should expose pending action state');
  assert.match(login, /const finishAuthAction = \(action\) => \{[\s\S]{0,220}pendingAuthActionRef\.current = null[\s\S]{0,120}setPendingAuthAction\(null\)/, 'Auth submit guard should clear pending state after the matching action settles');
  assert.match(login, /if \(!startAuthAction\('email'\)\) return;/, 'Email auth should route through the pending guard');
  assert.match(login, /finally \{[\s\S]{0,80}finishAuthAction\('email'\)/, 'Email auth should clear its pending guard in finally');
  assert.match(login, /if \(!startAuthAction\('guest'\)\) return;/, 'Guest auth should route through the pending guard');
  assert.match(login, /finally \{[\s\S]{0,80}finishAuthAction\('guest'\)/, 'Guest auth should clear its pending guard in finally');
  assert.match(login, /const isEmailPending = pendingAuthAction === 'email'/, 'Email button should derive its own pending state');
  assert.match(login, /const isGuestPending = pendingAuthAction === 'guest'/, 'Guest button should derive its own pending state');
  assert.match(login, /const isAuthPending = Boolean\(pendingAuthAction\)/, 'All auth buttons should share a pending state while any auth action is pending');
  assert.match(login, /const isAuthDisabled = isAuthPending \|\| isServiceUnavailable/, 'Auth buttons should combine pending and service health disabled states');
  assert.match(login, /disabled=\{isAuthDisabled\}/, 'Auth buttons should be disabled while any auth action is pending or service health is failed');
  assert.match(login, /aria-busy=\{isEmailPending\}/, 'Email auth button should expose its busy state');
  assert.match(login, /isEmailPending \? t\('processing'\) : t\('loginReg'\)/, 'Email auth button should show localized pending copy');
  assert.match(login, /aria-busy=\{isGuestPending\}/, 'Guest auth button should expose its busy state');
  assert.match(login, /isGuestPending \? t\('processing'\) : t\('guestLogin'\)/, 'Guest auth button should show localized pending copy');
});

test('auth form fields have explicit accessible label associations', async () => {
  const login = await readFile(path.join(root, 'src/pages/Login.jsx'), 'utf8');

  for (const [fieldId, labelKey] of [
    ['auth-email', 'emailAddr'],
    ['auth-password', 'password'],
    ['guest-name', 'guestName'],
  ]) {
    assert.match(
      login,
      new RegExp(`<label className="app-label" htmlFor="${fieldId}">\\{t\\('${labelKey}'\\)\\}</label>`),
      `${fieldId} should have a visible label associated by htmlFor`,
    );
    assert.match(
      login,
      new RegExp(`id="${fieldId}"[\\s\\S]{0,420}aria-describedby=\\{error \\? 'auth-error' : undefined\\}`),
      `${fieldId} input should expose a stable id and retain error description`,
    );
  }
});

test('workspace timestamps and defaults avoid render-time unstable values', async () => {
  const files = {
    app: await readFile(path.join(root, 'src/App.jsx'), 'utf8'),
    chat: await readFile(path.join(root, 'src/components/ChatRoom.jsx'), 'utf8'),
    friends: await readFile(path.join(root, 'src/components/FriendSystem.jsx'), 'utf8'),
    gameHub: await readFile(path.join(root, 'src/components/GameHubView.jsx'), 'utf8'),
    schedule: await readFile(path.join(root, 'src/components/ScheduleView.jsx'), 'utf8'),
    booking: await readFile(path.join(root, 'src/components/BookingView.jsx'), 'utf8'),
    ui: await readFile(path.join(root, 'src/components/UIComponents.jsx'), 'utf8'),
  };

  for (const [fileKey, source] of Object.entries(files)) {
    assert.match(source, /nowMs|createDefault/, `${fileKey} should use stable helper functions for time-derived values`);
    assert.doesNotMatch(source, /Date\.now\(/, `${fileKey} should not call Date.now directly inside visual component modules`);
    assert.doesNotMatch(source, /new Date\(Date\.now\(/, `${fileKey} should not derive default ranges during render`);
  }

  assert.match(files.schedule, /useState\(\(\) => project\.scheduleConfig \|\| createDefaultScheduleConfig\(\)\)/, 'Schedule default config should be lazily initialized');
  assert.match(files.booking, /useState\(\(\) => project\.bookingConfig \|\| createDefaultBookingConfig\(t\)\)/, 'Booking default config should be lazily initialized');
  assert.match(files.schedule, /createDateRangeDays\(config\)/, 'Schedule date grids should use the shared validated date-range helper');
  assert.match(files.booking, /createDateRangeDays\(config\)/, 'Booking date grids should use the shared validated date-range helper');
  assert.doesNotMatch(files.schedule, /new Date\(config\.start\)/, 'Schedule should not generate date grids through permissive Date parsing');
  assert.doesNotMatch(files.booking, /new Date\(config\.start\)/, 'Booking should not generate date grids through permissive Date parsing');
});

test('React compiler hotspots stay derived and deterministic', async () => {
  const files = {
    detail: await readFile(path.join(root, 'src/pages/ProjectDetail.jsx'), 'utf8'),
    roulette: await readFile(path.join(root, 'src/components/RouletteView.jsx'), 'utf8'),
    gameHub: await readFile(path.join(root, 'src/components/GameHubView.jsx'), 'utf8'),
  };

  assert.match(files.detail, /useState\(\(\) => \(location\.state\?\.unlockedProjectId === id \? id : null\)\)/, 'Project detail should initialize route unlock state only when it matches the current project id');
  assert.match(files.detail, /unlockedProjectId === project\.id/, 'Project detail should scope local unlock state to the current project');
  assert.doesNotMatch(files.detail, /Boolean\(location\.state\?\.unlocked\)/, 'Project detail should not trust a reusable boolean unlock state');
  assert.doesNotMatch(files.detail, /useEffect\([\s\S]{0,240}setUnlockedProjectId/, 'Project detail should not synchronously set unlock state inside an effect');

  assert.match(files.roulette, /advanceRepeatSeed/, 'Roulette repeat draws should advance a deterministic seed helper');
  assert.doesNotMatch(files.roulette, /\bprngState\s*=\s*\(prngState\s*\*/, 'Roulette should not reassign PRNG state after render');
  assert.doesNotMatch(files.roulette, /useEffect\([\s\S]{0,260}setConfig\(/, 'Roulette should not mirror project config into local state inside an effect');

  assert.match(files.gameHub, /MineCell/, 'Minesweeper cells should be a stable component');
  assert.doesNotMatch(files.gameHub, /const Cell = useMemo/, 'Minesweeper should not memoize an inline component with incomplete dependencies');
  assert.match(files.gameHub, /function MoveIcon/, 'RPS move icons should be declared as a stable component');
  assert.doesNotMatch(files.gameHub, /const MoveIcon = \(\{ move/, 'RPS should not create move icon components during render');
  assert.match(files.gameHub, /selectedMoveState/, 'RPS selected move should be scoped to the current round without an effect reset');
  assert.doesNotMatch(files.gameHub, /useEffect\([\s\S]{0,120}setSelectedMove\(null\)/, 'RPS should not synchronously reset selected move inside an effect');
});

test('React refresh and animated tab hooks keep stable module boundaries', async () => {
  const files = {
    dashboard: await readFile(path.join(root, 'src/pages/Dashboard.jsx'), 'utf8'),
    detail: await readFile(path.join(root, 'src/pages/ProjectDetail.jsx'), 'utf8'),
    ui: await readFile(path.join(root, 'src/components/UIComponents.jsx'), 'utf8'),
    uiContext: await readFile(path.join(root, 'src/components/UIContext.js'), 'utf8'),
  };

  assert.match(files.uiContext, /export const useUI/, 'UI hook should live outside the component-only provider module');
  assert.doesNotMatch(files.ui, /export const useUI/, 'UI provider module should not export hooks that break Fast Refresh boundaries');

  assert.match(files.dashboard, /DASHBOARD_TAB_IDS/, 'Dashboard tab ids should be a stable module constant');
  assert.match(files.dashboard, /DASHBOARD_TAB_BG_COLORS/, 'Dashboard tab colors should be a stable module constant');
  assert.doesNotMatch(files.dashboard, /\[projects,\s*searchTerm,\s*activeTab,\s*currentCategory\]/, 'Dashboard filtered projects should not carry an unnecessary activeTab dependency');
  assert.match(files.dashboard, /getProjectRoutePrefix/, 'Dashboard project navigation should use the shared route prefix helper');
  assert.match(files.detail, /getProjectRoutePrefix/, 'Project detail duplicate navigation should use the shared route prefix helper');
  assert.doesNotMatch(files.dashboard, /if \(type === 'roulette'\)/, 'Dashboard should not keep route-prefix conditionals that drift from module categories');
});

test('application routes lazy-load heavy pages behind a localized fallback', async () => {
  const app = await readFile(path.join(root, 'src/App.jsx'), 'utf8');

  assert.match(app, /lazy\(\(\)\s*=>\s*import\(['"]\.\/pages\/Dashboard['"]\)\)/, 'Dashboard should be lazy-loaded at the route boundary');
  assert.match(app, /lazy\(\(\)\s*=>\s*import\(['"]\.\/pages\/ProjectDetail['"]\)\)/, 'Project detail should be lazy-loaded at the route boundary');
  assert.match(app, /lazy\(\(\)\s*=>\s*import\(['"]\.\/pages\/Login['"]\)\)/, 'Login should be lazy-loaded at the route boundary');
  assert.match(app, /lazy\(\(\)\s*=>\s*import\(['"]\.\/components\/AdminDashboard['"]\)\)/, 'Admin console should be lazy-loaded at the route boundary');

  assert.doesNotMatch(app, /import\s+Dashboard\s+from\s+['"]\.\/pages\/Dashboard['"]/, 'Dashboard should not be statically imported into the app shell');
  assert.doesNotMatch(app, /import\s+ProjectDetail\s+from\s+['"]\.\/pages\/ProjectDetail['"]/, 'Project detail should not be statically imported into the app shell');
  assert.doesNotMatch(app, /import\s+Login\s+from\s+['"]\.\/pages\/Login['"]/, 'Login should not be statically imported into the app shell');
  assert.doesNotMatch(app, /import\s+AdminDashboard\s+from\s+['"]\.\/components\/AdminDashboard['"]/, 'Admin console should not be statically imported into the app shell');

  assert.match(app, /<Suspense[\s\S]{0,180}fallback=/, 'Lazy routes should render inside Suspense');
  assert.match(app, /t\('loading'\)/, 'Route fallback should use localized loading copy');
});

test('visible workspaces avoid legacy decorative UI fragments', async () => {
  const sources = await readVisualSources([
    path.join(root, 'src/components'),
    path.join(root, 'src/pages'),
  ]);

  const structuralEmoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  const legacyDecoration = /\b(?:rounded-3xl|rounded-\[[^\]]+\]|shadow-xl|shadow-2xl)\b/;

  for (const [filePath, source] of sources) {
    assert.doesNotMatch(source, structuralEmoji, `${filePath} should use vector icons instead of emoji`);
    assert.doesNotMatch(source, legacyDecoration, `${filePath} should use shared Material surfaces instead of legacy decorative classes`);
  }
});

test('interactive icon controls preserve ergonomic touch targets', async () => {
  const sources = await readVisualSources([
    path.join(root, 'src/components'),
    path.join(root, 'src/pages'),
  ]);
  const undersizedIconButton = /app-icon-button[^\n]*(?:h-8|w-8|min-h-8|min-w-8|h-9|w-9|min-h-9|min-w-9)|(?:h-8|w-8|min-h-8|min-w-8|h-9|w-9|min-h-9|min-w-9)[^\n]*app-icon-button/;
  const undersizedButton = /<button[^\n]*className=[^\n]*(?:h-8|w-8|min-h-8|min-w-8|h-9|w-9|min-h-9|min-w-9)/;

  for (const [filePath, source] of sources) {
    assert.doesNotMatch(source, undersizedIconButton, `${filePath} should not shrink shared icon-button touch targets`);
    assert.doesNotMatch(source, undersizedButton, `${filePath} should not define undersized custom button targets`);
  }
});

test('primary clickable regions use semantic controls', async () => {
  const sources = await readVisualSources([
    path.join(root, 'src/components'),
    path.join(root, 'src/pages'),
  ]);
  const divClickHandler = /<div[^>\n]*onClick=/;

  for (const [filePath, source] of sources) {
    assert.doesNotMatch(source, divClickHandler, `${filePath} should use button or link semantics for clickable regions`);
  }
});

async function readVisualSources(directories) {
  const files = [];
  for (const directory of directories) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) continue;
      if (entry.name.endsWith('.jsx')) files.push(entryPath);
    }
  }

  const result = [];
  for (const filePath of files) {
    result.push([path.relative(root, filePath), await readFile(filePath, 'utf8')]);
  }
  return result;
}
