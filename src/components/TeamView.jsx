import React, { useRef, useState } from 'react';
import { X } from './Icons';
import { InfoCard } from './InfoCard';
import { PROJECT_CHILD_TEXT_MAX_LENGTH, createTeamRoomMembershipSummary } from '../lib/projectDomain';
import { useUI } from './UIContext';

export default function TeamView({ user, isAdmin, rooms, isStopped, onCreate, onJoin, onKick, onDelete, projectId, t }) {
  const { showToast } = useUI();
  const [newRoomName, setNewRoomName] = useState('');
  const [myName, setMyName] = useState(user.displayName || '');
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const isCreatingTeamRef = useRef(false);
  const [pendingTeamActionKeys, setPendingTeamActionKeys] = useState([]);
  const pendingTeamActionKeysRef = useRef(new Set());
  const sortedRooms = [...rooms].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const roomsWithMembership = sortedRooms.map((room) => ({
    room,
    membership: createTeamRoomMembershipSummary(room, user),
  }));
  const currentRoomEntry = roomsWithMembership.find(({ membership }) => membership.isMember);
  const currentRoom = currentRoomEntry?.room;
  const currentMembership = currentRoomEntry?.membership;

  const handleCreateTeam = async (event) => {
    event.preventDefault();
    if (!newRoomName.trim()) return;
    if (isCreatingTeamRef.current) return;

    isCreatingTeamRef.current = true;
    setIsCreatingTeam(true);
    try {
      await onCreate(newRoomName, 4, myName);
      setNewRoomName('');
    } catch (error) {
      console.error(error);
      showToast(t('teamActionFailed'), 'error');
    } finally {
      isCreatingTeamRef.current = false;
      setIsCreatingTeam(false);
    }
  };

  const runTeamAction = async (actionKey, action) => {
    if (pendingTeamActionKeysRef.current.has(actionKey)) return;

    pendingTeamActionKeysRef.current.add(actionKey);
    setPendingTeamActionKeys([...pendingTeamActionKeysRef.current]);
    try {
      await action();
    } catch (error) {
      console.error(error);
      showToast(t('teamActionFailed'), 'error');
    } finally {
      pendingTeamActionKeysRef.current.delete(actionKey);
      setPendingTeamActionKeys([...pendingTeamActionKeysRef.current]);
    }
  };

  if (currentRoom) {
    const isRoomOwner = currentRoom.ownerId === user.uid;
    const canManage = isRoomOwner || isAdmin;
    const currentMembers = currentMembership.members;
    const currentMember = currentMembership.currentMember;
    const disbandActionKey = `delete:${currentRoom.id}`;
    const leaveActionKey = `leave:${currentRoom.id}:${currentMember?.uid || ''}`;
    const isDisbandPending = pendingTeamActionKeys.includes(disbandActionKey);
    const isLeavePending = pendingTeamActionKeys.includes(leaveActionKey);
    return (
      <div className="app-card overflow-hidden">
        <div className="flex items-center justify-between bg-google-red p-6 text-white">
          <div><div className="text-white/80 text-xs font-medium uppercase tracking-wider mb-1">{t('currentTeam')}</div><h2 className="text-2xl font-medium">{currentRoom.name}</h2></div>
          <div className="flex gap-2">
            {canManage && !isStopped ? <button onClick={() => runTeamAction(disbandActionKey, () => onDelete(currentRoom.id))} disabled={isDisbandPending} aria-busy={isDisbandPending} className="app-button bg-white/20 px-3 text-xs text-white hover:bg-white/30">{isDisbandPending ? t('processing') : t('disbandTeam')}</button> : null}
            {!isStopped && <button onClick={() => runTeamAction(leaveActionKey, () => onKick(currentRoom.id, currentMember))} disabled={isLeavePending} aria-busy={isLeavePending} className="app-button bg-white text-google-red hover:shadow-elevation-1">{isLeavePending ? t('processing') : t('leave')}</button>}
          </div>
        </div>
        <div className="p-6 grid gap-4 sm:grid-cols-2">
          {currentMembers.map((m) => {
            const kickActionKey = `kick:${currentRoom.id}:${m.uid}`;
            const isKickPending = pendingTeamActionKeys.includes(kickActionKey);
            return (
              <div key={m.uid} className="flex items-center justify-between rounded-2xl border border-m3-outline-variant/50 bg-m3-surface p-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-google-red/20 text-google-red flex items-center justify-center font-bold text-xs">{m.name.charAt(0)}</div>
                  <div className="text-m3-on-surface font-medium">{m.name} {m.uid === currentRoom.ownerId && <span className="text-xs font-normal text-m3-on-surface-variant ml-1">({t('leader')})</span>}</div>
                </div>
                {canManage && m.uid !== currentMember?.uid && !isStopped && <button onClick={() => runTeamAction(kickActionKey, () => onKick(currentRoom.id, m))} disabled={isKickPending} aria-busy={isKickPending} className="app-icon-button hover:bg-google-red/10 hover:text-google-red" title={isKickPending ? t('processing') : t('delete')}><X className="w-4 h-4" /></button>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return (
    <div>
      {!isStopped && (
        <form onSubmit={handleCreateTeam} aria-busy={isCreatingTeam} className="app-card mb-6 flex flex-col gap-4 p-4 sm:flex-row">
          <input type="text" value={newRoomName} onChange={e => setNewRoomName(e.target.value)} placeholder={t('teamNamePlaceholder')} className="app-input flex-1" maxLength={PROJECT_CHILD_TEXT_MAX_LENGTH} disabled={isCreatingTeam} />
          <input type="text" value={myName} onChange={e => setMyName(e.target.value)} placeholder={t('yourNicknamePlaceholder')} className="app-input w-full sm:w-48" disabled={isCreatingTeam} />
          <button type="submit" disabled={isCreatingTeam || !newRoomName.trim()} className="app-button bg-google-red px-8 text-white hover:shadow-elevation-1">{isCreatingTeam ? t('processing') : t('createTeam')}</button>
        </form>
      )}
      <div className="workspace-grid">
        {roomsWithMembership.map(({ room, membership }) => {
          const isJoinPending = pendingTeamActionKeys.includes(`join:${room.id}`);
          return (
            <div key={room.id} className="app-card p-6">
              <div className="flex justify-between items-start mb-4">
                <h4 className="font-medium text-lg text-m3-on-surface">{room.name}</h4>
                <div className="bg-m3-surface text-xs font-medium px-2 py-1 rounded-md text-m3-on-surface-variant border border-m3-outline-variant/50">{membership.memberCount} / {membership.capacity}</div>
              </div>
              {!isStopped && membership.canJoin ? (
                <button onClick={() => runTeamAction(`join:${room.id}`, () => onJoin(room.id, user.displayName))} disabled={isJoinPending} aria-busy={isJoinPending} className="app-button w-full border border-m3-outline-variant text-google-red hover:bg-google-red/5">{isJoinPending ? t('processing') : t('joinTeam')}</button>
              ) : (
                <button disabled className="app-button w-full bg-m3-surface-container text-m3-on-surface-variant">{t('fullOrClosed')}</button>
              )}
            </div>
          );
        })}
      </div>
      <InfoCard
        title={t('teamHelpTitle')}
        steps={t('teamHelpSteps')}
      />
    </div>
  );
}
