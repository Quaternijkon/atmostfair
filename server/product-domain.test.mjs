import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { TRANSLATIONS } from '../src/constants/translations.js';
import {
  createBookingPatch,
  createBookingReleasePatch,
  createBookingWaitlistPatch,
  createGameRoomCreateData,
  createUserGameResultHistory,
  createGameRoomInviteUrl,
  getGameRoomInviteId,
  createProjectCascadeDeleteOperations,
  createProjectCreateData,
  createGatherFieldData,
  createProjectInsightSummary,
  createQueueJoinData,
  createQueueResultData,
  createTeamJoinMember,
  createScheduleRecommendationSummary,
  createVoteToggleOperations,
  PROJECT_CASCADE_COLLECTIONS,
} from '../src/lib/projectDomain.js';
import * as projectDomain from '../src/lib/projectDomain.js';

const root = process.cwd();

test('team join guard is idempotent and enforces room capacity', () => {
  const user = { uid: 'u2', displayName: 'Ada' };
  const room = {
    id: 'room-1',
    maxMembers: 2,
    members: [{ uid: 'u1', name: 'Owner', joinedAt: 1 }],
  };

  assert.deepEqual(createTeamJoinMember(room, user, 'Ada Lovelace', 1000), {
    uid: 'u2',
    name: 'Ada Lovelace',
    joinedAt: 1000,
  });

  assert.equal(
    createTeamJoinMember({ ...room, members: [...room.members, { uid: 'u2' }] }, user, 'Ada Lovelace', 1001),
    null,
    'same user should not be added twice',
  );

  assert.equal(
    createTeamJoinMember({ ...room, members: [...room.members, { uid: 'u3' }] }, user, 'Ada Lovelace', 1002),
    null,
    'full room should reject additional members',
  );
});

test('queue join guard creates one participant per project and user', () => {
  const existing = [
    { id: 'p1', projectId: 'project-1', uid: 'u1' },
    { id: 'p2', projectId: 'project-2', uid: 'u2' },
  ];
  const user = { uid: 'u2', displayName: 'Grace' };

  assert.deepEqual(createQueueJoinData(existing, 'project-1', user, 'Grace Hopper', '7', 2000), {
    projectId: 'project-1',
    uid: 'u2',
    name: 'Grace Hopper',
    value: 7,
    joinedAt: 2000,
    queueOrder: null,
  });

  assert.equal(
    createQueueJoinData([...existing, { id: 'p3', projectId: 'project-1', uid: 'u2' }], 'project-1', user, 'Grace Hopper', '7', 2001),
    null,
    'same user should not join the same queue twice',
  );
});

test('queue result data records deterministic order and replayable audit steps', () => {
  const participants = [
    { id: 'p3', projectId: 'project-1', uid: 'u3', name: 'Cy', value: 4, joinedAt: 30 },
    { id: 'p1', projectId: 'project-1', uid: 'u1', name: 'Ana', value: 1, joinedAt: 10 },
    { id: 'p2', projectId: 'project-1', uid: 'u2', name: 'Bo', value: 2, joinedAt: 20 },
  ];

  assert.deepEqual(createQueueResultData(participants, 4000), {
    generatedAt: 4000,
    participantCount: 3,
    updates: [
      { id: 'p2', queueOrder: 1 },
      { id: 'p3', queueOrder: 2 },
      { id: 'p1', queueOrder: 3 },
    ],
    steps: [
      {
        order: 1,
        sum: 7,
        remainingCount: 3,
        selectedIndex: 1,
        participantId: 'p2',
        participantName: 'Bo',
        participantValue: 2,
      },
      {
        order: 2,
        sum: 5,
        remainingCount: 2,
        selectedIndex: 1,
        participantId: 'p3',
        participantName: 'Cy',
        participantValue: 4,
      },
      {
        order: 3,
        sum: 1,
        remainingCount: 1,
        selectedIndex: 0,
        participantId: 'p1',
        participantName: 'Ana',
        participantValue: 1,
      },
    ],
  });

  assert.equal(createQueueResultData([], 4001), null);
  assert.equal(createQueueResultData([{ projectId: 'project-1', uid: 'u1', value: 1 }], 4002), null);
});

test('booking guard refuses already booked or stale slots', () => {
  const user = { uid: 'u2', displayName: 'Lin' };
  const emptySlot = { id: 'slot-1', projectId: 'project-1', bookedBy: null };

  assert.deepEqual(createBookingPatch(emptySlot, user, 'Lin', { phone: '123' }, 3000), {
    bookedBy: 'u2',
    bookerName: 'Lin',
    bookingData: { phone: '123' },
    bookedAt: 3000,
  });

  assert.equal(createBookingPatch({ ...emptySlot, bookedBy: 'u3' }, user, 'Lin', {}, 3001), null);
  assert.equal(createBookingPatch(null, user, 'Lin', {}, 3002), null);
});

test('booking waitlist guard toggles full-slot waitlist entries and blocks invalid users', () => {
  const user = { uid: 'u2', displayName: 'Lin' };
  const fullSlot = {
    id: 'slot-1',
    projectId: 'project-1',
    bookedBy: 'u1',
    waitlist: [{ uid: 'u3', name: 'Grace', bookingData: { phone: '555' }, joinedAt: 3000 }],
  };

  assert.deepEqual(createBookingWaitlistPatch(fullSlot, user, 'Lin', { phone: '123' }, 3001), {
    type: 'add',
    waitlist: [
      { uid: 'u3', name: 'Grace', bookingData: { phone: '555' }, joinedAt: 3000 },
      { uid: 'u2', name: 'Lin', bookingData: { phone: '123' }, joinedAt: 3001 },
    ],
  });

  assert.deepEqual(createBookingWaitlistPatch({
    ...fullSlot,
    waitlist: [
      ...fullSlot.waitlist,
      { uid: 'u2', name: 'Lin', bookingData: { phone: '123' }, joinedAt: 3001 },
    ],
  }, user, 'Lin', { phone: '999' }, 3002), {
    type: 'remove',
    waitlist: fullSlot.waitlist,
  });

  assert.equal(createBookingWaitlistPatch({ ...fullSlot, bookedBy: null }, user, 'Lin', {}, 3003), null);
  assert.equal(createBookingWaitlistPatch(fullSlot, { uid: 'u1', displayName: 'Booked User' }, 'Booked User', {}, 3004), null);
  assert.equal(createBookingWaitlistPatch(null, user, 'Lin', {}, 3005), null);
});

test('booking release patch promotes the first waitlisted participant without dropping the queue', () => {
  const slot = {
    id: 'slot-1',
    projectId: 'project-1',
    bookedBy: 'u1',
    bookerName: 'Booked User',
    bookingData: { phone: '111' },
    bookedAt: 3000,
    waitlist: [
      { uid: 'u2', name: 'Lin', bookingData: { phone: '222' }, joinedAt: 3001 },
      { uid: 'u3', name: 'Grace', bookingData: { phone: '333' }, joinedAt: 3002 },
    ],
  };

  assert.deepEqual(createBookingReleasePatch(slot, 3010), {
    patch: {
      bookedBy: 'u2',
      bookerName: 'Lin',
      bookingData: { phone: '222' },
      bookedAt: 3010,
      waitlist: [{ uid: 'u3', name: 'Grace', bookingData: { phone: '333' }, joinedAt: 3002 }],
    },
    promoted: { uid: 'u2', name: 'Lin', bookingData: { phone: '222' }, joinedAt: 3001 },
  });

  assert.deepEqual(createBookingReleasePatch({ ...slot, waitlist: [] }, 3011), {
    patch: {
      bookedBy: null,
      bookerName: null,
      bookingData: null,
      bookedAt: null,
      waitlist: [],
    },
    promoted: null,
  });

  assert.equal(createBookingReleasePatch(null, 3012), null);
});

test('gather submission guard creates one response per project and user', () => {
  const createGatherSubmissionData = projectDomain.createGatherSubmissionData;
  assert.equal(typeof createGatherSubmissionData, 'function');

  const existing = [
    { id: 's1', projectId: 'project-1', uid: 'u1' },
    { id: 's2', projectId: 'project-2', uid: 'u2' },
  ];
  const user = { uid: 'u2', displayName: 'Katherine' };
  const data = { f1: 'answer' };

  assert.deepEqual(createGatherSubmissionData(existing, 'project-1', user, '  Katherine Johnson  ', data, 3500), {
    projectId: 'project-1',
    uid: 'u2',
    name: 'Katherine Johnson',
    data,
    submittedAt: 3500,
  });

  assert.equal(
    createGatherSubmissionData([...existing, { id: 's3', projectId: 'project-1', uid: 'u2' }], 'project-1', user, 'Katherine Johnson', data, 3501),
    null,
    'same user should not submit the same gather form twice',
  );
});

test('gather field data normalizes supported field types and option lists', () => {
  const user = { uid: 'u2', displayName: 'Katherine' };

  assert.deepEqual(createGatherFieldData('project-1', user, '  RSVP  ', 'option', 'Yes, No, Yes,  ', 3900), {
    projectId: 'project-1',
    label: 'RSVP',
    type: 'option',
    options: ['Yes', 'No'],
    creatorId: 'u2',
    createdAt: 3900,
  });

  assert.deepEqual(createGatherFieldData('project-1', user, 'Budget', 'currency', '', 3901), {
    projectId: 'project-1',
    label: 'Budget',
    type: 'text',
    creatorId: 'u2',
    createdAt: 3901,
  });

  assert.equal(createGatherFieldData('project-1', user, 'Choice', 'option', '  ', 3902), null);
  assert.equal(createGatherFieldData('project-1', user, '  ', 'text', '', 3903), null);
  assert.equal(createGatherFieldData('project-1', user, 'x'.repeat(121), 'text', '', 3904), null);
});

test('gather submission data is normalized against typed field definitions', () => {
  const createGatherSubmissionData = projectDomain.createGatherSubmissionData;
  const user = { uid: 'u2', displayName: 'Katherine' };
  const fields = [
    { id: 'note', label: 'Note', type: 'text' },
    { id: 'count', label: 'Count', type: 'number' },
    { id: 'date', label: 'Date', type: 'date' },
    { id: 'choice', label: 'Choice', type: 'option', options: ['Yes', 'No'] },
    { id: 'badChoice', label: 'Bad Choice', type: 'option', options: ['Yes', 'No'] },
    { id: 'badNumber', label: 'Bad Number', type: 'number' },
    { id: 'badDate', label: 'Bad Date', type: 'date' },
  ];

  assert.deepEqual(
    createGatherSubmissionData([], 'project-1', user, 'Katherine Johnson', {
      note: '  keep this  ',
      count: ' 3.5 ',
      date: '2026-07-05',
      choice: 'Yes',
      badChoice: 'Maybe',
      badNumber: 'abc',
      badDate: '07/05/2026',
      extra: 'drop me',
    }, 3904, fields),
    {
      projectId: 'project-1',
      uid: 'u2',
      name: 'Katherine Johnson',
      data: {
        note: 'keep this',
        count: '3.5',
        date: '2026-07-05',
        choice: 'Yes',
        badChoice: '',
        badNumber: '',
        badDate: '',
      },
      submittedAt: 3904,
    },
  );
});

test('roulette join guard creates one participant per project and user', () => {
  const createRouletteJoinData = projectDomain.createRouletteJoinData;
  assert.equal(typeof createRouletteJoinData, 'function');

  const existing = [
    { id: 'r1', projectId: 'project-1', uid: 'u1' },
    { id: 'r2', projectId: 'project-2', uid: 'u2' },
  ];
  const user = { uid: 'u2', displayName: 'Marie' };

  assert.deepEqual(createRouletteJoinData(existing, 'project-1', user, 'Marie Curie', '9', 3600), {
    projectId: 'project-1',
    uid: 'u2',
    name: 'Marie Curie',
    value: 9,
    joinedAt: 3600,
    isWinner: false,
  });

  assert.equal(
    createRouletteJoinData([...existing, { id: 'r3', projectId: 'project-1', uid: 'u2' }], 'project-1', user, 'Marie Curie', '9', 3601),
    null,
    'same user should not join the same roulette twice',
  );
});

test('roulette result data records deterministic winners and replayable audit steps', () => {
  const createRouletteResultData = projectDomain.createRouletteResultData;
  assert.equal(typeof createRouletteResultData, 'function');

  const participants = [
    { id: 'r3', projectId: 'project-1', uid: 'u3', name: 'Cy', value: 4, joinedAt: 30 },
    { id: 'r1', projectId: 'project-1', uid: 'u1', name: 'Ana', value: 1, joinedAt: 10 },
    { id: 'r2', projectId: 'project-1', uid: 'u2', name: 'Bo', value: 2, joinedAt: 20 },
  ];

  assert.deepEqual(
    createRouletteResultData(participants, {
      mode: 'multi',
      prizes: [{ name: 'Gold', count: 1 }, { name: 'Silver', count: 1 }],
      order: 'fwd',
      allowRepeat: false,
      enableReplay: true,
    }, 4100),
    {
      generatedAt: 4100,
      participantCount: 3,
      seed: 7,
      totalValue: 7,
      configSnapshot: {
        mode: 'multi',
        prizes: [{ name: 'Gold', count: 1 }, { name: 'Silver', count: 1 }],
        order: 'fwd',
        allowRepeat: false,
        enableReplay: true,
      },
      winnerUpdates: [
        { id: 'r2', isWinner: true },
        { id: 'r3', isWinner: true },
      ],
      winners: [
        { id: 'r2', participantId: 'r2', uid: 'u2', name: 'Bo', value: 2, rank: 1, prize: 'Gold' },
        { id: 'r3', participantId: 'r3', uid: 'u3', name: 'Cy', value: 4, rank: 2, prize: 'Silver' },
      ],
      steps: [
        {
          type: 'win',
          step: 1,
          rank: 1,
          sum: 7,
          remainingCount: 3,
          selectedIndex: 1,
          participantId: 'r2',
          participantName: 'Bo',
          participantUid: 'u2',
          participantValue: 2,
          prize: 'Gold',
          repeat: false,
          target: { id: 'r2', uid: 'u2', name: 'Bo', value: 2, joinedAt: 20 },
        },
        {
          type: 'win',
          step: 2,
          rank: 2,
          sum: 5,
          remainingCount: 2,
          selectedIndex: 1,
          participantId: 'r3',
          participantName: 'Cy',
          participantUid: 'u3',
          participantValue: 4,
          prize: 'Silver',
          repeat: false,
          target: { id: 'r3', uid: 'u3', name: 'Cy', value: 4, joinedAt: 30 },
        },
      ],
    },
  );

  assert.equal(createRouletteResultData([], { mode: 'classic' }, 4101), null);
  assert.equal(createRouletteResultData([{ projectId: 'project-1', uid: 'u1', value: 1 }], { mode: 'classic' }, 4102), null);
});

test('RPS room transition persists a reusable match result summary', () => {
  const createRpsNextRoundPatch = projectDomain.createRpsNextRoundPatch;
  const createGameRoomSummary = projectDomain.createGameRoomSummary;
  assert.equal(typeof createRpsNextRoundPatch, 'function');
  assert.equal(typeof createGameRoomSummary, 'function');

  const room = {
    id: 'game-1',
    game: 'rps',
    status: 'showdown',
    currentRound: 3,
    config: { bestOf: 3, timeout: 30 },
    players: [
      { uid: 'u1', name: 'Ana', score: 2, move: 'rock' },
      { uid: 'u2', name: 'Bo', score: 1, move: 'scissors' },
    ],
    history: [
      { round: 1, p1Move: 'rock', p2Move: 'scissors', winnerId: 'u1', timestamp: 1000 },
      { round: 2, p1Move: 'paper', p2Move: 'scissors', winnerId: 'u2', timestamp: 2000 },
      { round: 3, p1Move: 'rock', p2Move: 'scissors', winnerId: 'u1', timestamp: 3000 },
    ],
  };

  const patch = createRpsNextRoundPatch(room, 5000);
  assert.deepEqual(patch, {
    status: 'finished',
    winnerId: 'u1',
    finishedAt: 5000,
    players: [
      { uid: 'u1', name: 'Ana', score: 2, lastMove: 'rock', move: null },
      { uid: 'u2', name: 'Bo', score: 1, lastMove: 'scissors', move: null },
    ],
    resultSummary: {
      game: 'rps',
      status: 'finished',
      winnerId: 'u1',
      winnerName: 'Ana',
      roundsPlayed: 3,
      scoreLine: '2 - 1',
      playerCount: 2,
      lastRound: {
        round: 3,
        p1Move: 'rock',
        p2Move: 'scissors',
        winnerId: 'u1',
        winnerName: 'Ana',
      },
    },
  });

  assert.deepEqual(createGameRoomSummary({ ...room, ...patch }), patch.resultSummary);

  assert.deepEqual(createRpsNextRoundPatch({
    ...room,
    currentRound: 1,
    players: [
      { uid: 'u1', name: 'Ana', score: 1, move: 'rock' },
      { uid: 'u2', name: 'Bo', score: 0, move: 'scissors' },
    ],
    history: [{ round: 1, p1Move: 'rock', p2Move: 'scissors', winnerId: 'u1', timestamp: 1000 }],
  }, 6000), {
    status: 'playing',
    currentRound: 2,
    roundStartTime: 6000,
    players: [
      { uid: 'u1', name: 'Ana', score: 1, lastMove: 'rock', move: null },
      { uid: 'u2', name: 'Bo', score: 0, lastMove: 'scissors', move: null },
    ],
  });
});

test('user game result history summarizes finished rooms for one player', () => {
  assert.equal(typeof createUserGameResultHistory, 'function');

  const history = createUserGameResultHistory([
    {
      id: 'active',
      name: 'Still playing',
      game: 'rps',
      status: 'playing',
      players: [{ uid: 'u1', name: 'Ana', score: 0, move: null }],
      createdAt: 9000,
    },
    {
      id: 'win',
      name: 'Final table',
      game: 'rps',
      status: 'finished',
      winnerId: 'u1',
      finishedAt: 5000,
      players: [
        { uid: 'u1', name: 'Ana', score: 2, move: null },
        { uid: 'u2', name: 'Bo', score: 1, move: null },
      ],
      history: [{ round: 1 }, { round: 2 }, { round: 3 }],
    },
    {
      id: 'loss',
      name: 'Mine sprint',
      game: 'mine',
      status: 'finished',
      winnerId: 'u3',
      finishedAt: 7000,
      players: [
        { uid: 'u1', name: 'Ana', progress: 80, status: 'dead' },
        { uid: 'u3', name: 'Cy', progress: 100, status: 'won' },
      ],
    },
    {
      id: 'draw',
      name: 'All busted',
      game: 'mine',
      status: 'finished',
      winnerId: null,
      finishedAt: 6000,
      players: [
        { uid: 'u1', name: 'Ana', progress: 60, status: 'dead' },
        { uid: 'u4', name: 'Dee', progress: 62, status: 'dead' },
      ],
    },
    {
      id: 'other-user',
      name: 'Hidden for Ana',
      game: 'rps',
      status: 'finished',
      winnerId: 'u2',
      finishedAt: 8000,
      players: [{ uid: 'u2', name: 'Bo', score: 1 }],
    },
  ], 'u1', 2);

  assert.deepEqual(history.stats, {
    total: 3,
    wins: 1,
    losses: 1,
    draws: 1,
  });
  assert.deepEqual(history.recent.map((entry) => [entry.id, entry.result, entry.roomName]), [
    ['loss', 'loss', 'Mine sprint'],
    ['draw', 'draw', 'All busted'],
  ]);
  assert.equal(history.recent[0].scoreLine, '100%');
  assert.equal(history.recent[1].scoreLine, '62%');
  assert.deepEqual(createUserGameResultHistory([], 'u1'), {
    stats: { total: 0, wins: 0, losses: 0, draws: 0 },
    recent: [],
  });
});

test('game room invite URL helpers preserve page state and normalize room ids', () => {
  assert.equal(typeof createGameRoomInviteUrl, 'function');
  assert.equal(typeof getGameRoomInviteId, 'function');

  assert.equal(getGameRoomInviteId('?room= room-1 &tab=finished'), 'room-1');
  assert.equal(getGameRoomInviteId('?room=&tab=finished'), null);
  assert.equal(getGameRoomInviteId('tab=finished'), null);

  assert.equal(
    createGameRoomInviteUrl('https://atmostfair.example/games/project-1?tab=finished#board', ' room-2 '),
    'https://atmostfair.example/games/project-1?tab=finished&room=room-2#board',
  );
  assert.equal(
    createGameRoomInviteUrl('https://atmostfair.example/games/project-1?room=old&tab=finished', 'room-3'),
    'https://atmostfair.example/games/project-1?room=room-3&tab=finished',
  );
  assert.equal(
    createGameRoomInviteUrl('https://atmostfair.example/games/project-1?room=old&tab=finished', ''),
    'https://atmostfair.example/games/project-1?tab=finished',
  );
});

test('minesweeper progress patch completes rooms with reusable result summaries', () => {
  assert.equal(typeof projectDomain.createMineRoomProgressPatch, 'function');

  const room = {
    id: 'mine-1',
    game: 'mine',
    status: 'playing',
    players: [
      { uid: 'u1', name: 'Ana', progress: 40, status: 'playing' },
      { uid: 'u2', name: 'Bo', progress: 80, status: 'playing' },
    ],
  };

  assert.deepEqual(projectDomain.createMineRoomProgressPatch(room, { uid: 'u2' }, 90, 'playing', 5000), {
    players: [
      { uid: 'u1', name: 'Ana', progress: 40, status: 'playing' },
      { uid: 'u2', name: 'Bo', progress: 90, status: 'playing' },
    ],
  });

  assert.deepEqual(projectDomain.createMineRoomProgressPatch(room, { uid: 'u2' }, 100, 'won', 6000), {
    players: [
      { uid: 'u1', name: 'Ana', progress: 40, status: 'playing' },
      { uid: 'u2', name: 'Bo', progress: 100, status: 'won' },
    ],
    status: 'finished',
    winnerId: 'u2',
    finishedAt: 6000,
    resultSummary: {
      game: 'mine',
      status: 'finished',
      winnerId: 'u2',
      winnerName: 'Bo',
      roundsPlayed: 0,
      scoreLine: '100%',
      playerCount: 2,
    },
  });

  assert.deepEqual(projectDomain.createMineRoomProgressPatch({
    ...room,
    players: [
      { uid: 'u1', name: 'Ana', progress: 40, status: 'dead' },
      { uid: 'u2', name: 'Bo', progress: 80, status: 'playing' },
    ],
  }, { uid: 'u2' }, 82, 'dead', 7000), {
    players: [
      { uid: 'u1', name: 'Ana', progress: 40, status: 'dead' },
      { uid: 'u2', name: 'Bo', progress: 82, status: 'dead' },
    ],
    status: 'finished',
    winnerId: null,
    finishedAt: 7000,
    resultSummary: {
      game: 'mine',
      status: 'finished',
      winnerId: null,
      winnerName: '',
      roundsPlayed: 0,
      scoreLine: '82%',
      playerCount: 2,
    },
  });
});

test('game room creation data normalizes setup and rejects invalid room names', () => {
  assert.equal(typeof createGameRoomCreateData, 'function');

  const user = { uid: 'u1', displayName: 'Ada' };
  assert.deepEqual(
    createGameRoomCreateData('project-1', user, '  Finals table  ', 'rps', {
      bestOf: '5',
      timeout: '60',
    }, 7200),
    {
      projectId: 'project-1',
      name: 'Finals table',
      game: 'rps',
      status: 'waiting',
      players: [],
      config: { bestOf: 5, timeout: 60 },
      createdAt: 7200,
      createdBy: 'u1',
    },
  );

  assert.deepEqual(
    createGameRoomCreateData('project-1', user, 'Solo drill', 'rps', {
      bestOf: 99,
      timeout: 7,
      vsComputer: true,
      botName: '  Practice Bot  ',
    }, 7300),
    {
      projectId: 'project-1',
      name: 'Solo drill',
      game: 'rps',
      status: 'playing',
      players: [
        { uid: 'u1', name: 'Ada', score: 0, move: null },
        { uid: 'computer', name: 'Practice Bot', score: 0, move: null },
      ],
      config: { bestOf: 3, timeout: 30 },
      createdAt: 7300,
      createdBy: 'u1',
      currentRound: 1,
      roundStartTime: 7300,
    },
  );

  assert.deepEqual(
    createGameRoomCreateData('project-1', user, 'Minefield', 'mine', {
      difficulty: 'hard',
      rows: 100,
      cols: 100,
      mines: 1000,
      mineLocations: ['1,1', '1,1', ' 2,2 ', '', '3,3'],
    }, 7400),
    {
      projectId: 'project-1',
      name: 'Minefield',
      game: 'mine',
      status: 'playing',
      players: [],
      config: {
        difficulty: 'hard',
        rows: 30,
        cols: 30,
        mines: 899,
        mineLocations: ['1,1', '2,2', '3,3'],
      },
      createdAt: 7400,
      createdBy: 'u1',
    },
  );

  assert.equal(createGameRoomCreateData('project-1', user, '   ', 'rps', {}, 7500), null);
  assert.equal(createGameRoomCreateData('project-1', user, 'x'.repeat(121), 'rps', {}, 7500), null);
  assert.equal(createGameRoomCreateData('   ', user, 'Valid', 'rps', {}, 7500), null);
  assert.equal(createGameRoomCreateData('project-1', user, 'Valid', 'unknown', {}, 7500), null);
});

test('game room join guard is idempotent and enforces capacity', () => {
  assert.equal(typeof projectDomain.createGameRoomJoinPatch, 'function');

  const user = { uid: 'u2', displayName: 'Ada' };
  const rpsRoom = {
    id: 'game-1',
    game: 'rps',
    status: 'waiting',
    config: { bestOf: 3 },
    players: [{ uid: 'u1', name: 'Owner', score: 0, move: null }],
  };

  assert.deepEqual(projectDomain.createGameRoomJoinPatch(rpsRoom, user, 'Ada Lovelace', 9000), {
    players: [
      { uid: 'u1', name: 'Owner', score: 0, move: null },
      { uid: 'u2', name: 'Ada Lovelace', score: 0, move: null },
    ],
    status: 'playing',
    roundStartTime: 9000,
    currentRound: 1,
  });

  assert.equal(
    projectDomain.createGameRoomJoinPatch(
      { ...rpsRoom, players: [...rpsRoom.players, { uid: 'u2', name: 'Ada', score: 0, move: null }] },
      user,
      'Ada Lovelace',
      9001,
    ),
    null,
    'same RPS player should not be added twice',
  );

  assert.equal(
    projectDomain.createGameRoomJoinPatch(
      { ...rpsRoom, players: [...rpsRoom.players, { uid: 'u3', name: 'Grace', score: 0, move: null }] },
      user,
      'Ada Lovelace',
      9002,
    ),
    null,
    'full RPS room should reject additional players',
  );

  const mineRoom = {
    id: 'game-2',
    game: 'mine',
    status: 'playing',
    players: Array.from({ length: 7 }, (_, index) => ({
      uid: `u${index + 1}`,
      name: `Player ${index + 1}`,
      progress: 0,
      status: 'playing',
    })),
  };

  assert.deepEqual(projectDomain.createGameRoomJoinPatch(mineRoom, { uid: 'u8', displayName: 'Lin' }, 'Lin', 9100), {
    players: [
      ...mineRoom.players,
      { uid: 'u8', name: 'Lin', progress: 0, status: 'playing' },
    ],
  });

  assert.equal(
    projectDomain.createGameRoomJoinPatch(
      { ...mineRoom, players: [...mineRoom.players, { uid: 'u8', name: 'Lin', progress: 0, status: 'playing' }] },
      { uid: 'u9', displayName: 'Max' },
      'Max',
      9101,
    ),
    null,
    'full minesweeper room should reject additional players',
  );

  assert.equal(
    projectDomain.createGameRoomJoinPatch({ ...rpsRoom, status: 'finished' }, user, 'Ada Lovelace', 9003),
    null,
    'finished game rooms should reject joins',
  );
});

test('schedule submission guard updates an existing response instead of duplicating it', () => {
  const createScheduleSubmissionWrite = projectDomain.createScheduleSubmissionWrite;
  assert.equal(typeof createScheduleSubmissionWrite, 'function');

  const existing = [
    { id: 'schedule-1', projectId: 'project-1', uid: 'u1' },
    { id: 'schedule-2', projectId: 'project-1', uid: 'u2' },
  ];
  const user = { uid: 'u2', displayName: 'Rosalind' };
  const availability = { '2026-07-06': ['am'] };

  assert.deepEqual(createScheduleSubmissionWrite(existing, 'project-2', user, 'Rosalind Franklin', availability, 3700), {
    type: 'add',
    collection: 'schedule_submissions',
    data: {
      projectId: 'project-2',
      uid: 'u2',
      name: 'Rosalind Franklin',
      availability,
      submittedAt: 3700,
    },
  });

  assert.deepEqual(createScheduleSubmissionWrite(existing, 'project-1', user, 'Rosalind Franklin', availability, 3701), {
    type: 'update',
    collection: 'schedule_submissions',
    id: 'schedule-2',
    data: {
      availability,
      submittedAt: 3701,
    },
  });
});

test('schedule and booking config guards reject invalid date ranges', () => {
  assert.equal(typeof projectDomain.createScheduleConfigData, 'function');
  assert.equal(typeof projectDomain.createBookingConfigData, 'function');

  assert.deepEqual(
    projectDomain.createScheduleConfigData({
      mode: 'date',
      start: '2026-07-05',
      end: '2026-07-07',
      deadline: '2026-07-04T12:30',
    }),
    {
      mode: 'date',
      start: '2026-07-05',
      end: '2026-07-07',
      deadline: '2026-07-04T12:30',
    },
  );
  assert.deepEqual(
    projectDomain.createScheduleConfigData({ mode: 'time', start: '2026-07-05', end: '2026-07-12', deadline: '' }),
    { mode: 'time', start: '2026-07-05', end: '2026-07-12', deadline: '' },
  );
  assert.equal(projectDomain.createScheduleConfigData({ mode: 'date', start: '', end: '2026-07-07' }), null);
  assert.equal(projectDomain.createScheduleConfigData({ mode: 'date', start: '2026-07-08', end: '2026-07-07' }), null);
  assert.equal(projectDomain.createScheduleConfigData({ mode: 'date', start: '2026-02-30', end: '2026-03-01' }), null);
  assert.equal(projectDomain.createScheduleConfigData({ mode: 'date', start: '2026-07-01', end: '2026-08-15' }), null);
  assert.equal(projectDomain.createScheduleConfigData({ mode: 'time', start: '2026-07-05', end: '2026-07-13' }), null);
  assert.equal(projectDomain.createScheduleConfigData({ mode: 'invalid', start: '2026-07-05', end: '2026-07-07' }), null);
  assert.equal(projectDomain.createScheduleConfigData({ mode: 'date', start: '2026-07-05', end: '2026-07-07', deadline: 'bad' }), null);

  assert.deepEqual(
    projectDomain.createBookingConfigData({
      mode: 'half',
      start: '2026-07-05',
      end: '2026-07-06',
      requiredFields: ' Name ， Phone ,, Email ',
    }),
    {
      mode: 'half',
      start: '2026-07-05',
      end: '2026-07-06',
      requiredFields: 'Name, Phone, Email',
    },
  );
  assert.equal(projectDomain.createBookingConfigData({ mode: 'time', start: '2026-07-05', end: '2026-07-06' }), null);
  assert.equal(projectDomain.createBookingConfigData({ mode: 'date', start: '2026-07-08', end: '2026-07-07' }), null);
  assert.equal(projectDomain.createBookingConfigData({ mode: 'date', start: '2026-07-01', end: '2026-08-15' }), null);

  assert.deepEqual(
    projectDomain.createDateRangeDays({ mode: 'date', start: '2026-07-05', end: '2026-07-07' }),
    ['2026-07-05', '2026-07-06', '2026-07-07'],
  );
  assert.deepEqual(
    projectDomain.createDateRangeDays({ mode: 'date', start: '2026-02-30', end: '2026-03-01' }),
    [],
  );
});

test('schedule submission guard sanitizes availability against the active config', () => {
  const user = { uid: 'u2', displayName: 'Rosalind' };

  assert.deepEqual(
    projectDomain.createScheduleSubmissionWrite(
      [],
      'project-1',
      user,
      'Rosalind Franklin',
      ['2026-07-05', '2026-07-08', 'bad-date'],
      3710,
      { mode: 'date', start: '2026-07-05', end: '2026-07-07' },
    ).data.availability,
    ['2026-07-05'],
  );

  assert.deepEqual(
    projectDomain.createScheduleSubmissionWrite(
      [],
      'project-1',
      user,
      'Rosalind Franklin',
      ['2026-07-05_morning', '2026-07-05_late', '2026-07-08_evening'],
      3711,
      { mode: 'half', start: '2026-07-05', end: '2026-07-07' },
    ).data.availability,
    ['2026-07-05_morning'],
  );

  assert.deepEqual(
    projectDomain.createScheduleSubmissionWrite(
      [],
      'project-1',
      user,
      'Rosalind Franklin',
      [
        { id: 'r1', date: '2026-07-05', start: '09:00', end: '10:00' },
        { id: 'r2', date: '2026-07-05', start: '11:00', end: '10:00' },
        { id: 'r3', date: '2026-07-08', start: '09:00', end: '10:00' },
        { id: 'r4', date: 'not-date', start: '09:00', end: '10:00' },
      ],
      3712,
      { mode: 'time', start: '2026-07-05', end: '2026-07-07' },
    ).data.availability,
    [{ id: 'r1', date: '2026-07-05', start: '09:00', end: '10:00' }],
  );
});

test('schedule recommendation summary ranks date availability and filters stale values', () => {
  const config = { mode: 'date', start: '2026-07-05', end: '2026-07-07' };
  const submissions = [
    { uid: 'u1', availability: ['2026-07-05', '2026-07-06'] },
    { uid: 'u2', availability: ['2026-07-05'] },
    { uid: 'u3', availability: ['2026-07-07', 'not-a-date', '2026-07-09'] },
  ];

  assert.deepEqual(createScheduleRecommendationSummary(submissions, config, 3), {
    participantCount: 3,
    recommendations: [
      { key: '2026-07-05', date: '2026-07-05', count: 2, participantCount: 3, coverage: 2 / 3 },
      { key: '2026-07-06', date: '2026-07-06', count: 1, participantCount: 3, coverage: 1 / 3 },
      { key: '2026-07-07', date: '2026-07-07', count: 1, participantCount: 3, coverage: 1 / 3 },
    ],
  });
});

test('schedule recommendation summary supports half-day slots and time buckets', () => {
  const halfConfig = { mode: 'half', start: '2026-07-05', end: '2026-07-06' };
  assert.deepEqual(createScheduleRecommendationSummary([
    { uid: 'u1', availability: ['2026-07-05_morning', '2026-07-05_evening'] },
    { uid: 'u2', availability: ['2026-07-05_morning', '2026-07-06_morning'] },
    { uid: 'u3', availability: ['2026-07-06_late', '2026-07-08_morning'] },
  ], halfConfig, 2), {
    participantCount: 3,
    recommendations: [
      { key: '2026-07-05_morning', date: '2026-07-05', slot: 'morning', count: 2, participantCount: 3, coverage: 2 / 3 },
      { key: '2026-07-05_evening', date: '2026-07-05', slot: 'evening', count: 1, participantCount: 3, coverage: 1 / 3 },
    ],
  });

  const timeConfig = { mode: 'time', start: '2026-07-05', end: '2026-07-05' };
  assert.deepEqual(createScheduleRecommendationSummary([
    { uid: 'u1', availability: [{ date: '2026-07-05', start: '09:00', end: '10:00' }] },
    { uid: 'u2', availability: [{ date: '2026-07-05', start: '09:30', end: '10:30' }] },
    { uid: 'u3', availability: [{ date: '2026-07-06', start: '09:30', end: '10:00' }, { date: '2026-07-05', start: '11:00', end: '10:00' }] },
  ], timeConfig, 2), {
    participantCount: 3,
    recommendations: [
      { key: '2026-07-05_09:30', date: '2026-07-05', start: '09:30', end: '10:00', count: 2, participantCount: 3, coverage: 2 / 3 },
      { key: '2026-07-05_09:00', date: '2026-07-05', start: '09:00', end: '09:30', count: 1, participantCount: 3, coverage: 1 / 3 },
    ],
  });
});

test('claim toggle guard enforces capacity and supports releasing existing claims', () => {
  const createClaimToggleData = projectDomain.createClaimToggleData;
  assert.equal(typeof createClaimToggleData, 'function');

  const user = { uid: 'u2', displayName: 'Dorothy' };
  const openItem = { id: 'claim-1', maxClaims: 2, claimants: [{ uid: 'u1', name: 'Owner', at: 1 }] };
  const fullItem = { id: 'claim-2', maxClaims: 1, claimants: [{ uid: 'u1', name: 'Owner', at: 1 }] };
  const claimedItem = { id: 'claim-3', maxClaims: 1, claimants: [{ uid: 'u2', name: 'Dorothy', at: 2 }] };

  assert.deepEqual(createClaimToggleData(openItem, user, 'Dorothy Vaughan', 3800), {
    type: 'add',
    claimant: { uid: 'u2', name: 'Dorothy Vaughan', at: 3800 },
  });
  assert.equal(createClaimToggleData(fullItem, user, 'Dorothy Vaughan', 3801), null);
  assert.deepEqual(createClaimToggleData(claimedItem, user, 'Dorothy Vaughan', 3802), {
    type: 'remove',
    claimant: { uid: 'u2', name: 'Dorothy', at: 2 },
  });
});

test('vote toggle operations preserve multiple mode and toggle the selected option', () => {
  const user = { uid: 'u2', displayName: 'Dorothy' };
  const items = [
    { id: 'vote-1', projectId: 'project-1', title: 'A', votes: ['u1'] },
    { id: 'vote-2', projectId: 'project-1', title: 'B', votes: ['u2'] },
  ];

  assert.deepEqual(createVoteToggleOperations(items, items[0], user, { mode: 'multiple' }), [
    { type: 'update', collection: 'voting_items', id: 'vote-1', action: 'addVote', uid: 'u2' },
  ]);

  assert.deepEqual(createVoteToggleOperations(items, items[1], user, { mode: 'multiple' }), [
    { type: 'update', collection: 'voting_items', id: 'vote-2', action: 'removeVote', uid: 'u2' },
  ]);

  assert.deepEqual(createVoteToggleOperations(items, items[0], user, undefined), [
    { type: 'update', collection: 'voting_items', id: 'vote-1', action: 'addVote', uid: 'u2' },
  ]);
});

test('single vote mode moves the user vote inside one project only', () => {
  const user = { uid: 'u2', displayName: 'Dorothy' };
  const items = [
    { id: 'vote-1', projectId: 'project-1', title: 'A', votes: ['u1', 'u2'] },
    { id: 'vote-2', projectId: 'project-1', title: 'B', votes: [] },
    { id: 'vote-3', projectId: 'other-project', title: 'C', votes: ['u2'] },
  ];

  assert.deepEqual(createVoteToggleOperations(items, items[1], user, { mode: 'single' }), [
    { type: 'update', collection: 'voting_items', id: 'vote-1', action: 'removeVote', uid: 'u2' },
    { type: 'update', collection: 'voting_items', id: 'vote-2', action: 'addVote', uid: 'u2' },
  ]);

  assert.deepEqual(createVoteToggleOperations(items, items[0], user, { mode: 'single' }), [
    { type: 'update', collection: 'voting_items', id: 'vote-1', action: 'removeVote', uid: 'u2' },
  ]);

  assert.deepEqual(createVoteToggleOperations(items, items[1], { uid: '' }, { mode: 'single' }), []);
});

test('project creation data normalizes valid input and rejects invalid project shells', () => {
  assert.equal(typeof createProjectCreateData, 'function');
  assert.equal(typeof projectDomain.PROJECT_CREATOR_NAME_MAX_LENGTH, 'number');
  assert.equal(typeof projectDomain.PROJECT_PASSWORD_MAX_LENGTH, 'number');

  const user = { uid: 'owner-1', displayName: 'Ada' };
  assert.deepEqual(
    createProjectCreateData('  Weekly Lunch  ', 'vote', user, '  Ada Lovelace  ', '  team only  ', 6000),
    {
      title: 'Weekly Lunch',
      type: 'vote',
      creatorId: 'owner-1',
      creatorName: 'Ada Lovelace',
      password: 'team only',
      status: 'active',
      createdAt: 6000,
      winners: [],
    },
  );

  assert.deepEqual(
    createProjectCreateData('Queue Day', 'queue', { uid: 'owner-2', email: 'grace@example.com' }, '', '', 6001),
    {
      title: 'Queue Day',
      type: 'queue',
      creatorId: 'owner-2',
      creatorName: 'grace',
      password: '',
      status: 'active',
      createdAt: 6001,
      winners: [],
    },
  );

  assert.equal(createProjectCreateData('   ', 'vote', user, 'Ada', '', 6002), null, 'blank titles should not create projects');
  assert.equal(createProjectCreateData('Valid', 'unknown', user, 'Ada', '', 6003), null, 'unknown project types should not create projects');
  assert.equal(createProjectCreateData('Valid', 'vote', { uid: '' }, 'Ada', '', 6004), null, 'missing users should not create projects');
  assert.equal(createProjectCreateData('A'.repeat(121), 'vote', user, 'Ada', '', 6005), null, 'overlong titles should not create projects');
  assert.equal(
    createProjectCreateData('Valid', 'vote', user, 'Ada', 'P'.repeat(projectDomain.PROJECT_PASSWORD_MAX_LENGTH + 1), 6006),
    null,
    'overlong project passwords should not create projects',
  );

  const longCreatorName = 'C'.repeat(projectDomain.PROJECT_CREATOR_NAME_MAX_LENGTH + 8);
  assert.equal(
    createProjectCreateData('Creator Cap', 'vote', user, longCreatorName, '', 6007).creatorName,
    'C'.repeat(projectDomain.PROJECT_CREATOR_NAME_MAX_LENGTH),
    'explicit creator display names should be capped for downstream cards and exports',
  );

  const longFallbackName = 'F'.repeat(projectDomain.PROJECT_CREATOR_NAME_MAX_LENGTH + 8);
  assert.equal(
    createProjectCreateData('Creator Fallback Cap', 'vote', { uid: 'owner-3', displayName: longFallbackName }, '', '', 6008).creatorName,
    'F'.repeat(projectDomain.PROJECT_CREATOR_NAME_MAX_LENGTH),
    'fallback account display names should use the same cap',
  );
});

test('project status toggle guard allows owner and admin but blocks other users', () => {
  const createProjectStatusPatch = projectDomain.createProjectStatusPatch;
  assert.equal(typeof createProjectStatusPatch, 'function');

  const project = { id: 'project-1', creatorId: 'owner-1', status: 'active' };

  assert.deepEqual(createProjectStatusPatch(project, { uid: 'owner-1' }, false), { status: 'stopped' });
  assert.deepEqual(createProjectStatusPatch({ ...project, status: 'stopped' }, { uid: 'admin-1' }, true), { status: 'active' });
  assert.equal(createProjectStatusPatch(project, { uid: 'viewer-1' }, false), null);
  assert.equal(createProjectStatusPatch({ ...project, status: 'finished' }, { uid: 'owner-1' }, false), null);
});

test('project brief patch is permissioned, bounded, and reusable', () => {
  const createProjectBriefPatch = projectDomain.createProjectBriefPatch;
  assert.equal(typeof createProjectBriefPatch, 'function');

  const project = { id: 'project-1', creatorId: 'owner-1', status: 'active' };
  const owner = { uid: 'owner-1', displayName: 'Ada' };
  const admin = { uid: 'admin-1', displayName: 'Grace' };

  assert.deepEqual(createProjectBriefPatch(project, owner, false, '  Bring lunch\nand badges.  ', 7000), {
    brief: 'Bring lunch\nand badges.',
    briefUpdatedAt: 7000,
    briefUpdatedBy: 'owner-1',
    briefUpdatedByName: 'Ada',
  });
  assert.deepEqual(createProjectBriefPatch(project, admin, true, '', 7001), {
    brief: '',
    briefUpdatedAt: 7001,
    briefUpdatedBy: 'admin-1',
    briefUpdatedByName: 'Grace',
  });
  assert.equal(createProjectBriefPatch(project, { uid: 'viewer-1' }, false, 'nope', 7002), null);
  assert.equal(createProjectBriefPatch({ ...project, status: 'stopped' }, owner, false, 'paused', 7003), null);
  assert.equal(createProjectBriefPatch({ ...project, status: 'finished' }, owner, false, 'done', 7004), null);
  assert.equal(createProjectBriefPatch(project, owner, false, 'A'.repeat(501), 7005), null);
});

test('project duplication keeps reusable configuration and resets runtime state', () => {
  const createProjectDuplicateData = projectDomain.createProjectDuplicateData;
  const createProjectDuplicateChildOperations = projectDomain.createProjectDuplicateChildOperations;
  assert.equal(typeof createProjectDuplicateData, 'function');
  assert.equal(typeof createProjectDuplicateChildOperations, 'function');

  const user = { uid: 'owner-2', displayName: 'Ada' };
  const sourceProject = {
    id: 'project-1',
    title: 'Sprint Planning',
    type: 'book',
    creatorId: 'owner-1',
    creatorName: 'Original Owner',
    password: 'team-only',
    status: 'finished',
    createdAt: 100,
    winners: [{ uid: 'winner' }],
    brief: 'Reusable project context',
    briefUpdatedAt: 200,
    briefUpdatedBy: 'owner-1',
    rouletteResult: { winner: 'winner' },
    bookingConfig: { mode: 'date', requiredFields: 'Name' },
    scheduleConfig: { start: '2026-07-05', end: '2026-07-07' },
    votingConfig: { mode: 'single' },
  };

  const duplicate = createProjectDuplicateData(sourceProject, user, 'Ada Lovelace', 5000, ' (Copy)');
  assert.deepEqual(duplicate, {
    title: 'Sprint Planning (Copy)',
    type: 'book',
    creatorId: 'owner-2',
    creatorName: 'Ada Lovelace',
    password: 'team-only',
    status: 'active',
    createdAt: 5000,
    winners: [],
    brief: 'Reusable project context',
    bookingConfig: { mode: 'date', requiredFields: 'Name' },
    scheduleConfig: { start: '2026-07-05', end: '2026-07-07' },
    votingConfig: { mode: 'single' },
  });
  assert.equal(duplicate.rouletteResult, undefined);
  assert.notEqual(duplicate.bookingConfig, sourceProject.bookingConfig);

  const safePrivateSource = {
    ...sourceProject,
    password: undefined,
    hasPassword: true,
  };
  const safePrivateDuplicate = createProjectDuplicateData(safePrivateSource, user, 'Ada Lovelace', 6000, ' (Copy)');
  assert.equal(safePrivateDuplicate.password, '');
  assert.equal(safePrivateDuplicate.duplicateSourceId, sourceProject.id);

  const childOperations = createProjectDuplicateChildOperations(
    'project-copy',
    {
      voting_items: [{ id: 'vote-1', title: 'Option A', votes: ['u1'], creatorName: 'Someone' }],
      gather_fields: [{ id: 'field-1', label: 'Diet', type: 'text', creatorId: 'owner-1' }],
      booking_slots: [{ id: 'slot-1', start: '2026-07-06', end: '2026-07-06', label: 'Monday', bookedBy: 'u1' }],
      claim_items: [{ id: 'claim-1', title: 'Bring snacks', maxClaims: 2, claimants: [{ uid: 'u1' }] }],
      rooms: [{ id: 'room-1', name: 'Team Blue', maxMembers: 4, members: [{ uid: 'u1' }] }],
    },
    user,
    'Ada Lovelace',
    5100,
  );

  assert.deepEqual(childOperations, [
    {
      type: 'add',
      collection: 'voting_items',
      data: { projectId: 'project-copy', title: 'Option A', creatorId: 'owner-2', creatorName: 'Ada Lovelace', votes: [], createdAt: 5100 },
    },
    {
      type: 'add',
      collection: 'rooms',
      data: { projectId: 'project-copy', name: 'Team Blue', ownerId: 'owner-2', maxMembers: 4, members: [], createdAt: 5100 },
    },
    {
      type: 'add',
      collection: 'gather_fields',
      data: { projectId: 'project-copy', label: 'Diet', type: 'text', creatorId: 'owner-2', createdAt: 5100 },
    },
    {
      type: 'add',
      collection: 'booking_slots',
      data: { projectId: 'project-copy', start: '2026-07-06', end: '2026-07-06', label: 'Monday', bookedBy: null, waitlist: [], createdAt: 5100 },
    },
    {
      type: 'add',
      collection: 'claim_items',
      data: { projectId: 'project-copy', title: 'Bring snacks', maxClaims: 2, claimants: [], creatorId: 'owner-2', creatorName: 'Ada Lovelace', createdAt: 5100 },
    },
  ]);
});

test('project duplication rolls back the new project when copied child writes fail', async () => {
  const commitProjectDuplicateWithRollback = projectDomain.commitProjectDuplicateWithRollback;
  assert.equal(typeof commitProjectDuplicateWithRollback, 'function');

  const addCalls = [];
  const deletedRefs = [];
  let copiedIntoProjectId = null;
  const childFailure = new Error('child copy failed');
  const db = {};
  const collection = (_db, name) => ({ collection: name });
  const addDoc = async (collectionRef, data) => {
    addCalls.push({ collection: collectionRef.collection, data });
    if (collectionRef.collection === 'projects') {
      return { collection: 'projects', id: 'project-copy' };
    }
    if (data.title === 'Broken child') throw childFailure;
    return { collection: collectionRef.collection, id: `${collectionRef.collection}-copy` };
  };
  const deleteDoc = async (ref) => {
    deletedRefs.push(`${ref.collection}/${ref.id}`);
  };

  await assert.rejects(
    () => commitProjectDuplicateWithRollback({
      db,
      collection,
      addDoc,
      deleteDoc,
      projectData: { title: 'Source Copy', type: 'vote' },
      createChildOperations: (projectRef) => {
        copiedIntoProjectId = projectRef.id;
        return [
          { type: 'add', collection: 'voting_items', data: { title: 'Copied child' } },
          { type: 'add', collection: 'rooms', data: { title: 'Broken child' } },
        ];
      },
    }),
    childFailure,
  );

  assert.equal(copiedIntoProjectId, 'project-copy');
  assert.deepEqual(
    addCalls.map((call) => call.collection),
    ['projects', 'voting_items', 'rooms'],
  );
  assert.deepEqual(deletedRefs, ['voting_items/voting_items-copy', 'projects/project-copy']);
});

test('quick-start templates generate initialized project configuration and child records', () => {
  const createProjectTemplateSeedData = projectDomain.createProjectTemplateSeedData;
  assert.equal(typeof createProjectTemplateSeedData, 'function');

  const createdAt = Date.UTC(2026, 6, 7);
  const user = { uid: 'owner-1', displayName: 'Ada' };
  const t = (key) => TRANSLATIONS.en[key] || key;

  assert.deepEqual(
    createProjectTemplateSeedData('team-lunch-vote', 'vote', 'project-1', user, 'Ada Lovelace', createdAt, t),
    {
      projectPatch: { votingConfig: { mode: 'single' } },
      childOperations: [
        {
          type: 'add',
          collection: 'voting_items',
          data: {
            projectId: 'project-1',
            title: 'Vegetarian bowls',
            creatorId: 'owner-1',
            creatorName: 'Ada Lovelace',
            votes: [],
            createdAt,
          },
        },
        {
          type: 'add',
          collection: 'voting_items',
          data: {
            projectId: 'project-1',
            title: 'Noodles',
            creatorId: 'owner-1',
            creatorName: 'Ada Lovelace',
            votes: [],
            createdAt,
          },
        },
        {
          type: 'add',
          collection: 'voting_items',
          data: {
            projectId: 'project-1',
            title: 'Rice bowls',
            creatorId: 'owner-1',
            creatorName: 'Ada Lovelace',
            votes: [],
            createdAt,
          },
        },
      ],
    },
  );

  const gatherSeed = createProjectTemplateSeedData('feedback-pulse', 'gather', 'project-1', user, 'Ada Lovelace', createdAt, t);
  assert.deepEqual(gatherSeed.projectPatch, {});
  assert.deepEqual(gatherSeed.childOperations, [
    {
      type: 'add',
      collection: 'gather_fields',
      data: {
        projectId: 'project-1',
        label: 'Mood',
        type: 'option',
        options: ['Good', 'Mixed', 'Blocked'],
        creatorId: 'owner-1',
        createdAt,
      },
    },
    {
      type: 'add',
      collection: 'gather_fields',
      data: {
        projectId: 'project-1',
        label: 'What worked',
        type: 'text',
        creatorId: 'owner-1',
        createdAt,
      },
    },
    {
      type: 'add',
      collection: 'gather_fields',
      data: {
        projectId: 'project-1',
        label: 'Blockers',
        type: 'text',
        creatorId: 'owner-1',
        createdAt,
      },
    },
  ]);

  assert.deepEqual(
    createProjectTemplateSeedData('meeting-time-finder', 'schedule', 'project-1', user, 'Ada Lovelace', createdAt, t),
    {
      projectPatch: {
        scheduleConfig: { mode: 'date', start: '2026-07-07', end: '2026-07-10', deadline: '' },
      },
      childOperations: [],
    },
  );

  assert.deepEqual(
    createProjectTemplateSeedData('office-hours-booking', 'book', 'project-1', user, 'Ada Lovelace', createdAt, t),
    {
      projectPatch: {
        bookingConfig: { mode: 'half', start: '2026-07-07', end: '2026-07-08', requiredFields: 'Name, Team, Topic' },
      },
      childOperations: [
        {
          type: 'add',
          collection: 'booking_slots',
          data: {
            projectId: 'project-1',
            start: '2026-07-07_Morning',
            end: '2026-07-07_Morning',
            label: 'Morning',
            bookedBy: null,
            waitlist: [],
            createdAt,
          },
        },
        {
          type: 'add',
          collection: 'booking_slots',
          data: {
            projectId: 'project-1',
            start: '2026-07-07_Afternoon',
            end: '2026-07-07_Afternoon',
            label: 'Afternoon',
            bookedBy: null,
            waitlist: [],
            createdAt,
          },
        },
      ],
    },
  );

  assert.deepEqual(
    createProjectTemplateSeedData('hackathon-teams', 'team', 'project-1', user, 'Ada Lovelace', createdAt, t).childOperations,
    [
      {
        type: 'add',
        collection: 'rooms',
        data: { projectId: 'project-1', name: 'Frontend', ownerId: 'owner-1', maxMembers: 4, members: [], createdAt },
      },
      {
        type: 'add',
        collection: 'rooms',
        data: { projectId: 'project-1', name: 'Backend', ownerId: 'owner-1', maxMembers: 4, members: [], createdAt },
      },
      {
        type: 'add',
        collection: 'rooms',
        data: { projectId: 'project-1', name: 'Design', ownerId: 'owner-1', maxMembers: 4, members: [], createdAt },
      },
    ],
  );

  assert.deepEqual(
    createProjectTemplateSeedData('task-claim-board', 'claim', 'project-1', user, 'Ada Lovelace', createdAt, t).childOperations,
    [
      {
        type: 'add',
        collection: 'claim_items',
        data: {
          projectId: 'project-1',
          title: 'Venue',
          maxClaims: 1,
          claimants: [],
          creatorId: 'owner-1',
          creatorName: 'Ada Lovelace',
          createdAt,
        },
      },
      {
        type: 'add',
        collection: 'claim_items',
        data: {
          projectId: 'project-1',
          title: 'Food',
          maxClaims: 1,
          claimants: [],
          creatorId: 'owner-1',
          creatorName: 'Ada Lovelace',
          createdAt,
        },
      },
      {
        type: 'add',
        collection: 'claim_items',
        data: {
          projectId: 'project-1',
          title: 'Notes',
          maxClaims: 1,
          claimants: [],
          creatorId: 'owner-1',
          creatorName: 'Ada Lovelace',
          createdAt,
        },
      },
    ],
  );

  assert.deepEqual(
    createProjectTemplateSeedData('game-night', 'game_hub', 'project-1', user, 'Ada Lovelace', createdAt, t).childOperations,
    [
      {
        type: 'add',
        collection: 'game_rooms',
        data: createGameRoomCreateData('project-1', user, 'Rock-paper-scissors table', 'rps', { bestOf: 3, timeout: 30 }, createdAt),
      },
    ],
  );

  assert.deepEqual(
    createProjectTemplateSeedData('team-lunch-vote', 'gather', 'project-1', user, 'Ada Lovelace', createdAt, t),
    { projectPatch: {}, childOperations: [] },
    'Template/type mismatches should not seed unrelated project types',
  );
});

test('project creation rollback removes seeded children and the parent project', async () => {
  const commitProjectCreateWithRollback = projectDomain.commitProjectCreateWithRollback;
  assert.equal(typeof commitProjectCreateWithRollback, 'function');

  const addCalls = [];
  const deletedRefs = [];
  const childFailure = new Error('seed write failed');
  const db = {};
  const collection = (_db, name) => ({ collection: name });
  const addDoc = async (collectionRef, data) => {
    addCalls.push({ collection: collectionRef.collection, data });
    if (collectionRef.collection === 'projects') {
      return { collection: 'projects', id: 'project-new' };
    }
    if (data.title === 'Broken seed') throw childFailure;
    return { collection: collectionRef.collection, id: `${collectionRef.collection}-new` };
  };
  const deleteDoc = async (ref) => {
    deletedRefs.push(`${ref.collection}/${ref.id}`);
  };

  await assert.rejects(
    () => commitProjectCreateWithRollback({
      db,
      collection,
      addDoc,
      deleteDoc,
      projectData: { title: 'Seeded project', type: 'vote' },
      createChildOperations: (projectRef) => [
        { type: 'add', collection: 'voting_items', data: { projectId: projectRef.id, title: 'Created seed' } },
        { type: 'add', collection: 'voting_items', data: { projectId: projectRef.id, title: 'Broken seed' } },
      ],
    }),
    childFailure,
  );

  assert.deepEqual(
    addCalls.map((call) => call.collection),
    ['projects', 'voting_items', 'voting_items'],
  );
  assert.deepEqual(deletedRefs, ['voting_items/voting_items-new', 'projects/project-new']);
});

test('project cascade deletion covers every project-owned collection', () => {
  const docsByCollection = {
    projects: [{ id: 'project-1' }],
    voting_items: [{ id: 'vote-1', projectId: 'project-1' }, { id: 'vote-2', projectId: 'other' }],
    rooms: [{ id: 'room-1', projectId: 'project-1' }],
    roulette_participants: [{ id: 'roulette-1', projectId: 'project-1' }],
    queue_participants: [{ id: 'queue-1', projectId: 'project-1' }],
    gather_fields: [{ id: 'field-1', projectId: 'project-1' }],
    gather_submissions: [{ id: 'submission-1', projectId: 'project-1' }],
    schedule_submissions: [{ id: 'schedule-1', projectId: 'project-1' }],
    booking_slots: [{ id: 'booking-1', projectId: 'project-1' }],
    claim_items: [{ id: 'claim-1', projectId: 'project-1' }],
    project_chats: [{ id: 'chat-1', projectId: 'project-1' }],
    game_rooms: [{ id: 'game-1', projectId: 'project-1' }],
    notifications: [{ id: 'notice-1', projectId: 'project-1' }, { id: 'notice-2' }],
    project_activities: [{ id: 'activity-1', projectId: 'project-1' }, { id: 'activity-2', projectId: 'other' }],
  };

  const operations = createProjectCascadeDeleteOperations('project-1', docsByCollection);

  assert.deepEqual(
    operations.map((operation) => `${operation.collection}/${operation.id}`).sort(),
    [
      'booking_slots/booking-1',
      'claim_items/claim-1',
      'game_rooms/game-1',
      'gather_fields/field-1',
      'gather_submissions/submission-1',
      'notifications/notice-1',
      'project_activities/activity-1',
      'project_chats/chat-1',
      'projects/project-1',
      'queue_participants/queue-1',
      'rooms/room-1',
      'roulette_participants/roulette-1',
      'schedule_submissions/schedule-1',
      'voting_items/vote-1',
    ].sort(),
  );
  assert.equal(PROJECT_CASCADE_COLLECTIONS.some((collection) => collection.name === 'game_rooms'), true);
  assert.equal(PROJECT_CASCADE_COLLECTIONS.some((collection) => collection.name === 'project_activities'), true);
});

test('project orphan cleanup covers every project-owned child collection', () => {
  assert.equal(typeof projectDomain.createProjectOrphanCleanupPlan, 'function');

  const docsByCollection = {
    projects: [{ id: 'project-1' }],
    voting_items: [{ id: 'vote-1', projectId: 'missing' }, { id: 'vote-2', projectId: 'project-1' }],
    rooms: [{ id: 'room-1', projectId: 'missing' }],
    roulette_participants: [{ id: 'roulette-1', projectId: 'missing' }],
    queue_participants: [{ id: 'queue-1', projectId: 'missing' }],
    gather_fields: [{ id: 'field-1', projectId: 'missing' }],
    gather_submissions: [{ id: 'submission-1', projectId: 'missing' }],
    schedule_submissions: [{ id: 'schedule-1', projectId: 'missing' }],
    booking_slots: [{ id: 'booking-1', projectId: 'missing' }],
    claim_items: [{ id: 'claim-1', projectId: 'missing' }],
    project_chats: [{ id: 'chat-1', projectId: 'missing' }],
    game_rooms: [{ id: 'game-1', projectId: 'missing' }],
    notifications: [{ id: 'notice-1', projectId: 'missing' }, { id: 'notice-2' }],
    project_activities: [{ id: 'activity-1', projectId: 'missing' }],
  };

  const plan = projectDomain.createProjectOrphanCleanupPlan(docsByCollection.projects, docsByCollection);

  assert.deepEqual(
    plan.operations.map((operation) => `${operation.collection}/${operation.id}`).sort(),
    [
      'booking_slots/booking-1',
      'claim_items/claim-1',
      'game_rooms/game-1',
      'gather_fields/field-1',
      'gather_submissions/submission-1',
      'notifications/notice-1',
      'notifications/notice-2',
      'project_activities/activity-1',
      'project_chats/chat-1',
      'queue_participants/queue-1',
      'rooms/room-1',
      'roulette_participants/roulette-1',
      'schedule_submissions/schedule-1',
      'voting_items/vote-1',
    ].sort(),
  );
  assert.deepEqual(
    PROJECT_CASCADE_COLLECTIONS
      .filter((collection) => collection.name !== 'projects')
      .map((collection) => collection.name)
      .sort(),
    Object.keys(plan.collections).sort(),
  );
});

test('app action handlers use domain guards for high-risk writes', async () => {
  const app = await readFile(path.join(root, 'src/App.jsx'), 'utf8');
  const admin = await readFile(path.join(root, 'src/components/AdminDashboard.jsx'), 'utf8');

  for (const helper of [
    'createTeamJoinMember',
    'createQueueJoinData',
    'createQueueResultData',
    'createBookingPatch',
    'createBookingWaitlistPatch',
    'createBookingReleasePatch',
    'createGatherFieldData',
    'createGatherSubmissionData',
    'createRouletteJoinData',
    'createRouletteResultData',
    'createScheduleSubmissionWrite',
    'createScheduleConfigData',
    'createBookingConfigData',
    'createVoteToggleOperations',
    'createClaimToggleData',
    'createProjectStatusPatch',
    'createProjectCreateData',
    'createProjectDuplicateData',
    'createProjectDuplicateChildOperations',
    'commitProjectDuplicateWithRollback',
    'createProjectCascadeDeleteOperations',
    'PROJECT_CASCADE_COLLECTIONS',
  ]) {
    assert.match(app, new RegExp(helper), `App should use ${helper}`);
  }

  assert.match(app, /loadProjectCascadeDocs/, 'Project deletion should load project-owned docs before deleting');
  assert.doesNotMatch(app, /handleDeleteProject:\s*async\s*\(projectId\)\s*=>\s*\{\s*await deleteDoc\(doc\(db,\s*'projects'/, 'Project deletion should not delete only the project shell');
  assert.match(app, /onDeleteProject=\{actions\.handleDeleteProject\}/, 'Admin project deletion should receive the shared cascade delete action');
  assert.match(admin, /onDeleteProject/, 'AdminDashboard should accept the shared cascade delete action');
  assert.match(admin, /await onDeleteProject\(project\.id\);/, 'Admin project deletion should call the shared cascade delete action');
  assert.doesNotMatch(admin, /deleteDoc\(doc\(db,\s*'projects',\s*project\.id\)\)/, 'Admin project deletion should not delete only the project shell');
  assert.match(admin, /createProjectOrphanCleanupPlan/, 'Admin orphan cleanup should use the shared project-owned collection plan');
  assert.doesNotMatch(admin, /deleteDoc\(doc\(db,\s*'voting_items'/, 'Admin orphan cleanup should not hardcode a partial project-owned collection list');
  assert.match(admin, /setRemoteProjectDocs\(\(current\) =>/, 'Admin orphan cleanup should refresh one-shot remote orphan counts after deletion');
  assert.match(app, /createVoteToggleOperations\([^)]*items/, 'Vote handling should derive writes from all project voting items');
  assert.match(app, /createQueueResultData/, 'Queue generation should derive result and audit steps through the domain helper');
  assert.match(app, /queueResult/, 'Queue generation should persist replayable result data on the project');
  assert.match(app, /createRouletteResultData/, 'Roulette drawing should derive result and audit steps through the domain helper');
  assert.match(app, /rouletteResult:\s*rouletteResult/, 'Roulette drawing should persist replayable result data on the project');
  assert.match(app, /voteOperations\.forEach[\s\S]{0,500}batch\.update/, 'Vote handling should commit helper operations through a batch');
  assert.match(app, /commitProjectDuplicateWithRollback\(/, 'Project duplication should roll back the new project if child copies fail');
  assert.doesNotMatch(app, /Promise\.all\([\s\S]{0,240}childOperations[\s\S]{0,240}addDoc/, 'Project duplication should not leave partial copies through concurrent child writes');
  assert.match(app, /const LOCKED_PROJECT_STATUSES = new Set\(\['stopped', 'finished'\]\);/, 'App should define locked project statuses once');
  assert.match(app, /const isProjectWritable = \(projectId\) => \{[\s\S]{0,260}!project\.archived[\s\S]{0,160}!LOCKED_PROJECT_STATUSES\.has\(project\.status\)/, 'App should expose a shared archived/stopped/finished write guard');
  assert.match(app, /const requireProjectWritable = \(projectId, showToast\) => \{[\s\S]{0,260}isProjectWritable\(projectId\)/, 'App should route user-triggered write guards through a shared feedback helper');
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
    assert.match(app, new RegExp(`${action}: async[\\s\\S]{0,280}requireProjectWritable\\(projectId, showToast\\)`), `${action} should reject stopped or finished projects before writing`);
  }
  for (const [action, collection, projectExpression] of [
    ['handleDeleteItem', 'items', 'item\\.projectId'],
    ['handleVote', 'items', 'item\\.projectId'],
    ['handleJoinRoom', 'rooms', 'room\\.projectId'],
    ['handleKickMember', 'rooms', 'room\\.projectId'],
    ['handleDeleteRoom', 'rooms', 'room\\.projectId'],
    ['handleDeleteGatherField', 'gatherFields', 'field\\.projectId'],
    ['handleDeleteBookingSlot', 'bookingSlots', 'slot\\.projectId'],
    ['handleBookSlot', 'bookingSlots', 'slot\\.projectId'],
    ['handleToggleBookingWaitlist', 'bookingSlots', 'slot\\.projectId'],
    ['handleKickUser', 'bookingSlots', 'slot\\.projectId'],
    ['handleDeleteClaimItem', 'claimItems', 'item\\.projectId'],
    ['handleToggleClaim', 'claimItems', 'item\\.projectId'],
  ]) {
    assert.match(
      app,
      new RegExp(`${action}: async[\\s\\S]{0,320}${collection}\\.find[\\s\\S]{0,320}requireProjectWritable\\(${projectExpression}, showToast\\)`),
      `${action} should resolve the child document project and reject stopped or finished projects before writing`,
    );
  }
  assert.match(app, /const projectFields = gatherFields\.filter/, 'Gather submissions should load project field definitions before writing');
  assert.match(app, /createGatherSubmissionData\([\s\S]{0,500}projectFields/, 'Gather submissions should validate against field definitions before writing');
  assert.match(app, /handleToggleBookingWaitlist/, 'Booking should expose a waitlist action for full slots');
  assert.match(app, /createBookingWaitlistPatch/, 'Booking waitlist writes should go through the domain guard');
  assert.match(app, /createBookingReleasePatch/, 'Booking release should promote waitlisted users through the domain guard');
});

test('project detail exposes localized project duplication', async () => {
  const detail = await readFile(path.join(root, 'src/pages/ProjectDetail.jsx'), 'utf8');

  assert.match(detail, /handleDuplicateProject/, 'Project detail should expose a duplicate project action');
  for (const key of ['duplicateProject', 'duplicateProjectConfirm', 'duplicate', 'copySuffix']) {
    assert.match(detail, new RegExp(`t\\('${key}'\\)`), `Project detail should localize ${key}`);
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }
});

test('project detail exposes an owner-editable project brief', async () => {
  const detail = await readFile(path.join(root, 'src/pages/ProjectDetail.jsx'), 'utf8');
  const app = await readFile(path.join(root, 'src/App.jsx'), 'utf8');

  assert.match(detail, /ProjectBriefCard/, 'Project detail should render a reusable project brief card');
  assert.match(detail, /project\.brief/, 'Project brief should read from the project document');
  assert.match(detail, /canEditBrief/, 'Project brief editing should be derived from owner/admin and writable state');
  assert.match(detail, /canEditBrief = hasAdminRights && !isArchived && !isStopped && !isFinished/, 'Archived project briefs should stay read-only until restored');
  assert.match(detail, /!isArchived && !isFinished && \(/, 'Archived projects should hide pause/resume write controls until restored');
  assert.match(detail, /isSavingBrief/, 'Project brief saves should expose async submit feedback');
  assert.match(detail, /disabled=\{briefTooLong \|\| isSavingBrief\}/, 'Project brief save should prevent duplicate submissions while saving');
  assert.match(detail, /actions\.handleUpdateProjectBrief/, 'Project brief saves should route through app actions');
  assert.match(app, /createProjectBriefPatch/, 'App should use the domain helper before writing project brief data');
  assert.match(app, /handleUpdateProjectBrief/, 'App should expose a project brief update action');
  assert.match(app, /updateDoc\(doc\(db,\s*'projects',\s*project\.id\),\s*patch\)/, 'Project brief should update the owning project document');

  for (const key of [
    'projectBrief',
    'projectBriefEmpty',
    'editBrief',
    'saveBrief',
    'briefTooLong',
    'briefUpdated',
  ]) {
    assert.ok(TRANSLATIONS.en[key], `missing English translation ${key}`);
    assert.ok(TRANSLATIONS.zh[key], `missing Chinese translation ${key}`);
  }
});

test('project insight summary scopes metrics and guides next actions', () => {
  const voteProject = { id: 'vote-1', type: 'vote', status: 'active' };
  const voteSummary = createProjectInsightSummary(voteProject, {
    votingItems: [
      { id: 'v1', projectId: 'vote-1', votes: ['u1', 'u2'] },
      { id: 'v2', projectId: 'vote-1', votes: ['u3'] },
      { id: 'v3', projectId: 'other', votes: ['leak'] },
    ],
    projectActivities: [
      { id: 'a1', projectId: 'vote-1' },
      { id: 'a2', projectId: 'other' },
    ],
  });

  assert.equal(voteSummary.statusKey, 'activeStatus');
  assert.equal(voteSummary.nextActionKey, 'insightReviewProgress');
  assert.deepEqual(voteSummary.metrics, [
    { key: 'items', labelKey: 'insightItems', value: 2 },
    { key: 'votes', labelKey: 'insightVotes', value: 3 },
    { key: 'activity', labelKey: 'insightActivity', value: 1 },
  ]);

  const scheduleSummary = createProjectInsightSummary(
    { id: 'schedule-1', type: 'schedule', status: 'active' },
    {
      scheduleSubmissions: [
        { id: 's1', projectId: 'schedule-1' },
        { id: 's2', projectId: 'other' },
      ],
    },
  );

  assert.equal(scheduleSummary.nextActionKey, 'insightFinishSetup');
  assert.deepEqual(scheduleSummary.metrics, [
    { key: 'responses', labelKey: 'insightResponses', value: 1 },
  ]);

  const bookingSummary = createProjectInsightSummary(
    { id: 'book-1', type: 'book', status: 'active', bookingConfig: { mode: 'date' } },
    {
      bookingSlots: [
        { id: 'b1', projectId: 'book-1', bookedBy: 'u1', waitlist: [{ uid: 'u2' }, { uid: 'u3' }] },
        { id: 'b2', projectId: 'book-1', bookedBy: null, waitlist: [] },
        { id: 'b3', projectId: 'other', bookedBy: 'leak', waitlist: [{ uid: 'leak' }] },
      ],
    },
  );

  assert.equal(bookingSummary.nextActionKey, 'insightReviewProgress');
  assert.deepEqual(bookingSummary.metrics, [
    { key: 'slots', labelKey: 'insightSlots', value: 2 },
    { key: 'booked', labelKey: 'insightBooked', value: 1 },
    { key: 'waitlist', labelKey: 'insightWaitlist', value: 2 },
  ]);

  assert.equal(
    createProjectInsightSummary({ id: 'archived-1', type: 'queue', archived: true }, {}).nextActionKey,
    'insightRestoreToEdit',
  );
});
