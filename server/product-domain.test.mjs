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
  createParticipantValueDistribution,
  createProjectInsightSummary,
  createQueueJoinData,
  createQueueResultData,
  createTeamJoinMember,
  createTeamMemberRemovalData,
  createVotingResultSummary,
  normalizeParticipantValueInput,
  normalizeTeamRoomCapacityInput,
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

test('team room capacity input normalizes empty and bounded numeric values', () => {
  assert.equal(typeof normalizeTeamRoomCapacityInput, 'function');

  assert.equal(normalizeTeamRoomCapacityInput(''), 4);
  assert.equal(normalizeTeamRoomCapacityInput('0'), 1);
  assert.equal(normalizeTeamRoomCapacityInput('-4'), 1);
  assert.equal(normalizeTeamRoomCapacityInput('12'), 12);
  assert.equal(normalizeTeamRoomCapacityInput('100'), 99);

  const user = { uid: 'u100', displayName: 'Ada' };
  const manyMembers = Array.from({ length: 99 }, (_, index) => ({ uid: `u${index}`, name: `User ${index}` }));
  assert.equal(
    createTeamJoinMember({ id: 'huge', maxMembers: 1000, members: manyMembers }, user, 'Ada', 2000),
    null,
    'legacy oversized rooms should still cap at the product maximum',
  );
  assert.deepEqual(
    createTeamJoinMember({ id: 'negative', maxMembers: -5, members: [] }, user, 'Ada', 2001),
    { uid: 'u100', name: 'Ada', joinedAt: 2001 },
    'legacy negative capacity should normalize to one joinable slot',
  );
});

test('team join guard normalizes dirty membership before capacity checks', () => {
  const user = { uid: 'u2', displayName: 'Ada' };

  assert.deepEqual(
    createTeamJoinMember({
      id: 'dirty-team',
      maxMembers: 2,
      members: [
        { uid: 'u1', name: 'Grace', joinedAt: 1000 },
        { uid: ' u1 ', name: 'Duplicate Grace', joinedAt: 1001 },
        { uid: ' ', name: 'Blank', joinedAt: 1002 },
      ],
    }, user, 'Ada Lovelace', 2002),
    { uid: 'u2', name: 'Ada Lovelace', joinedAt: 2002 },
  );

  assert.equal(
    createTeamJoinMember({
      id: 'dirty-duplicate-team',
      maxMembers: 3,
      members: [{ uid: ' u2 ', name: 'Existing Ada', joinedAt: 1000 }],
    }, user, 'Ada Lovelace', 2003),
    null,
  );
});

test('team room membership summary normalizes dirty members before display checks', () => {
  assert.equal(typeof projectDomain.createTeamRoomMembershipSummary, 'function');

  const summary = projectDomain.createTeamRoomMembershipSummary({
    id: 'dirty-team-display',
    maxMembers: 2,
    members: [
      { uid: 'u1', name: 'Grace', joinedAt: 1000 },
      { uid: ' u1 ', name: 'Duplicate Grace', joinedAt: 1001 },
      { uid: ' ', name: 'Blank', joinedAt: 1002 },
    ],
  }, { uid: 'u2', displayName: 'Ada' });

  assert.equal(summary.capacity, 2);
  assert.equal(summary.memberCount, 1);
  assert.equal(summary.isMember, false);
  assert.equal(summary.canJoin, true);
  assert.deepEqual(summary.members, [{ uid: 'u1', name: 'Grace', joinedAt: 1000 }]);
  assert.equal(summary.currentMember, null);

  const existingMemberSummary = projectDomain.createTeamRoomMembershipSummary({
    id: 'dirty-current-member',
    maxMembers: 4,
    members: [{ uid: ' u2 ', name: 'Ada', joinedAt: 2000 }],
  }, { uid: 'u2', displayName: 'Ada' });

  assert.equal(existingMemberSummary.isMember, true);
  assert.equal(existingMemberSummary.canJoin, false);
  assert.deepEqual(existingMemberSummary.currentMember, { uid: 'u2', name: 'Ada', joinedAt: 2000 });
});

test('team member removal guard matches stored members by normalized uid', () => {
  assert.equal(typeof createTeamMemberRemovalData, 'function');

  const room = {
    id: 'dirty-removal-team',
    ownerId: 'owner-1',
    maxMembers: 4,
    members: [
      { uid: ' u2 ', name: 'Ada', joinedAt: 2000 },
      { uid: 'u3', name: 'Grace', joinedAt: 2001 },
    ],
  };

  assert.deepEqual(
    createTeamMemberRemovalData(room, { uid: 'u2', displayName: 'Ada' }, { uid: 'u2' }),
    { uid: ' u2 ', name: 'Ada', joinedAt: 2000 },
    'self-removal should return the stored member object so arrayRemove can remove legacy dirty data',
  );
  assert.deepEqual(
    createTeamMemberRemovalData(room, { uid: 'owner-1', displayName: 'Owner' }, { uid: ' u3 ' }, true),
    { uid: 'u3', name: 'Grace', joinedAt: 2001 },
    'managed removal should match the target by normalized uid',
  );
  assert.equal(
    createTeamMemberRemovalData(room, { uid: 'u4', displayName: 'Lin' }, { uid: 'u3' }, false),
    null,
    'non-manager users should not remove other members',
  );
  assert.equal(
    createTeamMemberRemovalData(room, { uid: 'u2', displayName: 'Ada' }, { uid: 'missing' }, true),
    null,
    'missing target members should not produce a removal object',
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

test('queue participant state normalizes dirty identities before join and display checks', () => {
  const user = { uid: 'u2', displayName: 'Grace' };
  const dirtyParticipants = [
    { id: 'blank', projectId: 'project-1', uid: ' ', name: 'Blank', value: 100, joinedAt: 5 },
    { id: 'p1', projectId: 'project-1', uid: ' u1 ', name: 'Ada', value: 20, joinedAt: 10 },
    { id: 'p2-old', projectId: 'project-1', uid: ' u2 ', name: 'Old Grace', value: 80, joinedAt: 20 },
    { id: 'p2-new', projectId: 'project-1', uid: 'u2', name: 'Duplicate Grace', value: 10, joinedAt: 30 },
  ];

  assert.equal(
    createQueueJoinData(dirtyParticipants, 'project-1', user, 'Grace Hopper', '7', 2002),
    null,
    'dirty stored uid should still block duplicate queue joins',
  );

  assert.deepEqual(createQueueJoinData([], 'project-1', { uid: ' u3 ', displayName: 'Lin' }, 'Lin', '8', 2003), {
    projectId: 'project-1',
    uid: 'u3',
    name: 'Lin',
    value: 8,
    joinedAt: 2003,
    queueOrder: null,
  });

  assert.equal(typeof projectDomain.createQueueParticipantSummary, 'function');
  assert.deepEqual(projectDomain.createQueueParticipantSummary(dirtyParticipants, user), {
    participantCount: 2,
    currentParticipant: {
      id: 'p2-old',
      projectId: 'project-1',
      uid: 'u2',
      name: 'Old Grace',
      value: 80,
      joinedAt: 20,
      isCurrentUser: true,
      queueOrder: null,
    },
    participants: [
      {
        id: 'p1',
        projectId: 'project-1',
        uid: 'u1',
        name: 'Ada',
        value: 20,
        joinedAt: 10,
        isCurrentUser: false,
        queueOrder: null,
      },
      {
        id: 'p2-old',
        projectId: 'project-1',
        uid: 'u2',
        name: 'Old Grace',
        value: 80,
        joinedAt: 20,
        isCurrentUser: true,
        queueOrder: null,
      },
    ],
  });
});

test('participant value input normalizes queue and roulette weights', () => {
  assert.equal(typeof normalizeParticipantValueInput, 'function');

  assert.equal(normalizeParticipantValueInput(''), 0);
  assert.equal(normalizeParticipantValueInput('abc'), 0);
  assert.equal(normalizeParticipantValueInput('-5'), 0);
  assert.equal(normalizeParticipantValueInput('0'), 0);
  assert.equal(normalizeParticipantValueInput('42'), 42);
  assert.equal(normalizeParticipantValueInput('100'), 100);
  assert.equal(normalizeParticipantValueInput('250'), 100);

  const queueUser = { uid: 'queue-user', displayName: 'Grace' };
  assert.equal(
    createQueueJoinData([], 'project-weights', queueUser, 'Grace Hopper', '250', 2100).value,
    100,
    'queue join data should cap pasted or forged weights',
  );

  const rouletteUser = { uid: 'roulette-user', displayName: 'Marie' };
  assert.equal(
    projectDomain.createRouletteJoinData([], 'project-weights', rouletteUser, 'Marie Curie', '-10', 2101).value,
    0,
    'roulette join data should floor negative weights',
  );
});

test('participant value distribution buckets normalized roulette values', () => {
  assert.equal(typeof createParticipantValueDistribution, 'function');

  assert.deepEqual(createParticipantValueDistribution([
    { id: 'p1', uid: 'u1', value: -10 },
    { id: 'p2', uid: 'u2', value: 20 },
    { id: 'p3', uid: 'u3', value: 21 },
    { id: 'p4', uid: 'u4', value: 60 },
    { id: 'p5', uid: 'u5', value: 100 },
    { value: 50 },
    null,
  ]), {
    participantCount: 5,
    maxCount: 2,
    buckets: [
      { key: '0-20', min: 0, max: 20, count: 2, percent: 0.4 },
      { key: '21-40', min: 21, max: 40, count: 1, percent: 0.2 },
      { key: '41-60', min: 41, max: 60, count: 1, percent: 0.2 },
      { key: '61-80', min: 61, max: 80, count: 0, percent: 0 },
      { key: '81-100', min: 81, max: 100, count: 1, percent: 0.2 },
    ],
  });

  assert.deepEqual(createParticipantValueDistribution([]), {
    participantCount: 0,
    maxCount: 0,
    buckets: [
      { key: '0-20', min: 0, max: 20, count: 0, percent: 0 },
      { key: '21-40', min: 21, max: 40, count: 0, percent: 0 },
      { key: '41-60', min: 41, max: 60, count: 0, percent: 0 },
      { key: '61-80', min: 61, max: 80, count: 0, percent: 0 },
      { key: '81-100', min: 81, max: 100, count: 0, percent: 0 },
    ],
  });
});

test('participant value distribution ignores invalid and duplicate identities', () => {
  assert.deepEqual(createParticipantValueDistribution([
    { id: 'blank', uid: ' ', value: 100 },
    { id: 'p1', uid: ' u1 ', value: 20, joinedAt: 10 },
    { id: 'p2-old', uid: ' u2 ', value: 80, joinedAt: 20 },
    { id: 'p2-new', uid: 'u2', value: 10, joinedAt: 30 },
  ]), {
    participantCount: 2,
    maxCount: 1,
    buckets: [
      { key: '0-20', min: 0, max: 20, count: 1, percent: 1 / 2 },
      { key: '21-40', min: 21, max: 40, count: 0, percent: 0 },
      { key: '41-60', min: 41, max: 60, count: 0, percent: 0 },
      { key: '61-80', min: 61, max: 80, count: 1, percent: 1 / 2 },
      { key: '81-100', min: 81, max: 100, count: 0, percent: 0 },
    ],
  });
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

test('queue result data ignores invalid and duplicate participant identities', () => {
  const dirtyParticipants = [
    { id: 'blank', uid: ' ', name: 'Blank', value: 100, joinedAt: 5 },
    { id: 'p1', uid: ' u1 ', name: 'Ada', value: 20, joinedAt: 10 },
    { id: 'p2-old', uid: ' u2 ', name: 'Old Grace', value: 80, joinedAt: 20 },
    { id: 'p2-new', uid: 'u2', name: 'Duplicate Grace', value: 10, joinedAt: 30 },
  ];

  assert.deepEqual(createQueueResultData(dirtyParticipants, 2102), {
    generatedAt: 2102,
    participantCount: 2,
    updates: [
      { id: 'p1', queueOrder: 1 },
      { id: 'p2-old', queueOrder: 2 },
    ],
    steps: [
      {
        order: 1,
        sum: 100,
        remainingCount: 2,
        selectedIndex: 0,
        participantId: 'p1',
        participantName: 'Ada',
        participantValue: 20,
      },
      {
        order: 2,
        sum: 80,
        remainingCount: 1,
        selectedIndex: 0,
        participantId: 'p2-old',
        participantName: 'Old Grace',
        participantValue: 80,
      },
    ],
  });
});

test('queue and roulette results normalize legacy participant weights before selection', () => {
  const participants = [
    { id: 'p1', projectId: 'project-1', uid: 'u1', name: 'Zeroed', value: -5, joinedAt: 10 },
    { id: 'p2', projectId: 'project-1', uid: 'u2', name: 'Capped', value: 250, joinedAt: 20 },
    { id: 'p3', projectId: 'project-1', uid: 'u3', name: 'Needle', value: 1, joinedAt: 30 },
  ];

  assert.deepEqual(createQueueResultData(participants, 4200), {
    generatedAt: 4200,
    participantCount: 3,
    updates: [
      { id: 'p3', queueOrder: 1 },
      { id: 'p1', queueOrder: 2 },
      { id: 'p2', queueOrder: 3 },
    ],
    steps: [
      {
        order: 1,
        sum: 101,
        remainingCount: 3,
        selectedIndex: 2,
        participantId: 'p3',
        participantName: 'Needle',
        participantValue: 1,
      },
      {
        order: 2,
        sum: 100,
        remainingCount: 2,
        selectedIndex: 0,
        participantId: 'p1',
        participantName: 'Zeroed',
        participantValue: 0,
      },
      {
        order: 3,
        sum: 100,
        remainingCount: 1,
        selectedIndex: 0,
        participantId: 'p2',
        participantName: 'Capped',
        participantValue: 100,
      },
    ],
  });

  assert.deepEqual(
    projectDomain.createRouletteResultData(participants, { mode: 'classic' }, 4201).winners,
    [
      { id: 'p3', participantId: 'p3', uid: 'u3', name: 'Needle', value: 1, rank: 1 },
    ],
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

test('booking waitlist guard normalizes dirty waitlist entries before toggles and release', () => {
  const user = { uid: 'u2', displayName: 'Lin' };
  const dirtySlot = {
    id: 'dirty-slot',
    projectId: 'project-1',
    bookedBy: 'u1',
    waitlist: [
      { uid: ' u2 ', name: 'Legacy Lin', bookingData: { phone: '222' }, joinedAt: 3000 },
      { uid: ' ', name: 'Blank', bookingData: { phone: '000' }, joinedAt: 3001 },
      { uid: 'u2', name: 'Duplicate Lin', bookingData: { phone: '999' }, joinedAt: 3002 },
      { uid: 'u3', name: 'Grace', bookingData: null, joinedAt: 3003 },
    ],
  };

  assert.deepEqual(createBookingWaitlistPatch(dirtySlot, user, 'Lin', { phone: '123' }, 3004), {
    type: 'remove',
    waitlist: [{ uid: 'u3', name: 'Grace', bookingData: {}, joinedAt: 3003 }],
  });

  assert.deepEqual(createBookingReleasePatch(dirtySlot, 3005), {
    patch: {
      bookedBy: 'u2',
      bookerName: 'Legacy Lin',
      bookingData: { phone: '222' },
      bookedAt: 3005,
      waitlist: [{ uid: 'u3', name: 'Grace', bookingData: {}, joinedAt: 3003 }],
    },
    promoted: { uid: 'u2', name: 'Legacy Lin', bookingData: { phone: '222' }, joinedAt: 3000 },
  });
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

test('booking runtime helpers normalize malformed booking data consistently', () => {
  assert.equal(typeof projectDomain.normalizeBookingDataInput, 'function');

  const user = { uid: 'u2', displayName: 'Lin' };
  const emptySlot = { id: 'slot-1', projectId: 'project-1', bookedBy: null };
  assert.deepEqual(createBookingPatch(emptySlot, user, 'Lin', ['legacy'], 3020), {
    bookedBy: 'u2',
    bookerName: 'Lin',
    bookingData: {},
    bookedAt: 3020,
  });

  const fullSlot = {
    id: 'slot-2',
    projectId: 'project-1',
    bookedBy: 'u1',
    waitlist: [{ uid: 'u3', name: 'Grace', bookingData: null, joinedAt: 3021 }],
  };
  assert.deepEqual(createBookingWaitlistPatch(fullSlot, user, 'Lin', 'legacy', 3022), {
    type: 'add',
    waitlist: [
      { uid: 'u3', name: 'Grace', bookingData: {}, joinedAt: 3021 },
      { uid: 'u2', name: 'Lin', bookingData: {}, joinedAt: 3022 },
    ],
  });

  const release = createBookingReleasePatch({
    ...fullSlot,
    bookedBy: 'u0',
    waitlist: [
      { uid: 'u2', name: 'Lin', bookingData: ['legacy'], joinedAt: 3022 },
      { uid: 'u3', name: 'Grace', bookingData: null, joinedAt: 3023 },
    ],
  }, 3024);
  assert.deepEqual(release, {
    patch: {
      bookedBy: 'u2',
      bookerName: 'Lin',
      bookingData: {},
      bookedAt: 3024,
      waitlist: [{ uid: 'u3', name: 'Grace', bookingData: {}, joinedAt: 3023 }],
    },
    promoted: { uid: 'u2', name: 'Lin', bookingData: {}, joinedAt: 3022 },
  });
});

test('booking slot metadata guard normalizes configured slots and rejects stale grid escapes', () => {
  assert.equal(typeof projectDomain.createBookingSlotData, 'function');

  const dateConfig = {
    mode: 'date',
    start: '2026-07-05',
    end: '2026-07-07',
    requiredFields: 'Phone',
  };
  assert.deepEqual(
    projectDomain.createBookingSlotData(
      'project-1',
      ' 2026-07-06 ',
      '2026-07-06',
      '  Office hour  ',
      3030,
      dateConfig,
    ),
    {
      projectId: 'project-1',
      start: '2026-07-06',
      end: '2026-07-06',
      label: 'Office hour',
      bookedBy: null,
      bookerName: null,
      bookingData: null,
      bookedAt: null,
      waitlist: [],
      createdAt: 3030,
    },
  );

  const halfConfig = {
    mode: 'half',
    start: '2026-07-05',
    end: '2026-07-06',
    requiredFields: '',
  };
  assert.deepEqual(
    projectDomain.createBookingSlotData(
      'project-1',
      '2026-07-05_Morning',
      ' 2026-07-05_Morning ',
      ' Morning ',
      3031,
      halfConfig,
    ),
    {
      projectId: 'project-1',
      start: '2026-07-05_Morning',
      end: '2026-07-05_Morning',
      label: 'Morning',
      bookedBy: null,
      bookerName: null,
      bookingData: null,
      bookedAt: null,
      waitlist: [],
      createdAt: 3031,
    },
  );

  assert.equal(
    projectDomain.createBookingSlotData('project-1', '2026-07-08', '2026-07-08', 'Late', 3032, dateConfig),
    null,
  );
  assert.equal(
    projectDomain.createBookingSlotData('project-1', '2026-07-05_Night', '2026-07-05_Night', 'Night', 3033, halfConfig),
    null,
  );
  assert.equal(
    projectDomain.createBookingSlotData('project-1', '2026-02-30', '2026-02-30', 'Ghost', 3034, dateConfig),
    null,
  );
  assert.equal(
    projectDomain.createBookingSlotData('', '2026-07-06', '2026-07-06', 'Office hour', 3035, dateConfig),
    null,
  );
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

test('gather submission guard matches existing responses by normalized uid', () => {
  const createGatherSubmissionData = projectDomain.createGatherSubmissionData;
  const user = { uid: ' u2 ', displayName: 'Katherine' };
  const fields = [{ id: 'note', label: 'Note', type: 'text' }];

  assert.equal(
    createGatherSubmissionData(
      [{ id: 'dirty-u2', projectId: 'project-1', uid: 'u2', data: { note: 'old' }, submittedAt: 3500 }],
      'project-1',
      user,
      'Katherine Johnson',
      { note: 'new' },
      3501,
      fields,
    ),
    null,
    'same user should not duplicate a gather response when either uid has whitespace',
  );

  assert.deepEqual(
    createGatherSubmissionData([], 'project-1', user, 'Katherine Johnson', { note: '  keep  ' }, 3502, fields),
    {
      projectId: 'project-1',
      uid: 'u2',
      name: 'Katherine Johnson',
      data: { note: 'keep' },
      submittedAt: 3502,
    },
    'new gather submissions should persist the normalized uid',
  );
});

test('gather submission summary ignores invalid uid values and uses one response per participant', () => {
  const fields = [
    { id: 'note', label: 'Note', type: 'text' },
    { id: 'count', label: 'Count', type: 'number' },
  ];
  const submissions = [
    { id: 'blank', projectId: 'project-1', uid: ' ', name: 'Blank', data: { note: 'skip', count: '9' }, submittedAt: 40 },
    { id: 'old-u2', projectId: 'project-1', uid: ' u2 ', name: 'Old Katherine', data: { note: 'old', count: 'bad' }, submittedAt: 41 },
    { id: 'u1', projectId: 'project-1', uid: 'u1', name: 'Ada', data: { note: ' keep ', count: '3' }, submittedAt: 42 },
    { id: 'new-u2', projectId: 'project-1', uid: 'u2', name: 'Katherine', data: { note: 'new', count: '5' }, submittedAt: 43 },
  ];

  assert.equal(typeof projectDomain.createGatherSubmissionSummary, 'function');
  const submissionSummary = projectDomain.createGatherSubmissionSummary(submissions, { uid: ' u2 ' }, fields);

  assert.equal(submissionSummary.submissionCount, 2);
  assert.deepEqual(
    submissionSummary.submissions.map((submission) => submission.uid).sort(),
    ['u1', 'u2'],
  );
  assert.deepEqual(submissionSummary.mySubmission, {
    id: 'new-u2',
    projectId: 'project-1',
    uid: 'u2',
    name: 'Katherine',
    data: { note: 'new', count: '5' },
    submittedAt: 43,
    isCurrentUser: true,
  });
  assert.deepEqual(
    submissionSummary.submissions.find((submission) => submission.uid === 'u1'),
    {
      id: 'u1',
      projectId: 'project-1',
      uid: 'u1',
      name: 'Ada',
      data: { note: 'keep', count: '3' },
      submittedAt: 42,
      isCurrentUser: false,
    },
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

test('roulette participant state normalizes dirty identities before join and display checks', () => {
  const user = { uid: 'u2', displayName: 'Marie' };
  const dirtyParticipants = [
    { id: 'blank', projectId: 'project-1', uid: ' ', name: 'Blank', value: 100, joinedAt: 5 },
    { id: 'r1', projectId: 'project-1', uid: ' u1 ', name: 'Ada', value: 20, joinedAt: 10 },
    { id: 'r2-old', projectId: 'project-1', uid: ' u2 ', name: 'Old Marie', value: 80, joinedAt: 20 },
    { id: 'r2-new', projectId: 'project-1', uid: 'u2', name: 'Duplicate Marie', value: 10, joinedAt: 30 },
  ];

  assert.equal(
    projectDomain.createRouletteJoinData(dirtyParticipants, 'project-1', user, 'Marie Curie', '9', 3602),
    null,
    'dirty stored uid should still block duplicate roulette joins',
  );

  assert.deepEqual(projectDomain.createRouletteJoinData([], 'project-1', { uid: ' u3 ', displayName: 'Lin' }, 'Lin', '8', 3603), {
    projectId: 'project-1',
    uid: 'u3',
    name: 'Lin',
    value: 8,
    joinedAt: 3603,
    isWinner: false,
  });

  assert.equal(typeof projectDomain.createRouletteParticipantSummary, 'function');
  assert.deepEqual(projectDomain.createRouletteParticipantSummary(dirtyParticipants, user, { creatorId: ' u1 ' }), {
    participantCount: 2,
    currentParticipant: {
      id: 'r2-old',
      projectId: 'project-1',
      uid: 'u2',
      name: 'Old Marie',
      value: 80,
      joinedAt: 20,
      isWinner: false,
      isCurrentUser: true,
      isProjectCreator: false,
    },
    participants: [
      {
        id: 'r1',
        projectId: 'project-1',
        uid: 'u1',
        name: 'Ada',
        value: 20,
        joinedAt: 10,
        isWinner: false,
        isCurrentUser: false,
        isProjectCreator: true,
      },
      {
        id: 'r2-old',
        projectId: 'project-1',
        uid: 'u2',
        name: 'Old Marie',
        value: 80,
        joinedAt: 20,
        isWinner: false,
        isCurrentUser: true,
        isProjectCreator: false,
      },
    ],
  });
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

test('roulette result data ignores invalid and duplicate participant identities', () => {
  const dirtyParticipants = [
    { id: 'blank', uid: ' ', name: 'Blank', value: 100, joinedAt: 5 },
    { id: 'r1', uid: ' u1 ', name: 'Ada', value: 20, joinedAt: 10 },
    { id: 'r2-old', uid: ' u2 ', name: 'Old Marie', value: 80, joinedAt: 20 },
    { id: 'r2-new', uid: 'u2', name: 'Duplicate Marie', value: 10, joinedAt: 30 },
  ];

  assert.deepEqual(projectDomain.createRouletteResultData(dirtyParticipants, { mode: 'classic' }, 3604), {
    generatedAt: 3604,
    participantCount: 2,
    seed: 100,
    totalValue: 100,
    configSnapshot: { mode: 'classic' },
    winnerUpdates: [{ id: 'r1', isWinner: true }],
    winners: [
      { id: 'r1', participantId: 'r1', uid: 'u1', name: 'Ada', value: 20, rank: 1 },
    ],
    steps: [
      {
        type: 'win',
        step: 1,
        rank: 1,
        sum: 100,
        remainingCount: 2,
        selectedIndex: 0,
        participantId: 'r1',
        participantName: 'Ada',
        participantUid: 'u1',
        participantValue: 20,
        repeat: false,
        target: { id: 'r1', uid: 'u1', name: 'Ada', value: 20, joinedAt: 10 },
      },
    ],
  });
});

test('roulette prize count input normalizes empty and bounded numeric values', () => {
  const normalizeRoulettePrizeCountInput = projectDomain.normalizeRoulettePrizeCountInput;
  const normalizeRouletteSurvivorCountInput = projectDomain.normalizeRouletteSurvivorCountInput;
  const normalizeRouletteReplaySpeedInput = projectDomain.normalizeRouletteReplaySpeedInput;
  const normalizeRouletteConfigInput = projectDomain.normalizeRouletteConfigInput;
  assert.equal(typeof normalizeRoulettePrizeCountInput, 'function');
  assert.equal(typeof normalizeRouletteSurvivorCountInput, 'function');
  assert.equal(typeof normalizeRouletteReplaySpeedInput, 'function');
  assert.equal(typeof normalizeRouletteConfigInput, 'function');

  assert.equal(normalizeRoulettePrizeCountInput(''), 0);
  assert.equal(normalizeRoulettePrizeCountInput('  '), 0);
  assert.equal(normalizeRoulettePrizeCountInput('abc'), 0);
  assert.equal(normalizeRoulettePrizeCountInput('-3'), 0);
  assert.equal(normalizeRoulettePrizeCountInput('0'), 0);
  assert.equal(normalizeRoulettePrizeCountInput('7'), 7);
  assert.equal(normalizeRoulettePrizeCountInput('99'), 99);
  assert.equal(normalizeRoulettePrizeCountInput('100'), 99);

  assert.equal(normalizeRouletteSurvivorCountInput(''), 1);
  assert.equal(normalizeRouletteSurvivorCountInput('0'), 1);
  assert.equal(normalizeRouletteSurvivorCountInput('-4'), 1);
  assert.equal(normalizeRouletteSurvivorCountInput('12'), 12);
  assert.equal(normalizeRouletteSurvivorCountInput('100'), 99);

  assert.equal(normalizeRouletteReplaySpeedInput(''), 2);
  assert.equal(normalizeRouletteReplaySpeedInput('0'), 0.1);
  assert.equal(normalizeRouletteReplaySpeedInput('0.05'), 0.1);
  assert.equal(normalizeRouletteReplaySpeedInput('2.5'), 2.5);
  assert.equal(normalizeRouletteReplaySpeedInput('9'), 5);

  assert.deepEqual(
    normalizeRouletteConfigInput({
      mode: 'unknown',
      order: 'sideways',
      prizes: [
        { name: 'Gold', count: '' },
        { name: 'Silver', count: '3' },
        { name: 'Overflow', count: 120 },
      ],
      survivorCount: '',
      replaySpeed: '9',
      allowRepeat: 'true',
      enableReplay: 'false',
      creatorWeightPublic: 1,
    }),
    {
      mode: 'classic',
      order: 'fwd',
      prizes: [
        { name: 'Gold', count: 0 },
        { name: 'Silver', count: 3 },
        { name: 'Overflow', count: 99 },
      ],
      survivorCount: 1,
      replaySpeed: 5,
      allowRepeat: false,
      enableReplay: false,
      creatorWeightPublic: false,
    },
  );
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

test('RPS room transition normalizes legacy match config before deciding winners', () => {
  const createRpsNextRoundPatch = projectDomain.createRpsNextRoundPatch;
  assert.equal(typeof createRpsNextRoundPatch, 'function');

  const legacyRoom = {
    id: 'game-legacy-best-of',
    game: 'rps',
    status: 'showdown',
    currentRound: 3,
    config: { bestOf: 999, timeout: 7 },
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

  const patch = createRpsNextRoundPatch(legacyRoom, 8000);
  assert.equal(patch.status, 'finished');
  assert.equal(patch.winnerId, 'u1');
  assert.equal(patch.resultSummary.scoreLine, '2 - 1');
});

test('RPS room transition normalizes legacy current round before continuing', () => {
  const createRpsNextRoundPatch = projectDomain.createRpsNextRoundPatch;
  assert.equal(typeof createRpsNextRoundPatch, 'function');

  const patch = createRpsNextRoundPatch({
    id: 'game-legacy-round',
    game: 'rps',
    status: 'showdown',
    currentRound: -4,
    config: { bestOf: 3, timeout: 30 },
    players: [
      { uid: 'u1', name: 'Ana', score: 0, move: 'rock' },
      { uid: 'u2', name: 'Bo', score: 0, move: 'rock' },
    ],
    history: [{ round: 1, p1Move: 'rock', p2Move: 'rock', winnerId: null, timestamp: 1000 }],
  }, 9000);

  assert.deepEqual(patch, {
    status: 'playing',
    currentRound: 2,
    roundStartTime: 9000,
    players: [
      { uid: 'u1', name: 'Ana', score: 0, lastMove: 'rock', move: null },
      { uid: 'u2', name: 'Bo', score: 0, lastMove: 'rock', move: null },
    ],
  });
});

test('RPS room transition normalizes dirty player membership before deciding rounds', () => {
  const createRpsNextRoundPatch = projectDomain.createRpsNextRoundPatch;
  assert.equal(typeof createRpsNextRoundPatch, 'function');

  assert.deepEqual(createRpsNextRoundPatch({
    id: 'game-dirty-rps-transition',
    game: 'rps',
    status: 'showdown',
    currentRound: 1,
    config: { bestOf: 3, timeout: 30 },
    players: [
      { uid: 'u1', name: 'Ana', score: 1, move: 'rock' },
      { uid: 'u1', name: 'Duplicate Ana', score: 2, move: 'scissors' },
      { uid: ' ', name: 'Blank', score: 2, move: 'paper' },
      { uid: 'u2', name: 'Bo', score: 0, move: 'scissors' },
    ],
    history: [{ round: 1, p1Move: 'rock', p2Move: 'scissors', winnerId: 'u1', timestamp: 1000 }],
  }, 9200), {
    status: 'playing',
    currentRound: 2,
    roundStartTime: 9200,
    players: [
      { uid: 'u1', name: 'Ana', score: 1, lastMove: 'rock', move: null },
      { uid: 'u2', name: 'Bo', score: 0, lastMove: 'scissors', move: null },
    ],
  });
});

test('RPS summaries and transitions normalize legacy scores before displaying results', () => {
  assert.equal(typeof projectDomain.normalizeRpsScoreInput, 'function');
  assert.equal(projectDomain.normalizeRpsScoreInput('', { bestOf: 3 }), 0);
  assert.equal(projectDomain.normalizeRpsScoreInput('-5', { bestOf: 3 }), 0);
  assert.equal(projectDomain.normalizeRpsScoreInput('1', { bestOf: 1 }), 1);
  assert.equal(projectDomain.normalizeRpsScoreInput('2', { bestOf: 3 }), 2);
  assert.equal(projectDomain.normalizeRpsScoreInput('999', { bestOf: 5 }), 3);
  assert.equal(projectDomain.normalizeRpsScoreInput('999', { bestOf: 99 }), 2);

  const legacyRoom = {
    id: 'game-legacy-score',
    game: 'rps',
    status: 'showdown',
    currentRound: 1,
    config: { bestOf: 3, timeout: 30 },
    players: [
      { uid: 'u1', name: 'Ana', score: 999, move: 'rock' },
      { uid: 'u2', name: 'Bo', score: -5, move: 'scissors' },
    ],
    history: [{ round: 1, p1Move: 'rock', p2Move: 'scissors', winnerId: 'u1', timestamp: 1000 }],
  };

  assert.equal(projectDomain.createGameRoomSummary({ ...legacyRoom, winnerId: 'u1' }).scoreLine, '2 - 0');

  assert.deepEqual(projectDomain.createRpsNextRoundPatch(legacyRoom, 9100), {
    status: 'finished',
    winnerId: 'u1',
    finishedAt: 9100,
    players: [
      { uid: 'u1', name: 'Ana', score: 2, lastMove: 'rock', move: null },
      { uid: 'u2', name: 'Bo', score: 0, lastMove: 'scissors', move: null },
    ],
    resultSummary: {
      game: 'rps',
      status: 'finished',
      winnerId: 'u1',
      winnerName: 'Ana',
      roundsPlayed: 1,
      scoreLine: '2 - 0',
      playerCount: 2,
      lastRound: {
        round: 1,
        p1Move: 'rock',
        p2Move: 'scissors',
        winnerId: 'u1',
        winnerName: 'Ana',
      },
    },
  });
});

test('game room summaries normalize stale stored result summaries before display', () => {
  const rpsSummary = projectDomain.createGameRoomSummary({
    id: 'game-stale-summary-rps',
    game: 'rps',
    status: 'finished',
    winnerId: 'u1',
    config: { bestOf: 3, timeout: 30 },
    players: [
      { uid: 'u1', name: 'Ana', score: 999, move: null },
      { uid: 'u2', name: 'Bo', score: -4, move: null },
    ],
    history: [{ round: 1, p1Move: 'rock', p2Move: 'scissors', winnerId: 'u1' }],
    resultSummary: {
      game: 'mine',
      status: 'finished',
      winnerId: 'ghost',
      winnerName: 'Ghost',
      roundsPlayed: 'many',
      scoreLine: '999 - -4',
      playerCount: 'bad',
      lastRound: {
        round: 'bad',
        p1Move: 'paper',
        p2Move: 'paper',
        winnerId: 'ghost',
        winnerName: 'Ghost',
      },
    },
  });

  assert.deepEqual(rpsSummary, {
    game: 'rps',
    status: 'finished',
    winnerId: 'u1',
    winnerName: 'Ana',
    roundsPlayed: 1,
    scoreLine: '2 - 0',
    playerCount: 2,
    lastRound: {
      round: 1,
      p1Move: 'rock',
      p2Move: 'scissors',
      winnerId: 'u1',
      winnerName: 'Ana',
    },
  });

  const mineSummary = projectDomain.createGameRoomSummary({
    id: 'game-stale-summary-mine',
    game: 'mine',
    status: 'finished',
    players: [
      { uid: 'u3', name: 'Cy', progress: 142, status: 'won' },
      { uid: 'u4', name: 'Dee', progress: -4, status: 'dead' },
    ],
    resultSummary: {
      game: 'rps',
      status: 'finished',
      winnerId: 'ghost',
      winnerName: 'Ghost',
      roundsPlayed: 99,
      scoreLine: '500%',
      playerCount: 'bad',
    },
  });

  assert.deepEqual(mineSummary, {
    game: 'mine',
    status: 'finished',
    winnerId: 'u3',
    winnerName: 'Cy',
    roundsPlayed: 0,
    scoreLine: '100%',
    playerCount: 2,
  });
});

test('game room summaries normalize dirty player membership before display', () => {
  const rpsSummary = projectDomain.createGameRoomSummary({
    id: 'game-dirty-summary-rps',
    game: 'rps',
    status: 'waiting',
    config: { bestOf: 3, timeout: 30 },
    players: [
      { uid: 'u1', name: 'Ana', score: 2, move: null },
      { uid: 'u1', name: 'Duplicate Ana', score: 7, move: 'rock' },
      { uid: ' ', name: 'Blank', score: 1, move: null },
      null,
      { uid: 'u2', name: 'Bo', score: 'bad', move: null },
    ],
  });

  assert.deepEqual(rpsSummary, {
    game: 'rps',
    status: 'waiting',
    winnerId: null,
    winnerName: '',
    roundsPlayed: 0,
    scoreLine: '2 - 0',
    playerCount: 2,
  });

  const mineSummary = projectDomain.createGameRoomSummary({
    id: 'game-dirty-summary-mine',
    game: 'mine',
    status: 'playing',
    players: [
      { uid: 'u1', name: 'Ana', progress: 20, status: 'playing' },
      { uid: 'u1', name: 'Duplicate Ana', progress: 100, status: 'won' },
      { uid: ' ', name: 'Blank', progress: 100, status: 'won' },
      null,
      { uid: 'u2', name: 'Bo', progress: 70, status: 'playing' },
    ],
  });

  assert.deepEqual(mineSummary, {
    game: 'mine',
    status: 'playing',
    winnerId: null,
    winnerName: '',
    roundsPlayed: 0,
    scoreLine: '70%',
    playerCount: 2,
  });
});

test('game room player summary normalizes dirty membership before current-user checks', () => {
  const createGameRoomPlayerSummary = projectDomain.createGameRoomPlayerSummary;
  assert.equal(typeof createGameRoomPlayerSummary, 'function');

  const summary = createGameRoomPlayerSummary({
    id: 'game-dirty-player-summary',
    game: 'rps',
    players: [
      { uid: ' host ', name: 'Host', score: 1, move: 'rock' },
      { uid: ' u2 ', name: 'Ada', score: 0, move: null },
      { uid: 'u2', name: 'Duplicate Ada', score: 2, move: 'paper' },
      { uid: ' ', name: 'Blank' },
      null,
    ],
  }, { uid: 'u2' });

  assert.deepEqual(summary, {
    players: [
      { uid: 'host', name: 'Host', score: 1, move: 'rock' },
      { uid: 'u2', name: 'Ada', score: 0, move: null },
    ],
    playerCount: 2,
    currentPlayer: { uid: 'u2', name: 'Ada', score: 0, move: null },
    opponentPlayer: { uid: 'host', name: 'Host', score: 1, move: 'rock' },
    hostPlayer: { uid: 'host', name: 'Host', score: 1, move: 'rock' },
    isCurrentPlayer: true,
    isHost: false,
  });

  assert.equal(
    createGameRoomPlayerSummary({ id: 'game-host', players: [{ uid: ' host ', name: 'Host' }] }, { uid: 'host' }).isHost,
    true,
  );
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

test('user game result history normalizes dirty player membership before summarizing', () => {
  assert.equal(typeof createUserGameResultHistory, 'function');

  const history = createUserGameResultHistory([
    {
      id: 'dirty-win',
      name: 'Messy final',
      game: 'rps',
      status: 'finished',
      winnerId: ' u1 ',
      finishedAt: 9000,
      config: { bestOf: 3, timeout: 30 },
      players: [
        { uid: ' u1 ', name: 'Ana', score: 2, move: null },
        { uid: ' u1 ', name: 'Duplicate Ana', score: 99, move: null },
        { uid: ' ', name: 'Blank', score: 99, move: null },
        { uid: 'u2', name: 'Bo', score: 1, move: null },
      ],
      history: [{ round: 1 }, { round: 2 }, { round: 3 }],
    },
  ], 'u1', 3);

  assert.deepEqual(history.stats, {
    total: 1,
    wins: 1,
    losses: 0,
    draws: 0,
  });
  assert.deepEqual(history.recent, [
    {
      id: 'dirty-win',
      roomName: 'Messy final',
      game: 'rps',
      finishedAt: 9000,
      result: 'win',
      winnerId: 'u1',
      winnerName: 'Ana',
      scoreLine: '2 - 1',
      roundsPlayed: 3,
      playerCount: 2,
    },
  ]);
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

test('minesweeper progress patch normalizes dirty player membership before terminal checks', () => {
  assert.deepEqual(projectDomain.createMineRoomProgressPatch({
    id: 'mine-dirty-progress',
    game: 'mine',
    status: 'playing',
    players: [
      { uid: 'u1', name: 'Ana', progress: 40, status: 'dead' },
      { uid: 'u1', name: 'Duplicate Ana', progress: 95, status: 'playing' },
      { uid: '', name: 'Blank', progress: 0, status: 'playing' },
      { uid: 'u2', name: 'Bo', progress: 80, status: 'playing' },
    ],
  }, { uid: 'u2' }, 82, 'dead', 7100), {
    players: [
      { uid: 'u1', name: 'Ana', progress: 40, status: 'dead' },
      { uid: 'u2', name: 'Bo', progress: 82, status: 'dead' },
    ],
    status: 'finished',
    winnerId: null,
    finishedAt: 7100,
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

test('minesweeper summaries normalize legacy progress before ranking', () => {
  assert.equal(typeof projectDomain.createGameRoomSummary, 'function');
  assert.equal(typeof projectDomain.normalizeMineProgressInput, 'function');

  assert.equal(projectDomain.normalizeMineProgressInput(''), 0);
  assert.equal(projectDomain.normalizeMineProgressInput('-5'), 0);
  assert.equal(projectDomain.normalizeMineProgressInput('42'), 42);
  assert.equal(projectDomain.normalizeMineProgressInput('500'), 100);

  const summary = projectDomain.createGameRoomSummary({
    id: 'mine-legacy-progress',
    game: 'mine',
    status: 'finished',
    winnerId: 'u2',
    players: [
      { uid: 'u1', name: 'Legacy high', progress: 500, status: 'dead' },
      { uid: 'u2', name: 'Winner', progress: 100, status: 'won' },
      { uid: 'u3', name: 'Legacy low', progress: -20, status: 'dead' },
    ],
  });

  assert.deepEqual(summary, {
    game: 'mine',
    status: 'finished',
    winnerId: 'u2',
    winnerName: 'Winner',
    roundsPlayed: 0,
    scoreLine: '100%',
    playerCount: 3,
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

test('game room join guard normalizes dirty player membership before capacity checks', () => {
  assert.deepEqual(projectDomain.createGameRoomJoinPatch({
    id: 'game-dirty-join-rps',
    game: 'rps',
    status: 'waiting',
    config: { bestOf: 3 },
    players: [
      { uid: 'u1', name: 'Owner', score: 0, move: null },
      { uid: 'u1', name: 'Duplicate Owner', score: 2, move: 'rock' },
      { uid: ' ', name: 'Blank', score: 1, move: null },
    ],
  }, { uid: 'u2', displayName: 'Ada' }, 'Ada Lovelace', 9200), {
    players: [
      { uid: 'u1', name: 'Owner', score: 0, move: null },
      { uid: 'u2', name: 'Ada Lovelace', score: 0, move: null },
    ],
    status: 'playing',
    roundStartTime: 9200,
    currentRound: 1,
  });

  const dirtyMinePlayers = [
    ...Array.from({ length: 7 }, (_, index) => ({
      uid: `u${index + 1}`,
      name: `Player ${index + 1}`,
      progress: 0,
      status: 'playing',
    })),
    { uid: 'u7', name: 'Duplicate Player 7', progress: 90, status: 'playing' },
    { uid: '', name: 'Blank', progress: 0, status: 'playing' },
  ];

  assert.deepEqual(projectDomain.createGameRoomJoinPatch({
    id: 'game-dirty-join-mine',
    game: 'mine',
    status: 'playing',
    players: dirtyMinePlayers,
  }, { uid: 'u8', displayName: 'Lin' }, 'Lin', 9300), {
    players: [
      ...dirtyMinePlayers.slice(0, 7),
      { uid: 'u8', name: 'Lin', progress: 0, status: 'playing' },
    ],
  });

  assert.equal(projectDomain.createGameRoomJoinPatch({
    id: 'game-dirty-join-mine-full',
    game: 'mine',
    status: 'playing',
    players: [
      ...dirtyMinePlayers.slice(0, 7),
      { uid: 'u8', name: 'Lin', progress: 0, status: 'playing' },
      { uid: 'u8', name: 'Duplicate Lin', progress: 100, status: 'won' },
    ],
  }, { uid: 'u9', displayName: 'Max' }, 'Max', 9301), null);
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

test('schedule submission guard matches existing responses by normalized uid', () => {
  const createScheduleSubmissionWrite = projectDomain.createScheduleSubmissionWrite;
  const user = { uid: 'u2', displayName: 'Rosalind' };
  const config = { mode: 'date', start: '2026-07-05', end: '2026-07-07', deadline: '' };

  assert.deepEqual(
    createScheduleSubmissionWrite(
      [
        { id: 'schedule-1', projectId: 'project-1', uid: 'u1' },
        { id: 'schedule-dirty', projectId: 'project-1', uid: ' u2 ', availability: ['2026-07-05'], submittedAt: 3700 },
      ],
      'project-1',
      user,
      'Rosalind Franklin',
      ['2026-07-06'],
      3702,
      config,
    ),
    {
      type: 'update',
      collection: 'schedule_submissions',
      id: 'schedule-dirty',
      data: {
        availability: ['2026-07-06'],
        submittedAt: 3702,
      },
    },
  );
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

test('schedule time availability is canonicalized and deduped before persistence', () => {
  const user = { uid: 'u2', displayName: 'Rosalind' };

  assert.deepEqual(
    projectDomain.createScheduleSubmissionWrite(
      [],
      'project-1',
      user,
      'Rosalind Franklin',
      [
        { id: 'r1', date: '2026-07-05', start: '9:00', end: '10:00', note: 'legacy' },
        { id: 'r2', date: '2026-07-05', start: '09:00', end: '10:00' },
        { id: 'r3', date: '2026-07-05', start: 900, end: '10:00' },
        { id: 'r4', date: '2026-07-08', start: '09:00', end: '10:00' },
        { date: '2026-07-06', start: '8:30', end: '9:00' },
      ],
      3713,
      { mode: 'time', start: '2026-07-05', end: '2026-07-07' },
    ).data.availability,
    [
      { id: 'r1', date: '2026-07-05', start: '09:00', end: '10:00' },
      { date: '2026-07-06', start: '08:30', end: '09:00' },
    ],
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

test('schedule summaries ignore invalid uid values and use one response per participant', () => {
  const config = { mode: 'date', start: '2026-07-05', end: '2026-07-07' };
  const submissions = [
    { id: 'blank', uid: ' ', availability: ['2026-07-05'], submittedAt: 40 },
    { id: 'old-u2', uid: ' u2 ', name: 'Old Rosalind', availability: ['2026-07-05'], submittedAt: 41 },
    { id: 'u1', uid: 'u1', name: 'Ada', availability: ['2026-07-05', 'bad-date', '2026-07-09'], submittedAt: 42 },
    { id: 'new-u2', uid: 'u2', name: 'Rosalind', availability: ['2026-07-06'], submittedAt: 43 },
  ];

  assert.equal(typeof projectDomain.createScheduleSubmissionSummary, 'function');
  const submissionSummary = projectDomain.createScheduleSubmissionSummary(submissions, { uid: 'u2' }, config);
  assert.equal(submissionSummary.participantCount, 2);
  assert.deepEqual(
    submissionSummary.submissions.map((submission) => submission.uid).sort(),
    ['u1', 'u2'],
  );
  assert.deepEqual(submissionSummary.mySubmission, {
    id: 'new-u2',
    uid: 'u2',
    name: 'Rosalind',
    availability: ['2026-07-06'],
    submittedAt: 43,
  });

  assert.deepEqual(createScheduleRecommendationSummary(submissions, config, 3), {
    participantCount: 2,
    recommendations: [
      { key: '2026-07-05', date: '2026-07-05', count: 1, participantCount: 2, coverage: 1 / 2 },
      { key: '2026-07-06', date: '2026-07-06', count: 1, participantCount: 2, coverage: 1 / 2 },
    ],
  });
  assert.deepEqual(projectDomain.createScheduleHeatmapData(submissions, config), {
    '2026-07-05': 1,
    '2026-07-06': 1,
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

test('schedule time recommendations and heatmap count one participant once per bucket', () => {
  const timeConfig = { mode: 'time', start: '2026-07-05', end: '2026-07-05' };
  const submissions = [
    {
      uid: 'u1',
      availability: [
        { date: '2026-07-05', start: '9:00', end: '10:00' },
        { date: '2026-07-05', start: '09:00', end: '10:00' },
        { date: '2026-07-05', start: '09:00', end: '10:00' },
        { date: '2026-07-05', start: null, end: '11:00' },
      ],
    },
    { uid: 'u2', availability: [{ date: '2026-07-05', start: '09:30', end: '10:30' }] },
    { uid: 'u3', availability: [{ date: '2026-07-05', start: '8:30', end: '9:00' }] },
  ];

  assert.deepEqual(createScheduleRecommendationSummary(submissions, timeConfig, 4), {
    participantCount: 3,
    recommendations: [
      { key: '2026-07-05_09:30', date: '2026-07-05', start: '09:30', end: '10:00', count: 2, participantCount: 3, coverage: 2 / 3 },
      { key: '2026-07-05_08:30', date: '2026-07-05', start: '08:30', end: '09:00', count: 1, participantCount: 3, coverage: 1 / 3 },
      { key: '2026-07-05_09:00', date: '2026-07-05', start: '09:00', end: '09:30', count: 1, participantCount: 3, coverage: 1 / 3 },
      { key: '2026-07-05_10:00', date: '2026-07-05', start: '10:00', end: '10:30', count: 1, participantCount: 3, coverage: 1 / 3 },
    ],
  });
  assert.equal(typeof projectDomain.createScheduleHeatmapData, 'function');
  assert.deepEqual(projectDomain.createScheduleHeatmapData(submissions, timeConfig), {
    '2026-07-05_08:30': 1,
    '2026-07-05_09:00': 1,
    '2026-07-05_09:30': 2,
    '2026-07-05_10:00': 1,
  });
});

test('claim toggle guard enforces capacity and supports releasing existing claims', () => {
  const createClaimToggleData = projectDomain.createClaimToggleData;
  assert.equal(typeof createClaimToggleData, 'function');

  const user = { uid: 'u2', displayName: 'Dorothy' };
  const openItem = { id: 'claim-1', maxClaims: 2, claimants: [{ uid: 'u1', name: 'Owner', at: 1 }] };
  const fullItem = { id: 'claim-2', maxClaims: 1, claimants: [{ uid: 'u1', name: 'Owner', at: 1 }] };
  const claimedItem = { id: 'claim-3', maxClaims: 1, claimants: [{ uid: 'u2', name: 'Dorothy', at: 2 }] };
  const legacyOversizedItem = {
    id: 'claim-4',
    maxClaims: 1000,
    claimants: Array.from({ length: 99 }, (_, index) => ({ uid: `legacy-${index}`, name: `User ${index}`, at: index })),
  };
  const duplicatedLegacyItem = {
    id: 'claim-5',
    maxClaims: 2,
    claimants: [
      { uid: 'u1', name: 'Owner', at: 1 },
      { uid: 'u1', name: 'Duplicate Owner', at: 2 },
      null,
    ],
  };
  const dirtyClaimedItem = {
    id: 'claim-6',
    maxClaims: 1,
    claimants: [
      { uid: ' u2 ', name: ' Dorothy ', at: 5 },
      { uid: '', name: 'Ghost', at: 6 },
      { uid: 'u2', name: 'Duplicate Dorothy', at: 7 },
    ],
  };

  assert.deepEqual(createClaimToggleData(openItem, user, 'Dorothy Vaughan', 3800), {
    type: 'add',
    claimant: { uid: 'u2', name: 'Dorothy Vaughan', at: 3800 },
  });
  assert.equal(createClaimToggleData(fullItem, user, 'Dorothy Vaughan', 3801), null);
  assert.deepEqual(createClaimToggleData(claimedItem, user, 'Dorothy Vaughan', 3802), {
    type: 'remove',
    claimant: { uid: 'u2', name: 'Dorothy', at: 2 },
  });
  assert.equal(
    createClaimToggleData(legacyOversizedItem, user, 'Dorothy Vaughan', 3803),
    null,
    'legacy oversized claim items should still cap at the product maximum',
  );
  assert.deepEqual(createClaimToggleData(duplicatedLegacyItem, user, 'Dorothy Vaughan', 3804), {
    type: 'add',
    claimant: { uid: 'u2', name: 'Dorothy Vaughan', at: 3804 },
  });
  assert.deepEqual(createClaimToggleData(dirtyClaimedItem, user, 'Dorothy Vaughan', 3805), {
    type: 'remove',
    claimant: { uid: 'u2', name: 'Dorothy', at: 5 },
  });
});

test('claim capacity input normalizes empty and bounded numeric values', () => {
  const normalizeClaimCapacityInput = projectDomain.normalizeClaimCapacityInput;
  assert.equal(typeof normalizeClaimCapacityInput, 'function');

  assert.equal(normalizeClaimCapacityInput(''), 1);
  assert.equal(normalizeClaimCapacityInput('  '), 1);
  assert.equal(normalizeClaimCapacityInput('abc'), 1);
  assert.equal(normalizeClaimCapacityInput('0'), 1);
  assert.equal(normalizeClaimCapacityInput('-5'), 1);
  assert.equal(normalizeClaimCapacityInput('1'), 1);
  assert.equal(normalizeClaimCapacityInput('42'), 42);
  assert.equal(normalizeClaimCapacityInput('99'), 99);
  assert.equal(normalizeClaimCapacityInput('100'), 99);
  assert.equal(normalizeClaimCapacityInput(250), 99);
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

test('voting result summary deduplicates votes and derives share bars', () => {
  assert.equal(typeof createVotingResultSummary, 'function');

  assert.deepEqual(createVotingResultSummary([
    { id: 'vote-b', title: 'B', votes: ['u1', 'u1', ' ', null, 'u2'], createdAt: 20 },
    { id: 'vote-a', title: 'A', votes: ['u3'], createdAt: 10 },
    { id: 'vote-c', title: 'C', votes: 'not-a-list', createdAt: 30 },
    { votes: ['missing-id'] },
    null,
  ]), {
    totalVotes: 3,
    maxVotes: 2,
    items: [
      {
        item: { id: 'vote-b', title: 'B', votes: ['u1', 'u1', ' ', null, 'u2'], createdAt: 20 },
        voterIds: ['u1', 'u2'],
        voteCount: 2,
        percent: 2 / 3,
        barPercent: 1,
      },
      {
        item: { id: 'vote-a', title: 'A', votes: ['u3'], createdAt: 10 },
        voterIds: ['u3'],
        voteCount: 1,
        percent: 1 / 3,
        barPercent: 0.5,
      },
      {
        item: { id: 'vote-c', title: 'C', votes: 'not-a-list', createdAt: 30 },
        voterIds: [],
        voteCount: 0,
        percent: 0,
        barPercent: 0,
      },
    ],
  });

  assert.deepEqual(createVotingResultSummary([]), {
    totalVotes: 0,
    maxVotes: 0,
    items: [],
  });
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
      claim_items: [{ id: 'claim-1', title: 'Bring snacks', maxClaims: 1000, claimants: [{ uid: 'u1' }] }],
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
      data: { projectId: 'project-copy', title: 'Bring snacks', maxClaims: 99, claimants: [], creatorId: 'owner-2', creatorName: 'Ada Lovelace', createdAt: 5100 },
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
    'createBookingSlotData',
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

  const claimSummary = createProjectInsightSummary(
    { id: 'claim-1', type: 'claim', status: 'active' },
    {
      claimItems: [
        {
          id: 'c1',
          projectId: 'claim-1',
          maxClaims: '2',
          claimants: [
            { uid: 'u1', name: 'Ana' },
            { uid: 'u1', name: 'Duplicate Ana' },
            { uid: 'u2', name: 'Bo' },
            { uid: 'u3', name: 'Cy' },
            null,
          ],
        },
        { id: 'c2', projectId: 'claim-1', maxClaims: 'bad', claimants: 'not-a-list' },
        { id: 'c3', projectId: 'other', maxClaims: 1, claimants: [{ uid: 'leak', name: 'Leak' }] },
      ],
    },
  );

  assert.equal(claimSummary.nextActionKey, 'insightReviewProgress');
  assert.deepEqual(claimSummary.metrics, [
    { key: 'tasks', labelKey: 'insightTasks', value: 2 },
    { key: 'claimed', labelKey: 'insightClaimed', value: 2 },
  ]);

  assert.equal(
    createProjectInsightSummary({ id: 'archived-1', type: 'queue', archived: true }, {}).nextActionKey,
    'insightRestoreToEdit',
  );
});

test('project insight summary normalizes malformed participant metrics', () => {
  const voteSummary = createProjectInsightSummary(
    { id: 'vote-dirty', type: 'vote', status: 'active' },
    {
      votingItems: [
        { id: 'v1', projectId: 'vote-dirty', votes: ['u1', 'u1', '', null, 'u2'] },
        { id: 'v2', projectId: 'vote-dirty', votes: 'not-a-list' },
        { id: 'v3', projectId: 'other', votes: ['leak'] },
      ],
    },
  );
  assert.deepEqual(voteSummary.metrics, [
    { key: 'items', labelKey: 'insightItems', value: 2 },
    { key: 'votes', labelKey: 'insightVotes', value: 2 },
  ]);

  const gatherSummary = createProjectInsightSummary(
    { id: 'gather-dirty', type: 'gather', status: 'active' },
    {
      gatherFields: [{ id: 'field-1', projectId: 'gather-dirty' }],
      gatherSubmissions: [
        { id: 'g1', projectId: 'gather-dirty', uid: 'u1' },
        { id: 'g2', projectId: 'gather-dirty', uid: 'u1' },
        { id: 'g3', projectId: 'gather-dirty', uid: 'u2' },
        { projectId: 'gather-dirty', uid: '' },
        { id: 'g4', projectId: 'other', uid: 'leak' },
      ],
    },
  );
  assert.deepEqual(gatherSummary.metrics, [
    { key: 'fields', labelKey: 'insightFields', value: 1 },
    { key: 'responses', labelKey: 'insightResponses', value: 2 },
  ]);

  const scheduleSummary = createProjectInsightSummary(
    { id: 'schedule-dirty', type: 'schedule', status: 'active', scheduleConfig: { mode: 'date' } },
    {
      scheduleSubmissions: [
        { id: 's1', projectId: 'schedule-dirty', uid: 'u1' },
        { id: 's2', projectId: 'schedule-dirty', uid: 'u1' },
        { id: 's3', projectId: 'schedule-dirty', uid: 'u2' },
        { projectId: 'schedule-dirty', uid: '' },
        { id: 's4', projectId: 'other', uid: 'leak' },
      ],
    },
  );
  assert.deepEqual(scheduleSummary.metrics, [
    { key: 'responses', labelKey: 'insightResponses', value: 2 },
  ]);

  const bookingSummary = createProjectInsightSummary(
    { id: 'book-dirty', type: 'book', status: 'active', bookingConfig: { mode: 'date' } },
    {
      bookingSlots: [
        {
          id: 'b1',
          projectId: 'book-dirty',
          bookedBy: 'u1',
          waitlist: [{ uid: 'u2' }, { uid: 'u2' }, null, { uid: '' }, { uid: 'u3' }],
        },
        { id: 'b2', projectId: 'book-dirty', bookedBy: '', waitlist: 'not-a-list' },
        { id: 'b3', projectId: 'other', bookedBy: 'leak', waitlist: [{ uid: 'leak' }] },
      ],
    },
  );
  assert.deepEqual(bookingSummary.metrics, [
    { key: 'slots', labelKey: 'insightSlots', value: 2 },
    { key: 'booked', labelKey: 'insightBooked', value: 1 },
    { key: 'waitlist', labelKey: 'insightWaitlist', value: 2 },
  ]);

  const teamSummary = createProjectInsightSummary(
    { id: 'team-dirty', type: 'team', status: 'active' },
    {
      rooms: [
        {
          id: 't1',
          projectId: 'team-dirty',
          members: [{ uid: 'u1' }, { uid: 'u1' }, null, { uid: 'u2' }, { name: 'No uid' }],
        },
        { id: 't2', projectId: 'team-dirty', members: 'not-a-list' },
        { id: 't3', projectId: 'other', members: [{ uid: 'leak' }] },
      ],
    },
  );
  assert.deepEqual(teamSummary.metrics, [
    { key: 'items', labelKey: 'insightItems', value: 2 },
    { key: 'participants', labelKey: 'insightParticipants', value: 2 },
  ]);

  const queueSummary = createProjectInsightSummary(
    { id: 'queue-dirty', type: 'queue', status: 'active' },
    {
      queueParticipants: [
        { id: 'q1', projectId: 'queue-dirty', uid: 'u1' },
        { id: 'q2', projectId: 'queue-dirty', uid: 'u1' },
        { id: 'q3', projectId: 'queue-dirty', uid: 'u2' },
        { projectId: 'queue-dirty', uid: '' },
        { id: 'q4', projectId: 'other', uid: 'leak' },
      ],
    },
  );
  assert.deepEqual(queueSummary.metrics, [
    { key: 'participants', labelKey: 'insightParticipants', value: 2 },
  ]);

  const rouletteSummary = createProjectInsightSummary(
    { id: 'roulette-dirty', type: 'roulette', status: 'active' },
    {
      rouletteParticipants: [
        { id: 'r1', projectId: 'roulette-dirty', uid: 'u1' },
        { id: 'r2', projectId: 'roulette-dirty', uid: 'u1' },
        { id: 'r3', projectId: 'roulette-dirty', uid: 'u2' },
        { projectId: 'roulette-dirty', uid: '' },
        { id: 'r4', projectId: 'other', uid: 'leak' },
      ],
    },
  );
  assert.deepEqual(rouletteSummary.metrics, [
    { key: 'participants', labelKey: 'insightParticipants', value: 2 },
  ]);

  const gameSummary = createProjectInsightSummary(
    { id: 'game-dirty', type: 'game_hub', status: 'active' },
    {
      gameRooms: [
        {
          id: 'game-rps',
          projectId: 'game-dirty',
          game: 'rps',
          players: [{ uid: 'u1' }, { uid: 'u1' }, { uid: 'u2' }, null],
        },
        {
          id: 'game-mine',
          projectId: 'game-dirty',
          game: 'mine',
          players: [{ uid: 'u3' }, { uid: 'u3' }, { uid: 'u4' }, { uid: '' }, null],
        },
        { id: 'game-other', projectId: 'other', players: [{ uid: 'leak' }] },
      ],
    },
  );
  assert.deepEqual(gameSummary.metrics, [
    { key: 'items', labelKey: 'insightItems', value: 2 },
    { key: 'participants', labelKey: 'insightParticipants', value: 4 },
  ]);
});
