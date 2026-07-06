import crypto from 'node:crypto';
import { promisify } from 'node:util';

import { isValidAuthEmail, isValidAuthPassword, normalizeAuthEmail } from '../src/lib/authDomain.js';
import { normalizeUserDisplayName } from '../src/lib/userDomain.js';

const scrypt = promisify(crypto.scrypt);
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const AUTH_ERROR_STATUS = {
  'auth/email-already-in-use': 409,
  'auth/expired-token': 401,
  'auth/invalid-email': 400,
  'auth/invalid-token': 401,
  'auth/missing-display-name': 400,
  'auth/missing-token': 401,
  'auth/user-not-found': 401,
  'auth/weak-password': 400,
  'auth/wrong-password': 401,
};

export function createAuthService({ store, sessionSecret, now = () => Date.now() }) {
  if (!sessionSecret || sessionSecret.length < 8) {
    throw new Error('A session secret of at least 8 characters is required.');
  }

  async function registerEmail(email, password, displayName) {
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) throw authError('auth/invalid-email', 'Invalid email address.');
    if (!isValidAuthPassword(password)) throw authError('auth/weak-password', 'Password must be 6-128 characters.');

    const existing = await findAccountByEmail(normalizedEmail);
    if (existing) throw authError('auth/email-already-in-use', 'Email is already registered.');

    const uid = crypto.randomUUID();
    const passwordRecord = await hashPassword(password);
    const createdAt = now();
    await store.set('auth_accounts', uid, {
      uid,
      email: normalizedEmail,
      ...passwordRecord,
      createdAt,
    });

    const user = await upsertUser(uid, {
      uid,
      email: normalizedEmail,
      displayName: normalizeUserDisplayName(displayName, normalizedEmail.split('@')[0]),
      isAnonymous: false,
      createdAt,
      lastSeen: createdAt,
    });

    return sessionFor(user);
  }

  async function loginEmail(email, password) {
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) throw authError('auth/invalid-email', 'Invalid email address.');
    if (!isValidAuthPassword(password)) throw authError('auth/weak-password', 'Password must be 6-128 characters.');
    const account = await findAccountByEmail(normalizedEmail);
    if (!account) throw authError('auth/user-not-found', 'User not found.');

    const valid = await verifyPassword(password, account);
    if (!valid) throw authError('auth/wrong-password', 'Wrong password.');

    const user = await touchUser(account.uid);
    return sessionFor(user);
  }

  async function createGuest(displayName) {
    const cleanName = normalizeUserDisplayName(displayName);
    if (!cleanName) throw authError('auth/missing-display-name', 'Guest display name is required.');

    const uid = crypto.randomUUID();
    const createdAt = now();
    const user = await upsertUser(uid, {
      uid,
      email: null,
      displayName: cleanName,
      isAnonymous: true,
      createdAt,
      lastSeen: createdAt,
    });

    return sessionFor(user);
  }

  async function updateProfile(uid, profile) {
    const user = await store.get('users', uid);
    if (!user) throw authError('auth/user-not-found', 'User not found.');
    const updates = {
      lastSeen: now(),
    };
    if (profile.displayName !== undefined) updates.displayName = normalizeUserDisplayName(profile.displayName, user.displayName);
    if (profile.email !== undefined && !user.isAnonymous) {
      const normalizedEmail = normalizeEmail(profile.email);
      if (!isValidEmail(normalizedEmail)) throw authError('auth/invalid-email', 'Invalid email address.');
      updates.email = normalizedEmail;
    }
    return publicUser(await store.set('users', uid, updates, { merge: true }));
  }

  async function verifyToken(token) {
    if (!token) throw authError('auth/missing-token', 'Missing token.');
    const [body, signature] = String(token).split('.');
    if (!body || !signature) throw authError('auth/invalid-token', 'Invalid token.');

    const expected = sign(body);
    if (!safeEqual(signature, expected)) throw authError('auth/invalid-token', 'Invalid token.');

    let payload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      throw authError('auth/invalid-token', 'Invalid token.');
    }

    if (!payload.uid || !payload.exp || payload.exp < now()) {
      throw authError('auth/expired-token', 'Expired token.');
    }

    const user = await touchUser(payload.uid);
    if (!user) throw authError('auth/user-not-found', 'User not found.');
    return publicUser(user);
  }

  async function findAccountByEmail(email) {
    const matches = await store.list('auth_accounts', {
      filters: [{ field: 'email', op: '==', value: normalizeEmail(email) }],
      limit: 1,
    });
    return matches[0] || null;
  }

  async function touchUser(uid) {
    const user = await store.get('users', uid);
    if (!user) return null;
    return store.set('users', uid, { lastSeen: now() }, { merge: true });
  }

  async function upsertUser(uid, data) {
    return store.set('users', uid, data, { merge: true });
  }

  function sessionFor(user) {
    return {
      user: publicUser(user),
      token: createToken(user.uid),
    };
  }

  function createToken(uid) {
    const body = Buffer.from(JSON.stringify({ uid, exp: now() + TOKEN_TTL_MS })).toString('base64url');
    return `${body}.${sign(body)}`;
  }

  function sign(body) {
    return crypto.createHmac('sha256', sessionSecret).update(body).digest('base64url');
  }

  return {
    createGuest,
    loginEmail,
    registerEmail,
    updateProfile,
    verifyToken,
  };
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = await scrypt(password, salt, 64);
  return {
    passwordSalt: salt,
    passwordHash: Buffer.from(hash).toString('base64url'),
  };
}

async function verifyPassword(password, account) {
  if (!account?.passwordHash || !account?.passwordSalt) return false;
  const actual = Buffer.from(account.passwordHash, 'base64url');
  const hash = await scrypt(password || '', account.passwordSalt, actual.length);
  return crypto.timingSafeEqual(actual, hash);
}

function publicUser(user) {
  const displayName = normalizeUserDisplayName(user.displayName, user.email?.split('@')[0]);
  return {
    uid: user.uid,
    email: user.email ?? null,
    displayName: displayName || null,
    isAnonymous: Boolean(user.isAnonymous),
    metadata: {
      creationTime: new Date(user.createdAt || Date.now()).toISOString(),
    },
  };
}

function normalizeEmail(email) {
  return normalizeAuthEmail(email);
}

function isValidEmail(email) {
  return isValidAuthEmail(email);
}

function authError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.status = AUTH_ERROR_STATUS[code] || 400;
  return error;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
