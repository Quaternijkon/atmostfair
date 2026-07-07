import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Activity, AlertTriangle, Archive, ArrowLeft, ChartLine, Copy, Download, Key, Lock, Flag, RotateCcw, Trash2, Info, MessageSquare, QrCode, FileText, X } from '../components/Icons';
import { useUI } from '../components/UIContext';
import { collection, db, getDocs, query, where } from '../lib/localData';
import { getActivityMessageKey } from '../lib/activityDomain';
import { createProjectShareUrl, getProjectRoutePrefix } from '../lib/dashboardDomain';
import { createProjectActivityExport, createProjectParticipantExport, supportsParticipantExport } from '../lib/exportDomain';
import { formatDate } from '../lib/locale';
import { hasProjectPassword, unlockProjectAccess } from '../lib/apiClient';
import { createProjectInsightSummary, PROJECT_BRIEF_MAX_LENGTH, PROJECT_PASSWORD_MAX_LENGTH } from '../lib/projectDomain';
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

function downloadCsvExport(exportData) {
  const blob = new Blob([exportData.csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = exportData.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const normalizeProjectPasswordInput = (value) => String(value || '').slice(0, PROJECT_PASSWORD_MAX_LENGTH);

const PROJECT_WORKSPACE_DATA_COLLECTIONS = {
  vote: ['voting_items'],
  team: ['rooms'],
  roulette: ['roulette_participants'],
  queue: ['queue_participants'],
  gather: ['gather_fields', 'gather_submissions'],
  schedule: ['schedule_submissions'],
  book: ['booking_slots'],
  claim: ['claim_items'],
  game_hub: ['game_rooms'],
};

function ActivityTimeline({ activities, canExportActivities = false, onExportActivities = () => {}, loadError = false, onRetry = () => {}, t }) {
  const visibleActivities = (activities || []).slice(0, 8);

  return (
    <aside className="app-card p-4" aria-label={t('activityTimeline')}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-m3-on-surface">
          <Activity className="h-4 w-4 text-google-blue" />
          <span>{t('activityTimeline')}</span>
        </div>
        {canExportActivities && (
          <button
            type="button"
            onClick={onExportActivities}
            disabled={loadError}
            className="app-icon-button"
            title={t('exportActivities')}
            aria-label={t('exportActivities')}
          >
            <Download className="h-4 w-4" />
          </button>
        )}
      </div>
      {loadError && (
        <div role="alert" className="rounded-lg border border-google-red/30 bg-google-red/5 px-3 py-4 text-xs text-m3-on-surface-variant">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-google-red" />
            <div className="min-w-0 flex-1">
              <p>{t('projectActivitiesLoadFailed')}</p>
              <button type="button" onClick={onRetry} className="app-button-quiet mt-3 text-google-blue">
                <RotateCcw className="h-4 w-4" />
                {t('chatRetry')}
              </button>
            </div>
          </div>
        </div>
      )}
      {!loadError && visibleActivities.length === 0 ? (
        <div className="rounded-lg border border-dashed border-m3-outline-variant/40 px-3 py-4 text-center text-xs text-m3-on-surface-variant">
          {t('noActivities')}
        </div>
      ) : visibleActivities.length > 0 ? (
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
      ) : null}
    </aside>
  );
}

function ProjectBriefCard({ project, canEditBrief, onSave, t }) {
  const [isEditingBrief, setIsEditingBrief] = useState(false);
  const [briefDraft, setBriefDraft] = useState(project.brief || '');
  const [isSavingBrief, setIsSavingBrief] = useState(false);
  const briefText = String(project.brief || '').trim();
  const briefTooLong = briefDraft.length > PROJECT_BRIEF_MAX_LENGTH;

  useEffect(() => {
    setBriefDraft(project.brief || '');
    setIsEditingBrief(false);
    setIsSavingBrief(false);
  }, [project.id, project.brief]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canEditBrief || briefTooLong || isSavingBrief) return;
    setIsSavingBrief(true);
    try {
      const saved = await onSave(briefDraft);
      if (saved) setIsEditingBrief(false);
    } finally {
      setIsSavingBrief(false);
    }
  };

  return (
    <aside className="app-card p-4" aria-label={t('projectBrief')}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-m3-on-surface">
          <FileText className="h-4 w-4 text-google-green" />
          <span>{t('projectBrief')}</span>
        </div>
        {canEditBrief && !isEditingBrief && (
          <button type="button" onClick={() => setIsEditingBrief(true)} className="app-button-quiet px-3 py-1 text-xs">
            {t('editBrief')}
          </button>
        )}
      </div>

      {isEditingBrief ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={briefDraft}
            onChange={(event) => setBriefDraft(event.target.value)}
            className="app-input min-h-[132px] resize-y text-sm"
            aria-label={t('projectBrief')}
            aria-invalid={briefTooLong}
            disabled={isSavingBrief}
            maxLength={PROJECT_BRIEF_MAX_LENGTH + 1}
          />
          <div className="flex items-center justify-between gap-3">
            <span className={`text-xs ${briefTooLong ? 'text-google-red' : 'text-m3-on-surface-variant'}`}>
              {briefDraft.length}/{PROJECT_BRIEF_MAX_LENGTH}
            </span>
            <div className="flex gap-2">
              <button type="button" disabled={isSavingBrief} onClick={() => { setBriefDraft(project.brief || ''); setIsEditingBrief(false); }} className="app-button-quiet px-3 py-1 text-xs">
                {t('cancel')}
              </button>
              <button type="submit" disabled={briefTooLong || isSavingBrief} className="app-button-tonal px-3 py-1 text-xs">
                {isSavingBrief ? t('processing') : t('saveBrief')}
              </button>
            </div>
          </div>
          {briefTooLong && (
            <p role="alert" className="text-xs font-medium text-google-red">{t('briefTooLong')}</p>
          )}
        </form>
      ) : briefText ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-m3-on-surface">{briefText}</p>
      ) : (
        <div className="rounded-lg border border-dashed border-m3-outline-variant/40 px-3 py-4 text-center text-xs text-m3-on-surface-variant">
          {t('projectBriefEmpty')}
        </div>
      )}
    </aside>
  );
}

function ProjectInsightsCard({ projectInsightSummary, t }) {
  const statusChipClass = {
    archived: 'app-chip',
    finished: 'app-chip app-chip-red',
    paused: 'app-chip app-chip-yellow',
    activeStatus: 'app-chip app-chip-green',
  }[projectInsightSummary.statusKey] || 'app-chip';

  return (
    <aside className="app-card p-4" aria-label={t('projectInsights')}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-m3-on-surface">
          <ChartLine className="h-4 w-4 text-google-blue" />
          <span>{t('projectInsights')}</span>
        </div>
        <span className={`${statusChipClass} py-1 text-xs`}>{t(projectInsightSummary.statusKey)}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {projectInsightSummary.metrics.map((metric) => (
          <div key={metric.key} className="rounded-lg border border-m3-outline-variant/30 bg-m3-surface-container/35 px-3 py-2">
            <div className="text-[11px] font-medium uppercase text-m3-on-surface-variant">{t(metric.labelKey)}</div>
            <div className="mt-1 text-xl font-medium text-m3-on-surface">{metric.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-google-blue/20 bg-google-blue/5 px-3 py-2">
        <div className="text-[11px] font-medium uppercase text-google-blue">{t('projectInsightNextAction')}</div>
        <div className="mt-1 text-sm font-medium text-m3-on-surface">{t(projectInsightSummary.nextActionKey)}</div>
      </div>
    </aside>
  );
}

export default function ProjectDetail({ projects, projectsLoaded = false, user, isAdmin, items, rooms, rouletteData, queueData, gatherFields, gatherSubmissions, scheduleSubmissions, bookingSlots, claimItems, gameRooms = [], projectActivities, projectActivitiesLoadError = false, onRetryProjectActivities = () => {}, workspaceDataLoadErrors = {}, onRetryWorkspaceData = () => {}, actions, t }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { confirm, showToast } = useUI();
  
  const [unlockedProjectId, setUnlockedProjectId] = useState(() => (location.state?.unlockedProjectId === id ? id : null));
  const [inputPassword, setInputPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [isUnlockingProject, setIsUnlockingProject] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [manualProjectId, setManualProjectId] = useState('');
  const [pendingProjectAction, setPendingProjectAction] = useState(null);
  const pendingProjectActionRef = useRef(null);

  const project = projects.find(p => p.id === id);

  useEffect(() => {
    setManualProjectId('');
  }, [project?.id]);

  if (!project && !projectsLoaded) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-m3-on-surface-variant">
        <h2 className="text-xl mb-4">{t('loading')}</h2>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="app-card flex max-w-md flex-col items-center p-8 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-google-blue/10 text-google-blue">
            <Info className="h-7 w-7" />
          </div>
          <h2 className="mb-2 text-2xl font-medium text-m3-on-surface">{t('projectNotFound')}</h2>
          <p className="mb-6 text-sm text-m3-on-surface-variant">{t('projectNotFoundDesc')}</p>
          <button onClick={() => navigate('/')} className="app-button-tonal">{t('backToDash')}</button>
        </div>
      </div>
    );
  }

  const isLocallyUnlocked = unlockedProjectId === project.id;
  const isProjectLocked = hasProjectPassword(project) && !project.accessGranted && !isLocallyUnlocked;
  const handleUnlockProject = async (e) => {
    e.preventDefault();
    if (isUnlockingProject) return;
    setIsUnlockingProject(true);
    try {
      await unlockProjectAccess(project.id, inputPassword);
      setUnlockedProjectId(project.id);
      setPasswordError(false);
    } catch {
      setPasswordError(true);
    } finally {
      setIsUnlockingProject(false);
    }
  };

  // Password Guard
  if (isProjectLocked) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] animate-fade-in">
        <div className="app-card flex w-full max-w-sm flex-col items-center p-8">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-google-yellow/20">
              <Lock className="h-7 w-7 text-[#8a5a00]" />
            </div>
            <h3 className="text-2xl font-medium text-m3-on-surface mb-2">{t('lockTitle')}</h3>
            <p className="text-sm text-m3-on-surface-variant mb-6 text-center">{t('verifyAccess')}</p>
            
            <form onSubmit={handleUnlockProject} className="w-full">
              <div className="relative mb-2">
                <input
                  type="password" value={inputPassword}
                  onChange={e => { setInputPassword(normalizeProjectPasswordInput(e.target.value)); setPasswordError(false); }}
                  className="app-input"
                  placeholder={t('enterPassword')} autoFocus
                  disabled={isUnlockingProject}
                  maxLength={PROJECT_PASSWORD_MAX_LENGTH}
                  aria-invalid={passwordError}
                  aria-describedby={passwordError ? 'project-unlock-error' : undefined}
                />
              </div>
              {passwordError && <p id="project-unlock-error" role="alert" aria-live="assertive" className="text-google-red text-xs mb-6 ml-1">{t('incorrectPass')}</p>}
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" disabled={isUnlockingProject} onClick={() => navigate('/')} className="app-button-quiet">{t('cancel')}</button>
                <button type="submit" disabled={isUnlockingProject} className="app-button-primary">{isUnlockingProject ? t('processing') : t('unlock')}</button>
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
  const canEditBrief = hasAdminRights && !isArchived && !isStopped && !isFinished;
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
  const workspaceDataCollectionNames = PROJECT_WORKSPACE_DATA_COLLECTIONS[project.type] || [];
  const hasWorkspaceDataLoadError = workspaceDataCollectionNames.some((collectionName) => workspaceDataLoadErrors[collectionName]);
  const projectRoutePrefix = getProjectRoutePrefix(project.type);
  const projectShareUrl = createProjectShareUrl(typeof window === 'undefined' ? '' : window.location.href, project);
  const isProjectActionPending = Boolean(pendingProjectAction);
  const isDuplicateProjectPending = pendingProjectAction === 'duplicate';
  const isArchiveProjectPending = pendingProjectAction === 'archive' || pendingProjectAction === 'restore';
  const isStatusProjectPending = pendingProjectAction === 'pause' || pendingProjectAction === 'resume';
  const isDeleteProjectPending = pendingProjectAction === 'delete';
  
  const copyId = async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(project.id);
      setManualProjectId('');
      showToast(t('projectIdCopied'), 'success');
    } catch {
      if (project.id) {
        setManualProjectId(project.id);
        showToast(t('projectIdManualCopy'), 'info');
      } else {
        showToast(t('shareUnavailable'), 'error');
      }
    }
  };
  const runProjectAction = async (actionKey, actionLabel, action, fallbackResult = false) => {
    if (pendingProjectActionRef.current) return fallbackResult;

    pendingProjectActionRef.current = actionKey;
    setPendingProjectAction(actionKey);
    try {
      return await action();
    } catch (error) {
      console.error(error);
      showToast(t('actionFailed', { action: actionLabel, message: error?.message || t('failed') }), 'error');
      return fallbackResult;
    } finally {
      pendingProjectActionRef.current = null;
      setPendingProjectAction(null);
    }
  };
  const handleDuplicateProjectConfirm = async () => {
    const duplicatedProjectId = await runProjectAction(
      'duplicate',
      t('duplicateProject'),
      () => actions.handleDuplicateProject(project, t('copySuffix')),
      null,
    );
    if (duplicatedProjectId) navigate(`/${projectRoutePrefix}/${duplicatedProjectId}`);
  };
  const handleDuplicateProject = () => {
    if (pendingProjectActionRef.current) return;
    confirm({
      title: t('duplicateProject'),
      message: t('duplicateProjectConfirm'),
      confirmText: t('duplicate'),
      cancelText: t('cancel'),
      onConfirm: handleDuplicateProjectConfirm,
    });
  };
  const handleArchiveProjectConfirm = async (archived) => {
    const completed = await runProjectAction(
      archived ? 'archive' : 'restore',
      archived ? t('archiveProject') : t('restoreProject'),
      async () => {
        await actions.handleArchiveProject(project, archived);
        return true;
      },
    );
    if (completed && archived) navigate('/');
  };
  const handleArchiveProject = (archived) => {
    if (pendingProjectActionRef.current) return;
    confirm({
      title: archived ? t('archiveProject') : t('restoreProject'),
      message: archived ? t('archiveProjectConfirm') : t('restoreProjectConfirm'),
      confirmText: archived ? t('archive') : t('restore'),
      cancelText: t('cancel'),
      onConfirm: () => handleArchiveProjectConfirm(archived),
    });
  };
  const handleToggleProjectStatus = async () => {
    await runProjectAction(
      isStopped ? 'resume' : 'pause',
      isStopped ? t('resume') : t('pause'),
      async () => {
        await actions.handleToggleProjectStatus(project);
        return true;
      },
    );
  };
  const handleDeleteProjectConfirm = async () => {
    const deleted = await runProjectAction(
      'delete',
      t('deleteProject'),
      async () => {
        await actions.handleDeleteProject(project.id);
        return true;
      },
    );
    if (deleted) navigate('/');
  };
  const handleDeleteProject = () => {
    if (pendingProjectActionRef.current) return;
    confirm({
      title: t('deleteProject'),
      message: t('deleteConfirm'),
      confirmText: t('delete'),
      cancelText: t('cancel'),
      type: 'destructive',
      onConfirm: handleDeleteProjectConfirm,
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
  const projectGameRooms = (gameRooms || []).filter((room) => room.projectId === project.id);
  const projectActivityItems = (projectActivities || [])
    .filter((activity) => activity.projectId === project.id)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const projectInsightSummary = createProjectInsightSummary(project, {
    votingItems: projectItems,
    rooms: projectRooms,
    rouletteParticipants: projectRouletteData,
    queueParticipants: projectQueueData,
    gatherFields: projectGatherFields,
    gatherSubmissions: projectGatherSubmissions,
    scheduleSubmissions: projectScheduleSubmissions,
    bookingSlots: projectBookingSlots,
    claimItems: projectClaimItems,
    gameRooms: projectGameRooms,
    projectActivities: projectActivityItems,
  });

  const handleExportParticipants = async () => {
    try {
      let projectGameRooms = [];
      if (project.type === 'game_hub') {
        const snapshot = await getDocs(query(collection(db, 'game_rooms'), where('projectId', '==', project.id)));
        projectGameRooms = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      }

      const exportData = createProjectParticipantExport(project, {
        queueParticipants: projectQueueData,
        bookingSlots: projectBookingSlots,
        scheduleConfig: project.scheduleConfig,
        scheduleSubmissions: projectScheduleSubmissions,
        gatherFields: projectGatherFields,
        gatherSubmissions: projectGatherSubmissions,
        claimItems: projectClaimItems,
        gameRooms: projectGameRooms,
      }, t);

      if (!exportData) {
        showToast(t('noExportData'), 'info');
        return;
      }

      downloadCsvExport(exportData);
    } catch (error) {
      showToast(t('actionFailed', { action: t('exportParticipants'), message: error?.message || t('failed') }), 'error');
    }
  };

  const handleExportActivities = () => {
    try {
      const exportData = createProjectActivityExport(project, projectActivityItems, t);
      if (!exportData) {
        showToast(t('noActivityData'), 'info');
        return;
      }

      downloadCsvExport(exportData);
    } catch (error) {
      showToast(t('actionFailed', { action: t('exportActivities'), message: error?.message || t('failed') }), 'error');
    }
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
            {hasProjectPassword(project) && <div className="app-chip app-chip-yellow"><Key className="w-4 h-4" /></div>}
            {isArchived && <div className="app-chip"><Archive className="w-3 h-3" /> {t('archived')}</div>}
            {isStopped && <div className="app-chip"><Lock className="w-3 h-3" /> {t('paused')}</div>}
            {isFinished && <div className="app-chip app-chip-red"><Flag className="w-3 h-3" /> {t('finished')}</div>}
          </div>
          {manualProjectId && (
            <div role="alert" className="mt-4 max-w-xl rounded-2xl border border-google-blue/25 bg-google-blue/5 p-3 text-sm text-m3-on-surface-variant">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-m3-on-surface">{t('projectIdManualCopy')}</div>
                  <p className="mt-1">{t('projectIdManualCopyHint')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setManualProjectId('')}
                  className="app-icon-button h-10 min-h-10 w-10 shrink-0"
                  title={t('close')}
                  aria-label={t('close')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <input
                readOnly
                value={manualProjectId}
                onFocus={(event) => event.target.select()}
                className="app-input font-mono text-xs"
                aria-label={t('copyFullProjectId')}
              />
            </div>
          )}
        </div>
        
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center md:mt-0">
           <div className="flex gap-2">
             <button onClick={() => setShowQR(true)} className="app-icon-button border-m3-outline-variant/45" title={t('share')} aria-label={t('share')}>
                <QrCode className="w-5 h-5" />
             </button>
             <button onClick={() => setShowChat(!showChat)} className={`app-icon-button ${showChat ? 'border-transparent bg-m3-primary-container text-m3-on-primary-container hover:bg-m3-primary-container hover:text-m3-on-primary-container' : 'border-m3-outline-variant/45'}`} title={t('chat')} aria-label={t('chat')}>
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
               <button
                 onClick={handleDuplicateProject}
                 disabled={isProjectActionPending}
                 aria-busy={isDuplicateProjectPending}
                 className="app-button-quiet border border-m3-outline-variant/45"
                 title={isDuplicateProjectPending ? t('processing') : t('duplicate')}
               >
                 <Copy className="w-4 h-4" /> <span className="hidden lg:inline">{isDuplicateProjectPending ? t('processing') : t('duplicate')}</span>
               </button>
               <button
                 onClick={() => handleArchiveProject(!isArchived)}
                 disabled={isProjectActionPending}
                 aria-busy={isArchiveProjectPending}
                 className="app-button-quiet border border-m3-outline-variant/45"
                 title={isArchiveProjectPending ? t('processing') : (isArchived ? t('restore') : t('archive'))}
               >
                 {isArchived ? <RotateCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                 <span className="hidden lg:inline">{isArchiveProjectPending ? t('processing') : (isArchived ? t('restore') : t('archive'))}</span>
               </button>
               {!isArchived && !isFinished && (
                 <button
                   onClick={handleToggleProjectStatus}
                   disabled={isProjectActionPending}
                   aria-busy={isStatusProjectPending}
                   className={isStopped ? 'app-button-tonal' : 'app-button-quiet border border-m3-outline-variant/45'}
                 >
                   {isStatusProjectPending ? t('processing') : (isStopped ? t('resume') : t('pause'))}
                 </button>
               )}
               <button 
                 onClick={handleDeleteProject}
                 disabled={isProjectActionPending}
                 aria-busy={isDeleteProjectPending}
                 className={isFinished ? 'app-button bg-google-red text-white hover:shadow-elevation-1' : 'app-button-danger'}
                 title={isDeleteProjectPending ? t('processing') : t('delete')}
               >
                 <Trash2 className="w-4 h-4" /> <span className={isFinished ? '' : 'hidden lg:inline'}>{isDeleteProjectPending ? t('processing') : (isFinished ? t('deleteProject') : t('delete'))}</span>
               </button>
             </div>
           )}
        </div>
      </div>

      {showQR && <QRCodeShare url={projectShareUrl} title={project.title} onClose={() => setShowQR(false)} t={t} />}

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        <div className="flex-1 w-full min-w-0 space-y-6">
          {hasWorkspaceDataLoadError ? (
            <div role="alert" className="app-card flex flex-col gap-4 p-5">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-google-red" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-m3-on-surface">{t('workspaceDataLoadFailed')}</p>
                  <button type="button" onClick={onRetryWorkspaceData} className="app-button-quiet mt-3 text-google-blue">
                    <RotateCcw className="h-4 w-4" />
                    {t('chatRetry')}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {project.type === 'vote' && <VotingView user={user} isAdmin={isAdmin} items={projectItems} isStopped={isStopped || isFinished} onAdd={(title, name) => actions.handleAddItem(title, project.id, name)} onDelete={actions.handleDeleteItem} onVote={(item) => actions.handleVote(item, project.votingConfig)} votingConfig={project.votingConfig} onUpdateVotingConfig={actions.handleUpdateVotingConfig} isProjectOwner={isOwner} projectId={project.id} t={t} />}
              {project.type === 'team' && <TeamView user={user} isAdmin={isAdmin} rooms={projectRooms} isStopped={isStopped || isFinished} onCreate={(name, max, cName) => actions.handleCreateRoom(name, max, project.id, cName)} onJoin={actions.handleJoinRoom} onKick={actions.handleKickMember} onDelete={actions.handleDeleteRoom} projectId={project.id} t={t} />}
              {project.type === 'roulette' && <RouletteView key={project.id} user={user} isAdmin={isAdmin} project={project} participants={projectRouletteData} isStopped={isStopped} isFinished={isFinished} isOwner={isOwner} actions={actions} t={t} />}
              {project.type === 'queue' && <QueueView user={user} isAdmin={isAdmin} project={project} participants={projectQueueData} isStopped={isStopped} isFinished={isFinished} isOwner={isOwner} actions={actions} t={t} />}
              {project.type === 'gather' && <GatherView user={user} isAdmin={isAdmin} project={project} fields={projectGatherFields} submissions={projectGatherSubmissions} isStopped={isStopped || isFinished} isOwner={isOwner} actions={actions} t={t} />}
              {project.type === 'schedule' && <ScheduleView user={user} isAdmin={isAdmin} project={project} submissions={projectScheduleSubmissions} isStopped={isStopped || isFinished} isOwner={isOwner} actions={actions} t={t} />}
              {project.type === 'book' && <BookingView user={user} isAdmin={isAdmin} project={project} slots={projectBookingSlots} isStopped={isStopped || isFinished} isOwner={isOwner} actions={actions} t={t} />}
              {project.type === 'claim' && <ClaimView user={user} isAdmin={isAdmin} project={project} items={projectClaimItems} isStopped={isStopped || isFinished} isOwner={isOwner} actions={actions} t={t} />}
              {project.type === 'game_hub' && <GameHubView project={project} user={user} isStopped={isStopped || isFinished} t={t} />}
              {project.type === 'project' && (
                <div className="app-card flex flex-col items-center justify-center p-12">
                    <div className="w-16 h-16 rounded-full bg-google-green/20 flex items-center justify-center mb-4 text-google-green">
                        <Info className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl text-m3-on-surface mb-2">{t('project')}</h3>
                    <p className="text-m3-on-surface-variant">{t('projectView')}</p>
                </div>
              )}
            </>
          )}
        </div>
        
        <div className="w-full space-y-4 xl:sticky xl:top-24 xl:w-96 self-start">
          <ProjectInsightsCard projectInsightSummary={projectInsightSummary} t={t} />
          <ProjectBriefCard
            project={project}
            canEditBrief={canEditBrief}
            onSave={async (brief) => {
              const saved = await actions.handleUpdateProjectBrief(project, brief);
              if (saved) showToast(t('briefUpdated'), 'success');
              return saved;
            }}
            t={t}
          />
          <ActivityTimeline
            activities={projectActivityItems}
            canExportActivities={hasAdminRights}
            onExportActivities={handleExportActivities}
            loadError={projectActivitiesLoadError}
            onRetry={onRetryProjectActivities}
            t={t}
          />
          {showChat && (
             <div className="animate-fade-in">
                 <ChatRoom projectId={project.id} currentUser={user} isStopped={isStopped || isFinished} t={t} />
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
