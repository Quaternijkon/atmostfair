import React, { useState, useMemo } from 'react';
import { Crown, Dices, ChartLine, Lock } from './Icons';
import { InfoCard } from './InfoCard';

export default function RouletteView({ user, isAdmin, project, participants, isStopped, isFinished, isOwner, actions, t }) {
  const [joinName, setJoinName] = useState(user.displayName || '');
  const [joinValue, setJoinValue] = useState(50);
  const [showResultModal, setShowResultModal] = useState(false);

  const sortedParticipants = [...participants].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  const activeParticipants = sortedParticipants.filter((p) => !p.isWinner);
  const myParticipant = sortedParticipants.find((p) => p.uid === user?.uid);
  const isMeWinner = myParticipant?.isWinner;
  const finalWinner = isFinished && project.winners?.length > 0 ? project.winners[project.winners.length - 1] : null;

  const totalValue = activeParticipants.reduce((acc, curr) => acc + (curr.value || 0), 0);
  const count = activeParticipants.length;
  const winnerIndex = count > 0 ? totalValue % count : 0;
  const winnerCandidate = activeParticipants[winnerIndex];

  const canDraw = (isOwner || isAdmin) && !isStopped && count > 0;

  const confirmDraw = () => {
    actions.handleRecordWinner(project.id, { participantId: winnerCandidate.id, name: winnerCandidate.name, uid: winnerCandidate.uid, winningNumber: winnerIndex, totalValueSnapshot: totalValue, participantCountSnapshot: count });
    setShowResultModal(false);
  };

  const data = useMemo(() => {
    let cumulativeSum = 0;
    const targetList = isFinished ? sortedParticipants : activeParticipants;
    return targetList.map((p, i) => { cumulativeSum += (p.value || 0); return { x: i, y: cumulativeSum % (i + 1) }; });
  }, [participants, isFinished]);

  return (
    <div className="space-y-8 animate-fade-in relative pb-10">
      {showResultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-m3-surface-container text-m3-on-surface w-full max-w-lg rounded-[28px] p-8 shadow-elevation-3">
            <h2 className="text-2xl font-normal mb-4 text-center">{t('confirmSelection')}</h2>
            <p className="text-center text-m3-on-surface-variant mb-8">{t('spinMessage')}</p>
            <div className="flex gap-4">
              <button onClick={() => setShowResultModal(false)} className="flex-1 py-3 text-google-blue font-medium hover:bg-google-blue/5 rounded-full">{t('cancel')}</button>
              <button onClick={confirmDraw} className="flex-1 py-3 bg-google-blue text-white rounded-full font-medium shadow-elevation-1">{t('confirmSpin')}</button>
            </div>
          </div>
        </div>
      )}

      {isFinished ? (
        <div className="bg-m3-surface-container-high rounded-[32px] p-10 text-center relative overflow-hidden border border-google-yellow/50 shadow-elevation-1">
          <div className="relative z-10 animate-scale-in">
            <div className="inline-block p-4 rounded-full bg-google-yellow text-white mb-6 shadow-elevation-2"><Crown className="w-12 h-12" /></div>
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-m3-on-surface-variant mb-2">{t('winnerAnnounced')}</h2>
            <h2 className="text-5xl font-normal text-m3-on-surface mb-8">{finalWinner?.name}</h2>
            <div className="flex flex-wrap justify-center gap-4">
              <div className="bg-m3-surface px-6 py-4 rounded-2xl border border-m3-outline-variant/30 min-w-[120px]"><div className="text-xs text-m3-on-surface-variant uppercase tracking-widest mb-1">{t('index')}</div><div className="text-3xl font-mono text-google-yellow">{finalWinner?.winningNumber}</div></div>
              <div className="bg-m3-surface px-6 py-4 rounded-2xl border border-m3-outline-variant/30 min-w-[120px]"><div className="text-xs text-m3-on-surface-variant uppercase tracking-widest mb-1">{t('sum')}</div><div className="text-3xl font-mono text-m3-on-surface">{finalWinner?.totalValueSnapshot}</div></div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-m3-surface-container rounded-[32px] p-8 md:p-10 relative overflow-hidden">
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="w-full md:w-auto">
              <h2 className="text-3xl font-normal mb-2 flex items-center gap-3 text-m3-on-surface"><Dices className="w-8 h-8 text-google-yellow" /> {t('fairRoulette')}</h2>
              <div className="flex items-center gap-4 mt-6 bg-m3-surface p-4 rounded-2xl border border-m3-outline-variant/30 overflow-x-auto">
                <div className="text-center px-2"><div className="text-xs font-medium uppercase text-m3-on-surface-variant">{t('total')}</div><div className="text-xl font-mono text-m3-on-surface">???</div></div>
                <div className="text-m3-on-surface-variant font-light text-2xl">%</div>
                <div className="text-center px-2"><div className="text-xs font-medium uppercase text-m3-on-surface-variant">{t('people')}</div><div className="text-xl font-mono text-m3-on-surface">{count}</div></div>
                <div className="text-m3-on-surface-variant font-light text-2xl">=</div>
                <div className="text-center px-2"><div className="text-xs font-medium uppercase text-m3-on-surface-variant">{t('result')}</div><div className="text-xl font-mono text-google-yellow">???</div></div>
              </div>
            </div>
            {canDraw && <button onClick={() => setShowResultModal(true)} className="w-full md:w-auto px-8 py-4 bg-google-yellow text-gray-900 font-medium rounded-2xl shadow-elevation-2 hover:shadow-elevation-3 transition-shadow flex items-center justify-center gap-2"><Crown className="w-5 h-5" /> {t('drawWinner')}</button>}
          </div>
        </div>
      )}

      {!isFinished && !myParticipant && !isStopped && (
        <div className="bg-m3-surface p-8 rounded-[28px] border border-m3-outline-variant/50 relative overflow-hidden">
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="flex-1 w-full">
              <h3 className="font-normal text-2xl text-m3-on-surface mb-2">{t('joinToPlay')}</h3>
              <p className="text-m3-on-surface-variant text-sm mb-6">{t('rouletteCannotChange')} <span className="text-google-red font-bold">{t('cannotBeChanged')}</span>.</p>
              <input type="text" value={joinName} onChange={e => setJoinName(e.target.value)} placeholder={t('entryNamePlaceholder')} className="w-full px-4 py-3 bg-m3-surface-container-high rounded-xl border border-m3-outline outline-none focus:border-google-yellow focus:border-2 text-m3-on-surface" />
            </div>
            <div className="w-full md:w-1/2 bg-m3-surface-container-high rounded-2xl p-6 border border-transparent">
              <div className="flex justify-between items-center mb-6"><label className="font-medium text-m3-on-surface-variant">{t('valueLabel')}</label><span className="text-4xl font-normal text-google-yellow">{joinValue}</span></div>
              <input type="range" min="0" max="100" value={joinValue} onChange={e => setJoinValue(parseInt(e.target.value))} className="w-full h-2 bg-m3-outline-variant rounded-lg appearance-none cursor-pointer accent-google-yellow" />
              <button onClick={() => actions.handleJoinRoulette(project.id, joinName, joinValue)} className="w-full mt-8 bg-google-yellow text-gray-900 text-lg font-medium py-3 rounded-full hover:shadow-elevation-1 transition-shadow">{t('submitEntry')}</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6 mt-8">
        <div className="bg-m3-surface border border-m3-outline-variant/20 rounded-[24px] overflow-hidden p-6">
          <h3 className="font-medium text-m3-on-surface mb-4">{t('participants')} ({count})</h3>
          <div className="max-h-[300px] overflow-y-auto pr-2">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase text-m3-on-surface-variant border-b border-m3-outline-variant/20"><tr><th className="px-4 py-3 font-medium">#</th><th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 text-right font-medium">Val</th></tr></thead>
              <tbody className="">
                {sortedParticipants.map((p, idx) => (
                  <tr key={p.id} className={`border-b border-m3-outline-variant/10 last:border-0 hover:bg-m3-surface-container-high/50 transition-colors`}>
                    <td className="px-4 py-3 text-m3-on-surface-variant font-mono">{idx} {isFinished && p.uid === finalWinner?.uid && '👑'}</td>
                    <td className={`px-4 py-3 ${p.uid === user?.uid ? 'font-bold text-google-blue' : 'text-m3-on-surface'}`}>{p.name}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-m3-on-surface-variant">{isFinished || p.uid === user?.uid ? p.value : '***'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-m3-surface-container-high rounded-[24px] p-6 text-m3-on-surface overflow-hidden border border-transparent">
          <h3 className="font-medium mb-6 flex gap-2 items-center"><ChartLine className="w-5 h-5 text-m3-on-surface-variant" /> {t('distributionChart')}</h3>
          {!isFinished ? (
            <div className="text-m3-on-surface-variant/50 flex flex-col items-center justify-center py-10 text-sm">
               <Lock className="w-8 h-8 mb-2 opacity-20" />
               <span>{t('availAfterResults')}</span>
            </div>
          ) : data.length > 1 ? (
            <svg viewBox={`0 -5 100 55`} className="w-full h-40 overflow-visible">
              <polyline fill="none" stroke="#FBBC05" strokeWidth="2" points={data.map((d, i) => `${(i / (data.length - 1)) * 100},${50 - (d.y / Math.max(...data.map((p) => p.y))) * 50}`).join(' ')} />
              {data.map((d, i) => <circle key={i} cx={(i / (data.length - 1)) * 100} cy={50 - (d.y / Math.max(...data.map((p) => p.y))) * 50} r="2" fill="#fff" stroke="#FBBC05" strokeWidth="1" />)}
            </svg>
          ) : <div className="text-m3-on-surface-variant/50 text-center py-10 text-sm">{t('notEnoughData')}</div>}
        </div>
      </div>
      <InfoCard
        title={t('rouletteHelpTitle')}
        steps={t('rouletteHelpSteps')}
      />
    </div>
  );
}
