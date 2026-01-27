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
      <div className="bg-m3-surface-container rounded-[28px] overflow-hidden shadow-elevation-1">
        <div className="bg-google-red text-white p-6 flex justify-between items-center">
          <div><div className="text-white/80 text-xs font-medium uppercase tracking-wider mb-1">{t('currentTeam')}</div><h2 className="text-2xl font-normal">{currentRoom.name}</h2></div>
          <div className="flex gap-2">
            {(canManage && !isStopped) || isAdmin ? <button onClick={() => onDelete(currentRoom.id)} className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-xs font-medium backdrop-blur-sm transition-colors">{t('disbandTeam')}</button> : null}
            <button onClick={() => onKick(currentRoom.id, currentRoom.members.find((m) => m.uid === user.uid))} className="bg-white text-google-red px-4 py-2 rounded-full text-sm font-medium shadow-sm hover:shadow-md transition-shadow">{t('leave')}</button>
          </div>
        </div>
        <div className="p-6 grid gap-4 sm:grid-cols-2">
          {currentRoom.members.map((m) => (
            <div key={m.joinedAt} className="flex justify-between items-center p-4 bg-m3-surface rounded-xl border border-m3-outline-variant/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-google-red/20 text-google-red flex items-center justify-center font-bold text-xs">{m.name.charAt(0)}</div>
                <div className="text-m3-on-surface font-medium">{m.name} {m.uid === currentRoom.ownerId && <span className="text-xs font-normal text-m3-on-surface-variant ml-1">({t('leader')})</span>}</div>
              </div>
              {canManage && m.uid !== user.uid && (!isStopped || isAdmin) && <button onClick={() => onKick(currentRoom.id, m)} className="text-m3-error hover:bg-m3-error/10 p-2 rounded-full"><X className="w-4 h-4" /></button>}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div>
      {!isStopped && (
        <div className="mb-8 bg-m3-surface-container rounded-[24px] p-6 flex flex-col sm:flex-row gap-4 border border-m3-outline-variant/30">
          <input type="text" value={newRoomName} onChange={e => setNewRoomName(e.target.value)} placeholder={t('teamNamePlaceholder')} className="flex-1 px-4 py-3 bg-m3-surface rounded-xl border border-m3-outline outline-none focus:border-google-red focus:border-2 text-m3-on-surface" />
          <input type="text" value={myName} onChange={e => setMyName(e.target.value)} placeholder={t('yourNicknamePlaceholder')} className="w-full sm:w-48 px-4 py-3 bg-m3-surface rounded-xl border border-m3-outline outline-none focus:border-google-red focus:border-2 text-m3-on-surface" />
          <button onClick={() => { if (newRoomName.trim()) { onCreate(newRoomName, 4, myName); setNewRoomName(''); } }} className="bg-google-red text-white px-8 py-3 rounded-full font-medium shadow-elevation-1 hover:shadow-elevation-2">{t('createTeam')}</button>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sortedRooms.map((room) => (
          <div key={room.id} className="bg-m3-surface-container-high p-6 rounded-[24px] border border-transparent transition-all">
            <div className="flex justify-between items-start mb-4">
              <h4 className="font-medium text-lg text-m3-on-surface">{room.name}</h4>
              <div className="bg-m3-surface text-xs font-medium px-2 py-1 rounded-md text-m3-on-surface-variant border border-m3-outline-variant/50">{room.members.length} / {room.maxMembers}</div>
            </div>
            {!isStopped && room.members.length < room.maxMembers ? (
              <button onClick={() => onJoin(room.id, user.displayName)} className="w-full border border-m3-outline-variant text-google-red font-medium py-2.5 rounded-full hover:bg-google-red/5 transition-colors">{t('joinTeam')}</button>
            ) : (
              <button disabled className="w-full bg-m3-surface-container text-m3-on-surface-variant py-2.5 rounded-full text-sm cursor-not-allowed">{t('fullOrClosed')}</button>
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
