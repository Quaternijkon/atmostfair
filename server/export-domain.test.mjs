import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  createProjectActivityExport,
  createProjectParticipantExport,
  formatCsvCell,
} from '../src/lib/exportDomain.js';
import { TRANSLATIONS } from '../src/constants/translations.js';

const root = process.cwd();

const LABELS = {
  book: 'Reserve',
  exportAvailability: 'Availability',
  exportBookingStatus: 'Status',
  exportBookedAt: 'Booked At',
  exportBookedBy: 'Booked By',
  exportClaimCount: 'Claim Count',
  exportClaimants: 'Claimants',
  exportActivities: 'Export activity',
  exportActivityActor: 'Actor',
  exportActivityMessage: 'Message',
  exportActivityMetadata: 'Metadata',
  exportActivitySubject: 'Subject',
  exportActivityTime: 'Time',
  exportActivityType: 'Type',
  exportFile: 'export',
  exportFinishedAt: 'Finished At',
  exportGameRoom: 'Room',
  exportGameType: 'Game',
  exportProjectArchived: 'Archived',
  exportProjectCreatedAt: 'Created At',
  exportProjectCreator: 'Creator',
  exportProjectId: 'Project ID',
  exportProjects: 'Export projects',
  exportProjectStatus: 'Status',
  exportProjectTitle: 'Title',
  exportProjectType: 'Type',
  exportJoinedAt: 'Joined At',
  exportParticipantId: 'Participant ID',
  exportParticipants: 'Export participants',
  exportPlayerCount: 'Players',
  exportPlayers: 'Player List',
  exportQueueOrder: 'Queue Order',
  exportRounds: 'Rounds',
  exportScore: 'Score',
  exportSlotLabel: 'Slot',
  exportStatus: 'Status',
  exportWaitlistOrder: 'Waitlist Order',
  exportWinner: 'Winner',
  maxClaims: 'Max People',
  nameLabel: 'Name',
  noExportData: 'No participant data to export',
  noProjectExportData: 'No projects to export',
  queue: 'Queue',
  startDate: 'Start Date',
  endDate: 'End Date',
  submittedAtCsv: 'Submitted At',
  taskTitle: 'Task / Item',
  valueLabel: 'Value (0-100)',
  booked: 'Booked',
  finished: 'Finished',
  minesweeper: 'Minesweeper',
  playing: 'Playing',
  rockPaperScissors: 'Rock Paper Scissors',
  waitlisted: 'Waitlisted',
  activityQueueJoined: '{actor} joined queue as {subject}',
  activityUpdated: '{actor} updated {subject}',
  archived: 'Archived',
  activeStatus: 'Active',
  paused: 'Paused',
  voting: 'Collect',
};

function t(key, params = {}) {
  let value = LABELS[key] || key;
  for (const [name, replacement] of Object.entries(params)) {
    value = value.replace(`{${name}}`, replacement);
  }
  return value;
}

test('CSV cell formatting escapes delimiters, quotes, newlines, and empty values', () => {
  assert.equal(formatCsvCell('plain'), 'plain');
  assert.equal(formatCsvCell('a,b'), '"a,b"');
  assert.equal(formatCsvCell('say "hi"'), '"say ""hi"""');
  assert.equal(formatCsvCell('line\nbreak'), '"line\nbreak"');
  assert.equal(formatCsvCell(null), '');
  assert.equal(formatCsvCell(undefined), '');
});

test('participant export builds localized CSV for each participant workflow', () => {
  const queueExport = createProjectParticipantExport({
    id: 'p1',
    title: 'Launch / Queue',
    type: 'queue',
  }, {
    queueParticipants: [
      { name: 'Ana, "A"', value: 7, queueOrder: 2, joinedAt: 1704164645000 },
    ],
  }, t);

  assert.equal(queueExport.filename, 'Launch-Queue_queue_participants.csv');
  assert.match(queueExport.csv, /^Name,Value \(0-100\),Queue Order,Joined At\n/);
  assert.match(queueExport.csv, /"Ana, ""A""",7,2,2024-01-02T03:04:05.000Z/);

  const bookingExport = createProjectParticipantExport({
    id: 'p2',
    title: 'Office Hours',
    type: 'book',
  }, {
    bookingSlots: [
      {
        label: 'Morning',
        start: '2024-05-01',
        end: '2024-05-01',
        bookerName: 'Bo',
        bookedBy: 'u1',
        bookedAt: 1714554000000,
        bookingData: { Phone: '123', Note: 'needs, projector' },
        waitlist: [
          {
            uid: 'u2',
            name: 'Cal',
            joinedAt: 1714557600000,
            bookingData: { Phone: '456', Note: 'backup' },
          },
        ],
      },
    ],
  }, t);
  assert.match(bookingExport.csv, /^Slot,Start Date,End Date,Status,Name,Participant ID,Booked At,Waitlist Order,Joined At,Phone,Note\n/);
  assert.match(bookingExport.csv, /Morning,2024-05-01,2024-05-01,Booked,Bo,u1,2024-05-01T09:00:00.000Z,,,123,"needs, projector"/);
  assert.match(bookingExport.csv, /Morning,2024-05-01,2024-05-01,Waitlisted,Cal,u2,,1,2024-05-01T10:00:00.000Z,456,backup/);

  const configuredBookingExport = createProjectParticipantExport({
    id: 'p2b',
    title: 'Configured Booking',
    type: 'book',
  }, {
    bookingConfig: {
      mode: 'date',
      start: '2024-05-01',
      end: '2024-05-03',
      requiredFields: 'Contact, Dietary',
    },
    bookingSlots: [
      {
        label: 'Workshop',
        start: '2024-05-02',
        end: '2024-05-02',
        bookerName: 'Nia',
        bookedBy: 'u3',
        bookedAt: 1714640400000,
        bookingData: {
          Phone: '111',
          Contact: 'nia@example.com',
          Notes: 'legacy note',
        },
        waitlist: [
          {
            uid: 'u4',
            name: 'Omar',
            joinedAt: 1714644000000,
            bookingData: {
              Phone: '222',
              Dietary: 'vegan',
              Stale: 'old value',
            },
          },
        ],
      },
    ],
  }, t);
  assert.match(configuredBookingExport.csv, /^Slot,Start Date,End Date,Status,Name,Participant ID,Booked At,Waitlist Order,Joined At,Contact,Dietary\n/);
  assert.match(configuredBookingExport.csv, /Workshop,2024-05-02,2024-05-02,Booked,Nia,u3,2024-05-02T09:00:00.000Z,,,nia@example.com,/);
  assert.match(configuredBookingExport.csv, /Workshop,2024-05-02,2024-05-02,Waitlisted,Omar,u4,,1,2024-05-02T10:00:00.000Z,,vegan/);
  assert.doesNotMatch(configuredBookingExport.csv, /Phone|Notes|Stale|legacy note|old value/);

  const scheduleExport = createProjectParticipantExport({
    id: 'p3',
    title: 'Planning',
    type: 'schedule',
  }, {
    scheduleSubmissions: [
      {
        name: 'Chen',
        availability: [
          '2024-05-02',
          '2024-05-03_morning',
          { date: '2024-05-04', start: '09:00', end: '10:30' },
        ],
        submittedAt: 1714554000000,
      },
    ],
  }, t);
  assert.match(scheduleExport.csv, /^Name,Availability,Submitted At\n/);
  assert.match(scheduleExport.csv, /Chen,2024-05-02; 2024-05-03_morning; 2024-05-04 09:00-10:30,2024-05-01T09:00:00.000Z/);

  const normalizedScheduleExport = createProjectParticipantExport({
    id: 'p3b',
    title: 'Current Planning',
    type: 'schedule',
  }, {
    scheduleConfig: { mode: 'time', start: '2024-05-02', end: '2024-05-03', deadline: '' },
    scheduleSubmissions: [
      {
        name: 'Iris',
        availability: [
          { date: '2024-05-02', start: '09:00', end: '10:30' },
          { date: '2024-05-04', start: '09:00', end: '10:00' },
          { date: '2024-05-03', start: 'bad', end: '11:00' },
          { date: '2024-05-03', start: '13:00', end: '12:00' },
        ],
        submittedAt: 1714554000000,
      },
      {
        name: 'Jo',
        availability: [
          { date: '2024-05-03', start: '14:00', end: '15:00' },
          { date: '2024-05-03', start: '14:00', end: '15:00' },
        ],
        submittedAt: 1714557600000,
      },
    ],
  }, t);
  assert.match(normalizedScheduleExport.csv, /Iris,2024-05-02 09:00-10:30,2024-05-01T09:00:00.000Z/);
  assert.match(normalizedScheduleExport.csv, /Jo,2024-05-03 14:00-15:00,2024-05-01T10:00:00.000Z/);
  assert.doesNotMatch(normalizedScheduleExport.csv, /2024-05-04|bad|13:00-12:00/);

  const gatherExport = createProjectParticipantExport({
    id: 'p4',
    title: '',
    type: 'gather',
  }, {
    gatherFields: [{ id: 'topic', label: 'Topic' }],
    gatherSubmissions: [
      { name: 'Dora', data: { topic: 'CSV, edge' }, submittedAt: 1714554000000 },
    ],
  }, t);
  assert.equal(gatherExport.filename, 'export_gather_participants.csv');
  assert.match(gatherExport.csv, /^Name,Submitted At,Topic\n/);
  assert.match(gatherExport.csv, /Dora,2024-05-01T09:00:00.000Z,"CSV, edge"/);

  const typedGatherExport = createProjectParticipantExport({
    id: 'p4b',
    title: 'Typed Gather',
    type: 'gather',
  }, {
    gatherFields: [
      { id: 'meal', label: 'Meal', type: 'option', options: ['Veg', 'Meat'] },
      { id: 'seats', label: 'Seats', type: 'number' },
      { id: 'day', label: 'Day', type: 'date' },
      { id: 'note', label: 'Note', type: 'text' },
    ],
    gatherSubmissions: [
      {
        name: 'Rae',
        data: {
          meal: 'Pizza',
          seats: 'NaN',
          day: '2026-02-30',
          note: '  needs trim  ',
          stale: 'should not export',
        },
        submittedAt: 1714554000000,
      },
      {
        name: 'Mia',
        data: {
          meal: 'Veg',
          seats: '2',
          day: '2026-07-05',
          note: 'ok',
          stale: 'ignored',
        },
        submittedAt: 1714557600000,
      },
    ],
  }, t);
  assert.match(typedGatherExport.csv, /^Name,Submitted At,Meal,Seats,Day,Note\n/);
  assert.match(typedGatherExport.csv, /Rae,2024-05-01T09:00:00.000Z,,,,needs trim/);
  assert.match(typedGatherExport.csv, /Mia,2024-05-01T10:00:00.000Z,Veg,2,2026-07-05,ok/);
  assert.doesNotMatch(typedGatherExport.csv, /Pizza|NaN|2026-02-30|stale|ignored|should not export/);

  const claimExport = createProjectParticipantExport({
    id: 'p5',
    title: 'Setup',
    type: 'claim',
  }, {
    claimItems: [
      {
        title: 'Bring badges',
        maxClaims: 3,
        claimants: [{ name: 'Eli' }, { name: 'Fay' }],
      },
    ],
  }, t);
  assert.match(claimExport.csv, /^Task \/ Item,Max People,Claim Count,Claimants\n/);
  assert.match(claimExport.csv, /Bring badges,3,2,Eli; Fay/);

  const gameExport = createProjectParticipantExport({
    id: 'p7',
    title: 'Game Night',
    type: 'game_hub',
  }, {
    gameRooms: [
      {
        id: 'game-2',
        name: 'Mine room',
        game: 'mine',
        status: 'playing',
        players: [
          { uid: 'u3', name: 'Cy', progress: 142, status: 'playing' },
          { uid: 'u4', name: 'Dee', progress: -4, status: 'dead' },
        ],
        resultSummary: {
          game: 'rps',
          status: 'finished',
          winnerName: 'Ghost',
          scoreLine: '500%',
          playerCount: 'bad',
          roundsPlayed: 99,
        },
        createdAt: 1714550000000,
      },
      {
        id: 'game-1',
        name: 'Final RPS',
        game: 'rps',
        status: 'finished',
        winnerId: 'u1',
        finishedAt: 1714554000000,
        config: { bestOf: 3, timeout: 30 },
        players: [
          { uid: 'u1', name: 'Ana', score: 999 },
          { uid: 'u2', name: 'Bo', score: -4 },
        ],
        history: [{ round: 1 }, { round: 2 }, { round: 3 }],
        resultSummary: {
          game: 'mine',
          status: 'finished',
          winnerName: 'Ghost',
          scoreLine: '999 - -4',
          playerCount: 'bad',
          roundsPlayed: 99,
        },
        createdAt: 1714540000000,
      },
    ],
  }, t);
  assert.equal(gameExport.filename, 'Game-Night_game_results.csv');
  assert.match(gameExport.csv, /^Room,Game,Status,Winner,Score,Players,Rounds,Finished At,Player List\n/);
  assert.match(gameExport.csv, /Final RPS,Rock Paper Scissors,Finished,Ana,2 - 0,2,3,2024-05-01T09:00:00.000Z,Ana \(2\); Bo \(0\)/);
  assert.match(gameExport.csv, /Mine room,Minesweeper,Playing,,100%,2,0,,Cy \(100%\); Dee \(0%\)/);
});

test('participant export returns null for unsupported or empty participant data', () => {
  assert.equal(createProjectParticipantExport({ type: 'vote', title: 'Poll' }, {}, t), null);
  assert.equal(createProjectParticipantExport({ type: 'queue', title: 'Queue' }, { queueParticipants: [] }, t), null);
  assert.equal(createProjectParticipantExport({ type: 'book', title: 'Book' }, { bookingSlots: [{ label: 'Open' }] }, t), null);
  assert.equal(createProjectParticipantExport({ type: 'game_hub', title: 'Game Hub' }, { gameRooms: [] }, t), null);
});

test('participant export preserves zero timestamps instead of treating them as empty', () => {
  const queueExport = createProjectParticipantExport({
    id: 'p6',
    title: 'Epoch',
    type: 'queue',
  }, {
    queueParticipants: [
      { name: 'Zero', value: 0, queueOrder: 1, joinedAt: 0 },
    ],
  }, t);

  assert.match(queueExport.csv, /Zero,0,1,1970-01-01T00:00:00.000Z/);
});

test('project activity export builds a localized audit CSV', () => {
  const activityExport = createProjectActivityExport({
    id: 'p8',
    title: 'Audit / Trail',
  }, [
    {
      id: 'old',
      type: 'unknown_action',
      actorName: 'Bo',
      subject: 'Fallback',
      createdAt: 1714550000000,
      metadata: { nested: { ok: true } },
    },
    {
      id: 'new',
      type: 'queue_joined',
      actorName: 'Ana, "A"',
      subject: 'Main queue',
      createdAt: 1714554000000,
      metadata: { value: 7 },
    },
  ], t);

  assert.equal(activityExport.filename, 'Audit-Trail_activity.csv');
  assert.match(activityExport.csv, /^Time,Actor,Type,Subject,Message,Metadata\n/);
  assert.match(
    activityExport.csv,
    /2024-05-01T09:00:00.000Z,"Ana, ""A""",queue_joined,Main queue,"Ana, ""A"" joined queue as Main queue","{""value"":7}"/,
  );
  assert.match(
    activityExport.csv,
    /2024-05-01T07:53:20.000Z,Bo,unknown_action,Fallback,Bo updated Fallback,"{""nested"":{""ok"":true}}"/,
  );
  assert.equal(createProjectActivityExport({ title: 'Empty' }, [], t), null);
});

test('dashboard project export builds localized CSV for the current project list', async () => {
  const { createDashboardProjectExport } = await import('../src/lib/exportDomain.js');
  assert.equal(typeof createDashboardProjectExport, 'function', 'dashboard project export helper should be exported');

  const exportData = createDashboardProjectExport([
    {
      id: 'p-2',
      title: 'Ops, "Plan"',
      type: 'vote',
      status: 'stopped',
      creatorName: 'Ana',
      archived: false,
      createdAt: 1714554000000,
    },
    {
      id: 'p-1',
      title: 'Retired Queue',
      type: 'queue',
      status: 'active',
      creatorName: 'Bo',
      archived: true,
      createdAt: 0,
    },
  ], {
    filenamePrefix: 'Collect visible',
  }, t);

  assert.equal(exportData.filename, 'Collect-visible_projects.csv');
  assert.match(exportData.csv, /^Project ID,Title,Type,Status,Creator,Archived,Created At\n/);
  assert.match(exportData.csv, /p-2,"Ops, ""Plan""",Collect,Paused,Ana,,2024-05-01T09:00:00.000Z/);
  assert.match(exportData.csv, /p-1,Retired Queue,Queue,Archived,Bo,Archived,1970-01-01T00:00:00.000Z/);
  assert.equal(createDashboardProjectExport([], { filenamePrefix: 'Empty' }, t), null);
});

test('project detail exposes owner/admin participant export without native dialogs', async () => {
  const detail = await readFile(path.join(root, 'src/pages/ProjectDetail.jsx'), 'utf8');

  assert.match(detail, /Download/, 'Project detail should use the download icon');
  assert.match(detail, /createProjectParticipantExport/, 'Project detail should use the participant export domain');
  assert.match(detail, /handleExportParticipants/, 'Project detail should wire an export click handler');
  assert.match(detail, /hasAdminRights[\s\S]{0,1800}exportParticipants/, 'Export action should live in owner/admin controls');
  assert.match(detail, /showToast\(t\('noExportData'\)/, 'No-data export attempts should use app toast feedback');
  assert.doesNotMatch(detail, /\b(?:alert|prompt)\(/, 'Project detail export should not use native browser dialogs');

  for (const key of [
    'exportAvailability',
    'exportBookedAt',
    'exportBookingStatus',
    'exportClaimCount',
    'exportClaimants',
    'exportFinishedAt',
    'exportGameRoom',
    'exportGameType',
    'exportJoinedAt',
    'exportParticipantId',
    'exportParticipants',
    'exportPlayerCount',
    'exportPlayers',
    'exportQueueOrder',
    'exportRounds',
    'exportScore',
    'exportSlotLabel',
    'exportStatus',
    'exportWaitlistOrder',
    'exportWinner',
    'noExportData',
  ]) {
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }
  assert.match(detail, /getDocs\(query\(collection\(db, 'game_rooms'\), where\('projectId', '==', project\.id\)\)\)/, 'Game hub export should load live game rooms before exporting');
  assert.match(detail, /gameRooms:\s*projectGameRooms/, 'Project detail should pass game rooms into participant export');
  assert.match(detail, /catch \(error\) \{[\s\S]{0,260}showToast\(t\('actionFailed'/, 'Game hub export failures should use app toast feedback');
});

test('dashboard exposes current project list export without native dialogs', async () => {
  const dashboard = await readFile(path.join(root, 'src/pages/Dashboard.jsx'), 'utf8');

  assert.match(dashboard, /Download/, 'Dashboard project export should use the download icon');
  assert.match(dashboard, /createDashboardProjectExport/, 'Dashboard should use the project export domain helper');
  assert.match(dashboard, /handleExportProjects/, 'Dashboard should wire an export click handler');
  assert.match(dashboard, /filteredProjects/, 'Dashboard export should use the current filtered project list');
  assert.match(dashboard, /showToast\(t\('noProjectExportData'\)/, 'Empty dashboard export attempts should use app toast feedback');
  assert.doesNotMatch(dashboard, /\b(?:alert|prompt)\(/, 'Dashboard export should not use native browser dialogs');

  for (const key of [
    'exportProjects',
    'exportProjectArchived',
    'exportProjectCreatedAt',
    'exportProjectCreator',
    'exportProjectId',
    'exportProjectStatus',
    'exportProjectTitle',
    'exportProjectType',
    'noProjectExportData',
  ]) {
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }
});

test('project detail exposes owner/admin activity export from the activity timeline', async () => {
  const detail = await readFile(path.join(root, 'src/pages/ProjectDetail.jsx'), 'utf8');

  assert.match(detail, /createProjectActivityExport/, 'Project detail should use the activity export domain');
  assert.match(detail, /handleExportActivities/, 'Project detail should wire an activity export click handler');
  assert.match(detail, /ActivityTimeline[\s\S]{0,700}onExportActivities/, 'Activity timeline should receive the export action');
  assert.match(detail, /canExportActivities=\{hasAdminRights\}/, 'Activity export should only be exposed to owner/admin users');
  assert.match(detail, /showToast\(t\('noActivityData'\)/, 'No-activity export attempts should use app toast feedback');
  assert.match(detail, /catch \(error\) \{[\s\S]{0,260}showToast\(t\('actionFailed'/, 'Activity export failures should use app toast feedback');
  assert.doesNotMatch(detail, /\b(?:alert|prompt)\(/, 'Activity export should not use native browser dialogs');

  for (const key of [
    'exportActivities',
    'exportActivityActor',
    'exportActivityMessage',
    'exportActivityMetadata',
    'exportActivitySubject',
    'exportActivityTime',
    'exportActivityType',
    'noActivityData',
  ]) {
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }
});
