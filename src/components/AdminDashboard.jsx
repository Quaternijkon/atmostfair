import React from 'react';
import { Shield, Database, Trash2 } from './Icons';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useUI } from './UIComponents';

export default function AdminDashboard({ projects, items, rooms, rouletteParticipants, queueParticipants, gatherFields, gatherSubmissions, claimItems, onClose, t }) {
  const { confirm, showToast } = useUI();
  // Logic to find orphans
  const projectIds = new Set(projects.map(p => p.id));
  const orphans = {
    items: items.filter(i => !projectIds.has(i.projectId)),
    rooms: rooms.filter(r => !projectIds.has(r.projectId)),
    participants: rouletteParticipants.filter(p => !projectIds.has(p.projectId)),
    queue: (queueParticipants || []).filter(p => !projectIds.has(p.projectId)),
    fields: (gatherFields || []).filter(f => !projectIds.has(f.projectId)),
    submissions: (gatherSubmissions || []).filter(s => !projectIds.has(s.projectId)),
    claims: (claimItems || []).filter(c => !projectIds.has(c.projectId))
  };

  const hasOrphans = Object.values(orphans).some(arr => arr.length > 0);

  const cleanOrphans = async () => {
    const counts = `
      ${orphans.items.length} Votes
      ${orphans.rooms.length} Rooms
      ${orphans.participants.length} Roulette
      ${orphans.queue.length} Queue
      ${orphans.fields.length} Forms
      ${orphans.submissions.length} Submissions
      ${orphans.claims.length} Tasks
    `;
    
    confirm({
      title: t('cleanOrphans') || 'Clean Orphans', 
      message: t('orphanConfirm').replace('{items}', orphans.items.length).replace('{rooms}', orphans.rooms.length).replace('{participants}', orphans.participants.length) + ` (+ ${orphans.fields.length} fields, ${orphans.submissions.length} subs, ${orphans.claims.length} tasks, ${orphans.queue.length} queue)`,
      confirmText: t('delete'),
      cancelText: t('cancel'),
      type: 'destructive',
      onConfirm: async () => {
        try {
          const promises = [
              ...orphans.items.map(item => deleteDoc(doc(db, 'voting_items', item.id))),
              ...orphans.rooms.map(room => deleteDoc(doc(db, 'rooms', room.id))),
              ...orphans.participants.map(p => deleteDoc(doc(db, 'roulette_participants', p.id))),
              ...orphans.queue.map(p => deleteDoc(doc(db, 'queue_participants', p.id))),
              ...orphans.fields.map(f => deleteDoc(doc(db, 'gather_fields', f.id))),
              ...orphans.submissions.map(s => deleteDoc(doc(db, 'gather_submissions', s.id))),
              ...orphans.claims.map(c => deleteDoc(doc(db, 'claim_items', c.id)))
          ];
          await Promise.all(promises);
          showToast(t('orphanSuccess'), 'success');
        } catch (e) {
          showToast(t('orphanError') + e.message, 'error');
        }
      }
    });
  };

  const deleteProject = async (project) => {
    confirm({
      title: t('deleteProject'),
      message: t('projectDeleteConfirm', { title: project.title, id: project.id }),
      confirmText: t('delete'),
      cancelText: t('cancel'),
      type: 'destructive',
      onConfirm: async () => {
        await deleteDoc(doc(db, 'projects', project.id));
      }
    });
  }

  return (
    <div className="animate-fade-in pb-20">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-normal text-m3-on-surface flex items-center gap-3">
          <Shield className="w-8 h-8 text-google-blue" />
          {t('adminTitle')}
        </h1>
        <button onClick={onClose} className="text-sm font-medium text-google-blue hover:underline">{t('exitAdmin')}</button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-m3-surface-container p-4 rounded-xl">
          <div className="text-m3-on-surface-variant text-xs uppercase mb-1">{t('totalProjects')}</div>
          <div className="text-3xl font-normal">{projects.length}</div>
        </div>
        <div className="bg-m3-surface-container p-4 rounded-xl">
          <div className="text-m3-on-surface-variant text-xs uppercase mb-1">{t('items')}</div>
          <div className="text-3xl font-normal">{items.length}</div>
        </div>
        <div className="bg-m3-surface-container p-4 rounded-xl">
          <div className="text-m3-on-surface-variant text-xs uppercase mb-1">{t('teams')}</div>
          <div className="text-3xl font-normal">{rooms.length}</div>
        </div>
        <div className="bg-m3-surface-container p-4 rounded-xl">
          <div className="text-m3-on-surface-variant text-xs uppercase mb-1">{t('participants')}</div>
          <div className="text-3xl font-normal">{rouletteParticipants.length}</div>
        </div>
      </div>

      {/* Cleanup Section */}
      <div className="bg-m3-surface-container-high rounded-[24px] p-6 mb-8 border border-google-red/20 relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between items-center z-10 relative gap-4">
          <div>
            <h2 className="text-xl font-medium text-m3-on-surface flex items-center gap-2">
              <Database className="w-5 h-5 text-google-red" />
              {t('cleanOrphans')}
            </h2>
            <p className="text-sm text-m3-on-surface-variant mt-1">
              {t('orphanDetected', { items: orphans.items.length, rooms: orphans.rooms.length, participants: orphans.participants.length })}
              <br /><span className="text-xs opacity-70">{t('orphanNote')}</span>
            </p>
          </div>
          <button
            onClick={cleanOrphans}
            disabled={!hasOrphans}
            className={`px-6 py-2.5 rounded-full font-medium transition-all whitespace-nowrap flex items-center gap-2 ${hasOrphans ? 'bg-google-red text-white shadow-elevation-1 hover:shadow-elevation-2' : 'bg-m3-on-surface/10 text-m3-on-surface-variant cursor-not-allowed'}`}
          >
            <Trash2 className="w-4 h-4" />
            {t('cleanOrphans')}
          </button>
        </div>
      </div>

      {/* Project List */}
      <div className="bg-m3-surface-container rounded-[24px] overflow-hidden">
        <div className="p-4 border-b border-m3-outline-variant/50 font-medium bg-m3-surface-container-high/50 flex justify-between items-center">
          <span>{t('allProjectsManager')} ({projects.length})</span>
          <span className="text-xs text-m3-on-surface-variant font-normal">{t('sortedByDate')}</span>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {projects.map(p => (
            <div key={p.id} className="flex justify-between items-center p-4 border-b border-m3-outline-variant/10 hover:bg-m3-on-surface/5 group">
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
                    <span>{new Date(p.createdAt).toLocaleDateString()}</span>
                    <span>•</span>
                    <span>{t('creators')}: {p.creatorName}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-md ${p.status === 'active' ? 'bg-google-green/10 text-google-green' : 'bg-m3-on-surface/10 text-m3-on-surface-variant'}`}>{p.status}</span>
                <button onClick={() => deleteProject(p)} className="p-2 text-m3-on-surface-variant hover:text-google-red hover:bg-google-red/10 rounded-full transition-colors" title={t('forceDelete')}>
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
