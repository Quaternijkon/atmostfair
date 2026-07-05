export function createMarkNotificationReadOperation(notifications, notificationId) {
  const notification = normalizedNotifications(notifications).find((entry) => entry.id === notificationId);
  if (!notification || notification.read) return null;
  return {
    type: 'update',
    collection: 'notifications',
    id: notification.id,
    data: { read: true },
  };
}

export function createMarkNotificationsReadOperations(notifications) {
  return normalizedNotifications(notifications)
    .filter((notification) => !notification.read)
    .map((notification) => ({
      type: 'update',
      collection: 'notifications',
      id: notification.id,
      data: { read: true },
    }));
}

export function createClearReadNotificationOperations(notifications) {
  return normalizedNotifications(notifications)
    .filter((notification) => notification.read)
    .map((notification) => ({
      type: 'delete',
      collection: 'notifications',
      id: notification.id,
    }));
}

function normalizedNotifications(notifications) {
  return (Array.isArray(notifications) ? notifications : []).filter((notification) => notification?.id);
}
