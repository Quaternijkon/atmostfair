export const AUTH_EMAIL_MAX_LENGTH = 254;
export const AUTH_PASSWORD_MIN_LENGTH = 6;
export const AUTH_PASSWORD_MAX_LENGTH = 128;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeAuthEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isValidAuthEmail(value) {
  const email = normalizeAuthEmail(value);
  return email.length > 0 && email.length <= AUTH_EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(email);
}

export function isValidAuthPassword(value) {
  return typeof value === 'string'
    && value.length >= AUTH_PASSWORD_MIN_LENGTH
    && value.length <= AUTH_PASSWORD_MAX_LENGTH;
}
