import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { Archive, Search, Plus, X, Lock, Vote, Users, Dices, FolderPlus, ClipboardList, CheckSquare, ListOrdered, CalendarClock, CalendarCheck, Gamepad2, Pin as PinIcon, Clock } from '../components/Icons';
import {
  DASHBOARD_SORT_OPTIONS,
  DASHBOARD_STATUS_FILTERS,
  createRecentDashboardProjects,
  filterAndSortDashboardProjects,
  getProjectRoutePrefix,
  hasActiveDashboardFilters,
  normalizePinnedProjectIds,
  normalizeRecentProjectIds,
} from '../lib/dashboardDomain';
import { hasProjectPassword, unlockProjectAccess } from '../lib/apiClient';
import { PROJECT_TITLE_MAX_LENGTH } from '../lib/projectDomain';

const TabButton = ({ id, label, icon: Icon, isActive, onClick }) => {
  return (
    <button 
        onClick={onClick} 
        className="touch-target relative z-10 flex-auto rounded-full px-3 py-2.5 text-sm font-medium outline-none transition-colors"
    >
      <span className={`relative flex items-center gap-2 transition-colors duration-200 ${isActive ? 'text-white' : 'text-m3-on-surface-variant hover:text-m3-on-surface'}`}>
        <Icon className="w-4 h-4" />
        <span className={isActive ? 'inline' : 'hidden md:inline'}>{label}</span>
      </span>
    </button>
  );
};

const DASHBOARD_TAB_IDS = ['collect', 'connect', 'select', 'project'];
const DASHBOARD_TAB_BG_COLORS = ['#4285F4', '#EA4335', '#FBBC05', '#34A853'];

export default function Dashboard({ projects, pinnedProjectIds = [], recentProjectIds = [], onToggleProjectPin = () => {}, onRecordProjectOpen = () => {}, onCreateProject, defaultName, t }) {
  const navigate = useNavigate();
  // Navigation State: 'collect' | 'connect' | 'select' | 'play'
  const [activeTab, setActiveTab] = useState('collect');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState('recent');
  
  // Creation Flow State
  const [showCreate, setShowCreate] = useState(false);
  const [selectedModule, setSelectedModule] = useState(null); // Sub-selection
  const [newTitle, setNewTitle] = useState('');
  const [creatorName, setCreatorName] = useState(defaultName);
  const [newPassword, setNewPassword] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [createError, setCreateError] = useState('');
  
  // Unlock Password State
  const [passwordPromptProject, setPasswordPromptProject] = useState(null);
  const [inputPassword, setInputPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [isUnlockingProject, setIsUnlockingProject] = useState(false);

  // Configuration Mapping
  const CATEGORIES = {
    collect: { 
      id: 'collect',
      label: t('collect'), 
      color: 'text-google-blue', 
      bg: 'bg-google-blue',
      // Legacy 'type' mapping: 'vote' projects belong to 'collect'
      types: ['vote', 'gather', 'schedule', 'book'], 
      modules: [
        { id: 'vote', label: t('voting'), icon: Vote, desc: t('votingDesc') },
        { id: 'gather', label: t('gather'), icon: ClipboardList, desc: t('gatherDesc') },
        { id: 'schedule', label: t('schedule'), icon: CalendarClock, desc: t('scheduleDesc') },
        { id: 'book', label: t('book'), icon: CalendarCheck, desc: t('bookDesc') }
      ]
    },
    connect: { 
      id: 'connect',
      label: t('connect'), 
      color: 'text-google-red', 
      bg: 'bg-google-red',
      // Legacy 'type' mapping: 'team' projects belong to 'connect'
      types: ['team', 'claim'], 
      modules: [
        { id: 'team', label: t('teams'), icon: Users, desc: t('teamsDesc') },
        { id: 'claim', label: t('tasks'), icon: CheckSquare, desc: t('tasksDesc') }
      ]
    },
    select: { 
      id: 'select',
      label: t('select'), 
      color: 'text-google-yellow', 
      bg: 'bg-google-yellow',
      // Legacy 'type' mapping: 'roulette' projects belong to 'select'
      types: ['roulette', 'queue'], 
      modules: [
        { id: 'roulette', label: t('roulette'), icon: Dices, desc: t('rouletteDesc') },
        { id: 'queue', label: t('queue'), icon: ListOrdered, desc: t('queueDesc') }
      ]
    },
    project: {
      id: 'project',
      label: t('games'),
      color: 'text-google-green',
      bg: 'bg-google-green',
      types: ['game_hub'], 
      modules: [
        { id: 'game_hub', label: t('gameHub'), icon: Gamepad2, desc: t('gameHubDesc') }
      ]
    }
  };

  const currentCategory = CATEGORIES[activeTab];
  const normalizedPinnedProjectIds = useMemo(() => normalizePinnedProjectIds(pinnedProjectIds), [pinnedProjectIds]);
  const normalizedRecentProjectIds = useMemo(() => normalizeRecentProjectIds(recentProjectIds), [recentProjectIds]);
  const recentProjects = useMemo(
    () => createRecentDashboardProjects(projects, normalizedRecentProjectIds, 4),
    [projects, normalizedRecentProjectIds],
  );

  const filteredProjects = useMemo(() => {
    return filterAndSortDashboardProjects(projects, {
      categoryTypes: currentCategory.types,
      searchTerm,
      statusFilter,
      sortKey,
      pinnedProjectIds: normalizedPinnedProjectIds,
    });
  }, [projects, searchTerm, statusFilter, sortKey, currentCategory, normalizedPinnedProjectIds]);
  const hasActiveFilters = hasActiveDashboardFilters({
    searchTerm,
    statusFilter,
    sortKey,
  });

  const canCreateProject = Boolean(selectedModule && newTitle.trim() && newTitle.length <= PROJECT_TITLE_MAX_LENGTH);
  const handleClearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setSortKey('recent');
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!canCreateProject || isCreatingProject) return;
    setIsCreatingProject(true);
    setCreateError('');
    try {
      const result = await onCreateProject(newTitle, selectedModule.id, creatorName, newPassword);
      if (result?.ok === false) {
        setCreateError(t('createProjectFailed'));
        return;
      }
      if (result?.projectId) {
        const routePrefix = getProjectRoutePrefix(selectedModule.id);
        void onRecordProjectOpen(result.projectId);
        navigate(`/${routePrefix}/${result.projectId}`);
      }
      setShowCreate(false);
      setNewTitle('');
      setNewPassword('');
      setSelectedModule(null);
    } catch {
      setCreateError(t('createProjectFailed'));
    } finally {
      setIsCreatingProject(false);
    }
  };

  const navigateToProject = (project, options) => {
       void onRecordProjectOpen(project.id);
       const routePrefix = getProjectRoutePrefix(project.type);
       navigate(`/${routePrefix}/${project.id}`, options);
  }

  const handleProjectClick = (project) => {
    if (hasProjectPassword(project) && !project.accessGranted) {
      setPasswordPromptProject(project); setInputPassword(''); setPasswordError(false); setIsUnlockingProject(false);
    } else {
      navigateToProject(project);
    }
  };

  const verifyPassword = async (e) => {
    e.preventDefault();
    if (!passwordPromptProject || isUnlockingProject) return;
    setIsUnlockingProject(true);
    try {
      const project = passwordPromptProject;
      await unlockProjectAccess(project.id, inputPassword);
      navigateToProject(project, { state: { unlockedProjectId: project.id } });
      setPasswordPromptProject(null);
      setPasswordError(false);
    } catch {
      setPasswordError(true);
    } finally {
      setIsUnlockingProject(false);
    }
  };

  // Styles Helper for Grid
  const styles = {
    vote: { color: 'text-google-blue', bgParams: 'bg-google-blue/10', activeColor: 'text-google-blue', activeBg: 'bg-google-blue/5' },
    team: { color: 'text-google-red', bgParams: 'bg-google-red/10', activeColor: 'text-google-red', activeBg: 'bg-google-red/5' },
    roulette: { color: 'text-google-yellow', bgParams: 'bg-google-yellow/10', activeColor: 'text-google-yellow', activeBg: 'bg-google-yellow/5' },
    project: { color: 'text-google-green', bgParams: 'bg-google-green/10', activeColor: 'text-google-green', activeBg: 'bg-google-green/5' },
    game_hub: { color: 'text-google-green', bgParams: 'bg-google-green/10', activeColor: 'text-google-green', activeBg: 'bg-google-green/5' },
    gather: { color: 'text-google-blue', bgParams: 'bg-google-blue/10', activeColor: 'text-google-blue', activeBg: 'bg-google-blue/5' },
    schedule: { color: 'text-google-blue', bgParams: 'bg-google-blue/10', activeColor: 'text-google-blue', activeBg: 'bg-google-blue/5' },
    book: { color: 'text-google-blue', bgParams: 'bg-google-blue/10', activeColor: 'text-google-blue', activeBg: 'bg-google-blue/5' },
    claim: { color: 'text-google-red', bgParams: 'bg-google-red/10', activeColor: 'text-google-red', activeBg: 'bg-google-red/5' },
    queue: { color: 'text-google-yellow', bgParams: 'bg-google-yellow/10', activeColor: 'text-google-yellow', activeBg: 'bg-google-yellow/5' },
  };

  const tabIndex = useMotionValue(0);

  useEffect(() => {
    const index = DASHBOARD_TAB_IDS.indexOf(activeTab);
    animate(tabIndex, index, { type: "spring", stiffness: 350, damping: 30 });
  }, [activeTab, tabIndex]);

  const pillColor = useTransform(tabIndex, [0, 1, 2, 3], DASHBOARD_TAB_BG_COLORS);
  // Calculate left percentage. 0 -> 0%, 3 -> 75% (for 4 items)
  // Or in a container of 100%, each is 25%.
  const pillLeft = useTransform(tabIndex, (val) => `${val * 25}%`);

  return (
    <div className="mx-auto max-w-7xl animate-fade-in space-y-6">
      {passwordPromptProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="app-dialog">
            <div className="flex flex-col items-center mb-4">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-google-yellow/20">
                <Lock className="w-6 h-6 text-[#8a5a00]" />
              </div>
              <h3 className="text-2xl font-medium text-m3-on-surface">{t('lockTitle')}</h3>
              <p className="text-sm text-m3-on-surface-variant">{t('verifyAccess')}</p>
            </div>
            <form onSubmit={verifyPassword}>
              <div className="relative mb-2">
                <input
                  type="password" value={inputPassword}
                  onChange={e => { setInputPassword(e.target.value); setPasswordError(false); }}
                  className="app-input"
                  placeholder={t('enterPassword')} autoFocus
                  disabled={isUnlockingProject}
                  aria-invalid={passwordError}
                  aria-describedby={passwordError ? 'project-unlock-error' : undefined}
                />
              </div>
              {passwordError && <p id="project-unlock-error" role="alert" aria-live="assertive" className="text-google-red text-xs mb-4 ml-1">{t('incorrectPass')}</p>}
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" disabled={isUnlockingProject} onClick={() => setPasswordPromptProject(null)} className="app-button-quiet">{t('cancel')}</button>
                <button type="submit" disabled={isUnlockingProject} className="app-button-primary">{isUnlockingProject ? t('processing') : t('unlock')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Navigation Rail / Tabs (Renamed & Styled) */}
      <div className="flex justify-center mb-8">
        <div className="relative grid w-full max-w-2xl grid-cols-4 gap-0 rounded-full border border-m3-outline-variant/45 bg-white p-1 shadow-sm isolation-auto">
          {/* Animated Background Pill */}
          <motion.div 
             className="absolute top-1 bottom-1 rounded-full shadow-elevation-1 z-0"
             style={{ 
               backgroundColor: pillColor, 
               left: useTransform(tabIndex, (val) => `calc(${val * 25}% + 4px)`), 
               width: 'calc(25% - 8px)'
             }}
          />

          <TabButton id="collect" label={t('collect')} icon={Vote} isActive={activeTab === 'collect'} onClick={() => { setActiveTab('collect'); setShowCreate(false); setSelectedModule(null); }} />
          <TabButton id="connect" label={t('connect')} icon={Users} isActive={activeTab === 'connect'} onClick={() => { setActiveTab('connect'); setShowCreate(false); setSelectedModule(null); }} />
          <TabButton id="select" label={t('select')} icon={Dices} isActive={activeTab === 'select'} onClick={() => { setActiveTab('select'); setShowCreate(false); setSelectedModule(null); }} />
          <TabButton id="project" label={t('games')} icon={Gamepad2} isActive={activeTab === 'project'} onClick={() => { setActiveTab('project'); setShowCreate(false); setSelectedModule(null); }} />
        </div>
      </div>

      {recentProjects.length > 0 && (
        <section aria-label={t('recentProjects')} className="rounded-2xl border border-m3-outline-variant/45 bg-white/75 p-3 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-google-blue/10 text-google-blue">
                <Clock className="h-4 w-4" />
              </span>
              <h2 className="truncate text-sm font-semibold text-m3-on-surface">{t('continueWork')}</h2>
            </div>
            <span className="shrink-0 rounded-full bg-m3-surface-container px-2.5 py-1 text-xs font-medium text-m3-on-surface-variant">
              {t('recentProjectCount', { count: recentProjects.length })}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {recentProjects.map((project) => {
              const activeStyle = styles[project.type] || styles.vote;
              const isArchived = Boolean(project.archived);
              const isActive = !isArchived && project.status !== 'stopped' && project.status !== 'finished';
              const statusColor = isActive ? activeStyle.activeColor : 'text-m3-on-surface-variant';
              const statusBg = isActive ? activeStyle.activeBg : 'bg-m3-on-surface/5';
              const statusIconBg = isActive ? activeStyle.bgParams : 'bg-m3-on-surface/10';
              const RecentIcon = project.type === 'team' ? Users :
                project.type === 'game_hub' ? Gamepad2 :
                project.type === 'gather' ? ClipboardList :
                project.type === 'schedule' ? CalendarClock :
                project.type === 'book' ? CalendarCheck :
                project.type === 'claim' ? CheckSquare :
                project.type === 'queue' ? ListOrdered :
                project.type === 'roulette' ? Dices :
                  Vote;

              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => handleProjectClick(project)}
                  aria-label={`${project.title}, ID ${project.id.slice(0, 6)}`}
                  className={`min-h-[88px] rounded-xl border border-m3-outline-variant/35 p-3 text-left transition-colors hover:border-google-blue/35 hover:bg-google-blue/5 ${statusBg}`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${statusIconBg}`}>
                      <RecentIcon className={`h-5 w-5 ${statusColor}`} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm font-semibold leading-snug text-m3-on-surface">{project.title}</span>
                      <span className="mt-2 flex items-center gap-2 text-xs text-m3-on-surface-variant">
                        <span className="font-mono opacity-70">ID: {project.id.slice(0, 6)}</span>
                        {isArchived && <span className="app-chip bg-m3-on-surface/10 py-0.5"><Archive className="h-3 w-3" /> {t('archived')}</span>}
                        {!isArchived && project.status === 'finished' && <span className="app-chip bg-m3-on-surface/10 py-0.5">{t('finished')}</span>}
                        {!isArchived && project.status === 'stopped' && <span className="app-chip bg-m3-on-surface/10 py-0.5">{t('paused')}</span>}
                        {hasProjectPassword(project) && <Lock className={`h-4 w-4 ${isActive ? 'text-google-yellow' : 'text-m3-on-surface-variant'}`} />}
                      </span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Search & Action Bar */}
      <div className="flex flex-col items-center gap-4 md:flex-row">
        <div className="relative w-full flex-1 group">
          <div className="absolute left-4 top-1/2 -translate-y-1/2"><Search className="w-5 h-5 text-m3-on-surface-variant group-focus-within:text-google-blue" /></div>
          <input
            type="text"
            placeholder={t('searchPlaceholder', { label: currentCategory.label })}
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="app-input rounded-full pl-12"
          />
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="app-button-tonal w-full md:w-auto">
          {showCreate ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
          <span className="text-base">{showCreate ? t('closeCreator') : t('newProject')}</span>
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-m3-outline-variant/45 bg-white/75 p-3 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <span className="px-1 text-xs font-medium uppercase text-m3-on-surface-variant">{t('dashboardFilter')}</span>
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-m3-surface-container p-1">
            {DASHBOARD_STATUS_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setStatusFilter(filter.id)}
                className={`touch-target whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter === filter.id ? 'bg-white text-google-blue shadow-sm' : 'text-m3-on-surface-variant hover:bg-white/60 hover:text-m3-on-surface'}`}
              >
                {t(filter.labelKey)}
              </button>
            ))}
          </div>
        </div>
        <label className="flex min-w-[180px] items-center gap-2 text-xs font-medium uppercase text-m3-on-surface-variant">
          {t('dashboardSort')}
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value)} className="app-input h-11 flex-1 rounded-full py-1 text-sm normal-case">
            {DASHBOARD_SORT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{t(option.labelKey)}</option>
            ))}
          </select>
        </label>
      </div>

      {showCreate && (
        <div className="app-card animate-slide-down p-5 sm:p-6">
          <h3 className="mb-6 text-xl font-medium text-m3-on-surface">{t('createTitle', { type: currentCategory.label })}</h3>
          
          <form onSubmit={handleCreateSubmit} className="flex flex-col gap-5">
            {/* Sub-selection Page: Choose Module */}
            <div className="mb-2">
              <label className="app-label mb-3 uppercase tracking-wide">{t('selectTool')}</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {currentCategory.modules.map((mod) => (
                  <button
                    type="button"
                    key={mod.id} 
                    disabled={isCreatingProject}
                    onClick={() => setSelectedModule(mod)} 
                    className={`app-card flex min-h-[104px] items-start gap-4 p-4 text-left disabled:cursor-not-allowed disabled:opacity-60 ${selectedModule?.id === mod.id ? 'border-google-blue bg-m3-primary-container/70 shadow-elevation-1' : 'hover:bg-m3-surface-container-low'}`}
                  >
                    <div className={`p-2 rounded-full ${selectedModule?.id === mod.id ? 'bg-white/50' : 'bg-m3-surface-container-high'}`}>
                      <mod.icon className={`w-6 h-6 ${currentCategory.color}`} />
                    </div>
                    <div>
                      <div className="font-medium text-m3-on-surface">{mod.label}</div>
                      <div className="text-xs text-m3-on-surface-variant mt-1">{mod.desc}</div>
                    </div>
                  </button>
                ))}
                {/* Placeholder for future modules */}
                <div className="flex min-h-[104px] items-center justify-center rounded-2xl border border-dashed border-m3-outline-variant/50 p-4 text-sm italic text-m3-on-surface-variant/60">
                  {t('moreComing')}
                </div>
              </div>
            </div>

            {selectedModule && (
              <div className="animate-fade-in space-y-5 border-t border-m3-outline-variant/20 pt-5 mt-2">
                 <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1">
                    <label className="app-label">{t('projTitle')}</label>
                    <input type="text" placeholder={t('projTitlePlaceholder')} value={newTitle} onChange={e => setNewTitle(e.target.value)} className="app-input" required maxLength={PROJECT_TITLE_MAX_LENGTH} disabled={isCreatingProject} />
                  </div>
                  <div className="w-full md:w-1/3">
                    <label className="app-label">{t('creatorName')}</label>
                    <input type="text" placeholder={t('creatorNamePlaceholder')} value={creatorName} onChange={e => setCreatorName(e.target.value)} className="app-input" required disabled={isCreatingProject} />
                  </div>
                </div>
                <div className="flex flex-col md:flex-row gap-4 items-end">
                  <div className="flex-1 w-full">
                    <label className="app-label">{t('accessPass')}</label>
                    <input type="text" placeholder={t('leaveEmpty')} value={newPassword} onChange={e => setNewPassword(e.target.value)} className="app-input" disabled={isCreatingProject} />
                  </div>
                  <button type="submit" disabled={!canCreateProject || isCreatingProject} className={`app-button w-full px-8 text-white hover:shadow-elevation-2 disabled:cursor-not-allowed disabled:opacity-45 md:w-auto ${currentCategory.bg}`}>
                    {isCreatingProject ? t('processing') : t('createBtn', { label: selectedModule.label })}
                  </button>
                </div>
                {createError && <p className="text-sm font-medium text-google-red">{createError}</p>}
              </div>
            )}
          </form>
        </div>
      )}

      {loadingGrid(filteredProjects, handleProjectClick, styles, t, normalizedPinnedProjectIds, onToggleProjectPin, hasActiveFilters, handleClearFilters)}
    </div>
  );
}

// Helper to render grid to keep main component clean
const loadingGrid = (filteredProjects, handleProjectClick, styles, t, pinnedProjectIds, onToggleProjectPin, hasActiveFilters, onClearFilters) => (
  <div className="workspace-grid min-h-[50vh] content-start">
    <AnimatePresence mode="popLayout">
      {filteredProjects.map((project) => {
        // Map project type to legacy style keys
        const styleKey = project.type; 
        const activeStyle = styles[styleKey] || styles.vote;

        const isArchived = Boolean(project.archived);
        const isActive = !isArchived && project.status !== 'stopped' && project.status !== 'finished';
        const statusColor = isActive ? activeStyle.activeColor : 'text-m3-on-surface-variant'; 
        const statusBg = isActive ? activeStyle.activeBg : 'bg-m3-on-surface/5';
        const statusIconBg = isActive ? activeStyle.bgParams : 'bg-m3-on-surface/10'; // Circle Bg
        const isPinned = pinnedProjectIds.includes(project.id);
        
        return (
        <motion.div
          layout
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.2 }}
          key={project.id} 
          className="relative min-h-[152px]"
        >
          <button
            type="button"
            onClick={() => handleProjectClick(project)}
            aria-label={`${project.title}, ID ${project.id.slice(0, 6)}`}
            className={`app-card group h-full min-h-[152px] w-full cursor-pointer overflow-hidden p-0 text-left active:scale-[0.99] ${statusBg}`}
          >
          <div className="flex h-full flex-col p-5 pr-14">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${statusIconBg}`}>
                {project.type === 'vote' ? <Vote className={`w-5 h-5 ${statusColor}`} /> :
                  project.type === 'team' ? <Users className={`w-5 h-5 ${statusColor}`} /> :
                  project.type === 'game_hub' ? <Gamepad2 className={`w-5 h-5 ${statusColor}`} /> :
                    <Dices className={`w-5 h-5 ${statusColor}`} />}
              </div>
              {isArchived && <span className="app-chip bg-m3-on-surface/10 py-0.5"><Archive className="w-3 h-3" /> {t('archived')}</span>}
              {!isArchived && project.status === 'finished' && <span className="app-chip bg-m3-on-surface/10 py-0.5">{t('finished')}</span>}
              {!isArchived && project.status === 'stopped' && <span className="app-chip bg-m3-on-surface/10 py-0.5">{t('paused')}</span>}
              {hasProjectPassword(project) && <Lock className={`w-4 h-4 ${isActive ? 'text-google-yellow' : 'text-m3-on-surface-variant'}`} />}
            </div>
            <h3 className={`mb-2 line-clamp-2 px-1 text-lg font-medium leading-snug transition-colors ${isActive ? 'text-m3-on-surface font-semibold' : 'text-m3-on-surface-variant'}`}>{project.title}</h3>
            <div className="mt-auto flex items-center justify-between border-t border-m3-outline-variant/20 px-1 pt-4 text-xs text-m3-on-surface-variant">
              <span className="font-mono opacity-70">ID: {project.id.slice(0, 6)}</span>
              <span className="max-w-[52%] truncate opacity-70">{project.creatorName}</span>
            </div>
          </div>
          </button>
          <button
            type="button"
            aria-pressed={isPinned}
            aria-label={t(isPinned ? 'unpinProject' : 'pinProject', { title: project.title })}
            title={t(isPinned ? 'unpinProject' : 'pinProject', { title: project.title })}
            onClick={(event) => {
              event.stopPropagation();
              onToggleProjectPin(project.id);
            }}
            className={`app-icon-button absolute right-3 top-3 z-10 h-11 min-h-11 w-11 ${isPinned ? 'border-google-yellow/40 bg-google-yellow/20 text-[#8a5a00]' : 'bg-white/80 text-m3-on-surface-variant hover:text-google-blue'}`}
          >
            <PinIcon className="w-4 h-4" />
            {isPinned && <span className="sr-only">{t('pinnedProject')}</span>}
          </button>
        </motion.div>
      );
      })}
    </AnimatePresence>
    {filteredProjects.length === 0 && (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} aria-live="polite" className="app-card-quiet col-span-full flex flex-col items-center justify-center border-dashed py-16 text-m3-on-surface-variant/60">
        <FolderPlus className="w-12 h-12 mb-3 opacity-20" />
        <p>{hasActiveFilters ? t('noProjectsFiltered') : t('noProjects')}</p>
        {hasActiveFilters && (
          <button type="button" onClick={onClearFilters} className="app-button-tonal mt-4 px-4 py-2 text-sm">
            {t('clearDashboardFilters')}
          </button>
        )}
      </motion.div>
    )}
  </div>
);
