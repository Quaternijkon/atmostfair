import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  doc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';

// --- Icons (Inline SVGs) ---
const IconBase = ({ children, className = "w-6 h-6", ...props }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className} 
    {...props}
  >
    {children}
  </svg>
);

const Activity = (props) => <IconBase {...props}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></IconBase>;
const ArrowLeft = (props) => <IconBase {...props}><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></IconBase>;
const ArrowRight = (props) => <IconBase {...props}><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></IconBase>;
const Copy = (props) => <IconBase {...props}><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></IconBase>;
const DoorOpen = (props) => <IconBase {...props}><path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z"/></IconBase>;
const FolderPlus = (props) => <IconBase {...props}><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 2H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><line x1="12" x2="12" y1="10" y2="16"/><line x1="9" x2="15" y1="13" y2="13"/></IconBase>;
const Lock = (props) => <IconBase {...props}><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></IconBase>;
const LogOut = (props) => <IconBase {...props}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></IconBase>;
const Plus = (props) => <IconBase {...props}><path d="M5 12h14"/><path d="M12 5v14"/></IconBase>;
const Search = (props) => <IconBase {...props}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></IconBase>;
const Trash2 = (props) => <IconBase {...props}><path d="M3 6h18"/><path d="M19 6v14c0 1 1 2 2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></IconBase>;
const Trophy = (props) => <IconBase {...props}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></IconBase>;
const Unlock = (props) => <IconBase {...props}><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></IconBase>;
const UserPlus = (props) => <IconBase {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></IconBase>;
const Users = (props) => <IconBase {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></IconBase>;
const Vote = (props) => <IconBase {...props}><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/></IconBase>;
const Dices = (props) => <IconBase {...props}><rect width="12" height="12" x="2" y="10" rx="2" ry="2"/><path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6"/><path d="M6 18h.01"/><path d="M10 14h.01"/><path d="M15 6h.01"/><path d="M18 9h.01"/></IconBase>;
const Crown = (props) => <IconBase {...props}><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></IconBase>;
const Key = (props) => <IconBase {...props}><path d="m21 2-2 2m-7.6 7.6a6.5 6.5 0 1 1-9.2 7.8 6.5 6.5 0 0 1 9.2-7.8zm0 0 3.8-3.8m-5.5 5.5 2.1 2.1"/></IconBase>;
const X = (props) => <IconBase {...props}><path d="M18 6 6 18"/><path d="m6 6 18 18"/></IconBase>;
const ChartLine = (props) => <IconBase {...props}><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></IconBase>;
const Flag = (props) => <IconBase {...props}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></IconBase>;

// --- Firebase Initialization ---
const getFirebaseConfig = () => {
  if (typeof __firebase_config !== 'undefined') {
    return JSON.parse(__firebase_config);
  } else {
    // REPLACE THIS WITH YOUR OWN FIREBASE CONFIG FOR GITHUB DEPLOYMENT
    return {
      apiKey: "AIzaSyBFHzDuk-Bg0yuFYyV4SufErk0Aju_dUzo",
      authDomain: "atmostfair-84a15.firebaseapp.com",
      projectId: "atmostfair-84a15",
      storageBucket: "atmostfair-84a15.firebasestorage.app",
      messagingSenderId: "309487876744",
      appId: "1:309487876744:web:38356149523ad912e63d3d",
      measurementId: "G-1NPB3HRW5E"
    };
  }
};

const app = initializeApp(getFirebaseConfig());
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'my-github-app';

// --- Main App Component ---
export default function App() {
  const [user, setUser] = useState(null);
  const [currentProject, setCurrentProject] = useState(null); 
  
  // Data State
  const [projects, setProjects] = useState([]);
  const [items, setItems] = useState([]); 
  const [rooms, setRooms] = useState([]); 
  const [rouletteParticipants, setRouletteParticipants] = useState([]); 
  const [loading, setLoading] = useState(true);

  // Auth Effect
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth error:", error);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Data Sync Effect
  useEffect(() => {
    if (!user) return;

    const projectsCol = collection(db, 'artifacts', appId, 'public', 'data', 'projects');
    const unsubProjects = onSnapshot(projectsCol, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setProjects(data);
    });

    const itemsCol = collection(db, 'artifacts', appId, 'public', 'data', 'voting_items');
    const unsubItems = onSnapshot(itemsCol, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setItems(data);
    });

    const roomsCol = collection(db, 'artifacts', appId, 'public', 'data', 'rooms');
    const unsubRooms = onSnapshot(roomsCol, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRooms(data);
    });

    const rouletteCol = collection(db, 'artifacts', appId, 'public', 'data', 'roulette_participants');
    const unsubRoulette = onSnapshot(rouletteCol, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRouletteParticipants(data);
    });

    return () => {
      unsubProjects();
      unsubItems();
      unsubRooms();
      unsubRoulette();
    };
  }, [user]);

  // --- Actions ---

  const handleCreateProject = async (title, type, creatorName, password) => {
    if (!user || !title.trim()) return;
    try {
      const newProject = {
        title,
        type, 
        creatorId: user.uid,
        creatorName: creatorName || '匿名创建者',
        password: password || '', 
        status: 'active', 
        createdAt: Date.now(),
        winners: [] 
      };
      
      const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'projects'), newProject);
      setCurrentProject({ id: docRef.id, ...newProject });
    } catch (e) {
      console.error("Create project error", e);
    }
  };

  const handleToggleProjectStatus = async (project) => {
    if (!user || user.uid !== project.creatorId) return;
    if (project.status === 'finished') return; // Cannot toggle if finished

    const newStatus = project.status === 'active' ? 'stopped' : 'active';
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', project.id), {
        status: newStatus
      });
      setCurrentProject(prev => ({ ...prev, status: newStatus }));
    } catch (e) {
      console.error("Update status error", e);
    }
  };

  const handleDeleteProject = async (projectId) => {
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', projectId));
      setCurrentProject(null);
    } catch (e) { console.error("Delete project error", e); }
  };

  // Vote Actions
  const handleAddItem = async (title, projectId, creatorName) => {
    if (!title.trim() || !user) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'voting_items'), {
        title,
        projectId, 
        creatorId: user.uid,
        creatorName: creatorName || '匿名',
        votes: [],
        createdAt: Date.now()
      });
    } catch (e) { console.error("Add item error", e); }
  };
  
  const handleDeleteItem = async (itemId) => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'voting_items', itemId));

  const handleVote = async (item) => {
    if (!user) return;
    const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'voting_items', item.id);
    const hasVoted = item.votes?.includes(user.uid);
    if (hasVoted) await updateDoc(itemRef, { votes: arrayRemove(user.uid) });
    else await updateDoc(itemRef, { votes: arrayUnion(user.uid) });
  };

  // Team Actions
  const handleCreateRoom = async (name, maxMembers, projectId, creatorName) => {
    if (!user || !name.trim()) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'rooms'), {
        name,
        projectId,
        ownerId: user.uid,
        maxMembers: parseInt(maxMembers) || 4,
        members: [{ uid: user.uid, name: creatorName || '用户', joinedAt: Date.now() }],
        createdAt: Date.now()
      });
    } catch (e) { console.error("Create room error", e); }
  };

  const handleJoinRoom = async (roomId, userName) => {
    if (!user) return;
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    await updateDoc(roomRef, {
      members: arrayUnion({ uid: user.uid, name: userName || '匿名', joinedAt: Date.now() })
    });
  };
  
  const handleKickMember = async (roomId, memberObject) => {
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    await updateDoc(roomRef, { members: arrayRemove(memberObject) });
  };
  
  const handleDeleteRoom = async (roomId) => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId));

  // --- Roulette Actions ---

  const handleJoinRoulette = async (projectId, userName, value) => {
    if (!user || !userName.trim()) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'roulette_participants'), {
        projectId,
        uid: user.uid,
        name: userName,
        value: parseInt(value) || 0,
        joinedAt: Date.now(),
        isWinner: false
      });
    } catch (e) { console.error("Join roulette error", e); }
  };

  const handleRecordWinner = async (projectId, winnerInfo) => {
    const projectRef = doc(db, 'artifacts', appId, 'public', 'data', 'projects', projectId);
    await updateDoc(projectRef, {
      winners: arrayUnion({ ...winnerInfo, wonAt: Date.now() }),
      status: 'finished' // LOCK THE ROOM
    });
    
    if (winnerInfo.participantId) {
      const pRef = doc(db, 'artifacts', appId, 'public', 'data', 'roulette_participants', winnerInfo.participantId);
      await updateDoc(pRef, { isWinner: true });
    }
  };

  // --- Render ---

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">正在连接服务器...</div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-20 shadow-sm">
        <div 
          className="flex items-center gap-2 font-bold text-xl text-indigo-600 cursor-pointer hover:text-indigo-800 transition-colors" 
          onClick={() => setCurrentProject(null)}
        >
          <Activity className="w-6 h-6" />
          <span>协作空间</span>
        </div>
        
        {currentProject && (
           <div className="hidden md:flex items-center gap-2 text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
             {currentProject.password && <Key className="w-3 h-3 text-orange-400" />}
             <span className="font-semibold text-gray-700">{currentProject.title}</span>
             <span className="w-px h-3 bg-gray-300 mx-1"></span>
             <span className="uppercase text-xs font-bold text-indigo-500">
                {currentProject.type === 'vote' ? '投票' : currentProject.type === 'team' ? '组队' : '轮盘抽奖'}
             </span>
             <span className="w-px h-3 bg-gray-300 mx-1"></span>
             <span className="text-gray-400">by {currentProject.creatorName}</span>
           </div>
        )}

        <div className="text-sm text-gray-400">
           {user ? `ID: ${user.uid.slice(0, 4)}` : '未登录'}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto p-4 md:p-8">
        {!currentProject ? (
          <HomeView 
            projects={projects} 
            onCreateProject={handleCreateProject} 
            onSelectProject={(p) => setCurrentProject(p)} 
          />
        ) : (
          <ProjectDetailView 
            user={user}
            project={projects.find(p => p.id === currentProject.id) || currentProject} 
            items={items.filter(i => i.projectId === currentProject.id)}
            rooms={rooms.filter(r => r.projectId === currentProject.id)}
            rouletteData={rouletteParticipants.filter(r => r.projectId === currentProject.id)}
            onExit={() => setCurrentProject(null)}
            actions={{
              addItem: handleAddItem,
              deleteItem: handleDeleteItem,
              vote: handleVote,
              createRoom: handleCreateRoom,
              joinRoom: handleJoinRoom,
              kickMember: handleKickMember,
              deleteRoom: handleDeleteRoom,
              toggleStatus: handleToggleProjectStatus,
              deleteProject: handleDeleteProject,
              joinRoulette: handleJoinRoulette,
              recordWinner: handleRecordWinner
            }}
          />
        )}
      </main>
    </div>
  );
}

// --- Home View (Unchanged) ---
function HomeView({ projects, onCreateProject, onSelectProject }) {
  const [activeTab, setActiveTab] = useState('vote'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creatorName, setCreatorName] = useState('');
  const [newPassword, setNewPassword] = useState(''); 
  const [passwordPromptProject, setPasswordPromptProject] = useState(null);
  const [inputPassword, setInputPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  const filteredProjects = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return projects.filter(p => 
      p.type === activeTab &&
      (p.title.toLowerCase().includes(term) || p.id.toLowerCase().includes(term))
    );
  }, [projects, searchTerm, activeTab]);

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    onCreateProject(newTitle, activeTab, creatorName, newPassword);
    setShowCreate(false);
    setNewTitle('');
    setNewPassword('');
  };

  const handleProjectClick = (project) => {
    if (project.password && project.password.trim() !== '') {
      setPasswordPromptProject(project);
      setInputPassword('');
      setPasswordError(false);
    } else {
      onSelectProject(project);
    }
  };

  const verifyPassword = (e) => {
    e.preventDefault();
    if (inputPassword === passwordPromptProject.password) {
      onSelectProject(passwordPromptProject);
      setPasswordPromptProject(null);
    } else {
      setPasswordError(true);
    }
  };

  const TabButton = ({ id, label, icon: Icon, colorClass }) => (
    <button
      onClick={() => { setActiveTab(id); setShowCreate(false); }}
      className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
        activeTab === id
          ? `${colorClass} text-white shadow-md` 
          : `text-gray-500 hover:${colorClass.replace('bg-', 'text-')} hover:bg-gray-50`
      }`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );

  return (
    <div className="animate-fade-in space-y-6">
      {passwordPromptProject && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-2xl animate-slide-down">
            <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
              <Lock className="w-5 h-5 text-orange-500" /> 需要密码
            </h3>
            <p className="text-gray-500 text-sm mb-4">
              项目 "{passwordPromptProject.title}" 设置了访问密码。
            </p>
            <form onSubmit={verifyPassword}>
              <input 
                type="password" 
                value={inputPassword}
                onChange={e => { setInputPassword(e.target.value); setPasswordError(false); }}
                className="w-full px-4 py-2 border rounded-lg mb-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="输入密码"
                autoFocus
              />
              {passwordError && <p className="text-red-500 text-xs mb-3">密码错误</p>}
              <div className="flex justify-end gap-2 mt-2">
                <button 
                  type="button" 
                  onClick={() => setPasswordPromptProject(null)}
                  className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg text-sm"
                >
                  取消
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
                >
                  进入
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex justify-center mb-8">
        <div className="bg-white p-1 rounded-xl shadow-sm border border-gray-200 inline-flex flex-wrap justify-center gap-1">
          <TabButton id="vote" label="投票" icon={Vote} colorClass="bg-indigo-600" />
          <TabButton id="team" label="组队" icon={Users} colorClass="bg-emerald-600" />
          <TabButton id="roulette" label="轮盘抽奖" icon={Dices} colorClass="bg-purple-600" />
        </div>
      </div>

      <div className="text-center py-6">
        <h1 className="text-3xl font-extrabold text-slate-900 mb-2">
          {activeTab === 'vote' && '在线投票大厅'}
          {activeTab === 'team' && '在线组队大厅'}
          {activeTab === 'roulette' && '公平轮盘大厅'}
        </h1>
        <p className="text-slate-500 max-w-lg mx-auto text-sm">
          {activeTab === 'vote' && '创建提案，收集意见，查看实时排名。'}
          {activeTab === 'team' && '创建房间，招募队友，实时管理。'}
          {activeTab === 'roulette' && '输入一次数值(0-100)，总和取模决定中奖者。高效、公平、透明。'}
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input 
            type="text" 
            placeholder="搜索项目..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button 
          onClick={() => setShowCreate(!showCreate)}
          className={`w-full md:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg transition-colors font-medium text-white 
            ${activeTab === 'vote' ? 'bg-indigo-600 hover:bg-indigo-700' : 
              activeTab === 'team' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-purple-600 hover:bg-purple-700'}`}
        >
          {showCreate ? '取消创建' : <><FolderPlus className="w-5 h-5" /> 新建项目</>}
        </button>
      </div>

      {showCreate && (
        <div className={`p-6 rounded-xl border animate-slide-down bg-gray-50 border-gray-200`}>
          <h3 className="font-bold mb-4 text-gray-900">新建项目</h3>
          <form onSubmit={handleCreateSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row gap-4">
               <div className="flex-1 space-y-1">
                 <label className="text-xs font-semibold text-gray-500 uppercase">项目名称</label>
                 <input 
                   type="text" 
                   placeholder="例如: 年会抽奖..." 
                   value={newTitle}
                   onChange={e => setNewTitle(e.target.value)}
                   className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                   required
                 />
               </div>
               <div className="w-full md:w-48 space-y-1">
                 <label className="text-xs font-semibold text-gray-500 uppercase">您的昵称</label>
                 <input 
                   type="text" 
                   placeholder="主持人姓名" 
                   value={creatorName}
                   onChange={e => setCreatorName(e.target.value)}
                   className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                   required
                 />
               </div>
            </div>
            <div className="flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 space-y-1 w-full">
                  <label className="text-xs font-semibold text-gray-500 uppercase">访问密码 (选填)</label>
                  <input 
                    type="text" 
                    placeholder="留空则无需密码" 
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button type="submit" className={`w-full md:w-auto px-8 py-2 rounded-lg font-medium text-white ${
                   activeTab === 'vote' ? 'bg-indigo-600' : activeTab === 'team' ? 'bg-emerald-600' : 'bg-purple-600'
                }`}>
                  创建
                </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProjects.map(project => (
          <div 
            key={project.id}
            onClick={() => handleProjectClick(project)}
            className="group cursor-pointer bg-white p-5 rounded-xl border border-gray-200 hover:border-current hover:shadow-lg transition-all relative"
          >
            {project.password && (
              <div className="absolute top-4 right-4 text-orange-300" title="需要密码">
                <Lock className="w-4 h-4" />
              </div>
            )}
            {project.status === 'finished' && (
              <div className="absolute top-4 right-12 text-gray-400 bg-gray-100 px-2 py-0.5 rounded text-xs">
                已结束
              </div>
            )}

            <div className={`transition-colors duration-200 border-transparent border group-hover:${
               activeTab === 'vote' ? 'border-indigo-300' : activeTab === 'team' ? 'border-emerald-300' : 'border-purple-300'
            }`}></div>
            
            <div className="flex justify-between items-start mb-3">
              <div className={`p-2 rounded-lg ${
                 activeTab === 'vote' ? 'bg-indigo-100 text-indigo-600' : 
                 activeTab === 'team' ? 'bg-emerald-100 text-emerald-600' : 'bg-purple-100 text-purple-600'
              }`}>
                {activeTab === 'vote' ? <Vote className="w-5 h-5" /> : 
                 activeTab === 'team' ? <Users className="w-5 h-5" /> : <Dices className="w-5 h-5" />}
              </div>
              {project.status === 'stopped' && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">暂停中</span>}
            </div>
            
            <h3 className="font-bold text-lg text-slate-800 mb-1 group-hover:text-current transition-colors pr-6 truncate">
              {project.title}
            </h3>
            <div className="text-xs text-gray-400 mb-4 flex justify-between">
              <span className="font-mono">ID: {project.id.slice(0,6)}</span>
              <span>By: {project.creatorName}</span>
            </div>
            
            <div className="text-sm text-gray-500 border-t pt-3 flex justify-between items-center">
               <span>{new Date(project.createdAt).toLocaleDateString()}</span>
               <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold flex items-center text-gray-900">
                 进入 <ArrowRight className="w-3 h-3 ml-1" />
               </span>
            </div>
          </div>
        ))}
        {filteredProjects.length === 0 && (
           <div className="col-span-full text-center py-10 text-gray-400 border border-dashed rounded-xl">暂无项目</div>
        )}
      </div>
    </div>
  );
}

// --- 2. Project Detail Wrapper ---
function ProjectDetailView({ user, project, items, rooms, rouletteData, onExit, actions }) {
  const isOwner = user?.uid === project.creatorId;
  const isStopped = project.status === 'stopped';
  const isFinished = project.status === 'finished'; // NEW STATE

  const copyId = () => { navigator.clipboard.writeText(project.id); };

  return (
    <div className="animate-fade-in">
      <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-200 pb-6">
        <div>
          <button onClick={onExit} className="flex items-center text-sm text-gray-500 hover:text-indigo-600 mb-2 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-1" /> 返回大厅
          </button>
          <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
            {project.title}
            {project.password && <Key className="w-5 h-5 text-orange-400" title="已解锁" />}
            {isStopped && <Lock className="w-6 h-6 text-gray-400" />}
            {isFinished && <Flag className="w-6 h-6 text-red-500" title="已结束" />}
          </h1>
          <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
            <span className="font-mono bg-gray-100 px-2 py-0.5 rounded select-all">ID: {project.id}</span>
            <button onClick={copyId} className="hover:text-indigo-600" title="复制ID"><Copy className="w-3 h-3" /></button>
            <span className="border-l pl-2 ml-2">主持人: {project.creatorName}</span>
          </div>
        </div>

        {isOwner && (
          <div className="flex gap-2">
             {!isFinished && (
               <button 
                onClick={() => actions.toggleStatus(project)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${isStopped ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'}`}
               >
                 {isStopped ? <><Unlock className="w-4 h-4" /> 开启</> : <><Lock className="w-4 h-4" /> 暂停</>}
               </button>
             )}
             <button 
               onClick={() => {
                 if(window.confirm('确定要删除这个项目吗？所有数据将丢失。')) {
                   actions.deleteProject(project.id);
                 }
               }}
               className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
             >
               <Trash2 className="w-4 h-4" /> 删除
             </button>
          </div>
        )}
      </div>

      {isStopped && !isFinished && (
        <div className="bg-gray-100 border-l-4 border-gray-400 p-4 mb-8 text-gray-700 rounded-r-lg">
          <p className="font-bold flex items-center gap-2"><Lock className="w-4 h-4" /> 项目已停止</p>
          <p className="text-sm">管理员已暂停交互功能。</p>
        </div>
      )}
      
      {isFinished && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-8 text-red-800 rounded-r-lg">
          <p className="font-bold flex items-center gap-2"><Flag className="w-4 h-4" /> 项目已结束</p>
          <p className="text-sm">本轮活动已圆满结束，结果已公示。</p>
        </div>
      )}

      {project.type === 'vote' && (
        <VotingView 
          user={user} 
          items={items} 
          isStopped={isStopped || isFinished}
          onAdd={actions.addItem} 
          onDelete={actions.deleteItem} 
          onVote={actions.vote} 
          isProjectOwner={isOwner}
          projectId={project.id}
        />
      )}
      
      {project.type === 'team' && (
        <TeamView 
          user={user} 
          rooms={rooms} 
          isStopped={isStopped || isFinished}
          onCreate={actions.createRoom} 
          onJoin={actions.joinRoom} 
          onKick={actions.kickMember} 
          onDelete={actions.deleteRoom}
          projectId={project.id}
        />
      )}

      {project.type === 'roulette' && (
        <RouletteView 
          user={user}
          project={project}
          participants={rouletteData}
          isStopped={isStopped} // Only used for join logic
          isFinished={isFinished} // New prop for visual mode
          isOwner={isOwner}
          actions={actions}
        />
      )}
    </div>
  );
}

// --- 3. Voting Component (Unchanged) ---
function VotingView({ user, items, isStopped, onAdd, onDelete, onVote, isProjectOwner, projectId }) {
  const [newItem, setNewItem] = useState('');
  const [myName, setMyName] = useState('');
  const sortedItems = [...items].sort((a, b) => (b.votes?.length || 0) - (a.votes?.length || 0));
  const totalVotes = sortedItems.reduce((acc, curr) => acc + (curr.votes?.length || 0), 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newItem.trim()) return;
    onAdd(newItem, projectId, myName);
    setNewItem('');
  };

  return (
    <div>
      <div className="flex justify-between items-end mb-6">
        <div><h2 className="text-xl font-bold text-slate-800">投票排行榜</h2></div>
        <div className="text-right">
           <div className="text-2xl font-black text-indigo-600">{totalVotes}</div>
           <div className="text-xs text-gray-400 uppercase">总票数</div>
        </div>
      </div>

      {!isStopped && (
        <div className="mb-8 p-4 bg-gray-50 rounded-xl border border-gray-100">
          <h3 className="text-sm font-bold text-gray-500 mb-2">添加新选项</h3>
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
            <input 
              type="text" 
              value={newItem} 
              onChange={(e) => setNewItem(e.target.value)} 
              placeholder="选项内容..." 
              className="flex-[2] px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input 
              type="text" 
              value={myName} 
              onChange={(e) => setMyName(e.target.value)} 
              placeholder="您的署名 (选填)" 
              className="flex-1 px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button type="submit" disabled={!newItem.trim()} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700">添加</button>
          </form>
        </div>
      )}

      <div className="space-y-4">
        {sortedItems.map((item, index) => {
          const voteCount = item.votes?.length || 0;
          const hasVoted = item.votes?.includes(user?.uid);
          const isCreator = item.creatorId === user?.uid;
          const percentage = totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0;

          return (
            <div key={item.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 left-0 bottom-0 bg-indigo-50 transition-all duration-500 ease-out -z-0" style={{ width: `${percentage}%`, opacity: 0.5 }} />
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-4 flex-1">
                  <div className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full font-bold text-sm ${index < 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>{index + 1}</div>
                  <div>
                    <h3 className="font-semibold text-slate-800">{item.title}</h3>
                    <div className="text-xs text-gray-500 mt-0.5 flex gap-2">
                      <span>{voteCount} 票</span>
                      <span className="border-l pl-2">By {item.creatorName || '匿名'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => !isStopped && onVote(item)} disabled={isStopped} className={`p-2 rounded-full transition-all ${hasVoted ? 'bg-pink-100 text-pink-600' : 'bg-gray-50 text-gray-400 hover:bg-pink-50 hover:text-pink-400'}`}>
                    <Trophy className={`w-5 h-5 ${hasVoted ? 'fill-current' : ''}`} />
                  </button>
                  {(isCreator || isProjectOwner) && !isStopped && (
                    <button onClick={() => onDelete(item.id)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- 4. Team Component (Unchanged) ---
function TeamView({ user, rooms, isStopped, onCreate, onJoin, onKick, onDelete, projectId }) {
  const [newRoomName, setNewRoomName] = useState('');
  const [maxMembers, setMaxMembers] = useState(4);
  const [myName, setMyName] = useState(''); 
  
  const sortedRooms = [...rooms].sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
  const currentRoom = useMemo(() => sortedRooms.find(room => room.members?.some(m => m.uid === user?.uid)), [sortedRooms, user]);

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    onCreate(newRoomName, maxMembers, projectId, myName);
    setNewRoomName('');
  };

  if (currentRoom) {
    const isOwner = currentRoom.ownerId === user?.uid;
    const myMemberInfo = currentRoom.members.find(m => m.uid === user?.uid);

    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in">
        <div className="bg-emerald-600 p-6 text-white flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold mb-1">{currentRoom.name}</h2>
            <div className="text-emerald-100 text-sm">成员: {currentRoom.members.length} / {currentRoom.maxMembers}</div>
          </div>
          <div className="flex gap-2">
            {isOwner && !isStopped && <button onClick={() => onDelete(currentRoom.id)} className="bg-emerald-700 hover:bg-emerald-800 p-2 rounded text-white text-xs">解散</button>}
            <button onClick={() => onKick(currentRoom.id, myMemberInfo)} className="bg-white text-emerald-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-emerald-50 flex items-center gap-1"><LogOut className="w-4 h-4" /> 退出</button>
          </div>
        </div>
        <div className="p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {currentRoom.members.map((member) => (
              <div key={member.joinedAt} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center font-bold text-xs">{member.name[0]?.toUpperCase()}</div>
                  <div className="font-medium text-slate-800 text-sm flex items-center gap-2">
                    {member.name}
                    {member.uid === currentRoom.ownerId && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1 rounded border border-yellow-200">房主</span>}
                  </div>
                </div>
                {isOwner && member.uid !== user.uid && !isStopped && <button onClick={() => onKick(currentRoom.id, member)} className="text-gray-400 hover:text-red-500 p-1"><UserPlus className="w-4 h-4 rotate-45" /></button>}
              </div>
            ))}
            {Array.from({ length: Math.max(0, currentRoom.maxMembers - currentRoom.members.length) }).map((_, i) => (
              <div key={i} className="flex items-center justify-center p-3 rounded-lg border border-dashed border-gray-200 text-gray-300 text-sm">等待加入...</div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
       {!isStopped && (
         <div className="mb-8 bg-emerald-50 rounded-xl p-6 border border-emerald-100">
           <h3 className="font-bold text-emerald-800 mb-4">创建新房间</h3>
           <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3">
              <input type="text" value={newRoomName} onChange={e => setNewRoomName(e.target.value)} placeholder="房间名称..." className="flex-1 px-4 py-2 rounded-lg border border-gray-200" required />
              <input type="text" value={myName} onChange={e => setMyName(e.target.value)} placeholder="您的昵称" className="w-32 px-4 py-2 rounded-lg border border-gray-200" required />
              <select value={maxMembers} onChange={e => setMaxMembers(e.target.value)} className="px-4 py-2 rounded-lg border border-gray-200">
                {[2,3,4,5,6,8,10].map(n => <option key={n} value={n}>{n} 人</option>)}
              </select>
              <button type="submit" className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-medium">创建</button>
           </form>
         </div>
       )}

       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sortedRooms.map(room => {
            const isFull = room.members.length >= room.maxMembers;
            return (
              <div key={room.id} className="bg-white p-5 rounded-xl border border-emerald-100 shadow-sm">
                <div className="flex justify-between items-start mb-3">
                  <h4 className="font-bold text-slate-800 truncate pr-2">{room.name}</h4>
                  <span className={`text-xs px-2 py-1 rounded-full ${isFull ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>{room.members.length}/{room.maxMembers}</span>
                </div>
                <div className="text-sm text-gray-500 mb-4">房主: {room.members.find(m => m.uid === room.ownerId)?.name || '未知'}</div>
                {isStopped ? <button disabled className="w-full py-2 bg-gray-100 text-gray-400 rounded-lg text-sm cursor-not-allowed">暂停</button> : isFull ? <button disabled className="w-full py-2 bg-gray-100 text-gray-400 rounded-lg text-sm cursor-not-allowed">已满员</button> : (
                   <div className="flex gap-2">
                     <input type="text" placeholder="输入昵称" className="flex-1 px-3 py-1.5 text-sm border rounded-lg" onKeyDown={(e) => { if(e.key === 'Enter' && e.target.value.trim()) onJoin(room.id, e.target.value.trim()) }} />
                     <button onClick={(e) => { const input = e.target.previousSibling; onJoin(room.id, input.value.trim() || `玩家${user.uid.slice(0,3)}`); }} className="bg-emerald-600 text-white p-2 rounded-lg"><ArrowRight className="w-4 h-4" /></button>
                   </div>
                )}
              </div>
            )
          })}
       </div>
    </div>
  );
}

// --- 5. Roulette Component (Refined for Final State) ---

function RouletteView({ user, project, participants, isStopped, isFinished, isOwner, actions }) {
  const [joinName, setJoinName] = useState('');
  const [joinValue, setJoinValue] = useState(50);
  const [showResultModal, setShowResultModal] = useState(false);
  
  const sortedParticipants = [...participants].sort((a,b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  const activeParticipants = sortedParticipants.filter(p => !p.isWinner);
  const myParticipant = sortedParticipants.find(p => p.uid === user?.uid);
  const isMeWinner = myParticipant?.isWinner;

  // Final winner logic (Use historical data if finished, otherwise calculate live)
  const finalWinner = isFinished && project.winners?.length > 0 
    ? project.winners[project.winners.length - 1] 
    : null;

  // Live calculation logic
  const totalValue = activeParticipants.reduce((acc, curr) => acc + (curr.value || 0), 0);
  const count = activeParticipants.length;
  const winnerIndex = count > 0 ? totalValue % count : 0;
  const winnerCandidate = activeParticipants[winnerIndex];

  const handleDrawClick = () => {
    if(!winnerCandidate) return;
    setShowResultModal(true);
  };

  const confirmDraw = () => {
    actions.recordWinner(project.id, {
      participantId: winnerCandidate.id,
      name: winnerCandidate.name,
      uid: winnerCandidate.uid,
      winningNumber: winnerIndex,
      totalValueSnapshot: totalValue,
      participantCountSnapshot: count
    });
    setShowResultModal(false);
  };

  const handleJoin = () => {
    actions.joinRoulette(project.id, joinName || `玩家${user.uid.slice(0,3)}`, joinValue);
  };

  // --- Chart Component ---
  const WinnerEvolutionChart = ({ participants, isFinished, finalSnapshot }) => {
    const data = useMemo(() => {
      let cumulativeSum = 0;
      // If finished, we ideally use the snapshot data, but for simplicity we re-calculate based on participant list
      // Note: This assumes participants list hasn't changed since draw (which it shouldn't have)
      return participants.map((p, i) => {
        cumulativeSum += (p.value || 0);
        const currentCount = i + 1;
        const currentWinnerIdx = cumulativeSum % currentCount;
        return { x: i, y: currentWinnerIdx };
      });
    }, [participants]);

    if(data.length < 2) return null;

    const width = 100;
    const height = 50;
    const maxX = data.length - 1;
    const maxY = Math.max(...data.map(d => d.y));
    const scaleX = (x) => (x / maxX) * width;
    const scaleY = (y) => height - (y / (maxY || 1)) * height;
    const points = data.map(d => `${scaleX(d.x)},${scaleY(d.y)}`).join(' ');

    return (
      <div className="w-full mt-4 bg-gray-900 rounded-lg p-4 shadow-inner">
         <h4 className="text-xs font-bold text-gray-400 uppercase mb-2 flex items-center gap-1">
           <ChartLine className="w-4 h-4" /> 命运波动图 (Winner Evolution)
         </h4>
         <svg viewBox={`0 -5 ${width} ${height + 10}`} className="w-full h-32 overflow-visible">
            <line x1="0" y1={height} x2={width} y2={height} stroke="#333" strokeWidth="0.5" />
            <polyline fill="none" stroke="url(#gradientLine)" strokeWidth="1.5" points={points} vectorEffect="non-scaling-stroke"/>
            <defs>
              <linearGradient id="gradientLine" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#c084fc" />
              </linearGradient>
            </defs>
            {data.map((d, i) => (
               <circle key={i} cx={scaleX(d.x)} cy={scaleY(d.y)} r="1.5" fill={i === data.length -1 ? "#4ade80" : "#fff"} />
            ))}
         </svg>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-fade-in relative">
      
      {/* Result Modal (For Owner Confirmation) */}
      {showResultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-gray-900 text-white w-full max-w-lg rounded-2xl p-6 shadow-2xl border border-purple-500/30">
             <div className="text-center mb-6">
               <h2 className="text-2xl font-bold">确认开奖?</h2>
               <p className="text-gray-400 text-sm">这将结束本轮游戏并公示结果。</p>
             </div>
             <WinnerEvolutionChart participants={activeParticipants} />
             <div className="flex gap-3 mt-6">
               <button onClick={() => setShowResultModal(false)} className="flex-1 py-3 rounded-xl font-bold bg-white/10 hover:bg-white/20">取消</button>
               <button onClick={confirmDraw} className="flex-1 py-3 rounded-xl font-bold bg-purple-600 hover:bg-purple-500">确认并结束</button>
             </div>
          </div>
        </div>
      )}

      {/* 1. Main Display Area (Split by State) */}
      
      {/* STATE A: GAME FINISHED - SHOW RESULT */}
      {isFinished ? (
        <div className="bg-gradient-to-br from-purple-900 via-indigo-900 to-black text-white rounded-2xl p-10 shadow-2xl text-center relative overflow-hidden border border-purple-500/30">
           {/* Background Confetti/Effects */}
           <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20"></div>
           
           <div className="relative z-10 animate-scale-in">
             <div className="inline-block p-6 rounded-full bg-yellow-400/20 mb-6 shadow-[0_0_50px_rgba(250,204,21,0.3)]">
               <Crown className="w-16 h-16 text-yellow-400" />
             </div>
             <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-yellow-200 mb-2 drop-shadow-lg">
               {finalWinner?.name}
             </h2>
             <p className="text-purple-300 text-lg uppercase tracking-widest font-bold mb-8">最终获胜者 (Winner)</p>
             
             <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto bg-white/5 rounded-xl p-6 border border-white/10 backdrop-blur-md">
                <div>
                  <div className="text-xs text-gray-400 uppercase mb-1">Winning Number</div>
                  <div className="text-3xl font-mono font-bold text-green-400">#{finalWinner?.winningNumber}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase mb-1">Total Sum</div>
                  <div className="text-3xl font-mono font-bold text-pink-400">{finalWinner?.totalValueSnapshot}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase mb-1">Participants</div>
                  <div className="text-3xl font-mono font-bold text-blue-400">{finalWinner?.participantCountSnapshot}</div>
                </div>
             </div>

             {/* Show Chart permanently for finished game */}
             <div className="mt-8 opacity-80 hover:opacity-100 transition-opacity">
               <WinnerEvolutionChart participants={sortedParticipants} />
             </div>
           </div>
        </div>
      ) : (
        /* STATE B: GAME ACTIVE - SHOW DASHBOARD */
        <div className="bg-purple-900 text-white rounded-2xl p-6 md:p-10 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-10 opacity-10"><Dices size={200} /></div>
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
            <div>
              <h2 className="text-3xl font-bold mb-2 flex items-center gap-3">
                <Dices className="w-8 h-8 text-purple-300" /> 公平轮盘
              </h2>
              <p className="text-purple-200 mb-6 max-w-md">所有人的选择共同决定命运。数值提交后锁定，开奖前绝对保密。</p>
              <div className="flex items-center gap-4 text-sm font-mono bg-black/20 p-4 rounded-lg backdrop-blur-sm border border-white/5">
                 <div className="text-center">
                   <div className="text-gray-400 text-xs uppercase">Total Sum</div>
                   <div className="text-2xl font-bold text-yellow-400 tracking-wider">???</div>
                 </div>
                 <div className="text-gray-500 text-xl">%</div>
                 <div className="text-center">
                   <div className="text-gray-400 text-xs uppercase">People</div>
                   <div className="text-2xl font-bold">{count}</div>
                 </div>
                 <div className="text-gray-500 text-xl">=</div>
                 <div className="text-center">
                   <div className="text-gray-400 text-xs uppercase">Winner</div>
                   <div className="text-2xl font-bold text-green-400 tracking-wider">???</div>
                 </div>
              </div>
            </div>

            <div className="text-center bg-white/10 p-6 rounded-xl border border-white/10 backdrop-blur-md min-w-[220px]">
               <div className="text-purple-200 text-sm uppercase tracking-widest mb-3">当前状态</div>
               <div className="text-3xl font-black mb-1 text-white/90">
                 {count > 0 ? '等待开奖' : '等待加入'}
               </div>
               
               {isOwner && !isStopped && count > 0 && (
                 <button 
                   onClick={handleDrawClick}
                   className="mt-6 w-full bg-gradient-to-r from-yellow-400 to-orange-500 text-purple-900 font-bold py-3 rounded-lg shadow-lg hover:shadow-yellow-400/20 hover:scale-105 transition-all flex items-center justify-center gap-2"
                 >
                   <Crown className="w-5 h-5" /> 立即开奖
                 </button>
               )}
            </div>
          </div>
        </div>
      )}

      {/* 2. Join Controls (Only when NOT finished) */}
      {!isFinished && !myParticipant && !isStopped && (
        <div className="bg-white p-8 rounded-2xl border border-purple-100 shadow-lg relative overflow-hidden animate-slide-up">
          <div className="absolute top-0 left-0 w-2 h-full bg-purple-500"></div>
          <div className="flex flex-col md:flex-row gap-8 items-start">
             <div className="flex-1">
               <h3 className="font-bold text-2xl text-gray-800 mb-2">加入游戏</h3>
               <p className="text-gray-500">拖动滑块选择您的“命运数值”。请注意，提交后<span className="text-red-500 font-bold">无法修改</span>。</p>
               <div className="mt-6">
                 <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">您的昵称</label>
                 <input type="text" value={joinName} onChange={e => setJoinName(e.target.value)} placeholder="输入名字..." className="w-full text-lg px-4 py-3 rounded-xl border border-gray-200 focus:ring-4 focus:ring-purple-100 focus:border-purple-500 outline-none transition-all" />
               </div>
             </div>
             <div className="w-full md:w-1/2 bg-gray-50 rounded-xl p-6 border border-gray-100">
               <div className="flex justify-between items-center mb-4">
                 <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">选择数值 (0-100)</label>
                 <span className="text-4xl font-black text-purple-600">{joinValue}</span>
               </div>
               <input type="range" min="0" max="100" value={joinValue} onChange={e => setJoinValue(e.target.value)} className="w-full h-4 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600 hover:accent-purple-500 transition-all" />
               <div className="flex justify-between text-xs text-gray-400 mt-2 font-mono"><span>0</span><span>50</span><span>100</span></div>
               <button onClick={handleJoin} className="w-full mt-6 bg-purple-600 text-white text-lg font-bold py-3 rounded-xl hover:bg-purple-700 shadow-lg shadow-purple-200 active:scale-[0.98] transition-all">提交并锁定</button>
             </div>
          </div>
        </div>
      )}

      {/* 3. My Status (Show simplified view if finished) */}
      {myParticipant && !isFinished && (
        <div className="bg-white p-6 rounded-xl border-l-4 border-purple-500 shadow-sm flex items-center justify-between">
           <div>
             <h3 className="font-bold text-purple-900 text-lg">已锁定</h3>
             <p className="text-sm text-gray-500">您的编号: <span className="font-bold text-purple-600">#{activeParticipants.indexOf(myParticipant)}</span></p>
           </div>
           <div className="text-right">
             <div className="text-xs text-gray-400 uppercase">我的数值</div>
             <div className="text-4xl font-black text-gray-300">{myParticipant.value}</div>
           </div>
        </div>
      )}

      {/* 4. Lists & History */}
      <div className="grid md:grid-cols-2 gap-8 mt-8">
        <div>
          <h3 className="font-bold text-gray-700 mb-4 flex items-center justify-between">
            <span>参与者列表 ({count})</span>
            <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-1 rounded">实时排序</span>
          </h3>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500 font-medium">
                  <tr>
                    <th className="px-5 py-3 w-16">#</th>
                    <th className="px-5 py-3">姓名</th>
                    <th className="px-5 py-3 text-right">贡献值</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedParticipants.map((p, idx) => (
                    <tr key={p.id} className={`${isFinished && p.uid === finalWinner?.uid ? 'bg-yellow-50' : 'hover:bg-gray-50/50'} transition-colors`}>
                      <td className="px-5 py-3 font-mono text-gray-400">
                        {idx}
                        {isFinished && p.uid === finalWinner?.uid && <span className="ml-2 text-yellow-500">👑</span>}
                      </td>
                      <td className={`px-5 py-3 ${p.uid === user?.uid ? 'font-bold text-purple-700' : 'text-gray-700'}`}>
                        {p.name} {p.uid === user?.uid && <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded ml-2">我</span>}
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-medium text-gray-600">
                        {isFinished || p.uid === user?.uid ? p.value : <span className="text-gray-300 tracking-widest">***</span>}
                      </td>
                    </tr>
                  ))}
                  {sortedParticipants.length === 0 && (
                    <tr><td colSpan="3" className="text-center py-12 text-gray-400">等待玩家加入...</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <h3 className="font-bold text-gray-700 mb-4">开奖记录</h3>
          <div className="space-y-3">
             {project.winners?.slice().reverse().map((w, i) => (
               <div key={i} className="bg-white border border-gray-100 p-4 rounded-xl flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center text-yellow-600 font-bold text-xl shadow-inner">
                    {w.winningNumber}
                  </div>
                  <div>
                    <div className="font-bold text-gray-800 text-lg">{w.name}</div>
                    <div className="text-xs text-gray-500 flex gap-2 mt-1">
                       <span className="bg-gray-100 px-1.5 rounded">总值 {w.totalValueSnapshot}</span>
                       <span className="text-gray-400">{new Date(w.wonAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
               </div>
             ))}
             {(!project.winners || project.winners.length === 0) && (
               <div className="text-gray-400 text-sm italic text-center py-10 bg-gray-50 rounded-xl border border-dashed">暂无中奖记录</div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}