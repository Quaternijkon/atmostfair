import React, { useRef, useState } from 'react';
import { ListOrdered, ClipboardList } from './Icons';
import { InfoCard } from './InfoCard';
import { useUI } from './UIContext';

export default function QueueView({ user, isAdmin, project, participants, isStopped, isFinished, isOwner, actions, t }) {
  const [joinName, setJoinName] = useState(user.displayName || '');
  const [joinValue, setJoinValue] = useState(() => Math.floor(Math.random() * 101));
  const [isGeneratingQueue, setIsGeneratingQueue] = useState(false);
  const isGeneratingQueueRef = useRef(false);
  const { confirm, showToast } = useUI();

  // Sort: If finished, by queueOrder. Else by join time.
  const sortedParticipants = [...participants].sort((a, b) => {
    if (isFinished) return (a.queueOrder || 999) - (b.queueOrder || 999);
    return (a.joinedAt || 0) - (b.joinedAt || 0);
  });

  const myParticipant = participants.find((p) => p.uid === user?.uid);
  const count = participants.length;
  const queueAuditSteps = project.queueResult?.steps || [];

  const generateQueue = async () => {
    if (isGeneratingQueueRef.current) return;

    isGeneratingQueueRef.current = true;
    setIsGeneratingQueue(true);
    try {
      await actions.handleGenerateQueue(project.id);
    } catch (error) {
      console.error(error);
      showToast(t('resultGenerationFailed'), 'error');
    } finally {
      isGeneratingQueueRef.current = false;
      setIsGeneratingQueue(false);
    }
  };

  const handleGenerate = () => {
    if (isGeneratingQueueRef.current) return;

    confirm({
      title: t('startQueue'),
      message: t('startQueueConfirm'),
      confirmText: t('startQueue'),
      cancelText: t('cancel'),
      onConfirm: generateQueue,
    });
  };

  return (
    <div className="space-y-8 animate-fade-in relative pb-10">
      
      {/* Result Header */}
      {isFinished && (
        <div className="app-card border-google-yellow/50 p-8 text-center">
            <div className="inline-block p-4 rounded-full bg-google-yellow text-white mb-4 shadow-elevation-2">
                <ListOrdered className="w-8 h-8" />
            </div>
            <h2 className="text-3xl font-medium text-m3-on-surface mb-2">{t('queueResult')}</h2>
            <p className="text-m3-on-surface-variant mb-6">{t('queueAlgoDesc')}</p>
        </div>
      )}

      {isFinished && (
        <div className="app-card p-5 sm:p-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-m3-on-surface">
            <ListOrdered className="h-4 w-4 text-google-yellow" />
            {t('queueAuditTrail')}
          </h3>
          {queueAuditSteps.length > 0 ? (
            <div className="grid gap-2">
              {queueAuditSteps.map((step) => (
                <div key={`${step.order}-${step.participantId}`} className="rounded-xl border border-m3-outline-variant/35 bg-m3-surface-container/45 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium text-m3-on-surface">
                      {t('queueAuditStep', {
                        order: step.order,
                        name: step.participantName,
                        value: step.participantValue,
                      })}
                    </div>
                    <div className="font-mono text-xs text-google-yellow">
                      {t('queueAuditFormula', {
                        sum: step.sum,
                        remaining: step.remainingCount,
                        index: step.selectedIndex,
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-m3-outline-variant/60 bg-m3-surface-container/30 p-3 text-sm text-m3-on-surface-variant">
              {t('queueAuditEmpty')}
            </div>
          )}
        </div>
      )}

      {/* Main Action Area */}
      {!isFinished && (
        <div className="app-card relative overflow-hidden p-6 sm:p-8">
             <div className="flex flex-col md:flex-row justify-between items-center gap-8">
                 <div>
                    <h2 className="text-3xl font-medium mb-2 flex items-center gap-3 text-m3-on-surface">
                        <ClipboardList className="w-8 h-8 text-google-yellow" /> {t('queue')}
                    </h2>
                    <p className="text-m3-on-surface-variant">{t('queueDesc')}</p>
                 </div>
                 
                 {(isOwner || isAdmin) && !isStopped && count > 0 && (
                     <button onClick={handleGenerate} disabled={isGeneratingQueue} aria-busy={isGeneratingQueue} className="app-button bg-google-yellow px-8 text-gray-900 hover:shadow-elevation-2">
                        {isGeneratingQueue ? t('processing') : t('startQueue')}
                     </button>
                 )}
             </div>
        </div>
      )}

      {/* Join Form */}
      {!isFinished && !myParticipant && !isStopped && (
         <div className="app-card p-6 sm:p-8">
             <h3 className="font-medium text-2xl text-m3-on-surface mb-6">{t('joinQueue')}</h3>
             <div className="grid md:grid-cols-2 gap-6">
                 <div>
                    <label className="app-label">{t('yourNamePlaceholder')}</label>
                    <input type="text" value={joinName} onChange={e => setJoinName(e.target.value)} className="app-input" placeholder={t('yourNamePlaceholder')} />
                 </div>
                 <div>
                     <div className="flex justify-between mb-1">
                        <label className="text-sm font-medium text-m3-on-surface-variant">{t('queueNumber')}</label>
                        <span className="font-mono text-google-yellow">{joinValue}</span>
                     </div>
                     <input type="range" min="0" max="100" value={joinValue} onChange={e => setJoinValue(parseInt(e.target.value))} className="w-full accent-google-yellow" />
                 </div>
             </div>
             <button onClick={() => actions.handleJoinQueue(project.id, joinName, joinValue)} className="app-button mt-6 w-full bg-google-yellow text-gray-900 hover:shadow-elevation-1">
                {t('submitEntry')}
             </button>
         </div>
      )}

      {/* List */}
      <div className="app-card overflow-hidden p-6">
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
                            <td className="px-4 py-3 font-medium text-m3-on-surface">
                              <span>{p.name}</span>
                              {p.uid === user?.uid && <span className="ml-2 rounded-full bg-google-blue/10 px-2 py-0.5 text-[10px] font-medium text-google-blue">{t('currentUserBadge')}</span>}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-google-yellow">
                                {isFinished || p.uid === user?.uid ? p.value : '***'}
                            </td>
                        </tr>
                    ))}
                    {sortedParticipants.length === 0 && (
                        <tr>
                          <td colSpan="3" className="px-4 py-6">
                            <div className="app-card-quiet flex items-center justify-center gap-2 p-5 text-center text-sm text-m3-on-surface-variant">
                              <ClipboardList className="h-5 w-5 text-google-yellow" />
                              <span>{t('noParticipantsYet')}</span>
                            </div>
                          </td>
                        </tr>
                    )}
                 </tbody>
             </table>
         </div>
      </div>
      
      <InfoCard title={t('queueHelpTitle')} steps={t('queueHelpSteps') || []} />
    </div>
  );
}
