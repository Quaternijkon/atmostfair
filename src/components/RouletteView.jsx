import React, { useState, useMemo, useEffect } from 'react';
import { Crown, Dices, ChartLine, Lock, Plus, Trash2, Settings, Play, FastForward, RotateCcw, X, Pause } from './Icons';
import { InfoCard } from './InfoCard';
import { useUI } from './UIComponents';

// --- Deterministic PRNG ---
class PseudoRandom {
  constructor(seed) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }
  next() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed;
  }
  nextFloat() {
    return (this.next() - 1) / 2147483646;
  }
  // Returns integer [0, n-1]
  range(n) {
    return Math.floor(this.nextFloat() * n);
  }
}

export default function RouletteView({ user, isAdmin, project, participants, isStopped, isFinished, isOwner, actions, t }) {
  const { showToast } = useUI();
  
  // -- Local User State --
  const [joinName, setJoinName] = useState(user.displayName || '');
  const [joinValue, setJoinValue] = useState(50);
  
  // -- Config State --
  const [activeTab, setActiveTab] = useState('classic'); 
  const [config, setConfig] = useState(project.rouletteConfig || {
      mode: 'classic',
      prizes: [],
      survivorCount: 1,
      order: 'fwd',
      allowRepeat: false,
      enableReplay: false,
      replaySpeed: 2,
      creatorWeightPublic: false
  });

  // -- Replay State --
  const [replayState, setReplayState] = useState({ 
    active: false, 
    stepIndex: -1, 
    autoPlay: false,
    speed: 2 
  });

  // -- Derived Data --
  const sortedParticipants = useMemo(() => [...participants].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0)), [participants]);
  
  // Sync config from project if not editing
  useEffect(() => {
     if (project.rouletteConfig) {
         setConfig(prev => ({...prev, ...project.rouletteConfig}));
         setActiveTab(project.rouletteConfig.mode || 'classic');
     }
  }, [project.rouletteConfig]);

  // -- Logic Helpers --
  
  // Calculate simulation steps and final results
  const simulationData = useMemo(() => {
      // 1. Calculate Seed
      const totalValue = sortedParticipants.reduce((acc, curr) => acc + (curr.value || 0), 0);
      const prng = new PseudoRandom(totalValue); 
      
      const steps = [];
      const winners = [];
      const eliminated = new Set();
      
      let pool = sortedParticipants.map(p => ({...p})); // Clone
      
      const mode = config.mode || 'classic';
      
      if (mode === 'classic') {
          if (pool.length > 0) {
              const winnerIndex = totalValue % pool.length;
              const winner = pool[winnerIndex];
              steps.push({ 
                  type: 'win', 
                  step: 1, 
                  target: winner, 
                  label: t('winner'),
                  detail: `Index: ${winnerIndex} (Sum ${totalValue} % ${pool.length})` 
              });
              winners.push({...winner, rank: 1, prize: 'Winner'});
          }
      } 
      else if (mode === 'multi') {
          // Flatten prizes
          let prizeQueue = [];
          (config.prizes || []).forEach(p => {
              for(let i=0; i<(parseInt(p.count)||0); i++) prizeQueue.push(p.name);
          });
          
          if (config.order === 'rev') prizeQueue = prizeQueue.reverse();
          
          prizeQueue.forEach((prizeName, idx) => {
               // Filter pool if no repeat
               let currentPool = config.allowRepeat ? pool : pool.filter(p => !eliminated.has(p.uid));
               
               if (currentPool.length > 0) {
                   const randVal = prng.range(currentPool.length);
                   const winner = currentPool[randVal];
                   
                   steps.push({
                       type: 'win',
                       step: idx + 1,
                       target: winner,
                       label: `${t('rWinner')}: ${prizeName}`,
                       detail: `calc(${randVal})`
                   });
                   winners.push({...winner, prize: prizeName, rank: idx+1});
                   eliminated.add(winner.uid);
               }
          });
      }
      else if (mode === 'elim') {
          let survivorsNeeded = parseInt(config.survivorCount) || 1;
          if (survivorsNeeded < 1) survivorsNeeded = 1;
          if (survivorsNeeded >= pool.length && pool.length > 0) survivorsNeeded = Math.max(1, pool.length - 1); 
          
          let round = 1;
          // Phase 1: Eliminate until survivors count reached
          let currentPool = pool.filter(p => !eliminated.has(p.uid));
          
          let loopGuard = 0;
          while (currentPool.length > survivorsNeeded && loopGuard < 1000) {
               loopGuard++;
               const randVal = prng.range(currentPool.length);
               const loser = currentPool[randVal];
               
               if (!loser) break; // Should not happen

               steps.push({
                   type: 'elim',
                   step: round++,
                   target: loser,
                   label: t('rEliminated'),
                   detail: `calc(${randVal})`
               });
               eliminated.add(loser.uid);
               currentPool = pool.filter(p => !eliminated.has(p.uid));
          }
          
          // Phase 2: Remainder are winners
          let survivors = pool.filter(p => !eliminated.has(p.uid));
          
          // For display, adding survivors as winners step
          loopGuard = 0;
          while (survivors.length > 0 && loopGuard < 1000) {
              loopGuard++;
              const randVal = prng.range(survivors.length);
              const winner = survivors[randVal];
              if (!winner) break;

               steps.push({
                   type: 'win',
                   step: round++,
                   target: winner,
                   label: t('rWinner'),
                   detail: `Survivor`
               });
               winners.push(winner);
               survivors = survivors.filter(s => s.uid !== winner.uid);
          }
      }
      
      return { steps, winners, totalValue };
  }, [sortedParticipants, config, t]);

  // -- Handlers --
  
  const handleSaveConfig = () => {
      actions.handleUpdateRouletteConfig(project.id, { ...config, mode: activeTab });
      showToast(t('rSaveConfig'), 'success');
  };
  
  const handleDraw = () => {
      if (sortedParticipants.length === 0) return;
      
      // Save result to project (locks it)
      const resultData = {
          winners: simulationData.winners,
          steps: simulationData.steps,
          seed: simulationData.totalValue,
          configSnapshot: config
      };
      
      actions.handleSaveRouletteResult(project.id, resultData);
  };
  
  // Use project result if available, otherwise simulation
  const resultSource = project.rouletteResult ? project.rouletteResult : simulationData;
  const steps = resultSource.steps || [];
  const finalWinners = resultSource.winners || [];
  
  // Replay Logic
  useEffect(() => {
      let interval;
      if (replayState.active && replayState.autoPlay && replayState.stepIndex < steps.length - 1) {
           interval = setInterval(() => {
               setReplayState(prev => ({...prev, stepIndex: prev.stepIndex + 1}));
           }, (config.replaySpeed || 2) * 1000);
      }
      return () => clearInterval(interval);
  }, [replayState.active, replayState.autoPlay, replayState.stepIndex, steps.length, config.replaySpeed]);


  const startReplay = () => {
      setReplayState({ active: true, stepIndex: -1, autoPlay: true, speed: config.replaySpeed });
  };
  
  // -- Render Sections --
  
  const renderConfigPanel = () => (
      <div className="bg-m3-surface-container p-6 rounded-[28px] mb-8 animate-fade-in border border-m3-outline-variant/30">
          <div className="flex gap-4 mb-6 border-b border-m3-outline-variant/20 pb-2">
              {[
                  {id: 'classic', label: t('rModeClassic')}, 
                  {id: 'multi', label: t('rModeMulti')}, 
                  {id: 'elim', label: t('rModeElim')}
              ].map(tab => (
                  <button 
                    key={tab.id}
                    onClick={() => { setActiveTab(tab.id); setConfig({...config, mode: tab.id}); }}
                    className={`pb-2 px-2 text-sm font-medium transition-all relative ${activeTab === tab.id ? 'text-google-blue' : 'text-m3-on-surface-variant'}`}
                  >
                     {tab.label}
                     {activeTab === tab.id && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-google-blue rounded-t-full" />}
                  </button>
              ))}
          </div>
          
          <div className="space-y-4">
              {activeTab === 'multi' && (
                  <div className="space-y-3">
                      <div className="flex justify-between items-center"><label className="text-sm font-medium">{t('rPrizes')}</label> <button onClick={() => setConfig({...config, prizes: [...(config.prizes||[]), {name: '', count: 1}]})} className="text-xs text-google-blue flex items-center gap-1"><Plus className="w-3 h-3"/> {t('rAddPrize')}</button></div>
                      {(config.prizes || []).map((prize, idx) => (
                          <div key={idx} className="flex gap-2">
                              <input type="text" value={prize.name} onChange={e => {const n=[...config.prizes]; n[idx].name=e.target.value; setConfig({...config, prizes:n})}} placeholder={t('rPrizeName')} className="flex-1 bg-m3-surface px-3 py-2 rounded-lg border border-m3-outline-variant/50 text-sm" />
                              <input type="number" value={prize.count} onChange={e => {const n=[...config.prizes]; n[idx].count=parseInt(e.target.value); setConfig({...config, prizes:n})}} className="w-20 bg-m3-surface px-3 py-2 rounded-lg border border-m3-outline-variant/50 text-sm" />
                              <button onClick={() => {const n=[...config.prizes]; n.splice(idx,1); setConfig({...config, prizes:n})}} className="text-m3-on-surface-variant hover:text-google-red"><Trash2 className="w-4 h-4" /></button>
                          </div>
                      ))}
                      <div className="flex gap-4 mt-4">
                          <label className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded bg-m3-surface hover:bg-m3-surface-container-high">
                              <input type="radio" checked={config.order !== 'rev'} onChange={() => setConfig({...config, order: 'fwd'})} /> {t('rOrderFwd')}
                          </label>
                           <label className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded bg-m3-surface hover:bg-m3-surface-container-high">
                              <input type="radio" checked={config.order === 'rev'} onChange={() => setConfig({...config, order: 'rev'})} /> {t('rOrderRev')}
                          </label>
                      </div>
                      <label className="flex items-center gap-2 text-sm mt-2">
                          <input type="checkbox" checked={config.allowRepeat} onChange={e => setConfig({...config, allowRepeat: e.target.checked})} /> {t('rAllowRepeat')}
                      </label>
                  </div>
              )}
              
              {activeTab === 'elim' && (
                  <div>
                       <label className="block text-sm font-medium mb-1">{t('rWinnersCount')}</label>
                       <input type="number" min="1" value={config.survivorCount} onChange={e => setConfig({...config, survivorCount: e.target.value})} className="w-full bg-m3-surface px-3 py-2 rounded-lg border border-m3-outline-variant/50" />
                  </div>
              )}
              
              <div className="pt-4 border-t border-m3-outline-variant/20">
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2"><Settings className="w-4 h-4" /> {t('rReplaySettings')}</h4>
                  <div className="flex items-center gap-6">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={config.enableReplay} onChange={e => setConfig({...config, enableReplay: e.target.checked})} className="accent-google-blue w-4 h-4" /> 
                          {t('rEnableReplay')}
                      </label>
                      {config.enableReplay && (
                          <div className="flex items-center gap-2">
                              <span className="text-xs">{t('rReplaySpeed')}</span>
                              <input type="range" min="0.5" max="5" step="0.5" value={config.replaySpeed} onChange={e => setConfig({...config, replaySpeed: parseFloat(e.target.value)})} className="w-24 accent-google-blue" />
                              <span className="text-xs font-mono">{config.replaySpeed}s</span>
                          </div>
                      )}
                  </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-m3-outline-variant/20">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={config.creatorWeightPublic} onChange={e => setConfig({...config, creatorWeightPublic: e.target.checked})} className="accent-google-blue w-4 h-4" /> 
                          {t('rCreatorWeightPublic')}
                    </label>
              </div>

              <button onClick={handleSaveConfig} className="w-full mt-4 py-3 bg-m3-primary-container text-m3-on-primary-container rounded-full font-medium text-sm hover:shadow-elevation-1 transition-all">
                  {t('rSaveConfig')}
              </button>
          </div>
      </div>
  );

  // -- Replay Overlay --
  if (replayState.active) {
      const currentStepData = replayState.stepIndex >= 0 ? steps[replayState.stepIndex] : null;
      const isEnded = replayState.stepIndex >= steps.length - 1;
      
      return (
          <div className="fixed inset-0 z-50 bg-m3-surface flex flex-col items-center justify-center p-6 animate-fade-in">
              <button onClick={() => setReplayState({...replayState, active: false})} className="absolute top-6 right-6 p-2 rounded-full hover:bg-m3-surface-container"><X className="w-6 h-6"/></button>
              
              {/* Step info */}
              <div className="text-center mb-10 w-full max-w-2xl">
                  {currentStepData ? (
                      <div className="animate-scale-in">
                          <div className="text-sm uppercase tracking-widest text-m3-on-surface-variant mb-2">{t('rStep')} {replayState.stepIndex + 1} / {steps.length}</div>
                          <div className={`text-3xl font-light mb-4 capitalize ${currentStepData.type === 'elim' ? 'text-google-red' : 'text-google-green'}`}>
                               {currentStepData.type === 'elim' ? t('rEliminating') : t('rDrawing')} {currentStepData.type !== 'elim' && (currentStepData.label || '').replace(t('rWinner')+': ', '')}
                          </div>
                          
                          <div className="bg-m3-surface-container-high p-8 rounded-[40px] shadow-elevation-2 mb-6 transform transition-all">
                               <div className="text-6xl font-normal mb-2">{currentStepData.target?.name}</div>
                               <div className="text-xl font-mono text-m3-on-surface-variant opacity-50">{currentStepData.detail}</div>
                          </div>
                      </div>
                  ) : (
                      <div className="text-2xl text-m3-on-surface-variant">{t('rSetup')} / {t('rCalculating')}</div>
                  )}
              </div>
              
              {/* Controls */}
              <div className="flex items-center gap-6 bg-m3-surface-container-low px-8 py-4 rounded-full shadow-elevation-1">
                  <button onClick={() => setReplayState({...replayState, autoPlay: !replayState.autoPlay})} className="p-3 bg-m3-primary text-m3-on-primary rounded-full">
                      {replayState.autoPlay ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
                  </button>
                  
                  <div className="flex flex-col w-32">
                      <input 
                        type="range" min="0" max={steps.length > 0 ? steps.length - 1 : 0} 
                        value={replayState.stepIndex} 
                        onChange={e => setReplayState({...replayState, stepIndex: parseInt(e.target.value)})}
                        className="w-full accent-google-blue h-1"
                      />
                      <div className="flex justify-between text-[10px] mt-1 opacity-50">
                          <span>0</span><span>{steps.length}</span>
                      </div>
                  </div>
                  
                  <div className="flex items-center gap-2 border-l border-m3-outline-variant/30 pl-6">
                      <span className="text-xs font-bold uppercase mr-2">Speed</span>
                      {[1, 0.5, 0.1].map(s => (
                          <button key={s} onClick={() => setConfig({...config, replaySpeed: s})} className={`text-xs w-8 h-8 rounded-full border ${config.replaySpeed === s ? 'bg-m3-primary-container border-transparent' : 'border-m3-outline-variant'}`}>
                              {s === 1 ? '1x' : s === 0.5 ? '2x' : 'MAX'}
                          </button>
                      ))}
                  </div>

                  <button onClick={() => setReplayState({...replayState, stepIndex: steps.length - 1})} className="p-2 hover:bg-m3-surface-container rounded-full text-m3-on-surface-variant" title={t('rSkip')}>
                      <FastForward className="w-5 h-5" />
                  </button>
              </div>
              
              {isEnded && (
                  <div className="mt-8 animate-fade-in delay-500">
                       <button onClick={() => setReplayState({...replayState, active: false})} className="px-8 py-3 bg-m3-surface-container-high border border-m3-outline-variant hover:bg-m3-surface-container-highest rounded-full font-medium">
                           {t('rViewResults')}
                       </button>
                  </div>
              )}
          </div>
      );
  }

  // -- Main View --

  if (isFinished && !replayState.active) {
      return (
        <div className="space-y-6 animate-fade-in relative pb-10">
            <div className="bg-m3-surface-container-high rounded-[32px] p-10 text-center border border-google-yellow/50 shadow-elevation-1">
                 <div className="mb-6"><Crown className="w-12 h-12 inline-block text-google-yellow" /></div>
                 <h2 className="text-3xl font-normal mb-8">{t('rDrawComplete')}</h2>
                 
                 {config.enableReplay && (
                    <button onClick={startReplay} className="mb-8 px-6 py-3 bg-m3-surface shadow-elevation-1 rounded-full flex items-center gap-2 mx-auto hover:bg-m3-surface-container-high transition-colors text-google-blue">
                        <RotateCcw className="w-5 h-5"/> {t('rStartReplay')}
                    </button>
                 )}

                 <div className="grid gap-4 max-w-2xl mx-auto">
                     {finalWinners.map((w, i) => (
                         <div key={i} className="flex justify-between items-center bg-m3-surface p-4 rounded-xl border border-m3-outline-variant/30">
                             <div className="flex items-center gap-3">
                                 <div className="w-8 h-8 rounded-full bg-google-yellow/20 flex items-center justify-center text-google-yellow font-bold text-sm">#{w.rank || i+1}</div>
                                 <div className="text-left">
                                     <div className="font-bold text-lg">{w.name}</div>
                                     <div className="text-xs text-m3-on-surface-variant">{w.uid.slice(0,4)}...</div>
                                 </div>
                             </div>
                             <div className="text-right">
                                 <div className="font-mono text-xl text-google-yellow">{w.prize || 'Winner'}</div>
                             </div>
                         </div>
                     ))}
                 </div>
            </div>
            
            <InfoCard title={t('distributionChart')} steps={[t('availAfterResults')]} />
        </div>
      );
  }

  return (
    <div className="space-y-8 animate-fade-in relative pb-10">
      
      {/* Setup / Config (Admin only) */}
      {!isFinished && isOwner && renderConfigPanel()}
      
      {/* Header Stat Board (Same as before but simplified) */}
      <div className="bg-m3-surface-container rounded-[32px] p-8 md:p-10 relative overflow-hidden">
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="w-full md:w-auto">
              <h2 className="text-3xl font-normal mb-2 flex items-center gap-3 text-m3-on-surface"><Dices className="w-8 h-8 text-google-yellow" /> {t('fairRoulette')}</h2>
              <div className="text-sm text-m3-on-surface-variant mt-2 max-w-md">{t('rouletteHelpSteps')[1]}</div>
              <div className="flex items-center gap-4 mt-6 bg-m3-surface p-4 rounded-2xl border border-m3-outline-variant/30 overflow-x-auto">
                <div className="text-center px-2"><div className="text-xs font-bold uppercase text-m3-on-surface-variant">{t('total')}</div><div className="text-xl font-mono text-m3-on-surface">{simulationData.totalValue}</div></div>
                <div className="text-m3-on-surface-variant font-light text-2xl">%</div>
                <div className="text-center px-2"><div className="text-xs font-bold uppercase text-m3-on-surface-variant">{t('people')}</div><div className="text-xl font-mono text-m3-on-surface">{participants.length}</div></div>
              </div>
            </div>
            
            {isOwner && !isFinished && !isStopped && (
                 <button onClick={handleDraw} disabled={participants.length < 1} className="w-full md:w-auto px-8 py-4 bg-google-yellow text-gray-900 font-medium rounded-2xl shadow-elevation-2 hover:shadow-elevation-3 transition-shadow flex items-center justify-center gap-2">
                     <Crown className="w-5 h-5" /> {t('rStartDraw')}
                 </button>
            )}
             {isOwner && !isFinished && isStopped && (
                 <div className="text-center">
                     <div className="mb-2 text-google-red font-bold">Project Stopped</div>
                     <button onClick={handleDraw} className="px-6 py-2 bg-google-yellow rounded-full">{t('rStartDraw')}</button>
                 </div>
            )}
          </div>
      </div>

      {/* Entry Form (If active) */}
      {!isFinished && !isStopped && (
        <div className="bg-m3-surface p-8 rounded-[28px] border border-m3-outline-variant/50 relative overflow-hidden">
             {/* Same entry form as before... */}
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

      {/* Participants List */}
      <div className="grid md:grid-cols-2 gap-6 mt-8">
        <div className="bg-m3-surface border border-m3-outline-variant/20 rounded-[24px] overflow-hidden p-6">
          <h3 className="font-medium text-m3-on-surface mb-4">{t('participants')} ({participants.length})</h3>
          <div className="max-h-[300px] overflow-y-auto pr-2">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase text-m3-on-surface-variant border-b border-m3-outline-variant/20"><tr><th className="px-4 py-3 font-medium">#</th><th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 text-right font-medium">Val</th></tr></thead>
              <tbody>
                {sortedParticipants.map((p, idx) => (
                  <tr key={p.id || idx} className={`border-b border-m3-outline-variant/10 last:border-0`}>
                    <td className="px-4 py-3 text-m3-on-surface-variant font-mono">{idx + 1}</td>
                    <td className={`px-4 py-3 ${p.uid === user?.uid ? 'font-bold text-google-blue' : 'text-m3-on-surface'}`}>{p.name} <span className="text-[10px] text-m3-on-surface-variant ml-2">{p.isWinner && '🏆'}</span></td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-m3-on-surface-variant">
                        {(isFinished || p.uid === user?.uid || (config.creatorWeightPublic && p.uid === project.creatorId)) ? p.value : '***'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Placeholder for simple chart */}
        <div className="bg-m3-surface-container-high rounded-[24px] p-6 text-m3-on-surface flex items-center justify-center">
            <div className="text-center opacity-50">
                <ChartLine className="w-12 h-12 mx-auto mb-2" />
                <div>{t('distributionChart')}</div> 
            </div>
        </div>
      </div>
      
    </div>
  );
}
