import React, { useEffect, useRef, useState } from 'react';
import { Shield, Database, Trash2, Flag, Plus, AlertTriangle } from './Icons';
import { collection, addDoc, deleteDoc, doc, getDocs, updateDoc, db } from '../lib/localData';
import {
  ANNOUNCEMENT_CONTENT_MAX_LENGTH,
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
  ANNOUNCEMENT_TYPES,
  isAnnouncementVisible,
  normalizeAnnouncementCreateData,
  normalizeAnnouncementUpdateData,
} from '../lib/announcementDomain';
import { createProjectOrphanCleanupPlan } from '../lib/projectDomain';
import { formatDate } from '../lib/locale';
import { useUI } from './UIContext';

const ADMIN_ORPHAN_REMOTE_COLLECTIONS = ['project_chats', 'game_rooms', 'notifications', 'project_activities'];
const EMPTY_ANNOUNCEMENT_FORM = {
  title: '',
  content: '',
  type: 'info',
  active: true,
  startsAt: '',
  endsAt: '',
};

async function readAnnouncements() {
  const snapshot = await getDocs(collection(db, 'announcements'));
  return snapshot.docs
    .map((entry) => ({ id: entry.id, ...entry.data() }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

async function readAnnouncementsSnapshot() {
  return {
    docs: await readAnnouncements(),
    timestamp: Date.now(),
  };
}

function timestampFromDateTimeLocal(value) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

function createAnnouncementFormData(form, now = Date.now()) {
  return normalizeAnnouncementCreateData({
    ...form,
    startsAt: timestampFromDateTimeLocal(form.startsAt),
    endsAt: timestampFromDateTimeLocal(form.endsAt),
    createdAt: now,
  });
}

export default function AdminDashboard({ projects, items, rooms, rouletteParticipants, queueParticipants, gatherFields, gatherSubmissions, scheduleSubmissions, bookingSlots, claimItems, onDeleteProject, onClose, t }) {
  const { confirm, showToast } = useUI();
  const [remoteProjectDocs, setRemoteProjectDocs] = useState({});
  const [announcements, setAnnouncements] = useState([]);
  const [announcementNow, setAnnouncementNow] = useState(null);
  const [announcementForm, setAnnouncementForm] = useState(EMPTY_ANNOUNCEMENT_FORM);
  const [isCreatingAnnouncement, setIsCreatingAnnouncement] = useState(false);
  const isCreatingAnnouncementRef = useRef(false);
  const [pendingAnnouncementActionKeys, setPendingAnnouncementActionKeys] = useState([]);
  const pendingAnnouncementActionKeysRef = useRef(new Set());
  const [pendingAdminActionKeys, setPendingAdminActionKeys] = useState([]);
  const pendingAdminActionKeysRef = useRef(new Set());

  useEffect(() => {
    let active = true;
    const loadAdminOnlyOrphanCollections = async () => {
      try {
        const entries = await Promise.all(ADMIN_ORPHAN_REMOTE_COLLECTIONS.map(async (collectionName) => {
          const snapshot = await getDocs(collection(db, collectionName));
          return [collectionName, snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))];
        }));
        const announcementSnapshot = await readAnnouncementsSnapshot();
        if (active) {
          setRemoteProjectDocs(Object.fromEntries(entries));
          setAnnouncements(announcementSnapshot.docs);
          setAnnouncementNow(announcementSnapshot.timestamp);
        }
      } catch (error) {
        console.error('Error loading admin orphan collections', error);
      }
    };

    void loadAdminOnlyOrphanCollections();
    return () => {
      active = false;
    };
  }, []);

  const docsByCollection = {
    projects,
    voting_items: items,
    rooms,
    roulette_participants: rouletteParticipants,
    queue_participants: queueParticipants || [],
    gather_fields: gatherFields || [],
    gather_submissions: gatherSubmissions || [],
    schedule_submissions: scheduleSubmissions || [],
    booking_slots: bookingSlots || [],
    claim_items: claimItems || [],
    ...remoteProjectDocs,
  };
  const orphanPlan = createProjectOrphanCleanupPlan(projects, docsByCollection);
  const orphans = {
    items: orphanPlan.collections.voting_items || [],
    rooms: orphanPlan.collections.rooms || [],
    participants: orphanPlan.collections.roulette_participants || [],
    queue: orphanPlan.collections.queue_participants || [],
    fields: orphanPlan.collections.gather_fields || [],
    submissions: orphanPlan.collections.gather_submissions || [],
    schedules: orphanPlan.collections.schedule_submissions || [],
    booking: orphanPlan.collections.booking_slots || [],
    claims: orphanPlan.collections.claim_items || [],
    chats: orphanPlan.collections.project_chats || [],
    games: orphanPlan.collections.game_rooms || [],
    notifications: orphanPlan.collections.notifications || [],
    activities: orphanPlan.collections.project_activities || [],
  };

  const hasOrphans = orphanPlan.operations.length > 0;
  const isCleaningOrphans = pendingAdminActionKeys.includes('clean-orphans');
  const updateAnnouncementForm = (patch) => setAnnouncementForm((current) => ({ ...current, ...patch }));

  const refreshAnnouncements = async () => {
    const announcementSnapshot = await readAnnouncementsSnapshot();
    setAnnouncements(announcementSnapshot.docs);
    setAnnouncementNow(announcementSnapshot.timestamp);
  };

  const handleCreateAnnouncement = async (event) => {
    event.preventDefault();
    if (isCreatingAnnouncementRef.current) return;

    const data = createAnnouncementFormData(announcementForm);
    if (!data) {
      showToast(t('announcementInvalid'), 'error');
      return;
    }

    isCreatingAnnouncementRef.current = true;
    setIsCreatingAnnouncement(true);
    try {
      await addDoc(collection(db, 'announcements'), data);
      setAnnouncementForm(EMPTY_ANNOUNCEMENT_FORM);
      await refreshAnnouncements();
      showToast(t('announcementCreated'), 'success');
    } catch (error) {
      showToast(t('errorWithMessage', { title: t('createAnnouncement'), message: error.message }), 'error');
    } finally {
      isCreatingAnnouncementRef.current = false;
      setIsCreatingAnnouncement(false);
    }
  };

  const runAnnouncementAction = async (actionKey, actionLabel, action) => {
    if (pendingAnnouncementActionKeysRef.current.has(actionKey)) return;

    pendingAnnouncementActionKeysRef.current.add(actionKey);
    setPendingAnnouncementActionKeys([...pendingAnnouncementActionKeysRef.current]);
    try {
      await action();
    } catch (error) {
      showToast(t('errorWithMessage', { title: actionLabel, message: error?.message || t('failed') }), 'error');
    } finally {
      pendingAnnouncementActionKeysRef.current.delete(actionKey);
      setPendingAnnouncementActionKeys([...pendingAnnouncementActionKeysRef.current]);
    }
  };

  const toggleAnnouncement = async (announcement) => {
    const patch = normalizeAnnouncementUpdateData({ active: !announcement.active }, announcement);
    if (!patch) return;
    await runAnnouncementAction(`toggle:${announcement.id}`, t(announcement.active ? 'unpublishAnnouncement' : 'publishAnnouncement'), async () => {
      await updateDoc(doc(db, 'announcements', announcement.id), patch);
      await refreshAnnouncements();
      showToast(t('announcementUpdated'), 'success');
    });
  };

  const handleDeleteAnnouncementConfirm = async (announcement) => {
    await runAnnouncementAction(`delete:${announcement.id}`, t('delete'), async () => {
      await deleteDoc(doc(db, 'announcements', announcement.id));
      await refreshAnnouncements();
      showToast(t('announcementDeleted'), 'success');
    });
  };

  const deleteAnnouncement = (announcement) => {
    confirm({
      title: t('delete'),
      message: t('announcementDeleteConfirm', { title: announcement.title }),
      confirmText: t('delete'),
      cancelText: t('cancel'),
      type: 'destructive',
      onConfirm: () => handleDeleteAnnouncementConfirm(announcement),
    });
  };

  const runAdminAction = async (actionKey, actionLabel, action) => {
    if (pendingAdminActionKeysRef.current.has(actionKey)) return;

    pendingAdminActionKeysRef.current.add(actionKey);
    setPendingAdminActionKeys([...pendingAdminActionKeysRef.current]);
    try {
      await action();
    } catch (error) {
      showToast(t('errorWithMessage', { title: actionLabel, message: error?.message || t('failed') }), 'error');
    } finally {
      pendingAdminActionKeysRef.current.delete(actionKey);
      setPendingAdminActionKeys([...pendingAdminActionKeysRef.current]);
    }
  };

  const handleCleanOrphansConfirm = async () => {
    await runAdminAction('clean-orphans', t('cleanOrphans'), async () => {
      const promises = orphanPlan.operations.map((operation) => deleteDoc(doc(db, operation.collection, operation.id)));
      await Promise.all(promises);
      setRemoteProjectDocs((current) => {
        const deletedRemoteIds = new Map();
        orphanPlan.operations
          .filter((operation) => ADMIN_ORPHAN_REMOTE_COLLECTIONS.includes(operation.collection))
          .forEach((operation) => {
            const ids = deletedRemoteIds.get(operation.collection) || new Set();
            ids.add(operation.id);
            deletedRemoteIds.set(operation.collection, ids);
          });

        return Object.fromEntries(Object.entries(current).map(([collectionName, docs]) => [
          collectionName,
          (docs || []).filter((entry) => !deletedRemoteIds.get(collectionName)?.has(entry.id)),
        ]));
      });
      showToast(t('orphanSuccess'), 'success');
    });
  };

  const cleanOrphans = async () => {
    if (pendingAdminActionKeysRef.current.has('clean-orphans')) return;
    confirm({
      title: t('cleanOrphans'),
      message: `${t('orphanConfirm', { items: orphans.items.length, rooms: orphans.rooms.length, participants: orphans.participants.length })}\n${t('orphanExtraCounts', { fields: orphans.fields.length, submissions: orphans.submissions.length, schedules: orphans.schedules.length, booking: orphans.booking.length, claims: orphans.claims.length, queue: orphans.queue.length })}\n${t('orphanSystemCounts', { chats: orphans.chats.length, games: orphans.games.length, notifications: orphans.notifications.length, activities: orphans.activities.length })}`,
      confirmText: t('delete'),
      cancelText: t('cancel'),
      type: 'destructive',
      onConfirm: handleCleanOrphansConfirm,
    });
  };

  const handleDeleteProjectConfirm = async (project) => {
    await runAdminAction(`delete-project:${project.id}`, t('forceDelete'), async () => {
      await onDeleteProject(project.id);
      showToast(t('projectDeleted'), 'success');
    });
  };

  const deleteProject = async (project) => {
    if (!project?.id || typeof onDeleteProject !== 'function') return;
    if (pendingAdminActionKeysRef.current.has(`delete-project:${project.id}`)) return;
    confirm({
      title: t('deleteProject'),
      message: t('projectDeleteConfirm', { title: project.title, id: project.id }),
      confirmText: t('delete'),
      cancelText: t('cancel'),
      type: 'destructive',
      onConfirm: () => handleDeleteProjectConfirm(project),
    });
  }

  return (
    <div className="animate-fade-in pb-20">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-medium text-m3-on-surface flex items-center gap-3">
          <Shield className="w-8 h-8 text-google-blue" />
          {t('adminTitle')}
        </h1>
        <button onClick={onClose} className="app-button-quiet text-google-blue">{t('exitAdmin')}</button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="app-card p-4">
          <div className="text-m3-on-surface-variant text-xs uppercase mb-1">{t('totalProjects')}</div>
          <div className="text-3xl font-medium">{projects.length}</div>
        </div>
        <div className="app-card p-4">
          <div className="text-m3-on-surface-variant text-xs uppercase mb-1">{t('items')}</div>
          <div className="text-3xl font-medium">{items.length}</div>
        </div>
        <div className="app-card p-4">
          <div className="text-m3-on-surface-variant text-xs uppercase mb-1">{t('teams')}</div>
          <div className="text-3xl font-medium">{rooms.length}</div>
        </div>
        <div className="app-card p-4">
          <div className="text-m3-on-surface-variant text-xs uppercase mb-1">{t('participants')}</div>
          <div className="text-3xl font-medium">{rouletteParticipants.length}</div>
        </div>
      </div>

      <section className="app-card mb-8 p-5 sm:p-6" aria-label={t('announcements')}>
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-medium text-m3-on-surface">
              <Flag className="h-5 w-5 text-google-yellow" />
              {t('announcements')}
            </h2>
            <p className="mt-1 text-sm text-m3-on-surface-variant">{t('announcementAdminDesc')}</p>
          </div>
          <span className="app-chip app-chip-blue">{announcements.length}</span>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
          <form onSubmit={handleCreateAnnouncement} className="grid gap-3" aria-busy={isCreatingAnnouncement}>
            <div>
              <label htmlFor="announcement-title" className="app-label">{t('announcementTitle')}</label>
              <input
                id="announcement-title"
                type="text"
                value={announcementForm.title}
                onChange={(event) => updateAnnouncementForm({ title: event.target.value })}
                className="app-input"
                maxLength={ANNOUNCEMENT_TITLE_MAX_LENGTH}
                disabled={isCreatingAnnouncement}
              />
            </div>
            <div>
              <label htmlFor="announcement-content" className="app-label">{t('announcementContent')}</label>
              <textarea
                id="announcement-content"
                value={announcementForm.content}
                onChange={(event) => updateAnnouncementForm({ content: event.target.value })}
                className="app-input min-h-[104px] resize-y"
                maxLength={ANNOUNCEMENT_CONTENT_MAX_LENGTH}
                disabled={isCreatingAnnouncement}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="announcement-type" className="app-label">{t('announcementType')}</label>
                <select
                  id="announcement-type"
                  value={announcementForm.type}
                  onChange={(event) => updateAnnouncementForm({ type: event.target.value })}
                  className="app-input"
                  disabled={isCreatingAnnouncement}
                >
                  {ANNOUNCEMENT_TYPES.map((type) => (
                    <option key={type} value={type}>{t(type === 'warning' ? 'announcementTypeWarning' : 'announcementTypeInfo')}</option>
                  ))}
                </select>
              </div>
              <label className="flex min-h-11 items-center gap-2 self-end rounded-xl border border-m3-outline-variant/45 px-3 text-sm text-m3-on-surface">
                <input
                  type="checkbox"
                  checked={announcementForm.active}
                  onChange={(event) => updateAnnouncementForm({ active: event.target.checked })}
                  className="h-4 w-4 accent-google-blue"
                  disabled={isCreatingAnnouncement}
                />
                {t('activeAnnouncement')}
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="announcement-starts" className="app-label">{t('announcementStartsAt')}</label>
                <input
                  id="announcement-starts"
                  type="datetime-local"
                  value={announcementForm.startsAt}
                  onChange={(event) => updateAnnouncementForm({ startsAt: event.target.value })}
                  className="app-input"
                  disabled={isCreatingAnnouncement}
                />
              </div>
              <div>
                <label htmlFor="announcement-ends" className="app-label">{t('announcementEndsAt')}</label>
                <input
                  id="announcement-ends"
                  type="datetime-local"
                  value={announcementForm.endsAt}
                  onChange={(event) => updateAnnouncementForm({ endsAt: event.target.value })}
                  className="app-input"
                  disabled={isCreatingAnnouncement}
                />
              </div>
            </div>
            <button type="submit" disabled={isCreatingAnnouncement} className="app-button-primary justify-center">
              <Plus className="h-4 w-4" />
              {isCreatingAnnouncement ? t('processing') : t('createAnnouncement')}
            </button>
          </form>

          <div className="min-h-[220px] overflow-hidden rounded-xl border border-m3-outline-variant/35">
            {announcements.length === 0 ? (
              <div className="flex h-full min-h-[220px] items-center justify-center p-6 text-center text-sm text-m3-on-surface-variant">
                {t('noAnnouncements')}
              </div>
            ) : (
              <div className="max-h-[380px] divide-y divide-m3-outline-variant/20 overflow-y-auto">
                {announcements.map((announcement) => {
                  const visibleNow = announcementNow !== null && isAnnouncementVisible(announcement, announcementNow);
                  const isToggleAnnouncementPending = pendingAnnouncementActionKeys.includes(`toggle:${announcement.id}`);
                  const isDeleteAnnouncementPending = pendingAnnouncementActionKeys.includes(`delete:${announcement.id}`);
                  const isAnnouncementRowPending = isToggleAnnouncementPending || isDeleteAnnouncementPending;
                  const statusKey = !announcement.active
                    ? 'announcementInactive'
                    : visibleNow
                      ? 'announcementVisible'
                      : announcementNow !== null && announcement.startsAt && announcementNow < announcement.startsAt
                        ? 'announcementScheduled'
                        : 'announcementExpired';
                  return (
                    <div key={announcement.id} className="p-4">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {announcement.type === 'warning' && <AlertTriangle className="h-4 w-4 shrink-0 text-google-red" />}
                            <h3 className="truncate text-sm font-medium text-m3-on-surface">{announcement.title}</h3>
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-m3-on-surface-variant">{announcement.content}</p>
                        </div>
                        <span className={`app-chip shrink-0 py-0.5 ${visibleNow ? 'app-chip-green' : 'bg-m3-on-surface/10 text-m3-on-surface-variant'}`}>
                          {t(statusKey)}
                        </span>
                      </div>
                      <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-m3-on-surface-variant">
                        <span>{t(announcement.type === 'warning' ? 'announcementTypeWarning' : 'announcementTypeInfo')}</span>
                        {announcement.startsAt ? <span>{t('announcementStartsAt')}: {formatDate(announcement.startsAt, t)}</span> : null}
                        {announcement.endsAt ? <span>{t('announcementEndsAt')}: {formatDate(announcement.endsAt, t)}</span> : null}
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => toggleAnnouncement(announcement)}
                          disabled={isAnnouncementRowPending}
                          aria-busy={isToggleAnnouncementPending}
                          className="app-button-quiet px-3 text-xs text-google-blue"
                        >
                          {isToggleAnnouncementPending ? t('processing') : t(announcement.active ? 'unpublishAnnouncement' : 'publishAnnouncement')}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteAnnouncement(announcement)}
                          disabled={isAnnouncementRowPending}
                          aria-busy={isDeleteAnnouncementPending}
                          className="app-icon-button hover:bg-google-red/10 hover:text-google-red"
                          title={isDeleteAnnouncementPending ? t('processing') : t('delete')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Cleanup Section */}
      <div className="app-card relative mb-8 overflow-hidden border-google-red/20 p-6">
        <div className="flex flex-col md:flex-row justify-between items-center z-10 relative gap-4">
          <div>
            <h2 className="text-xl font-medium text-m3-on-surface flex items-center gap-2">
              <Database className="w-5 h-5 text-google-red" />
              {t('cleanOrphans')}
            </h2>
            <p className="text-sm text-m3-on-surface-variant mt-1">
              {t('orphanDetected', { items: orphans.items.length, rooms: orphans.rooms.length, participants: orphans.participants.length })}
              <br /><span className="text-xs opacity-70">{t('orphanExtraCounts', { fields: orphans.fields.length, submissions: orphans.submissions.length, schedules: orphans.schedules.length, booking: orphans.booking.length, claims: orphans.claims.length, queue: orphans.queue.length })}</span>
              <br /><span className="text-xs opacity-70">{t('orphanSystemCounts', { chats: orphans.chats.length, games: orphans.games.length, notifications: orphans.notifications.length, activities: orphans.activities.length })}</span>
              <br /><span className="text-xs opacity-70">{t('orphanNote')}</span>
            </p>
          </div>
          <button
            onClick={cleanOrphans}
            disabled={!hasOrphans || isCleaningOrphans}
            aria-busy={isCleaningOrphans}
            className={`app-button whitespace-nowrap ${hasOrphans ? 'bg-google-red text-white hover:shadow-elevation-2' : 'bg-m3-on-surface/10 text-m3-on-surface-variant'}`}
          >
            <Trash2 className="w-4 h-4" />
            {isCleaningOrphans ? t('processing') : t('cleanOrphans')}
          </button>
        </div>
      </div>

      {/* Project List */}
      <div className="app-card overflow-hidden">
        <div className="p-4 border-b border-m3-outline-variant/50 font-medium bg-m3-surface-container-high/50 flex justify-between items-center">
          <span>{t('allProjectsManager')} ({projects.length})</span>
          <span className="text-xs text-m3-on-surface-variant font-normal">{t('sortedByDate')}</span>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {projects.map(p => {
            const isProjectDeletePending = pendingAdminActionKeys.includes(`delete-project:${p.id}`);
            return (
              <div key={p.id} className="group flex items-center justify-between border-b border-m3-outline-variant/10 p-4 hover:bg-m3-on-surface/5">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                        ${p.type === 'vote' ? 'bg-google-blue/10 text-google-blue' : p.type === 'team' ? 'bg-google-red/10 text-google-red' : 'bg-google-yellow/10 text-google-yellow'}`}>
                    {p.type[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium text-m3-on-surface group-hover:text-google-blue transition-colors">{p.title}</div>
                    <div className="text-xs text-m3-on-surface-variant font-mono flex gap-2">
                      <span>ID: {p.id}</span>
                      <span>•</span>
                      <span>{formatDate(p.createdAt, t)}</span>
                      <span>•</span>
                      <span>{t('creators')}: {p.creatorName}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`app-chip py-0.5 ${p.status === 'active' ? 'app-chip-green' : 'bg-m3-on-surface/10 text-m3-on-surface-variant'}`}>
                    {p.status === 'active' ? t('activeStatus') : p.status === 'stopped' ? t('paused') : p.status === 'finished' ? t('finished') : p.status}
                  </span>
                  <button
                    onClick={() => deleteProject(p)}
                    disabled={isProjectDeletePending}
                    aria-busy={isProjectDeletePending}
                    className="app-icon-button hover:bg-google-red/10 hover:text-google-red"
                    title={isProjectDeletePending ? t('processing') : t('forceDelete')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
          {projects.length === 0 && <div className="p-8 text-center text-m3-on-surface-variant/50">{t('dbEmpty')}</div>}
        </div>
      </div>
    </div>
  );
}
