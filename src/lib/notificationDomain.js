export function createMarkNotificationReadOperation(notifications, notificationId) {
  const notification = normalizedNotifications(notifications).find((entry) => entry.id === notificationId);
  if (!notification || isNotificationRead(notification)) return null;
  return {
    type: 'update',
    collection: 'notifications',
    id: notification.id,
    data: { read: true },
  };
}

export function createMarkNotificationsReadOperations(notifications) {
  return normalizedNotifications(notifications)
    .filter((notification) => isNotificationUnread(notification))
    .map((notification) => ({
      type: 'update',
      collection: 'notifications',
      id: notification.id,
      data: { read: true },
    }));
}

export function createMarkFriendChatNotificationsReadOperations(notifications, chatId) {
  const normalizedChatId = normalizeNotificationChatId(chatId);
  if (!normalizedChatId) return [];

  return normalizedNotifications(notifications)
    .filter((notification) => (
      notification.type === 'friend_message'
      && normalizeNotificationChatId(notification.chatId) === normalizedChatId
      && isNotificationUnread(notification)
    ))
    .map((notification) => ({
      type: 'update',
      collection: 'notifications',
      id: notification.id,
      data: { read: true },
    }));
}

export function createClearReadNotificationOperations(notifications) {
  return normalizedNotifications(notifications)
    .filter((notification) => isNotificationRead(notification))
    .map((notification) => ({
      type: 'delete',
      collection: 'notifications',
      id: notification.id,
    }));
}

export function normalizeNotificationRecipientId(recipientId) {
  return typeof recipientId === 'string' ? recipientId.trim() : '';
}

export function isNotificationForRecipient(notification, recipientId) {
  const normalizedRecipientId = normalizeNotificationRecipientId(recipientId);
  return Boolean(normalizedRecipientId)
    && normalizeNotificationRecipientId(notification?.recipientId) === normalizedRecipientId;
}

export function isNotificationRead(notification) {
  return notification?.read === true;
}

export function isNotificationUnread(notification) {
  return !isNotificationRead(notification);
}

function normalizedNotifications(notifications) {
  return (Array.isArray(notifications) ? notifications : []).filter((notification) => notification?.id);
}

function normalizeNotificationChatId(chatId) {
  return typeof chatId === 'string' ? chatId.trim() : '';
}
