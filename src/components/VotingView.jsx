import React, { useMemo, useRef, useState } from 'react';
import { Trophy, Trash2 } from './Icons';
import { InfoCard } from './InfoCard';
import { createVotingResultSummary, PROJECT_CHILD_TEXT_MAX_LENGTH } from '../lib/projectDomain';
import { useUI } from './UIContext';

export default function VotingView({ user, isAdmin, items, isStopped, onAdd, onDelete, onVote, votingConfig, onUpdateVotingConfig, isProjectOwner, projectId, t }) {
  const { showToast } = useUI();
  const [newItem, setNewItem] = useState('');
  const [myName, setMyName] = useState(user.displayName || '');
  const [isAddingVoteItem, setIsAddingVoteItem] = useState(false);
  const isAddingVoteItemRef = useRef(false);
  const [pendingVoteItemIds, setPendingVoteItemIds] = useState([]);
  const pendingVoteItemIdsRef = useRef(new Set());
  const [pendingDeleteVoteItemIds, setPendingDeleteVoteItemIds] = useState([]);
  const pendingDeleteVoteItemIdsRef = useRef(new Set());
  const [isUpdatingVoteMode, setIsUpdatingVoteMode] = useState(false);
  const isUpdatingVoteModeRef = useRef(false);
  const voteSummary = useMemo(() => createVotingResultSummary(items), [items]);
  const hasAdminRights = isProjectOwner || isAdmin;
  const voteMode = votingConfig?.mode === 'single' ? 'single' : 'multiple';
  const voteModes = [
    { value: 'multiple', label: t('voteModeMultiple') },
    { value: 'single', label: t('voteModeSingle') },
  ];

  const updateVoteMode = async (mode) => {
    if (!hasAdminRights || isStopped || mode === voteMode) return;
    if (isUpdatingVoteModeRef.current) return;

    isUpdatingVoteModeRef.current = true;
    setIsUpdatingVoteMode(true);
    try {
      await onUpdateVotingConfig(projectId, { ...(votingConfig || {}), mode });
    } catch (error) {
      console.error(error);
      showToast(t('voteActionFailed'), 'error');
    } finally {
      isUpdatingVoteModeRef.current = false;
      setIsUpdatingVoteMode(false);
    }
  };

  const handleAddItem = async (event) => {
    event.preventDefault();
    if (!newItem.trim()) return;
    if (isAddingVoteItemRef.current) return;

    isAddingVoteItemRef.current = true;
    setIsAddingVoteItem(true);
    try {
      await onAdd(newItem, myName);
      setNewItem('');
    } catch (error) {
      console.error(error);
      showToast(t('voteActionFailed'), 'error');
    } finally {
      isAddingVoteItemRef.current = false;
      setIsAddingVoteItem(false);
    }
  };

  const handleVote = async (item) => {
    const itemId = item?.id;
    if (!itemId || isStopped) return;
    if (pendingVoteItemIdsRef.current.has(itemId)) return;

    pendingVoteItemIdsRef.current.add(itemId);
    setPendingVoteItemIds([...pendingVoteItemIdsRef.current]);
    try {
      await onVote(item);
    } catch (error) {
      console.error(error);
      showToast(t('voteActionFailed'), 'error');
    } finally {
      pendingVoteItemIdsRef.current.delete(itemId);
      setPendingVoteItemIds([...pendingVoteItemIdsRef.current]);
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!itemId || isStopped) return;
    if (pendingDeleteVoteItemIdsRef.current.has(itemId)) return;

    pendingDeleteVoteItemIdsRef.current.add(itemId);
    setPendingDeleteVoteItemIds([...pendingDeleteVoteItemIdsRef.current]);
    try {
      await onDelete(itemId);
    } catch (error) {
      console.error(error);
      showToast(t('voteActionFailed'), 'error');
    } finally {
      pendingDeleteVoteItemIdsRef.current.delete(itemId);
      setPendingDeleteVoteItemIds([...pendingDeleteVoteItemIdsRef.current]);
    }
  };

  return (
    <div>
      {hasAdminRights && (
        <div className="app-card mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-medium text-m3-on-surface">{t('voteMode')}</div>
          <div role="group" aria-label={t('voteMode')} className="inline-flex w-full rounded-full border border-m3-outline-variant/45 bg-m3-surface-container-low p-1 sm:w-auto">
            {voteModes.map((mode) => {
              const selected = voteMode === mode.value;
              return (
                <button
                  key={mode.value}
                  type="button"
                  aria-pressed={selected}
                  aria-busy={isUpdatingVoteMode && !selected}
                  disabled={isStopped || isUpdatingVoteMode}
                  onClick={() => updateVoteMode(mode.value)}
                  className={`min-h-11 flex-1 rounded-full px-4 text-sm font-medium transition sm:flex-none ${
                    selected
                      ? 'bg-google-blue text-white shadow-elevation-1'
                      : 'text-m3-on-surface-variant hover:bg-m3-surface-container-high hover:text-m3-on-surface'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {isUpdatingVoteMode && !selected ? t('processing') : mode.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {!isStopped && (
        <form onSubmit={handleAddItem} aria-busy={isAddingVoteItem} className="app-card mb-6 flex flex-col gap-4 p-4 sm:flex-row">
          <input type="text" value={newItem} onChange={e => setNewItem(e.target.value)} placeholder={t('addItemPlaceholder')} className="app-input flex-[2]" maxLength={PROJECT_CHILD_TEXT_MAX_LENGTH} disabled={isAddingVoteItem} />
          <input type="text" value={myName} onChange={e => setMyName(e.target.value)} placeholder={t('yourNamePlaceholder')} className="app-input flex-1" disabled={isAddingVoteItem} />
          <button type="submit" disabled={isAddingVoteItem || !newItem.trim()} className="app-button-primary px-8">{isAddingVoteItem ? t('processing') : t('add')}</button>
        </form>
      )}
      <div className="mb-4 flex items-center justify-between rounded-2xl border border-m3-outline-variant/45 bg-m3-surface-container-low px-4 py-3 text-sm text-m3-on-surface-variant">
        <span>{t('totalVotes', { count: voteSummary.totalVotes })}</span>
        <span className="font-medium text-m3-on-surface">{voteMode === 'single' ? t('voteModeSingle') : t('voteModeMultiple')}</span>
      </div>
      <div className="space-y-3">
        {voteSummary.items.map((entry, index) => {
          const { item } = entry;
          const isVoted = entry.voterIds.includes(user.uid);
          const isVotePending = pendingVoteItemIds.includes(item.id);
          const isDeletePending = pendingDeleteVoteItemIds.includes(item.id);
          const canDelete = !isStopped && (isAdmin || item.creatorId === user.uid || isProjectOwner);
          const voteBarWidth = `${Math.round(entry.barPercent * 100)}%`;
          const voteShare = Math.round(entry.percent * 100);
          return (
            <div key={item.id} className={`app-card relative flex items-center justify-between overflow-hidden p-4 ${isVoted ? 'border-google-blue/30 bg-m3-primary-container/30' : ''}`}>
              <div className="flex items-center gap-5 flex-1 z-10">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${isVoted ? 'bg-google-blue text-white' : 'bg-m3-surface-container text-m3-on-surface-variant'}`}>{index + 1}</div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-lg text-m3-on-surface">{item.title}</h3>
                  <div className="text-sm text-m3-on-surface-variant">{entry.voteCount} {t('votes')} • {t('voteShare', { percent: voteShare })} • {t('addedBy')} {item.creatorName}</div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-m3-surface-container-high">
                    <div className="h-full rounded-full bg-google-blue transition-[width] duration-300" style={{ width: voteBarWidth }} />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 z-10">
                <button
                  onClick={() => handleVote(item)}
                  disabled={isStopped || isVotePending}
                  aria-busy={isVotePending}
                  aria-label={isVotePending ? t('processing') : t('voteActionLabel')}
                  title={isVotePending ? t('processing') : t('voteActionLabel')}
                  className={`app-icon-button disabled:cursor-not-allowed disabled:opacity-60 ${isVoted ? 'border-transparent bg-google-blue text-white hover:bg-google-blue hover:text-white' : ''}`}
                >
                  <Trophy className="w-5 h-5" />
                </button>
                {canDelete && (
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    disabled={isDeletePending}
                    aria-busy={isDeletePending}
                    title={isDeletePending ? t('processing') : t('delete')}
                    className="app-icon-button hover:bg-google-red/10 hover:text-google-red disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <InfoCard
        title={t('votingHelpTitle')}
        steps={t('votingHelpSteps')}
      />
    </div>
  );
}
