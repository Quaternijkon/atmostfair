import React, { useState } from 'react';
import { Plus, CheckSquare, MinusCircle, UserCheck, Trash2 } from './Icons';
import { formatDateTime } from '../lib/locale';
import { PROJECT_CHILD_TEXT_MAX_LENGTH } from '../lib/projectDomain';
import { useUI } from './UIContext';

export default function ClaimView({ user, isAdmin, project, items = [], isStopped, isOwner, actions, t }) {
  const { showToast, confirm } = useUI();
  const [newItem, setNewItem] = useState('');
  const [maxClaims, setMaxClaims] = useState(1);
  const [filterMyTasks, setFilterMyTasks] = useState(false);

  const handleAddItem = (e) => {
    e.preventDefault();
    if (!newItem.trim()) return;
    actions.handleCreateClaimItem(project.id, newItem.trim(), maxClaims);
    setNewItem('');
    setMaxClaims(1);
  };

  const handleToggleClaim = (item) => {
      actions.handleToggleClaim(item);
  };

  const myClaimsCount = items.reduce((acc, item) => acc + (item.claimants.some(c => c.uid === user.uid) ? 1 : 0), 0);
  const totalClaimsCount = items.reduce((acc, item) => acc + item.claimants.length, 0);
  const totalSlots = items.reduce((acc, item) => acc + item.maxClaims, 0);
  
  // Sorting: My tasks first, then open tasks, then full tasks
  const sortedItems = [...items].sort((a, b) => {
      const aMy = a.claimants.some(c => c.uid === user.uid);
      const bMy = b.claimants.some(c => c.uid === user.uid);
      if (aMy && !bMy) return -1;
      if (!aMy && bMy) return 1;
      return a.createdAt - b.createdAt;
  });

  const filteredItems = filterMyTasks ? sortedItems.filter(i => i.claimants.some(c => c.uid === user.uid)) : sortedItems;

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Creator Input */}
      {(isOwner || isAdmin) && !isStopped && (
        <div className="app-card mb-6 animate-fade-in-up p-5 sm:p-6">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-google-red" />
            {t('addItem')}
          </h3>
          <form onSubmit={handleAddItem} className="flex flex-col md:flex-row gap-4">
             <div className="flex-1">
                <input 
                    type="text" 
                    value={newItem} 
                    onChange={(e) => setNewItem(e.target.value)}
                    placeholder={t('taskTitle')}
                    className="app-input"
                    maxLength={PROJECT_CHILD_TEXT_MAX_LENGTH}
                />
             </div>
             <div className="flex items-center gap-2">
                <label className="text-sm text-m3-on-surface-variant whitespace-nowrap">{t('maxClaims')}:</label>
                <input 
                    type="number" 
                    min="1" 
                    max="99"
                    value={maxClaims} 
                    onChange={(e) => setMaxClaims(parseInt(e.target.value))}
                    className="app-input w-24"
                />
             </div>
             <button type="submit" className="app-button bg-google-red text-white hover:shadow-elevation-1">
                <Plus className="w-4 h-4" /> {t('create')}
             </button>
          </form>
        </div>
      )}

      {/* Progress & Filters */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                  <span className="text-m3-on-surface-variant text-sm">{t('progress')}:</span>
                  <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-light text-m3-on-surface">{totalClaimsCount}</span>
                      <span className="text-sm text-m3-on-surface-variant">/ {totalSlots}</span>
                  </div>
              </div>
              <div className="h-8 w-px bg-m3-outline/20"></div>
              <div className="flex items-center gap-2">
                  <span className="text-m3-on-surface-variant text-sm">{t('myTasks')}:</span>
                  <span className="text-lg font-medium text-google-red">{myClaimsCount}</span>
              </div>
          </div>

          <div className="flex gap-2">
              <button 
                onClick={() => setFilterMyTasks(!filterMyTasks)}
                className={`app-button px-4 text-sm ${filterMyTasks ? 'border border-google-red bg-google-red/10 text-google-red' : 'border border-m3-outline bg-white text-m3-on-surface hover:bg-m3-surface-container'}`}
              >
                  {t('myTasksOnly')}
              </button>
          </div>
      </div>

      {/* List */}
      <div className="space-y-3 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          {filteredItems.map(item => {
              const isMine = item.claimants.some(c => c.uid === user.uid);
              const isFull = item.claimants.length >= item.maxClaims;
              const slotsLeft = item.maxClaims - item.claimants.length;
              
              return (
                  <div key={item.id} className={`app-card group relative p-4 ${isMine ? 'border-google-red/50 bg-google-red/5' : 'hover:border-google-red/30'}`}>
                      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                          <div className="flex-1">
                              <h4 className={`text-lg font-medium mb-1 ${isMine ? 'text-google-red' : 'text-m3-on-surface'}`}>{item.title}</h4>
                              
                              {/* Claimants Avatars */}
                              {item.claimants.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-2 mt-2">
                                      {item.claimants.map((c, i) => (
                                          <div key={i} className="flex items-center gap-1.5 bg-m3-surface-container-high px-2 py-0.5 rounded-full text-xs text-m3-on-surface-variant" title={t('takenAt', { date: formatDateTime(c.at, t) })}>
                                              <div className="w-5 h-5 rounded-full bg-google-red/20 text-google-red flex items-center justify-center font-bold text-[10px] uppercase">
                                                  {c.name.charAt(0)}
                                              </div>
                                              <span className="max-w-[80px] truncate">{c.name}</span>
                                          </div>
                                      ))}
                                      {!isFull && (
                                          <span className="text-xs text-m3-on-surface-variant/70 italic px-2">
                                              {t('spotsLeft', { count: slotsLeft })}
                                          </span>
                                      )}
                                  </div>
                              )}
                              {item.claimants.length === 0 && (
                                  <div className="mt-1 text-xs text-google-green font-medium flex items-center gap-1">
                                      <span className="w-2 h-2 rounded-full bg-google-green"></span>
                                      {t('spotsLeft', { count: slotsLeft })} · {t('open')}
                                  </div>
                              )}
                          </div>

                          <div className="flex items-center gap-3">
                              {/* Edit Actions for Admin */}
                              {(isOwner || isAdmin) && !isStopped && (
                                  <button onClick={() => confirm({ type: 'destructive', title: t('delete'), message: t('confirmDelete'), onConfirm: () => actions.handleDeleteClaimItem(item.id) })} className="app-icon-button opacity-0 hover:bg-google-red/10 hover:text-google-red group-hover:opacity-100">
                                      <Trash2 className="w-4 h-4" />
                                  </button>
                              )}

                              {/* Claim Button */}
                              {!isStopped && (
                                  isMine ? (
                                      <button 
                                          onClick={() => handleToggleClaim(item)}
                                          className="app-button bg-m3-surface-container-high text-m3-on-surface hover:bg-google-red hover:text-white group/btn"
                                      >
                                          <MinusCircle className="w-4 h-4 text-google-red group-hover/btn:text-white" />
                                          {t('unclaim')}
                                      </button>
                                  ) : (
                                      !isFull ? (
                                        <button 
                                            onClick={() => handleToggleClaim(item)}
                                            className="app-button bg-google-red text-white hover:shadow-elevation-1"
                                        >
                                            <UserCheck className="w-4 h-4" />
                                            {t('claim')}
                                        </button>
                                      ) : (
                                        <button disabled className="app-button bg-m3-surface-container text-m3-on-surface-variant/50">
                                            {t('full')}
                                        </button>
                                      )
                                  )
                              )}
                          </div>
                      </div>
                  </div>
              );
          })}
          {items.length === 0 && (
            <div className="app-card-quiet flex flex-col items-center gap-3 p-8 text-center text-sm text-m3-on-surface-variant">
              <CheckSquare className="h-8 w-8 text-google-red" />
              <span>{t('noTasks')}</span>
            </div>
          )}
      </div>
    </div>
  );
}
