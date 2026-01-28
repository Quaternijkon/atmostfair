import React, { useState, useEffect } from 'react';
import { db } from '../main';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { Flag, X, Info, AlertTriangle } from './Icons';

export default function AnnouncementSystem({ t = (k) => k }) {
  const [announcements, setAnnouncements] = useState([]);
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
          const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setAnnouncements(items);
        });
        return () => unsubscribe();
    } catch(e) {
        console.warn("Announcement system disabled or error", e);
    }
  }, []);

  const unreadCount = announcements.filter(a => !readIds.includes(a.id)).length;

  const markAsRead = (id) => {
    if (!readIds.includes(id)) {
      const newReadIds = [...readIds, id];
      setReadIds(newReadIds);
      localStorage.setItem('readAnnouncements', JSON.stringify(newReadIds));
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
  };

  const close = () => setIsOpen(false);

  if (announcements.length === 0) return null;

  return (
    <>
      <button 
        onClick={handleOpen}
        className="relative p-2 rounded-full text-m3-on-surface-variant hover:bg-m3-on-surface/5 transition-colors"
        title={t('announcements') || 'Announcements'}
      >
        <Flag className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-2 right-2 w-2 h-2 bg-google-yellow rounded-full border border-m3-surface" />
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
           <div className="bg-m3-surface-container rounded-[28px] w-full max-w-md shadow-elevation-3 flex flex-col max-h-[80vh]">
             <div className="p-4 border-b border-m3-outline-variant/30 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <Flag className="w-6 h-6 text-google-yellow" />
                    <h3 className="text-xl font-normal text-m3-on-surface">{t('announcements') || 'Announcements'}</h3>
                </div>
                <button onClick={close} className="p-2 hover:bg-m3-on-surface/5 rounded-full">
                    <X className="w-5 h-5 text-m3-on-surface" />
                </button>
             </div>

             <div className="overflow-y-auto p-4 space-y-3">
                {announcements.map((item) => {
                    const isUnread = !readIds.includes(item.id);
                    if (isUnread) markAsRead(item.id); 

                    return (
                        <div key={item.id} className={`p-4 rounded-xl border ${item.type === 'warning' ? 'bg-google-red/5 border-google-red/30' : 'bg-m3-surface border-m3-outline-variant/30'}`}>
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
                                        {item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : ''}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
             </div>
           </div>
        </div>
      )}
    </>
  );
}
