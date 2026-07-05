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

export function getProjectRoutePrefix(projectType) {
  return PROJECT_ROUTE_PREFIXES[projectType] || 'projects';
}

export function filterAndSortDashboardProjects(projects, options = {}) {
  const {
    categoryTypes = [],
    searchTerm = '',
    statusFilter = 'all',
    sortKey = 'recent',
  } = options;
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const categorySet = new Set(categoryTypes);

  return normalizedProjects(projects)
    .filter((project) => categorySet.size === 0 || categorySet.has(project.type))
    .filter((project) => matchesArchiveFilter(project, statusFilter))
    .filter((project) => matchesStatusFilter(project, statusFilter))
    .filter((project) => matchesSearch(project, normalizedSearch))
    .sort((a, b) => compareProjects(a, b, sortKey));
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
