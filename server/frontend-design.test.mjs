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

test('project surfaces stay compact and keyboard ergonomic', async () => {
  const files = {
    dashboard: await readFile(path.join(root, 'src/pages/Dashboard.jsx'), 'utf8'),
    detail: await readFile(path.join(root, 'src/pages/ProjectDetail.jsx'), 'utf8'),
    infoCard: await readFile(path.join(root, 'src/components/InfoCard.jsx'), 'utf8'),
  };

  assert.match(files.dashboard, /<motion\.button/, 'Dashboard project cards should be semantic buttons');
  assert.doesNotMatch(files.dashboard, /<motion\.div[\s\S]{0,500}onClick=\{\(\) => handleProjectClick\(project\)\}/, 'Dashboard project cards should not use clickable divs');

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
  assert.match(files.gameHub, /createRpsNextRoundPatch/, 'RPS room transitions should use the domain helper');
  assert.match(files.gameHub, /setActiveTab\('finished'\)/, 'Game hub should expose finished rooms');
  assert.match(files.gameHub, /setActiveTab\('lobby'\)/, 'Game hub should expose active rooms');
  assert.match(files.gameHub, /currentActiveRoom/, 'Active game room should be derived from live room snapshots');
  assert.match(files.gameHub, /visibleRooms/, 'Room tabs should filter the full project room snapshot');
  assert.match(files.gameHub, /roomSummary\.winnerName/, 'Room cards should show the finished winner');
  assert.match(files.gameHub, /roomSummary\.scoreLine/, 'Room cards should show the score line');
  assert.match(files.projectDomain, /resultSummary/, 'Finished game rooms should persist a reusable result summary');
  assert.doesNotMatch(files.gameHub, />Finished|>Active|>Winner|>Rounds|>Last round|No finished rooms/, 'Game hub result copy should be localized');
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
    detail: ['copyFullProjectId', 'projectView', 'share', 'chat'],
    qr: ['linkCopied', 'shareProject', 'copyLink', 'qrCodeAlt'],
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
  assert.match(files.chat, /disabled=\{isStopped \|\| !inputText\.trim\(\)\}/, 'Chat send control should be disabled for stopped or finished projects');
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
    /const markVisibleAnnouncementsAsRead = \(\) => \{[\s\S]{0,700}localStorage\.setItem\('readAnnouncements'/,
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

test('auth and user fallbacks avoid visible English fragments', async () => {
  const files = {
    login: await readFile(path.join(root, 'src/pages/Login.jsx'), 'utf8'),
    localAuth: await readFile(path.join(root, 'src/lib/localAuth.js'), 'utf8'),
    authService: await readFile(path.join(root, 'server/auth-service.mjs'), 'utf8'),
    gather: await readFile(path.join(root, 'src/components/GatherView.jsx'), 'utf8'),
    admin: await readFile(path.join(root, 'src/components/AdminDashboard.jsx'), 'utf8'),
  };

  for (const key of ['actionFailed', 'authServiceUnavailable', 'errorWithMessage', 'exportFile', 'activeStatus']) {
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }

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

  assert.match(files.detail, /useState\(\(\) => Boolean\(location\.state\?\.\unlocked\)\)/, 'Project detail should initialize unlock state from navigation state');
  assert.doesNotMatch(files.detail, /useEffect\([\s\S]{0,240}setUnlocked\(true\)/, 'Project detail should not synchronously set unlock state inside an effect');

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
