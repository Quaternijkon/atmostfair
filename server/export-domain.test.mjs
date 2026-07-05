import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
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
  exportFile: 'export',
  exportFinishedAt: 'Finished At',
  exportGameRoom: 'Room',
  exportGameType: 'Game',
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
        players: [{ uid: 'u3', name: 'Cy', progress: 42, status: 'playing' }],
        createdAt: 1714550000000,
      },
      {
        id: 'game-1',
        name: 'Final RPS',
        game: 'rps',
        status: 'finished',
        winnerId: 'u1',
        finishedAt: 1714554000000,
        players: [
          { uid: 'u1', name: 'Ana', score: 2 },
          { uid: 'u2', name: 'Bo', score: 1 },
        ],
        history: [{ round: 1 }, { round: 2 }, { round: 3 }],
        createdAt: 1714540000000,
      },
    ],
  }, t);
  assert.equal(gameExport.filename, 'Game-Night_game_results.csv');
  assert.match(gameExport.csv, /^Room,Game,Status,Winner,Score,Players,Rounds,Finished At,Player List\n/);
  assert.match(gameExport.csv, /Final RPS,Rock Paper Scissors,Finished,Ana,2 - 1,2,3,2024-05-01T09:00:00.000Z,Ana \(2\); Bo \(1\)/);
  assert.match(gameExport.csv, /Mine room,Minesweeper,Playing,,42%,1,0,,Cy \(42%\)/);
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
