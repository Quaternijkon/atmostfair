const PARTICIPANT_EXPORT_TYPES = new Set(['queue', 'book', 'schedule', 'gather', 'claim']);

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
  }[project.type];

  const result = exporter(datasets, t);
  if (!result?.rows?.length) return null;

  return {
    filename: `${sanitizeFilename(project.title || t('exportFile'))}_${result.suffix}.csv`,
    csv: serializeCsv([result.headers, ...result.rows]),
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
      t('exportBookingStatus'),
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
  return {
    suffix: 'gather_participants',
    headers: [t('nameLabel'), t('submittedAtCsv'), ...gatherFields.map((field) => field.label)],
    rows: gatherSubmissions.map((submission) => [
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
