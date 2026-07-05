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

function cleanUserName(user) {
  const explicitName = String(user?.displayName || '').trim();
  if (explicitName) return explicitName;
  return user?.email?.split('@')[0] || '';
}
