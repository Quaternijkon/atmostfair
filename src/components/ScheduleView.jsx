import React, { useState, useMemo } from 'react';
import { CalendarClock, CheckSquare, Plus, X, Search, ChartLine } from './Icons';
import { InfoCard } from './InfoCard';

export default function ScheduleView({ user, isAdmin, project, submissions, isStopped, isFinished, isOwner, actions, t }) {
  const [editing, setEditing] = useState(false);
  const [viewHeatmap, setViewHeatmap] = useState(false);

  // Configuration State
  const [config, setConfig] = useState(project.scheduleConfig || {
     mode: 'date', // date, half, time
     start: new Date().toISOString().split('T')[0],
     end: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
     deadline: ''
  });

  // User Submission State
  const mySubmission = submissions.find(s => s.uid === user?.uid);
  const [myAvailability, setMyAvailability] = useState(mySubmission?.availability || []); // Array depends on mode

  // Helper: Date Range Generator
  const dates = useMemo(() => {
     if (!config.start || !config.end) return [];
     const list = [];
     let curr = new Date(config.start);
     const end = new Date(config.end);
     while (curr <= end) {
         list.push(new Date(curr).toISOString().split('T')[0]);
         curr.setDate(curr.getDate() + 1);
     }
     return list;
  }, [config.start, config.end]);

  const hasConfig = !!project.scheduleConfig;
  const isDeadlinePassed = config.deadline && new Date() > new Date(config.deadline);
  const canEdit = !isStopped && !isFinished && (!isDeadlinePassed || isOwner);

  // --- Handlers ---

  const handleSaveConfig = () => {
    // Validation
    const dayCount = dates.length;
    if (config.mode === 'date' && dayCount > 31) return alert(t('rangeError'));
    if ((config.mode === 'half' || config.mode === 'time') && dayCount > 8) return alert(t('rangeError')); // Allow 8 days (weekly overlap)
    
    actions.handleUpdateScheduleConfig(project.id, config);
    setEditing(false);
  };

  const handleSubmit = () => {
      actions.handleSubmitSchedule(project.id, myAvailability);
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
      const newRange = { date, start: '09:00', end: '10:00', id: Date.now() };
      setMyAvailability(prev => [...prev, newRange]);
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
  const heatmapData = useMemo(() => {
      const counts = {};
      submissions.forEach(sub => {
          if (config.mode === 'date' || config.mode === 'half') {
              sub.availability.forEach(key => {
                  counts[key] = (counts[key] || 0) + 1;
              });
          } else if (config.mode === 'time') {
              // Time logic: 30min buckets
              sub.availability.forEach(range => {
                 // range: { date, start: "HH:MM", end: "HH:MM" }
                 const start = parseInt(range.start.replace(':', ''));
                 const end = parseInt(range.end.replace(':', ''));
                 // Simple bucket fill
                 // Not perfect but visual enough
                 for(let h = 0; h < 24; h++) {
                     for (let m of [0, 30]) {
                        const timeVal = h * 100 + m;
                        if (timeVal >= start && timeVal < end) {
                            const key = `${range.date}_${h}:${m === 0 ? '00' : '30'}`;
                            counts[key] = (counts[key] || 0) + 1;
                        }
                     }
                 }
              });
          }
      });
      return counts;
  }, [submissions, config.mode]);

  const maxCount = Math.max(...Object.values(heatmapData), 1);
  const getOpactiy = (count) => count ? (count / maxCount) : 0;
  const getColor = (count) => {
      if (!count) return 'bg-m3-surface-container';
      const alpha = Math.max(0.1, count / maxCount);
      return `rgba(66, 133, 244, ${alpha})`; // Google Blue with alpha
  };


  // --- Render Sections ---

  if (!hasConfig && isOwner) {
      return (
          <div className="bg-m3-surface-container p-8 rounded-[28px] animate-fade-in">
              <h2 className="text-2xl mb-6 flex items-center gap-2"><CalendarClock className="w-6 h-6" /> {t('setupSchedule')}</h2>
              <div className="space-y-4 max-w-md">
                  <div>
                      <label className="block text-sm font-medium mb-1 text-m3-on-surface-variant">{t('scheduleMode')}</label>
                      <select value={config.mode} onChange={e => setConfig({...config, mode: e.target.value})} className="w-full p-2 rounded-lg bg-m3-surface border border-m3-outline-variant">
                          <option value="date">{t('modeDate')}</option>
                          <option value="half">{t('modeHalf')}</option>
                          <option value="time">{t('modeTime')}</option>
                      </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <label className="block text-sm font-medium mb-1 text-m3-on-surface-variant">{t('startDate')}</label>
                          <input type="date" value={config.start} onChange={e => setConfig({...config, start: e.target.value})} className="w-full p-2 rounded-lg bg-m3-surface border border-m3-outline-variant" />
                      </div>
                      <div>
                          <label className="block text-sm font-medium mb-1 text-m3-on-surface-variant">{t('endDate')}</label>
                          <input type="date" value={config.end} onChange={e => setConfig({...config, end: e.target.value})} className="w-full p-2 rounded-lg bg-m3-surface border border-m3-outline-variant" />
                      </div>
                  </div>
                  <div>
                      <label className="block text-sm font-medium mb-1 text-m3-on-surface-variant">{t('deadline')}</label>
                      <input type="datetime-local" value={config.deadline} onChange={e => setConfig({...config, deadline: e.target.value})} className="w-full p-2 rounded-lg bg-m3-surface border border-m3-outline-variant" />
                  </div>
                  <button onClick={handleSaveConfig} className="w-full py-3 bg-google-blue text-white rounded-full font-medium">{t('saveConfig')}</button>
              </div>
          </div>
      );
  }

  if (!hasConfig) return <div className="text-center p-10 text-m3-on-surface-variant">{t('configureFirst')}</div>;

  const showStats = isOwner || isFinished || isDeadlinePassed || viewHeatmap;

  return (
    <div className="space-y-6 animate-fade-in pb-20">
        
        {/* Header Actions */}
        <div className="flex justify-between items-center">
            <h2 className="text-xl font-normal text-m3-on-surface flex items-center gap-2">
                <CalendarClock className="w-6 h-6 text-google-green" /> 
                {t('myAvailability')}
            </h2>
            {(isOwner || isDeadlinePassed) && (
                <button onClick={() => setViewHeatmap(!viewHeatmap)} className="text-sm font-medium text-google-blue flex items-center gap-1 hover:bg-google-blue/10 px-3 py-1 rounded-full transition-colors">
                    <ChartLine className="w-4 h-4" /> {viewHeatmap ? t('closeHeatmap') : t('viewHeatmap')}
                </button>
            )}
        </div>

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
                          disabled={viewHeatmap}
                          onClick={() => toggleDate(date)}
                          className={`
                             aspect-square rounded-xl flex flex-col items-center justify-center text-sm transition-all relative
                             ${viewHeatmap ? '' : isSelected ? 'bg-google-green text-white shadow-md' : 'bg-m3-surface-container hover:bg-m3-surface-container-high'}
                          `}
                          style={style}
                       >
                           <span className="font-bold">{new Date(date).getDate()}</span>
                           <span className="text-[10px] opacity-80">{new Date(date).toLocaleDateString(undefined, {weekday: 'short'})}</span>
                           {viewHeatmap && count > 0 && <span className="absolute bottom-1 text-[10px] font-medium bg-white/30 px-1 rounded-full">{count}</span>}
                       </button>
                   );
                })}
            </div>
        )}

        {/* --- Half-Day Mode Table --- */}
        {config.mode === 'half' && (
            <div className="overflow-x-auto rounded-[24px] border border-m3-outline-variant/30">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-m3-surface-container-high text-m3-on-surface-variant">
                            <th className="p-3"></th>
                            {dates.map(d => <th key={d} className="p-3 min-w-[80px] font-normal">{new Date(d).toLocaleDateString(undefined, {weekday: 'short', month:'numeric', day:'numeric'})}</th>)}
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
                                                disabled={viewHeatmap}
                                                onClick={() => toggleHalfDay(d, slot)}
                                                className={`w-full h-12 rounded-lg transition-all flex items-center justify-center
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
                    <div className="bg-m3-surface text-xs overflow-x-auto rounded-xl border border-m3-outline-variant/30 p-4">
                        <div className="min-w-[600px]">
                            {['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00'].map(tLabel => (
                                <div key={tLabel} className="inline-block w-[4.16%] text-center text-m3-on-surface-variant mb-2">{tLabel}</div>
                            ))}
                            {dates.map(d => (
                                <div key={d} className="flex items-center mb-1 h-8 bg-m3-surface-container/30 rounded text-m3-on-surface">
                                    <div className="w-16 flex-shrink-0 text-[10px] px-1">{new Date(d).toLocaleDateString(undefined, {weekday:'short', day:'numeric'})}</div>
                                    <div className="flex-1 flex h-full relative">
                                        {/* Render 24h * 2 blocks */}
                                        {Array.from({length: 48}).map((_, i) => {
                                            const h = Math.floor(i/2); const m = i%2===0 ? '00':'30';
                                            const key = `${d}_${h}:${m}`;
                                            const count = heatmapData[key] || 0;
                                            if (h < 8 || h > 22) return null; // Crop display 8am-10pm
                                            return (
                                                <div key={i} className="flex-1 h-full border-r border-white/20" style={{ backgroundColor: getColor(count) }} title={`${h}:${m} - ${count} ppl`}></div>
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
                           <div key={range.id} className="flex flex-wrap items-center gap-2 bg-m3-surface p-3 rounded-xl border border-m3-outline-variant/50">
                               <select 
                                  value={range.date} 
                                  onChange={e => updateTimeRange(range.id, 'date', e.target.value)}
                                  className="bg-transparent border-none text-sm font-medium focus:ring-0"
                               >
                                   {dates.map(d => <option key={d} value={d}>{d}</option>)}
                               </select>
                               <input type="time" value={range.start} onChange={e => updateTimeRange(range.id, 'start', e.target.value)} className="bg-m3-surface-container rounded-md px-2 py-1 text-sm border-none" />
                               <span className="text-m3-on-surface-variant">-</span>
                               <input type="time" value={range.end} onChange={e => updateTimeRange(range.id, 'end', e.target.value)} className="bg-m3-surface-container rounded-md px-2 py-1 text-sm border-none" />
                               <button onClick={() => removeTimeRange(range.id)} className="ml-auto text-m3-on-surface-variant hover:text-google-red p-1"><X className="w-4 h-4" /></button>
                           </div> 
                        ))}
                        <div className="flex gap-2 justify-center mt-4">
                            {dates.map(d => (
                                <button key={d} onClick={() => addTimeRange(d)} className="text-xs px-3 py-2 rounded-full border border-m3-outline-variant hover:bg-m3-surface-container">
                                    + {new Date(d).toLocaleDateString(undefined, {weekday:'short'})}
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
                     <div className="flex items-center gap-2 text-google-red font-medium px-4 py-2 bg-google-red/10 rounded-lg">
                         <Lock className="w-4 h-4" /> {t('deadlinePassed')}
                     </div>
                ) : (
                    <button onClick={handleSubmit} className="px-6 py-3 bg-google-green text-gray-900 font-medium rounded-full shadow-elevation-1 hover:shadow-elevation-2 transition-all">
                        {mySubmission ? t('update') : t('submit')}
                    </button>
                )}
            </div>
        )}

        <InfoCard title={t('schedule')} steps={[t('scheduleDesc')]} />
    </div>
  );
}
