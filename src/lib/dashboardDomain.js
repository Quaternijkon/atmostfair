export const DASHBOARD_STATUS_FILTERS = [
  { id: 'all', labelKey: 'filterAll' },
  { id: 'active', labelKey: 'filterActive' },
  { id: 'paused', labelKey: 'filterPaused' },
  { id: 'finished', labelKey: 'filterFinished' },
  { id: 'archived', labelKey: 'filterArchived' },
];

export const DASHBOARD_SORT_OPTIONS = [
  { id: 'recent', labelKey: 'sortRecent' },
  { id: 'title', labelKey: 'sortTitle' },
  { id: 'status', labelKey: 'sortStatus' },
];

export const DASHBOARD_PROJECT_TEMPLATES = [
  {
    id: 'team-lunch-vote',
    tabId: 'collect',
    projectType: 'vote',
    titleKey: 'templateTeamLunchVoteTitle',
    descKey: 'templateTeamLunchVoteDesc',
  },
  {
    id: 'feedback-pulse',
    tabId: 'collect',
    projectType: 'gather',
    titleKey: 'templateFeedbackPulseTitle',
    descKey: 'templateFeedbackPulseDesc',
  },
  {
    id: 'meeting-time-finder',
    tabId: 'collect',
    projectType: 'schedule',
    titleKey: 'templateMeetingTimeTitle',
    descKey: 'templateMeetingTimeDesc',
  },
  {
    id: 'office-hours-booking',
    tabId: 'collect',
    projectType: 'book',
    titleKey: 'templateOfficeHoursTitle',
    descKey: 'templateOfficeHoursDesc',
  },
  {
    id: 'hackathon-teams',
    tabId: 'connect',
    projectType: 'team',
    titleKey: 'templateHackathonTeamsTitle',
    descKey: 'templateHackathonTeamsDesc',
  },
  {
    id: 'task-claim-board',
    tabId: 'connect',
    projectType: 'claim',
    titleKey: 'templateTaskClaimTitle',
    descKey: 'templateTaskClaimDesc',
  },
  {
    id: 'giveaway-draw',
    tabId: 'select',
    projectType: 'roulette',
    titleKey: 'templateGiveawayDrawTitle',
    descKey: 'templateGiveawayDrawDesc',
  },
  {
    id: 'fair-queue',
    tabId: 'select',
    projectType: 'queue',
    titleKey: 'templateFairQueueTitle',
    descKey: 'templateFairQueueDesc',
  },
  {
    id: 'game-night',
    tabId: 'project',
    projectType: 'game_hub',
    titleKey: 'templateGameNightTitle',
    descKey: 'templateGameNightDesc',
  },
];

const PROJECT_ROUTE_PREFIXES = {
  vote: 'collect',
  gather: 'collect',
  schedule: 'collect',
  book: 'collect',
  team: 'connect',
  claim: 'connect',
  roulette: 'select',
  queue: 'select',
  game_hub: 'games',
  project: 'projects',
};

const DEFAULT_RECENT_PROJECT_IDS_LIMIT = 100;
const DEFAULT_RECENT_DASHBOARD_LIMIT = 4;

export function getProjectRoutePrefix(projectType) {
  return PROJECT_ROUTE_PREFIXES[projectType] || 'projects';
}

export function getDashboardProjectTemplates(tabId) {
  return DASHBOARD_PROJECT_TEMPLATES.filter((template) => template.tabId === tabId);
}

export function createProjectShareUrl(href, project) {
  const source = String(href || '').trim();
  const cleanProjectId = typeof project?.id === 'string' ? project.id.trim() : '';
  if (!source || !cleanProjectId) return '';

  const isAbsoluteUrl = /^[a-z][a-z\d+.-]*:/i.test(source);
  try {
    const url = new URL(source, isAbsoluteUrl ? undefined : 'https://atmostfair.local');
    url.pathname = `/${getProjectRoutePrefix(project?.type)}/${encodeURIComponent(cleanProjectId)}`;
    url.search = '';
    url.hash = '';
    return isAbsoluteUrl ? url.toString() : url.pathname;
  } catch {
    return '';
  }
}

export function filterAndSortDashboardProjects(projects, options = {}) {
  const {
    categoryTypes = [],
    searchTerm = '',
    statusFilter = 'all',
    sortKey = 'recent',
    pinnedProjectIds = [],
  } = options;
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const categorySet = new Set(categoryTypes);
  const pinnedSet = new Set(normalizePinnedProjectIds(pinnedProjectIds));

  return normalizedProjects(projects)
    .filter((project) => categorySet.size === 0 || categorySet.has(project.type))
    .filter((project) => matchesArchiveFilter(project, statusFilter))
    .filter((project) => matchesStatusFilter(project, statusFilter))
    .filter((project) => matchesSearch(project, normalizedSearch))
    .sort((a, b) => comparePinned(a, b, pinnedSet) || compareProjects(a, b, sortKey));
}

export function hasActiveDashboardFilters({ searchTerm = '', statusFilter = 'all', sortKey = 'recent' } = {}) {
  return Boolean(String(searchTerm || '').trim() || statusFilter !== 'all' || sortKey !== 'recent');
}

export function createProjectArchivePatch(project, archived, archivedAt) {
  if (!project?.id) return null;
  return {
    archived: Boolean(archived),
    archivedAt: archived ? archivedAt : null,
  };
}

function normalizedProjects(projects) {
  return Array.isArray(projects) ? [...projects] : [];
}

export function normalizePinnedProjectIds(projectIds) {
  return normalizeProjectIdList(projectIds);
}

export function normalizeRecentProjectIds(projectIds, limit = DEFAULT_RECENT_PROJECT_IDS_LIMIT) {
  return normalizeProjectIdList(projectIds).slice(0, normalizeLimit(limit, DEFAULT_RECENT_PROJECT_IDS_LIMIT));
}

export function createRecentProjectIdsPatch(projectId, currentRecentProjectIds, limit = DEFAULT_RECENT_PROJECT_IDS_LIMIT) {
  const cleanProjectId = typeof projectId === 'string' ? projectId.trim() : '';
  if (!cleanProjectId) return null;
  const maxItems = normalizeLimit(limit, DEFAULT_RECENT_PROJECT_IDS_LIMIT);
  const recentProjectIds = [
    cleanProjectId,
    ...normalizeRecentProjectIds(currentRecentProjectIds, maxItems).filter((entry) => entry !== cleanProjectId),
  ].slice(0, maxItems);
  return { recentProjectIds };
}

export function createRecentDashboardProjects(projects, recentProjectIds, limit = DEFAULT_RECENT_DASHBOARD_LIMIT) {
  const maxItems = normalizeLimit(limit, DEFAULT_RECENT_DASHBOARD_LIMIT);
  const projectsById = new Map(
    normalizedProjects(projects)
      .filter((project) => typeof project?.id === 'string' && project.id.trim())
      .map((project) => [project.id, project]),
  );
  const recentProjects = [];
  for (const projectId of normalizeRecentProjectIds(recentProjectIds)) {
    const project = projectsById.get(projectId);
    if (!project) continue;
    recentProjects.push(project);
    if (recentProjects.length >= maxItems) break;
  }
  return recentProjects;
}

function normalizeProjectIdList(projectIds) {
  if (!Array.isArray(projectIds)) return [];
  const seen = new Set();
  const normalized = [];
  for (const projectId of projectIds) {
    if (typeof projectId !== 'string') continue;
    const cleanProjectId = projectId.trim();
    if (!cleanProjectId || seen.has(cleanProjectId)) continue;
    seen.add(cleanProjectId);
    normalized.push(cleanProjectId);
  }
  return normalized;
}

function normalizeLimit(limit, fallback) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function matchesArchiveFilter(project, statusFilter) {
  const archived = Boolean(project.archived);
  return statusFilter === 'archived' ? archived : !archived;
}

function matchesStatusFilter(project, statusFilter) {
  if (statusFilter === 'all' || statusFilter === 'archived') return true;
  return projectStatus(project) === statusFilter;
}

function matchesSearch(project, normalizedSearch) {
  if (!normalizedSearch) return true;
  return [project.title, project.id, project.creatorName]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedSearch));
}

function compareProjects(a, b, sortKey) {
  if (sortKey === 'title') return compareStrings(a.title, b.title) || compareRecent(a, b);
  if (sortKey === 'status') return compareStatus(a, b) || compareRecent(a, b);
  return compareRecent(a, b);
}

function comparePinned(a, b, pinnedSet) {
  const aPinned = pinnedSet.has(a.id);
  const bPinned = pinnedSet.has(b.id);
  if (aPinned === bPinned) return 0;
  return aPinned ? -1 : 1;
}

function compareRecent(a, b) {
  return projectTimestamp(b) - projectTimestamp(a);
}

function compareStatus(a, b) {
  const order = ['active', 'paused', 'finished', 'archived'];
  return order.indexOf(projectStatus(a)) - order.indexOf(projectStatus(b));
}

function compareStrings(a, b) {
  return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' });
}

function projectStatus(project) {
  if (project.archived) return 'archived';
  if (project.status === 'stopped') return 'paused';
  if (project.status === 'finished') return 'finished';
  return 'active';
}

function projectTimestamp(project) {
  return Number(project.archivedAt || project.createdAt || 0);
}
