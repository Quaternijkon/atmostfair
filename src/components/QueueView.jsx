import React, { useState } from 'react';
import { ListOrdered, ClipboardList } from './Icons';
import { InfoCard } from './InfoCard';

export default function QueueView({ user, isAdmin, project, participants, isStopped, isFinished, isOwner, actions, t }) {
  const [joinName, setJoinName] = useState(user.displayName || '');
  const [joinValue, setJoinValue] = useState(() => Math.floor(Math.random() * 101));

  // Sort: If finished, by queueOrder. Else by join time.
  const sortedParticipants = [...participants].sort((a, b) => {
    if (isFinished) return (a.queueOrder || 999) - (b.queueOrder || 999);
    return (a.joinedAt || 0) - (b.joinedAt || 0);
  });

  const myParticipant = participants.find((p) => p.uid === user?.uid);
  const count = participants.length;

  const handleGenerate = () => {
    if (confirm(t('startQueue') + '?')) {
        actions.handleGenerateQueue(project.id);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in relative pb-10">
      
      {/* Result Header */}
      {isFinished && (
        <div className="bg-m3-surface-container-high rounded-[32px] p-8 text-center border border-google-yellow/50 shadow-elevation-1">
            <div className="inline-block p-4 rounded-full bg-google-yellow text-white mb-4 shadow-elevation-2">
                <ListOrdered className="w-8 h-8" />
            </div>
            <h2 className="text-3xl font-normal text-m3-on-surface mb-2">{t('queueResult')}</h2>
            <p className="text-m3-on-surface-variant mb-6">{t('queueAlgoDesc')}</p>
        </div>
      )}

      {/* Main Action Area */}
      {!isFinished && (
        <div className="bg-m3-surface-container rounded-[32px] p-8 relative overflow-hidden">
             <div className="flex flex-col md:flex-row justify-between items-center gap-8">
                 <div>
                    <h2 className="text-3xl font-normal mb-2 flex items-center gap-3 text-m3-on-surface">
                        <ClipboardList className="w-8 h-8 text-google-yellow" /> {t('queue')}
                    </h2>
                    <p className="text-m3-on-surface-variant">{t('queueDesc')}</p>
                 </div>
                 
                 {(isOwner || isAdmin) && !isStopped && count > 0 && (
                     <button onClick={handleGenerate} className="px-8 py-4 bg-google-yellow text-gray-900 font-medium rounded-2xl shadow-elevation-2 hover:shadow-elevation-3 transition-shadow">
                        {t('startQueue')}
                     </button>
                 )}
             </div>
        </div>
      )}

      {/* Join Form */}
      {!isFinished && !myParticipant && !isStopped && (
         <div className="bg-m3-surface p-8 rounded-[28px] border border-m3-outline-variant/50">
             <h3 className="font-normal text-2xl text-m3-on-surface mb-6">{t('joinQueue')}</h3>
             <div className="grid md:grid-cols-2 gap-6">
                 <div>
                    <label className="text-sm font-medium text-m3-on-surface-variant mb-1 block">{t('yourNamePlaceholder')}</label>
                    <input type="text" value={joinName} onChange={e => setJoinName(e.target.value)} className="w-full px-4 py-3 bg-m3-surface-container-high rounded-xl border-none text-m3-on-surface" placeholder={t('yourNamePlaceholder')} />
                 </div>
                 <div>
                     <div className="flex justify-between mb-1">
                        <label className="text-sm font-medium text-m3-on-surface-variant">{t('queueNumber')}</label>
                        <span className="font-mono text-google-yellow">{joinValue}</span>
                     </div>
                     <input type="range" min="0" max="100" value={joinValue} onChange={e => setJoinValue(parseInt(e.target.value))} className="w-full accent-google-yellow" />
                 </div>
             </div>
             <button onClick={() => actions.handleJoinQueue(project.id, joinName, joinValue)} className="w-full mt-6 bg-google-yellow text-gray-900 font-medium py-3 rounded-full hover:shadow-elevation-1">
                {t('submitEntry')}
             </button>
         </div>
      )}

      {/* List */}
      <div className="bg-m3-surface border border-m3-outline-variant/20 rounded-[24px] overflow-hidden p-6">
         <h3 className="font-medium text-m3-on-surface mb-4">{t('participants')} ({count})</h3>
         <div className="overflow-x-auto">
             <table className="w-full text-sm text-left">
                 <thead className="text-xs uppercase bg-m3-surface-container text-m3-on-surface-variant">
                     <tr>
                         <th className="px-4 py-3 rounded-l-lg">#</th>
                         <th className="px-4 py-3">{t('creatorNamePlaceholder')}</th>
                         <th className="px-4 py-3 text-right rounded-r-lg">{t('valueLabel')}</th>
                     </tr>
                 </thead>
                 <tbody>
                    {sortedParticipants.map((p, idx) => (
                        <tr key={p.id} className="border-b border-m3-outline-variant/10 last:border-0 hover:bg-m3-surface-container/30">
                            <td className="px-4 py-3 font-mono text-m3-on-surface-variant">
                                {isFinished ? (
                                    <span className="inline-block w-8 h-8 rounded-full bg-google-yellow text-gray-900 text-center leading-8 font-bold">{p.queueOrder}</span>
                                ) : (
                                    idx + 1
                                )}
                            </td>
                            <td className="px-4 py-3 font-medium text-m3-on-surface">{p.name} {p.uid === user?.uid && '(You)'}</td>
                            <td className="px-4 py-3 text-right font-mono text-google-yellow">
                                {isFinished || p.uid === user?.uid ? p.value : '***'}
                            </td>
                        </tr>
                    ))}
                    {sortedParticipants.length === 0 && (
                        <tr><td colSpan="3" className="px-4 py-8 text-center text-m3-on-surface-variant opacity-60">No participants yet</td></tr>
                    )}
                 </tbody>
             </table>
         </div>
      </div>
      
      <InfoCard title={t('queueHelpTitle')} steps={t('queueHelpSteps') || []} />
    </div>
  );
}
