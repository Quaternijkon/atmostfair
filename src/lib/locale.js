export function getAppLocale(t) {
  return typeof t === 'function' && t('switchLang') === 'English' ? 'zh-CN' : 'en-US';
}

export function formatDate(value, t, options) {
  if (!value) return '';
  return new Date(value).toLocaleDateString(getAppLocale(t), options);
}

export function formatDateTime(value, t, options) {
  if (!value) return '';
  return new Date(value).toLocaleString(getAppLocale(t), options);
}

export function formatTime(value, t, options) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString(getAppLocale(t), options);
}
