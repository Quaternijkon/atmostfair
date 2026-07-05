import React, { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Activity, Archive, ArrowLeft, Copy, Download, Key, Lock, Flag, RotateCcw, Trash2, Info, MessageSquare, QrCode } from '../components/Icons';
import { useUI } from '../components/UIContext';
import { getActivityMessageKey } from '../lib/activityDomain';
import { createProjectParticipantExport, supportsParticipantExport } from '../lib/exportDomain';
import { formatDate } from '../lib/locale';
import VotingView from '../components/VotingView';
import TeamView from '../components/TeamView';
import RouletteView from '../components/RouletteView';
import QueueView from '../components/QueueView';
import GatherView from '../components/GatherView';
import ScheduleView from '../components/ScheduleView';
import BookingView from '../components/BookingView';
import ClaimView from '../components/ClaimView';
import QRCodeShare from '../components/QRCodeShare';
import ChatRoom from '../components/ChatRoom';
import GameHubView from '../components/GameHubView';

function ActivityTimeline({ activities, t }) {
  const visibleActivities = (activities || []).slice(0, 8);

  return (
    <aside className="app-card p-4" aria-label={t('activityTimeline')}>
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-m3-on-surface">
        <Activity className="h-4 w-4 text-google-blue" />
        <span>{t('activityTimeline')}</span>
      </div>
      {visibleActivities.length === 0 ? (
        <div className="rounded-lg border border-dashed border-m3-outline-variant/40 px-3 py-4 text-center text-xs text-m3-on-surface-variant">
          {t('noActivities')}
        </div>
      ) : (
        <div role="list" className="space-y-3">
          {visibleActivities.map((activity) => (
            <div key={activity.id} role="listitem" className="rounded-lg border border-m3-outline-variant/30 px-3 py-2">
              <p className="text-sm text-m3-on-surface">
                {t(getActivityMessageKey(activity.type), {
                  actor: activity.actorName || t('unknownUser'),
                  subject: activity.subject || t('project'),
                })}
              </p>
              <p className="mt-1 text-[11px] text-m3-on-surface-variant">
                {formatDate(activity.createdAt, t)}
              </p>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

export default function ProjectDetail({ projects, user, isAdmin, items, rooms, rouletteData, queueData, gatherFields, gatherSubmissions, scheduleSubmissions, bookingSlots, claimItems, projectActivities, actions, t }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { confirm, showToast } = useUI();
  
  const [unlocked, setUnlocked] = useState(() => Boolean(location.state?.unlocked));
  const [inputPassword, setInputPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showChat, setShowChat] = useState(false);

  const project = projects.find(p => p.id === id);

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-m3-on-surface-variant">
        <h2 className="text-xl mb-4">{t('loading')}</h2>
        <button onClick={() => navigate('/')} className="app-button-quiet text-google-blue">{t('backToDash')}</button>
      </div>
    );
  }

  // Password Guard
  if (project.password && !unlocked) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] animate-fade-in">
        <div className="app-card flex w-full max-w-sm flex-col items-center p-8">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-google-yellow/20">
              <Lock className="h-7 w-7 text-[#8a5a00]" />
            </div>
            <h3 className="text-2xl font-medium text-m3-on-surface mb-2">{t('lockTitle')}</h3>
            <p className="text-sm text-m3-on-surface-variant mb-6 text-center">{t('verifyAccess')}</p>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              if (inputPassword === project.password) {
                setUnlocked(true);
              } else {
                setPasswordError(true);
              }
            }} className="w-full">
              <div className="relative mb-2">
                <input
                  type="password" value={inputPassword}
                  onChange={e => { setInputPassword(e.target.value); setPasswordError(false); }}
                  className="app-input"
                  placeholder={t('enterPassword')} autoFocus
                />
              </div>
              {passwordError && <p className="text-google-red text-xs mb-6 ml-1">{t('incorrectPass')}</p>}
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => navigate('/')} className="app-button-quiet">{t('cancel')}</button>
                <button type="submit" className="app-button-primary">{t('unlock')}</button>
              </div>
            </form>
        </div>
      </div>
    );
  }

  const isOwner = user?.uid === project.creatorId;
  const hasAdminRights = isOwner || isAdmin;
  const isArchived = Boolean(project.archived);
  const isStopped = project.status === 'stopped';
  const isFinished = project.status === 'finished';
  const canExportParticipants = hasAdminRights && supportsParticipantExport(project.type);
  const shortProjectId = project.id.slice(0, 8);
  const projectTypeLabel = {
    vote: t('voting'),
    gather: t('gather'),
    schedule: t('schedule'),
    book: t('book'),
    team: t('teams'),
    claim: t('tasks'),
    roulette: t('roulette'),
    queue: t('queue'),
    game_hub: t('gameHub'),
    project: t('project'),
  }[project.type] || t('project');
  const projectRoutePrefix = {
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
  }[project.type] || 'projects';
  
  const copyId = () => { navigator.clipboard.writeText(project.id); };
  const handleDuplicateProject = () => {
    confirm({
      title: t('duplicateProject'),
      message: t('duplicateProjectConfirm'),
      confirmText: t('duplicate'),
      cancelText: t('cancel'),
      onConfirm: async () => {
        const duplicatedProjectId = await actions.handleDuplicateProject(project, t('copySuffix'));
        if (duplicatedProjectId) navigate(`/${projectRoutePrefix}/${duplicatedProjectId}`);
      },
    });
  };
  const handleArchiveProject = (archived) => {
    confirm({
      title: archived ? t('archiveProject') : t('restoreProject'),
      message: archived ? t('archiveProjectConfirm') : t('restoreProjectConfirm'),
      confirmText: archived ? t('archive') : t('restore'),
      cancelText: t('cancel'),
      onConfirm: async () => {
        await actions.handleArchiveProject(project, archived);
        if (archived) navigate('/');
      },
    });
  };

  const projectItems = items.filter(i => i.projectId === project.id);
  const projectRooms = rooms.filter(r => r.projectId === project.id);
  const projectRouletteData = rouletteData.filter(r => r.projectId === project.id);
  const projectQueueData = (queueData || []).filter(q => q.projectId === project.id);
  const projectGatherFields = (gatherFields || []).filter(f => f.projectId === project.id);
  const projectGatherSubmissions = (gatherSubmissions || []).filter(s => s.projectId === project.id);
  const projectScheduleSubmissions = (scheduleSubmissions || []).filter(s => s.projectId === project.id);
  const projectBookingSlots = (bookingSlots || []).filter(s => s.projectId === project.id);
  const projectClaimItems = (claimItems || []).filter(c => c.projectId === project.id);
  const projectActivityItems = (projectActivities || [])
    .filter((activity) => activity.projectId === project.id)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const handleExportParticipants = () => {
    const exportData = createProjectParticipantExport(project, {
      queueParticipants: projectQueueData,
      bookingSlots: projectBookingSlots,
      scheduleSubmissions: projectScheduleSubmissions,
      gatherFields: projectGatherFields,
      gatherSubmissions: projectGatherSubmissions,
      claimItems: projectClaimItems,
    }, t);

    if (!exportData) {
      showToast(t('noExportData'), 'info');
      return;
    }

    const blob = new Blob([exportData.csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportData.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="animate-fade-in pb-20">
      <div className="app-card mb-6 flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between sm:p-6">
        <div>
          <button onClick={() => navigate('/')} className="app-button-quiet mb-3 -ml-2 px-3"><ArrowLeft className="w-5 h-5" /> {t('backToDash')}</button>
          <h1 className="text-balance text-3xl font-medium text-m3-on-surface md:text-4xl">
            {project.title}
          </h1>
          <div className="flex items-center flex-wrap gap-2 mt-3">
            <div className="app-chip app-chip-blue">
              <span className="text-xs font-mono text-m3-on-surface-variant select-all">ID {shortProjectId}</span>
              <button onClick={copyId} className="touch-target -my-2 -mr-2 inline-flex items-center justify-center rounded-full text-m3-on-surface-variant hover:text-google-blue" title={t('copyFullProjectId')} aria-label={t('copyFullProjectId')}><Copy className="w-3.5 h-3.5" /></button>
            </div>
            <div className="app-chip">{projectTypeLabel}</div>
            {project.password && <div className="app-chip app-chip-yellow"><Key className="w-4 h-4" /></div>}
            {isArchived && <div className="app-chip"><Archive className="w-3 h-3" /> {t('archived')}</div>}
            {isStopped && <div className="app-chip"><Lock className="w-3 h-3" /> {t('paused')}</div>}
            {isFinished && <div className="app-chip app-chip-red"><Flag className="w-3 h-3" /> {t('finished')}</div>}
          </div>
        </div>
        
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center md:mt-0">
           <div className="flex gap-2">
             <button onClick={() => setShowQR(true)} className="app-icon-button border-m3-outline-variant/45" title={t('share')}>
                <QrCode className="w-5 h-5" />
             </button>
             <button onClick={() => setShowChat(!showChat)} className={`app-icon-button ${showChat ? 'border-transparent bg-m3-primary-container text-m3-on-primary-container hover:bg-m3-primary-container hover:text-m3-on-primary-container' : 'border-m3-outline-variant/45'}`} title={t('chat')}>
                <MessageSquare className="w-5 h-5" />
             </button>
           </div>

           {hasAdminRights && (
             <div className="flex flex-wrap gap-2">
               {canExportParticipants && (
                 <button onClick={handleExportParticipants} className="app-button-quiet border border-m3-outline-variant/45" title={t('exportParticipants')}>
                   <Download className="w-4 h-4" /> <span className="hidden lg:inline">{t('exportParticipants')}</span>
                 </button>
               )}
               <button onClick={handleDuplicateProject} className="app-button-quiet border border-m3-outline-variant/45">
                 <Copy className="w-4 h-4" /> <span className="hidden lg:inline">{t('duplicate')}</span>
               </button>
               <button onClick={() => handleArchiveProject(!isArchived)} className="app-button-quiet border border-m3-outline-variant/45">
                 {isArchived ? <RotateCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                 <span className="hidden lg:inline">{isArchived ? t('restore') : t('archive')}</span>
               </button>
               {!isFinished && (
                 <button onClick={() => actions.handleToggleProjectStatus(project)} className={isStopped ? 'app-button-tonal' : 'app-button-quiet border border-m3-outline-variant/45'}>{isStopped ? t('resume') : t('pause')}</button>
               )}
               <button 
                 onClick={() => confirm({
                   title: t('deleteProject'),
                   message: t('deleteConfirm'),
                   confirmText: t('delete'),
                   cancelText: t('cancel'),
                   type: 'destructive',
                   onConfirm: () => { actions.handleDeleteProject(project.id); navigate('/'); }
                 })} 
                 className={isFinished ? 'app-button bg-google-red text-white hover:shadow-elevation-1' : 'app-button-danger'}
               >
                 <Trash2 className="w-4 h-4" /> <span className={isFinished ? '' : 'hidden lg:inline'}>{isFinished ? t('deleteProject') : t('delete')}</span>
               </button>
             </div>
           )}
        </div>
      </div>

      {showQR && <QRCodeShare url={window.location.href} title={project.title} onClose={() => setShowQR(false)} t={t} />}

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        <div className="flex-1 w-full min-w-0 space-y-6">
      {project.type === 'vote' && <VotingView user={user} isAdmin={isAdmin} items={projectItems} isStopped={isStopped || isFinished} onAdd={(title, name) => actions.handleAddItem(title, project.id, name)} onDelete={actions.handleDeleteItem} onVote={actions.handleVote} isProjectOwner={isOwner} projectId={project.id} t={t} />}
      {project.type === 'team' && <TeamView user={user} isAdmin={isAdmin} rooms={projectRooms} isStopped={isStopped || isFinished} onCreate={(name, max, cName) => actions.handleCreateRoom(name, max, project.id, cName)} onJoin={actions.handleJoinRoom} onKick={actions.handleKickMember} onDelete={actions.handleDeleteRoom} projectId={project.id} t={t} />}
      {project.type === 'roulette' && <RouletteView key={project.id} user={user} isAdmin={isAdmin} project={project} participants={projectRouletteData} isStopped={isStopped} isFinished={isFinished} isOwner={isOwner} actions={actions} t={t} />}
      {project.type === 'queue' && <QueueView user={user} isAdmin={isAdmin} project={project} participants={projectQueueData} isStopped={isStopped} isFinished={isFinished} isOwner={isOwner} actions={actions} t={t} />}
      {project.type === 'gather' && <GatherView user={user} isAdmin={isAdmin} project={project} fields={projectGatherFields} submissions={projectGatherSubmissions} isStopped={isStopped || isFinished} isOwner={isOwner} actions={actions} t={t} />}
      {project.type === 'schedule' && <ScheduleView user={user} isAdmin={isAdmin} project={project} submissions={projectScheduleSubmissions} isStopped={isStopped || isFinished} isOwner={isOwner} actions={actions} t={t} />}
      {project.type === 'book' && <BookingView user={user} isAdmin={isAdmin} project={project} slots={projectBookingSlots} isStopped={isStopped || isFinished} isOwner={isOwner} actions={actions} t={t} />}
      {project.type === 'claim' && <ClaimView user={user} isAdmin={isAdmin} project={project} items={projectClaimItems} isStopped={isStopped || isFinished} isOwner={isOwner} actions={actions} t={t} />}
      {project.type === 'game_hub' && <GameHubView project={project} user={user} t={t} />}
      {project.type === 'project' && (
        <div className="app-card flex flex-col items-center justify-center p-12">
            <div className="w-16 h-16 rounded-full bg-google-green/20 flex items-center justify-center mb-4 text-google-green">
                <Info className="w-8 h-8" />
            </div>
            <h3 className="text-xl text-m3-on-surface mb-2">{t('project')}</h3>
            <p className="text-m3-on-surface-variant">{t('projectView')}</p>
        </div>
      )}
        </div>
        
        <div className="w-full space-y-4 xl:sticky xl:top-24 xl:w-96 self-start">
          <ActivityTimeline activities={projectActivityItems} t={t} />
          {showChat && (
             <div className="animate-fade-in">
                 <ChatRoom projectId={project.id} currentUser={user} t={t} />
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
