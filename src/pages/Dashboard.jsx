import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, X, Lock, Vote, Users, Dices, FolderPlus, ClipboardList } from '../components/Icons';

export default function Dashboard({ projects, onCreateProject, defaultName, t }) {
  const navigate = useNavigate();
  // Navigation State: 'collect' | 'connect' | 'select' | 'project'
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
      types: ['vote', 'gather'], 
      modules: [
        { id: 'vote', label: t('voting'), icon: Vote, desc: t('votingDesc') },
        { id: 'gather', label: t('gather'), icon: ClipboardList, desc: t('gatherDesc') }
      ]
    },
    connect: { 
      id: 'connect',
      label: t('connect'), 
      color: 'text-google-red', 
      bg: 'bg-google-red',
      // Legacy 'type' mapping: 'team' projects belong to 'connect'
      types: ['team'], 
      modules: [
        { id: 'team', label: t('teams'), icon: Users, desc: t('teamsDesc') }
      ]
    },
    select: { 
      id: 'select',
      label: t('select'), 
      color: 'text-google-yellow', 
      bg: 'bg-google-yellow',
      // Legacy 'type' mapping: 'roulette' projects belong to 'select'
      types: ['roulette'], 
      modules: [
        { id: 'roulette', label: t('roulette'), icon: Dices, desc: t('rouletteDesc') }
      ]
    },
    project: {
      id: 'project',
      label: t('project'),
      color: 'text-google-green',
      bg: 'bg-google-green',
      types: ['project'], // New generic type
      modules: [
        { id: 'project', label: t('project'), icon: FolderPlus, desc: t('projectsDesc') } // Using FolderPlus as generic icon
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
    // Pass the module ID (e.g. 'vote') as the 'type' to backend
    onCreateProject(newTitle, selectedModule.id, creatorName, newPassword);
    setShowCreate(false); 
    setNewTitle(''); 
    setNewPassword('');
    setSelectedModule(null);
  };

  const navigateToProject = (project) => {
       const type = project.type; 
       let routePrefix = 'collect';
       if (type === 'team') routePrefix = 'connect';
       if (type === 'roulette') routePrefix = 'select';
       if (type === 'project') routePrefix = 'project'; // Future route
       // For now, project type also goes to detail or stays here? 
       // User said "temporarily no application" so maybe just navigate to detail page which will show generic info?
       // Currently ProjectDetail handles voting/team/roulette. We might need a generic handling in ProjectDetail or just alert.
       if(type === 'project') {
         // Placeholder alert or generic view.
         // Let's assume generic view is implemented or just go to /collect/ID for now as fallback if Detail supports it?
         // Actually ProjectDetail checks type.
         // Let's route to /project/:id and let Router catch it (we need to add that route in App.jsx)
         navigate(`/projects/${project.id}`); 
         return;
       }
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
      // In a real app we would pass state or token. 
      // For now we assume if they know password here, they can enter.
      // But actually, if we navigate, the Next Page will re-ask if we don't persist it.
      // We will handle passing 'unlocked' state in route.
      const project = passwordPromptProject;
      const type = project.type; 
      let routePrefix = 'collect';
      if (type === 'team') routePrefix = 'connect';
      if (type === 'roulette') routePrefix = 'select';
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
  };

  const TabButton = ({ id, label, icon: Icon, category }) => {
      const isActive = activeTab === id;
      // Dynamic button color when active
      const activeClass = isActive 
        ? `${category.bg} text-white shadow-md` 
        : 'text-m3-on-surface-variant hover:bg-m3-on-surface/5';

      return (
        <button 
            onClick={() => { setActiveTab(id); setShowCreate(false); setSelectedModule(null); }} 
            className={`flex-1 min-w-[90px] py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-all rounded-full ${activeClass}`}
        >
          {isActive ? <Icon className="w-4 h-4" /> : <Icon className="w-4 h-4 opacity-50" />}
          <span>{label}</span>
        </button>
      );
  };

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
        <div className="bg-m3-surface-container-high p-1 rounded-full inline-flex w-full max-w-2xl border border-m3-outline-variant/30 gap-1">
          <TabButton id="collect" label={t('collect')} icon={Vote} category={CATEGORIES.collect} />
          <TabButton id="connect" label={t('connect')} icon={Users} category={CATEGORIES.connect} />
          <TabButton id="select" label={t('select')} icon={Dices} category={CATEGORIES.select} />
          <TabButton id="project" label={t('project')} icon={FolderPlus} category={CATEGORIES.project} />
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
  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
    {filteredProjects.map((project) => {
      // Map project type to legacy style keys
      const styleKey = project.type; 
      const activeStyle = styles[styleKey] || styles.vote;

      const isActive = project.status !== 'stopped' && project.status !== 'finished';
      const statusColor = isActive ? activeStyle.activeColor : 'text-m3-on-surface-variant'; 
      const statusBg = isActive ? activeStyle.activeBg : 'bg-m3-on-surface/5';
      const statusIconBg = isActive ? activeStyle.bgParams : 'bg-m3-on-surface/10'; // Circle Bg
      
      return (
      <div key={project.id} onClick={() => handleProjectClick(project)} className={`group cursor-pointer p-0 rounded-[24px] border border-transparent hover:border-m3-outline-variant hover:shadow-elevation-1 transition-all overflow-hidden relative active:scale-[0.99] active:shadow-none ${statusBg}`}>
        <div className="p-5 h-full flex flex-col">
          <div className="flex justify-between items-start mb-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${statusIconBg}`}>
              {project.type === 'vote' ? <Vote className={`w-5 h-5 ${statusColor}`} /> :
                project.type === 'team' ? <Users className={`w-5 h-5 ${statusColor}`} /> :
                project.type === 'project' ? <FolderPlus className={`w-5 h-5 ${statusColor}`} /> :
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
      </div>
    );
    })}
    {filteredProjects.length === 0 && (
      <div className="col-span-full flex flex-col items-center justify-center py-16 text-m3-on-surface-variant/50 border-2 border-dashed border-m3-outline-variant/30 rounded-[28px]">
        <FolderPlus className="w-12 h-12 mb-3 opacity-20" />
        <p>{t('noProjects')}</p>
      </div>
    )}
  </div>
);
