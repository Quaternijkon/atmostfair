import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, Navigate, Link } from 'react-router-dom';
import { onAuthStateChanged, isSignInWithEmailLink, signInWithEmailLink, signOut } from 'firebase/auth';
import { collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, arrayUnion, arrayRemove } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { TRANSLATIONS } from './constants/translations';
import { LogOut, Shield } from './components/Icons';
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
  const [gatherFields, setGatherFields] = useState([]);
  const [gatherSubmissions, setGatherSubmissions] = useState([]);
  const [claimItems, setClaimItems] = useState([]);

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
    const unsubGatherFields = onSnapshot(collection(db, 'gather_fields'), (s) => setGatherFields(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubGatherSubmissions = onSnapshot(collection(db, 'gather_submissions'), (s) => setGatherSubmissions(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubClaimItems = onSnapshot(collection(db, 'claim_items'), (s) => setClaimItems(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsubProjects(); unsubItems(); unsubRooms(); unsubRoulette(); unsubGatherFields(); unsubGatherSubmissions(); unsubClaimItems(); };
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
                    gatherFields={gatherFields}
                    gatherSubmissions={gatherSubmissions}                    claimItems={claimItems}                    onClose={() => setShowAdmin(false)}
                    t={t}
                />
              ) : (
                <Routes>
                    <Route path="/" element={<Dashboard projects={projects} onCreateProject={handleCreateProject} defaultName={user.displayName || ''} t={t} />} />
                    <Route path="/collect/:id" element={<ProjectDetail projects={projects} user={user} isAdmin={isAdmin} items={items} rooms={rooms} rouletteData={rouletteParticipants} gatherFields={gatherFields} gatherSubmissions={gatherSubmissions} claimItems={claimItems} actions={actions} t={t} />} />
                    <Route path="/connect/:id" element={<ProjectDetail projects={projects} user={user} isAdmin={isAdmin} items={items} rooms={rooms} rouletteData={rouletteParticipants} gatherFields={gatherFields} gatherSubmissions={gatherSubmissions} claimItems={claimItems} actions={actions} t={t} />} />
                    <Route path="/select/:id" element={<ProjectDetail projects={projects} user={user} isAdmin={isAdmin} items={items} rooms={rooms} rouletteData={rouletteParticipants} gatherFields={gatherFields} gatherSubmissions={gatherSubmissions} claimItems={claimItems} actions={actions} t={t} />} />
                    <Route path="/projects/:id" element={<ProjectDetail projects={projects} user={user} isAdmin={isAdmin} items={items} rooms={rooms} rouletteData={rouletteParticipants} gatherFields={gatherFields} gatherSubmissions={gatherSubmissions} claimItems={claimItems} actions={actions} t={t} />} />
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
