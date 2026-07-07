import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Crown, Dices, ChartLine, Lock, Plus, Trash2, Settings, Play, FastForward, RotateCcw, X, Pause } from './Icons';
import { InfoCard } from './InfoCard';
import { useUI } from './UIContext';
import {
  createParticipantValueDistribution,
  createRouletteParticipantSummary,
  normalizeRouletteConfigInput,
  normalizeRoulettePrizeCountInput,
} from '../lib/projectDomain';

const REPEAT_SEED_MODULUS = 2147483647;
const REPEAT_SEED_MULTIPLIER = 16807;
const DEFAULT_ROULETTE_CONFIG = {
  mode: 'classic',
  prizes: [],
  survivorCount: 1,
  order: 'fwd',
  allowRepeat: false,
  enableReplay: false,
  replaySpeed: 2,
  creatorWeightPublic: false,
};

function createInitialRouletteConfig(project) {
  return normalizeRouletteConfigInput({ ...DEFAULT_ROULETTE_CONFIG, ...(project.rouletteConfig || {}) });
}

function normalizeRepeatSeed(seed) {
  const normalized = seed % REPEAT_SEED_MODULUS;
  return normalized > 0 ? normalized : normalized + REPEAT_SEED_MODULUS - 1;
}

function advanceRepeatSeed(seed) {
  return (seed * REPEAT_SEED_MULTIPLIER) % REPEAT_SEED_MODULUS;
}

function getRepeatIndex(initialSeed, poolLength, drawIndex) {
  let seed = normalizeRepeatSeed(initialSeed);
  for (let i = 0; i <= drawIndex; i += 1) {
      seed = advanceRepeatSeed(seed);
  }
  return Math.abs(seed - 1) % poolLength;
}

export default function RouletteView({ user, isAdmin, project, participants, isStopped, isFinished, isOwner, actions, t }) {
  const { showToast } = useUI();
  
  // -- Local User State --
  const [joinName, setJoinName] = useState(user.displayName || '');
  const [joinValue, setJoinValue] = useState(50);
  const [isJoiningRoulette, setIsJoiningRoulette] = useState(false);
  const isJoiningRouletteRef = useRef(false);
  const [isDrawingRoulette, setIsDrawingRoulette] = useState(false);
  const isDrawingRouletteRef = useRef(false);
  const [isSavingRouletteConfig, setIsSavingRouletteConfig] = useState(false);
  const isSavingRouletteConfigRef = useRef(false);
  
  // -- Config State --
  const [activeTab, setActiveTab] = useState(() => createInitialRouletteConfig(project).mode || 'classic');
  const [config, setConfig] = useState(() => createInitialRouletteConfig(project));
  const simulationConfig = useMemo(() => normalizeRouletteConfigInput(config), [config]);

  // -- Replay State --
  const [replayState, setReplayState] = useState({ 
    active: false, 
    stepIndex: -1, 
    autoPlay: false,
    speed: 2 
  });

  // -- Derived Data --
  const participantSummary = useMemo(
      () => createRouletteParticipantSummary(participants, user, project),
      [participants, user, project],
  );
  const sortedParticipants = useMemo(() => [...participantSummary.participants].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0)), [participantSummary.participants]);
  const participantCount = participantSummary.participantCount;
  const hasJoined = Boolean(participantSummary.currentParticipant);
  const distribution = useMemo(() => createParticipantValueDistribution(sortedParticipants), [sortedParticipants]);
  
  // -- Logic Helpers --
  const handleJoinRoulette = async () => {
      if (isJoiningRouletteRef.current) return;

      isJoiningRouletteRef.current = true;
      setIsJoiningRoulette(true);
      try {
          await actions.handleJoinRoulette(project.id, joinName, joinValue);
      } catch (error) {
          console.error(error);
          showToast(t('participantJoinFailed'), 'error');
      } finally {
          isJoiningRouletteRef.current = false;
          setIsJoiningRoulette(false);
      }
  };
  
  // Calculate simulation steps and final results
  const simulationData = useMemo(() => {
      // 1. Calculate Initial Total
      const initialTotal = sortedParticipants.reduce((acc, curr) => acc + (parseInt(curr.value, 10) || 0), 0);
      
      const steps = [];
      const winners = [];
      
      // Clone for mutation
      let pool = sortedParticipants.map(p => ({...p})); 
      let currentSum = initialTotal;
      
      const getNextIndex = (currentPoolLength) => {
          // STRICTLY use Sum % Length per user request.
          // This ensures the result is purely derived from the current pool's remaining sum.
          return Math.abs(currentSum) % currentPoolLength;
      };

      const mode = simulationConfig.mode || 'classic';
      
      if (mode === 'classic') {
          if (pool.length > 0) {
              // Classic Mode: Directly use Total Sum Modulo Count
              const idx = getNextIndex(pool.length);
              const winner = pool[idx];
              steps.push({ 
                  type: 'win', 
                  step: 1, 
                  target: winner, 
                  label: t('rWinner'),
                  detail: `Index: ${idx} (Sum ${currentSum} % ${pool.length})` 
	              });
	              winners.push({...winner, rank: 1, prize: t('defaultWinner')});
          }
      } 
      else if (mode === 'multi') {
          // Flatten prizes
          let prizeQueue = [];
          (simulationConfig.prizes || []).forEach(p => {
              for(let i=0; i<normalizeRoulettePrizeCountInput(p.count); i++) prizeQueue.push(p.name);
          });
          
          if (simulationConfig.order === 'rev') prizeQueue = prizeQueue.reverse();
          
          const isRepeat = simulationConfig.allowRepeat;

          for (let i = 0; i < prizeQueue.length; i++) {
               if (pool.length === 0) break;

               const prizeName = prizeQueue[i];
               const idx = isRepeat ? getRepeatIndex(initialTotal, pool.length, i) : getNextIndex(pool.length);
               const winner = pool[idx];

               steps.push({
                   type: 'win',
                   step: i + 1,
                   target: winner,
                   label: `${t('rWinner')}: ${prizeName}`,
                   detail: isRepeat 
                      ? `Random: ${idx}` 
                      : `Index: ${idx} (Sum ${currentSum} % ${pool.length})`
               });
               winners.push({...winner, prize: prizeName, rank: i+1});

               if (!isRepeat) {
                   // Remove from pool and subtract value (As requested)
                   const val = parseInt(winner.value, 10) || 0;
                   currentSum -= val;
                   pool.splice(idx, 1);
               }
          }
      }
      else if (mode === 'elim') {
          let survivorsNeeded = simulationConfig.survivorCount;
          if (survivorsNeeded < 1) survivorsNeeded = 1;
          if (survivorsNeeded >= pool.length && pool.length > 0) survivorsNeeded = Math.max(1, pool.length - 1); 
          
          let round = 1;
          // Phase 1: Eliminate until survivors count reached
          // Elimination naturally implies NO repeats
          
          let loopGuard = 0;
          while (pool.length > survivorsNeeded && loopGuard < 1000) {
               loopGuard++;
               const idx = getNextIndex(pool.length);
               const loser = pool[idx];
               
               if (!loser) break; 

               steps.push({
                   type: 'elim',
                   step: round++,
                   target: loser,
                   label: t('rEliminated'),
                   detail: `Index: ${idx} (Sum ${currentSum} % ${pool.length})`
               });
               
               // Remove loser and subtract value
               const val = parseInt(loser.value, 10) || 0;
               currentSum -= val;
               pool.splice(idx, 1);
          }
          
          // Phase 2: Remainder are winners
          // Pick them out one by one to give them an order/rank
          loopGuard = 0;
          while (pool.length > 0 && loopGuard < 1000) {
              loopGuard++;
              const idx = getNextIndex(pool.length);
              const winner = pool[idx];
              if (!winner) break;

               steps.push({
                   type: 'win',
                   step: round++,
                   target: winner,
                   label: t('rWinner'),
                   detail: `Survivor`
               });
               winners.push(winner);

               const val = parseInt(winner.value, 10) || 0;
               currentSum -= val;
               pool.splice(idx, 1);
          }
      }
      
      return { steps, winners, totalValue: initialTotal };
  }, [sortedParticipants, simulationConfig, t]);

  // -- Handlers --
  
  const handleSaveConfig = async () => {
      if (isSavingRouletteConfigRef.current) return;

      isSavingRouletteConfigRef.current = true;
      setIsSavingRouletteConfig(true);
      try {
          const normalizedConfig = normalizeRouletteConfigInput({ ...config, mode: activeTab });
          await actions.handleUpdateRouletteConfig(project.id, normalizedConfig);
          showToast(t('rSaveConfig'), 'success');
      } catch (error) {
          console.error(error);
          showToast(t('rouletteConfigSaveFailed'), 'error');
      } finally {
          isSavingRouletteConfigRef.current = false;
          setIsSavingRouletteConfig(false);
      }
  };
  
  const handleDraw = async () => {
      if (isDrawingRouletteRef.current) return;
      if (sortedParticipants.length === 0) return;

      isDrawingRouletteRef.current = true;
      setIsDrawingRoulette(true);
      try {
          const normalizedConfig = normalizeRouletteConfigInput({ ...config, mode: activeTab });
          await actions.handleSaveRouletteResult(project.id, normalizedConfig);
      } catch (error) {
          console.error(error);
          showToast(t('resultGenerationFailed'), 'error');
      } finally {
          isDrawingRouletteRef.current = false;
          setIsDrawingRoulette(false);
      }
  };
  
  // Use project result if available, otherwise simulation
  const resultSource = project.rouletteResult ? project.rouletteResult : simulationData;
  const steps = resultSource.steps || [];
  const finalWinners = resultSource.winners || [];
  const rouletteAuditSteps = project.rouletteResult?.steps || steps;

  const getRouletteStepLabel = (step) => (
    step?.type === 'elim' ? t('rouletteAuditEliminated') : t('rouletteAuditWinner')
  );

  const formatRouletteStepDetail = (step) => {
    if (!step) return '';
    if (
      Number.isFinite(Number(step.selectedIndex))
      && Number.isFinite(Number(step.sum))
      && Number.isFinite(Number(step.remainingCount))
    ) {
      return t('rouletteAuditFormula', {
        index: step.selectedIndex,
        sum: step.sum,
        count: step.remainingCount,
      });
    }
    return step.detail || '';
  };
  
  // Replay Logic
  useEffect(() => {
      let interval;
      if (replayState.active && replayState.autoPlay && replayState.stepIndex < steps.length - 1) {
           interval = setInterval(() => {
               setReplayState(prev => ({...prev, stepIndex: prev.stepIndex + 1}));
           }, simulationConfig.replaySpeed * 1000);
      }
      return () => clearInterval(interval);
  }, [replayState.active, replayState.autoPlay, replayState.stepIndex, steps.length, simulationConfig.replaySpeed]);


  const startReplay = () => {
      setReplayState({ active: true, stepIndex: -1, autoPlay: true, speed: simulationConfig.replaySpeed });
  };
  
  // -- Render Sections --
  
  const renderConfigPanel = () => (
      <div className="app-card mb-8 animate-fade-in p-5 sm:p-6">
          <div className="flex gap-4 mb-6 border-b border-m3-outline-variant/20 pb-2">
              {[
                  {id: 'classic', label: t('rModeClassic')}, 
                  {id: 'multi', label: t('rModeMulti')}, 
                  {id: 'elim', label: t('rModeElim')}
              ].map(tab => (
                  <button 
                    key={tab.id}
                    onClick={() => { setActiveTab(tab.id); setConfig({...config, mode: tab.id}); }}
                    disabled={isSavingRouletteConfig}
                    className={`touch-target relative px-3 pb-2 text-sm font-medium transition-all ${activeTab === tab.id ? 'text-google-blue' : 'text-m3-on-surface-variant'}`}
                  >
                     {tab.label}
                     {activeTab === tab.id && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-google-blue rounded-t-full" />}
                  </button>
              ))}
          </div>
          
          <div className="space-y-4">
              {activeTab === 'multi' && (
                  <div className="space-y-3">
                      <div className="flex justify-between items-center"><label className="text-sm font-medium">{t('rPrizes')}</label> <button onClick={() => setConfig({...config, prizes: [...(config.prizes||[]), {name: '', count: 1}]})} disabled={isSavingRouletteConfig} className="app-button-quiet px-3 text-xs text-google-blue"><Plus className="w-3 h-3"/> {t('rAddPrize')}</button></div>
                      {(config.prizes || []).map((prize, idx) => (
                          <div key={idx} className="flex gap-2">
                              <input type="text" value={prize.name} onChange={e => {const n=[...config.prizes]; n[idx].name=e.target.value; setConfig({...config, prizes:n})}} disabled={isSavingRouletteConfig} placeholder={t('rPrizeName')} className="app-input flex-1" />
                              <input type="number" min="0" max="99" value={prize.count} onChange={e => {const n=[...config.prizes]; n[idx].count=e.target.value; setConfig({...config, prizes:n})}} disabled={isSavingRouletteConfig} className="app-input w-24" />
                              <button onClick={() => {const n=[...config.prizes]; n.splice(idx,1); setConfig({...config, prizes:n})}} disabled={isSavingRouletteConfig} className="app-icon-button hover:bg-google-red/10 hover:text-google-red"><Trash2 className="w-4 h-4" /></button>
                          </div>
                      ))}
                      <div className="flex gap-4 mt-4">
                          <label className="app-chip cursor-pointer bg-m3-surface hover:bg-m3-surface-container-high">
                              <input type="radio" checked={config.order !== 'rev'} onChange={() => setConfig({...config, order: 'fwd'})} disabled={isSavingRouletteConfig} /> {t('rOrderFwd')}
                          </label>
                           <label className="app-chip cursor-pointer bg-m3-surface hover:bg-m3-surface-container-high">
                              <input type="radio" checked={config.order === 'rev'} onChange={() => setConfig({...config, order: 'rev'})} disabled={isSavingRouletteConfig} /> {t('rOrderRev')}
                          </label>
                      </div>
                      <label className="flex items-center gap-2 text-sm mt-2">
                          <input type="checkbox" checked={config.allowRepeat} onChange={e => setConfig({...config, allowRepeat: e.target.checked})} disabled={isSavingRouletteConfig} /> {t('rAllowRepeat')}
                      </label>
                  </div>
              )}
              
              {activeTab === 'elim' && (
                  <div>
                       <label className="block text-sm font-medium mb-1">{t('rWinnersCount')}</label>
                       <input type="number" min="1" value={config.survivorCount} onChange={e => setConfig({...config, survivorCount: e.target.value})} disabled={isSavingRouletteConfig} className="app-input" />
                  </div>
              )}
              
              <div className="pt-4 border-t border-m3-outline-variant/20">
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2"><Settings className="w-4 h-4" /> {t('rReplaySettings')}</h4>
                  <div className="flex items-center gap-6">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={config.enableReplay} onChange={e => setConfig({...config, enableReplay: e.target.checked})} disabled={isSavingRouletteConfig} className="accent-google-blue w-4 h-4" />
                          {t('rEnableReplay')}
                      </label>
                      {config.enableReplay && (
                          <div className="flex items-center gap-2">
                              <span className="text-xs">{t('rReplaySpeed')}</span>
                              <input type="range" min="0.5" max="5" step="0.5" value={config.replaySpeed} onChange={e => setConfig({...config, replaySpeed: parseFloat(e.target.value)})} disabled={isSavingRouletteConfig} className="w-24 accent-google-blue" />
                              <span className="text-xs font-mono">{config.replaySpeed}s</span>
                          </div>
                      )}
                  </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-m3-outline-variant/20">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={config.creatorWeightPublic} onChange={e => setConfig({...config, creatorWeightPublic: e.target.checked})} disabled={isSavingRouletteConfig} className="accent-google-blue w-4 h-4" />
                          {t('rCreatorWeightPublic')}
                    </label>
              </div>

              <button onClick={handleSaveConfig} disabled={isSavingRouletteConfig} aria-busy={isSavingRouletteConfig} className="app-button-tonal mt-4 w-full">
                  {isSavingRouletteConfig ? t('processing') : t('rSaveConfig')}
              </button>
          </div>
      </div>
  );

  const renderDistributionChart = () => (
      <div className="app-card-quiet p-6 text-m3-on-surface" aria-label={t('distributionChart')}>
          <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-google-yellow/15 text-google-yellow">
                      <ChartLine className="h-5 w-5" />
                  </span>
                  <div>
                      <h3 className="text-sm font-semibold text-m3-on-surface">{t('distributionChart')}</h3>
                      <p className="text-xs text-m3-on-surface-variant">{t('people')}: {distribution.participantCount}</p>
                  </div>
              </div>
          </div>

          {!isFinished ? (
              <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-m3-outline-variant/55 bg-m3-surface-container/35 p-5 text-center text-sm text-m3-on-surface-variant">
                  <Lock className="h-5 w-5 text-google-yellow" />
                  <span>{t('availAfterResults')}</span>
              </div>
          ) : distribution.participantCount === 0 ? (
              <div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-m3-outline-variant/55 bg-m3-surface-container/35 p-5 text-center text-sm text-m3-on-surface-variant">
                  {t('notEnoughData')}
              </div>
          ) : (
              <div className="grid gap-3">
                  {distribution.buckets.map((bucket) => {
                      const barWidth = distribution.maxCount > 0 ? `${(bucket.count / distribution.maxCount) * 100}%` : '0%';
                      return (
                          <div key={bucket.key} className="grid gap-1.5">
                              <div className="flex items-center justify-between gap-3 text-xs">
                                  <span className="font-medium text-m3-on-surface">{t('valueDistributionBucket', { min: bucket.min, max: bucket.max })}</span>
                                  <span className="font-mono text-m3-on-surface-variant">{bucket.count} · {Math.round(bucket.percent * 100)}%</span>
                              </div>
                              <div className="h-2.5 overflow-hidden rounded-full bg-m3-surface-container-high">
                                  <div className="h-full rounded-full bg-google-yellow transition-[width] duration-300" style={{ width: barWidth }} />
                              </div>
                          </div>
                      );
                  })}
              </div>
          )}
      </div>
  );

  // -- Replay Overlay --
  if (replayState.active) {
      const currentStepData = replayState.stepIndex >= 0 ? steps[replayState.stepIndex] : null;
      const isEnded = replayState.stepIndex >= steps.length - 1;
      
      return (
          <div className="fixed inset-0 z-50 bg-m3-surface flex flex-col items-center justify-center p-6 animate-fade-in">
              <button onClick={() => setReplayState({...replayState, active: false})} className="app-icon-button absolute right-6 top-6"><X className="w-6 h-6"/></button>
              
              {/* Step info */}
              <div className="text-center mb-10 w-full max-w-2xl">
                  {currentStepData ? (
                      <div className="animate-scale-in">
                          <div className="text-sm uppercase tracking-widest text-m3-on-surface-variant mb-2">{t('rStep')} {replayState.stepIndex + 1} / {steps.length}</div>
                          <div className={`text-3xl font-light mb-4 capitalize ${currentStepData.type === 'elim' ? 'text-google-red' : 'text-google-green'}`}>
                               {currentStepData.type === 'elim' ? t('rEliminating') : t('rDrawing')} {currentStepData.type !== 'elim' && (currentStepData.prize || (currentStepData.label || '').replace(t('rWinner')+': ', ''))}
                          </div>
                          
                          <div className="app-card mb-6 p-8 transform transition-all">
                               <div className="text-6xl font-medium mb-2">{currentStepData.participantName || currentStepData.target?.name}</div>
                               <div className="text-xl font-mono text-m3-on-surface-variant opacity-50">{formatRouletteStepDetail(currentStepData)}</div>
                          </div>
                      </div>
                  ) : (
                      <div className="text-2xl text-m3-on-surface-variant">{t('rSetup')} / {t('rCalculating')}</div>
                  )}
              </div>
              
              {/* Controls */}
              <div className="app-card flex items-center gap-6 rounded-full px-8 py-4">
                  <button onClick={() => setReplayState({...replayState, autoPlay: !replayState.autoPlay})} className="app-icon-button border-transparent bg-m3-primary text-m3-on-primary hover:bg-m3-primary hover:text-m3-on-primary">
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
	                          <span className="text-xs font-bold uppercase mr-2">{t('replaySpeed')}</span>
                          {[1, 0.5, 0.1].map(s => (
                              <button key={s} onClick={() => setConfig({...config, replaySpeed: s})} className={`app-button min-w-12 border px-3 text-xs ${config.replaySpeed === s ? 'border-transparent bg-m3-primary-container' : 'border-m3-outline-variant'}`}>
	                                  {s === 1 ? '1x' : s === 0.5 ? '2x' : t('replayMaxSpeed')}
                              </button>
                          ))}
                  </div>

                  <button onClick={() => setReplayState({...replayState, stepIndex: steps.length - 1})} className="app-icon-button" title={t('rSkip')}>
                      <FastForward className="w-5 h-5" />
                  </button>
              </div>
              
              {isEnded && (
                  <div className="mt-8 animate-fade-in delay-500">
                       <button onClick={() => setReplayState({...replayState, active: false})} className="app-button-tonal px-8">
                           {t('rViewResults')}
                       </button>
                  </div>
              )}
          </div>
      );
  }

  // -- Main View --

  const renderResults = () => (
        <div className="mb-8 space-y-6 animate-fade-in relative">
            <div className="app-card border-google-yellow/50 p-8 text-center sm:p-10">
                 <div className="mb-6"><Crown className="w-12 h-12 inline-block text-google-yellow" /></div>
                 <h2 className="text-3xl font-medium mb-8">{t('rDrawComplete')}</h2>
                 
                 {config.enableReplay && (
                    <button onClick={startReplay} className="app-button-quiet mx-auto mb-8 bg-m3-surface text-google-blue shadow-elevation-1 hover:bg-m3-surface-container-high">
                        <RotateCcw className="w-5 h-5"/> {t('rStartReplay')}
                    </button>
                 )}

                 <div className="grid gap-4 max-w-2xl mx-auto">
                     {finalWinners.map((w, i) => (
                         <div key={i} className="app-card flex items-center justify-between p-4">
                             <div className="flex items-center gap-3">
                                 <div className="w-8 h-8 rounded-full bg-google-yellow/20 flex items-center justify-center text-google-yellow font-bold text-sm">#{w.rank || i+1}</div>
                                 <div className="text-left">
                                     <div className="font-bold text-lg">{w.name}</div>
                                     <div className="text-xs text-m3-on-surface-variant">{w.uid.slice(0,4)}...</div>
                                 </div>
                             </div>
                             <div className="text-right">
	                                 <div className="font-mono text-xl text-google-yellow">{w.prize || t('defaultWinner')}</div>
                             </div>
                         </div>
                     ))}
                 </div>
            </div>

            <div className="app-card p-5 text-left sm:p-6">
                 <div className="mb-4 flex flex-col gap-1">
                     <h3 className="text-lg font-medium text-m3-on-surface">{t('rouletteAuditTrail')}</h3>
                     <div className="text-xs text-m3-on-surface-variant">{t('rouletteAuditFormula', { index: 'i', sum: 'S', count: 'N' })}</div>
                 </div>

                 {rouletteAuditSteps.length === 0 ? (
                     <div className="rounded-lg border border-dashed border-m3-outline-variant/50 px-4 py-5 text-center text-sm text-m3-on-surface-variant">
                         {t('rouletteAuditEmpty')}
                     </div>
                 ) : (
                     <div className="grid gap-3">
                         {rouletteAuditSteps.map((step, index) => {
                             const actionLabel = getRouletteStepLabel(step);
                             const participantName = step.participantName || step.target?.name || '';
                             const participantValue = step.participantValue ?? step.target?.value ?? '';
                             return (
                                 <div key={`${step.participantId || step.target?.id || index}-${step.step || index}`} className="rounded-lg border border-m3-outline-variant/30 bg-m3-surface-container/40 px-4 py-3">
                                     <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                         <div>
                                             <div className="text-xs font-medium uppercase text-m3-on-surface-variant">{t('rouletteAuditStep', { step: step.step || index + 1 })}</div>
                                             <div className="mt-1 text-sm font-medium text-m3-on-surface">
                                                 {actionLabel}: {participantName}
                                             </div>
                                         </div>
                                         <div className="text-left text-xs text-m3-on-surface-variant sm:text-right">
                                             <div>{formatRouletteStepDetail(step)}</div>
                                             <div className="font-mono">{participantValue}</div>
                                         </div>
                                     </div>
                                 </div>
                             );
                         })}
                     </div>
                 )}
            </div>
        </div>
  );

  return (
    <div className="space-y-8 animate-fade-in relative pb-10">
      
      {isFinished && !replayState.active && renderResults()}
      
      {/* Setup / Config (Admin only) */}
      {!isFinished && isOwner && renderConfigPanel()}
      
      {/* Header Stat Board (Same as before but simplified) */}
      <div className="app-card relative overflow-hidden p-6 md:p-10">
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="w-full md:w-auto">
              <h2 className="text-3xl font-medium mb-2 flex items-center gap-3 text-m3-on-surface"><Dices className="w-8 h-8 text-google-yellow" /> {t('fairRoulette')}</h2>
              <div className="text-sm text-m3-on-surface-variant mt-2 max-w-md">{t('rouletteHelpSteps')[1]}</div>
              <div className="app-card flex items-center gap-4 mt-6 overflow-x-auto p-4">
                <div className="text-center px-2"><div className="text-xs font-bold uppercase text-m3-on-surface-variant">{t('total')}</div><div className="text-xl font-mono text-m3-on-surface">{simulationData.totalValue}</div></div>
                <div className="text-m3-on-surface-variant font-light text-2xl">%</div>
                <div className="text-center px-2"><div className="text-xs font-bold uppercase text-m3-on-surface-variant">{t('people')}</div><div className="text-xl font-mono text-m3-on-surface">{participantCount}</div></div>
              </div>
            </div>
            
            {isOwner && !isFinished && !isStopped && (
                 <button onClick={handleDraw} disabled={isDrawingRoulette || participantCount < 1} aria-busy={isDrawingRoulette} className="app-button w-full bg-google-yellow px-8 text-gray-900 hover:shadow-elevation-2 md:w-auto">
                     <Crown className="w-5 h-5" /> {isDrawingRoulette ? t('processing') : t('rStartDraw')}
                 </button>
            )}
             {isOwner && !isFinished && isStopped && (
                 <div className="text-center">
	                     <div className="mb-2 text-google-red font-bold">{t('projectStopped')}</div>
                     <button onClick={handleDraw} disabled={isDrawingRoulette} aria-busy={isDrawingRoulette} className="app-button bg-google-yellow px-6">{isDrawingRoulette ? t('processing') : t('rStartDraw')}</button>
                 </div>
            )}
          </div>
      </div>

      {/* Entry Form (If active) */}
      {!isFinished && !isStopped && (
        <div className="app-card relative overflow-hidden p-6 sm:p-8">
             {hasJoined ? (
                 <div className="text-center py-8">
                     <div className="w-16 h-16 bg-google-green/20 text-google-green rounded-full flex items-center justify-center mx-auto mb-4">
                         <Lock className="w-8 h-8" />
                     </div>
	                     <h3 className="text-xl font-medium mb-2">{t('youHaveJoined')}</h3>
	                     <p className="text-m3-on-surface-variant text-sm">{t('waitForDraw')}</p>
                 </div>
             ) : (
             <div className="flex flex-col md:flex-row gap-8 items-start">
                <div className="flex-1 w-full">
                  <h3 className="font-medium text-2xl text-m3-on-surface mb-2">{t('joinToPlay')}</h3>
                  <p className="text-m3-on-surface-variant text-sm mb-6">{t('rouletteCannotChange')} <span className="text-google-red font-bold">{t('cannotBeChanged')}</span>.</p>
                  <input type="text" value={joinName} onChange={e => setJoinName(e.target.value)} disabled={isJoiningRoulette} placeholder={t('entryNamePlaceholder')} className="app-input" />
                </div>
                <div className="app-card-quiet w-full p-6 md:w-1/2">
                  <div className="flex justify-between items-center mb-6"><label className="font-medium text-m3-on-surface-variant">{t('valueLabel')}</label><span className="text-4xl font-normal text-google-yellow">{joinValue}</span></div>
                  <input type="range" min="0" max="100" value={joinValue} onChange={e => setJoinValue(parseInt(e.target.value))} disabled={isJoiningRoulette} className="w-full h-2 bg-m3-outline-variant rounded-lg appearance-none cursor-pointer accent-google-yellow" />
                  <button onClick={handleJoinRoulette} disabled={isJoiningRoulette} aria-busy={isJoiningRoulette} className="app-button mt-8 w-full bg-google-yellow text-lg text-gray-900 hover:shadow-elevation-1">{isJoiningRoulette ? t('processing') : t('submitEntry')}</button>
                </div>
              </div>
             )}
        </div>
      )}

      {/* Participants List */}
      <div className="grid md:grid-cols-2 gap-6 mt-8">
        <div className="app-card overflow-hidden p-6">
          <h3 className="font-medium text-m3-on-surface mb-4">{t('participants')} ({participantCount})</h3>
          <div className="max-h-[300px] overflow-y-auto pr-2">
            <table className="w-full text-sm text-left">
	              <thead className="text-xs uppercase text-m3-on-surface-variant border-b border-m3-outline-variant/20"><tr><th className="px-4 py-3 font-medium">#</th><th className="px-4 py-3 font-medium">{t('nameLabel')}</th><th className="px-4 py-3 text-right font-medium">{t('shortValueLabel')}</th></tr></thead>
              <tbody>
                {sortedParticipants.map((p, idx) => (
                  <tr key={p.id || idx} className={`border-b border-m3-outline-variant/10 last:border-0`}>
                    <td className="px-4 py-3 text-m3-on-surface-variant font-mono">{idx + 1}</td>
                    <td className={`px-4 py-3 ${p.isCurrentUser ? 'font-bold text-google-blue' : 'text-m3-on-surface'}`}>{p.name} {p.isWinner && <Crown className="ml-2 inline h-4 w-4 text-google-yellow" />}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-m3-on-surface-variant">
                        {(isFinished || p.isCurrentUser || (config.creatorWeightPublic && p.isProjectCreator)) ? p.value : '***'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        
        {renderDistributionChart()}
      </div>
      
    </div>
  );
}
