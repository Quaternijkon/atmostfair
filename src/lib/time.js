const DAY_MS = 86400000;

export function nowMs() {
  return Date.now();
}

export function isoDateFromMs(value) {
  return new Date(value).toISOString().split('T')[0];
}

export function todayIsoDate() {
  return isoDateFromMs(nowMs());
}

export function addDaysIsoDate(days) {
  return isoDateFromMs(nowMs() + days * DAY_MS);
}
