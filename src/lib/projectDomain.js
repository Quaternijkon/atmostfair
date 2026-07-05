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

const PROJECT_TYPES = new Set(['vote', 'gather', 'schedule', 'book', 'team', 'claim', 'roulette', 'queue', 'game_hub']);
const GATHER_FIELD_TYPES = new Set(['text', 'number', 'date', 'option']);
const SCHEDULE_MODES = new Set(['date', 'half', 'time']);
const BOOKING_MODES = new Set(['date', 'half']);
const HALF_DAY_SLOTS = new Set(['morning', 'afternoon', 'evening']);
const REPEAT_SEED_MODULUS = 2147483647;
const REPEAT_SEED_MULTIPLIER = 16807;

export function createTeamJoinMember(room, user, userName, joinedAt) {
  if (!room || !user?.uid) return null;
  const members = Array.isArray(room.members) ? room.members : [];
  if (members.some((member) => member.uid === user.uid)) return null;
  const maxMembers = Number.parseInt(room.maxMembers, 10) || 0;
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
    value: Number.parseInt(value, 10) || 0,
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
    bookingData: bookingData || {},
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
        bookingData: bookingData || {},
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
      bookingData: promoted.bookingData || {},
      bookedAt: releasedAt,
      waitlist: remainingWaitlist,
    },
    promoted,
  };
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
  const cleanLabel = String(label || '').trim();
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

export function createRouletteJoinData(existingParticipants, projectId, user, userName, value, joinedAt) {
  if (!projectId || !user?.uid) return null;
  const participants = Array.isArray(existingParticipants) ? existingParticipants : [];
  if (participants.some((participant) => participant.projectId === projectId && participant.uid === user.uid)) return null;
  return {
    projectId,
    uid: user.uid,
    name: cleanName(userName, user),
    value: Number.parseInt(value, 10) || 0,
    joinedAt,
    isWinner: false,
  };
}

export function createRouletteResultData(participants, config = {}, generatedAt) {
  const pool = normalizedRouletteParticipants(participants);
  if (pool.length === 0 || !generatedAt) return null;

  const participantCount = pool.length;
  const configSnapshot = clonePlainValue(config || {});
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
  const players = normalizeRpsPlayers(room.players);
  if (players.length < 2) return null;

  const resetPlayers = players.map((player) => ({
    ...player,
    lastMove: player.move || player.lastMove || null,
    move: null,
  }));
  const winThreshold = Math.floor((Number.parseInt(room.config?.bestOf, 10) || 1) / 2) + 1;
  const winner = players.find((player) => (Number.parseInt(player.score, 10) || 0) >= winThreshold);

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
    currentRound: (Number.parseInt(room.currentRound, 10) || 1) + 1,
    roundStartTime: transitionAt,
    players: resetPlayers,
  };
}

export function createGameRoomSummary(room) {
  if (!room?.id) return null;
  if (room.resultSummary) return clonePlainValue(room.resultSummary);

  const players = Array.isArray(room.players) ? room.players : [];
  const playerCount = players.length;
  if (room.game === 'rps') {
    const winner = players.find((player) => player.uid === room.winnerId) || null;
    const scores = players.map((player) => Number.parseInt(player.score, 10) || 0);
    const history = Array.isArray(room.history) ? room.history : [];
    const lastRound = history[history.length - 1] || null;
    const lastRoundWinner = lastRound?.winnerId
      ? players.find((player) => player.uid === lastRound.winnerId)
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

  const leader = [...players].sort((a, b) => (Number.parseInt(b.progress, 10) || 0) - (Number.parseInt(a.progress, 10) || 0))[0] || null;
  const winner = players.find((player) => player.status === 'won') || null;
  return {
    game: room.game || 'mine',
    status: room.status || 'playing',
    winnerId: winner?.uid || null,
    winnerName: winner?.name || '',
    roundsPlayed: 0,
    scoreLine: leader ? `${Number.parseInt(leader.progress, 10) || 0}%` : '',
    playerCount,
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

export function createScheduleSubmissionWrite(existingSubmissions, projectId, user, userName, availability, submittedAt, config) {
  if (!projectId || !user?.uid) return null;
  const normalizedAvailability = normalizeScheduleAvailability(availability, config);
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

export function createScheduleRecommendationSummary(submissions, config, limit = 3) {
  const participantCount = Array.isArray(submissions) ? submissions.length : 0;
  if (!participantCount || !config?.mode) {
    return { participantCount, recommendations: [] };
  }

  const counts = new Map();
  const addCount = (key, meta) => {
    const current = counts.get(key);
    counts.set(key, current ? { ...current, count: current.count + 1 } : { ...meta, key, count: 1 });
  };

  for (const submission of submissions) {
    const availability = Array.isArray(submission?.availability) ? submission.availability : [];
    if (config.mode === 'date') {
      for (const date of availability) {
        if (!isValidDateOnly(date) || !isDateInConfigRange(date, config)) continue;
        addCount(date, { date });
      }
    } else if (config.mode === 'half') {
      for (const key of availability) {
        const [date, slot] = String(key || '').split('_');
        if (!isValidDateOnly(date) || !HALF_DAY_SLOTS.has(slot) || !isDateInConfigRange(date, config)) continue;
        addCount(`${date}_${slot}`, { date, slot });
      }
    } else if (config.mode === 'time') {
      for (const range of availability) {
        if (!range || !isValidDateOnly(range.date) || !isDateInConfigRange(range.date, config)) continue;
        const startMinutes = parseTimeToMinutes(range.start);
        const endMinutes = parseTimeToMinutes(range.end);
        if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) continue;
        for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
          if (minutes < startMinutes || minutes >= endMinutes) continue;
          const start = formatMinutes(minutes);
          const end = formatMinutes(minutes + 30);
          addCount(`${range.date}_${start}`, { date: range.date, start, end });
        }
      }
    }
  }

  const recommendations = [...counts.values()]
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
  const claimants = Array.isArray(item.claimants) ? item.claimants : [];
  const existingClaim = claimants.find((claimant) => claimant.uid === user.uid);
  if (existingClaim) {
    return {
      type: 'remove',
      claimant: existingClaim,
    };
  }

  const maxClaims = Number.parseInt(item.maxClaims, 10) || 1;
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

export function createProjectCreateData(title, type, user, creatorName, password, createdAt) {
  if (!user?.uid || !PROJECT_TYPES.has(type)) return null;
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle || cleanTitle.length > PROJECT_TITLE_MAX_LENGTH) return null;
  return {
    title: cleanTitle,
    type,
    creatorId: user.uid,
    creatorName: cleanName(creatorName, user),
    password: String(password || '').trim(),
    status: 'active',
    createdAt,
    winners: [],
  };
}

export function createProjectDuplicateData(sourceProject, user, creatorName, createdAt, titleSuffix = '') {
  if (!sourceProject?.id || !sourceProject?.type || !user?.uid) return null;
  const duplicate = {
    title: `${sourceProject.title || ''}${titleSuffix}`,
    type: sourceProject.type,
    creatorId: user.uid,
    creatorName: cleanName(creatorName, user),
    password: sourceProject.password || '',
    status: 'active',
    createdAt,
    winners: [],
  };

  for (const key of ['rouletteConfig', 'scheduleConfig', 'bookingConfig', 'votingConfig']) {
    if (sourceProject[key] !== undefined) duplicate[key] = clonePlainValue(sourceProject[key]);
  }

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
        maxMembers: Number.parseInt(room.maxMembers, 10) || 4,
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
        maxClaims: Number.parseInt(item.maxClaims, 10) || 1,
        claimants: [],
        creatorId: user.uid,
        creatorName: ownerName,
        createdAt,
      },
    });
  }

  return operations;
}

export function createProjectCascadeDeleteOperations(projectId, docsByCollection) {
  if (!projectId) return [];
  const operations = [];

  for (const { name, field } of PROJECT_CASCADE_COLLECTIONS) {
    const docs = Array.isArray(docsByCollection?.[name]) ? docsByCollection[name] : [];
    for (const entry of docs) {
      if (!entry?.id) continue;
      const belongsToProject = field === 'id' ? entry.id === projectId : entry[field] === projectId;
      if (!belongsToProject) continue;
      operations.push({ type: 'delete', collection: name, id: entry.id });
    }
  }

  if (!operations.some((operation) => operation.collection === 'projects' && operation.id === projectId)) {
    operations.unshift({ type: 'delete', collection: 'projects', id: projectId });
  }

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
  if (explicit) return explicit;
  return user.displayName || user.email?.split('@')[0] || '';
}

function normalizedCollection(docsByCollection, collectionName) {
  return Array.isArray(docsByCollection?.[collectionName]) ? docsByCollection[collectionName] : [];
}

function normalizeGatherSubmissionData(data, fields) {
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

function normalizeScheduleAvailability(availability, config) {
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

  return values.filter((range) => {
    if (!range || !isValidDateOnly(range.date) || !isDateInConfigRange(range.date, scheduleConfig)) return false;
    const startMinutes = parseTimeToMinutes(range.start);
    const endMinutes = parseTimeToMinutes(range.end);
    return Number.isFinite(startMinutes) && Number.isFinite(endMinutes) && endMinutes > startMinutes;
  });
}

function normalizeRequiredFields(value) {
  return uniqueValues(String(value || '')
    .split(/[，,]/)
    .map((field) => field.trim())
    .filter(Boolean))
    .join(', ');
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
      bookingData: entry.bookingData || {},
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
      value: Number.parseInt(participant.value, 10) || 0,
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
      value: Number.parseInt(participant.value, 10) || 0,
      joinedAt: Number.parseInt(participant.joinedAt, 10) || 0,
    }))
    .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
}

function normalizeRpsPlayers(players) {
  if (!Array.isArray(players)) return [];
  return players
    .filter((player) => player?.uid)
    .map((player) => ({
      ...clonePlainValue(player),
      score: Number.parseInt(player.score, 10) || 0,
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
    const count = Number.parseInt(prize?.count, 10) || 0;
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
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
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
