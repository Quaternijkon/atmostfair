import React, { useState } from 'react';
import { X } from './Icons';
import { InfoCard } from './InfoCard';

export default function TeamView({ user, isAdmin, rooms, isStopped, onCreate, onJoin, onKick, onDelete, projectId, t }) {
  const [newRoomName, setNewRoomName] = useState('');
  const [myName, setMyName] = useState(user.displayName || '');
  const sortedRooms = [...rooms].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const currentRoom = sortedRooms.find((r) => r.members?.some((m) => m.uid === user.uid));

  if (currentRoom) {
    const isRoomOwner = currentRoom.ownerId === user.uid;
    const canManage = isRoomOwner || isAdmin;
    return (
      <div className="app-card overflow-hidden">
        <div className="flex items-center justify-between bg-google-red p-6 text-white">
          <div><div className="text-white/80 text-xs font-medium uppercase tracking-wider mb-1">{t('currentTeam')}</div><h2 className="text-2xl font-medium">{currentRoom.name}</h2></div>
          <div className="flex gap-2">
            {canManage && !isStopped ? <button onClick={() => onDelete(currentRoom.id)} className="app-button bg-white/20 px-3 text-xs text-white hover:bg-white/30">{t('disbandTeam')}</button> : null}
            {!isStopped && <button onClick={() => onKick(currentRoom.id, currentRoom.members.find((m) => m.uid === user.uid))} className="app-button bg-white text-google-red hover:shadow-elevation-1">{t('leave')}</button>}
          </div>
        </div>
        <div className="p-6 grid gap-4 sm:grid-cols-2">
          {currentRoom.members.map((m) => (
            <div key={m.joinedAt} className="flex items-center justify-between rounded-2xl border border-m3-outline-variant/50 bg-m3-surface p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-google-red/20 text-google-red flex items-center justify-center font-bold text-xs">{m.name.charAt(0)}</div>
                <div className="text-m3-on-surface font-medium">{m.name} {m.uid === currentRoom.ownerId && <span className="text-xs font-normal text-m3-on-surface-variant ml-1">({t('leader')})</span>}</div>
              </div>
              {canManage && m.uid !== user.uid && !isStopped && <button onClick={() => onKick(currentRoom.id, m)} className="app-icon-button hover:bg-google-red/10 hover:text-google-red"><X className="w-4 h-4" /></button>}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div>
      {!isStopped && (
        <div className="app-card mb-6 flex flex-col gap-4 p-4 sm:flex-row">
          <input type="text" value={newRoomName} onChange={e => setNewRoomName(e.target.value)} placeholder={t('teamNamePlaceholder')} className="app-input flex-1" />
          <input type="text" value={myName} onChange={e => setMyName(e.target.value)} placeholder={t('yourNicknamePlaceholder')} className="app-input w-full sm:w-48" />
          <button onClick={() => { if (newRoomName.trim()) { onCreate(newRoomName, 4, myName); setNewRoomName(''); } }} className="app-button bg-google-red px-8 text-white hover:shadow-elevation-1">{t('createTeam')}</button>
        </div>
      )}
      <div className="workspace-grid">
        {sortedRooms.map((room) => (
          <div key={room.id} className="app-card p-6">
            <div className="flex justify-between items-start mb-4">
              <h4 className="font-medium text-lg text-m3-on-surface">{room.name}</h4>
              <div className="bg-m3-surface text-xs font-medium px-2 py-1 rounded-md text-m3-on-surface-variant border border-m3-outline-variant/50">{room.members.length} / {room.maxMembers}</div>
            </div>
            {!isStopped && room.members.length < room.maxMembers ? (
              <button onClick={() => onJoin(room.id, user.displayName)} className="app-button w-full border border-m3-outline-variant text-google-red hover:bg-google-red/5">{t('joinTeam')}</button>
            ) : (
              <button disabled className="app-button w-full bg-m3-surface-container text-m3-on-surface-variant">{t('fullOrClosed')}</button>
            )}
          </div>
        ))}
      </div>
      <InfoCard
        title={t('teamHelpTitle')}
        steps={t('teamHelpSteps')}
      />
    </div>
  );
}
