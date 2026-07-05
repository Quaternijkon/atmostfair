export const USER_DISPLAY_NAME_MAX_LENGTH = 60;

export function normalizeUserDisplayName(value, fallback = '') {
  const explicit = String(value || '').trim();
  const fallbackName = String(fallback || '').trim();
  return String(explicit || fallbackName).slice(0, USER_DISPLAY_NAME_MAX_LENGTH);
}
