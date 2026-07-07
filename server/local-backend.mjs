import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAuthService } from './auth-service.mjs';
import { createDataStore } from './data-store.mjs';
import {
  isAnnouncementVisible,
  normalizeAnnouncementCreateData,
  normalizeAnnouncementUpdateData,
} from '../src/lib/announcementDomain.js';
import { PROJECT_ACTIVITY_TYPES } from '../src/lib/activityDomain.js';
import { normalizePinnedProjectIds, normalizeRecentProjectIds } from '../src/lib/dashboardDomain.js';
import { MESSAGE_TEXT_MAX_LENGTH, normalizeMessageText } from '../src/lib/messageDomain.js';
import { normalizeUserDisplayName } from '../src/lib/userDomain.js';
import {
  PROJECT_CREATOR_NAME_MAX_LENGTH,
  PROJECT_PASSWORD_MAX_LENGTH,
  PROJECT_CHILD_TEXT_MAX_LENGTH,
  createBookingConfigData,
  createGatherFieldData,
  createGameRoomCreateData,
  createGameRoomJoinPatch,
  createMineRoomProgressPatch,
  createScheduleConfigData,
  normalizeClaimCapacityInput,
  normalizeMineProgressInput,
  normalizeParticipantValueInput,
  normalizeGatherSubmissionData,
  normalizeScheduleAvailabilityInput,
  normalizeBookingDataInput,
  normalizeRpsCurrentRoundInput,
  normalizeRpsScoreInput,
  normalizeTeamRoomCapacityInput,
  normalizeProjectChildText,
  createRpsNextRoundPatch,
} from '../src/lib/projectDomain.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const DATA_API_COLLECTIONS = new Set([
  'users',
  'projects',
  'voting_items',
  'rooms',
  'roulette_participants',
  'queue_participants',
  'gather_fields',
  'gather_submissions',
  'schedule_submissions',
  'booking_slots',
  'claim_items',
  'notifications',
  'project_activities',
  'announcements',
  'project_chats',
  'game_rooms',
  'friendships',
  'friend_messages',
]);
const DATA_BATCH_OPERATION_TYPES = new Set(['add', 'set', 'update', 'delete']);
const DEFAULT_ADMIN_EMAILS = ['quaternijkon@mail.ustc.edu.cn'];
const PROJECT_STATUSES = new Set(['active', 'stopped', 'finished']);
const LOCKED_PROJECT_STATUSES = new Set(['stopped', 'finished']);
const VOTING_MODES = new Set(['multiple', 'single']);
const PROJECT_NOTIFICATION_TYPES = new Set(['kicked', 'booking_promoted']);
const PROJECT_ACTIVITY_TYPE_VALUES = new Set(Object.values(PROJECT_ACTIVITY_TYPES));
const RPS_MOVES = new Set(['rock', 'paper', 'scissors']);
const MINE_PLAYER_STATUSES = new Set(['playing', 'dead', 'won']);
const BOOKING_RUNTIME_FIELDS = new Set(['bookedBy', 'bookerName', 'bookingData', 'bookedAt', 'waitlist']);
const PROJECT_CHILD_TEXT_FIELDS = new Map([
  ['voting_items', 'title'],
  ['rooms', 'name'],
  ['gather_fields', 'label'],
  ['booking_slots', 'label'],
  ['claim_items', 'title'],
]);
const PROJECT_CHILD_COLLECTION_FIELDS = new Map([
  ['voting_items', 'projectId'],
  ['rooms', 'projectId'],
  ['roulette_participants', 'projectId'],
  ['queue_participants', 'projectId'],
  ['gather_fields', 'projectId'],
  ['gather_submissions', 'projectId'],
  ['schedule_submissions', 'projectId'],
  ['booking_slots', 'projectId'],
  ['claim_items', 'projectId'],
  ['project_chats', 'projectId'],
  ['game_rooms', 'projectId'],
  ['project_activities', 'projectId'],
]);

export function createLocalBackendServer({
  store,
  sessionSecret,
  staticDir = path.join(projectRoot, 'dist'),
  now,
}) {
  const nowMs = typeof now === 'function' ? now : Date.now;
  const auth = createAuthService({ store, sessionSecret, now: nowMs });

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

      if (request.method === 'OPTIONS') {
        return sendJson(response, 204, null);
      }

      if (url.pathname.startsWith('/api/')) {
        return await handleApi({ request, response, url, auth, store, now: nowMs });
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return sendJson(response, 405, { error: { code: 'method-not-allowed', message: 'Method not allowed.' } });
      }

      return await serveStatic(response, staticDir, url.pathname, request.method === 'HEAD');
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500;
      return sendJson(response, status, {
        error: {
          code: error.code || 'internal-error',
          message: status === 500 ? 'Internal server error.' : error.message,
        },
      });
    }
  });
}

async function handleApi({ request, response, url, auth, store, now }) {
  if (request.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(response, 200, { ok: true, service: 'atmostfair-local-backend' });
  }

  if (request.method === 'GET' && url.pathname === '/api/auth/session') {
    const token = getBearerToken(request);
    if (!token) return sendJson(response, 200, { user: null });
    try {
      const user = await auth.verifyToken(token);
      return sendJson(response, 200, { user });
    } catch {
      return sendJson(response, 200, { user: null });
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/email/login') {
    const body = await readJson(request);
    const session = await auth.loginEmail(body.email, body.password);
    return sendJson(response, 200, session);
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/email/register') {
    const body = await readJson(request);
    const session = await auth.registerEmail(body.email, body.password, body.displayName);
    return sendJson(response, 200, session);
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/guest') {
    const body = await readJson(request);
    const session = await auth.createGuest(body.displayName);
    return sendJson(response, 200, session);
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/profile') {
    const user = await requireUser(request, auth);
    const body = await readJson(request);
    const updated = await auth.updateProfile(user.uid, body);
    return sendJson(response, 200, { user: updated });
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    return sendJson(response, 200, { ok: true });
  }

  if (request.method === 'POST' && url.pathname === '/api/project-access/unlock') {
    const user = await requireUser(request, auth);
    const body = await readJson(request);
    const result = await unlockProjectAccess({ store, user, body, now });
    return sendJson(response, 200, result);
  }

  if (url.pathname.startsWith('/api/data/')) {
    const user = await requireUser(request, auth);
    const body = await readJson(request);
    return handleDataApi({ request, response, url, store, body, user, now });
  }

  return sendJson(response, 404, { error: { code: 'not-found', message: 'API route not found.' } });
}

async function handleDataApi({ request, response, url, store, body, user, now }) {
  if (request.method !== 'POST') {
    return sendJson(response, 405, { error: { code: 'method-not-allowed', message: 'Method not allowed.' } });
  }

  if (url.pathname === '/api/data/list') {
    const collection = validateDataCollection(body.collection);
    const query = body.query || {};
    const rawDocs = await store.list(collection, query);
    const docs = await filterReadableDocs({ store, user, collection, docs: rawDocs, query, now });
    return sendJson(response, 200, { docs });
  }

  if (url.pathname === '/api/data/get') {
    const collection = validateDataCollection(body.collection);
    const id = validateDataId(body.id);
    const rawDoc = await store.get(collection, id);
    const doc = await toReadableDataDoc({ store, user, collection, doc: rawDoc, now });
    return sendJson(response, 200, { doc });
  }

  if (url.pathname === '/api/data/add') {
    const collection = validateDataCollection(body.collection);
    const data = await authorizeDataOperation({ store, user, type: 'add', collection, data: body.data || {}, now });
    const rawDoc = await store.add(collection, data);
    const doc = await toDataWriteResponseDoc({ store, user, collection, doc: rawDoc, now });
    return sendJson(response, 200, { doc });
  }

  if (url.pathname === '/api/data/set') {
    const collection = validateDataCollection(body.collection);
    const id = validateDataId(body.id);
    const data = await authorizeDataOperation({ store, user, type: 'set', collection, id, data: body.data || {}, now });
    const accessLifecycle = collection === 'projects'
      ? await getProjectAccessLifecycleChange({ store, type: 'set', id, data, options: body.options || {} })
      : null;
    const rawDoc = await store.set(collection, id, data, body.options || {});
    await applyProjectAccessLifecycleChange({ store, change: accessLifecycle });
    const doc = await toDataWriteResponseDoc({ store, user, collection, doc: rawDoc, now });
    return sendJson(response, 200, { doc });
  }

  if (url.pathname === '/api/data/update') {
    const collection = validateDataCollection(body.collection);
    const id = validateDataId(body.id);
    const data = await authorizeDataOperation({ store, user, type: 'update', collection, id, data: body.data || {}, now });
    const accessLifecycle = collection === 'projects'
      ? await getProjectAccessLifecycleChange({ store, type: 'update', id, data })
      : null;
    const rawDoc = await store.update(collection, id, data);
    await applyProjectAccessLifecycleChange({ store, change: accessLifecycle });
    const doc = await toDataWriteResponseDoc({ store, user, collection, doc: rawDoc, now });
    return sendJson(response, 200, { doc });
  }

  if (url.pathname === '/api/data/delete') {
    const collection = validateDataCollection(body.collection);
    const id = validateDataId(body.id);
    await authorizeDataOperation({ store, user, type: 'delete', collection, id, now });
    const accessLifecycle = collection === 'projects' ? { projectId: id, revoke: true } : null;
    await store.delete(collection, id);
    await applyProjectAccessLifecycleChange({ store, change: accessLifecycle });
    return sendJson(response, 200, { ok: true });
  }

  if (url.pathname === '/api/data/batch') {
    const operations = validateDataBatchOperations(body.operations || []);
    const authorizedOperations = await authorizeDataOperations({ store, user, operations, now });
    const accessLifecycleChanges = await getProjectAccessLifecycleChanges({ store, operations: authorizedOperations });
    const rawResults = await store.batch(authorizedOperations);
    await applyProjectAccessLifecycleChanges({ store, changes: accessLifecycleChanges });
    const results = await toReadableDataBatchResults({ store, user, operations: authorizedOperations, results: rawResults, now });
    return sendJson(response, 200, { results });
  }

  return sendJson(response, 404, { error: { code: 'not-found', message: 'Data route not found.' } });
}

function validateDataCollection(collection) {
  if (typeof collection !== 'string' || !DATA_API_COLLECTIONS.has(collection)) {
    const error = new Error('Invalid data collection.');
    error.status = 400;
    error.code = 'data/invalid-collection';
    throw error;
  }
  return collection;
}

function validateDataId(id) {
  if (typeof id !== 'string' || id.trim() === '') {
    const error = new Error('Invalid document id.');
    error.status = 400;
    error.code = 'data/invalid-id';
    throw error;
  }
  return id;
}

function validateDataBatchOperations(operations) {
  if (!Array.isArray(operations)) {
    const error = new Error('Invalid data batch.');
    error.status = 400;
    error.code = 'data/invalid-operation';
    throw error;
  }

  for (const operation of operations) {
    if (!operation || typeof operation !== 'object' || !DATA_BATCH_OPERATION_TYPES.has(operation.type)) {
      const error = new Error('Invalid data operation.');
      error.status = 400;
      error.code = 'data/invalid-operation';
      throw error;
    }
    validateDataCollection(operation.collection);
    if (operation.type !== 'add') validateDataId(operation.id);
  }

  return operations;
}

async function authorizeDataOperations({ store, user, operations, now }) {
  const authorizedOperations = [];
  const context = createAuthorizationContext();
  for (const operation of operations) {
    const data = await authorizeDataOperation({
      store,
      user,
      context,
      type: operation.type,
      collection: operation.collection,
      id: operation.id,
      data: operation.data || {},
      now,
    });
    const authorizedOperation = data === undefined ? operation : { ...operation, data };
    authorizedOperations.push(authorizedOperation);
    await stageAuthorizedDataOperation({ store, context, operation: authorizedOperation });
  }
  return authorizedOperations;
}

async function authorizeDataOperation({ store, user, context, type, collection, id, data, now }) {
  if (collection === 'users') {
    return authorizeUserOperation({ store, user, type, id, data });
  }

  if (collection === 'announcements') {
    return authorizeAnnouncementOperation({ store, user, type, id, data, now });
  }

  if (collection === 'notifications') {
    return authorizeNotificationOperation({ store, user, type, id, data });
  }

  if (collection === 'friendships') {
    return authorizeFriendshipOperation({ store, user, context, type, id, data });
  }

  if (collection === 'friend_messages') {
    return authorizeFriendMessageOperation({ store, user, type, id, data });
  }

  const projectField = PROJECT_CHILD_COLLECTION_FIELDS.get(collection);
  if (projectField) {
    return authorizeProjectChildOperation({ store, user, context, type, collection, id, data, projectField, now });
  }

  if (collection !== 'projects') return data;

  if (type === 'add') {
    return normalizeProjectCreateData({ store, data, user });
  }

  const existing = await getProjectedDoc({ store, context, collection, id });
  if (!existing) {
    if (type === 'set') return normalizeProjectCreateData({ store, data, user });
    throwDataError(404, 'data/not-found', 'Project not found.');
  }

  if (!canWriteProject(existing, user)) {
    throwDataError(403, 'data/forbidden', 'You do not have permission to modify this project.');
  }

  if (type === 'delete') return undefined;
  return normalizeProjectStateData({
    data: preserveProjectOwner(data, existing, type),
    existing,
    type,
  });
}

async function authorizeAnnouncementOperation({ store, user, type, id, data, now }) {
  if (!isAdminUser(user)) forbidden();
  if (type === 'add') return normalizeAnnouncementData(data, now);

  const existing = await store.get('announcements', id);
  if (!existing) {
    if (type === 'set') return normalizeAnnouncementData(data, now);
    throwDataError(404, 'data/not-found', 'Announcement not found.');
  }

  if (type === 'delete') return undefined;
  if (type === 'set') return normalizeAnnouncementData(data, now);

  const patch = normalizeAnnouncementUpdateData(data || {}, existing);
  if (!patch) throwInvalidAnnouncement();
  return patch;
}

function normalizeAnnouncementData(data, now) {
  const normalized = normalizeAnnouncementCreateData(data || {}, typeof now === 'function' ? now() : Date.now());
  if (!normalized) throwInvalidAnnouncement();
  return normalized;
}

function throwInvalidAnnouncement() {
  throwDataError(400, 'data/invalid-announcement', 'Announcement payload is invalid.');
}

async function authorizeUserOperation({ store, user, type, id, data }) {
  if (type === 'add' || type === 'delete' || id !== user.uid) forbidden();

  const existing = await store.get('users', id);
  if (!existing && type === 'update') throwDataError(404, 'data/not-found', 'User not found.');

  const identity = {
    uid: existing?.uid ?? user.uid,
    email: existing?.email ?? user.email ?? null,
    isAnonymous: Boolean(existing?.isAnonymous ?? user.isAnonymous),
  };

  assertImmutableUserField(data, identity, 'uid');
  assertImmutableUserField(data, identity, 'email');
  assertImmutableUserField(data, identity, 'isAnonymous');

  if (type === 'set') {
    return {
      ...normalizeUserData(data),
      ...identity,
    };
  }

  return normalizeUserData(data);
}

function normalizeUserData(data) {
  const normalized = { ...(data || {}) };
  if (Object.hasOwn(normalized, 'displayName')) {
    normalized.displayName = normalizeUserDisplayName(normalized.displayName);
  }
  if (Object.hasOwn(normalized, 'pinnedProjectIds')) {
    if (!Array.isArray(normalized.pinnedProjectIds)) {
      throwDataError(400, 'data/invalid-user-settings', 'Pinned projects must be a list.');
    }
    normalized.pinnedProjectIds = normalizePinnedProjectIds(normalized.pinnedProjectIds).slice(0, 100);
  }
  if (Object.hasOwn(normalized, 'recentProjectIds')) {
    if (!Array.isArray(normalized.recentProjectIds)) {
      throwDataError(400, 'data/invalid-user-settings', 'Recent projects must be a list.');
    }
    normalized.recentProjectIds = normalizeRecentProjectIds(normalized.recentProjectIds, 100);
  }
  return normalized;
}

async function authorizeProjectChildOperation({ store, user, context, type, collection, id, data, projectField, now }) {
  const existing = type === 'add' ? null : await getProjectedDoc({ store, context, collection, id });
  if (!existing && type !== 'add') {
    if (type !== 'set') throwDataError(404, 'data/not-found', 'Record not found.');
  }

  const projectId = existing?.[projectField] ?? data?.[projectField];
  if (typeof projectId !== 'string' || projectId.trim() === '') {
    throwDataError(400, 'data/invalid-project', 'Project id is required.');
  }

  const project = await getProjectedDoc({ store, context, collection: 'projects', id: projectId });
  if (!project) {
    if (type === 'delete' && isAdminUser(user)) return undefined;
    throwDataError(404, 'data/project-not-found', 'Project not found.');
  }

  if (!(await canReadPrivateProject({ store, user, project }))) forbidden();

  if (collection === 'project_activities') {
    return authorizeProjectActivityOperation({ user, type, data, project });
  }

  if (type === 'delete') {
    if (isProjectLocked(project)) {
      if (canWriteProject(project, user)) return undefined;
      forbidden();
    }
    if (canDeleteProjectChild({ collection, doc: existing, project, user })) return undefined;
    forbidden();
  }

  if (isProjectLocked(project)) {
    throwDataError(409, 'data/project-locked', 'Project is paused, finished, or archived.');
  }

  if (collection === 'voting_items') {
    return authorizeVotingItemOperation({ store, user, context, type, data, existing, project });
  }

  if (collection === 'rooms') {
    return authorizeRoomOperation({ user, type, data, existing, project });
  }

  if (collection === 'project_chats') {
    return authorizeProjectChatOperation({ user, type, data, existing });
  }

  if (collection === 'game_rooms') {
    return authorizeGameRoomOperation({ user, type, data, existing, now });
  }

  if (
    collection === 'queue_participants'
    || collection === 'roulette_participants'
    || collection === 'gather_submissions'
    || collection === 'schedule_submissions'
  ) {
    return authorizeProjectUserEntryOperation({
      store,
      user,
      context,
      type,
      collection,
      data,
      existing,
      project,
      projectId,
    });
  }

  if (
    collection === 'gather_fields'
    || collection === 'booking_slots'
    || collection === 'claim_items'
  ) {
    return authorizeManagedProjectChildOperation({ user, type, collection, data, existing, project });
  }

  return existing ? preserveImmutableField(data, existing, projectField, type) : data || {};
}

async function authorizeVotingItemOperation({ store, user, context, type, data, existing, project }) {
  if (!existing) {
    return normalizeVotingItemCreateData({ user, data });
  }

  const protectedData = preserveImmutableField(data, existing, 'projectId', type);
  if (Object.hasOwn(protectedData || {}, 'votes')) {
    return authorizeVotingItemVotePatch({ store, context, user, type, data: protectedData, existing, project });
  }

  if (!canWriteProject(project, user)) forbidden();
  const metadataData = normalizeProjectChildDisplayText(protectedData, 'voting_items', type === 'set');
  assertImmutableField(metadataData, existing, 'creatorId');
  assertImmutableField(metadataData, existing, 'creatorName');
  if (type === 'set') {
    return {
      ...(metadataData || {}),
      projectId: existing.projectId,
      creatorId: existing.creatorId,
      creatorName: existing.creatorName,
      votes: Array.isArray(existing.votes) ? existing.votes : [],
    };
  }
  return metadataData || {};
}

function normalizeVotingItemCreateData({ user, data }) {
  const normalized = normalizeProjectChildDisplayText(data, 'voting_items', true);
  return {
    ...normalized,
    creatorId: user.uid,
    creatorName: cleanUserProvidedName(normalized.creatorName, user),
    votes: [],
  };
}

async function authorizeVotingItemVotePatch({ store, context, user, type, data, existing, project }) {
  if (type !== 'update') forbidden();

  const mutableKeys = Object.keys(data || {}).filter((key) => key !== 'projectId');
  if (mutableKeys.length !== 1 || mutableKeys[0] !== 'votes') forbidden();

  const voteAction = getOwnVoteTransformAction(data.votes, user);
  if (!voteAction) forbidden();

  if (voteAction === 'add' && getVotingMode(project) === 'single') {
    const projectItems = await listProjectedVotingItems({ store, context, projectId: existing.projectId });
    const hasConflictingVote = projectItems.some((item) => (
      item.id !== existing.id
      && Array.isArray(item.votes)
      && item.votes.includes(user.uid)
    ));
    if (hasConflictingVote) forbidden();
  }

  return data || {};
}

function getOwnVoteTransformAction(value, user) {
  const values = Array.isArray(value?.values) ? value.values : [];
  if (values.length !== 1 || values[0] !== user.uid) return null;
  if (value?.__type === 'arrayUnion') return 'add';
  if (value?.__type === 'arrayRemove') return 'remove';
  return null;
}

function getVotingMode(project) {
  return project?.votingConfig?.mode === 'single' ? 'single' : 'multiple';
}

function authorizeManagedProjectChildOperation({ user, type, collection, data, existing, project }) {
  if (collection === 'gather_fields') {
    return authorizeGatherFieldOperation({ user, type, data, existing, project });
  }

  if (!existing) {
    if (!canWriteProject(project, user)) forbidden();
    return normalizeManagedProjectChildCreateData({ user, collection, data });
  }

  if (collection === 'booking_slots') {
    return authorizeBookingSlotOperation({ user, type, data, existing, project });
  }

  if (collection === 'claim_items') {
    return authorizeClaimItemOperation({ user, type, data, existing, project });
  }

  return normalizeProjectChildDisplayText(
    preserveImmutableField(data, existing, 'projectId', type),
    collection,
    type === 'set',
  );
}

function normalizeManagedProjectChildCreateData({ user, collection, data }) {
  const normalized = normalizeProjectChildDisplayText(data, collection, true);

  if (collection === 'booking_slots') {
    return {
      ...normalized,
      bookedBy: null,
      bookerName: null,
      bookingData: null,
      bookedAt: null,
      waitlist: [],
    };
  }

  if (collection === 'claim_items') {
    return {
      ...normalized,
      creatorId: user.uid,
      creatorName: cleanUserProvidedName('', user),
      maxClaims: normalizeClaimMaxClaims(normalized.maxClaims),
      claimants: [],
    };
  }

  return normalized;
}

function authorizeGatherFieldOperation({ user, type, data, existing, project }) {
  if (!existing) {
    if (!canWriteProject(project, user)) forbidden();
    return normalizeGatherFieldCreateData({ user, data });
  }

  if (!canWriteProject(project, user)) forbidden();

  const protectedData = preserveImmutableField(data, existing, 'projectId', type);
  assertImmutableField(protectedData, existing, 'creatorId');

  if (type === 'set') {
    return normalizeGatherFieldReplaceData({ user, data: protectedData, existing });
  }

  return normalizeGatherFieldPatchData({ user, data: protectedData, existing });
}

function normalizeGatherFieldCreateData({ user, data }) {
  const normalized = normalizeProjectChildDisplayText(data, 'gather_fields', true);
  const field = createGatherFieldData(
    normalized.projectId,
    user,
    normalized.label,
    normalized.type,
    normalized.options,
    normalized.createdAt,
  );
  if (!field) throwInvalidGatherField();
  return field;
}

function normalizeGatherFieldReplaceData({ user, data, existing }) {
  const normalized = normalizeProjectChildDisplayText(data, 'gather_fields', true);
  const field = createGatherFieldData(
    existing.projectId,
    { uid: existing.creatorId || user.uid },
    normalized.label,
    normalized.type,
    normalized.options,
    normalized.createdAt,
  );
  if (!field) throwInvalidGatherField();
  return field;
}

function normalizeGatherFieldPatchData({ user, data, existing }) {
  const normalizedPatch = normalizeProjectChildDisplayText(data, 'gather_fields', false);
  const candidate = {
    ...existing,
    ...normalizedPatch,
    projectId: existing.projectId,
    creatorId: existing.creatorId || user.uid,
  };
  const field = createGatherFieldData(
    candidate.projectId,
    { uid: candidate.creatorId },
    candidate.label,
    candidate.type,
    candidate.options,
    candidate.createdAt,
  );
  if (!field) throwInvalidGatherField();

  const patch = {};
  if (Object.hasOwn(normalizedPatch, 'label')) patch.label = field.label;
  if (Object.hasOwn(normalizedPatch, 'type')) patch.type = field.type;
  if (Object.hasOwn(normalizedPatch, 'createdAt')) patch.createdAt = field.createdAt;
  if (Object.hasOwn(normalizedPatch, 'type') || Object.hasOwn(normalizedPatch, 'options')) {
    patch.options = Object.hasOwn(field, 'options') ? field.options : undefined;
  }
  return patch;
}

function throwInvalidGatherField() {
  throwDataError(400, 'data/invalid-gather-field', 'Gather field definition is invalid.');
}

function normalizeProjectChildDisplayText(data, collection, required = false) {
  const normalized = { ...(data || {}) };
  const field = PROJECT_CHILD_TEXT_FIELDS.get(collection);
  if (!field) return normalized;

  if (!Object.hasOwn(normalized, field)) {
    if (required) throwInvalidProjectChildText();
    return normalized;
  }

  const text = normalizeProjectChildText(normalized[field]);
  if (!text) throwInvalidProjectChildText();

  normalized[field] = text;
  return normalized;
}

function throwInvalidProjectChildText() {
  throwDataError(
    400,
    'data/invalid-project-child-text',
    `Project item text must be 1-${PROJECT_CHILD_TEXT_MAX_LENGTH} characters.`,
  );
}

function authorizeProjectChatOperation({ user, data, existing }) {
  if (!existing) {
    return normalizeProjectChatCreateData(data, user);
  }

  forbidden();
}

function normalizeProjectChatCreateData(data, user) {
  const text = normalizeMessageText(data?.text);
  if (!text) throwInvalidMessageText();

  return {
    ...(data || {}),
    text,
    uid: user.uid,
    name: cleanUserProvidedName('', user),
  };
}

function authorizeGameRoomOperation({ user, type, data, existing, now }) {
  if (!existing) {
    return normalizeGameRoomCreateData(data, user);
  }

  if (type !== 'update') forbidden();
  assertGameRoomImmutableFields(data, existing);

  if (existing.game === 'rps') {
    return authorizeRpsRoomUpdate({ user, data, existing });
  }

  if (existing.game === 'mine') {
    return authorizeMineRoomUpdate({ user, data, existing, now });
  }

  forbidden();
}

function normalizeGameRoomCreateData(data, user) {
  const requestedPlayers = Array.isArray(data?.players) ? data.players : [];
  const userPlayer = requestedPlayers.find((player) => player?.uid === user.uid) || null;
  const computerPlayer = requestedPlayers.find((player) => player?.uid === 'computer') || null;
  const room = createGameRoomCreateData(data?.projectId, user, data?.name, data?.game, {
    ...(data?.config || {}),
    vsComputer: Boolean(userPlayer && computerPlayer),
    userName: userPlayer?.name,
    botName: computerPlayer?.name,
    currentRound: data?.currentRound,
    roundStartTime: data?.roundStartTime ?? data?.createdAt,
  }, data?.createdAt);

  if (!room) {
    throwDataError(400, 'data/invalid-game-room', 'Game room name and type are required.');
  }
  return room;
}

function assertGameRoomImmutableFields(data, existing) {
  for (const field of ['projectId', 'game', 'createdBy', 'createdAt', 'config', 'name']) {
    if (!Object.hasOwn(data || {}, field)) continue;
    if (!deepEqualData(data[field], existing[field])) forbidden();
  }
}

function authorizeRpsRoomUpdate({ user, data, existing }) {
  if (!Object.hasOwn(data || {}, 'players')) forbidden();

  const existingPlayers = normalizeGamePlayers(existing.players);
  if (!existingPlayers.some((player) => player.uid === user.uid)) {
    return authorizeGameRoomJoin({ user, data, existing });
  }

  if (existing.status === 'waiting') {
    return authorizeGameRoomJoin({ user, data, existing });
  }

  if (existing.status === 'playing') {
    return authorizeRpsPlayingUpdate({ user, data, existing });
  }

  if (existing.status === 'showdown') {
    return authorizeRpsShowdownUpdate({ user, data, existing });
  }

  forbidden();
}

function authorizeGameRoomJoin({ user, data, existing }) {
  const players = normalizeGamePlayers(existing.players);
  if (players.some((player) => player.uid === user.uid)) {
    throwDataError(409, 'data/duplicate-entry', 'Entry already exists for this user.');
  }

  const maxPlayers = existing.game === 'mine' ? 8 : 2;
  if (players.length >= maxPlayers) {
    throwDataError(409, 'data/game-full', 'Game room is already full.');
  }

  const requestedPlayers = Array.isArray(data?.players) ? data.players : [];
  const requestedPlayer = requestedPlayers.find((player) => player?.uid === user.uid) || {};
  const expected = createGameRoomJoinPatch(existing, user, requestedPlayer.name, data?.roundStartTime);
  if (!expected || !deepEqualData(data || {}, expected)) forbidden();
  return expected;
}

function authorizeRpsPlayingUpdate({ user, data, existing }) {
  const allowedKeys = ['players', 'status', 'history', 'showdownEndTime'];
  assertOnlyGameRoomFields(data, allowedKeys);

  const existingPlayers = normalizeGamePlayers(existing.players);
  const nextPlayers = normalizeGamePlayers(data.players);
  if (!hasSamePlayerOrder(existingPlayers, nextPlayers)) forbidden();

  if (nextPlayers.every((player) => RPS_MOVES.has(player.move))) {
    return authorizeRpsShowdownPatch({ user, data, existing, existingPlayers, nextPlayers });
  }

  const changedPlayers = changedPlayerEntries(existingPlayers, nextPlayers);
  const userChanged = changedPlayers.some(({ before, after }) => before.uid === user.uid && isValidOwnRpsMoveChange(before, after));
  const otherChanged = changedPlayers.filter(({ before }) => before.uid !== user.uid);
  const allowedBotChange = otherChanged.length <= 1 && otherChanged.every(({ before, after }) => (
    before.uid === 'computer'
    && before.move == null
    && RPS_MOVES.has(after.move)
    && samePlayerExcept(before, after, ['move'])
  ));
  if (!userChanged || !allowedBotChange) forbidden();

  const expected = { players: nextPlayers };
  if (!deepEqualData(data || {}, expected)) forbidden();
  return expected;
}

function authorizeRpsShowdownPatch({ user, data, existing, existingPlayers, nextPlayers }) {
  assertOnlyGameRoomFields(data, ['players', 'status', 'history', 'showdownEndTime']);
  if (data.status !== 'showdown' || data.showdownEndTime === undefined || data.showdownEndTime === null) forbidden();

  let userChanged = false;
  const movedPlayers = existingPlayers.map((player, index) => {
    const candidate = nextPlayers[index] || {};
    if (player.uid === user.uid) {
      if (player.move != null || !RPS_MOVES.has(candidate.move)) forbidden();
      userChanged = true;
      return { ...player, move: candidate.move };
    }
    if (player.uid === 'computer' && player.move == null && RPS_MOVES.has(candidate.move)) {
      return { ...player, move: candidate.move };
    }
    return player;
  });
  if (!userChanged || !movedPlayers.every((player) => RPS_MOVES.has(player.move))) forbidden();

  const history = Array.isArray(existing.history) ? cloneDataValue(existing.history) : [];
  const round = normalizeRpsCurrentRoundInput(existing.currentRound, history.length + 1);
  const p1 = { ...movedPlayers[0], score: normalizeRpsScoreInput(movedPlayers[0]?.score, existing.config) };
  const p2 = { ...movedPlayers[1], score: normalizeRpsScoreInput(movedPlayers[1]?.score, existing.config) };
  const winnerId = getRpsRoundWinnerId(p1.move, p2.move, p1.uid, p2.uid);
  if (winnerId === p1.uid) p1.score = normalizeRpsScoreInput(p1.score + 1, existing.config);
  if (winnerId === p2.uid) p2.score = normalizeRpsScoreInput(p2.score + 1, existing.config);

  const incomingHistory = Array.isArray(data.history) ? data.history : [];
  if (incomingHistory.length !== history.length + 1) forbidden();
  const incomingRound = incomingHistory[incomingHistory.length - 1] || {};
  const expectedRound = {
    round,
    p1Move: p1.move,
    p2Move: p2.move,
    winnerId,
    timestamp: incomingRound.timestamp,
  };
  if (!Number.isFinite(Number(expectedRound.timestamp))) forbidden();

  const expected = {
    players: [p1, p2],
    history: [...history, expectedRound],
    status: 'showdown',
    showdownEndTime: data.showdownEndTime,
  };
  if (!deepEqualData(data || {}, expected)) forbidden();
  return expected;
}

function authorizeRpsShowdownUpdate({ user, data, existing }) {
  const players = normalizeGamePlayers(existing.players);
  if (players[0]?.uid !== user.uid) forbidden();

  const transitionAt = data?.finishedAt ?? data?.roundStartTime;
  const expected = createRpsNextRoundPatch(existing, transitionAt);
  if (!expected || !deepEqualData(data || {}, expected)) forbidden();
  return expected;
}

function getRpsRoundWinnerId(p1Move, p2Move, p1Uid, p2Uid) {
  if (p1Move === p2Move) return null;
  if (
    (p1Move === 'rock' && p2Move === 'scissors')
    || (p1Move === 'paper' && p2Move === 'rock')
    || (p1Move === 'scissors' && p2Move === 'paper')
  ) {
    return p1Uid;
  }
  return p2Uid;
}

function isValidOwnRpsMoveChange(before, after) {
  return before.move == null && RPS_MOVES.has(after.move) && samePlayerExcept(before, after, ['move']);
}

function authorizeMineRoomUpdate({ user, data, existing, now }) {
  assertOnlyGameRoomFields(data, ['players']);
  if (existing.status === 'finished') forbidden();
  const existingPlayers = normalizeGamePlayers(existing.players);
  const nextPlayers = normalizeGamePlayers(data.players);

  if (!existingPlayers.some((player) => player.uid === user.uid)) {
    return authorizeGameRoomJoin({ user, data, existing });
  }

  if (!hasSamePlayerOrder(existingPlayers, nextPlayers)) forbidden();
  const changedPlayers = changedPlayerEntries(existingPlayers, nextPlayers);
  if (changedPlayers.length !== 1 || changedPlayers[0].before.uid !== user.uid) forbidden();

  const { before, after } = changedPlayers[0];
  if (!samePlayerExcept(before, after, ['progress', 'status'])) forbidden();
  const progress = Number.parseInt(after.progress, 10);
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) forbidden();
  if (!MINE_PLAYER_STATUSES.has(after.status)) forbidden();
  assertValidMinePlayerTransition(before, after, progress);

  const expected = createMineRoomProgressPatch(
    { ...existing, players: existingPlayers },
    user,
    progress,
    after.status,
    typeof now === 'function' ? now() : Date.now(),
  );
  if (!expected) forbidden();
  return expected;
}

function assertValidMinePlayerTransition(before, after, progress) {
  const beforeStatus = MINE_PLAYER_STATUSES.has(before.status) ? before.status : 'playing';
  const beforeProgress = normalizeMineProgressInput(before.progress);
  if (['dead', 'won'].includes(beforeStatus)) forbidden();
  if (progress < beforeProgress) forbidden();
  if (after.status === 'won' && progress !== 100) forbidden();
  if (progress === 100 && after.status !== 'won') forbidden();
}

function assertOnlyGameRoomFields(data, fields) {
  const allowed = new Set(fields);
  for (const key of Object.keys(data || {})) {
    if (!allowed.has(key)) forbidden();
  }
}

function normalizeGamePlayers(players) {
  return Array.isArray(players) ? cloneDataValue(players) : [];
}

function hasSamePlayerOrder(existingPlayers, nextPlayers) {
  return (
    existingPlayers.length === nextPlayers.length
    && existingPlayers.every((player, index) => player.uid === nextPlayers[index]?.uid)
  );
}

function changedPlayerEntries(existingPlayers, nextPlayers) {
  const changes = [];
  existingPlayers.forEach((player, index) => {
    const nextPlayer = nextPlayers[index];
    if (!deepEqualData(player, nextPlayer)) changes.push({ before: player, after: nextPlayer });
  });
  return changes;
}

function samePlayerExcept(before, after, exceptFields) {
  const beforeComparable = { ...before };
  const afterComparable = { ...after };
  for (const field of exceptFields) {
    delete beforeComparable[field];
    delete afterComparable[field];
  }
  return deepEqualData(beforeComparable, afterComparable);
}

function authorizeProjectActivityOperation({ user, type, data, project }) {
  if (type === 'add') {
    return normalizeProjectActivityCreateData(data, user);
  }

  if (type === 'delete') {
    if (!canWriteProject(project, user)) forbidden();
    return undefined;
  }

  forbidden();
}

function normalizeProjectActivityCreateData(data, user) {
  const projectId = typeof data?.projectId === 'string' ? data.projectId.trim() : '';
  const type = typeof data?.type === 'string' ? data.type.trim() : '';
  const createdAt = data?.createdAt;

  if (!projectId || !PROJECT_ACTIVITY_TYPE_VALUES.has(type) || createdAt === undefined || createdAt === null) {
    throwDataError(400, 'data/invalid-activity', 'Activity project, type, and time are required.');
  }

  return {
    ...(data || {}),
    projectId,
    type,
    actorId: user.uid,
    actorName: cleanUserProvidedName('', user),
    subject: String(data?.subject || '').trim(),
    metadata: normalizePlainObject(data?.metadata),
    createdAt,
  };
}

function authorizeRoomOperation({ user, type, data, existing, project }) {
  if (!existing) {
    return normalizeRoomCreateData({ user, data });
  }

  const protectedData = preserveImmutableField(data, existing, 'projectId', type);
  assertImmutableField(protectedData, existing, 'ownerId');

  if (Object.hasOwn(protectedData || {}, 'members')) {
    return authorizeRoomMembersPatch({ user, type, data: protectedData, existing, project });
  }

  if (!canManageRoom(project, existing, user)) forbidden();
  const metadataPatch = normalizeRoomMetadataPatch(protectedData, existing, type);

  if (type === 'set') {
    return {
      ...(metadataPatch || {}),
      projectId: existing.projectId,
      ownerId: existing.ownerId,
      members: Array.isArray(existing.members) ? existing.members : [],
    };
  }

  return metadataPatch || {};
}

function normalizeRoomCreateData({ user, data }) {
  const normalized = normalizeProjectChildDisplayText(data, 'rooms', true);
  const requestedMembers = Array.isArray(data?.members) ? data.members : [];
  const requestedMember = requestedMembers.find((member) => member?.uid === user.uid) || { joinedAt: data?.createdAt };
  return {
    ...normalized,
    ownerId: user.uid,
    maxMembers: normalizeRoomMaxMembers(normalized.maxMembers),
    members: [normalizeRoomMember(requestedMember, user)],
  };
}

function normalizeRoomMetadataPatch(data, existing, type) {
  const patch = normalizeProjectChildDisplayText(data, 'rooms', type === 'set');
  if (!Object.hasOwn(patch, 'maxMembers')) return patch;

  const maxMembers = normalizeRoomMaxMembers(patch.maxMembers);
  const currentMembers = normalizeRoomMembers(existing.members);
  if (maxMembers < currentMembers.length) {
    throwDataError(409, 'data/room-capacity', 'Room capacity cannot be less than current members.');
  }

  return {
    ...patch,
    maxMembers,
  };
}

function authorizeRoomMembersPatch({ user, type, data, existing, project }) {
  if (type !== 'update') forbidden();

  const mutableKeys = Object.keys(data || {}).filter((key) => key !== 'projectId');
  if (mutableKeys.length !== 1 || mutableKeys[0] !== 'members') forbidden();

  const transform = data.members || {};
  const values = Array.isArray(transform.values) ? transform.values : [];
  if (values.length !== 1 || !values[0] || typeof values[0] !== 'object') forbidden();

  if (transform.__type === 'arrayUnion') {
    return authorizeRoomMemberAdd({ user, data, existing, member: values[0] });
  }

  if (transform.__type === 'arrayRemove') {
    return authorizeRoomMemberRemove({ user, data, existing, project, member: values[0] });
  }

  forbidden();
}

function authorizeRoomMemberAdd({ user, data, existing, member }) {
  if (member.uid !== user.uid) forbidden();

  const members = normalizeRoomMembers(existing.members);
  if (members.some((entry) => entry.uid === user.uid)) {
    throwDataError(409, 'data/duplicate-entry', 'Entry already exists for this user.');
  }

  const maxMembers = normalizeRoomMaxMembers(existing.maxMembers);
  if (members.length >= maxMembers) {
    throwDataError(409, 'data/room-full', 'Room is already full.');
  }

  return {
    ...(data || {}),
    members: {
      __type: 'arrayUnion',
      values: [normalizeRoomMember(member, user)],
    },
  };
}

function authorizeRoomMemberRemove({ user, data, existing, project, member }) {
  const members = Array.isArray(existing.members) ? existing.members : [];
  const existingMember = members.find((entry) => entry?.uid === member.uid && deepEqualData(entry, member));
  if (!existingMember) forbidden();

  if (existingMember.uid !== user.uid && !canManageRoom(project, existing, user)) forbidden();

  return {
    ...(data || {}),
    members: {
      __type: 'arrayRemove',
      values: [existingMember],
    },
  };
}

function canManageRoom(project, room, user) {
  return canWriteProject(project, user) || room?.ownerId === user.uid;
}

function normalizeRoomMember(member, user) {
  return {
    uid: user.uid,
    name: cleanUserProvidedName(member?.name, user),
    joinedAt: member?.joinedAt,
  };
}

function normalizeRoomMembers(members) {
  if (!Array.isArray(members)) return [];
  return members
    .filter((member) => member?.uid)
    .map((member) => ({
      uid: member.uid,
      name: member.name || '',
      joinedAt: member.joinedAt,
    }));
}

function normalizeRoomMaxMembers(value) {
  return normalizeTeamRoomCapacityInput(value);
}

function authorizeBookingSlotOperation({ user, type, data, existing, project }) {
  const protectedData = preserveImmutableField(data, existing, 'projectId', type);
  if (hasBookingRuntimeField(protectedData)) {
    return authorizeBookingRuntimePatch({ user, type, data: protectedData, existing, project });
  }

  if (!canWriteProject(project, user)) forbidden();
  const metadataData = normalizeProjectChildDisplayText(protectedData, 'booking_slots', type === 'set');
  if (type === 'set') {
    return {
      ...(metadataData || {}),
      projectId: existing.projectId,
      bookedBy: existing.bookedBy ?? null,
      bookerName: existing.bookerName ?? null,
      bookingData: existing.bookingData ?? null,
      bookedAt: existing.bookedAt ?? null,
      waitlist: normalizeBookingWaitlistData(existing.waitlist),
    };
  }
  return metadataData || {};
}

function hasBookingRuntimeField(data) {
  return Object.keys(data || {}).some((key) => BOOKING_RUNTIME_FIELDS.has(key));
}

function authorizeBookingRuntimePatch({ user, type, data, existing, project }) {
  if (type !== 'update') forbidden();

  const mutableKeys = Object.keys(data || {}).filter((key) => key !== 'projectId');
  if (hasExactFields(mutableKeys, ['bookedBy', 'bookerName', 'bookingData', 'bookedAt'])) {
    return authorizeDirectBookingPatch({ user, data, existing });
  }

  if (hasExactFields(mutableKeys, ['waitlist'])) {
    return authorizeBookingWaitlistPatch({ user, data, existing });
  }

  if (hasExactFields(mutableKeys, ['bookedBy', 'bookerName', 'bookingData', 'bookedAt', 'waitlist'])) {
    return authorizeBookingReleasePatch({ user, data, existing, project });
  }

  forbidden();
}

function authorizeDirectBookingPatch({ user, data, existing }) {
  if (existing.bookedBy) {
    throwDataError(409, 'data/slot-booked', 'Booking slot is already booked.');
  }
  if (data.bookedBy !== user.uid) forbidden();
  if (normalizeBookingWaitlistData(existing.waitlist).length > 0) forbidden();

  return {
    ...(data || {}),
    bookedBy: user.uid,
    bookerName: cleanUserProvidedName(data.bookerName, user),
    bookingData: normalizeBookingData(data.bookingData),
  };
}

function authorizeBookingWaitlistPatch({ user, data, existing }) {
  if (!existing.bookedBy || existing.bookedBy === user.uid) forbidden();

  const currentWaitlist = normalizeBookingWaitlistData(existing.waitlist);
  const nextWaitlist = normalizeBookingWaitlistData(data.waitlist);
  const existingEntryIndex = currentWaitlist.findIndex((entry) => entry.uid === user.uid);

  if (existingEntryIndex >= 0) {
    const expected = currentWaitlist.filter((entry) => entry.uid !== user.uid);
    if (!deepEqualData(nextWaitlist, expected)) forbidden();
    return { waitlist: expected };
  }

  if (nextWaitlist.length !== currentWaitlist.length + 1) forbidden();
  if (!deepEqualData(nextWaitlist.slice(0, currentWaitlist.length), currentWaitlist)) forbidden();

  const addedEntry = nextWaitlist[nextWaitlist.length - 1];
  if (addedEntry.uid !== user.uid) forbidden();

  const normalizedEntry = {
    ...addedEntry,
    uid: user.uid,
    name: cleanUserProvidedName(addedEntry.name, user),
    bookingData: normalizeBookingData(addedEntry.bookingData),
  };
  const expected = [...currentWaitlist, normalizedEntry];
  if (!deepEqualData(nextWaitlist, expected)) forbidden();

  return { waitlist: expected };
}

function authorizeBookingReleasePatch({ user, data, existing, project }) {
  if (!canWriteProject(project, user)) forbidden();
  if (!existing.bookedBy) {
    throwDataError(409, 'data/slot-open', 'Booking slot is not booked.');
  }

  const [promoted, ...remainingWaitlist] = normalizeBookingWaitlistData(existing.waitlist);
  const expected = promoted
    ? {
        bookedBy: promoted.uid,
        bookerName: promoted.name,
        bookingData: normalizeBookingData(promoted.bookingData),
        bookedAt: data.bookedAt,
        waitlist: remainingWaitlist,
      }
    : {
        bookedBy: null,
        bookerName: null,
        bookingData: null,
        bookedAt: null,
        waitlist: [],
      };

  if (!deepEqualData({
    bookedBy: data.bookedBy ?? null,
    bookerName: data.bookerName ?? null,
    bookingData: data.bookingData ?? null,
    bookedAt: data.bookedAt ?? null,
    waitlist: normalizeBookingWaitlistData(data.waitlist),
  }, expected)) {
    forbidden();
  }

  return expected;
}

function hasExactFields(keys, fields) {
  return keys.length === fields.length && fields.every((field) => keys.includes(field));
}

function normalizeBookingWaitlistData(waitlist) {
  if (!Array.isArray(waitlist)) return [];
  return waitlist
    .filter((entry) => entry?.uid)
    .map((entry) => ({
      uid: entry.uid,
      name: entry.name || '',
      bookingData: normalizeBookingData(entry.bookingData),
      joinedAt: entry.joinedAt,
    }));
}

function normalizeBookingData(data) {
  return normalizeBookingDataInput(data);
}

function normalizePlainObject(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  return cloneDataValue(data);
}

function authorizeClaimItemOperation({ user, type, data, existing, project }) {
  const protectedData = preserveImmutableField(data, existing, 'projectId', type);
  if (Object.hasOwn(protectedData || {}, 'claimants')) {
    return authorizeClaimantsPatch({ user, type, data: protectedData, existing });
  }

  if (!canWriteProject(project, user)) forbidden();
  const metadataData = normalizeProjectChildDisplayText(protectedData, 'claim_items', type === 'set');
  assertImmutableField(metadataData, existing, 'creatorId');
  assertImmutableField(metadataData, existing, 'creatorName');
  const metadataPatch = normalizeClaimMetadataPatch(metadataData, existing);
  if (type === 'set') {
    return {
      ...(metadataPatch || {}),
      projectId: existing.projectId,
      creatorId: existing.creatorId,
      creatorName: existing.creatorName,
      claimants: Array.isArray(existing.claimants) ? existing.claimants : [],
    };
  }
  return metadataPatch || {};
}

function normalizeClaimMetadataPatch(data, existing) {
  const patch = data || {};
  if (!Object.hasOwn(patch, 'maxClaims')) return patch;

  const maxClaims = normalizeClaimMaxClaims(patch.maxClaims);
  const currentClaimants = Array.isArray(existing.claimants) ? existing.claimants : [];
  if (maxClaims < currentClaimants.length) {
    throwDataError(409, 'data/claim-capacity', 'Claim capacity cannot be less than current claimants.');
  }

  return {
    ...patch,
    maxClaims,
  };
}

function authorizeClaimantsPatch({ user, type, data, existing }) {
  if (type !== 'update') forbidden();

  const mutableKeys = Object.keys(data || {}).filter((key) => key !== 'projectId');
  if (mutableKeys.length !== 1 || mutableKeys[0] !== 'claimants') forbidden();

  const transform = data.claimants || {};
  const values = Array.isArray(transform.values) ? transform.values : [];
  if (values.length !== 1 || !values[0] || typeof values[0] !== 'object') forbidden();

  if (transform.__type === 'arrayUnion') {
    return authorizeClaimantAdd({ user, data, existing, claimant: values[0] });
  }

  if (transform.__type === 'arrayRemove') {
    return authorizeClaimantRemove({ user, data, existing, claimant: values[0] });
  }

  forbidden();
}

function authorizeClaimantAdd({ user, data, existing, claimant }) {
  if (claimant.uid !== user.uid) forbidden();

  const claimants = Array.isArray(existing.claimants) ? existing.claimants : [];
  if (claimants.some((entry) => entry?.uid === user.uid)) {
    throwDataError(409, 'data/duplicate-entry', 'Entry already exists for this user.');
  }

  const maxClaims = normalizeClaimMaxClaims(existing.maxClaims);
  if (claimants.length >= maxClaims) {
    throwDataError(409, 'data/claim-full', 'Claim item is full.');
  }

  return {
    ...(data || {}),
    claimants: {
      __type: 'arrayUnion',
      values: [{
        ...claimant,
        uid: user.uid,
        name: cleanUserProvidedName(claimant.name, user),
      }],
    },
  };
}

function normalizeClaimMaxClaims(value) {
  return normalizeClaimCapacityInput(value);
}

function authorizeClaimantRemove({ user, data, existing, claimant }) {
  if (claimant.uid !== user.uid) forbidden();

  const claimants = Array.isArray(existing.claimants) ? existing.claimants : [];
  const existingClaim = claimants.find((entry) => entry?.uid === user.uid && deepEqualData(entry, claimant));
  if (!existingClaim) forbidden();

  return {
    ...(data || {}),
    claimants: {
      __type: 'arrayRemove',
      values: [existingClaim],
    },
  };
}

async function authorizeProjectUserEntryOperation({
  store,
  user,
  context,
  type,
  collection,
  data,
  existing,
  project,
  projectId,
}) {
  if (!existing) {
    return normalizeProjectUserEntryCreateData({ store, context, user, collection, projectId, data, project });
  }

  if (collection === 'queue_participants') {
    if (!canWriteProject(project, user)) forbidden();
    return allowOnlyFields(data, ['queueOrder']);
  }

  if (collection === 'roulette_participants') {
    if (!canWriteProject(project, user)) forbidden();
    return allowOnlyFields(data, ['isWinner']);
  }

  if (collection === 'schedule_submissions') {
    if (existing.uid !== user.uid && !isAdminUser(user)) forbidden();
    return normalizeScheduleSubmissionData(allowOnlyFields(data, ['availability', 'submittedAt']), project);
  }

  if (collection === 'gather_submissions') {
    if (!isAdminUser(user)) forbidden();
    if (type === 'delete') return undefined;
    return normalizeGatherSubmissionPatchData({ store, context, projectId, data });
  }

  return data || {};
}

async function normalizeProjectUserEntryCreateData({ store, context, user, collection, projectId, data, project }) {
  await assertNoDuplicateProjectUserEntry(store, collection, projectId, user.uid);

  const base = {
    ...(data || {}),
    projectId,
    uid: user.uid,
    name: cleanUserProvidedName(data?.name, user),
  };

  if (collection === 'queue_participants') {
    return {
      ...base,
      value: normalizeParticipantValueInput(data?.value),
      queueOrder: null,
    };
  }

  if (collection === 'roulette_participants') {
    return {
      ...base,
      value: normalizeParticipantValueInput(data?.value),
      isWinner: false,
    };
  }

  if (collection === 'schedule_submissions') {
    return normalizeScheduleSubmissionData(base, project);
  }

  if (collection === 'gather_submissions') {
    return {
      ...base,
      data: normalizeGatherSubmissionData(
        data?.data,
        await listProjectedGatherFields({ store, context, projectId }),
      ),
    };
  }

  return base;
}

async function normalizeGatherSubmissionPatchData({ store, context, projectId, data }) {
  const patch = allowOnlyFields(data, ['data', 'submittedAt']);
  if (Object.hasOwn(patch, 'data')) {
    patch.data = normalizeGatherSubmissionData(
      patch.data,
      await listProjectedGatherFields({ store, context, projectId }),
    );
  }
  return patch;
}

function normalizeScheduleSubmissionData(data, project) {
  const normalized = data || {};
  if (!Object.hasOwn(normalized, 'availability')) return normalized;

  const availability = normalizeScheduleAvailabilityInput(normalized.availability, project?.scheduleConfig);
  if (availability === null) {
    throwDataError(400, 'data/invalid-schedule-availability', 'Schedule availability is invalid.');
  }
  return {
    ...normalized,
    availability,
  };
}

async function assertNoDuplicateProjectUserEntry(store, collection, projectId, uid) {
  const docs = await store.list(collection, {
    filters: [{ field: 'projectId', op: '==', value: projectId }],
  });
  if (docs.some((doc) => doc.uid === uid)) {
    throwDataError(409, 'data/duplicate-entry', 'Entry already exists for this user.');
  }
}

function allowOnlyFields(data, fields) {
  const patch = data || {};
  const allowed = new Set(fields);
  for (const key of Object.keys(patch)) {
    if (!allowed.has(key)) forbidden();
  }
  return patch;
}

async function filterReadableDocs({ store, user, collection, docs, query, now }) {
  if (!collectionNeedsReadFiltering(collection)) return docs;

  const visible = [];
  for (const doc of docs || []) {
    const readable = await toReadableDataDoc({ store, user, collection, doc, query, now });
    if (readable) visible.push(readable);
  }
  return visible;
}

function collectionNeedsReadFiltering(collection) {
  return collection === 'projects'
    || collection === 'announcements'
    || PROJECT_CHILD_COLLECTION_FIELDS.has(collection)
    || ['notifications', 'friendships', 'friend_messages'].includes(collection);
}

async function toReadableDataDoc({ store, user, collection, doc, query, now }) {
  if (!doc) return null;
  if (collection === 'projects') return toReadableProjectDoc({ store, user, project: doc });
  if (await canReadDataDoc({ store, user, collection, doc, query, now })) return doc;
  return null;
}

async function toDataWriteResponseDoc({ store, user, collection, doc, now }) {
  if (collection === 'projects') return toReadableDataDoc({ store, user, collection, doc, now });
  return doc;
}

async function toReadableDataBatchResults({ store, user, operations, results, now }) {
  const readableResults = [];
  for (let index = 0; index < (results || []).length; index += 1) {
    const operation = operations[index];
    const result = results[index];
    if (!operation || operation.type === 'delete') {
      readableResults.push(result);
    } else if (operation.collection === 'projects') {
      readableResults.push(await toReadableDataDoc({ store, user, collection: operation.collection, doc: result, now }));
    } else {
      readableResults.push(result);
    }
  }
  return readableResults;
}

async function canReadDataDoc({ store, user, collection, doc, query, now }) {
  if (!doc) return true;
  if (isAdminUser(user)) return true;
  if (collection === 'announcements') return isAnnouncementVisible(doc, typeof now === 'function' ? now() : Date.now());
  const projectField = PROJECT_CHILD_COLLECTION_FIELDS.get(collection);
  if (projectField) {
    return canReadProjectById({ store, user, projectId: doc[projectField] });
  }
  if (collection === 'notifications') {
    return doc.recipientId === user.uid || (
      isExactProjectQuery(query, doc.projectId)
      && await canManageProjectNotification(store, user, doc)
    );
  }
  if (collection === 'friendships') return hasMember(doc, user.uid);
  if (collection === 'friend_messages') return canAccessFriendMessage(store, user, doc);
  return true;
}

async function unlockProjectAccess({ store, user, body, now }) {
  const projectId = validateDataId(body?.projectId);
  const submittedPassword = normalizeProjectUnlockPassword(body?.password);
  const project = await store.get('projects', projectId);
  if (!project) throwDataError(404, 'project-access/not-found', 'Project not found.');

  if (hasProjectPassword(project) && !canWriteProject(project, user)) {
    if (submittedPassword !== project.password) {
      throwDataError(403, 'project-access/invalid-password', 'Project password is incorrect.');
    }
    await store.set('project_access', projectAccessGrantId(project.id, user.uid), {
      projectId: project.id,
      uid: user.uid,
      grantedAt: now(),
    });
  }

  return {
    ok: true,
    project: await toReadableProjectDoc({ store, user, project }),
  };
}

function normalizeProjectUnlockPassword(password) {
  const submittedPassword = String(password || '');
  if (submittedPassword.length > PROJECT_PASSWORD_MAX_LENGTH) {
    throwDataError(400, 'project-access/invalid-password', 'Project password is invalid.');
  }
  return submittedPassword;
}

async function toReadableProjectDoc({ store, user, project }) {
  const { password: _password, ...safeProject } = project;
  const hasPassword = hasProjectPassword(project);
  const accessGranted = await canReadPrivateProject({ store, user, project });

  if (!hasPassword || accessGranted) {
    return {
      ...safeProject,
      hasPassword,
      accessGranted: true,
    };
  }

  return {
    id: project.id,
    title: project.title,
    type: project.type,
    creatorId: project.creatorId,
    creatorName: project.creatorName,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    status: project.status,
    archived: project.archived,
    hasPassword: true,
    accessGranted: false,
  };
}

async function canReadProjectById({ store, user, projectId }) {
  if (typeof projectId !== 'string' || projectId.trim() === '') return false;
  const project = await store.get('projects', projectId);
  if (!project) return false;
  return canReadPrivateProject({ store, user, project });
}

async function canReadPrivateProject({ store, user, project }) {
  if (!hasProjectPassword(project)) return true;
  if (canWriteProject(project, user)) return true;
  return hasProjectAccessGrant({ store, user, projectId: project.id });
}

async function hasProjectAccessGrant({ store, user, projectId }) {
  if (!user?.uid) return false;
  const grant = await store.get('project_access', projectAccessGrantId(projectId, user.uid));
  return grant?.projectId === projectId && grant?.uid === user.uid;
}

async function getProjectAccessLifecycleChanges({ store, operations }) {
  const changes = [];
  const context = createAuthorizationContext();

  for (const operation of operations || []) {
    if (operation?.collection !== 'projects') continue;

    if (operation.type === 'add') continue;

    const change = await getProjectAccessLifecycleChange({
      store,
      context,
      type: operation.type,
      id: operation.id,
      data: operation.data || {},
      options: operation.options || {},
    });
    if (change) changes.push(change);
    await stageAuthorizedDataOperation({ store, context, operation });
  }

  return changes;
}

async function getProjectAccessLifecycleChange({ store, context, type, id, data, options }) {
  const existing = await getProjectedDoc({ store, context, collection: 'projects', id });
  if (!existing) return null;
  if (type === 'delete') return { projectId: id, revoke: true };
  if (type !== 'set' && type !== 'update') return null;

  const beforePassword = normalizeProjectPassword(existing.password, { rejectOverlong: false });
  const afterPassword = getProjectPasswordAfterWrite({ type, existing, data, options });
  if (beforePassword === afterPassword) return null;
  return { projectId: id, revoke: true };
}

function getProjectPasswordAfterWrite({ type, existing, data, options }) {
  if (type === 'update') {
    return Object.hasOwn(data || {}, 'password')
      ? normalizeProjectPassword(data.password)
      : normalizeProjectPassword(existing?.password, { rejectOverlong: false });
  }

  if (type === 'set' && options?.merge && !Object.hasOwn(data || {}, 'password')) {
    return normalizeProjectPassword(existing?.password, { rejectOverlong: false });
  }

  return normalizeProjectPassword(data?.password);
}

function normalizeProjectPassword(password, { rejectOverlong = true } = {}) {
  const cleanPassword = String(password || '').trim();
  if (rejectOverlong && cleanPassword.length > PROJECT_PASSWORD_MAX_LENGTH) {
    throwDataError(400, 'data/invalid-project-password', 'Project password is too long.');
  }
  return cleanPassword;
}

async function applyProjectAccessLifecycleChanges({ store, changes }) {
  const projectIds = new Set((changes || [])
    .filter((change) => change?.revoke && typeof change.projectId === 'string' && change.projectId.trim())
    .map((change) => change.projectId));

  for (const projectId of projectIds) {
    await revokeProjectAccessGrants({ store, projectId });
  }
}

async function applyProjectAccessLifecycleChange({ store, change }) {
  await applyProjectAccessLifecycleChanges({ store, changes: change ? [change] : [] });
}

async function revokeProjectAccessGrants({ store, projectId }) {
  const grants = await store.list('project_access', {
    filters: [{ field: 'projectId', op: '==', value: projectId }],
  });
  for (const grant of grants) {
    await store.delete('project_access', grant.id);
  }
}

function projectAccessGrantId(projectId, uid) {
  return `${projectId}:${uid}`;
}

function hasProjectPassword(project) {
  return normalizeProjectPassword(project?.password) !== '';
}

async function authorizeNotificationOperation({ store, user, type, id, data }) {
  if (type === 'add') return normalizeNotificationCreateData({ store, user, data });

  const existing = await store.get('notifications', id);
  if (!existing) {
    if (type === 'set') return normalizeNotificationCreateData({ store, user, data });
    throwDataError(404, 'data/not-found', 'Notification not found.');
  }
  if (!canWriteNotification(existing, user)) {
    if (!(type === 'delete' && await canManageProjectNotification(store, user, existing))) forbidden();
  }

  if (type === 'delete') return undefined;
  return preserveImmutableField(data, existing, 'recipientId', type);
}

async function normalizeNotificationCreateData({ store, user, data }) {
  if (isAdminUser(user)) return data || {};

  const notification = data || {};
  const recipientId = typeof notification.recipientId === 'string' ? notification.recipientId.trim() : '';
  if (!recipientId) forbidden();

  if (notification.type === 'friend_req') {
    const friendship = await findPendingFriendRequest(store, user.uid, recipientId);
    if (!friendship) forbidden();
    if (await hasDuplicateFriendRequestNotification(store, user.uid, recipientId)) {
      throwDataError(409, 'data/duplicate-notification', 'Notification already exists.');
    }
    return {
      ...notification,
      recipientId,
      type: 'friend_req',
      senderId: user.uid,
      read: false,
    };
  }

  if (notification.type === 'friend_message') {
    return normalizeFriendMessageNotificationData({ store, user, notification, recipientId });
  }

  if (PROJECT_NOTIFICATION_TYPES.has(notification.type)) {
    const projectId = typeof notification.projectId === 'string' ? notification.projectId.trim() : '';
    if (!projectId) throwDataError(400, 'data/invalid-project', 'Project id is required.');
    const project = await store.get('projects', projectId);
    if (!project) throwDataError(404, 'data/project-not-found', 'Project not found.');
    if (!canWriteProject(project, user)) forbidden();
    if (isProjectLocked(project)) throwDataError(409, 'data/project-locked', 'Project is paused, finished, or archived.');
    return {
      ...notification,
      recipientId,
      projectId,
      read: false,
    };
  }

  forbidden();
}

async function normalizeFriendMessageNotificationData({ store, user, notification, recipientId }) {
  const chatId = typeof notification.chatId === 'string' ? notification.chatId.trim() : '';
  if (!chatId || recipientId === user.uid) forbidden();
  const relationship = await store.get('friendships', chatId);
  if (
    relationship?.status !== 'confirmed'
    || !hasMember(relationship, user.uid)
    || !hasMember(relationship, recipientId)
  ) {
    forbidden();
  }

  const message = normalizeMessageText(notification.message);
  if (!message) throwInvalidMessageText();
  return {
    ...notification,
    recipientId,
    type: 'friend_message',
    chatId,
    senderId: user.uid,
    message,
    read: false,
  };
}

async function hasDuplicateFriendRequestNotification(store, senderId, recipientId) {
  const notifications = await store.list('notifications', {
    filters: [{ field: 'recipientId', op: '==', value: recipientId }],
  });

  return notifications.some((notification) => (
    notification.type === 'friend_req'
    && notification.senderId === senderId
  ));
}

async function findPendingFriendRequest(store, initiatorId, recipientId) {
  const relationships = await store.list('friendships', {
    filters: [{ field: 'members', op: 'array-contains', value: initiatorId }],
  });

  return relationships.find((relationship) => (
    relationship.status === 'pending'
    && relationship.initiator === initiatorId
    && hasMember(relationship, recipientId)
  )) || null;
}

async function authorizeFriendshipOperation({ store, user, context, type, id, data }) {
  if (type === 'add') return normalizeFriendshipCreateData({ store, context, data, user });

  const existing = await store.get('friendships', id);
  if (!existing) {
    if (type === 'set') return normalizeFriendshipCreateData({ store, context, data, user });
    throwDataError(404, 'data/not-found', 'Friendship not found.');
  }

  if (!hasMember(existing, user.uid) && !isAdminUser(user)) forbidden();
  if (type === 'delete') return undefined;
  if (isAdminUser(user)) return data || {};
  if (type === 'set') forbidden();

  const patch = data || {};
  const patchKeys = Object.keys(patch);
  if (
    patch.status === 'confirmed'
    && patchKeys.length === 1
    && existing.status === 'pending'
    && existing.initiator !== user.uid
  ) {
    return { status: 'confirmed' };
  }

  forbidden();
}

async function authorizeFriendMessageOperation({ store, user, type, id, data }) {
  if (type === 'add') return normalizeFriendMessageCreateData(store, data, user);

  const existing = await store.get('friend_messages', id);
  if (!existing) {
    if (type === 'set') return normalizeFriendMessageCreateData(store, data, user);
    throwDataError(404, 'data/not-found', 'Friend message not found.');
  }

  if (isAdminUser(user)) {
    if (type === 'delete') return undefined;
    forbidden();
  }
  if (existing.senderId !== user.uid) forbidden();
  if (type === 'delete') return undefined;
  forbidden();
}

async function normalizeFriendshipCreateData({ store, context, data, user }) {
  const members = Array.isArray(data?.members) ? [...new Set(data.members)] : [];
  if (members.length !== 2 || !members.includes(user.uid)) forbidden();
  if (data?.initiator !== undefined && data.initiator !== user.uid) forbidden();
  if (data?.status !== undefined && data.status !== 'pending') forbidden();
  await assertNoDuplicateFriendship({ store, context, members });
  return {
    ...(data || {}),
    members,
    status: 'pending',
    initiator: user.uid,
  };
}

async function normalizeFriendMessageCreateData(store, data, user) {
  const text = normalizeMessageText(data?.text);
  if (!text) throwInvalidMessageText();
  const relationship = await store.get('friendships', data?.chatId);
  if (relationship?.status !== 'confirmed' || !hasMember(relationship, user.uid)) forbidden();
  return {
    ...(data || {}),
    text,
    senderId: user.uid,
  };
}

function throwInvalidMessageText() {
  throwDataError(400, 'data/invalid-message', `Message text must be 1-${MESSAGE_TEXT_MAX_LENGTH} characters.`);
}

async function assertNoDuplicateFriendship({ store, context, members }) {
  const key = friendshipMembersKey(members);
  if (context?.friendshipCreateKeys?.has(key)) {
    throwDataError(409, 'data/duplicate-friendship', 'Friendship already exists.');
  }

  const relationships = await store.list('friendships', {
    filters: [{ field: 'members', op: 'array-contains', value: members[0] }],
  });
  const duplicate = relationships.some((relationship) => (
    ['pending', 'confirmed'].includes(relationship.status)
    && hasMember(relationship, members[1])
  ));
  if (duplicate) throwDataError(409, 'data/duplicate-friendship', 'Friendship already exists.');

  context?.friendshipCreateKeys?.add(key);
}

function friendshipMembersKey(members) {
  return [...members].sort().join('\0');
}

function canWriteNotification(notification, user) {
  return notification.recipientId === user.uid || isAdminUser(user);
}

async function canManageProjectNotification(store, user, notification) {
  if (!PROJECT_NOTIFICATION_TYPES.has(notification?.type)) return false;
  const projectId = typeof notification.projectId === 'string' ? notification.projectId.trim() : '';
  if (!projectId) return false;
  const project = await store.get('projects', projectId);
  return Boolean(project && canWriteProject(project, user));
}

function isExactProjectQuery(query, projectId) {
  if (!projectId) return false;
  return (query?.filters || []).some((filter) => (
    filter?.field === 'projectId'
    && filter.op === '=='
    && filter.value === projectId
  ));
}

async function canAccessFriendMessage(store, user, message) {
  const relationship = await store.get('friendships', message.chatId);
  return relationship?.status === 'confirmed' && hasMember(relationship, user.uid);
}

function hasMember(record, uid) {
  return Array.isArray(record?.members) && record.members.includes(uid);
}

function createAuthorizationContext() {
  return { projectedDocs: new Map(), friendshipCreateKeys: new Set() };
}

function projectionKey(collection, id) {
  return `${collection}\0${id}`;
}

async function getProjectedDoc({ store, context, collection, id }) {
  if (!context) return store.get(collection, id);
  const key = projectionKey(collection, id);
  if (context.projectedDocs.has(key)) {
    const doc = context.projectedDocs.get(key);
    return doc ? cloneDataValue(doc) : null;
  }
  return store.get(collection, id);
}

function setProjectedDoc(context, collection, id, doc) {
  context.projectedDocs.set(projectionKey(collection, id), doc ? cloneDataValue(doc) : null);
}

async function stageAuthorizedDataOperation({ store, context, operation }) {
  if (!context || !operation?.id) return;

  if (operation.type === 'delete') {
    setProjectedDoc(context, operation.collection, operation.id, null);
    return;
  }

  if (operation.type === 'update') {
    const existing = await getProjectedDoc({
      store,
      context,
      collection: operation.collection,
      id: operation.id,
    });
    if (!existing) return;
    setProjectedDoc(context, operation.collection, operation.id, {
      ...existing,
      ...applyDataPatch(existing, operation.data || {}),
    });
    return;
  }

  if (operation.type === 'set') {
    const existing = await getProjectedDoc({
      store,
      context,
      collection: operation.collection,
      id: operation.id,
    });
    const nextDoc = operation.options?.merge
      ? {
          ...(existing || { id: operation.id }),
          ...applyDataPatch(existing || {}, operation.data || {}),
        }
      : { id: operation.id, ...cloneDataValue(operation.data || {}) };
    setProjectedDoc(context, operation.collection, operation.id, nextDoc);
  }
}

async function listProjectedVotingItems({ store, context, projectId }) {
  const docs = new Map((await store.list('voting_items', {
    filters: [{ field: 'projectId', op: '==', value: projectId }],
  })).map((doc) => [doc.id, doc]));

  if (context) {
    for (const [key, doc] of context.projectedDocs.entries()) {
      const separator = key.indexOf('\0');
      const collection = key.slice(0, separator);
      const id = key.slice(separator + 1);
      if (collection !== 'voting_items') continue;
      if (!doc) {
        docs.delete(id);
      } else if (doc.projectId === projectId) {
        docs.set(id, cloneDataValue(doc));
      }
    }
  }

  return [...docs.values()];
}

async function listProjectedGatherFields({ store, context, projectId }) {
  const docs = new Map((await store.list('gather_fields', {
    filters: [{ field: 'projectId', op: '==', value: projectId }],
  })).map((doc) => [doc.id, doc]));

  if (context) {
    for (const [key, doc] of context.projectedDocs.entries()) {
      const separator = key.indexOf('\0');
      const collection = key.slice(0, separator);
      const id = key.slice(separator + 1);
      if (collection !== 'gather_fields') continue;
      if (!doc) {
        docs.delete(id);
      } else if (doc.projectId === projectId) {
        docs.set(id, cloneDataValue(doc));
      }
    }
  }

  return [...docs.values()];
}

function applyDataPatch(existing, patch) {
  const result = {};
  for (const [key, value] of Object.entries(patch || {})) {
    if (value?.__type === 'arrayUnion') {
      const current = Array.isArray(existing[key]) ? [...existing[key]] : [];
      for (const item of value.values || []) {
        if (!current.some((entry) => deepEqualData(entry, item))) current.push(cloneDataValue(item));
      }
      result[key] = current;
    } else if (value?.__type === 'arrayRemove') {
      const current = Array.isArray(existing[key]) ? existing[key] : [];
      result[key] = current.filter((entry) => !(value.values || []).some((item) => deepEqualData(entry, item)));
    } else {
      result[key] = cloneDataValue(value);
    }
  }
  return result;
}

function deepEqualData(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function cloneDataValue(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function preserveImmutableField(data, existing, field, type) {
  if (Object.hasOwn(data || {}, field) && data[field] !== existing[field]) forbidden();
  if (type === 'set') {
    return {
      ...(data || {}),
      [field]: existing[field],
    };
  }
  return data || {};
}

function assertImmutableField(data, existing, field) {
  if (Object.hasOwn(data || {}, field) && data[field] !== existing[field]) forbidden();
}

function assertImmutableUserField(data, identity, field) {
  if (Object.hasOwn(data || {}, field) && data[field] !== identity[field]) forbidden();
}

async function normalizeProjectCreateData({ store, data, user }) {
  const {
    duplicateSourceId,
    hasPassword: _hasPassword,
    accessGranted: _accessGranted,
    ...projectData
  } = data || {};
  let password = projectData.password;

  if (duplicateSourceId !== undefined) {
    const sourceProjectId = validateDataId(duplicateSourceId);
    const sourceProject = await store.get('projects', sourceProjectId);
    if (!sourceProject) throwDataError(404, 'data/project-not-found', 'Project not found.');
    if (!canWriteProject(sourceProject, user)) forbidden();
    password = sourceProject.password || '';
  }

  return {
    ...normalizeProjectStateData({
      data: projectData,
      existing: null,
      type: 'add',
    }),
    creatorId: user.uid,
    creatorName: cleanUserProvidedName(projectData.creatorName, user),
    password: normalizeProjectPassword(password),
  };
}

function normalizeProjectStateData({ data, existing, type }) {
  const normalized = { ...(data || {}) };

  if (Object.hasOwn(normalized, 'status')) {
    assertValidProjectStatus(normalized.status);
  } else if (type === 'add') {
    normalized.status = 'active';
  } else if (type === 'set') {
    normalized.status = PROJECT_STATUSES.has(existing?.status) ? existing.status : 'active';
  }

  if (Object.hasOwn(normalized, 'archived')) {
    assertValidProjectArchived(normalized.archived);
  } else if (type === 'add') {
    normalized.archived = false;
  } else if (type === 'set') {
    normalized.archived = Boolean(existing?.archived);
  }

  if (Object.hasOwn(normalized, 'archivedAt')) {
    assertValidProjectArchivedAt(normalized.archivedAt);
  } else if (type === 'add') {
    normalized.archivedAt = null;
  } else if (type === 'set') {
    normalized.archivedAt = existing?.archivedAt ?? null;
  }

  if (Object.hasOwn(normalized, 'archived') && normalized.archived === false) {
    normalized.archivedAt = null;
  }

  if (Object.hasOwn(normalized, 'password')) {
    normalized.password = normalizeProjectPassword(normalized.password);
  }

  normalizeProjectConfigData(normalized);

  return normalized;
}

function normalizeProjectConfigData(normalized) {
  if (Object.hasOwn(normalized, 'votingConfig')) {
    normalized.votingConfig = normalizeVotingConfigData(normalized.votingConfig);
  }

  if (Object.hasOwn(normalized, 'scheduleConfig')) {
    normalized.scheduleConfig = normalizeScheduleConfigData(normalized.scheduleConfig);
  }

  if (Object.hasOwn(normalized, 'bookingConfig')) {
    normalized.bookingConfig = normalizeBookingConfigData(normalized.bookingConfig);
  }
}

function normalizeVotingConfigData(config) {
  if (!isPlainObject(config) || !VOTING_MODES.has(config.mode)) {
    throwDataError(400, 'data/invalid-project-config', 'Project configuration is invalid.');
  }
  return { mode: config.mode };
}

function normalizeScheduleConfigData(config) {
  if (!isPlainObject(config)) {
    throwDataError(400, 'data/invalid-project-config', 'Project configuration is invalid.');
  }
  const normalized = createScheduleConfigData(config);
  if (!normalized) {
    throwDataError(400, 'data/invalid-project-config', 'Project configuration is invalid.');
  }
  return normalized;
}

function normalizeBookingConfigData(config) {
  if (!isPlainObject(config)) {
    throwDataError(400, 'data/invalid-project-config', 'Project configuration is invalid.');
  }
  const normalized = createBookingConfigData(config);
  if (!normalized) {
    throwDataError(400, 'data/invalid-project-config', 'Project configuration is invalid.');
  }
  return normalized;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function assertValidProjectStatus(status) {
  if (!PROJECT_STATUSES.has(status)) {
    throwDataError(400, 'data/invalid-project-status', 'Project status is invalid.');
  }
}

function assertValidProjectArchived(archived) {
  if (typeof archived !== 'boolean') {
    throwDataError(400, 'data/invalid-project-archive', 'Project archive state is invalid.');
  }
}

function assertValidProjectArchivedAt(archivedAt) {
  if (archivedAt !== null && (!Number.isFinite(archivedAt) || archivedAt < 0)) {
    throwDataError(400, 'data/invalid-project-archive', 'Project archive timestamp is invalid.');
  }
}

function preserveProjectOwner(data, existing, type) {
  if (Object.hasOwn(data || {}, 'creatorId') && data.creatorId !== existing.creatorId) {
    throwDataError(403, 'data/forbidden', 'Project ownership cannot be changed.');
  }
  if (type === 'set') {
    return {
      ...(data || {}),
      creatorId: existing.creatorId,
    };
  }
  return data || {};
}

function canWriteProject(project, user) {
  return project.creatorId === user.uid || isAdminUser(user);
}

function canDeleteProjectChild({ collection, doc, project, user }) {
  if (canWriteProject(project, user)) return true;
  if (!doc || !user?.uid) return false;

  if (collection === 'voting_items' || collection === 'claim_items' || collection === 'gather_fields') {
    return doc.creatorId === user.uid;
  }

  if (collection === 'rooms') {
    return doc.ownerId === user.uid;
  }

  if (
    collection === 'queue_participants'
    || collection === 'roulette_participants'
    || collection === 'gather_submissions'
    || collection === 'schedule_submissions'
    || collection === 'project_chats'
  ) {
    return doc.uid === user.uid;
  }

  if (collection === 'game_rooms') {
    return doc.createdBy === user.uid;
  }

  return false;
}

function isProjectLocked(project) {
  return Boolean(project?.archived) || LOCKED_PROJECT_STATUSES.has(project?.status);
}

function isAdminUser(user) {
  const email = normalizeEmail(user?.email);
  if (!email) return false;
  return adminEmails().includes(email);
}

function adminEmails() {
  const raw = process.env.ATMOSTFAIR_ADMIN_EMAILS;
  if (raw === undefined) return DEFAULT_ADMIN_EMAILS;
  return raw.split(',').map(normalizeEmail).filter(Boolean);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function cleanUserProvidedName(name, user) {
  const cleaned = String(name || '').trim();
  const fallback = user?.displayName || user?.email?.split('@')[0] || '';
  return String(cleaned || fallback || '').trim().slice(0, PROJECT_CREATOR_NAME_MAX_LENGTH);
}

function throwDataError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}

function forbidden() {
  throwDataError(403, 'data/forbidden', 'You do not have permission to access this record.');
}

async function requireUser(request, auth) {
  const token = getBearerToken(request);
  if (!token) {
    const error = new Error('Authentication required.');
    error.status = 401;
    error.code = 'auth/missing-token';
    throw error;
  }
  try {
    return await auth.verifyToken(token);
  } catch (error) {
    error.status = 401;
    throw error;
  }
}

async function readJson(request) {
  let raw = '';
  for await (const chunk of request) raw += chunk;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('Invalid JSON body.');
    error.status = 400;
    error.code = 'invalid-json';
    throw error;
  }
}

function getBearerToken(request) {
  const authorization = request.headers.authorization || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    'content-type': 'application/json; charset=utf-8',
  });
  if (payload === null) return response.end();
  return response.end(JSON.stringify(payload));
}

async function serveStatic(response, staticDir, requestPath, headOnly) {
  const decodedPath = decodeURIComponent(requestPath.split('?')[0]);
  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  const candidate = path.resolve(staticDir, relativePath);
  const root = path.resolve(staticDir);
  const filePath = candidate.startsWith(root) ? candidate : path.join(root, 'index.html');
  const finalPath = await readableFile(filePath) ? filePath : path.join(root, 'index.html');

  if (!(await readableFile(finalPath))) {
    return sendJson(response, 404, { error: { code: 'not-found', message: 'Static file not found.' } });
  }

  const fileStat = await stat(finalPath);
  response.writeHead(200, {
    'content-type': contentType(finalPath),
    'content-length': fileStat.size,
    'cache-control': finalPath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  if (headOnly) return response.end();
  return createReadStream(finalPath).pipe(response);
}

async function readableFile(filePath) {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return false;
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.ico')) return 'image/x-icon';
  return 'application/octet-stream';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4174);
  const dataDir = process.env.ATMOSTFAIR_DATA_DIR || '/var/lib/atmostfair';
  const staticDir = process.env.ATMOSTFAIR_STATIC_DIR || path.join(projectRoot, 'dist');
  const sessionSecret = process.env.ATMOSTFAIR_SESSION_SECRET || cryptoSafeFallbackSecret();
  const store = await createDataStore({ filePath: path.join(dataDir, 'db.json') });
  const server = createLocalBackendServer({ store, sessionSecret, staticDir });
  server.listen(port, '0.0.0.0', () => {
    console.log(`atmostfair local backend listening on http://0.0.0.0:${port}`);
  });
}

function cryptoSafeFallbackSecret() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ATMOSTFAIR_SESSION_SECRET is required in production.');
  }
  return 'local-development-secret';
}
