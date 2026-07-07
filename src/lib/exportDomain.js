import {
  createGameRoomSummary,
  normalizeGatherSubmissionData,
  normalizeMineProgressInput,
  normalizeRpsScoreInput,
} from './projectDomain.js';
import { getActivityMessageKey } from './activityDomain.js';

const PARTICIPANT_EXPORT_TYPES = new Set(['queue', 'book', 'schedule', 'gather', 'claim', 'game_hub']);

export function supportsParticipantExport(projectType) {
  return PARTICIPANT_EXPORT_TYPES.has(projectType);
}

export function formatCsvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text) || /^\s|\s$/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function createProjectParticipantExport(project, datasets = {}, t = (key) => key) {
  if (!supportsParticipantExport(project?.type)) return null;

  const exporter = {
    queue: createQueueExport,
    book: createBookingExport,
    schedule: createScheduleExport,
    gather: createGatherExport,
    claim: createClaimExport,
    game_hub: createGameExport,
  }[project.type];

  const result = exporter(datasets, t);
  if (!result?.rows?.length) return null;

  return {
    filename: `${sanitizeFilename(project.title || t('exportFile'))}_${result.suffix}.csv`,
    csv: serializeCsv([result.headers, ...result.rows]),
  };
}

export function createProjectActivityExport(project, activities = [], t = (key) => key) {
  const rows = (Array.isArray(activities) ? [...activities] : [])
    .filter((activity) => activity?.projectId === project?.id || !activity?.projectId)
    .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))
    .map((activity) => {
      const actor = activity.actorName || t('unknownUser');
      const subject = activity.subject || t('project');
      const message = t(getActivityMessageKey(activity.type), { actor, subject });
      return [
        formatExportDate(activity.createdAt),
        actor,
        activity.type || '',
        activity.subject || '',
        message,
        formatActivityMetadata(activity.metadata),
      ];
    });

  if (!rows.length) return null;

  return {
    filename: `${sanitizeFilename(project?.title || t('exportFile'))}_activity.csv`,
    csv: serializeCsv([
      [
        t('exportActivityTime'),
        t('exportActivityActor'),
        t('exportActivityType'),
        t('exportActivitySubject'),
        t('exportActivityMessage'),
        t('exportActivityMetadata'),
      ],
      ...rows,
    ]),
  };
}

export function createDashboardProjectExport(projects = [], options = {}, t = (key) => key) {
  const rows = (Array.isArray(projects) ? projects : [])
    .filter((project) => project?.id)
    .map((project) => [
      project.id,
      project.title || '',
      formatProjectType(project.type, t),
      formatProjectStatus(project, t),
      project.creatorName || '',
      project.archived ? t('archived') : '',
      formatExportDate(project.createdAt),
    ]);

  if (!rows.length) return null;

  return {
    filename: `${sanitizeFilename(options.filenamePrefix || t('exportFile'))}_projects.csv`,
    csv: serializeCsv([
      [
        t('exportProjectId'),
        t('exportProjectTitle'),
        t('exportProjectType'),
        t('exportProjectStatus'),
        t('exportProjectCreator'),
        t('exportProjectArchived'),
        t('exportProjectCreatedAt'),
      ],
      ...rows,
    ]),
  };
}

function createQueueExport({ queueParticipants = [] }, t) {
  const rows = [...queueParticipants]
    .sort((a, b) => (a.queueOrder ?? Number.MAX_SAFE_INTEGER) - (b.queueOrder ?? Number.MAX_SAFE_INTEGER)
      || (a.joinedAt || 0) - (b.joinedAt || 0))
    .map((participant) => [
      participant.name,
      participant.value,
      participant.queueOrder,
      formatExportDate(participant.joinedAt),
    ]);

  return {
    suffix: 'queue_participants',
    headers: [t('nameLabel'), t('valueLabel'), t('exportQueueOrder'), t('exportJoinedAt')],
    rows,
  };
}

function createBookingExport({ bookingSlots = [] }, t) {
  const participants = [];

  for (const slot of bookingSlots) {
    if (!slot) continue;
    if (slot.bookedBy || slot.bookerName || hasKeys(slot.bookingData)) {
      participants.push({
        slot,
        status: t('booked'),
        name: slot.bookerName,
        uid: slot.bookedBy,
        bookedAt: slot.bookedAt,
        waitlistOrder: '',
        joinedAt: '',
        bookingData: slot.bookingData || {},
      });
    }

    const waitlist = Array.isArray(slot.waitlist) ? slot.waitlist : [];
    waitlist.forEach((entry, index) => {
      if (!entry || (!entry.uid && !entry.name && !hasKeys(entry.bookingData))) return;
      participants.push({
        slot,
        status: t('waitlisted'),
        name: entry.name,
        uid: entry.uid,
        bookedAt: '',
        waitlistOrder: index + 1,
        joinedAt: entry.joinedAt,
        bookingData: entry.bookingData || {},
      });
    });
  }

  const dynamicFields = collectDynamicKeys(participants.map((entry) => entry.bookingData));
  const rows = participants.map((entry) => [
    entry.slot.label,
    entry.slot.start,
    entry.slot.end,
    entry.status,
    entry.name,
    entry.uid,
    formatExportDate(entry.bookedAt),
    entry.waitlistOrder,
    formatExportDate(entry.joinedAt),
    ...dynamicFields.map((field) => entry.bookingData?.[field]),
  ]);

  return {
    suffix: 'booking_participants',
    headers: [
      t('exportSlotLabel'),
      t('startDate'),
      t('endDate'),
      t('exportStatus'),
      t('nameLabel'),
      t('exportParticipantId'),
      t('exportBookedAt'),
      t('exportWaitlistOrder'),
      t('exportJoinedAt'),
      ...dynamicFields,
    ],
    rows,
  };
}

function createScheduleExport({ scheduleSubmissions = [] }, t) {
  return {
    suffix: 'schedule_participants',
    headers: [t('nameLabel'), t('exportAvailability'), t('submittedAtCsv')],
    rows: scheduleSubmissions.map((submission) => [
      submission.name,
      formatAvailability(submission.availability),
      formatExportDate(submission.submittedAt),
    ]),
  };
}

function createGatherExport({ gatherFields = [], gatherSubmissions = [] }, t) {
  const readableSubmissions = gatherSubmissions.map((submission) => ({
    ...submission,
    data: normalizeGatherSubmissionData(submission.data, gatherFields),
  }));

  return {
    suffix: 'gather_participants',
    headers: [t('nameLabel'), t('submittedAtCsv'), ...gatherFields.map((field) => field.label)],
    rows: readableSubmissions.map((submission) => [
      submission.name,
      formatExportDate(submission.submittedAt),
      ...gatherFields.map((field) => submission.data?.[field.id]),
    ]),
  };
}

function createClaimExport({ claimItems = [] }, t) {
  return {
    suffix: 'claim_participants',
    headers: [t('taskTitle'), t('maxClaims'), t('exportClaimCount'), t('exportClaimants')],
    rows: claimItems.map((item) => {
      const claimants = item.claimants || [];
      return [
        item.title,
        item.maxClaims,
        claimants.length,
        claimants.map((claimant) => claimant.name).filter(Boolean).join('; '),
      ];
    }),
  };
}

function createGameExport({ gameRooms = [] }, t) {
  const rooms = [...gameRooms]
    .filter((room) => room?.id)
    .sort((a, b) => (b.finishedAt || b.createdAt || 0) - (a.finishedAt || a.createdAt || 0));
  const rows = rooms.map((room) => {
    const summary = createGameRoomSummary(room) || {};
    return [
      room.name,
      formatGameName(room.game, t),
      formatGameStatus(summary.status || room.status, t),
      summary.winnerName,
      summary.scoreLine,
      summary.playerCount,
      summary.roundsPlayed,
      formatExportDate(room.finishedAt),
      formatGamePlayers(room.players, room.config),
    ];
  });

  return {
    suffix: 'game_results',
    headers: [
      t('exportGameRoom'),
      t('exportGameType'),
      t('exportStatus'),
      t('exportWinner'),
      t('exportScore'),
      t('exportPlayerCount'),
      t('exportRounds'),
      t('exportFinishedAt'),
      t('exportPlayers'),
    ],
    rows,
  };
}

function serializeCsv(rows) {
  return rows.map((row) => row.map(formatCsvCell).join(',')).join('\n');
}

function formatExportDate(value) {
  if (value === null || value === undefined || value === '') return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

function formatAvailability(availability = []) {
  return availability.map((entry) => {
    if (entry && typeof entry === 'object') {
      return [entry.date, [entry.start, entry.end].filter(Boolean).join('-')]
        .filter(Boolean)
        .join(' ');
    }
    return entry;
  }).filter((entry) => entry !== null && entry !== undefined && entry !== '').join('; ');
}

function collectDynamicKeys(records) {
  const keys = [];
  const seen = new Set();
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    for (const key of Object.keys(record)) {
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

function hasKeys(value) {
  return Boolean(value && typeof value === 'object' && Object.keys(value).length);
}

function formatActivityMetadata(metadata) {
  if (!hasKeys(metadata)) return '';
  return JSON.stringify(metadata);
}

function formatGameName(game, t) {
  if (game === 'rps') return t('rockPaperScissors');
  if (game === 'mine') return t('minesweeper');
  return game || '';
}

function formatProjectType(type, t) {
  const key = {
    vote: 'voting',
    gather: 'gather',
    schedule: 'schedule',
    book: 'book',
    team: 'teams',
    claim: 'tasks',
    roulette: 'roulette',
    queue: 'queue',
    game_hub: 'gameHub',
  }[type];
  return key ? t(key) : type || '';
}

function formatProjectStatus(project, t) {
  if (project?.archived) return t('archived');
  if (project?.status === 'finished') return t('finished');
  if (project?.status === 'stopped') return t('paused');
  return t('activeStatus');
}

function formatGameStatus(status, t) {
  if (status === 'finished') return t('finished');
  if (status === 'playing') return t('playing');
  if (status === 'waiting') return t('waiting');
  return status || '';
}

function formatGamePlayers(players = [], config = {}) {
  return (Array.isArray(players) ? players : [])
    .map((player) => {
      const name = player.name || player.uid || '';
      const score = Number.parseInt(player.score, 10);
      if (Number.isInteger(score)) return `${name} (${normalizeRpsScoreInput(score, config)})`;
      const progress = Number.parseInt(player.progress, 10);
      if (Number.isInteger(progress)) return `${name} (${normalizeMineProgressInput(progress)}%)`;
      return name;
    })
    .filter(Boolean)
    .join('; ');
}

function sanitizeFilename(value) {
  const fallback = 'export';
  const sanitized = String(value || fallback)
    .trim()
    .replace(/[<>:"/\\|?*]/g, '-')
    .split('')
    .map((char) => (char.charCodeAt(0) < 32 ? '-' : char))
    .join('')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return sanitized || fallback;
}
