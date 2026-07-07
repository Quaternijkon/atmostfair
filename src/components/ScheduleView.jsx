import React, { useRef, useState, useMemo } from 'react';
import { CalendarClock, CheckSquare, X, ChartLine, Lock } from './Icons';
import { InfoCard } from './InfoCard';
import { getAppLocale } from '../lib/locale';
import {
  createDateRangeDays,
  createScheduleHeatmapData,
  createScheduleConfigData,
  createScheduleRecommendationSummary,
  createScheduleSubmissionSummary,
} from '../lib/projectDomain';
import { addDaysIsoDate, nowMs, todayIsoDate } from '../lib/time';
import { useUI } from './UIContext';

function createDefaultScheduleConfig() {
  return {
    mode: 'date',
    start: todayIsoDate(),
    end: addDaysIsoDate(7),
    deadline: ''
  };
}

function createTimeRange(date, ranges) {
  const index = ranges.filter((range) => range.date === date).length + 1;
  return { date, start: '09:00', end: '10:00', id: `${date}-range-${index}` };
}

export default function ScheduleView({ user, isAdmin, project, submissions, isStopped, isFinished, isOwner, actions, t }) {
  const [viewHeatmap, setViewHeatmap] = useState(false);
  const { showToast } = useUI();
  const appLocale = getAppLocale(t);
  const formatDate = (date, options) => new Date(date).toLocaleDateString(appLocale, options);

  // Configuration State
  const [config, setConfig] = useState(() => project.scheduleConfig || createDefaultScheduleConfig());

  // User Submission State
  const submissionSummary = useMemo(
      () => createScheduleSubmissionSummary(submissions, user, config),
      [submissions, user, config],
  );
  const mySubmission = submissionSummary.mySubmission;
  const [myAvailability, setMyAvailability] = useState(mySubmission?.availability || []); // Array depends on mode
  const [isSubmittingSchedule, setIsSubmittingSchedule] = useState(false);
  const isSubmittingScheduleRef = useRef(false);
  const [isSavingScheduleConfig, setIsSavingScheduleConfig] = useState(false);
  const isSavingScheduleConfigRef = useRef(false);

  // Helper: Date Range Generator
  const dates = useMemo(() => {
     return createDateRangeDays(config);
  }, [config]);

  const hasConfig = !!project.scheduleConfig;
  const isDeadlinePassed = config.deadline && nowMs() > new Date(config.deadline).getTime();
  const canEdit = !isStopped && !isFinished && (!isDeadlinePassed || isOwner);

  // --- Handlers ---

  const handleSaveConfig = async () => {
    if (isSavingScheduleConfigRef.current) return;

    const scheduleConfig = createScheduleConfigData(config);
    if (!scheduleConfig) {
      showToast(t('rangeError'), 'error');
      return;
    }

    isSavingScheduleConfigRef.current = true;
    setIsSavingScheduleConfig(true);
    try {
      await actions.handleUpdateScheduleConfig(project.id, scheduleConfig);
    } catch (error) {
      console.error(error);
      showToast(t('scheduleConfigSaveFailed'), 'error');
    } finally {
      isSavingScheduleConfigRef.current = false;
      setIsSavingScheduleConfig(false);
    }
  };

  const handleSubmit = async () => {
      if (isSubmittingScheduleRef.current) return;

      isSubmittingScheduleRef.current = true;
      setIsSubmittingSchedule(true);
      try {
          await actions.handleSubmitSchedule(project.id, myAvailability);
      } catch (error) {
          console.error(error);
          showToast(t('scheduleSubmitFailed'), 'error');
      } finally {
          isSubmittingScheduleRef.current = false;
          setIsSubmittingSchedule(false);
      }
  };

  const toggleDate = (date) => {
      if (!canEdit) return;
      setMyAvailability(prev => {
          if (prev.includes(date)) return prev.filter(d => d !== date);
          return [...prev, date];
      });
  };

  const toggleHalfDay = (date, slot) => {
      if (!canEdit) return;
      const key = `${date}_${slot}`;
      setMyAvailability(prev => {
          if (prev.includes(key)) return prev.filter(k => k !== key);
          return [...prev, key];
      });
  };

  const addTimeRange = (date) => {
      if (!canEdit) return;
      setMyAvailability(prev => [...prev, createTimeRange(date, prev)]);
  };

  const removeTimeRange = (id) => {
      if (!canEdit) return;
      setMyAvailability(prev => prev.filter(r => r.id !== id));
  };

  const updateTimeRange = (id, field, value) => {
      if (!canEdit) return;
      setMyAvailability(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  // --- Heatmap Logic ---
  const heatmapData = useMemo(() => createScheduleHeatmapData(submissions, config), [submissions, config]);

  const maxCount = Math.max(...Object.values(heatmapData), 1);
  const getColor = (count) => {
      if (!count) return 'bg-m3-surface-container';
      const alpha = Math.max(0.1, count / maxCount);
      return `rgba(66, 133, 244, ${alpha})`; // Google Blue with alpha
  };

  const scheduleSummary = useMemo(
      () => createScheduleRecommendationSummary(submissions, config, 3),
      [submissions, config],
  );

  const formatRecommendationLabel = (recommendation) => {
      const dateLabel = formatDate(recommendation.date, { weekday: 'short', month: 'numeric', day: 'numeric' });
      if (config.mode === 'half') return `${dateLabel} · ${t(recommendation.slot)}`;
      if (config.mode === 'time') return `${dateLabel} · ${recommendation.start} - ${recommendation.end}`;
      return dateLabel;
  };


  // --- Render Sections ---

  if (!hasConfig && isOwner) {
      return (
          <div className="app-card animate-fade-in p-6 sm:p-8">
              <h2 className="text-2xl font-medium mb-6 flex items-center gap-2"><CalendarClock className="w-6 h-6" /> {t('setupSchedule')}</h2>
              <div className="space-y-4 max-w-md">
                  <div>
                      <label className="app-label">{t('scheduleMode')}</label>
                      <select value={config.mode} onChange={e => setConfig({...config, mode: e.target.value})} disabled={isSavingScheduleConfig} className="app-input">
                          <option value="date">{t('modeDate')}</option>
                          <option value="half">{t('modeHalf')}</option>
                          <option value="time">{t('modeTime')}</option>
                      </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <label className="app-label">{t('startDate')}</label>
                          <input type="date" value={config.start} onChange={e => setConfig({...config, start: e.target.value})} disabled={isSavingScheduleConfig} className="app-input" />
                      </div>
                      <div>
                          <label className="app-label">{t('endDate')}</label>
                          <input type="date" value={config.end} onChange={e => setConfig({...config, end: e.target.value})} disabled={isSavingScheduleConfig} className="app-input" />
                      </div>
                  </div>
                  <div>
                      <label className="app-label">{t('deadline')}</label>
                      <input type="datetime-local" value={config.deadline} onChange={e => setConfig({...config, deadline: e.target.value})} disabled={isSavingScheduleConfig} className="app-input" />
                  </div>
                  <button onClick={handleSaveConfig} disabled={isSavingScheduleConfig} aria-busy={isSavingScheduleConfig} className="app-button-primary w-full">
                      {isSavingScheduleConfig ? t('processing') : t('saveConfig')}
                  </button>
              </div>
          </div>
      );
  }

  if (!hasConfig) {
      return (
          <div className="app-card-quiet flex min-h-[220px] flex-col items-center justify-center gap-3 p-8 text-center" aria-label={t('configureFirst')}>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-google-green/10 text-google-green">
                  <CalendarClock className="h-7 w-7" />
              </div>
              <div>
                  <h3 className="text-lg font-medium text-m3-on-surface">{t('setupSchedule')}</h3>
                  <p className="mt-1 max-w-sm text-sm text-m3-on-surface-variant">{t('configureFirst')}</p>
              </div>
          </div>
      );
  }

  const showStats = isOwner || isAdmin || isFinished || isDeadlinePassed || viewHeatmap;

  return (
    <div className="space-y-6 animate-fade-in pb-20">
        
        {/* Header Actions */}
        <div className="flex justify-between items-center">
            <h2 className="text-xl font-medium text-m3-on-surface flex items-center gap-2">
                <CalendarClock className="w-6 h-6 text-google-green" /> 
                {t('myAvailability')}
            </h2>
            {(isOwner || isDeadlinePassed) && (
                <button onClick={() => setViewHeatmap(!viewHeatmap)} className="app-button-quiet text-google-blue hover:bg-google-blue/10">
                    <ChartLine className="w-4 h-4" /> {viewHeatmap ? t('closeHeatmap') : t('viewHeatmap')}
                </button>
            )}
            </div>

            {showStats && (
                <section className="app-card p-4 sm:p-5" aria-label={t('scheduleRecommendations')}>
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <h3 className="flex items-center gap-2 text-sm font-medium text-m3-on-surface">
                            <ChartLine className="h-4 w-4 text-google-blue" />
                            {t('scheduleRecommendations')}
                        </h3>
                        <span className="app-chip app-chip-blue py-1 text-xs">{scheduleSummary.participantCount}</span>
                    </div>
                    {scheduleSummary.recommendations.length > 0 ? (
                        <div className="grid gap-2 sm:grid-cols-3">
                            {scheduleSummary.recommendations.map((recommendation, index) => {
                                const percent = Math.round(recommendation.coverage * 100);
                                return (
                                    <div key={recommendation.key} className="rounded-xl border border-m3-outline-variant/40 bg-m3-surface-container/45 p-3">
                                        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-google-blue">
                                            {index === 0 ? t('bestTime') : `#${index + 1}`}
                                        </div>
                                        <div className="text-sm font-medium text-m3-on-surface">{formatRecommendationLabel(recommendation)}</div>
                                        <div className="mt-1 text-xs text-m3-on-surface-variant">
                                            {t('participantCoverage', {
                                                count: recommendation.count,
                                                total: recommendation.participantCount,
                                                percent,
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="rounded-xl border border-dashed border-m3-outline-variant/60 bg-m3-surface-container/30 p-3 text-sm text-m3-on-surface-variant">
                            {t('noRecommendations')}
                        </div>
                    )}
                </section>
            )}

        {/* --- Date Mode Grid --- */}
        {config.mode === 'date' && (
            <div className="grid grid-cols-7 gap-2">
                {dates.map(date => {
                   const isSelected = myAvailability.includes(date);
                   const count = heatmapData[date] || 0;
                   const style = viewHeatmap 
                      ? { backgroundColor: getColor(count), border: isSelected ? '2px solid #4285F4' : '1px solid transparent' } 
                      : { };
                   
                   return (
                       <button key={date} 
                          disabled={viewHeatmap || isSubmittingSchedule}
                          onClick={() => toggleDate(date)}
                          className={`
                             state-layer aspect-square rounded-2xl flex flex-col items-center justify-center text-sm transition-all relative touch-target
                             ${viewHeatmap ? '' : isSelected ? 'bg-google-green text-white shadow-elevation-1' : 'bg-m3-surface-container hover:bg-m3-surface-container-high'}
                          `}
                          style={style}
                       >
                           <span className="font-bold">{new Date(date).getDate()}</span>
                           <span className="text-[10px] opacity-80">{formatDate(date, { weekday: 'short' })}</span>
                           {viewHeatmap && count > 0 && <span className="absolute bottom-1 text-[10px] font-medium bg-white/30 px-1 rounded-full">{count}</span>}
                       </button>
                   );
                })}
            </div>
        )}

        {/* --- Half-Day Mode Table --- */}
        {config.mode === 'half' && (
            <div className="app-card overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-m3-surface-container-high text-m3-on-surface-variant">
                            <th className="p-3"></th>
                            {dates.map(d => <th key={d} className="p-3 min-w-[80px] font-normal">{formatDate(d, { weekday: 'short', month:'numeric', day:'numeric' })}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {['morning', 'afternoon', 'evening'].map(slot => (
                            <tr key={slot} className="border-t border-m3-outline-variant/10">
                                <td className="p-3 font-medium bg-m3-surface-container/50 text-m3-on-surface-variant capitalize">{t(slot)}</td>
                                {dates.map(d => {
                                    const key = `${d}_${slot}`;
                                    const isSelected = myAvailability.includes(key);
                                    const count = heatmapData[key] || 0;
                                    const style = viewHeatmap 
                                        ? { backgroundColor: getColor(count), border: isSelected ? '2px solid #4285F4' : '1px solid transparent' } 
                                        : { };
                                    
                                    return (
                                        <td key={key} className="p-1">
                                            <button 
                                                disabled={viewHeatmap || isSubmittingSchedule}
                                                onClick={() => toggleHalfDay(d, slot)}
                                                className={`state-layer flex h-12 w-full items-center justify-center rounded-xl transition-all
                                                    ${viewHeatmap ? '' : isSelected ? 'bg-google-green text-white' : 'bg-m3-surface hover:bg-m3-surface-container-high'}`}
                                                style={style}
                                            >
                                                {viewHeatmap && count > 0 && <span className="text-xs font-bold">{count}</span>}
                                                {!viewHeatmap && isSelected && <CheckSquare className="w-4 h-4" />}
                                            </button>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}

        {/* --- Time Range Mode --- */}
        {config.mode === 'time' && (
            <div className="space-y-4">
                {/* Visual Timeline / Heatmap */}
                {viewHeatmap && (
                    <div className="app-card overflow-x-auto p-4 text-xs">
                        <div className="min-w-[600px]">
                            {['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00'].map(tLabel => (
                                <div key={tLabel} className="inline-block w-[4.16%] text-center text-m3-on-surface-variant mb-2">{tLabel}</div>
                            ))}
                            {dates.map(d => (
                                <div key={d} className="flex items-center mb-1 h-8 bg-m3-surface-container/30 rounded text-m3-on-surface">
                                    <div className="w-16 flex-shrink-0 text-[10px] px-1">{formatDate(d, { weekday:'short', day:'numeric' })}</div>
                                    <div className="flex-1 flex h-full relative">
                                        {/* Render 24h * 2 blocks */}
                                        {Array.from({length: 48}).map((_, i) => {
                                            const h = Math.floor(i/2); const m = i%2===0 ? '00':'30';
                                            const hour = String(h).padStart(2, '0');
                                            const key = `${d}_${hour}:${m}`;
                                            const count = heatmapData[key] || 0;
                                            if (h < 8 || h > 22) return null; // Crop display 8am-10pm
                                                return (
                                                    <div key={i} className="flex-1 h-full border-r border-white/20" style={{ backgroundColor: getColor(count) }} title={`${hour}:${m} · ${t('peopleCount', { count })}`}></div>
                                                );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Input List */}
                {!viewHeatmap && (
                    <div className="space-y-3">
                        {myAvailability.map((range, idx) => (
                           <div key={range.id} className="app-card flex flex-wrap items-center gap-2 p-3">
                               <select 
                                  value={range.date} 
                                  onChange={e => updateTimeRange(range.id, 'date', e.target.value)}
                                  className="app-input w-auto min-w-[9rem] border-transparent bg-transparent text-sm font-medium"
                                  disabled={isSubmittingSchedule}
                               >
                                   {dates.map(d => <option key={d} value={d}>{d}</option>)}
                               </select>
                               <input type="time" value={range.start} onChange={e => updateTimeRange(range.id, 'start', e.target.value)} disabled={isSubmittingSchedule} className="app-input w-auto px-3 py-2 text-sm" />
                               <span className="text-m3-on-surface-variant">-</span>
                               <input type="time" value={range.end} onChange={e => updateTimeRange(range.id, 'end', e.target.value)} disabled={isSubmittingSchedule} className="app-input w-auto px-3 py-2 text-sm" />
                               <button onClick={() => removeTimeRange(range.id)} disabled={isSubmittingSchedule} className="app-icon-button ml-auto hover:bg-google-red/10 hover:text-google-red"><X className="w-4 h-4" /></button>
                           </div> 
                        ))}
                        <div className="flex gap-2 justify-center mt-4">
                            {dates.map(d => (
                                    <button key={d} onClick={() => addTimeRange(d)} disabled={isSubmittingSchedule} className="app-button-quiet border border-m3-outline-variant px-3 text-xs">
                                        + {formatDate(d, { weekday:'short' })}
                                    </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* Footer Actions */}
        {!viewHeatmap && (
            <div className={`mt-8 flex justify-end ${isDeadlinePassed ? 'opacity-50' : ''}`}>
                {isDeadlinePassed ? (
                     <div className="app-chip app-chip-red">
                         <Lock className="w-4 h-4" /> {t('deadlinePassed')}
                     </div>
                ) : (
                    <button onClick={handleSubmit} disabled={isSubmittingSchedule} aria-busy={isSubmittingSchedule} className="app-button bg-google-green px-6 text-gray-900 hover:shadow-elevation-2">
                        {isSubmittingSchedule ? t('processing') : (mySubmission ? t('update') : t('submit'))}
                    </button>
                )}
            </div>
        )}

        <InfoCard title={t('schedule')} steps={[t('scheduleDesc')]} />
    </div>
  );
}
