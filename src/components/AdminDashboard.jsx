import React, { useEffect, useState } from 'react';
import { Shield, Database, Trash2 } from './Icons';
import { collection, deleteDoc, doc, getDocs, db } from '../lib/localData';
import { createProjectOrphanCleanupPlan } from '../lib/projectDomain';
import { formatDate } from '../lib/locale';
import { useUI } from './UIContext';

const ADMIN_ORPHAN_REMOTE_COLLECTIONS = ['project_chats', 'game_rooms', 'notifications', 'project_activities'];

export default function AdminDashboard({ projects, items, rooms, rouletteParticipants, queueParticipants, gatherFields, gatherSubmissions, scheduleSubmissions, bookingSlots, claimItems, onDeleteProject, onClose, t }) {
  const { confirm, showToast } = useUI();
  const [remoteProjectDocs, setRemoteProjectDocs] = useState({});

  useEffect(() => {
    let active = true;
    const loadAdminOnlyOrphanCollections = async () => {
      try {
        const entries = await Promise.all(ADMIN_ORPHAN_REMOTE_COLLECTIONS.map(async (collectionName) => {
          const snapshot = await getDocs(collection(db, collectionName));
          return [collectionName, snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))];
        }));
        if (active) setRemoteProjectDocs(Object.fromEntries(entries));
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

  const cleanOrphans = async () => {
    confirm({
      title: t('cleanOrphans'),
      message: `${t('orphanConfirm', { items: orphans.items.length, rooms: orphans.rooms.length, participants: orphans.participants.length })}\n${t('orphanExtraCounts', { fields: orphans.fields.length, submissions: orphans.submissions.length, schedules: orphans.schedules.length, booking: orphans.booking.length, claims: orphans.claims.length, queue: orphans.queue.length })}\n${t('orphanSystemCounts', { chats: orphans.chats.length, games: orphans.games.length, notifications: orphans.notifications.length, activities: orphans.activities.length })}`,
      confirmText: t('delete'),
      cancelText: t('cancel'),
      type: 'destructive',
      onConfirm: async () => {
        try {
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
        } catch (e) {
          showToast(t('orphanError') + e.message, 'error');
        }
      }
    });
  };

  const deleteProject = async (project) => {
    if (!project?.id || typeof onDeleteProject !== 'function') return;
    confirm({
      title: t('deleteProject'),
      message: t('projectDeleteConfirm', { title: project.title, id: project.id }),
      confirmText: t('delete'),
      cancelText: t('cancel'),
      type: 'destructive',
      onConfirm: async () => {
        await onDeleteProject(project.id);
      }
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
            disabled={!hasOrphans}
            className={`app-button whitespace-nowrap ${hasOrphans ? 'bg-google-red text-white hover:shadow-elevation-2' : 'bg-m3-on-surface/10 text-m3-on-surface-variant'}`}
          >
            <Trash2 className="w-4 h-4" />
            {t('cleanOrphans')}
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
          {projects.map(p => (
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
                <button onClick={() => deleteProject(p)} className="app-icon-button hover:bg-google-red/10 hover:text-google-red" title={t('forceDelete')}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {projects.length === 0 && <div className="p-8 text-center text-m3-on-surface-variant/50">{t('dbEmpty')}</div>}
        </div>
      </div>
    </div>
  );
}
