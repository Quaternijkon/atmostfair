export const MESSAGE_TEXT_MAX_LENGTH = 1000;

export function normalizeMessageText(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > MESSAGE_TEXT_MAX_LENGTH) return null;
  return text;
}
