import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, limit, db } from '../lib/localData';
import { isAnnouncementVisible } from '../lib/announcementDomain';
import { formatDate } from '../lib/locale';
import { Flag, X, Info, AlertTriangle, RotateCcw } from './Icons';

export default function AnnouncementSystem({ t = (k) => k }) {
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoadError, setAnnouncementsLoadError] = useState(false);
  const [announcementsReloadKey, setAnnouncementsReloadKey] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [readIds, setReadIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('readAnnouncements') || '[]');
    } catch { return []; }
  });

  useEffect(() => {
    try {
        const q = query(
          collection(db, 'announcements'),
          where('active', '==', true),
          orderBy('createdAt', 'desc'),
          limit(5)
        );
    
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(isAnnouncementVisible);
          setAnnouncements(items);
          setAnnouncementsLoadError(false);
        }, (error) => {
          console.warn("Error loading announcements:", error);
          setAnnouncementsLoadError(true);
        });
        return () => unsubscribe();
    } catch(e) {
        console.warn("Announcement system disabled or error", e);
        setAnnouncementsLoadError(true);
    }
  }, [announcementsReloadKey]);

  const unreadCount = announcements.filter(a => !readIds.includes(a.id)).length;

  const retryAnnouncements = () => {
    setAnnouncementsReloadKey((key) => key + 1);
  };

  const markVisibleAnnouncementsAsRead = () => {
    const unreadIds = announcements.map((item) => item.id).filter((id) => !readIds.includes(id));
    if (unreadIds.length === 0) return;

    const newReadIds = [...readIds, ...unreadIds];
    setReadIds(newReadIds);
    localStorage.setItem('readAnnouncements', JSON.stringify(newReadIds));
  };

  const handleOpen = () => {
    markVisibleAnnouncementsAsRead();
    setIsOpen(true);
  };

  const close = () => setIsOpen(false);

  if (announcements.length === 0 && !announcementsLoadError) return null;

  return (
    <>
      <button 
        onClick={handleOpen}
        className="app-icon-button relative"
        title={t('announcements')}
      >
        <Flag className="w-5 h-5" />
        {announcementsLoadError ? (
          <span className="absolute top-2 right-2 w-2 h-2 bg-google-red rounded-full border border-m3-surface" />
        ) : unreadCount > 0 && (
          <span className="absolute top-2 right-2 w-2 h-2 bg-google-yellow rounded-full border border-m3-surface" />
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[60] flex animate-fade-in items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
           <div className="app-dialog flex max-h-[80vh] max-w-md flex-col p-0">
             <div className="flex items-center justify-between border-b border-m3-outline-variant/30 p-4">
                <div className="flex items-center gap-3">
                    <Flag className="w-6 h-6 text-google-yellow" />
                    <h3 className="text-xl font-medium text-m3-on-surface">{t('announcements')}</h3>
                </div>
                <button onClick={close} className="app-icon-button" title={t('close')}>
                    <X className="w-5 h-5 text-m3-on-surface" />
                </button>
             </div>

             <div className="overflow-y-auto p-4 space-y-3">
                {announcementsLoadError && (
                    <div role="alert" className="rounded-2xl border border-google-red/30 bg-google-red/5 p-4">
                        <div className="flex gap-3">
                            <AlertTriangle className="mt-1 w-5 h-5 shrink-0 text-google-red" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm text-m3-on-surface-variant leading-relaxed">{t('announcementsLoadFailed')}</p>
                                <button type="button" onClick={retryAnnouncements} className="app-button mt-3">
                                    <RotateCcw className="w-4 h-4" />
                                    {t('chatRetry')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {announcements.map((item) => (
                        <div key={item.id} className={`rounded-2xl border p-4 ${item.type === 'warning' ? 'bg-google-red/5 border-google-red/30' : 'bg-m3-surface border-m3-outline-variant/30'}`}>
                            <div className="flex gap-3">
                                <div className="mt-1">
                                    {item.type === 'warning' ? (
                                        <AlertTriangle className="w-5 h-5 text-google-red" />
                                    ) : (
                                        <Info className="w-5 h-5 text-google-blue" />
                                    )}
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-m3-on-surface mb-1">{item.title}</h4>
                                    <p className="text-sm text-m3-on-surface-variant leading-relaxed whitespace-pre-wrap">{item.content}</p>
                                    <span className="text-xs text-m3-on-surface-variant/70 mt-2 block">
                                        {item.createdAt?.seconds ? formatDate(item.createdAt.seconds * 1000, t) : ''}
                                    </span>
                                </div>
                            </div>
                        </div>
                ))}
             </div>
           </div>
        </div>
      )}
    </>
  );
}
