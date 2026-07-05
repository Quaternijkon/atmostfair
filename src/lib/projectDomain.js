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

const GATHER_FIELD_TYPES = new Set(['text', 'number', 'date', 'option']);
const HALF_DAY_SLOTS = new Set(['morning', 'afternoon', 'evening']);

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

export function createScheduleSubmissionWrite(existingSubmissions, projectId, user, userName, availability, submittedAt) {
  if (!projectId || !user?.uid) return null;
  const submissions = Array.isArray(existingSubmissions) ? existingSubmissions : [];
  const existing = submissions.find((submission) => submission.projectId === projectId && submission.uid === user.uid);
  if (existing?.id) {
    return {
      type: 'update',
      collection: 'schedule_submissions',
      id: existing.id,
      data: {
        availability: availability || {},
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
      availability: availability || {},
      submittedAt,
    },
  };
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

function isValidDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() === Number(month) - 1
    && date.getUTCDate() === Number(day);
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
