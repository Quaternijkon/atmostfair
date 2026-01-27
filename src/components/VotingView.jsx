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
        <div className="mb-8 p-4 bg-m3-surface-container rounded-[24px] flex flex-col sm:flex-row gap-4">
          <input type="text" value={newItem} onChange={e => setNewItem(e.target.value)} placeholder={t('addItemPlaceholder')} className="flex-[2] px-4 py-3 rounded-xl border border-m3-outline outline-none focus:border-google-blue focus:border-2 bg-m3-surface text-m3-on-surface transition-all" />
          <input type="text" value={myName} onChange={e => setMyName(e.target.value)} placeholder={t('yourNamePlaceholder')} className="flex-1 px-4 py-3 rounded-xl border border-m3-outline outline-none focus:border-google-blue focus:border-2 bg-m3-surface text-m3-on-surface transition-all" />
          <button onClick={() => { if (newItem.trim()) { onAdd(newItem, myName); setNewItem(''); } }} className="bg-google-blue text-white px-8 py-3 rounded-full font-medium shadow-elevation-1 hover:shadow-elevation-2 transition-shadow">{t('add')}</button>
        </div>
      )}
      <div className="space-y-3">
        {sortedItems.map((item, index) => {
          const isVoted = item.votes?.includes(user.uid);
          const canDelete = isAdmin || ((item.creatorId === user.uid || isProjectOwner) && !isStopped);
          return (
            <div key={item.id} className={`bg-m3-surface-container-high p-4 rounded-[20px] relative overflow-hidden flex items-center justify-between transition-colors ${isVoted ? 'bg-m3-primary-container/30 border border-google-blue/30' : 'border border-transparent'}`}>
              <div className="flex items-center gap-5 flex-1 z-10">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${isVoted ? 'bg-google-blue text-white' : 'bg-m3-surface-container text-m3-on-surface-variant'}`}>{index + 1}</div>
                <div><h3 className="font-medium text-lg text-m3-on-surface">{item.title}</h3><div className="text-sm text-m3-on-surface-variant">{item.votes?.length || 0} {t('votes')} • {t('addedBy')} {item.creatorName}</div></div>
              </div>
              <div className="flex items-center gap-2 z-10">
                <button onClick={() => !isStopped && onVote(item)} disabled={isStopped} className={`p-3 rounded-full transition-all ${isVoted ? 'bg-google-blue text-white shadow-elevation-1' : 'bg-m3-surface text-m3-on-surface-variant hover:bg-m3-on-surface/10'}`}><Trophy className="w-5 h-5" /></button>
                {canDelete && <button onClick={() => onDelete(item.id)} className="p-3 text-m3-on-surface-variant hover:text-google-red hover:bg-google-red/10 rounded-full"><Trash2 className="w-5 h-5" /></button>}
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
