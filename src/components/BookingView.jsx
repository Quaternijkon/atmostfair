import React, { useState, useMemo } from 'react';
import { CalendarCheck, CheckSquare, Plus, X, Search, UserMinus } from './Icons';
import { InfoCard } from './InfoCard';
import { useUI } from './UIComponents';

export default function BookingView({ user, isAdmin, project, slots, isStopped, isFinished, isOwner, actions, t }) {
  const { confirm, showToast } = useUI();
  const [showBookModal, setShowBookModal] = useState(null); // slot object
  const [bookingForm, setBookingForm] = useState({});

  // Configuration
  const [config, setConfig] = useState(project.bookingConfig || {
     mode: 'date', // date, half
     start: new Date().toISOString().split('T')[0],
     end: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
     requiredFields: 'Name, Phone'
  });
  
  // Date Generator (Similar to Schedule)
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

  const hasConfig = !!project.bookingConfig;
  const reqFields = (config.requiredFields || '').split(/[，,]/).map(s => s.trim()).filter(s => s);

  // --- Handlers ---

  const handleSaveConfig = () => {
    actions.handleUpdateBookingConfig(project.id, config);
  };

  const toggleSlot = (start, end, label) => {
      // For owner: Create or Delete slot doc
      const existing = slots.find(s => s.start === start && s.end === end);
      if (existing) {
          if (existing.bookedBy) {
              alert('Cannot remove booked slot. Please kick user first.');
              return;
          }
          actions.handleDeleteBookingSlot(existing.id);
      } else {
          actions.handleCreateBookingSlot(project.id, start, end, label);
      }
  };

  const handleBookSubmit = async () => {
      // Validate form
      for (let f of reqFields) {
          if (!bookingForm[f]) return alert(`Please fill ${f}`);
      }
      try {
          await actions.handleBookSlot(showBookModal.id, bookingForm);
          setShowBookModal(null);
          setBookingForm({});
          showToast(t('bookingSuccess'), 'success');
      } catch (e) {
          console.error(e);
          alert('Booking failed. Please check your network or try again.');
      }
  };

  const handleKick = (slot) => {
      const reason = prompt(t('kickReason') + ':', 'Admin cancelled');
      if (reason) {
          actions.handleKickUser(slot.id, slot.bookedBy, project.id, reason);
      }
  };


  // --- Render ---

  if (!hasConfig && isOwner) {
      return (
          <div className="bg-m3-surface-container p-8 rounded-[28px] animate-fade-in">
              <h2 className="text-2xl mb-6 flex items-center gap-2"><CalendarCheck className="w-6 h-6" /> {t('setupBooking')}</h2>
              <div className="space-y-4 max-w-md">
                   <div>
                      <label className="block text-sm font-medium mb-1 text-m3-on-surface-variant">{t('scheduleMode')}</label>
                      <select value={config.mode} onChange={e => setConfig({...config, mode: e.target.value})} className="w-full p-2 rounded-lg bg-m3-surface border border-m3-outline-variant">
                          <option value="date">{t('modeDate')}</option>
                          <option value="half">{t('modeHalf')}</option>
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
                      <label className="block text-sm font-medium mb-1 text-m3-on-surface-variant">{t('requiredInfo')}</label>
                      <input type="text" value={config.requiredFields} onChange={e => setConfig({...config, requiredFields: e.target.value})} className="w-full p-2 rounded-lg bg-m3-surface border border-m3-outline-variant" placeholder="e.g. Name, Phone" />
                  </div>
                  <button onClick={handleSaveConfig} className="w-full py-3 bg-google-blue text-white rounded-full font-medium">{t('saveConfig')}</button>
              </div>
          </div>
      );
  }

  if (!hasConfig) return <div className="text-center p-10 text-m3-on-surface-variant">{t('configureFirst')}</div>;

  return (
    <div className="space-y-6 animate-fade-in pb-20">
        
        {/* Header */}
        <div className="flex justify-between items-center">
             <h2 className="text-xl font-normal text-m3-on-surface flex items-center gap-2">
                <CalendarCheck className="w-6 h-6 text-google-blue" /> {t('book')}
            </h2>
            {isOwner && <div className="text-xs text-m3-on-surface-variant bg-google-blue/10 px-2 py-1 rounded">{t('availableSlots')}</div>}
        </div>

        {/* --- GRID RENDER --- */}
        {config.mode === 'date' && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {dates.map(date => {
                    const slotStart = date; 
                    const slotEnd = date;
                    const existing = slots.find(s => s.start === slotStart); // For date mode, simple match
                    const isBooked = existing?.bookedBy;
                    const isMine = existing?.bookedBy === user?.uid;
                    
                    // Owner logic: Click to create/delete availability
                    // User logic: Click to Book if available, View if booked
                    
                    const handleClick = () => {
                        if (isOwner) toggleSlot(slotStart, slotEnd, new Date(date).toLocaleDateString());
                        else if (existing && !isBooked) setShowBookModal(existing);
                    };

                    let bgClass = 'bg-m3-surface-container hover:bg-m3-surface-container-high'; // Default unavailable (User pov)
                    if (isOwner) bgClass = existing ? (isBooked ? 'bg-m3-primary-container ring-2 ring-google-blue' : 'bg-google-green text-white') : 'bg-m3-surface-container opacity-50';
                    else bgClass = existing ? (isBooked ? (isMine ? 'bg-google-green text-white' : 'bg-m3-surface-container-high opacity-50 cursor-not-allowed') : 'bg-white border-2 border-google-green text-google-green hover:bg-google-green hover:text-white') : 'bg-m3-surface-container opacity-30 cursor-not-allowed';

                    return (
                        <div key={date} 
                           onClick={handleClick}
                           className={`aspect-[4/3] rounded-xl p-3 flex flex-col justify-between transition-all cursor-pointer relative overflow-hidden ${bgClass}`}
                        >
                            <span className="text-sm font-medium">{new Date(date).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</span>
                            
                            {isBooked && (
                                <div className="text-xs truncate">
                                    <div className="font-bold">{existing.bookerName}</div>
                                    {isOwner && <button onClick={(e) => { e.stopPropagation(); handleKick(existing); }} className="mt-1 bg-white/20 hover:bg-google-red text-white p-1 rounded"><UserMinus className="w-3 h-3" /></button>}
                                </div>
                            )}
                            {!existing && isOwner && <Plus className="w-4 h-4 self-end opacity-50" />}
                            {existing && !isBooked && !isOwner && <span className="text-xs self-end font-bold">{t('book')}</span>}
                        </div>
                    );
                })}
            </div>
        )}

        {config.mode === 'half' && (
            <div className="overflow-x-auto rounded-xl border border-m3-outline-variant/30 bg-m3-surface-container/20">
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr className="bg-m3-surface-container-high text-xs text-m3-on-surface-variant font-medium">
                            <th className="p-3 text-left w-24 sticky left-0 bg-m3-surface-container-high z-20 border-b border-m3-outline-variant/20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                {t('date')} / {t('time')}
                            </th>
                            {dates.map(date => (
                                <th key={date} className="p-3 min-w-[120px] border-b border-m3-outline-variant/20 text-center">
                                    <div className="flex flex-col items-center gap-1">
                                        <span className="font-bold text-m3-on-surface">{new Date(date).toLocaleDateString(undefined, {weekday:'short'})}</span>
                                        <span className="opacity-80">{new Date(date).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</span>
                                        {isOwner && (
                                            <button 
                                                onClick={() => {
                                                    ['Morning', 'Afternoon', 'Evening'].forEach(p => toggleSlot(`${date}_${p}`, `${date}_${p}`, p));
                                                }} 
                                                className="text-[10px] text-google-blue hover:bg-google-blue/10 px-2 py-0.5 rounded transition-colors"
                                            >
                                                Select All
                                            </button>
                                        )}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {['Morning', 'Afternoon', 'Evening'].map(period => (
                            <tr key={period} className="border-b border-m3-outline-variant/10 hover:bg-black/5 transition-colors">
                                <td className="p-3 font-medium text-m3-on-surface sticky left-0 bg-m3-surface-container z-10 border-r border-m3-outline-variant/20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                    <div className="flex flex-col gap-1 items-start">
                                        <span>{t(period.toLowerCase())}</span>
                                        {isOwner && (
                                            <button 
                                                onClick={() => {
                                                    dates.forEach(d => toggleSlot(`${d}_${period}`, `${d}_${period}`, period));
                                                }}
                                                className="text-[10px] text-google-blue hover:bg-google-blue/10 px-2 py-0.5 rounded transition-colors"
                                            >
                                                Select All
                                            </button>
                                        )}
                                    </div>
                                </td>
                                {dates.map(date => {
                                    const slotStart = `${date}_${period}`;
                                    const existing = slots.find(s => s.start === slotStart);
                                    const isBooked = existing?.bookedBy;
                                    const isMine = existing?.bookedBy === user?.uid;

                                    const handleClick = () => {
                                        if (isOwner) toggleSlot(slotStart, slotStart, period);
                                        else if (existing && !isBooked) setShowBookModal(existing);
                                    };

                                    // Styling Logic (Copied and adapted for Table Cell)
                                    let content;
                                    let cellClass = "p-2 rounded-lg transition-all flex flex-col items-center justify-center text-xs h-[80px] w-full cursor-pointer border ";
                                    
                                    if (isOwner) {
                                        if (existing) {
                                            if (isBooked) {
                                                cellClass += "bg-m3-primary-container border-google-blue text-m3-on-primary-container";
                                                content = (
                                                    <>
                                                        <div className="font-bold truncate w-full text-center">{existing.bookerName}</div>
                                                        <button onClick={(e) => { e.stopPropagation(); handleKick(existing); }} className="mt-1 p-1 hover:bg-google-red hover:text-white rounded-full transition-colors"><UserMinus className="w-4 h-4" /></button>
                                                    </>
                                                );
                                            } else {
                                                cellClass += "bg-google-green text-white border-transparent hover:brightness-95";
                                                content = <CheckSquare className="w-5 h-5" />;
                                            }
                                        } else {
                                            cellClass += "bg-transparent border-dashed border-m3-outline-variant text-m3-on-surface-variant opacity-30 hover:opacity-100 hover:border-google-blue hover:text-google-blue";
                                            content = <Plus className="w-5 h-5" />;
                                        }
                                    } else {
                                        // User View
                                        if (existing) {
                                            if (isBooked) {
                                                if (isMine) {
                                                    cellClass += "bg-google-green text-white border-transparent shadow-elevation-1";
                                                    content = <><span className="font-bold">{t('booked')}</span><div className="text-[10px] opacity-80">(You)</div></>;
                                                } else {
                                                    cellClass += "bg-m3-surface-container-high border-transparent text-m3-on-surface-variant opacity-50 cursor-not-allowed";
                                                    content = <div className="flex flex-col items-center"><span className="line-through">{t('booked')}</span><span className="text-[9px] truncate w-[80px] text-center">{existing.bookerName}</span></div>;
                                                }
                                            } else {
                                                cellClass += "bg-white border-google-green text-google-green hover:bg-google-green hover:text-white shadow-sm";
                                                content = <span className="font-bold">{t('book')}</span>;
                                            }
                                        } else {
                                            cellClass += "bg-m3-surface-container opacity-20 border-transparent cursor-not-allowed";
                                            content = <span className="text-[10px]">-</span>;
                                        }
                                    }

                                    return (
                                        <td key={date} className="p-1 align-top">
                                            <div onClick={handleClick} className={cellClass}>
                                                {content}
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
                {isOwner && <div className="text-center text-xs text-m3-on-surface-variant p-2 border-t border-m3-outline-variant/10">Click empty slots to enable them. Red slots are booked.</div>}
            </div>
        )}

        {/* --- Booking Modal --- */}
        {showBookModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <div className="bg-m3-surface-container rounded-[28px] p-6 w-full max-w-sm shadow-elevation-3 animate-scale-in">
                    <h3 className="text-xl font-normal mb-4">{t('confirmBooking')}</h3>
                    <div className="mb-4 text-sm text-m3-on-surface-variant flex items-center gap-2">
                         <CalendarCheck className="w-4 h-4" />
                         <span>{showBookModal.label}</span>
                    </div>
                    
                    <div className="space-y-4 mb-6">
                        {reqFields.map(field => (
                            <div key={field}>
                                <label className="block text-xs font-medium uppercase text-m3-on-surface-variant mb-1">{field}</label>
                                <input 
                                    type="text" 
                                    value={bookingForm[field] || ''}
                                    onChange={e => setBookingForm({...bookingForm, [field]: e.target.value})}
                                    className="w-full px-3 py-2 bg-m3-surface rounded-lg border border-m3-outline-variant focus:border-google-blue outline-none"
                                />
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-3">
                        <button onClick={() => { setShowBookModal(null); setBookingForm({}); }} className="flex-1 py-2.5 text-google-blue font-medium hover:bg-google-blue/5 rounded-full">{t('cancel')}</button>
                        <button onClick={handleBookSubmit} className="flex-1 py-2.5 bg-google-blue text-white rounded-full font-medium shadow-elevation-1">{t('bookSlot')}</button>
                    </div>
                </div>
            </div>
        )}

    </div>
  );
}
