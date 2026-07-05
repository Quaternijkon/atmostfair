export const PROJECT_ACTIVITY_TYPES = {
  projectCreated: 'project_created',
  projectDuplicated: 'project_duplicated',
  projectArchived: 'project_archived',
  projectRestored: 'project_restored',
  projectPaused: 'project_paused',
  projectResumed: 'project_resumed',
  voteItemAdded: 'vote_item_added',
  voteToggled: 'vote_toggled',
  teamCreated: 'team_created',
  teamJoined: 'team_joined',
  teamMemberRemoved: 'team_member_removed',
  queueJoined: 'queue_joined',
  queueGenerated: 'queue_generated',
  rouletteJoined: 'roulette_joined',
  rouletteDrawn: 'roulette_drawn',
  winnerRecorded: 'winner_recorded',
  gatherFieldCreated: 'gather_field_created',
  gatherSubmitted: 'gather_submitted',
  scheduleSubmitted: 'schedule_submitted',
  bookingSlotCreated: 'booking_slot_created',
  bookingBooked: 'booking_booked',
  bookingCancelled: 'booking_cancelled',
  claimCreated: 'claim_created',
  claimTaken: 'claim_taken',
  claimDropped: 'claim_dropped',
};

const ACTIVITY_MESSAGE_KEYS = {
  [PROJECT_ACTIVITY_TYPES.projectCreated]: 'activityProjectCreated',
  [PROJECT_ACTIVITY_TYPES.projectDuplicated]: 'activityProjectDuplicated',
  [PROJECT_ACTIVITY_TYPES.projectArchived]: 'activityProjectArchived',
  [PROJECT_ACTIVITY_TYPES.projectRestored]: 'activityProjectRestored',
  [PROJECT_ACTIVITY_TYPES.projectPaused]: 'activityProjectPaused',
  [PROJECT_ACTIVITY_TYPES.projectResumed]: 'activityProjectResumed',
  [PROJECT_ACTIVITY_TYPES.voteItemAdded]: 'activityVoteItemAdded',
  [PROJECT_ACTIVITY_TYPES.voteToggled]: 'activityVoteToggled',
  [PROJECT_ACTIVITY_TYPES.teamCreated]: 'activityTeamCreated',
  [PROJECT_ACTIVITY_TYPES.teamJoined]: 'activityTeamJoined',
  [PROJECT_ACTIVITY_TYPES.teamMemberRemoved]: 'activityTeamMemberRemoved',
  [PROJECT_ACTIVITY_TYPES.queueJoined]: 'activityQueueJoined',
  [PROJECT_ACTIVITY_TYPES.queueGenerated]: 'activityQueueGenerated',
  [PROJECT_ACTIVITY_TYPES.rouletteJoined]: 'activityRouletteJoined',
  [PROJECT_ACTIVITY_TYPES.rouletteDrawn]: 'activityRouletteDrawn',
  [PROJECT_ACTIVITY_TYPES.winnerRecorded]: 'activityWinnerRecorded',
  [PROJECT_ACTIVITY_TYPES.gatherFieldCreated]: 'activityGatherFieldCreated',
  [PROJECT_ACTIVITY_TYPES.gatherSubmitted]: 'activityGatherSubmitted',
  [PROJECT_ACTIVITY_TYPES.scheduleSubmitted]: 'activityScheduleSubmitted',
  [PROJECT_ACTIVITY_TYPES.bookingSlotCreated]: 'activityBookingSlotCreated',
  [PROJECT_ACTIVITY_TYPES.bookingBooked]: 'activityBookingBooked',
  [PROJECT_ACTIVITY_TYPES.bookingCancelled]: 'activityBookingCancelled',
  [PROJECT_ACTIVITY_TYPES.claimCreated]: 'activityClaimCreated',
  [PROJECT_ACTIVITY_TYPES.claimTaken]: 'activityClaimTaken',
  [PROJECT_ACTIVITY_TYPES.claimDropped]: 'activityClaimDropped',
};

export function createProjectActivityData({
  projectId,
  type,
  actor,
  actorName,
  subject = '',
  createdAt,
  metadata = {},
} = {}) {
  if (!projectId || !type || !actor?.uid || !createdAt) return null;

  return {
    projectId,
    type,
    actorId: actor.uid,
    actorName: cleanActivityText(actorName) || cleanActivityText(actor.displayName) || actor.email?.split('@')[0] || '',
    subject: cleanActivityText(subject),
    createdAt,
    metadata: clonePlainValue(metadata),
  };
}

export function getActivityMessageKey(type) {
  return ACTIVITY_MESSAGE_KEYS[type] || 'activityUpdated';
}

function cleanActivityText(value) {
  return String(value || '').trim();
}

function clonePlainValue(value) {
  return JSON.parse(JSON.stringify(value || {}));
}
