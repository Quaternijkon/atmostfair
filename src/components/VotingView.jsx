import React, { useState } from 'react';
import { Trophy, Trash2 } from './Icons';
import { InfoCard } from './InfoCard';

export default function VotingView({ user, isAdmin, items, isStopped, onAdd, onDelete, onVote, isProjectOwner, t }) {
  const [newItem, setNewItem] = useState('');
  const [myName, setMyName] = useState(user.displayName || '');
  const sortedItems = [...items].sort((a, b) => (b.votes?.length || 0) - (a.votes?.length || 0));
  return (
    <div>
      {!isStopped && (
        <div className="app-card mb-6 flex flex-col gap-4 p-4 sm:flex-row">
          <input type="text" value={newItem} onChange={e => setNewItem(e.target.value)} placeholder={t('addItemPlaceholder')} className="app-input flex-[2]" />
          <input type="text" value={myName} onChange={e => setMyName(e.target.value)} placeholder={t('yourNamePlaceholder')} className="app-input flex-1" />
          <button onClick={() => { if (newItem.trim()) { onAdd(newItem, myName); setNewItem(''); } }} className="app-button-primary px-8">{t('add')}</button>
        </div>
      )}
      <div className="space-y-3">
        {sortedItems.map((item, index) => {
          const isVoted = item.votes?.includes(user.uid);
          const canDelete = isAdmin || ((item.creatorId === user.uid || isProjectOwner) && !isStopped);
          return (
            <div key={item.id} className={`app-card relative flex items-center justify-between overflow-hidden p-4 ${isVoted ? 'border-google-blue/30 bg-m3-primary-container/30' : ''}`}>
              <div className="flex items-center gap-5 flex-1 z-10">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${isVoted ? 'bg-google-blue text-white' : 'bg-m3-surface-container text-m3-on-surface-variant'}`}>{index + 1}</div>
                <div><h3 className="font-medium text-lg text-m3-on-surface">{item.title}</h3><div className="text-sm text-m3-on-surface-variant">{item.votes?.length || 0} {t('votes')} • {t('addedBy')} {item.creatorName}</div></div>
              </div>
              <div className="flex items-center gap-2 z-10">
                <button onClick={() => !isStopped && onVote(item)} disabled={isStopped} className={`app-icon-button ${isVoted ? 'border-transparent bg-google-blue text-white hover:bg-google-blue hover:text-white' : ''}`}><Trophy className="w-5 h-5" /></button>
                {canDelete && <button onClick={() => onDelete(item.id)} className="app-icon-button hover:bg-google-red/10 hover:text-google-red"><Trash2 className="w-5 h-5" /></button>}
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
