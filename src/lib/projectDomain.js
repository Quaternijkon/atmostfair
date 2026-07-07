import { getDashboardProjectTemplate } from './dashboardDomain.js';

export const PROJECT_CASCADE_COLLECTIONS = [
  { name: 'projects', field: 'id' },
  { name: 'voting_items', field: 'projectId' },
  { name: 'rooms', field: 'projectId' },
  { name: 'roulette_participants', field: 'projectId' },
  { name: 'queue_participants', field: 'projectId' },
  { name: 'gather_fields', field: 'projectId' },
  { name: 'gather_submissions', field: 'projectId' },
  { name: 'schedule_submissions', field: 'projectId' },
  { name: 'booking_slots', field: 'projectId' },
  { name: 'claim_items', field: 'projectId' },
  { name: 'project_chats', field: 'projectId' },
  { name: 'game_rooms', field: 'projectId' },
  { name: 'notifications', field: 'projectId' },
  { name: 'project_activities', field: 'projectId' },
];

export const PROJECT_TITLE_MAX_LENGTH = 120;
export const PROJECT_CREATOR_NAME_MAX_LENGTH = 60;
export const PROJECT_PASSWORD_MAX_LENGTH = 128;
export const PROJECT_CHILD_TEXT_MAX_LENGTH = 120;
export const PROJECT_BRIEF_MAX_LENGTH = 500;
export const PARTICIPANT_VALUE_MIN = 0;
export const PARTICIPANT_VALUE_MAX = 100;
export const PARTICIPANT_VALUE_DEFAULT = 0;
export const CLAIM_CAPACITY_MIN = 1;
export const CLAIM_CAPACITY_MAX = 99;
export const TEAM_ROOM_CAPACITY_MIN = 1;
export const TEAM_ROOM_CAPACITY_MAX = 99;
export const TEAM_ROOM_CAPACITY_DEFAULT = 4;
export const ROULETTE_PRIZE_COUNT_MIN = 0;
export const ROULETTE_PRIZE_COUNT_MAX = 99;
export const ROULETTE_SURVIVOR_COUNT_MIN = 1;
export const ROULETTE_SURVIVOR_COUNT_MAX = 99;
export const ROULETTE_REPLAY_SPEED_MIN = 0.1;
export const ROULETTE_REPLAY_SPEED_MAX = 5;
export const ROULETTE_REPLAY_SPEED_DEFAULT = 2;

const PROJECT_TYPES = new Set(['vote', 'gather', 'schedule', 'book', 'team', 'claim', 'roulette', 'queue', 'game_hub']);
const ROULETTE_MODES = new Set(['classic', 'multi', 'elim']);
const ROULETTE_ORDERS = new Set(['fwd', 'rev']);
const GAME_ROOM_TYPES = new Set(['rps', 'mine']);
const GATHER_FIELD_TYPES = new Set(['text', 'number', 'date', 'option']);
const SCHEDULE_MODES = new Set(['date', 'half', 'time']);
const BOOKING_MODES = new Set(['date', 'half']);
const HALF_DAY_SLOTS = new Set(['morning', 'afternoon', 'evening']);
const BOOKING_HALF_DAY_PERIODS = new Set(['Morning', 'Afternoon', 'Evening']);
const MINE_PLAYER_STATUSES = new Set(['playing', 'dead', 'won']);
const MINE_TERMINAL_STATUSES = new Set(['dead', 'won']);
const GAME_ROOM_INVITE_PARAM = 'room';
const TEMPLATE_SEED_DAY_MS = 86400000;
const REPEAT_SEED_MODULUS = 2147483647;
const REPEAT_SEED_MULTIPLIER = 16807;

export function createProjectInsightSummary(project, datasets = {}) {
  const projectId = project?.id;
  const statusKey = project?.archived
    ? 'archived'
    : project?.status === 'finished'
      ? 'finished'
      : project?.status === 'stopped'
        ? 'paused'
        : 'activeStatus';

  const scoped = (items, field = 'projectId') => (
    Array.isArray(items) && projectId ? items.filter((entry) => entry?.[field] === projectId) : []
  );
  const activityCount = scoped(datasets.projectActivities).length;
  const withActivity = (metrics) => (
    activityCount > 0 ? [...metrics, { key: 'activity', labelKey: 'insightActivity', value: activityCount }] : metrics
  );

  if (!projectId) {
    return { statusKey, nextActionKey: 'insightInviteParticipants', metrics: [] };
  }

  let metrics = [];
  let nextActionKey = 'insightInviteParticipants';

  if (project.archived) {
    nextActionKey = 'insightRestoreToEdit';
  } else if (project.status === 'stopped') {
    nextActionKey = 'insightResumeToEdit';
  } else if (project.status === 'finished') {
    nextActionKey = 'insightReviewResults';
  } else {
    switch (project.type) {
      case 'vote': {
        const votingItems = scoped(datasets.votingItems);
        const votes = votingItems.reduce((sum, item) => sum + countUniquePrimitiveIdentities(item.votes), 0);
        metrics = [
          { key: 'items', labelKey: 'insightItems', value: votingItems.length },
          { key: 'votes', labelKey: 'insightVotes', value: votes },
        ];
        nextActionKey = votingItems.length === 0
          ? 'insightFinishSetup'
          : votes === 0
            ? 'insightInviteParticipants'
            : 'insightReviewProgress';
        break;
      }
      case 'gather': {
        const gatherFields = scoped(datasets.gatherFields);
        const gatherSubmissions = scoped(datasets.gatherSubmissions);
        const responses = countUniqueRecordIdentities(gatherSubmissions);
        metrics = [
          { key: 'fields', labelKey: 'insightFields', value: gatherFields.length },
          { key: 'responses', labelKey: 'insightResponses', value: responses },
        ];
        nextActionKey = gatherFields.length === 0
          ? 'insightFinishSetup'
          : responses === 0
            ? 'insightInviteParticipants'
            : 'insightReviewProgress';
        break;
      }
      case 'schedule': {
        const scheduleSubmissions = scoped(datasets.scheduleSubmissions);
        const responses = countUniqueRecordIdentities(scheduleSubmissions);
        metrics = [{ key: 'responses', labelKey: 'insightResponses', value: responses }];
        nextActionKey = !project.scheduleConfig
          ? 'insightFinishSetup'
          : responses === 0
            ? 'insightInviteParticipants'
            : 'insightReviewProgress';
        break;
      }
      case 'book': {
        const bookingSlots = scoped(datasets.bookingSlots);
        const booked = bookingSlots.filter((slot) => normalizeIdentityValue(slot?.bookedBy)).length;
        const waitlist = bookingSlots.reduce((sum, slot) => sum + countUniqueRecordIdentities(slot?.waitlist, { fallbackToId: false }), 0);
        metrics = [
          { key: 'slots', labelKey: 'insightSlots', value: bookingSlots.length },
          { key: 'booked', labelKey: 'insightBooked', value: booked },
          { key: 'waitlist', labelKey: 'insightWaitlist', value: waitlist },
        ];
        nextActionKey = !project.bookingConfig
          ? 'insightFinishSetup'
          : bookingSlots.length === 0
            ? 'insightOpenSlots'
            : booked === 0
              ? 'insightInviteParticipants'
              : 'insightReviewProgress';
        break;
      }
      case 'team': {
        const rooms = scoped(datasets.rooms);
        const participants = rooms.reduce((sum, room) => sum + countUniqueRecordIdentities(room?.members, { fallbackToId: false }), 0);
        metrics = [
          { key: 'items', labelKey: 'insightItems', value: rooms.length },
          { key: 'participants', labelKey: 'insightParticipants', value: participants },
        ];
        nextActionKey = rooms.length === 0
          ? 'insightFinishSetup'
          : participants === 0
            ? 'insightInviteParticipants'
            : 'insightReviewProgress';
        break;
      }
      case 'claim': {
        const claimItems = scoped(datasets.claimItems);
        const claimed = claimItems.reduce((sum, item) => sum + normalizeClaimItemClaimants(item).length, 0);
        metrics = [
          { key: 'tasks', labelKey: 'insightTasks', value: claimItems.length },
          { key: 'claimed', labelKey: 'insightClaimed', value: claimed },
        ];
        nextActionKey = claimItems.length === 0
          ? 'insightFinishSetup'
          : claimed === 0
            ? 'insightInviteParticipants'
            : 'insightReviewProgress';
        break;
      }
      case 'roulette': {
        const rouletteParticipants = scoped(datasets.rouletteParticipants);
        const participants = countUniqueRecordIdentities(rouletteParticipants);
        metrics = [{ key: 'participants', labelKey: 'insightParticipants', value: participants }];
        nextActionKey = participants === 0 ? 'insightInviteParticipants' : 'insightRunResult';
        break;
      }
      case 'queue': {
        const queueParticipants = scoped(datasets.queueParticipants);
        const participants = countUniqueRecordIdentities(queueParticipants);
        metrics = [{ key: 'participants', labelKey: 'insightParticipants', value: participants }];
        nextActionKey = participants === 0 ? 'insightInviteParticipants' : 'insightRunResult';
        break;
      }
      case 'game_hub': {
        const gameRooms = scoped(datasets.gameRooms);
        const participants = gameRooms.reduce((sum, room) => sum + countGameRoomInsightPlayers(room), 0);
        metrics = [
          { key: 'items', labelKey: 'insightItems', value: gameRooms.length },
          { key: 'participants', labelKey: 'insightParticipants', value: participants },
        ];
        nextActionKey = gameRooms.length === 0
          ? 'insightFinishSetup'
          : participants === 0
            ? 'insightInviteParticipants'
            : 'insightReviewProgress';
        break;
      }
      default:
        nextActionKey = 'insightReviewProgress';
    }
  }

  return { statusKey, nextActionKey, metrics: withActivity(metrics) };
}

function countUniquePrimitiveIdentities(values) {
  if (!Array.isArray(values)) return 0;
  return new Set(values.map(normalizeIdentityValue).filter(Boolean)).size;
}

function countUniqueRecordIdentities(records, options = {}) {
  if (!Array.isArray(records)) return 0;
  const { fallbackToId = true } = options;
  const identities = records.map((record) => {
    const uid = normalizeIdentityValue(record?.uid);
    if (uid) return `uid:${uid}`;
    if (!fallbackToId) return '';
    const id = normalizeIdentityValue(record?.id);
    return id ? `id:${id}` : '';
  });
  return new Set(identities.filter(Boolean)).size;
}

function countGameRoomInsightPlayers(room) {
  const playerCount = countUniqueRecordIdentities(room?.players, { fallbackToId: false });
  if (room?.game === 'rps') return Math.min(2, playerCount);
  if (room?.game === 'mine') return Math.min(8, playerCount);
  return playerCount;
}

function normalizeIdentityValue(value) {
  return String(value ?? '').trim();
}

export function createTeamJoinMember(room, user, userName, joinedAt) {
  if (!room || !user?.uid) return null;
  const members = Array.isArray(room.members) ? room.members : [];
  if (members.some((member) => member.uid === user.uid)) return null;
  const maxMembers = normalizeTeamRoomCapacityInput(room.maxMembers);
  if (maxMembers > 0 && members.length >= maxMembers) return null;
  return {
    uid: user.uid,
    name: cleanName(userName, user),
    joinedAt,
  };
}

export function createQueueJoinData(existingParticipants, projectId, user, userName, value, joinedAt) {
  if (!projectId || !user?.uid) return null;
  const participants = Array.isArray(existingParticipants) ? existingParticipants : [];
  if (participants.some((participant) => participant.projectId === projectId && participant.uid === user.uid)) return null;
  return {
    projectId,
    uid: user.uid,
    name: cleanName(userName, user),
    value: normalizeParticipantValueInput(value),
    joinedAt,
    queueOrder: null,
  };
}

export function createQueueResultData(participants, generatedAt) {
  const pool = normalizedQueueParticipants(participants);
  if (pool.length === 0 || !generatedAt) return null;

  const updates = [];
  const steps = [];
  let order = 1;

  while (pool.length > 0) {
    const sum = pool.reduce((acc, participant) => acc + participant.value, 0);
    const selectedIndex = sum % pool.length;
    const winner = pool[selectedIndex];
    updates.push({ id: winner.id, queueOrder: order });
    steps.push({
      order,
      sum,
      remainingCount: pool.length,
      selectedIndex,
      participantId: winner.id,
      participantName: winner.name,
      participantValue: winner.value,
    });
    order += 1;
    pool.splice(selectedIndex, 1);
  }

  return {
    generatedAt,
    participantCount: updates.length,
    updates,
    steps,
  };
}

export function createBookingPatch(slot, user, userName, bookingData, bookedAt) {
  if (!slot?.id || !user?.uid) return null;
  if (slot.bookedBy) return null;
  return {
    bookedBy: user.uid,
    bookerName: cleanName(userName, user),
    bookingData: normalizeBookingDataInput(bookingData),
    bookedAt,
  };
}

export function createBookingWaitlistPatch(slot, user, userName, bookingData, joinedAt) {
  if (!slot?.id || !user?.uid || !slot.bookedBy || slot.bookedBy === user.uid) return null;
  const waitlist = normalizeBookingWaitlist(slot.waitlist);
  const existingEntry = waitlist.find((entry) => entry.uid === user.uid);
  if (existingEntry) {
    return {
      type: 'remove',
      waitlist: waitlist.filter((entry) => entry.uid !== user.uid),
    };
  }

  return {
    type: 'add',
    waitlist: [
      ...waitlist,
      {
        uid: user.uid,
        name: cleanName(userName, user),
        bookingData: normalizeBookingDataInput(bookingData),
        joinedAt,
      },
    ],
  };
}

export function createBookingReleasePatch(slot, releasedAt) {
  if (!slot?.id) return null;
  const waitlist = normalizeBookingWaitlist(slot.waitlist);
  const [promoted, ...remainingWaitlist] = waitlist;
  if (!promoted) {
    return {
      patch: {
        bookedBy: null,
        bookerName: null,
        bookingData: null,
        bookedAt: null,
        waitlist: [],
      },
      promoted: null,
    };
  }

  return {
    patch: {
      bookedBy: promoted.uid,
      bookerName: promoted.name,
      bookingData: normalizeBookingDataInput(promoted.bookingData),
      bookedAt: releasedAt,
      waitlist: remainingWaitlist,
    },
    promoted,
  };
}

export function normalizeBookingDataInput(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  return clonePlainValue(data);
}

export function createGatherSubmissionData(existingSubmissions, projectId, user, userName, data, submittedAt, fields = []) {
  if (!projectId || !user?.uid) return null;
  const submissions = Array.isArray(existingSubmissions) ? existingSubmissions : [];
  if (submissions.some((submission) => submission.projectId === projectId && submission.uid === user.uid)) return null;
  return {
    projectId,
    uid: user.uid,
    name: cleanName(userName, user),
    data: normalizeGatherSubmissionData(data, fields),
    submittedAt,
  };
}

export function createGatherFieldData(projectId, user, label, type = 'text', options = '', createdAt) {
  if (!projectId || !user?.uid) return null;
  const cleanLabel = normalizeProjectChildText(label);
  if (!cleanLabel) return null;
  const fieldType = normalizeGatherFieldType(type);
  const field = {
    projectId,
    label: cleanLabel,
    type: fieldType,
    creatorId: user.uid,
    createdAt,
  };

  if (fieldType === 'option') {
    const normalizedOptions = normalizeGatherOptions(options);
    if (normalizedOptions.length === 0) return null;
    field.options = normalizedOptions;
  }

  return field;
}

export function normalizeProjectChildText(value) {
  const cleanText = String(value ?? '').trim();
  if (!cleanText || cleanText.length > PROJECT_CHILD_TEXT_MAX_LENGTH) return null;
  return cleanText;
}

export function createRouletteJoinData(existingParticipants, projectId, user, userName, value, joinedAt) {
  if (!projectId || !user?.uid) return null;
  const participants = Array.isArray(existingParticipants) ? existingParticipants : [];
  if (participants.some((participant) => participant.projectId === projectId && participant.uid === user.uid)) return null;
  return {
    projectId,
    uid: user.uid,
    name: cleanName(userName, user),
    value: normalizeParticipantValueInput(value),
    joinedAt,
    isWinner: false,
  };
}

export function createRouletteResultData(participants, config = {}, generatedAt) {
  const pool = normalizedRouletteParticipants(participants);
  if (pool.length === 0 || !generatedAt) return null;

  const participantCount = pool.length;
  const configSnapshot = normalizeRouletteConfigInput(config || {});
  const initialTotal = pool.reduce((acc, participant) => acc + participant.value, 0);
  const steps = [];
  const winners = [];
  let currentSum = initialTotal;

  const selectByCurrentSum = (currentPoolLength) => Math.abs(currentSum) % currentPoolLength;
  const addWinner = (participant, rank, prize) => {
    winners.push(createRouletteWinner(participant, rank, prize));
  };
  const addStep = (type, step, participant, selectedIndex, remainingCount, rank, prize, repeat = false) => {
    steps.push({
      type,
      step,
      rank,
      sum: currentSum,
      remainingCount,
      selectedIndex,
      participantId: participant.id,
      participantName: participant.name,
      participantUid: participant.uid,
      participantValue: participant.value,
      ...(prize !== undefined ? { prize } : {}),
      repeat,
      target: createRouletteTarget(participant),
    });
  };

  const mode = configSnapshot.mode || 'classic';

  if (mode === 'classic') {
    const selectedIndex = selectByCurrentSum(pool.length);
    const winner = pool[selectedIndex];
    addStep('win', 1, winner, selectedIndex, pool.length, 1, undefined, false);
    addWinner(winner, 1);
  } else if (mode === 'multi') {
    const prizeQueue = createRoulettePrizeQueue(configSnapshot);
    const allowRepeat = Boolean(configSnapshot.allowRepeat);

    for (let index = 0; index < prizeQueue.length; index += 1) {
      if (pool.length === 0) break;
      const prize = prizeQueue[index];
      const selectedIndex = allowRepeat
        ? getRepeatIndex(initialTotal, pool.length, index)
        : selectByCurrentSum(pool.length);
      const winner = pool[selectedIndex];
      const rank = index + 1;
      addStep('win', rank, winner, selectedIndex, pool.length, rank, prize, allowRepeat);
      addWinner(winner, rank, prize);

      if (!allowRepeat) {
        currentSum -= winner.value;
        pool.splice(selectedIndex, 1);
      }
    }
  } else if (mode === 'elim') {
    let survivorsNeeded = Number.parseInt(configSnapshot.survivorCount, 10) || 1;
    if (survivorsNeeded < 1) survivorsNeeded = 1;
    if (survivorsNeeded >= pool.length && pool.length > 0) survivorsNeeded = Math.max(1, pool.length - 1);

    let step = 1;
    let loopGuard = 0;
    while (pool.length > survivorsNeeded && loopGuard < 1000) {
      loopGuard += 1;
      const selectedIndex = selectByCurrentSum(pool.length);
      const eliminated = pool[selectedIndex];
      addStep('elim', step, eliminated, selectedIndex, pool.length, undefined, undefined, false);
      step += 1;
      currentSum -= eliminated.value;
      pool.splice(selectedIndex, 1);
    }

    loopGuard = 0;
    while (pool.length > 0 && loopGuard < 1000) {
      loopGuard += 1;
      const selectedIndex = selectByCurrentSum(pool.length);
      const winner = pool[selectedIndex];
      const rank = winners.length + 1;
      addStep('win', step, winner, selectedIndex, pool.length, rank, undefined, false);
      addWinner(winner, rank);
      step += 1;
      currentSum -= winner.value;
      pool.splice(selectedIndex, 1);
    }
  }

  const winnerUpdates = [...new Map(winners.map((winner) => [winner.participantId, {
    id: winner.participantId,
    isWinner: true,
  }])).values()];

  return {
    generatedAt,
    participantCount,
    seed: initialTotal,
    totalValue: initialTotal,
    configSnapshot,
    winnerUpdates,
    winners,
    steps,
  };
}

export function createRpsNextRoundPatch(room, transitionAt) {
  if (!room?.id || room.game !== 'rps' || !transitionAt) return null;
  const players = normalizeRpsPlayers(room.players, room.config);
  if (players.length < 2) return null;

  const { bestOf } = normalizeRpsRoomConfig(room.config);
  const resetPlayers = players.map((player) => ({
    ...player,
    lastMove: player.move || player.lastMove || null,
    move: null,
  }));
  const winThreshold = Math.floor(bestOf / 2) + 1;
  const winner = players.find((player) => player.score >= winThreshold);

  if (winner) {
    return {
      status: 'finished',
      winnerId: winner.uid,
      finishedAt: transitionAt,
      players: resetPlayers,
      resultSummary: createGameRoomSummary({
        ...room,
        status: 'finished',
        winnerId: winner.uid,
        players: resetPlayers,
      }),
    };
  }

  return {
    status: 'playing',
    currentRound: normalizeRpsCurrentRoundInput(
      room.currentRound,
      Array.isArray(room.history) && room.history.length > 0 ? room.history.length : 1,
    ) + 1,
    roundStartTime: transitionAt,
    players: resetPlayers,
  };
}

export function createGameRoomSummary(room) {
  if (!room?.id) return null;
  const derivedSummary = createDerivedGameRoomSummary(room);
  if (!room.resultSummary) return derivedSummary;
  return mergeStoredGameRoomSummary(derivedSummary, room.resultSummary);
}

function createDerivedGameRoomSummary(room) {
  const players = Array.isArray(room.players) ? room.players : [];
  const playerCount = players.length;
  if (room.game === 'rps') {
    const rpsPlayers = normalizeRpsPlayers(players, room.config);
    const winner = rpsPlayers.find((player) => player.uid === room.winnerId) || null;
    const scores = rpsPlayers.map((player) => player.score);
    const history = Array.isArray(room.history) ? room.history : [];
    const lastRound = history[history.length - 1] || null;
    const lastRoundWinner = lastRound?.winnerId
      ? rpsPlayers.find((player) => player.uid === lastRound.winnerId)
      : null;

    return {
      game: 'rps',
      status: room.status || 'waiting',
      winnerId: winner?.uid || null,
      winnerName: winner?.name || '',
      roundsPlayed: history.length || Number.parseInt(room.currentRound, 10) || 0,
      scoreLine: scores.length > 0 ? scores.join(' - ') : '',
      playerCount,
      ...(lastRound ? {
        lastRound: {
          round: Number.parseInt(lastRound.round, 10) || history.length,
          p1Move: lastRound.p1Move || '',
          p2Move: lastRound.p2Move || '',
          winnerId: lastRound.winnerId || null,
          winnerName: lastRoundWinner?.name || '',
        },
      } : {}),
    };
  }

  const minePlayers = players.map((player) => ({
    ...player,
    progress: normalizeMineProgressInput(player.progress),
  }));
  const leader = [...minePlayers].sort((a, b) => b.progress - a.progress)[0] || null;
  const winner = minePlayers.find((player) => player.status === 'won') || null;
  return {
    game: room.game || 'mine',
    status: room.status || 'playing',
    winnerId: winner?.uid || null,
    winnerName: winner?.name || '',
    roundsPlayed: 0,
    scoreLine: leader ? `${leader.progress}%` : '',
    playerCount,
  };
}

function mergeStoredGameRoomSummary(derivedSummary, storedSummary) {
  if (!storedSummary || typeof storedSummary !== 'object' || Array.isArray(storedSummary)) {
    return derivedSummary;
  }

  const storedLastRound = normalizeStoredGameLastRound(storedSummary.lastRound);
  const summary = {
    game: derivedSummary.game || normalizeSummaryText(storedSummary.game),
    status: derivedSummary.status || normalizeSummaryText(storedSummary.status),
    winnerId: derivedSummary.winnerId || null,
    winnerName: derivedSummary.winnerName || '',
    roundsPlayed: Number.isInteger(derivedSummary.roundsPlayed)
      ? derivedSummary.roundsPlayed
      : normalizeNonNegativeInteger(storedSummary.roundsPlayed),
    scoreLine: derivedSummary.scoreLine || normalizeSummaryText(storedSummary.scoreLine),
    playerCount: Number.isInteger(derivedSummary.playerCount)
      ? derivedSummary.playerCount
      : normalizeNonNegativeInteger(storedSummary.playerCount),
  };

  const lastRound = derivedSummary.lastRound || storedLastRound;
  return lastRound ? { ...summary, lastRound } : summary;
}

function normalizeStoredGameLastRound(lastRound) {
  if (!lastRound || typeof lastRound !== 'object' || Array.isArray(lastRound)) return null;
  return {
    round: Math.max(1, normalizeNonNegativeInteger(lastRound.round)),
    p1Move: normalizeSummaryText(lastRound.p1Move),
    p2Move: normalizeSummaryText(lastRound.p2Move),
    winnerId: normalizeSummaryText(lastRound.winnerId) || null,
    winnerName: normalizeSummaryText(lastRound.winnerName),
  };
}

function normalizeNonNegativeInteger(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) return 0;
  return parsed;
}

function normalizeSummaryText(value) {
  return String(value ?? '').trim();
}

export function createUserGameResultHistory(rooms, uid, limit = 3) {
  const cleanUid = String(uid || '').trim();
  const emptyHistory = {
    stats: { total: 0, wins: 0, losses: 0, draws: 0 },
    recent: [],
  };
  if (!cleanUid) return emptyHistory;

  const parsedLimit = Number.parseInt(limit, 10);
  const recentLimit = Number.isFinite(parsedLimit) ? Math.max(0, parsedLimit) : 3;
  const entries = (Array.isArray(rooms) ? rooms : [])
    .filter((room) => (
      room?.status === 'finished'
      && Array.isArray(room.players)
      && room.players.some((player) => player.uid === cleanUid)
    ))
    .map((room) => {
      const summary = createGameRoomSummary(room) || {};
      const players = Array.isArray(room.players) ? room.players : [];
      const winner = room.winnerId
        ? players.find((player) => player.uid === room.winnerId) || null
        : null;
      const result = !room.winnerId ? 'draw' : room.winnerId === cleanUid ? 'win' : 'loss';

      return {
        id: room.id,
        roomName: room.name || '',
        game: room.game || summary.game || '',
        finishedAt: room.finishedAt || room.createdAt || 0,
        result,
        winnerId: room.winnerId || null,
        winnerName: summary.winnerName || winner?.name || '',
        scoreLine: summary.scoreLine || '',
        roundsPlayed: summary.roundsPlayed || 0,
        playerCount: summary.playerCount || players.length,
      };
    })
    .sort((a, b) => (Number(b.finishedAt) || 0) - (Number(a.finishedAt) || 0));

  const stats = entries.reduce((result, entry) => {
    result.total += 1;
    if (entry.result === 'win') result.wins += 1;
    else if (entry.result === 'loss') result.losses += 1;
    else result.draws += 1;
    return result;
  }, { total: 0, wins: 0, losses: 0, draws: 0 });

  return {
    stats,
    recent: entries.slice(0, recentLimit),
  };
}

export function getGameRoomInviteId(search = '') {
  const query = String(search || '').trim().replace(/^\?/, '');
  if (!query) return null;
  return normalizeGameRoomInviteId(new URLSearchParams(query).get(GAME_ROOM_INVITE_PARAM));
}

export function createGameRoomInviteUrl(href, roomId) {
  const source = String(href || '').trim();
  if (!source) return '';

  const isAbsoluteUrl = /^[a-z][a-z\d+.-]*:/i.test(source);
  try {
    const url = new URL(source, isAbsoluteUrl ? undefined : 'https://atmostfair.local');
    const cleanRoomId = normalizeGameRoomInviteId(roomId);
    if (cleanRoomId) url.searchParams.set(GAME_ROOM_INVITE_PARAM, cleanRoomId);
    else url.searchParams.delete(GAME_ROOM_INVITE_PARAM);
    return isAbsoluteUrl ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '';
  }
}

export function createMineRoomProgressPatch(room, user, progress, status, transitionAt) {
  if (!room?.id || room.game !== 'mine' || room.status === 'finished' || !user?.uid) return null;
  const players = Array.isArray(room.players) ? clonePlainValue(room.players) : [];
  const playerIndex = players.findIndex((player) => player.uid === user.uid);
  if (playerIndex < 0) return null;

  const nextProgress = Number.parseInt(progress, 10);
  if (!Number.isInteger(nextProgress) || nextProgress < 0 || nextProgress > 100) return null;
  const nextStatus = MINE_PLAYER_STATUSES.has(status) ? status : null;
  if (!nextStatus) return null;
  if (nextStatus === 'won' && nextProgress !== 100) return null;
  if (nextProgress === 100 && nextStatus !== 'won') return null;

  const nextPlayers = players.map((player, index) => (
    index === playerIndex ? { ...player, progress: nextProgress, status: nextStatus } : player
  ));
  const patch = { players: nextPlayers };
  const winner = nextPlayers.find((player) => player.status === 'won') || null;
  const allPlayersDone = nextPlayers.length > 0 && nextPlayers.every((player) => MINE_TERMINAL_STATUSES.has(player.status));
  if (nextStatus !== 'won' && !allPlayersDone) return patch;

  const winnerId = winner?.uid || null;
  const finishedRoom = {
    ...room,
    status: 'finished',
    players: nextPlayers,
    winnerId,
  };

  return {
    ...patch,
    status: 'finished',
    winnerId,
    finishedAt: transitionAt,
    resultSummary: createGameRoomSummary(finishedRoom),
  };
}

export function createGameRoomCreateData(projectId, user, roomName, game, options = {}, createdAt) {
  const cleanProjectId = String(projectId || '').trim();
  if (!cleanProjectId || !user?.uid || !GAME_ROOM_TYPES.has(game)) return null;
  const cleanRoomName = normalizeProjectChildText(roomName);
  if (!cleanRoomName) return null;

  const base = {
    projectId: cleanProjectId,
    name: cleanRoomName,
    game,
    status: game === 'mine' ? 'playing' : 'waiting',
    players: [],
    config: game === 'mine' ? normalizeMineRoomConfig(options) : normalizeRpsRoomConfig(options),
    createdAt,
    createdBy: user.uid,
  };

  if (game === 'mine') return base;
  if (!options?.vsComputer) return base;

  return {
    ...base,
    status: 'playing',
    players: [
      { uid: user.uid, name: cleanName(options.userName, user), score: 0, move: null },
      { uid: 'computer', name: String(options.botName || 'Bot').trim() || 'Bot', score: 0, move: null },
    ],
    currentRound: normalizeRpsCurrentRoundInput(options.currentRound),
    roundStartTime: options.roundStartTime ?? createdAt,
  };
}

export function createGameRoomJoinPatch(room, user, userName, joinedAt) {
  if (!room?.id || !user?.uid || room.status === 'finished') return null;
  const players = Array.isArray(room.players) ? clonePlainValue(room.players) : [];
  if (players.some((player) => player.uid === user.uid)) return null;

  if (room.game === 'rps') {
    if (room.status !== 'waiting' || players.length >= 2) return null;
    const nextPlayers = [
      ...players,
      { uid: user.uid, name: cleanName(userName, user), score: 0, move: null },
    ];
    const patch = { players: nextPlayers };
    if (nextPlayers.length === 2) {
      patch.status = 'playing';
      patch.roundStartTime = joinedAt;
      patch.currentRound = 1;
    }
    return patch;
  }

  if (room.game === 'mine') {
    if (!['waiting', 'playing'].includes(room.status || 'playing') || players.length >= 8) return null;
    return {
      players: [
        ...players,
        { uid: user.uid, name: cleanName(userName, user), progress: 0, status: 'playing' },
      ],
    };
  }

  return null;
}

function normalizeRpsRoomConfig(config) {
  const bestOf = [1, 3, 5].includes(Number.parseInt(config?.bestOf, 10))
    ? Number.parseInt(config.bestOf, 10)
    : 3;
  const timeout = [15, 30, 60].includes(Number.parseInt(config?.timeout, 10))
    ? Number.parseInt(config.timeout, 10)
    : 30;
  return { bestOf, timeout };
}

export function normalizeRpsCurrentRoundInput(value, fallback = 1) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

export function normalizeRpsScoreInput(value, config) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return 0;
  const { bestOf } = normalizeRpsRoomConfig(config);
  const maxScore = Math.floor(bestOf / 2) + 1;
  return Math.min(maxScore, Math.max(0, parsed));
}

export function normalizeMineProgressInput(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return 0;
  return Math.min(100, Math.max(0, parsed));
}

function normalizeMineRoomConfig(config) {
  const difficulty = ['easy', 'medium', 'hard'].includes(config?.difficulty) ? config.difficulty : 'easy';
  const rows = normalizeBoundedInt(config?.rows, 1, 30, difficulty === 'hard' ? 16 : difficulty === 'medium' ? 16 : 9);
  const cols = normalizeBoundedInt(config?.cols, 1, 30, difficulty === 'hard' ? 30 : difficulty === 'medium' ? 16 : 9);
  const maxMines = Math.max(1, rows * cols - 1);
  const mines = normalizeBoundedInt(config?.mines, 1, maxMines, difficulty === 'hard' ? 99 : difficulty === 'medium' ? 40 : 10);
  const mineLocations = Array.isArray(config?.mineLocations)
    ? [...new Set(config.mineLocations.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, mines)
    : [];

  return { difficulty, rows, cols, mines, mineLocations };
}

function normalizeBoundedInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function createScheduleSubmissionWrite(existingSubmissions, projectId, user, userName, availability, submittedAt, config) {
  if (!projectId || !user?.uid) return null;
  const normalizedAvailability = normalizeScheduleAvailabilityInput(availability, config);
  if (normalizedAvailability === null) return null;
  const submissions = Array.isArray(existingSubmissions) ? existingSubmissions : [];
  const existing = submissions.find((submission) => submission.projectId === projectId && submission.uid === user.uid);
  if (existing?.id) {
    return {
      type: 'update',
      collection: 'schedule_submissions',
      id: existing.id,
      data: {
        availability: normalizedAvailability,
        submittedAt,
      },
    };
  }

  return {
    type: 'add',
    collection: 'schedule_submissions',
    data: {
      projectId,
      uid: user.uid,
      name: cleanName(userName, user),
      availability: normalizedAvailability,
      submittedAt,
    },
  };
}

export function createScheduleConfigData(config) {
  if (!config || !SCHEDULE_MODES.has(config.mode)) return null;
  const base = createDateRangeConfigData(config, config.mode);
  if (!base) return null;
  const deadline = String(config.deadline || '').trim();
  if (deadline && !isValidDateTimeLocal(deadline)) return null;
  return { ...base, deadline };
}

export function createBookingConfigData(config) {
  if (!config || !BOOKING_MODES.has(config.mode)) return null;
  const base = createDateRangeConfigData(config, config.mode);
  if (!base) return null;
  return {
    ...base,
    requiredFields: normalizeRequiredFields(config.requiredFields),
  };
}

export function createBookingSlotData(projectId, start, end, label, createdAt, config) {
  const cleanProjectId = String(projectId || '').trim();
  const cleanLabel = normalizeProjectChildText(label);
  const slotRange = normalizeBookingSlotRange(start, end, config);
  if (!cleanProjectId || !cleanLabel || !slotRange) return null;

  return {
    projectId: cleanProjectId,
    ...slotRange,
    label: cleanLabel,
    bookedBy: null,
    bookerName: null,
    bookingData: null,
    bookedAt: null,
    waitlist: [],
    createdAt,
  };
}

export function createDateRangeDays(config) {
  if (!config?.mode) return [];
  const data = SCHEDULE_MODES.has(config.mode)
    ? createScheduleConfigData(config)
    : createBookingConfigData(config);
  if (!data) return [];

  const dates = [];
  const cursor = new Date(`${data.start}T00:00:00Z`);
  const end = new Date(`${data.end}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function createScheduleHeatmapData(submissions, config) {
  return Object.fromEntries(
    [...createScheduleBucketCounts(submissions, config).values()].map((entry) => [entry.key, entry.count]),
  );
}

export function createScheduleRecommendationSummary(submissions, config, limit = 3) {
  const participantCount = Array.isArray(submissions) ? submissions.length : 0;
  if (!participantCount || !config?.mode) {
    return { participantCount, recommendations: [] };
  }

  const recommendations = [...createScheduleBucketCounts(submissions, config).values()]
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, Math.max(0, Number.parseInt(limit, 10) || 0))
    .map((entry) => ({
      ...entry,
      participantCount,
      coverage: entry.count / participantCount,
    }));

  return { participantCount, recommendations };
}

export function createClaimToggleData(item, user, userName, claimedAt) {
  if (!item?.id || !user?.uid) return null;
  const rawClaimants = Array.isArray(item.claimants) ? item.claimants : [];
  const existingClaim = rawClaimants.find((claimant) => claimant?.uid === user.uid);
  if (existingClaim) {
    return {
      type: 'remove',
      claimant: existingClaim,
    };
  }

  const maxClaims = normalizeClaimCapacityInput(item.maxClaims);
  const claimants = normalizeClaimItemClaimants(item);
  if (claimants.length >= maxClaims) return null;
  return {
    type: 'add',
    claimant: {
      uid: user.uid,
      name: cleanName(userName, user),
      at: claimedAt,
    },
  };
}

export function normalizeClaimItemClaimants(item) {
  const rawClaimants = Array.isArray(item?.claimants) ? item.claimants : [];
  const maxClaims = normalizeClaimCapacityInput(item?.maxClaims);
  const normalized = [];
  const seen = new Set();

  for (const claimant of rawClaimants) {
    if (!claimant || typeof claimant !== 'object') continue;
    const uid = String(claimant.uid ?? '').trim();
    const name = String(claimant.name ?? '').trim().slice(0, PROJECT_CREATOR_NAME_MAX_LENGTH);
    const displayName = name || uid;
    if (!uid && !displayName) continue;

    const key = uid ? `uid:${uid}` : `name:${displayName}`;
    if (seen.has(key)) continue;
    seen.add(key);

    normalized.push({
      ...(uid ? { uid } : {}),
      name: displayName,
      ...(claimant.at !== undefined ? { at: claimant.at } : {}),
    });

    if (normalized.length >= maxClaims) break;
  }

  return normalized;
}

export function normalizeClaimCapacityInput(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return CLAIM_CAPACITY_MIN;
  return Math.min(CLAIM_CAPACITY_MAX, Math.max(CLAIM_CAPACITY_MIN, parsed));
}

export function normalizeParticipantValueInput(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return PARTICIPANT_VALUE_DEFAULT;
  return Math.min(PARTICIPANT_VALUE_MAX, Math.max(PARTICIPANT_VALUE_MIN, parsed));
}

export function normalizeTeamRoomCapacityInput(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return TEAM_ROOM_CAPACITY_DEFAULT;
  return Math.min(TEAM_ROOM_CAPACITY_MAX, Math.max(TEAM_ROOM_CAPACITY_MIN, parsed));
}

export function normalizeRoulettePrizeCountInput(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return ROULETTE_PRIZE_COUNT_MIN;
  return Math.min(ROULETTE_PRIZE_COUNT_MAX, Math.max(ROULETTE_PRIZE_COUNT_MIN, parsed));
}

export function normalizeRouletteSurvivorCountInput(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return ROULETTE_SURVIVOR_COUNT_MIN;
  return Math.min(ROULETTE_SURVIVOR_COUNT_MAX, Math.max(ROULETTE_SURVIVOR_COUNT_MIN, parsed));
}

export function normalizeRouletteReplaySpeedInput(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return ROULETTE_REPLAY_SPEED_DEFAULT;
  return Math.min(ROULETTE_REPLAY_SPEED_MAX, Math.max(ROULETTE_REPLAY_SPEED_MIN, parsed));
}

export function normalizeRouletteConfigInput(config = {}) {
  const sourceConfig = config && typeof config === 'object' ? config : {};
  const normalizedConfig = { ...sourceConfig };
  if ('mode' in normalizedConfig) {
    normalizedConfig.mode = ROULETTE_MODES.has(normalizedConfig.mode) ? normalizedConfig.mode : 'classic';
  }
  if ('order' in normalizedConfig) {
    normalizedConfig.order = ROULETTE_ORDERS.has(normalizedConfig.order) ? normalizedConfig.order : 'fwd';
  }
  if ('survivorCount' in normalizedConfig) {
    normalizedConfig.survivorCount = normalizeRouletteSurvivorCountInput(normalizedConfig.survivorCount);
  }
  if ('replaySpeed' in normalizedConfig) {
    normalizedConfig.replaySpeed = normalizeRouletteReplaySpeedInput(normalizedConfig.replaySpeed);
  }
  for (const key of ['allowRepeat', 'enableReplay', 'creatorWeightPublic']) {
    if (key in normalizedConfig) normalizedConfig[key] = normalizedConfig[key] === true;
  }
  if (Array.isArray(normalizedConfig.prizes)) {
    normalizedConfig.prizes = normalizedConfig.prizes.map((prize) => {
      const prizeRecord = prize && typeof prize === 'object' ? prize : {};
      return {
        ...prizeRecord,
        count: normalizeRoulettePrizeCountInput(prizeRecord.count),
      };
    });
  }
  return normalizedConfig;
}

export function normalizeVotingMode(votingConfig) {
  return votingConfig?.mode === 'single' ? 'single' : 'multiple';
}

export function createVoteToggleOperations(items, targetItem, user, votingConfig) {
  if (!targetItem?.id || !targetItem.projectId || !user?.uid) return [];
  const votes = Array.isArray(targetItem.votes) ? targetItem.votes : [];
  const hasVoted = votes.includes(user.uid);
  if (hasVoted) return [createVoteOperation(targetItem.id, 'removeVote', user.uid)];

  if (normalizeVotingMode(votingConfig) !== 'single') {
    return [createVoteOperation(targetItem.id, 'addVote', user.uid)];
  }

  const operations = [];
  const projectItems = Array.isArray(items) ? items : [];
  for (const item of projectItems) {
    if (!item?.id || item.id === targetItem.id || item.projectId !== targetItem.projectId) continue;
    const itemVotes = Array.isArray(item.votes) ? item.votes : [];
    if (itemVotes.includes(user.uid)) operations.push(createVoteOperation(item.id, 'removeVote', user.uid));
  }
  operations.push(createVoteOperation(targetItem.id, 'addVote', user.uid));
  return operations;
}

export function createProjectStatusPatch(project, user, isAdmin) {
  if (!project?.id || !user?.uid) return null;
  if (project.creatorId !== user.uid && !isAdmin) return null;
  if (project.status === 'finished') return null;
  return {
    status: project.status === 'active' ? 'stopped' : 'active',
  };
}

export function createProjectBriefPatch(project, user, isAdmin, brief, updatedAt) {
  if (!project?.id || !user?.uid || !updatedAt) return null;
  if (project.creatorId !== user.uid && !isAdmin) return null;
  if (project.status === 'stopped' || project.status === 'finished') return null;
  const cleanBrief = String(brief || '').trim();
  if (cleanBrief.length > PROJECT_BRIEF_MAX_LENGTH) return null;
  return {
    brief: cleanBrief,
    briefUpdatedAt: updatedAt,
    briefUpdatedBy: user.uid,
    briefUpdatedByName: cleanName('', user),
  };
}

export function createProjectCreateData(title, type, user, creatorName, password, createdAt) {
  if (!user?.uid || !PROJECT_TYPES.has(type)) return null;
  const cleanTitle = String(title || '').trim();
  const cleanPassword = String(password || '').trim();
  if (!cleanTitle || cleanTitle.length > PROJECT_TITLE_MAX_LENGTH) return null;
  if (cleanPassword.length > PROJECT_PASSWORD_MAX_LENGTH) return null;
  return {
    title: cleanTitle,
    type,
    creatorId: user.uid,
    creatorName: cleanName(creatorName, user),
    password: cleanPassword,
    status: 'active',
    createdAt,
    winners: [],
  };
}

export function createProjectTemplateSeedData(templateId, projectType, projectId, user, creatorName, createdAt, translate = (key) => key) {
  const template = getDashboardProjectTemplate(templateId);
  if (!template || template.projectType !== projectType) return createEmptyProjectTemplateSeed();

  const seedConfig = template.seed || {};
  const projectPatch = createProjectTemplateProjectPatch(seedConfig, createdAt, translate);
  const cleanProjectId = String(projectId || '').trim();
  if (!cleanProjectId || !user?.uid) return { projectPatch, childOperations: [] };

  return {
    projectPatch,
    childOperations: createProjectTemplateChildOperations(seedConfig, cleanProjectId, user, creatorName, createdAt, translate),
  };
}

function createEmptyProjectTemplateSeed() {
  return { projectPatch: {}, childOperations: [] };
}

function createProjectTemplateProjectPatch(seedConfig, createdAt, translate) {
  if (seedConfig?.kind === 'schedule_config') {
    const scheduleConfig = createScheduleConfigData({
      mode: seedConfig.mode || 'date',
      start: createTemplateSeedDate(createdAt, seedConfig.startOffsetDays),
      end: createTemplateSeedDate(createdAt, seedConfig.endOffsetDays),
      deadline: '',
    });
    return scheduleConfig ? { scheduleConfig } : {};
  }

  if (seedConfig?.kind === 'booking_slots') {
    const bookingConfig = createBookingConfigData({
      mode: seedConfig.mode || 'half',
      start: createTemplateSeedDate(createdAt, seedConfig.startOffsetDays),
      end: createTemplateSeedDate(createdAt, seedConfig.endOffsetDays),
      requiredFields: translateTemplateSeedText(seedConfig.requiredFieldsKey, translate),
    });
    return bookingConfig ? { bookingConfig } : {};
  }

  if (seedConfig?.projectPatch) return clonePlainValue(seedConfig.projectPatch);
  return {};
}

function createProjectTemplateChildOperations(seedConfig, projectId, user, creatorName, createdAt, translate) {
  const ownerName = cleanName(creatorName, user);
  const operations = [];

  if (seedConfig?.kind === 'voting_items') {
    for (const titleKey of seedConfig.itemTitleKeys || []) {
      const title = translateTemplateSeedText(titleKey, translate);
      if (!title) continue;
      operations.push({
        type: 'add',
        collection: 'voting_items',
        data: {
          projectId,
          title,
          creatorId: user.uid,
          creatorName: ownerName,
          votes: [],
          createdAt,
        },
      });
    }
  }

  if (seedConfig?.kind === 'gather_fields') {
    for (const field of seedConfig.fields || []) {
      const label = translateTemplateSeedText(field.labelKey, translate);
      const options = (field.optionKeys || []).map((key) => translateTemplateSeedText(key, translate));
      const data = createGatherFieldData(projectId, user, label, field.type || 'text', options, createdAt);
      if (!data) continue;
      operations.push({ type: 'add', collection: 'gather_fields', data });
    }
  }

  if (seedConfig?.kind === 'booking_slots') {
    for (const slot of seedConfig.slots || []) {
      const date = createTemplateSeedDate(createdAt, slot.offsetDays);
      const period = String(slot.period || '').trim();
      const label = translateTemplateSeedText(slot.labelKey, translate);
      if (!date || !period || !label) continue;
      const slotKey = `${date}_${period}`;
      operations.push({
        type: 'add',
        collection: 'booking_slots',
        data: {
          projectId,
          start: slotKey,
          end: slotKey,
          label,
          bookedBy: null,
          waitlist: [],
          createdAt,
        },
      });
    }
  }

  if (seedConfig?.kind === 'rooms') {
    for (const room of seedConfig.rooms || []) {
      const name = translateTemplateSeedText(room.nameKey, translate);
      if (!name) continue;
      operations.push({
        type: 'add',
        collection: 'rooms',
        data: {
          projectId,
          name,
          ownerId: user.uid,
          maxMembers: normalizeTeamRoomCapacityInput(room.maxMembers),
          members: [],
          createdAt,
        },
      });
    }
  }

  if (seedConfig?.kind === 'claim_items') {
    for (const item of seedConfig.items || []) {
      const title = translateTemplateSeedText(item.titleKey, translate);
      if (!title) continue;
      operations.push({
        type: 'add',
        collection: 'claim_items',
        data: {
          projectId,
          title,
          maxClaims: normalizeClaimCapacityInput(item.maxClaims),
          claimants: [],
          creatorId: user.uid,
          creatorName: ownerName,
          createdAt,
        },
      });
    }
  }

  if (seedConfig?.kind === 'game_rooms') {
    for (const room of seedConfig.rooms || []) {
      const name = translateTemplateSeedText(room.nameKey, translate);
      const data = createGameRoomCreateData(projectId, user, name, room.game, room.options || {}, createdAt);
      if (!data) continue;
      operations.push({ type: 'add', collection: 'game_rooms', data });
    }
  }

  return operations;
}

function translateTemplateSeedText(key, translate) {
  const cleanKey = String(key || '').trim();
  if (!cleanKey) return '';
  const value = typeof translate === 'function' ? translate(cleanKey) : cleanKey;
  return normalizeProjectChildText(value) || cleanKey;
}

function createTemplateSeedDate(createdAt, offsetDays = 0) {
  const baseMs = Number(createdAt);
  const safeBaseMs = Number.isFinite(baseMs) ? baseMs : Date.now();
  const safeOffsetDays = Number.isFinite(Number(offsetDays)) ? Number(offsetDays) : 0;
  return new Date(safeBaseMs + (safeOffsetDays * TEMPLATE_SEED_DAY_MS)).toISOString().slice(0, 10);
}

export function createProjectDuplicateData(sourceProject, user, creatorName, createdAt, titleSuffix = '') {
  if (!sourceProject?.id || !sourceProject?.type || !user?.uid) return null;
  const sourcePassword = sourceProject.password || '';
  const duplicate = {
    title: `${sourceProject.title || ''}${titleSuffix}`,
    type: sourceProject.type,
    creatorId: user.uid,
    creatorName: cleanName(creatorName, user),
    password: sourcePassword,
    status: 'active',
    createdAt,
    winners: [],
  };
  if (!sourcePassword && sourceProject.hasPassword) duplicate.duplicateSourceId = sourceProject.id;

  for (const key of ['rouletteConfig', 'scheduleConfig', 'bookingConfig', 'votingConfig']) {
    if (sourceProject[key] !== undefined) duplicate[key] = clonePlainValue(sourceProject[key]);
  }
  if (sourceProject.brief) duplicate.brief = String(sourceProject.brief).trim();

  return duplicate;
}

export function createProjectDuplicateChildOperations(newProjectId, docsByCollection, user, creatorName, createdAt) {
  if (!newProjectId || !user?.uid) return [];
  const ownerName = cleanName(creatorName, user);
  const operations = [];

  for (const item of normalizedCollection(docsByCollection, 'voting_items')) {
    operations.push({
      type: 'add',
      collection: 'voting_items',
      data: {
        projectId: newProjectId,
        title: item.title || '',
        creatorId: user.uid,
        creatorName: ownerName,
        votes: [],
        createdAt,
      },
    });
  }

  for (const room of normalizedCollection(docsByCollection, 'rooms')) {
    operations.push({
      type: 'add',
      collection: 'rooms',
      data: {
        projectId: newProjectId,
        name: room.name || '',
        ownerId: user.uid,
        maxMembers: normalizeTeamRoomCapacityInput(room.maxMembers),
        members: [],
        createdAt,
      },
    });
  }

  for (const field of normalizedCollection(docsByCollection, 'gather_fields')) {
    operations.push({
      type: 'add',
      collection: 'gather_fields',
      data: {
        projectId: newProjectId,
        label: field.label || '',
        type: field.type || 'text',
        ...(Array.isArray(field.options) ? { options: clonePlainValue(field.options) } : {}),
        creatorId: user.uid,
        createdAt,
      },
    });
  }

  for (const slot of normalizedCollection(docsByCollection, 'booking_slots')) {
    operations.push({
      type: 'add',
      collection: 'booking_slots',
      data: {
        projectId: newProjectId,
        start: slot.start,
        end: slot.end,
        label: slot.label,
        bookedBy: null,
        waitlist: [],
        createdAt,
      },
    });
  }

  for (const item of normalizedCollection(docsByCollection, 'claim_items')) {
    operations.push({
      type: 'add',
      collection: 'claim_items',
      data: {
        projectId: newProjectId,
        title: item.title || '',
        maxClaims: normalizeClaimCapacityInput(item.maxClaims),
        claimants: [],
        creatorId: user.uid,
        creatorName: ownerName,
        createdAt,
      },
    });
  }

  return operations;
}

export async function commitProjectCreateWithRollback({
  db,
  collection,
  addDoc,
  deleteDoc,
  projectData,
  createChildOperations,
  childOperations,
}) {
  const projectRef = await addDoc(collection(db, 'projects'), projectData);
  const createdChildRefs = [];

  try {
    const operations = typeof createChildOperations === 'function'
      ? createChildOperations(projectRef)
      : childOperations;
    for (const operation of operations || []) {
      if (operation?.type !== 'add') continue;
      const childRef = await addDoc(collection(db, operation.collection), operation.data);
      createdChildRefs.push(childRef);
    }
    return projectRef;
  } catch (error) {
    const refsToDelete = [...createdChildRefs].reverse();
    refsToDelete.push(projectRef);
    await Promise.allSettled(refsToDelete.map((ref) => deleteDoc(ref)));
    throw error;
  }
}

export async function commitProjectDuplicateWithRollback(options) {
  return commitProjectCreateWithRollback(options);
}

export function createProjectCascadeDeleteOperations(projectId, docsByCollection) {
  if (!projectId) return [];
  const operations = [];

  for (const { name, field } of PROJECT_CASCADE_COLLECTIONS) {
    if (name === 'projects') continue;
    const docs = Array.isArray(docsByCollection?.[name]) ? docsByCollection[name] : [];
    for (const entry of docs) {
      if (!entry?.id) continue;
      if (entry[field] !== projectId) continue;
      operations.push({ type: 'delete', collection: name, id: entry.id });
    }
  }

  operations.push({ type: 'delete', collection: 'projects', id: projectId });

  return operations;
}

export function createProjectOrphanCleanupPlan(projects, docsByCollection) {
  const projectIds = new Set((Array.isArray(projects) ? projects : []).map((project) => project?.id).filter(Boolean));
  const collections = {};
  const operations = [];

  for (const { name, field } of PROJECT_CASCADE_COLLECTIONS) {
    if (name === 'projects') continue;

    const orphanDocs = normalizedCollection(docsByCollection, name).filter((entry) => (
      entry?.id && !projectIds.has(entry[field])
    ));

    collections[name] = orphanDocs;
    orphanDocs.forEach((entry) => {
      operations.push({ type: 'delete', collection: name, id: entry.id });
    });
  }

  return { collections, operations };
}

function cleanName(userName, user) {
  const explicit = String(userName || '').trim();
  const fallback = user?.displayName || user?.email?.split('@')[0] || '';
  return String(explicit || fallback || '').trim().slice(0, PROJECT_CREATOR_NAME_MAX_LENGTH);
}

function normalizeGameRoomInviteId(value) {
  const cleanValue = String(value ?? '').trim();
  return cleanValue || null;
}

function normalizedCollection(docsByCollection, collectionName) {
  return Array.isArray(docsByCollection?.[collectionName]) ? docsByCollection[collectionName] : [];
}

export function normalizeGatherSubmissionData(data, fields) {
  if (!Array.isArray(fields) || fields.length === 0) return data || {};
  const source = data && typeof data === 'object' ? data : {};
  return fields.reduce((result, field) => {
    if (!field?.id) return result;
    result[field.id] = normalizeGatherSubmissionValue(field, source[field.id]);
    return result;
  }, {});
}

function normalizeGatherSubmissionValue(field, value) {
  const text = String(value ?? '').trim();
  const fieldType = normalizeGatherFieldType(field.type);
  if (fieldType === 'number') return text !== '' && Number.isFinite(Number(text)) ? text : '';
  if (fieldType === 'date') return isValidDateOnly(text) ? text : '';
  if (fieldType === 'option') return normalizeGatherOptions(field.options).includes(text) ? text : '';
  return text;
}

function createDateRangeConfigData(config, mode) {
  const start = String(config.start || '').trim();
  const end = String(config.end || '').trim();
  if (!isValidDateOnly(start) || !isValidDateOnly(end) || end < start) return null;

  const dayCount = countInclusiveDays(start, end);
  const limit = mode === 'date' ? 31 : 8;
  if (!Number.isFinite(dayCount) || dayCount < 1 || dayCount > limit) return null;

  return { mode, start, end };
}

function countInclusiveDays(start, end) {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return Number.NaN;
  return Math.floor((endMs - startMs) / 86400000) + 1;
}

export function normalizeScheduleAvailabilityInput(availability, config) {
  if (!config?.mode) return availability || {};

  const scheduleConfig = createScheduleConfigData(config);
  if (!scheduleConfig) return null;
  const values = Array.isArray(availability) ? availability : [];

  if (scheduleConfig.mode === 'date') {
    return uniqueValues(values.filter((date) => (
      isValidDateOnly(date) && isDateInConfigRange(date, scheduleConfig)
    )));
  }

  if (scheduleConfig.mode === 'half') {
    return uniqueValues(values.filter((key) => {
      const [date, slot] = String(key || '').split('_');
      return isValidDateOnly(date) && HALF_DAY_SLOTS.has(slot) && isDateInConfigRange(date, scheduleConfig);
    }));
  }

  const seen = new Set();
  const normalizedRanges = [];
  for (const range of values) {
    if (!range || typeof range !== 'object' || !isValidDateOnly(range.date) || !isDateInConfigRange(range.date, scheduleConfig)) continue;
    const startMinutes = parseTimeToMinutes(range.start);
    const endMinutes = parseTimeToMinutes(range.end);
    if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) continue;

    const start = formatMinutes(startMinutes);
    const end = formatMinutes(endMinutes);
    const key = `${range.date}_${start}_${end}`;
    if (seen.has(key)) continue;
    seen.add(key);

    normalizedRanges.push({
      ...(typeof range.id === 'string' && range.id.trim() ? { id: range.id.trim() } : {}),
      date: range.date,
      start,
      end,
    });
  }
  return normalizedRanges;
}

function createScheduleBucketCounts(submissions, config) {
  const counts = new Map();
  const scheduleConfig = createScheduleConfigData(config);
  if (!scheduleConfig || !Array.isArray(submissions)) return counts;

  const addCount = (key, meta) => {
    const current = counts.get(key);
    counts.set(key, current ? { ...current, count: current.count + 1 } : { ...meta, key, count: 1 });
  };

  for (const submission of submissions) {
    const availability = normalizeScheduleAvailabilityInput(submission?.availability, scheduleConfig);
    if (!Array.isArray(availability)) continue;

    if (scheduleConfig.mode === 'date') {
      for (const date of availability) {
        addCount(date, { date });
      }
    } else if (scheduleConfig.mode === 'half') {
      for (const key of availability) {
        const [date, slot] = String(key || '').split('_');
        addCount(`${date}_${slot}`, { date, slot });
      }
    } else if (scheduleConfig.mode === 'time') {
      for (const range of availability) {
        const startMinutes = parseTimeToMinutes(range.start);
        const endMinutes = parseTimeToMinutes(range.end);
        for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
          if (minutes < startMinutes || minutes >= endMinutes) continue;
          const start = formatMinutes(minutes);
          const end = formatMinutes(minutes + 30);
          addCount(`${range.date}_${start}`, { date: range.date, start, end });
        }
      }
    }
  }

  return counts;
}

function normalizeRequiredFields(value) {
  return uniqueValues(String(value || '')
    .split(/[，,]/)
    .map((field) => field.trim())
    .filter(Boolean))
    .join(', ');
}

function normalizeBookingSlotRange(start, end, config) {
  const cleanStart = String(start || '').trim();
  const cleanEnd = String(end || '').trim();
  if (!cleanStart || cleanEnd !== cleanStart) return null;

  const bookingConfig = createBookingConfigData(config);
  if (bookingConfig?.mode === 'date') {
    return normalizeDateBookingSlotRange(cleanStart, cleanEnd, bookingConfig);
  }
  if (bookingConfig?.mode === 'half') {
    return normalizeHalfDayBookingSlotRange(cleanStart, cleanEnd, bookingConfig);
  }

  return normalizeDateBookingSlotRange(cleanStart, cleanEnd, null)
    || normalizeHalfDayBookingSlotRange(cleanStart, cleanEnd, null);
}

function normalizeDateBookingSlotRange(start, end, config) {
  if (!isValidDateOnly(start) || end !== start) return null;
  if (config && !isDateInConfigRange(start, config)) return null;
  return { start, end };
}

function normalizeHalfDayBookingSlotRange(start, end, config) {
  const slot = parseBookingHalfDaySlot(start);
  if (!slot || end !== start) return null;
  if (config && !isDateInConfigRange(slot.date, config)) return null;
  return { start, end };
}

function parseBookingHalfDaySlot(value) {
  const match = /^(\d{4}-\d{2}-\d{2})_([^_]+)$/.exec(String(value || '').trim());
  if (!match) return null;
  const [, date, period] = match;
  if (!isValidDateOnly(date) || !BOOKING_HALF_DAY_PERIODS.has(period)) return null;
  return { date, period };
}

function uniqueValues(values) {
  return [...new Set(values)];
}

function normalizeGatherFieldType(type) {
  return GATHER_FIELD_TYPES.has(type) ? type : 'text';
}

function normalizeGatherOptions(options) {
  const rawOptions = Array.isArray(options) ? options : String(options || '').split(/[,\n，]/);
  const seen = new Set();
  const normalized = [];
  for (const option of rawOptions) {
    const value = String(option || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

function normalizeBookingWaitlist(waitlist) {
  if (!Array.isArray(waitlist)) return [];
  return waitlist
    .filter((entry) => entry?.uid)
    .map((entry) => ({
      uid: entry.uid,
      name: entry.name || '',
      bookingData: normalizeBookingDataInput(entry.bookingData),
      joinedAt: entry.joinedAt,
    }));
}

function normalizedQueueParticipants(participants) {
  if (!Array.isArray(participants)) return [];
  return participants
    .filter((participant) => participant?.id)
    .map((participant) => ({
      id: participant.id,
      name: String(participant.name || '').trim(),
      value: normalizeParticipantValueInput(participant.value),
      joinedAt: Number.parseInt(participant.joinedAt, 10) || 0,
    }))
    .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
}

function normalizedRouletteParticipants(participants) {
  if (!Array.isArray(participants)) return [];
  return participants
    .filter((participant) => participant?.id)
    .map((participant) => ({
      id: participant.id,
      uid: participant.uid || '',
      name: String(participant.name || '').trim(),
      value: normalizeParticipantValueInput(participant.value),
      joinedAt: Number.parseInt(participant.joinedAt, 10) || 0,
    }))
    .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
}

function normalizeRpsPlayers(players, config) {
  if (!Array.isArray(players)) return [];
  return players
    .filter((player) => player?.uid)
    .map((player) => ({
      ...clonePlainValue(player),
      score: normalizeRpsScoreInput(player.score, config),
      move: player.move || null,
    }));
}

function createRouletteTarget(participant) {
  return {
    id: participant.id,
    uid: participant.uid,
    name: participant.name,
    value: participant.value,
    joinedAt: participant.joinedAt,
  };
}

function createRouletteWinner(participant, rank, prize) {
  return {
    id: participant.id,
    participantId: participant.id,
    uid: participant.uid,
    name: participant.name,
    value: participant.value,
    rank,
    ...(prize !== undefined ? { prize } : {}),
  };
}

function createRoulettePrizeQueue(config) {
  let prizeQueue = [];
  for (const prize of Array.isArray(config.prizes) ? config.prizes : []) {
    const count = normalizeRoulettePrizeCountInput(prize?.count);
    for (let index = 0; index < count; index += 1) {
      prizeQueue.push(String(prize?.name || '').trim());
    }
  }
  if (config.order === 'rev') prizeQueue = prizeQueue.reverse();
  return prizeQueue;
}

function normalizeRepeatSeed(seed) {
  const normalized = seed % REPEAT_SEED_MODULUS;
  return normalized > 0 ? normalized : normalized + REPEAT_SEED_MODULUS - 1;
}

function advanceRepeatSeed(seed) {
  return (seed * REPEAT_SEED_MULTIPLIER) % REPEAT_SEED_MODULUS;
}

function getRepeatIndex(initialSeed, poolLength, drawIndex) {
  let seed = normalizeRepeatSeed(initialSeed);
  for (let index = 0; index <= drawIndex; index += 1) {
    seed = advanceRepeatSeed(seed);
  }
  return Math.abs(seed - 1) % poolLength;
}

function isValidDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() === Number(month) - 1
    && date.getUTCDate() === Number(day);
}

function isValidDateTimeLocal(value) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/.exec(String(value || ''));
  if (!match) return false;
  return isValidDateOnly(match[1]) && Number.isFinite(parseTimeToMinutes(match[2]));
}

function isDateInConfigRange(date, config) {
  if (config.start && date < config.start) return false;
  if (config.end && date > config.end) return false;
  return true;
}

function parseTimeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return Number.NaN;
  return hours * 60 + minutes;
}

function formatMinutes(value) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function createVoteOperation(id, action, uid) {
  return {
    type: 'update',
    collection: 'voting_items',
    id,
    action,
    uid,
  };
}

function clonePlainValue(value) {
  return JSON.parse(JSON.stringify(value));
}
