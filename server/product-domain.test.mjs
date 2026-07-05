import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { TRANSLATIONS } from '../src/constants/translations.js';
import {
  createBookingPatch,
  createProjectCascadeDeleteOperations,
  createGatherFieldData,
  createQueueJoinData,
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

test('project status toggle guard allows owner and admin but blocks other users', () => {
  const createProjectStatusPatch = projectDomain.createProjectStatusPatch;
  assert.equal(typeof createProjectStatusPatch, 'function');

  const project = { id: 'project-1', creatorId: 'owner-1', status: 'active' };

  assert.deepEqual(createProjectStatusPatch(project, { uid: 'owner-1' }, false), { status: 'stopped' });
  assert.deepEqual(createProjectStatusPatch({ ...project, status: 'stopped' }, { uid: 'admin-1' }, true), { status: 'active' });
  assert.equal(createProjectStatusPatch(project, { uid: 'viewer-1' }, false), null);
  assert.equal(createProjectStatusPatch({ ...project, status: 'finished' }, { uid: 'owner-1' }, false), null);
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
    bookingConfig: { mode: 'date', requiredFields: 'Name' },
    scheduleConfig: { start: '2026-07-05', end: '2026-07-07' },
    votingConfig: { mode: 'single' },
  });
  assert.equal(duplicate.rouletteResult, undefined);
  assert.notEqual(duplicate.bookingConfig, sourceProject.bookingConfig);

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
      data: { projectId: 'project-copy', start: '2026-07-06', end: '2026-07-06', label: 'Monday', bookedBy: null, createdAt: 5100 },
    },
    {
      type: 'add',
      collection: 'claim_items',
      data: { projectId: 'project-copy', title: 'Bring snacks', maxClaims: 2, claimants: [], creatorId: 'owner-2', creatorName: 'Ada Lovelace', createdAt: 5100 },
    },
  ]);
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

test('app action handlers use domain guards for high-risk writes', async () => {
  const app = await readFile(path.join(root, 'src/App.jsx'), 'utf8');

  for (const helper of [
    'createTeamJoinMember',
    'createQueueJoinData',
    'createBookingPatch',
    'createGatherFieldData',
    'createGatherSubmissionData',
    'createRouletteJoinData',
    'createScheduleSubmissionWrite',
    'createVoteToggleOperations',
    'createClaimToggleData',
    'createProjectStatusPatch',
    'createProjectDuplicateData',
    'createProjectDuplicateChildOperations',
    'createProjectCascadeDeleteOperations',
    'PROJECT_CASCADE_COLLECTIONS',
  ]) {
    assert.match(app, new RegExp(helper), `App should use ${helper}`);
  }

  assert.match(app, /loadProjectCascadeDocs/, 'Project deletion should load project-owned docs before deleting');
  assert.doesNotMatch(app, /handleDeleteProject:\s*async\s*\(projectId\)\s*=>\s*\{\s*await deleteDoc\(doc\(db,\s*'projects'/, 'Project deletion should not delete only the project shell');
  assert.match(app, /createVoteToggleOperations\([^)]*items/, 'Vote handling should derive writes from all project voting items');
  assert.match(app, /voteOperations\.forEach[\s\S]{0,500}batch\.update/, 'Vote handling should commit helper operations through a batch');
  assert.match(app, /const projectFields = gatherFields\.filter/, 'Gather submissions should load project field definitions before writing');
  assert.match(app, /createGatherSubmissionData\([\s\S]{0,500}projectFields/, 'Gather submissions should validate against field definitions before writing');
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
