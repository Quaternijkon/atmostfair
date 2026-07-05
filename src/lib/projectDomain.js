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

export function createGatherSubmissionData(existingSubmissions, projectId, user, userName, data, submittedAt) {
  if (!projectId || !user?.uid) return null;
  const submissions = Array.isArray(existingSubmissions) ? existingSubmissions : [];
  if (submissions.some((submission) => submission.projectId === projectId && submission.uid === user.uid)) return null;
  return {
    projectId,
    uid: user.uid,
    name: cleanName(userName, user),
    data: data || {},
    submittedAt,
  };
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

  for (const key of ['rouletteConfig', 'scheduleConfig', 'bookingConfig']) {
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

function clonePlainValue(value) {
  return JSON.parse(JSON.stringify(value));
}
