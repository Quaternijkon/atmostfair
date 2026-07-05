import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAuthService } from './auth-service.mjs';
import { createDataStore } from './data-store.mjs';

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

export function createLocalBackendServer({
  store,
  sessionSecret,
  staticDir = path.join(projectRoot, 'dist'),
  now,
}) {
  const auth = createAuthService({ store, sessionSecret, now });

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

      if (request.method === 'OPTIONS') {
        return sendJson(response, 204, null);
      }

      if (url.pathname.startsWith('/api/')) {
        return await handleApi({ request, response, url, auth, store });
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

async function handleApi({ request, response, url, auth, store }) {
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

  if (url.pathname.startsWith('/api/data/')) {
    await requireUser(request, auth);
    const body = await readJson(request);
    return handleDataApi({ request, response, url, store, body });
  }

  return sendJson(response, 404, { error: { code: 'not-found', message: 'API route not found.' } });
}

async function handleDataApi({ request, response, url, store, body }) {
  if (request.method !== 'POST') {
    return sendJson(response, 405, { error: { code: 'method-not-allowed', message: 'Method not allowed.' } });
  }

  if (url.pathname === '/api/data/list') {
    const collection = validateDataCollection(body.collection);
    const docs = await store.list(collection, body.query || {});
    return sendJson(response, 200, { docs });
  }

  if (url.pathname === '/api/data/get') {
    const collection = validateDataCollection(body.collection);
    const doc = await store.get(collection, body.id);
    return sendJson(response, 200, { doc });
  }

  if (url.pathname === '/api/data/add') {
    const collection = validateDataCollection(body.collection);
    const doc = await store.add(collection, body.data || {});
    return sendJson(response, 200, { doc });
  }

  if (url.pathname === '/api/data/set') {
    const collection = validateDataCollection(body.collection);
    const doc = await store.set(collection, body.id, body.data || {}, body.options || {});
    return sendJson(response, 200, { doc });
  }

  if (url.pathname === '/api/data/update') {
    const collection = validateDataCollection(body.collection);
    const doc = await store.update(collection, body.id, body.data || {});
    return sendJson(response, 200, { doc });
  }

  if (url.pathname === '/api/data/delete') {
    const collection = validateDataCollection(body.collection);
    await store.delete(collection, body.id);
    return sendJson(response, 200, { ok: true });
  }

  if (url.pathname === '/api/data/batch') {
    const operations = validateDataBatchOperations(body.operations || []);
    const results = await store.batch(operations);
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
  }

  return operations;
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
