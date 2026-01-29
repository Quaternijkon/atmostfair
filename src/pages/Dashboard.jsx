import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { Search, Plus, X, Lock, Vote, Users, Dices, FolderPlus, ClipboardList, CheckSquare, ListOrdered, CalendarClock, CalendarCheck, Gamepad2 } from '../components/Icons';

const TabButton = ({ id, label, icon: Icon, isActive, onClick }) => {
  return (
    <button 
        onClick={onClick} 
        className="relative z-10 flex-auto py-2.5 text-sm font-medium flex items-center justify-center gap-2 rounded-full outline-none focus-visible:ring-2 ring-google-blue/50"
    >
      <span className={`relative flex items-center gap-2 transition-colors duration-200 ${isActive ? 'text-white' : 'text-m3-on-surface-variant group-hover:text-m3-on-surface'}`}>
        <Icon className="w-4 h-4" />
        <span className={isActive ? 'inline' : 'hidden md:inline'}>{label}</span>
      </span>
    </button>
  );
};


export default function Dashboard({ projects, onCreateProject, defaultName, t }) {
  const navigate = useNavigate();
  // Navigation State: 'collect' | 'connect' | 'select' | 'play'
  const [activeTab, setActiveTab] = useState('collect');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Creation Flow State
  const [showCreate, setShowCreate] = useState(false);
  const [selectedModule, setSelectedModule] = useState(null); // Sub-selection
  const [newTitle, setNewTitle] = useState('');
  const [creatorName, setCreatorName] = useState(defaultName);
  const [newPassword, setNewPassword] = useState('');
  
  // Unlock Password State
  const [passwordPromptProject, setPasswordPromptProject] = useState(null);
  const [inputPassword, setInputPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);

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
      label: t('games') || "Games",
      color: 'text-google-green',
      bg: 'bg-google-green',
      types: ['game_hub'], 
      modules: [
        { id: 'game_hub', label: t('gameHub'), icon: Gamepad2, desc: t('gameHubDesc') }
      ]
    }
  };

  const currentCategory = CATEGORIES[activeTab];

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => 
      currentCategory.types.includes(p.type) && 
      (p.title.toLowerCase().includes(searchTerm.toLowerCase()) || p.id.includes(searchTerm))
    );
  }, [projects, searchTerm, activeTab, currentCategory]);

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!selectedModule) return;
    onCreateProject(newTitle, selectedModule.id, creatorName, newPassword);
    setShowCreate(false); 
    setNewTitle(''); 
    setNewPassword('');
    setSelectedModule(null);
  };

  const navigateToProject = (project) => {
       const type = project.type; 
       let routePrefix = 'collect';
       if (type === 'schedule' || type === 'book') routePrefix = 'collect';
       if (type === 'team') routePrefix = 'connect';
       if (type === 'roulette' || type === 'queue') routePrefix = 'select';
       if (type === 'game_hub') routePrefix = 'games'; 
       
       navigate(`/${routePrefix}/${project.id}`);
  }

  const handleProjectClick = (project) => {
    if (project.password) {
      setPasswordPromptProject(project); setInputPassword(''); setPasswordError(false);
    } else {
      navigateToProject(project);
    }
  };

  const verifyPassword = (e) => {
    e.preventDefault();
    if (inputPassword === passwordPromptProject.password) {
      const project = passwordPromptProject;
      const type = project.type; 
      let routePrefix = 'collect';
      if (type === 'team') routePrefix = 'connect';
      if (type === 'roulette') routePrefix = 'select';
      if (type === 'game_hub') routePrefix = 'games';
      if (type === 'project') routePrefix = 'projects';
      navigate(`/${routePrefix}/${project.id}`, { state: { unlocked: true } });
      setPasswordPromptProject(null);
    } else { setPasswordError(true); }
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

  const TAB_IDS = ['collect', 'connect', 'select', 'project'];
  const TAB_BG_COLORS = ['#4285F4', '#EA4335', '#FBBC05', '#34A853']; // Google colors
  const tabIndex = useMotionValue(0);

  useEffect(() => {
    const index = TAB_IDS.indexOf(activeTab);
    animate(tabIndex, index, { type: "spring", stiffness: 350, damping: 30 });
  }, [activeTab, tabIndex]);

  const pillColor = useTransform(tabIndex, [0, 1, 2, 3], TAB_BG_COLORS);
  // Calculate left percentage. 0 -> 0%, 3 -> 75% (for 4 items)
  // Or in a container of 100%, each is 25%.
  const pillLeft = useTransform(tabIndex, (val) => `${val * 25}%`);

  return (
    <div className="animate-fade-in space-y-6 max-w-7xl mx-auto p-4 md:p-8">
      {passwordPromptProject && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-m3-surface-container rounded-[28px] p-6 w-full max-w-sm shadow-elevation-3">
            <div className="flex flex-col items-center mb-4">
              <Lock className="w-8 h-8 text-m3-on-surface mb-2" />
              <h3 className="text-2xl font-normal text-m3-on-surface">{t('lockTitle')}</h3>
              <p className="text-sm text-m3-on-surface-variant">{t('verifyAccess')}</p>
            </div>
            <form onSubmit={verifyPassword}>
              <div className="relative mb-2">
                <input
                  type="password" value={inputPassword}
                  onChange={e => { setInputPassword(e.target.value); setPasswordError(false); }}
                  className="w-full px-4 py-3 bg-m3-surface text-m3-on-surface border border-m3-outline rounded-lg outline-none focus:border-google-blue focus:border-2"
                  placeholder={t('enterPassword')} autoFocus
                />
              </div>
              {passwordError && <p className="text-google-red text-xs mb-4 ml-1">{t('incorrectPass')}</p>}
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setPasswordPromptProject(null)} className="px-5 py-2.5 text-google-blue font-medium hover:bg-google-blue/10 rounded-full text-sm">{t('cancel')}</button>
                <button type="submit" className="px-5 py-2.5 bg-google-blue text-white rounded-full font-medium text-sm hover:shadow-elevation-1">{t('unlock')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Navigation Rail / Tabs (Renamed & Styled) */}
      <div className="flex justify-center mb-8">
        <div className="relative bg-m3-surface-container-high p-1 rounded-full grid grid-cols-4 w-full max-w-2xl border border-m3-outline-variant/30 gap-0 isolation-auto">
          {/* Animated Background Pill */}
          <motion.div 
             className="absolute top-1 bottom-1 rounded-full shadow-md z-0"
             style={{ 
               backgroundColor: pillColor, 
               left: useTransform(tabIndex, (val) => `calc(${val * 25}% + 4px)`), 
               width: 'calc(25% - 8px)'
             }}
          />

          <TabButton id="collect" label={t('collect')} icon={Vote} isActive={activeTab === 'collect'} onClick={() => { setActiveTab('collect'); setShowCreate(false); setSelectedModule(null); }} />
          <TabButton id="connect" label={t('connect')} icon={Users} isActive={activeTab === 'connect'} onClick={() => { setActiveTab('connect'); setShowCreate(false); setSelectedModule(null); }} />
          <TabButton id="select" label={t('select')} icon={Dices} isActive={activeTab === 'select'} onClick={() => { setActiveTab('select'); setShowCreate(false); setSelectedModule(null); }} />
          <TabButton id="project" label={t('games') || "Games"} icon={Gamepad2} isActive={activeTab === 'project'} onClick={() => { setActiveTab('project'); setShowCreate(false); setSelectedModule(null); }} />
        </div>
      </div>

      {/* Search & Action Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="relative w-full flex-1 group">
          <div className="absolute left-4 top-1/2 -translate-y-1/2"><Search className="w-5 h-5 text-m3-on-surface-variant group-focus-within:text-google-blue" /></div>
          <input
            type="text"
            placeholder={t('searchPlaceholder', { label: currentCategory.label })}
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3.5 bg-m3-surface-container-high rounded-full border-none outline-none focus:ring-2 focus:ring-google-blue/50 text-m3-on-surface transition-all hover:bg-m3-surface-container-high/80"
          />
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className={`w-full md:w-auto flex items-center justify-center gap-2 pl-6 pr-8 py-4 rounded-2xl font-medium text-m3-on-primary-container bg-m3-primary-container hover:shadow-elevation-1 transition-all`}>
          {showCreate ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
          <span className="text-base">{showCreate ? t('closeCreator') : t('newProject')}</span>
        </button>
      </div>

      {showCreate && (
        <div className="p-6 rounded-[28px] bg-m3-surface-container border border-m3-outline-variant/50 animate-slide-down">
          <h3 className="text-xl font-normal text-m3-on-surface mb-6">{t('createTitle', { type: currentCategory.label })}</h3>
          
          <form onSubmit={handleCreateSubmit} className="flex flex-col gap-5">
            {/* Sub-selection Page: Choose Module */}
            <div className="mb-2">
              <label className="text-xs text-m3-on-surface-variant mb-3 block uppercase tracking-wider font-medium">{t('selectTool')}</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {currentCategory.modules.map((mod) => (
                  <div 
                    key={mod.id} 
                    onClick={() => setSelectedModule(mod)} 
                    className={`cursor-pointer p-4 rounded-xl border transition-all flex items-start gap-4 ${selectedModule?.id === mod.id ? `border-${currentCategory.color.split('-')[1]}-google bg-m3-secondary-container` : 'border-m3-outline-variant/30 hover:bg-m3-surface'}`}
                    style={{ borderColor: selectedModule?.id === mod.id ? 'var(--tw-ring-color)' : '' }}
                  >
                    <div className={`p-2 rounded-full ${selectedModule?.id === mod.id ? 'bg-white/50' : 'bg-m3-surface-container-high'}`}>
                      <mod.icon className={`w-6 h-6 ${currentCategory.color}`} />
                    </div>
                    <div>
                      <div className="font-medium text-m3-on-surface">{mod.label}</div>
                      <div className="text-xs text-m3-on-surface-variant mt-1">{mod.desc}</div>
                    </div>
                  </div>
                ))}
                {/* Placeholder for future modules */}
                <div className="p-4 rounded-xl border border-dashed border-m3-outline-variant/30 flex items-center justify-center text-m3-on-surface-variant/50 text-sm italic">
                  {t('moreComing')}
                </div>
              </div>
            </div>

            {selectedModule && (
              <div className="animate-fade-in space-y-5 border-t border-m3-outline-variant/20 pt-5 mt-2">
                 <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1">
                    <label className="text-xs text-m3-on-surface-variant ml-3 mb-1 block">{t('projTitle')}</label>
                    <input type="text" placeholder={t('projTitlePlaceholder')} value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full px-4 py-3 bg-m3-surface rounded-xl border border-m3-outline outline-none focus:border-google-blue focus:border-2 text-m3-on-surface" required />
                  </div>
                  <div className="w-full md:w-1/3">
                    <label className="text-xs text-m3-on-surface-variant ml-3 mb-1 block">{t('creatorName')}</label>
                    <input type="text" placeholder={t('creatorNamePlaceholder')} value={creatorName} onChange={e => setCreatorName(e.target.value)} className="w-full px-4 py-3 bg-m3-surface rounded-xl border border-m3-outline outline-none focus:border-google-blue focus:border-2 text-m3-on-surface" required />
                  </div>
                </div>
                <div className="flex flex-col md:flex-row gap-4 items-end">
                  <div className="flex-1 w-full">
                    <label className="text-xs text-m3-on-surface-variant ml-3 mb-1 block">{t('accessPass')}</label>
                    <input type="text" placeholder={t('leaveEmpty')} value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full px-4 py-3 bg-m3-surface rounded-xl border border-m3-outline outline-none focus:border-google-blue focus:border-2 text-m3-on-surface" />
                  </div>
                  <button type="submit" className={`w-full md:w-auto px-8 py-3.5 rounded-full font-medium text-white shadow-elevation-1 hover:shadow-elevation-2 transition-shadow ${currentCategory.bg}`}>
                    {t('createBtn', { label: selectedModule.label })}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      )}

      {loadingGrid(filteredProjects, handleProjectClick, styles, t)}
    </div>
  );
}

// Helper to render grid to keep main component clean
const loadingGrid = (filteredProjects, handleProjectClick, styles, t) => (
  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 min-h-[50vh] content-start">
    <AnimatePresence mode="popLayout">
      {filteredProjects.map((project) => {
        // Map project type to legacy style keys
        const styleKey = project.type; 
        const activeStyle = styles[styleKey] || styles.vote;

        const isActive = project.status !== 'stopped' && project.status !== 'finished';
        const statusColor = isActive ? activeStyle.activeColor : 'text-m3-on-surface-variant'; 
        const statusBg = isActive ? activeStyle.activeBg : 'bg-m3-on-surface/5';
        const statusIconBg = isActive ? activeStyle.bgParams : 'bg-m3-on-surface/10'; // Circle Bg
        
        return (
        <motion.div
          layout
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.2 }}
          key={project.id} 
          onClick={() => handleProjectClick(project)} 
          className={`group cursor-pointer p-0 rounded-[24px] border border-transparent hover:border-m3-outline-variant hover:shadow-elevation-1 transition-all overflow-hidden relative active:scale-[0.98] ${statusBg}`}
        >
          <div className="p-5 h-full flex flex-col">
            <div className="flex justify-between items-start mb-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${statusIconBg}`}>
                {project.type === 'vote' ? <Vote className={`w-5 h-5 ${statusColor}`} /> :
                  project.type === 'team' ? <Users className={`w-5 h-5 ${statusColor}`} /> :
                  project.type === 'game_hub' ? <Gamepad2 className={`w-5 h-5 ${statusColor}`} /> :
                    <Dices className={`w-5 h-5 ${statusColor}`} />}
              </div>
              {project.status === 'finished' && <span className="bg-m3-on-surface/10 text-m3-on-surface-variant text-xs px-2 py-1 rounded-md font-medium">{t('finished')}</span>}
              {project.status === 'stopped' && <span className="bg-m3-on-surface/10 text-m3-on-surface-variant text-xs px-2 py-1 rounded-md font-medium">{t('paused')}</span>}
              {project.password && <Lock className={`w-4 h-4 ${isActive ? 'text-google-yellow' : 'text-m3-on-surface-variant'}`} />}
            </div>
            <h3 className={`font-medium text-lg mb-1 transition-colors px-1 truncate ${isActive ? 'text-m3-on-surface font-semibold' : 'text-m3-on-surface-variant'}`}>{project.title}</h3>
            <div className="mt-auto pt-4 flex justify-between items-center text-xs text-m3-on-surface-variant px-1 border-t border-m3-outline-variant/20">
              <span className="font-mono opacity-70">ID: {project.id.slice(0, 6)}</span>
              <span className="opacity-70">{project.creatorName}</span>
            </div>
          </div>
        </motion.div>
      );
      })}
    </AnimatePresence>
    {filteredProjects.length === 0 && (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col-span-full flex flex-col items-center justify-center py-16 text-m3-on-surface-variant/50 border-2 border-dashed border-m3-outline-variant/30 rounded-[28px]">
        <FolderPlus className="w-12 h-12 mb-3 opacity-20" />
        <p>{t('noProjects')}</p>
      </motion.div>
    )}
  </div>
);
