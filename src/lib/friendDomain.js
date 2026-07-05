export function createFriendRequestData(existingRelationships, user, targetUser, createdAt) {
  if (!user?.uid || !targetUser?.uid || user.uid === targetUser.uid) return null;
  const relationships = Array.isArray(existingRelationships) ? existingRelationships : [];
  const hasExistingRelationship = relationships.some((relationship) => {
    const members = Array.isArray(relationship?.members) ? relationship.members : [];
    if (!members.includes(user.uid) || !members.includes(targetUser.uid)) return false;
    return ['pending', 'confirmed'].includes(relationship.status);
  });
  if (hasExistingRelationship) return null;

  return {
    members: [user.uid, targetUser.uid],
    names: {
      [user.uid]: cleanUserName(user),
      [targetUser.uid]: cleanUserName(targetUser),
    },
    status: 'pending',
    initiator: user.uid,
    createdAt,
  };
}

export function createFriendAcceptPatch(relationship, user) {
  if (!isIncomingPendingRequest(relationship, user?.uid)) return null;
  return { status: 'confirmed' };
}

export function getRejectableFriendRequestId(relationship, user) {
  if (!relationship?.id || !isIncomingPendingRequest(relationship, user?.uid)) return null;
  return relationship.id;
}

export function createFriendMessageData(existingRelationships, activeChatFriend, user, text, createdAt) {
  const senderId = user?.uid;
  const chatId = activeChatFriend?.id;
  const cleanText = String(text || '').trim();
  if (!senderId || !chatId || !cleanText) return null;

  const relationships = Array.isArray(existingRelationships) ? existingRelationships : [];
  const relationship = relationships.find((entry) => entry?.id === chatId);
  const members = getMembers(relationship);
  if (relationship?.status !== 'confirmed' || !members.includes(senderId)) return null;

  return {
    chatId,
    text: cleanText,
    senderId,
    createdAt,
  };
}

function cleanUserName(user) {
  const explicitName = String(user?.displayName || '').trim();
  if (explicitName) return explicitName;
  return user?.email?.split('@')[0] || '';
}

function isIncomingPendingRequest(relationship, userId) {
  if (!userId || relationship?.status !== 'pending' || relationship?.initiator === userId) return false;
  return getMembers(relationship).includes(userId);
}

function getMembers(relationship) {
  return Array.isArray(relationship?.members) ? relationship.members : [];
}
