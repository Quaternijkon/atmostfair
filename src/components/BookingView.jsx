import React, { useState, useMemo } from 'react';
import { CalendarCheck, CheckSquare, Plus, UserMinus } from './Icons';
import { InfoCard } from './InfoCard';
import { getAppLocale } from '../lib/locale';
import { addDaysIsoDate, todayIsoDate } from '../lib/time';
import { useUI } from './UIContext';

function createDefaultBookingConfig(t) {
  return {
    mode: 'date',
    start: todayIsoDate(),
    end: addDaysIsoDate(7),
    requiredFields: t('bookingDefaultRequiredInfo')
  };
}

export default function BookingView({ user, isAdmin, project, slots, isStopped, isFinished, isOwner, actions, t }) {
  const { showToast } = useUI();
  const [showBookModal, setShowBookModal] = useState(null); // slot object
  const [bookModalMode, setBookModalMode] = useState('book');
  const [kickModal, setKickModal] = useState(null);
  const [kickReason, setKickReason] = useState(t('adminCancelled'));
  const [bookingForm, setBookingForm] = useState({});
  const appLocale = getAppLocale(t);
  const formatDate = (date, options) => new Date(date).toLocaleDateString(appLocale, options);

  // Configuration
  const [config, setConfig] = useState(() => project.bookingConfig || createDefaultBookingConfig(t));
  
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
  const getWaitlist = (slot) => Array.isArray(slot?.waitlist) ? slot.waitlist : [];
  const canInteract = !isStopped && !isFinished;

  // --- Handlers ---

  const handleSaveConfig = () => {
    if (!canInteract) return;
    actions.handleUpdateBookingConfig(project.id, config);
  };

  const toggleSlot = (start, end, label) => {
      if (!canInteract) return;
      // For owner: Create or Delete slot doc
      const existing = slots.find(s => s.start === start && s.end === end);
      if (existing) {
	          if (existing.bookedBy) {
	              showToast(t('cannotRemoveBookedSlot'), 'error');
	              return;
	          }
          actions.handleDeleteBookingSlot(existing.id);
      } else {
          actions.handleCreateBookingSlot(project.id, start, end, label);
      }
  };

  const openBookingModal = (slot, mode) => {
      setBookModalMode(mode);
      setShowBookModal(slot);
  };

  const resetBookingModal = () => {
      setShowBookModal(null);
      setBookingForm({});
      setBookModalMode('book');
  };

  const handleBookSubmit = async () => {
      if (!canInteract) return;
      // Validate form
      for (let f of reqFields) {
	          if (!bookingForm[f]) {
	              showToast(t('fillField', { field: f }), 'error');
	              return;
	          }
      }
      try {
          if (bookModalMode === 'waitlist') {
              const waitlistPatch = await actions.handleToggleBookingWaitlist(showBookModal.id, bookingForm);
              if (!waitlistPatch) throw new Error('waitlist failed');
              resetBookingModal();
              showToast(t('waitlistJoined'), 'success');
          } else {
              await actions.handleBookSlot(showBookModal.id, bookingForm);
              resetBookingModal();
              showToast(t('bookingSuccess'), 'success');
          }
      } catch (e) {
          console.error(e);
	          showToast(t('bookingFailed'), 'error');
      }
  };

  const handleToggleBookingWaitlist = async (slot) => {
      if (!canInteract) return;
      if (!slot) return;
      try {
          const waitlistPatch = await actions.handleToggleBookingWaitlist(slot.id);
          if (!waitlistPatch) throw new Error('waitlist failed');
          showToast(waitlistPatch.type === 'remove' ? t('waitlistLeft') : t('waitlistJoined'), 'success');
      } catch (e) {
          console.error(e);
          showToast(t('bookingFailed'), 'error');
      }
  };

  const handleKick = (slot) => {
      setKickModal(slot);
      setKickReason(t('adminCancelled'));
  };

  const handleKickSubmit = () => {
      if (!canInteract) return;
      if (!kickModal) return;
      actions.handleKickUser(kickModal.id, kickModal.bookedBy, project.id, kickReason.trim() || t('adminCancelled'));
      setKickModal(null);
  };


  // --- Render ---

  if (!hasConfig && isOwner) {
      return (
          <div className="app-card animate-fade-in p-6 sm:p-8">
              <h2 className="text-2xl font-medium mb-6 flex items-center gap-2"><CalendarCheck className="w-6 h-6" /> {t('setupBooking')}</h2>
              <div className="space-y-4 max-w-md">
                   <div>
                      <label className="app-label">{t('scheduleMode')}</label>
                      <select value={config.mode} onChange={e => setConfig({...config, mode: e.target.value})} className="app-input">
                          <option value="date">{t('modeDate')}</option>
                          <option value="half">{t('modeHalf')}</option>
                      </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <label className="app-label">{t('startDate')}</label>
                          <input type="date" value={config.start} onChange={e => setConfig({...config, start: e.target.value})} className="app-input" />
                      </div>
                      <div>
                          <label className="app-label">{t('endDate')}</label>
                          <input type="date" value={config.end} onChange={e => setConfig({...config, end: e.target.value})} className="app-input" />
                      </div>
                  </div>
                  <div>
                      <label className="app-label">{t('requiredInfo')}</label>
	                      <input type="text" value={config.requiredFields} onChange={e => setConfig({...config, requiredFields: e.target.value})} className="app-input" placeholder={t('requiredInfoPlaceholder')} />
                  </div>
                  <button onClick={handleSaveConfig} className="app-button-primary w-full">{t('saveConfig')}</button>
              </div>
          </div>
      );
  }

  if (!hasConfig) {
      return (
              <div className="app-card-quiet flex min-h-[220px] flex-col items-center justify-center gap-3 p-8 text-center" aria-label={t('configureFirst')}>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-google-blue/10 text-google-blue">
                  <CalendarCheck className="h-7 w-7" />
              </div>
              <div>
                  <h3 className="text-lg font-medium text-m3-on-surface">{t('setupBooking')}</h3>
                  <p className="mt-1 max-w-sm text-sm text-m3-on-surface-variant">{t('configureFirst')}</p>
              </div>
          </div>
      );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-20">
        
        {/* Header */}
        <div className="flex justify-between items-center">
             <h2 className="text-xl font-medium text-m3-on-surface flex items-center gap-2">
                <CalendarCheck className="w-6 h-6 text-google-blue" /> {t('book')}
            </h2>
            {isOwner && <div className="app-chip app-chip-blue">{t('availableSlots')}</div>}
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
                        const waitlist = getWaitlist(existing);
                        const waitlistSize = waitlist.length;
                        const isWaitlisted = waitlist.some((entry) => entry.uid === user?.uid);
                        const isInteractive = canInteract && (isOwner ? !isBooked : Boolean(existing && (!isBooked || (!isMine && isBooked))));
                        const SlotShell = isInteractive ? 'button' : 'div';

                    // Owner logic: Click to create/delete availability
                    // User logic: Click to Book if available, View if booked
                    
                    const handleClick = () => {
                        if (isOwner) toggleSlot(slotStart, slotEnd, formatDate(date));
                        else if (existing && !isBooked) openBookingModal(existing, 'book');
                        else if (existing && isBooked && !isMine && isWaitlisted) handleToggleBookingWaitlist(existing);
                        else if (existing && isBooked && !isMine) openBookingModal(existing, 'waitlist');
                    };

                    let bgClass = 'bg-m3-surface-container hover:bg-m3-surface-container-high'; // Default unavailable (User pov)
                    if (isOwner) bgClass = existing ? (isBooked ? 'bg-m3-primary-container ring-2 ring-google-blue' : 'bg-google-green text-white') : 'bg-m3-surface-container opacity-50';
                    else bgClass = existing ? (isBooked ? (isMine ? 'bg-google-green text-white' : isWaitlisted ? 'border-2 border-google-yellow bg-google-yellow/10 text-[#8a5a00] hover:bg-google-yellow/20' : 'border border-google-yellow/40 bg-m3-surface-container-high text-m3-on-surface-variant hover:bg-google-yellow/10') : 'bg-white border-2 border-google-green text-google-green hover:bg-google-green hover:text-white') : 'bg-m3-surface-container opacity-30 cursor-not-allowed';

                        return (
                            <SlotShell key={date}
                               {...(isInteractive ? { type: 'button', onClick: handleClick } : {})}
                               className={`state-layer aspect-[4/3] rounded-2xl p-3 flex flex-col justify-between transition-all relative overflow-hidden ${isInteractive ? 'cursor-pointer' : 'cursor-default'} ${bgClass}`}
                            >
                                <span className="text-sm font-medium">{formatDate(date, {month:'short', day:'numeric'})}</span>
                            
                            {isBooked && (
                                <div className="text-xs truncate">
                                    <div className="font-bold">{existing.bookerName}</div>
                                    {waitlistSize > 0 && <div className="mt-1 text-[10px] font-medium">{t('waitlistCount', { count: waitlistSize })}</div>}
                                    {isOwner && <button onClick={(e) => { e.stopPropagation(); handleKick(existing); }} className="app-icon-button mt-1 border-transparent bg-white/20 text-white hover:bg-google-red hover:text-white"><UserMinus className="w-4 h-4" /></button>}
                                </div>
                                )}
                                {!existing && isOwner && <Plus className="w-4 h-4 self-end opacity-50" />}
                                {existing && !isBooked && !isOwner && <span className="text-xs self-end font-bold">{t('book')}</span>}
                                {existing && isBooked && !isOwner && !isMine && (
                                    <span className="text-xs self-end font-bold">{isWaitlisted ? `${t('waitlisted')} · ${t('leaveWaitlist')}` : t('joinWaitlist')}</span>
                                )}
                            </SlotShell>
                        );
                    })}
            </div>
        )}

        {config.mode === 'half' && (
            <div className="app-card overflow-x-auto bg-m3-surface-container/20">
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr className="bg-m3-surface-container-high text-xs text-m3-on-surface-variant font-medium">
                            <th className="p-3 text-left w-24 sticky left-0 bg-m3-surface-container-high z-20 border-b border-m3-outline-variant/20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                {t('date')} / {t('time')}
                            </th>
                            {dates.map(date => (
                                <th key={date} className="p-3 min-w-[120px] border-b border-m3-outline-variant/20 text-center">
                                    <div className="flex flex-col items-center gap-1">
                                        <span className="font-bold text-m3-on-surface">{formatDate(date, {weekday:'short'})}</span>
                                        <span className="opacity-80">{formatDate(date, {month:'short', day:'numeric'})}</span>
                                        {isOwner && (
                                            <button 
                                                onClick={() => {
                                                    ['Morning', 'Afternoon', 'Evening'].forEach(p => toggleSlot(`${date}_${p}`, `${date}_${p}`, p));
                                                }} 
                                                className="touch-target inline-flex items-center rounded-full px-2 text-[10px] text-google-blue hover:bg-google-blue/10"
                                            >
	                                                {t('selectAll')}
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
                                                className="touch-target inline-flex items-center rounded-full px-2 text-[10px] text-google-blue hover:bg-google-blue/10"
                                            >
	                                                {t('selectAll')}
                                            </button>
                                        )}
                                    </div>
                                </td>
                                    {dates.map(date => {
                                        const slotStart = `${date}_${period}`;
                                        const existing = slots.find(s => s.start === slotStart);
                                        const isBooked = existing?.bookedBy;
                                        const isMine = existing?.bookedBy === user?.uid;
                                        const waitlist = getWaitlist(existing);
                                        const waitlistSize = waitlist.length;
                                        const isWaitlisted = waitlist.some((entry) => entry.uid === user?.uid);
                                        const isInteractive = canInteract && (isOwner ? !isBooked : Boolean(existing && (!isBooked || (!isMine && isBooked))));
                                        const CellShell = isInteractive ? 'button' : 'div';

                                        const handleClick = () => {
                                            if (isOwner) toggleSlot(slotStart, slotStart, period);
                                            else if (existing && !isBooked) openBookingModal(existing, 'book');
                                            else if (existing && isBooked && !isMine && isWaitlisted) handleToggleBookingWaitlist(existing);
                                            else if (existing && isBooked && !isMine) openBookingModal(existing, 'waitlist');
                                        };

                                        // Styling Logic (Copied and adapted for Table Cell)
                                        let content;
                                        let cellClass = "p-2 rounded-lg transition-all flex flex-col items-center justify-center text-xs h-[80px] w-full border ";
                                    
                                    if (isOwner) {
                                        if (existing) {
                                            if (isBooked) {
                                                cellClass += "bg-m3-primary-container border-google-blue text-m3-on-primary-container";
                                                content = (
                                                    <>
                                                        <div className="font-bold truncate w-full text-center">{existing.bookerName}</div>
                                                        {waitlistSize > 0 && <div className="mt-1 text-[10px] font-medium">{t('waitlistCount', { count: waitlistSize })}</div>}
                                                        <button onClick={(e) => { e.stopPropagation(); handleKick(existing); }} className="app-icon-button mt-1 hover:bg-google-red hover:text-white"><UserMinus className="w-4 h-4" /></button>
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
	                                                    content = <><span className="font-bold">{t('booked')}</span><div className="text-[10px] opacity-80">{t('currentUserBadge')}</div></>;
                                                } else {
                                                    cellClass += isWaitlisted
                                                        ? "bg-google-yellow/10 border-google-yellow/50 text-[#8a5a00] hover:bg-google-yellow/20"
                                                        : "bg-m3-surface-container-high border-google-yellow/30 text-m3-on-surface-variant hover:bg-google-yellow/10";
                                                    content = (
                                                        <div className="flex flex-col items-center gap-1">
                                                            <span className="line-through">{t('booked')}</span>
                                                            <span className="text-[9px] truncate w-[80px] text-center">{existing.bookerName}</span>
                                                            <span className="font-bold">{isWaitlisted ? `${t('waitlisted')} · ${t('leaveWaitlist')}` : t('joinWaitlist')}</span>
                                                            {waitlistSize > 0 && <span className="text-[9px]">{t('waitlistCount', { count: waitlistSize })}</span>}
                                                        </div>
                                                    );
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
                                                <CellShell
                                                  {...(isInteractive ? { type: 'button', onClick: handleClick } : {})}
                                                  className={`${cellClass} ${isInteractive ? 'cursor-pointer' : 'cursor-default'}`}
                                                >
                                                    {content}
                                                </CellShell>
                                            </td>
                                        );
                                    })}
                            </tr>
                        ))}
                    </tbody>
                </table>
	                {isOwner && <div className="text-center text-xs text-m3-on-surface-variant p-2 border-t border-m3-outline-variant/10">{t('bookingOwnerHint')}</div>}
            </div>
        )}

        {/* --- Booking Modal --- */}
	        {showBookModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
                <div className="app-dialog animate-scale-in">
                    <h3 className="text-xl font-medium mb-4">{bookModalMode === 'waitlist' ? t('joinWaitlist') : t('confirmBooking')}</h3>
                    <div className="mb-4 text-sm text-m3-on-surface-variant flex items-center gap-2">
                         <CalendarCheck className="w-4 h-4" />
                         <span>{showBookModal.label}</span>
                    </div>
                    
                    <div className="space-y-4 mb-6">
                        {reqFields.map(field => (
                            <div key={field}>
                                <label className="app-label uppercase tracking-wide">{field}</label>
                                <input 
                                    type="text" 
                                    value={bookingForm[field] || ''}
                                    onChange={e => setBookingForm({...bookingForm, [field]: e.target.value})}
                                    className="app-input"
                                />
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-3">
                        <button onClick={resetBookingModal} className="app-button-quiet flex-1">{t('cancel')}</button>
                        <button onClick={handleBookSubmit} className="app-button-primary flex-1">{bookModalMode === 'waitlist' ? t('joinWaitlist') : t('bookSlot')}</button>
                    </div>
                </div>
            </div>
	        )}

	        {kickModal && (
	            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
	                <div className="app-dialog animate-scale-in">
	                    <h3 className="mb-2 text-xl font-medium">{t('bookingCancelled')}</h3>
	                    <p className="mb-4 text-sm text-m3-on-surface-variant">{t('kickConfirm', { name: kickModal.bookerName || t('anonymousUser') })}</p>
	                    <label className="app-label">{t('kickReason')}</label>
	                    <input
	                        type="text"
	                        value={kickReason}
	                        onChange={(event) => setKickReason(event.target.value)}
	                        className="app-input mb-6"
	                    />
	                    <div className="flex gap-3">
	                        <button onClick={() => setKickModal(null)} className="app-button-quiet flex-1">{t('cancel')}</button>
	                        <button onClick={handleKickSubmit} className="app-button bg-google-red text-white flex-1">{t('bookingCancelled')}</button>
	                    </div>
	                </div>
	            </div>
	        )}

    </div>
  );
}
