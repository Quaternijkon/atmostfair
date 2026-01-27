import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, Navigate, Link } from 'react-router-dom';
import { onAuthStateChanged, isSignInWithEmailLink, signInWithEmailLink, signOut } from 'firebase/auth';
import { collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, arrayUnion, arrayRemove, writeBatch, setDoc } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { TRANSLATIONS } from './constants/translations';
import { LogOut, Shield, Bell } from './components/Icons';
import AtmostfairLogo from './components/Logo';
import { UIProvider } from './components/UIComponents';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import AdminDashboard from './components/AdminDashboard';

export default function App() {
  const [lang, setLang] = useState(localStorage.getItem('app_lang') || 'zh');
  const t = (key, params = {}) => {
    let str = TRANSLATIONS[lang]?.[key] || key;
    if (typeof str !== 'string') return str;
    Object.keys(params).forEach(k => {
      str = str.replace(new RegExp(`{${k}}`, 'g'), params[k]);
    });
    return str;
  };

  const toggleLang = () => {
    const newLang = lang === 'zh' ? 'en' : 'zh';
    setLang(newLang);
    localStorage.setItem('app_lang', newLang);
  };

  // ADMIN CONFIGURATION
  const ADMIN_EMAILS = ['quaternijkon@mail.ustc.edu.cn'];
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [showAdmin, setShowAdmin] = useState(false);

  const isAdmin = user && (ADMIN_EMAILS.includes(user.email) || ADMIN_EMAILS.length === 0);

  const [projects, setProjects] = useState([]);
  const [items, setItems] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [rouletteParticipants, setRouletteParticipants] = useState([]);
  const [queueParticipants, setQueueParticipants] = useState([]);
  const [gatherFields, setGatherFields] = useState([]);
  const [gatherSubmissions, setGatherSubmissions] = useState([]);
  const [scheduleSubmissions, setScheduleSubmissions] = useState([]);
  const [bookingSlots, setBookingSlots] = useState([]);
  const [claimItems, setClaimItems] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Auth & Magik Link Effect
  useEffect(() => {
     if (isSignInWithEmailLink(auth, window.location.href)) {
      let email = window.localStorage.getItem('emailForSignIn');
      if (!email) email = window.prompt(t('magicLinkPrompt'));
      if (email) {
        signInWithEmailLink(auth, email, window.location.href)
          .then(() => {
            window.localStorage.removeItem('emailForSignIn');
            window.history.replaceState({}, document.title, window.location.pathname);
          })
          .catch((err) => alert(t('magicLinkError') + ' ' + err.message));
      }
    }
  }, [lang]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  // Data Sync
  useEffect(() => {
    if (!user) return;
    const unsubProjects = onSnapshot(collection(db, 'projects'), (s) => setProjects(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b)=> (b.createdAt||0)-(a.createdAt||0))));
    const unsubItems = onSnapshot(collection(db, 'voting_items'), (s) => setItems(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubRooms = onSnapshot(collection(db, 'rooms'), (s) => setRooms(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubRoulette = onSnapshot(collection(db, 'roulette_participants'), (s) => setRouletteParticipants(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubQueue = onSnapshot(collection(db, 'queue_participants'), (s) => setQueueParticipants(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubGatherFields = onSnapshot(collection(db, 'gather_fields'), (s) => setGatherFields(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubGatherSubmissions = onSnapshot(collection(db, 'gather_submissions'), (s) => setGatherSubmissions(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubScheduleSubmissions = onSnapshot(collection(db, 'schedule_submissions'), (s) => setScheduleSubmissions(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubBookingSlots = onSnapshot(collection(db, 'booking_slots'), (s) => setBookingSlots(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubClaimItems = onSnapshot(collection(db, 'claim_items'), (s) => setClaimItems(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubNotifications = onSnapshot(collection(db, 'notifications'), (s) => setNotifications(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(n => n.recipientId === user.uid).sort((a,b)=>b.createdAt-a.createdAt)));
    return () => { unsubProjects(); unsubItems(); unsubRooms(); unsubRoulette(); unsubQueue(); unsubGatherFields(); unsubGatherSubmissions(); unsubScheduleSubmissions(); unsubBookingSlots(); unsubClaimItems(); unsubNotifications(); };
  }, [user]);

  // Actions
  const actions = {
      handleAddItem: async (title, projectId, creatorName) => {
        if (!title.trim() || !user) return;
        await addDoc(collection(db, 'voting_items'), { title, projectId, creatorId: user.uid, creatorName: creatorName || user.displayName || 'Anonymous', votes: [], createdAt: Date.now() });
      },
      handleDeleteItem: async (itemId) => deleteDoc(doc(db, 'voting_items', itemId)),
      handleVote: async (item) => {
         if (!user) return;
         const ref = doc(db, 'voting_items', item.id);
         if (item.votes?.includes(user.uid)) await updateDoc(ref, { votes: arrayRemove(user.uid) });
         else await updateDoc(ref, { votes: arrayUnion(user.uid) });
      },
      handleCreateRoom: async (name, maxMembers, projectId, creatorName) => {
         if (!user || !name.trim()) return;
         await addDoc(collection(db, 'rooms'), { name, projectId, ownerId: user.uid, maxMembers: parseInt(maxMembers)||4, members: [{ uid: user.uid, name: creatorName||user.displayName||'User', joinedAt: Date.now() }], createdAt: Date.now() });
      },
      handleJoinRoom: async (roomId, userName) => {
         if (!user) return;
         await updateDoc(doc(db, 'rooms', roomId), { members: arrayUnion({ uid: user.uid, name: userName||user.displayName||'Anonymous', joinedAt: Date.now() }) });
      },
      handleKickMember: async (roomId, memberObject) => updateDoc(doc(db, 'rooms', roomId), { members: arrayRemove(memberObject) }),
      handleDeleteRoom: async (roomId) => deleteDoc(doc(db, 'rooms', roomId)),
      handleJoinQueue: async (projectId, userName, value) => {
         if (!user) return;
         await addDoc(collection(db, 'queue_participants'), { projectId, uid: user.uid, name: userName||user.displayName, value: parseInt(value)||0, joinedAt: Date.now(), queueOrder: null });
      },
      handleGenerateQueue: async (projectId) => {
         if (!user) return;
         const parts = queueParticipants.filter(p => p.projectId === projectId);
         if (parts.length === 0) return;
         
         let pool = [...parts];
         let order = 1;
         const updates = [];
         
         while (pool.length > 0) {
            const currentSum = pool.reduce((acc, p) => acc + p.value, 0);
            const index = currentSum % pool.length;
            const winner = pool[index];
            updates.push({ id: winner.id, queueOrder: order });
            order++;
            pool.splice(index, 1);
         }
         
         const batch = writeBatch(db);
         updates.forEach(u => {
            const ref = doc(db, 'queue_participants', u.id);
            batch.update(ref, { queueOrder: u.queueOrder });
         });
         const projectRef = doc(db, 'projects', projectId);
         batch.update(projectRef, { status: 'finished' });
         
         await batch.commit();
      },
      handleJoinRoulette: async (projectId, userName, value) => {
         if (!user) return;
         await addDoc(collection(db, 'roulette_participants'), { projectId, uid: user.uid, name: userName||user.displayName, value: parseInt(value)||0, joinedAt: Date.now(), isWinner: false });
      },
      handleRecordWinner: async (projectId, winnerInfo) => {
         await updateDoc(doc(db, 'projects', projectId), { winners: arrayUnion({ ...winnerInfo, wonAt: Date.now() }), status: 'finished' });
         if (winnerInfo.participantId) await updateDoc(doc(db, 'roulette_participants', winnerInfo.participantId), { isWinner: true });
      },
      handleToggleProjectStatus: async (project) => {
        if (!user || user.uid !== project.creatorId) return; 
        const newStatus = project.status === 'active' ? 'stopped' : 'active';
        await updateDoc(doc(db, 'projects', project.id), { status: newStatus });
      },
      handleDeleteProject: async (projectId) => {
        await deleteDoc(doc(db, 'projects', projectId));
      },
      handleCreateGatherField: async (projectId, label) => {
        if (!user || !label.trim()) return;
        await addDoc(collection(db, 'gather_fields'), { projectId, label, type: 'text', creatorId: user.uid, createdAt: Date.now() });
      },
      handleDeleteGatherField: async (fieldId) => {
        if (!user) return;
        await deleteDoc(doc(db, 'gather_fields', fieldId));
      },
      handleSubmitGather: async (projectId, data, submitterName) => {
        if (!user) return;
        // Check if already submitted? Handled in UI, and rule (or check here)
        // We will just add.
        await addDoc(collection(db, 'gather_submissions'), { projectId, uid: user.uid, name: submitterName || user.displayName || 'Anonymous', data, submittedAt: Date.now() });
      },
      handleUpdateScheduleConfig: async (projectId, config) => {
         if (!user) return;
         await updateDoc(doc(db, 'projects', projectId), { scheduleConfig: config });
      },
      handleSubmitSchedule: async (projectId, availability, submitterName) => {
         if (!user) return;
         const existing = scheduleSubmissions.find(s => s.projectId === projectId && s.uid === user.uid);
         if (existing) {
             await updateDoc(doc(db, 'schedule_submissions', existing.id), { availability, submittedAt: Date.now() });
         } else {
             await addDoc(collection(db, 'schedule_submissions'), { projectId, uid: user.uid, name: submitterName || user.displayName || 'Anonymous', availability, submittedAt: Date.now() });
         }
      },
      handleUpdateBookingConfig: async (projectId, config) => {
         if (!user) return;
         await updateDoc(doc(db, 'projects', projectId), { bookingConfig: config });
      },
      handleCreateBookingSlot: async (projectId, start, end, label) => {
         // Create a slot doc. If already exists (somehow), ignore or valid. Ideally use unique combination as ID or random.
         // Let's use random ID for slots to allow multiple same-time slots if needed (abstractions).
         await addDoc(collection(db, 'booking_slots'), { projectId, start, end, label, createdAt: Date.now() });
      },
      handleDeleteBookingSlot: async (slotId) => deleteDoc(doc(db, 'booking_slots', slotId)),
      handleBookSlot: async (slotId, bookingData) => {
         // Transactional safety would be better, but optimistic update ok for MVP
         if (!user) return;
         await updateDoc(doc(db, 'booking_slots', slotId), { bookedBy: user.uid, bookerName: user.displayName || 'Anonymous', bookingData, bookedAt: Date.now() });
      },
      handleKickUser: async (slotId, recipientId, projectId, reason) => {
         if (!user) return;
         // Clear slot
         await updateDoc(doc(db, 'booking_slots', slotId), { bookedBy: null, bookerName: null, bookingData: null, bookedAt: null });
         // Notify
         await addDoc(collection(db, 'notifications'), { recipientId, type: 'kicked', title: t('bookingCancelled'), message: reason, projectId, read: false, createdAt: Date.now() });
      },
      handleReadNotification: async (nId) => updateDoc(doc(db, 'notifications', nId), { read: true }),
      handleCreateClaimItem: async (projectId, title, maxClaims) => {
         if (!user || !title.trim()) return;
         await addDoc(collection(db, 'claim_items'), { projectId, title, maxClaims: parseInt(maxClaims)||1, claimants: [], creatorId: user.uid, creatorName: user.displayName || 'Anonymous', createdAt: Date.now() });
      },
      handleDeleteClaimItem: async (itemId) => {
         await deleteDoc(doc(db, 'claim_items', itemId));
      },
      handleToggleClaim: async (item, userName) => {
         if (!user) return;
         const ref = doc(db, 'claim_items', item.id);
         const existingClaim = item.claimants.find(c => c.uid === user.uid);
         if (existingClaim) {
             // Unclaim
             await updateDoc(ref, { claimants: arrayRemove(existingClaim) });
         } else {
             // Claim
             if (item.claimants.length >= item.maxClaims) return; // Full
             const claimInfo = { uid: user.uid, name: userName||user.displayName||'User', at: Date.now() };
             await updateDoc(ref, { claimants: arrayUnion(claimInfo) });
         }
      }
  };

  const handleCreateProject = async (title, type, creatorName, password) => {
    if (!user || !title.trim()) return;
    try {
      await addDoc(collection(db, 'projects'), { title, type, creatorId: user.uid, creatorName: creatorName||user.displayName||'Anonymous', password: password||'', status: 'active', createdAt: Date.now(), winners: [] });
    } catch (e) { console.error(e); }
  };

  if (authChecking) return <div className="min-h-screen flex items-center justify-center bg-m3-surface">{t('loading')}</div>;

  return (
    <Router>
      <UIProvider>
        {!user ? (
          <Login lang={lang} setLang={setLang} t={t} />
        ) : (
          <div className="min-h-screen bg-m3-surface text-m3-on-surface font-sans">
            <nav className="bg-m3-surface-container px-6 py-3 flex justify-between items-center sticky top-0 z-20 shadow-none border-b border-white/50">
              <Link to="/" className="flex items-center gap-2 cursor-pointer transition-opacity hover:opacity-80">
                <AtmostfairLogo className="text-2xl" />
              </Link>
              <div className="flex items-center gap-4">
                <button onClick={toggleLang} className="text-sm font-medium text-m3-on-surface-variant hover:text-google-blue px-2 transition-colors">{t('switchLang')}</button>
                
                {/* Notifications & Mailbox */}
                <div className="relative">
                     <button onClick={() => setShowNotifications(!showNotifications)} className="p-2 rounded-full text-m3-on-surface-variant hover:bg-m3-on-surface/5 relative">
                        <Bell className="w-5 h-5" />
                        {notifications.some(n => !n.read) && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-google-red"></span>}
                     </button>
                     {showNotifications && (
                         <div className="absolute right-0 mt-2 w-80 bg-m3-surface-container-high rounded-xl shadow-elevation-3 border border-m3-outline-variant/20 overflow-hidden z-50">
                             <div className="p-3 border-b border-m3-outline-variant/10 font-medium text-sm flex justify-between">
                                 <span>{t('notifications')}</span>
                                 <button onClick={() => setNotifications([])} className="text-xs text-m3-on-surface-variant hover:text-google-blue hidden">{t('clearAll')}</button>
                             </div>
                             <div className="max-h-64 overflow-y-auto">
                                 {notifications.length === 0 ? (
                                     <div className="p-4 text-center text-xs text-m3-on-surface-variant">{t('noNotifications')}</div>
                                 ) : (
                                     notifications.map(n => (
                                         <div key={n.id} onClick={() => actions.handleReadNotification(n.id)} className={`p-3 border-b border-m3-outline-variant/10 cursor-pointer hover:bg-white/5 ${n.read ? 'opacity-60' : 'bg-google-blue/5'}`}>
                                             <div className="text-sm font-medium mb-1">{n.title}</div>
                                             <div className="text-xs text-m3-on-surface-variant">{n.message}</div>
                                             <div className="text-[10px] text-m3-on-surface-variant/60 mt-1 text-right">{new Date(n.createdAt).toLocaleDateString()}</div>
                                         </div>
                                     ))
                                 )}
                             </div>
                         </div>
                     )}
                </div>

                {isAdmin && (
                  <button onClick={() => setShowAdmin(!showAdmin)} className={`p-2 rounded-full transition-colors ${showAdmin ? 'bg-google-blue text-white' : 'text-m3-on-surface-variant hover:bg-google-blue/10'}`} title={t('adminConsole')}>
                    <Shield className="w-5 h-5" />
                  </button>
                )}
                <div className="text-sm text-m3-on-surface-variant hidden sm:block">{t('hello')}, {user.displayName || user.email || 'Guest'}</div>
                <button onClick={() => signOut(auth)} className="text-m3-on-surface-variant hover:text-google-red p-2 rounded-full hover:bg-google-red/10 transition-colors" title={t('logout')}><LogOut className="w-5 h-5" /></button>
              </div>
            </nav>

            <main className="max-w-[1200px] mx-auto p-4 md:p-6 lg:p-8">
              {showAdmin && isAdmin ? (
                <AdminDashboard
                    projects={projects}
                    items={items}
                    rooms={rooms}
                    rouletteParticipants={rouletteParticipants}
                    queueParticipants={queueParticipants}
                    gatherFields={gatherFields}
                    gatherSubmissions={gatherSubmissions}
                    scheduleSubmissions={scheduleSubmissions}
                    bookingSlots={bookingSlots}                    claimItems={claimItems}                    onClose={() => setShowAdmin(false)}
                    t={t}
                />
              ) : (
                <Routes>
                    <Route path="/" element={<Dashboard projects={projects} onCreateProject={handleCreateProject} defaultName={user.displayName || ''} t={t} />} />
                    <Route path="/collect/:id" element={<ProjectDetail projects={projects} user={user} isAdmin={isAdmin} items={items} rooms={rooms} rouletteData={rouletteParticipants} queueData={queueParticipants} gatherFields={gatherFields} gatherSubmissions={gatherSubmissions} scheduleSubmissions={scheduleSubmissions} bookingSlots={bookingSlots} claimItems={claimItems} actions={actions} t={t} />} />
                    <Route path="/connect/:id" element={<ProjectDetail projects={projects} user={user} isAdmin={isAdmin} items={items} rooms={rooms} rouletteData={rouletteParticipants} queueData={queueParticipants} gatherFields={gatherFields} gatherSubmissions={gatherSubmissions} scheduleSubmissions={scheduleSubmissions} bookingSlots={bookingSlots} claimItems={claimItems} actions={actions} t={t} />} />
                    <Route path="/select/:id" element={<ProjectDetail projects={projects} user={user} isAdmin={isAdmin} items={items} rooms={rooms} rouletteData={rouletteParticipants} queueData={queueParticipants} gatherFields={gatherFields} gatherSubmissions={gatherSubmissions} scheduleSubmissions={scheduleSubmissions} bookingSlots={bookingSlots} claimItems={claimItems} actions={actions} t={t} />} />
                    <Route path="/projects/:id" element={<ProjectDetail projects={projects} user={user} isAdmin={isAdmin} items={items} rooms={rooms} rouletteData={rouletteParticipants} queueData={queueParticipants} gatherFields={gatherFields} gatherSubmissions={gatherSubmissions} scheduleSubmissions={scheduleSubmissions} bookingSlots={bookingSlots} claimItems={claimItems} actions={actions} t={t} />} />
                    <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              )}
            </main>
          </div>
        )}
      </UIProvider>
    </Router>
  );
}
