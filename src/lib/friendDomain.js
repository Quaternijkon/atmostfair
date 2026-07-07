import { normalizeMessageText } from './messageDomain.js';

export function createFriendRequestData(existingRelationships, user, targetUser, createdAt) {
  const userUid = normalizeFriendMemberId(user?.uid);
  const targetUid = normalizeFriendMemberId(targetUser?.uid);
  if (!userUid || !targetUid || userUid === targetUid) return null;
  const relationships = Array.isArray(existingRelationships) ? existingRelationships : [];
  const hasExistingRelationship = relationships.some((relationship) => {
    const members = normalizeFriendMemberIds(relationship?.members);
    if (!members.includes(userUid) || !members.includes(targetUid)) return false;
    return ['pending', 'confirmed'].includes(relationship.status);
  });
  if (hasExistingRelationship) return null;

  return {
    members: [userUid, targetUid],
    names: {
      [userUid]: cleanUserName(user),
      [targetUid]: cleanUserName(targetUser),
    },
    status: 'pending',
    initiator: userUid,
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

export function getRemovableFriendshipId(relationship, user) {
  if (!relationship?.id || relationship.status !== 'confirmed') return null;
  if (!hasFriendMember(relationship, user?.uid)) return null;
  return relationship.id;
}

export function createFriendMessageData(existingRelationships, activeChatFriend, user, text, createdAt) {
  const senderId = normalizeFriendMemberId(user?.uid);
  const chatId = activeChatFriend?.id;
  const cleanText = normalizeMessageText(text);
  if (!senderId || !chatId || !cleanText) return null;

  const relationships = Array.isArray(existingRelationships) ? existingRelationships : [];
  const relationship = relationships.find((entry) => entry?.id === chatId);
  if (relationship?.status !== 'confirmed' || !hasFriendMember(relationship, senderId)) return null;

  return {
    chatId,
    text: cleanText,
    senderId,
    createdAt,
  };
}

export function normalizeFriendMemberId(value) {
  return String(value ?? '').trim();
}

export function normalizeFriendMemberIds(members) {
  if (!Array.isArray(members)) return [];
  const seen = new Set();
  return members.reduce((normalized, value) => {
    const memberId = normalizeFriendMemberId(value);
    if (!memberId || seen.has(memberId)) return normalized;
    seen.add(memberId);
    normalized.push(memberId);
    return normalized;
  }, []);
}

export function hasFriendMember(relationship, uid) {
  const memberId = normalizeFriendMemberId(uid);
  return Boolean(memberId && normalizeFriendMemberIds(relationship?.members).includes(memberId));
}

export function getOtherFriendMemberId(relationship, user) {
  const memberId = normalizeFriendMemberId(user?.uid);
  if (!memberId) return '';
  return normalizeFriendMemberIds(relationship?.members).find((id) => id !== memberId) || '';
}

function cleanUserName(user) {
  const explicitName = String(user?.displayName || '').trim();
  if (explicitName) return explicitName;
  return user?.email?.split('@')[0] || '';
}

function isIncomingPendingRequest(relationship, userId) {
  const memberId = normalizeFriendMemberId(userId);
  if (!memberId || relationship?.status !== 'pending' || normalizeFriendMemberId(relationship?.initiator) === memberId) return false;
  return hasFriendMember(relationship, memberId);
}
