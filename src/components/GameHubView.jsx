import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Scissors, Hand, Disc, Trophy, User, Check, Play, Plus, X, Gamepad2 } from './Icons';
import { useUI } from './UIComponents';
import { collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, arrayUnion, query, where, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

// --- Rock Paper Scissors Game ---
const RPSGame = ({ user, room, projectId, onLeave }) => {
  const { showToast } = useUI();
  
  // Game State derived from room
  const [timeLeft, setTimeLeft] = useState(0);
  const [selectedMove, setSelectedMove] = useState(null);
  const [showdownAnim, setShowdownAnim] = useState(null); // Local state for animation trigger
  
  const isPlayer = room.players && room.players.some(p => p.uid === user.uid);
  const me = isPlayer ? room.players.find(p => p.uid === user.uid) : null;
  const opponent = isPlayer ? room.players.find(p => p.uid !== user.uid) : null;
  const isSpectator = !isPlayer;
  const isHost = room.players && room.players.length > 0 && room.players[0].uid === user.uid; // Simple host logic
  
  const ICONS = { rock: Disc, paper: Hand, scissors: Scissors };
  const COLORS = { rock: 'text-google-red', paper: 'text-google-blue', scissors: 'text-google-yellow' };

  // Reset local selection when round changes
  useEffect(() => {
    setSelectedMove(null);
  }, [room.currentRound]);

  // Timer & Game Loop logic
  useEffect(() => {
    if (!room) return;

    const interval = setInterval(() => {
        const now = Date.now();
        
        // 1. PLAYING STATE TIMER
        if (room.status === 'playing') {
            const elapsed = (now - (room.roundStartTime || now)) / 1000;
            const remaining = Math.max(0, room.config.timeout - elapsed);
            setTimeLeft(remaining);

            // Timeout Auto-move (Client side enforcement by player themselves)
            if (remaining <= 0 && isPlayer && !me.move) {
               // Auto-play random or rock
               const moves = ['rock', 'paper', 'scissors'];
               const randomMove = moves[Math.floor(Math.random() * moves.length)];
               handleMove(randomMove);
            }
        }
        
        // 2. SHOWDOWN STATE TIMER (Host only handles transition)
        if (room.status === 'showdown' && isHost) {
             if (now > room.showdownEndTime) {
                 startNextRound();
             }
        }

    }, 200);
    return () => clearInterval(interval);
  }, [room, isPlayer, me, isHost]);

  const startNextRound = async () => {
       // Check Win Condition already handled before entering showdown? 
       // No, usually we check at end of showdown or start of next.
       // Let's do it simply: We just clear moves and increment round, assuming scores updated before Showdown.
       // Wait, if match ended, we shouldn't be in 'showdown' loop leading to 'playing'.
       // Implementation detail: If Match Won, we go 'showdown' -> 'finished'.
       
       const winThreshold = Math.floor(room.config.bestOf / 2) + 1;
       const p1 = room.players[0];
       const p2 = room.players[1];
       
       let matchWinner = null;
       if (p1.score >= winThreshold) matchWinner = p1.uid;
       if (p2.score >= winThreshold) matchWinner = p2.uid;
       
       let updateData = {};
       if (matchWinner) {
           updateData = {
               status: 'finished',
               winnerId: matchWinner,
               players: room.players.map(p => ({...p, lastMove: p.move, move: null})) 
           };
       } else {
           updateData = {
               status: 'playing',
               currentRound: (room.currentRound || 1) + 1,
               roundStartTime: Date.now(),
               players: room.players.map(p => ({...p, lastMove: p.move, move: null}))
           };
       }
       
       await updateDoc(doc(db, 'game_rooms', room.id), updateData);
  };

  const handleMove = async (move) => {
      if ((selectedMove || me.move) && room.status === 'playing') return; // Already acted locally
      setSelectedMove(move);
      
      const newPlayers = room.players.map(p => {
          if (p.uid === user.uid) return { ...p, move: move };
          return p;
      });
      
      const allMoved = newPlayers.every(p => p.move);
      let updateData = { players: newPlayers };
      
      if (allMoved) {
          // Both moved -> Calculate Result & Enter Showdown
          const p1 = newPlayers[0];
          const p2 = newPlayers[1];
          let winnerId = null; // Round winner

          if (p1.move !== p2.move) {
              if (
                  (p1.move === 'rock' && p2.move === 'scissors') ||
                  (p1.move === 'paper' && p2.move === 'rock') ||
                  (p1.move === 'scissors' && p2.move === 'paper')
              ) {
                  winnerId = p1.uid;
                  p1.score = (p1.score || 0) + 1;
              } else {
                  winnerId = p2.uid;
                  p2.score = (p2.score || 0) + 1;
              }
          }
           
          // Record History
          const historyItem = {
              round: room.currentRound,
              p1Move: p1.move,
              p2Move: p2.move,
              winnerId,
              timestamp: Date.now()
          };
          const history = [...(room.history || []), historyItem];
          
          // Enter Showdown Mode
          updateData = {
              players: newPlayers, // Save moves/scores
              history,
              status: 'showdown',
              showdownEndTime: Date.now() + 3000 // 3 seconds animation
          };
      }
      
      await updateDoc(doc(db, 'game_rooms', room.id), updateData);
  };

  
  const joinGame = async () => {
      if (room.players.length >= 2) return;
      
      const newPlayer = { uid: user.uid, name: user.displayName || 'User', score: 0, move: null };
      const newPlayers = [...room.players, newPlayer];
      
      let updateData = { players: newPlayers };
      if (newPlayers.length === 2) {
          updateData.status = 'playing';
          updateData.roundStartTime = Date.now();
          updateData.currentRound = 1;
      }
      
      await updateDoc(doc(db, 'game_rooms', room.id), updateData);
  };

  if(!room) return null;

  return (
    <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
                <button onClick={onLeave} className="p-2 hover:bg-black/5 rounded-full"><X className="w-5 h-5"/></button>
                <h2 className="text-xl font-medium">{room.name}</h2>
            </div>
            <div className="flex items-center gap-4 bg-m3-surface-container px-3 py-1.5 rounded-full text-sm font-medium">
                <span className="text-google-blue">Best of {room.config.bestOf}</span>
                {room.status === 'playing' && (
                  <span className={`flex items-center gap-1 ${timeLeft < 5 ? 'text-google-red animate-pulse' : 'text-m3-on-surface-variant'}`}>
                      <Clock className="w-4 h-4"/> {Math.ceil(timeLeft)}s
                  </span>
                )}
            </div>
        </div>

        {/* Game Area */}
        <div className="flex-1 flex flex-col items-center justify-center gap-12 relative min-h-[400px]">
             
            {/* Showdown Overlay */}
            <AnimatePresence>
                {room.status === 'showdown' && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-20 bg-m3-surface/80 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none"
                    >
                         <div className="flex items-center gap-8 mb-4">
                             {/* P1 */}
                             <motion.div 
                                initial={{ x: -50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.2 }}
                                className="flex flex-col items-center"
                             >
                                 <div className={`p-6 rounded-3xl bg-white shadow-xl ${room.players[0].move === 'rock' ? 'text-google-red' : room.players[0].move === 'paper' ? 'text-google-blue' : 'text-google-yellow'}`}>
                                     {room.players[0].move === 'rock' && <Disc className="w-16 h-16"/>}
                                     {room.players[0].move === 'paper' && <Hand className="w-16 h-16"/>}
                                     {room.players[0].move === 'scissors' && <Scissors className="w-16 h-16"/>}
                                 </div>
                                 <div className="mt-2 text-lg font-bold text-m3-on-surface">{room.players[0].name}</div>
                             </motion.div>

                             <div className="text-2xl font-black italic text-m3-on-surface-variant">VS</div>

                             {/* P2 */}
                             <motion.div 
                                initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.2 }}
                                className="flex flex-col items-center"
                             >
                                 <div className={`p-6 rounded-3xl bg-white shadow-xl ${room.players[1].move === 'rock' ? 'text-google-red' : room.players[1].move === 'paper' ? 'text-google-blue' : 'text-google-yellow'}`}>
                                     {room.players[1].move === 'rock' && <Disc className="w-16 h-16"/>}
                                     {room.players[1].move === 'paper' && <Hand className="w-16 h-16"/>}
                                     {room.players[1].move === 'scissors' && <Scissors className="w-16 h-16"/>}
                                 </div>
                                 <div className="mt-2 text-lg font-bold text-m3-on-surface">{room.players[1].name}</div>
                             </motion.div>
                         </div>
                         
                         {/* Result Text */}
                         <motion.div 
                            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }}
                            className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-google-blue to-google-green"
                         >
                            {(() => {
                                const p1 = room.players[0];
                                const p2 = room.players[1];
                                if (p1.move === p2.move) return "DRAW!";
                                // We calculated round winner logic in handleMove but hard to reconstruct here cleanly without duplicating logic
                                // Or reading last history item?
                                const lastRound = room.history && room.history[room.history.length - 1];
                                if (lastRound) {
                                    if (!lastRound.winnerId) return "DRAW!";
                                    const winnerName = room.players.find(p => p.uid === lastRound.winnerId)?.name;
                                    return `${winnerName} WINS!`;
                                }
                                return "ROUND OVER";
                            })()}
                         </motion.div>
                         <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} 
                            className="mt-2 text-sm text-m3-on-surface-variant"
                         >
                             Next round starting...
                         </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Opponent Area */}
            <div className={`flex flex-col items-center transition-opacity duration-300 ${opponent ? 'opacity-100' : 'opacity-40'}`}>
                <div className="w-16 h-16 rounded-full bg-m3-surface-container-high flex items-center justify-center mb-2 shadow-inner border-2 border-white relative">
                   {opponent ? (
                       // Show Move in Showdown OR Playing (if we wanted to cheat/debug, but handled by logic above)
                       // If Showdown, Show Icon? No, overlay handles it.
                       opponent.move && room.status === 'playing' ? 
                       <div className="text-4xl animate-bounce">🤔</div> : // Thinking
                       room.status === 'finished' && room.winnerId === opponent.uid ? 
                       <Trophy className="w-8 h-8 text-google-yellow"/> :
                       <User className="w-8 h-8 text-m3-on-surface-variant"/>
                   ) : <User className="w-8 h-8 text-m3-on-surface-variant/30"/>}
                   
                   {/* Score Badge */}
                    {opponent && <div className="absolute -top-1 -right-1 bg-google-red text-white text-xs w-6 h-6 flex items-center justify-center rounded-full border border-white">{opponent.score}</div>}
                </div>
                <div className="text-sm font-medium text-m3-on-surface">{opponent?.name || 'Waiting...'}</div>
                {opponent?.move && room.status === 'playing' && <div className="text-xs text-google-green mt-1 font-medium">Ready</div>}
            </div>
            
            {/* Center Status / Result */}
            <div className="text-center h-20 flex items-center justify-center">
                 {room.status === 'waiting' && <span className="text-m3-on-surface-variant animate-pulse">Waiting for opponent...</span>}
                 {room.status === 'playing' && <div className="text-4xl font-display font-medium text-m3-on-surface/20">ROUND {room.currentRound}</div>}
                 {room.status === 'finished' && (
                     <motion.div initial={{scale:0}} animate={{scale:1}} className="flex flex-col items-center">
                         <div className="text-2xl font-bold text-google-yellow mb-1">{room.winnerId === user.uid ? 'Victory!' : 'Defeat'}</div>
                         <button onClick={onLeave} className="px-4 py-1.5 bg-m3-primary text-white text-sm rounded-full">Leave Room</button>
                     </motion.div>
                 )}
            </div>

            {/* My Area */}
            <div className="flex flex-col items-center w-full">
                {isPlayer ? (
                    <>
                        <div className="flex items-center gap-6 mb-8">
                            {['rock', 'paper', 'scissors'].map(move => {
                                const MoveIcon = ICONS[move];
                                const isSelected = selectedMove === move || me.move === move;
                                return (
                                    <button
                                        key={move}
                                        disabled={!!selectedMove || room.status !== 'playing'}
                                        onClick={() => handleMove(move)}
                                        className={`w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-200 
                                            ${isSelected 
                                                ? `bg-m3-primary-container ring-4 ring-google-blue/30 -translate-y-2 shadow-lg` 
                                                : `bg-m3-surface-container hover:bg-m3-surface-container-high hover:-translate-y-1 shadow-sm`
                                            }
                                            ${(selectedMove && !isSelected) ? 'opacity-40 grayscale scale-90' : ''}
                                        `}
                                    >
                                        <MoveIcon className={`w-10 h-10 ${isSelected ? COLORS[move] : 'text-m3-on-surface'}`} />
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex flex-col items-center">
                            <div className="text-lg font-medium">{me.name} (You)</div>
                            <div className="text-sm text-m3-on-surface-variant">Score: {me.score}</div>
                        </div>
                    </>
                ) : (
                    <button onClick={joinGame} className="px-8 py-3 bg-google-blue text-white rounded-full font-medium shadow-elevation-1 hover:shadow-elevation-2 hover:scale-105 transition-all">
                        Join Game
                    </button>
                )}
            </div>
            
        </div>
        
        {/* History Log Panel */}
        {room.history && room.history.length > 0 && (
            <div className="mt-8 pt-4 border-t border-m3-outline-variant/10">
                <h4 className="text-xs font-medium text-m3-on-surface-variant uppercase tracking-wider mb-3">Previous Rounds</h4>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {[...room.history].reverse().map((round, i) => (
                        <div key={i} className="flex-shrink-0 flex flex-col items-center p-2 bg-m3-surface-container rounded-lg min-w-[80px]">
                            <span className="text-[10px] text-m3-on-surface-variant mb-1">R{round.round}</span>
                            <div className="flex gap-2 text-lg">
                                {round.p1Move === 'rock' ? '🪨' : round.p1Move === 'paper' ? '✋' : '✂️'}
                                <span className="text-xs text-m3-on-surface-variant">vs</span>
                                {round.p2Move === 'rock' ? '🪨' : round.p2Move === 'paper' ? '✋' : '✂️'}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}
    </div>
  );
};


export default function GameHubView({ project, user, t }) {
  const { showToast } = useUI();
  const [activeTab, setActiveTab] = useState('lobby'); // lobby | finished
  const [rooms, setRooms] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [activeRoom, setActiveRoom] = useState(null); // If joined/spectating a room
  
  // Create Form State
  const [roomName, setRoomName] = useState('');
  const [bestOf, setBestOf] = useState(3);
  const [timeoutSeconds, setTimeoutSeconds] = useState(30);

  // Sync Rooms
  useEffect(() => {
    const q = query(
        collection(db, 'game_rooms'), 
        where('projectId', '==', project.id),
        where('status', activeTab === 'lobby' ? 'in' : '==', activeTab === 'lobby' ? ['waiting', 'playing'] : 'finished')
    );
    
    const unsub = onSnapshot(q, (snapshot) => {
        setRooms(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [project.id, activeTab]);

  const handleCreateRoom = async (e) => {
      e.preventDefault();
      if (!roomName.trim()) return;
      
      const newRoom = {
          projectId: project.id,
          name: roomName,
          game: 'rps',
          status: 'waiting',
          players: [], // Creator doesn't auto-join to allow them to be host/spectator initially? No, let's auto-join or just wait.
                       // Prompt said "create room", users enter it.
          config: {
              bestOf: parseInt(bestOf),
              timeout: parseInt(timeoutSeconds)
          },
          createdAt: Date.now(),
          createdBy: user.uid
      };
      
      const ref = await addDoc(collection(db, 'game_rooms'), newRoom);
      setShowCreate(false);
      setRoomName('');
      setActiveRoom({ id: ref.id, ...newRoom }); // Enter immediately
  };
  
  const enterRoom = (room) => {
      setActiveRoom(room);
  };
  
  // Need to subscribe to the active Room specifically to get realtime updates inside the game component
  useEffect(() => {
     if (!activeRoom) return;
     const unsub = onSnapshot(doc(db, 'game_rooms', activeRoom.id), (doc) => {
         if (doc.exists()) setActiveRoom({ id: doc.id, ...doc.data() });
         else setActiveRoom(null); // Deleted
     });
     return () => unsub();
  }, [activeRoom?.id]);

  if (activeRoom) {
      return (
          <div className="max-w-4xl mx-auto bg-m3-surface shadow-elevation-2 rounded-[24px] p-6 lg:p-8 min-h-[600px]">
              <RPSGame user={user} room={activeRoom} projectId={project.id} onLeave={() => setActiveRoom(null)} />
          </div>
      );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-display text-m3-on-surface mb-2">{t('gameHub')}</h1>
          <p className="text-m3-on-surface-variant flex items-center gap-2">
            <Gamepad2 className="w-4 h-4" /> {project.title}
          </p>
        </div>
        <button 
          onClick={() => setShowCreate(true)} 
          className="flex items-center gap-2 px-6 py-3 bg-m3-primary-container text-m3-on-primary-container rounded-2xl font-medium hover:shadow-elevation-1 transition-all"
        >
          <Plus className="w-5 h-5"/> {t('createRoom')}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-m3-outline-variant/20">
          {['lobby', 'finished'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-google-green text-google-green' : 'border-transparent text-m3-on-surface-variant hover:text-m3-on-surface'}`}
              >
                  {tab === 'lobby' ? t('activeGames') : t('history')}
              </button>
          ))}
      </div>

      {/* Room Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {rooms.map(room => (
                <motion.div 
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    key={room.id}
                    onClick={() => enterRoom(room)}
                    className="bg-m3-surface-container-high rounded-[20px] p-5 cursor-pointer hover:bg-m3-surface-container hover:shadow-elevation-1 border border-transparent hover:border-m3-outline-variant/50 transition-all group"
                >
                    <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                             <div className="w-8 h-8 rounded-full bg-google-green/10 flex items-center justify-center text-google-green">
                                 {room.game === 'rps' ? <Scissors className="w-4 h-4"/> : <Gamepad2 className="w-4 h-4"/>}
                             </div>
                             <span className="font-medium text-m3-on-surface">{room.name}</span>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-md font-medium ${room.status === 'playing' ? 'bg-google-green/10 text-google-green' : 'bg-m3-on-surface/10 text-m3-on-surface-variant'}`}>
                            {room.status}
                        </span>
                    </div>
                    
                    <div className="space-y-2 mb-4">
                        <div className="flex justify-between text-xs text-m3-on-surface-variant">
                            <span>Players</span>
                            <span>{room.players?.length || 0}/2</span>
                        </div>
                        <div className="w-full bg-m3-on-surface/5 h-1.5 rounded-full overflow-hidden">
                            <div className="h-full bg-google-green transition-all" style={{ width: `${((room.players?.length || 0) / 2) * 100}%` }}></div>
                        </div>
                    </div>
                    
                    <div className="flex gap-2 text-xs text-m3-on-surface-variant opacity-80">
                         <span className="flex items-center gap-1"><Trophy className="w-3 h-3"/> Best of {room.config.bestOf}</span>
                         <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {room.config.timeout}s</span>
                    </div>
                </motion.div>
            ))}
          </AnimatePresence>
          
          {rooms.length === 0 && (
              <div className="col-span-full py-20 text-center text-m3-on-surface-variant/50 flex flex-col items-center">
                  <Gamepad2 className="w-12 h-12 mb-3 opacity-20"/>
                  <p>{t('noRooms')}</p>
              </div>
          )}
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreate && (
             <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                 <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-m3-surface w-full max-w-md rounded-[28px] p-6 shadow-elevation-3"
                 >
                     <h3 className="text-xl font-medium mb-6">{t('createRoom')}</h3>
                     <form onSubmit={handleCreateRoom} className="space-y-4">
                        <div>
                            <label className="text-xs text-m3-on-surface-variant ml-3 mb-1 block">Room Name</label>
                            <input 
                                autoFocus
                                type="text" 
                                value={roomName}
                                onChange={e => setRoomName(e.target.value)}
                                className="w-full px-4 py-3 bg-m3-surface-container rounded-xl border-none outline-none focus:ring-2 focus:ring-google-green/50"
                                placeholder="e.g. Friendly Match"
                            />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-m3-on-surface-variant ml-3 mb-1 block">Best of (Odd)</label>
                                <select 
                                    value={bestOf}
                                    onChange={e => setBestOf(e.target.value)}
                                    className="w-full px-4 py-3 bg-m3-surface-container rounded-xl border-none outline-none"
                                >
                                    <option value="1">1 Round</option>
                                    <option value="3">3 Rounds</option>
                                    <option value="5">5 Rounds</option>
                                    <option value="7">7 Rounds</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-m3-on-surface-variant ml-3 mb-1 block">Turn Timeout</label>
                                <div className="relative">
                                    <input 
                                        type="number" 
                                        value={timeoutSeconds}
                                        onChange={e => setTimeoutSeconds(e.target.value)}
                                        className="w-full px-4 py-3 bg-m3-surface-container rounded-xl border-none outline-none"
                                        min="5" max="60"
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-m3-on-surface-variant">sec</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-8">
                            <button type="button" onClick={() => setShowCreate(false)} className="px-6 py-2.5 text-m3-on-surface-variant hover:bg-black/5 rounded-full font-medium">Cancel</button>
                            <button type="submit" disabled={!roomName.trim()} className="px-6 py-2.5 bg-google-green text-white rounded-full font-medium shadow-sm hover:shadow-md disabled:opacity-50">Create</button>
                        </div>
                     </form>
                 </motion.div>
             </div>
        )}
      </AnimatePresence>
    </div>
  );
}
