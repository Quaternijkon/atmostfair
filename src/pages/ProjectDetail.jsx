import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Copy, Key, Lock, Flag, Trash2, Info, MessageSquare, QrCode } from '../components/Icons';
import { useUI } from '../components/UIComponents';
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

export default function ProjectDetail({ projects, user, isAdmin, items, rooms, rouletteData, queueData, gatherFields, gatherSubmissions, scheduleSubmissions, bookingSlots, claimItems, actions, t }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { confirm } = useUI();
  
  const [unlocked, setUnlocked] = useState(false);
  const [inputPassword, setInputPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showChat, setShowChat] = useState(false);

  const project = projects.find(p => p.id === id);

  useEffect(() => {
    // Check if passed 'unlocked' state from Dashboard
    if (location.state?.unlocked) {
      setUnlocked(true);
    }
  }, [location.state]);

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-m3-on-surface-variant">
        <h2 className="text-xl mb-4">{t('loading')}</h2>
        <button onClick={() => navigate('/')} className="text-google-blue hover:underline">{t('backToDash')}</button>
      </div>
    );
  }

  // Password Guard
  if (project.password && !unlocked) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] animate-fade-in">
        <div className="bg-m3-surface-container rounded-[28px] p-8 w-full max-w-sm shadow-elevation-2 flex flex-col items-center">
            <Lock className="w-10 h-10 text-m3-on-surface mb-4" />
            <h3 className="text-2xl font-normal text-m3-on-surface mb-2">{t('lockTitle')}</h3>
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
                  className="w-full px-4 py-3 bg-m3-surface text-m3-on-surface border border-m3-outline rounded-lg outline-none focus:border-google-blue focus:border-2 transition-all"
                  placeholder={t('enterPassword')} autoFocus
                />
              </div>
              {passwordError && <p className="text-google-red text-xs mb-6 ml-1">{t('incorrectPass')}</p>}
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => navigate('/')} className="px-5 py-2.5 text-google-blue font-medium hover:bg-google-blue/10 rounded-full text-sm">{t('cancel')}</button>
                <button type="submit" className="px-5 py-2.5 bg-google-blue text-white rounded-full font-medium text-sm hover:shadow-elevation-1">{t('unlock')}</button>
              </div>
            </form>
        </div>
      </div>
    );
  }

  const isOwner = user?.uid === project.creatorId;
  const hasAdminRights = isOwner || isAdmin;
  const isStopped = project.status === 'stopped';
  const isFinished = project.status === 'finished';
  
  const copyId = () => { navigator.clipboard.writeText(project.id); };

  const projectItems = items.filter(i => i.projectId === project.id);
  const projectRooms = rooms.filter(r => r.projectId === project.id);
  const projectRouletteData = rouletteData.filter(r => r.projectId === project.id);
  const projectQueueData = (queueData || []).filter(q => q.projectId === project.id);
  const projectGatherFields = (gatherFields || []).filter(f => f.projectId === project.id);
  const projectGatherSubmissions = (gatherSubmissions || []).filter(s => s.projectId === project.id);
  const projectScheduleSubmissions = (scheduleSubmissions || []).filter(s => s.projectId === project.id);
  const projectBookingSlots = (bookingSlots || []).filter(s => s.projectId === project.id);
  const projectClaimItems = (claimItems || []).filter(c => c.projectId === project.id);

  return (
    <div className="animate-fade-in pb-20">
      <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-m3-outline-variant/20">
        <div>
          <button onClick={() => navigate('/')} className="flex items-center text-sm font-medium text-m3-on-surface-variant hover:text-google-blue mb-3 transition-colors px-3 py-1.5 -ml-3 rounded-full hover:bg-m3-on-surface/5"><ArrowLeft className="w-5 h-5 mr-1" /> {t('backToDash')}</button>
          <h1 className="text-4xl font-normal text-m3-on-surface flex items-center gap-3">
            {project.title}
          </h1>
          <div className="flex items-center flex-wrap gap-2 mt-3">
            <div className="flex items-center gap-2 bg-m3-surface-container px-3 py-1 rounded-full border border-m3-outline-variant/30">
              <span className="text-xs font-mono text-m3-on-surface-variant select-all">{project.id}</span>
              <button onClick={copyId} className="cursor-pointer text-m3-on-surface-variant hover:text-google-blue"><Copy className="w-3 h-3" /></button>
            </div>
            {project.password && <div className="p-1.5 rounded-full bg-google-yellow/20"><Key className="w-4 h-4 text-google-yellow" /></div>}
            {isStopped && <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-m3-surface-container-high text-xs font-medium text-m3-on-surface-variant border border-m3-outline-variant"><Lock className="w-3 h-3" /> {t('paused')}</div>}
            {isFinished && <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-google-red/10 text-xs font-medium text-google-red border border-google-red/20"><Flag className="w-3 h-3" /> {t('finished')}</div>}
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center mt-4 md:mt-0">
           <div className="flex gap-2">
             <button onClick={() => setShowQR(true)} className="p-2.5 rounded-full text-m3-on-surface-variant hover:bg-m3-on-surface/5 border border-m3-outline-variant/30" title={t('share')}>
                <QrCode className="w-5 h-5" />
             </button>
             <button onClick={() => setShowChat(!showChat)} className={`p-2.5 rounded-full border transition-all ${showChat ? 'bg-m3-primary-container text-m3-on-primary-container border-transparent' : 'text-m3-on-surface-variant hover:bg-m3-on-surface/5 border-m3-outline-variant/30'}`} title={t('chat')}>
                <MessageSquare className="w-5 h-5" />
             </button>
           </div>

           {hasAdminRights && !isFinished && (
             <div className="flex gap-2">
               <button onClick={() => actions.handleToggleProjectStatus(project)} className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-medium text-sm transition-all ${isStopped ? 'bg-m3-primary-container text-m3-on-primary-container hover:shadow-elevation-1' : 'bg-m3-surface-container-high text-m3-on-surface hover:bg-m3-surface-container-high/80 border border-m3-outline-variant'}`}>{isStopped ? t('resume') : t('pause')}</button>
               <button 
                 onClick={() => confirm({
                   title: t('deleteProject'),
                   message: t('deleteConfirm'),
                   confirmText: t('delete'),
                   cancelText: t('cancel'),
                   type: 'destructive',
                   onConfirm: () => { actions.handleDeleteProject(project.id); navigate('/'); }
                 })} 
                 className="flex items-center gap-2 px-5 py-2.5 rounded-full font-medium text-sm text-google-red hover:bg-google-red/10 border border-transparent hover:border-google-red/20"
               >
                 <Trash2 className="w-4 h-4" /> <span className="hidden lg:inline">{t('delete')}</span>
               </button>
             </div>
           )}
           {hasAdminRights && isFinished && (
             <button 
               onClick={() => confirm({
                   title: t('deleteProject'),
                   message: t('deleteConfirm'),
                   confirmText: t('delete'),
                   cancelText: t('cancel'),
                   type: 'destructive',
                   onConfirm: () => { actions.handleDeleteProject(project.id); navigate('/'); }
               })}
               className="flex items-center gap-2 px-5 py-2.5 rounded-full font-medium text-sm bg-google-red text-white hover:shadow-elevation-1"
             >
               <Trash2 className="w-4 h-4" /> {t('deleteProject')}
             </button>
           )}
        </div>
      </div>

      {showQR && <QRCodeShare url={window.location.href} title={project.title} onClose={() => setShowQR(false)} t={t} />}

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        <div className="flex-1 w-full min-w-0 space-y-6">
      {project.type === 'vote' && <VotingView user={user} isAdmin={isAdmin} items={projectItems} isStopped={isStopped || isFinished} onAdd={(title, name) => actions.handleAddItem(title, project.id, name)} onDelete={actions.handleDeleteItem} onVote={actions.handleVote} isProjectOwner={isOwner} projectId={project.id} t={t} />}
      {project.type === 'team' && <TeamView user={user} isAdmin={isAdmin} rooms={projectRooms} isStopped={isStopped || isFinished} onCreate={(name, max, cName) => actions.handleCreateRoom(name, max, project.id, cName)} onJoin={actions.handleJoinRoom} onKick={actions.handleKickMember} onDelete={actions.handleDeleteRoom} projectId={project.id} t={t} />}
      {project.type === 'roulette' && <RouletteView user={user} isAdmin={isAdmin} project={project} participants={projectRouletteData} isStopped={isStopped} isFinished={isFinished} isOwner={isOwner} actions={actions} t={t} />}
      {project.type === 'queue' && <QueueView user={user} isAdmin={isAdmin} project={project} participants={projectQueueData} isStopped={isStopped} isFinished={isFinished} isOwner={isOwner} actions={actions} t={t} />}
      {project.type === 'gather' && <GatherView user={user} isAdmin={isAdmin} project={project} fields={projectGatherFields} submissions={projectGatherSubmissions} isStopped={isStopped || isFinished} isOwner={isOwner} actions={actions} t={t} />}
      {project.type === 'schedule' && <ScheduleView user={user} isAdmin={isAdmin} project={project} submissions={projectScheduleSubmissions} isStopped={isStopped || isFinished} isOwner={isOwner} actions={actions} t={t} />}
      {project.type === 'book' && <BookingView user={user} isAdmin={isAdmin} project={project} slots={projectBookingSlots} isStopped={isStopped || isFinished} isOwner={isOwner} actions={actions} t={t} />}
      {project.type === 'claim' && <ClaimView user={user} isAdmin={isAdmin} project={project} items={projectClaimItems} isStopped={isStopped || isFinished} isOwner={isOwner} actions={actions} t={t} />}
      {project.type === 'project' && (
        <div className="flex flex-col items-center justify-center p-12 bg-m3-surface-container-low rounded-[24px]">
            <div className="w-16 h-16 rounded-full bg-google-green/20 flex items-center justify-center mb-4 text-google-green">
                <Info className="w-8 h-8" />
            </div>
            <h3 className="text-xl text-m3-on-surface mb-2">{t('project')}</h3>
            <p className="text-m3-on-surface-variant">Project View</p>
        </div>
      )}
        </div>
        
        {showChat && (
           <div className="w-full xl:w-96 animate-fade-in sticky top-24 self-start">
               <ChatRoom projectId={project.id} currentUser={user} t={t} />
           </div>
        )}
      </div>
    </div>
  );
}
