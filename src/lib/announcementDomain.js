export const ANNOUNCEMENT_TITLE_MAX_LENGTH = 120;
export const ANNOUNCEMENT_CONTENT_MAX_LENGTH = 2000;
export const ANNOUNCEMENT_TYPES = ['info', 'warning'];

const ANNOUNCEMENT_TYPE_VALUES = new Set(ANNOUNCEMENT_TYPES);

export function normalizeAnnouncementCreateData(data, now = Date.now()) {
  const title = normalizeAnnouncementText(data?.title, ANNOUNCEMENT_TITLE_MAX_LENGTH);
  const content = normalizeAnnouncementText(data?.content, ANNOUNCEMENT_CONTENT_MAX_LENGTH);
  if (!title || !content) return null;

  const type = normalizeAnnouncementType(data?.type);
  if (!type) return null;

  const active = normalizeAnnouncementActive(data?.active, true);
  if (active === null) return null;

  const startsAt = normalizeAnnouncementTimestamp(data?.startsAt);
  const endsAt = normalizeAnnouncementTimestamp(data?.endsAt);
  const createdAt = normalizeAnnouncementTimestamp(data?.createdAt);
  if (!startsAt.ok || !endsAt.ok || !createdAt.ok) return null;
  if (!isValidAnnouncementWindow(startsAt.value, endsAt.value)) return null;

  return {
    title,
    content,
    type,
    active,
    startsAt: startsAt.value,
    endsAt: endsAt.value,
    createdAt: createdAt.value ?? now,
  };
}

export function normalizeAnnouncementUpdateData(data, existing = {}) {
  const patch = {};

  if (Object.hasOwn(data || {}, 'title')) {
    const title = normalizeAnnouncementText(data.title, ANNOUNCEMENT_TITLE_MAX_LENGTH);
    if (!title) return null;
    patch.title = title;
  }

  if (Object.hasOwn(data || {}, 'content')) {
    const content = normalizeAnnouncementText(data.content, ANNOUNCEMENT_CONTENT_MAX_LENGTH);
    if (!content) return null;
    patch.content = content;
  }

  if (Object.hasOwn(data || {}, 'type')) {
    const type = normalizeAnnouncementType(data.type);
    if (!type) return null;
    patch.type = type;
  }

  if (Object.hasOwn(data || {}, 'active')) {
    const active = normalizeAnnouncementActive(data.active);
    if (active === null) return null;
    patch.active = active;
  }

  for (const field of ['startsAt', 'endsAt', 'createdAt']) {
    if (!Object.hasOwn(data || {}, field)) continue;
    const timestamp = normalizeAnnouncementTimestamp(data[field]);
    if (!timestamp.ok) return null;
    patch[field] = timestamp.value;
  }

  const startsAt = Object.hasOwn(patch, 'startsAt') ? patch.startsAt : existing.startsAt ?? null;
  const endsAt = Object.hasOwn(patch, 'endsAt') ? patch.endsAt : existing.endsAt ?? null;
  if (!isValidAnnouncementWindow(startsAt, endsAt)) return null;

  return patch;
}

export function isAnnouncementVisible(announcement, now = Date.now()) {
  if (!announcement?.active) return false;
  const startsAt = Number.isFinite(announcement.startsAt) ? announcement.startsAt : null;
  const endsAt = Number.isFinite(announcement.endsAt) ? announcement.endsAt : null;
  if (startsAt !== null && now < startsAt) return false;
  if (endsAt !== null && now > endsAt) return false;
  return true;
}

function normalizeAnnouncementText(value, maxLength) {
  const text = String(value ?? '').trim();
  if (!text || text.length > maxLength) return null;
  return text;
}

function normalizeAnnouncementType(value) {
  const type = String(value || 'info').trim();
  return ANNOUNCEMENT_TYPE_VALUES.has(type) ? type : null;
}

function normalizeAnnouncementActive(value, fallback) {
  if (value === undefined) return fallback ?? null;
  return typeof value === 'boolean' ? value : null;
}

function normalizeAnnouncementTimestamp(value) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp < 0) return { ok: false, value: null };
  return { ok: true, value: timestamp };
}

function isValidAnnouncementWindow(startsAt, endsAt) {
  return endsAt === null || startsAt === null || endsAt >= startsAt;
}
