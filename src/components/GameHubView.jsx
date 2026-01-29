import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Scissors, Hand, Disc, Trophy, User, Check, Play, Plus, X, Gamepad2, Bomb, Flag, Grid3x3, AlertTriangle } from './Icons';
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


// --- Minesweeper Game ---
const MinesweeperGame = ({ user, room, onLeave }) => {
  const { showToast } = useUI();
  const [grid, setGrid] = useState([]);
  const [status, setStatus] = useState('loading'); // loading, ready, playing, dead, won
  const [mineLocations, setMineLocations] = useState(new Set());
  const [flags, setFlags] = useState(new Set());
  const [revealed, setRevealed] = useState(new Set());
  const [explodedMine, setExplodedMine] = useState(null); // {r, c}
  const [longPressTimer, setLongPressTimer] = useState(null);
  
  const isPlayer = room.players && room.players.some(p => p.uid === user.uid);
  const me = isPlayer ? room.players.find(p => p.uid === user.uid) : null;
  const isSpectator = !isPlayer || me?.status === 'spectating'; // if implemented

  const { rows, cols, mines } = room.config;

  // Initialize Board
  useEffect(() => {
    if (!room.config.mineLocations) return;
    
    const mineSet = new Set(room.config.mineLocations);
    setMineLocations(mineSet);
    
    // Construct Grid
    const newGrid = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        row.push({ r, c });
      }
      newGrid.push(row);
    }
    setGrid(newGrid);
    setStatus('ready');

  }, [room.config]);
  
  // Sync Progress to Firestore
  useEffect(() => {
      if (!isPlayer || status === 'loading') return;
      
      const totalSafe = (rows * cols) - mines;
      const progress = revealed.size;
      const percent = Math.floor((progress / totalSafe) * 100);
      
      // Debounce update to avoid spamming
      const timer = setTimeout(() => {
          if (me.progress !== percent || me.status !== status) {
               const newPlayers = room.players.map(p => {
                  if (p.uid === user.uid) {
                      return { ...p, progress: percent, status: (status === 'dead' || status === 'won') ? status : 'playing' };
                  }
                  return p;
               });
               updateDoc(doc(db, 'game_rooms', room.id), { players: newPlayers });
          }
      }, 1000);
      return () => clearTimeout(timer);
  }, [revealed.size, status]);

  const getNeighbors = (r, c) => {
    const neighbors = [];
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        if (i === 0 && j === 0) continue;
        const nr = r + i;
        const nc = c + j;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          neighbors.push({ r: nr, c: nc });
        }
      }
    }
    return neighbors;
  };

  const countMines = (r, c) => {
      return getNeighbors(r, c).filter(n => mineLocations.has(`${n.r},${n.c}`)).length;
  };

  const revealCell = (r, c) => {
    if (status === 'dead' || status === 'won' || flags.has(`${r},${c}`) || revealed.has(`${r},${c}`)) return;
    if (status === 'ready') setStatus('playing');

    const key = `${r},${c}`;
    if (mineLocations.has(key)) {
        // BOOM
        setExplodedMine({ r, c });
        setStatus('dead');
        const newRevealed = new Set(revealed);
        newRevealed.add(key);
        setRevealed(newRevealed);
        return;
    }

    // Flood Fill
    const newRevealed = new Set(revealed);
    const queue = [{ r, c }];
    
    while (queue.length > 0) {
        const { r: currR, c: currC } = queue.pop();
        const currKey = `${currR},${currC}`;
        
        if (newRevealed.has(currKey)) continue;
        newRevealed.add(currKey);
        
        if (countMines(currR, currC) === 0) {
            getNeighbors(currR, currC).forEach(n => {
                if (!newRevealed.has(`${n.r},${n.c}`) && !mineLocations.has(`${n.r},${n.c}`)) {
                    queue.push(n);
                }
            });
        }
    }
    setRevealed(newRevealed);
    
    // Check Win
    if (newRevealed.size === (rows * cols) - mines) {
        setStatus('won');
    }
  };

  const toggleFlag = (e, r, c) => {
      e.preventDefault();
      if (status === 'dead' || status === 'won' || revealed.has(`${r},${c}`)) return;
      
      const key = `${r},${c}`;
      const newFlags = new Set(flags);
      if (newFlags.has(key)) newFlags.delete(key);
      else newFlags.add(key);
      setFlags(newFlags);
  };

  const handleChord = (r, c) => {
      if (!revealed.has(`${r},${c}`)) return;
      
      const mineCount = countMines(r, c);
      const neighbors = getNeighbors(r, c);
      const flagCount = neighbors.filter(n => flags.has(`${n.r},${n.c}`)).length;
      const hiddenNeighbors = neighbors.filter(n => !revealed.has(`${n.r},${n.c}`));

      if (mineCount === flagCount) {
          // Reveal all non-flagged neighbors
          neighbors.forEach(n => {
              if (!flags.has(`${n.r},${n.c}`)) revealCell(n.r, n.c);
          });
      } else if (hiddenNeighbors.length === mineCount - flagCount) {
           // Auto-flag remaining hidden if they must be mines (not classic behavior but requested "shortcut")
           // "If a格子周围还剩一些没打开的格子，刚好等于没有标记的雷的数量，则点击该数字格子可以快捷地把这些位置都标记为雷"
           /* 
             Actually logic:
             Total Mines around = M
             Already Flagged = F
             Remaining Hidden = H
             If H == M - F, then all H are mines.
           */
           const remainingMinesNeeded = mineCount - flagCount;
           if (hiddenNeighbors.length === remainingMinesNeeded && remainingMinesNeeded > 0) {
               const newFlags = new Set(flags);
               hiddenNeighbors.forEach(n => newFlags.add(`${n.r},${n.c}`));
               setFlags(newFlags);
           }
      }
  };

  const joinGame = async () => {
       const newPlayer = { uid: user.uid, name: user.displayName || 'User', progress: 0, status: 'playing' };
       await updateDoc(doc(db, 'game_rooms', room.id), {
           players: arrayUnion(newPlayer)
       });
  };

  // Render Cell
  const Cell = useMemo(() => ({ r, c }) => {
      const key = `${r},${c}`;
      const isRevealed = revealed.has(key);
      const isFlagged = flags.has(key);
      const isMine = mineLocations.has(key);
      const isExploded = explodedMine?.r === r && explodedMine?.c === c;
      const count = !isMine ? countMines(r, c) : 0;
      
      let content = null;
      let bgClass = "bg-m3-surface-container-high hover:bg-m3-surface-container-highest";
      
      if (status === 'dead' && isMine) { // Reveal mines on death
           bgClass = isExploded ? "bg-google-red" : "bg-m3-surface-container-highest";
           content = <Bomb className={`w-4 h-4 ${isExploded ? 'text-white' : 'text-google-red'}`} />;
      } else if (isRevealed) {
          bgClass = "bg-m3-surface-container border border-m3-outline/5";
          if (isMine) {
               content = <Bomb className="w-5 h-5 text-google-red" />;
          } else if (count > 0) {
              const colors = ["", "text-google-blue", "text-google-green", "text-google-red", "text-purple-600", "text-orange-600"];
              content = <span className={`font-bold text-lg ${colors[count] || 'text-black'}`}>{count}</span>;
          }
      } else if (isFlagged) {
          content = <Flag className="w-4 h-4 text-google-red" />;
      }

      const handlePointerDown = (e) => {
          if(e.button === 2) return; // Ignore actual right clicks handled by contextmenu
          const timer = setTimeout(() => {
              toggleFlag(e, r, c); // Long press
          }, 500);
          setLongPressTimer(timer);
      };
      
      const handlePointerUp = () => {
          if (longPressTimer) clearTimeout(longPressTimer);
          setLongPressTimer(null);
      };

      return (
          <div
            className={`w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded cursor-pointer select-none transition-colors ${bgClass}`}
            onClick={() => { if(!isFlagged && !isRevealed) revealCell(r,c); else if(isRevealed) handleChord(r,c); }}
            onContextMenu={(e) => toggleFlag(e, r, c)}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
              {content}
          </div>
      );
  }, [revealed, flags, status, mineLocations, explodedMine]);

  if (!room) return null;

  return (
      <div className="flex flex-col lg:flex-row gap-6 h-full p-4 overflow-hidden">
        {/* Game Area */}
        <div className="flex-1 flex flex-col items-center overflow-auto">
             <div className="flex justify-between w-full max-w-2xl mb-4 items-center">
                 <div className="flex items-center gap-2">
                     <button onClick={onLeave} className="p-2 hover:bg-black/5 rounded-full"><X className="w-5 h-5"/></button>
                     <div className="flex flex-col">
                        <h2 className="font-bold text-lg">{room.name}</h2>
                        <span className="text-xs text-m3-on-surface-variant capitalize">{room.config.difficulty} Mode</span>
                     </div>
                 </div>
                 <div className="flex gap-4">
                     <div className="bg-m3-surface-container px-3 py-1 rounded-full flex items-center gap-2">
                         <Flag className="w-4 h-4 text-google-red"/> {mines - flags.size}
                     </div>
                     <div className="bg-m3-surface-container px-3 py-1 rounded-full flex items-center gap-2">
                         <Clock className="w-4 h-4 text-google-blue"/> 
                         {/* Timer could be local based on start time */}
                         Play
                     </div>
                 </div>
             </div>
             
             {isPlayer ? (
                 <div 
                   className="bg-m3-surface-container-low p-2 rounded-xl shadow-inner overflow-auto max-w-full max-h-full border border-m3-outline-variant"
                   onContextMenu={(e) => e.preventDefault()}
                 >
                     <div 
                        className="grid gap-[2px]" 
                        style={{ gridTemplateColumns: `repeat(${cols}, min-content)` }}
                     >
                        {grid.map((row, r) => row.map((cell, c) => (
                            <Cell key={`${r}-${c}`} r={r} c={c} />
                        )))}
                     </div>
                 </div>
             ) : (
                 <div className="flex-1 flex items-center justify-center flex-col gap-4">
                     <Grid3x3 className="w-24 h-24 text-m3-on-surface-variant/20"/>
                     <button onClick={joinGame} className="px-6 py-3 bg-google-blue text-white rounded-full font-medium shadow-lg hover:scale-105 transition-transform">
                         Join Minesweeper
                     </button>
                 </div>
             )}
             
             {status === 'dead' && (
                 <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mt-4 p-4 bg-red-100 text-red-800 rounded-xl flex items-center gap-3">
                     <AlertTriangle className="w-6 h-6"/>
                     <div>
                         <div className="font-bold">BOOM! Game Over</div>
                         <div className="text-sm">You cleared {Math.floor((revealed.size / ((rows*cols)-mines))*100)}%</div>
                         <button onClick={() => setStatus('ready')} className="text-xs underline mt-1">Spectate others</button>
                     </div>
                 </motion.div>
             )}
             {status === 'won' && (
                 <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-4 p-4 bg-green-100 text-green-800 rounded-xl flex items-center gap-3">
                     <Trophy className="w-6 h-6 text-yellow-600"/>
                     <div className="font-bold">Mission Accomplished!</div>
                 </motion.div>
             )}
        </div>
        
        {/* Sidebar: Players List */}
         <div className="w-full lg:w-80 bg-m3-surface-container rounded-2xl p-4 flex flex-col h-full">
             <h3 className="font-medium text-sm mb-4 flex items-center gap-2"><User className="w-4 h-4"/> Players ({room.players?.length})</h3>
             <div className="flex-1 overflow-y-auto space-y-3">
                 {room.players?.sort((a,b) => (b.progress||0) - (a.progress||0)).map(p => (
                     <div key={p.uid} className={`relative p-3 rounded-xl border ${p.status === 'dead' ? 'bg-red-50 border-red-100' : 'bg-m3-surface border-transparent'}`}>
                         <div className="flex justify-between items-center mb-1">
                             <span className="font-medium text-sm truncate max-w-[120px]">{p.name} {p.uid === user.uid && '(You)'}</span>
                             {p.status === 'dead' && <span className="text-[10px] bg-red-200 text-red-800 px-1.5 py-0.5 rounded">Failed</span>}
                             {p.status === 'won' && <span className="text-[10px] bg-green-200 text-green-800 px-1.5 py-0.5 rounded">Success</span>}
                             {p.status === 'playing' && <span className="text-xs font-mono">{p.progress}%</span>}
                         </div>
                         <div className="h-2 bg-m3-surface-container-high rounded-full overflow-hidden">
                             <motion.div 
                                className={`h-full ${p.status === 'dead' ? 'bg-red-400' : p.status === 'won' ? 'bg-green-500' : 'bg-google-blue'}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${p.progress}%` }}
                             />
                         </div>
                     </div>
                 ))}
             </div>
         </div>
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
  const [selectedGame, setSelectedGame] = useState('rps'); // rps, mine
  const [bestOf, setBestOf] = useState(3);
  const [timeoutSeconds, setTimeoutSeconds] = useState(30);
  const [mineDifficulty, setMineDifficulty] = useState('easy'); // easy, medium, hard

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
      
      let config = {};
      
      if (selectedGame === 'rps') {
           config = {
              bestOf: parseInt(bestOf),
              timeout: parseInt(timeoutSeconds)
          };
      } else if (selectedGame === 'mine') {
          // Difficulty Config
          let rows=9, cols=9, mines=10;
          if (mineDifficulty === 'medium') { rows=16; cols=16; mines=40; }
          if (mineDifficulty === 'hard') { rows=16; cols=30; mines=99; }
          
          // Generate Seed (Mine Coordinates)
          const locations = [];
          while (locations.length < mines) {
              const r = Math.floor(Math.random() * rows);
              const c = Math.floor(Math.random() * cols);
              const key = `${r},${c}`;
              if (!locations.includes(key)) locations.push(key);
          }
           
          config = {
              difficulty: mineDifficulty,
              rows, cols, mines,
              mineLocations: locations
          };
      }
      
      const newRoom = {
          projectId: project.id,
          name: roomName,
          game: selectedGame, // 'rps' or 'mine'
          status: 'playing', 
          players: [], 
          config,
          createdAt: Date.now(),
          createdBy: user.uid
      };
      
      const ref = await addDoc(collection(db, 'game_rooms'), newRoom);
      setShowCreate(false);
      setRoomName('');
  };
  
  const handleJoin = async (room) => {
       setActiveRoom(room);
  };
  
  if (activeRoom) {
      if (activeRoom.game === 'mine') {
          return <MinesweeperGame user={user} room={activeRoom} onLeave={() => setActiveRoom(null)} />;
      }
      return <RPSGame user={user} room={activeRoom} projectId={project.id} onLeave={() => setActiveRoom(null)} />;
  }
  
  const GAMES = [
      { id: 'rps', label: 'Rock Paper Scissors', icon: Scissors, color: 'bg-google-blue' },
      { id: 'mine', label: 'Minesweeper', icon: Bomb, color: 'bg-google-red' }
  ];

  return (
    <div className="h-full flex flex-col p-4 md:p-8 animate-fade-in">
       {/* Header */}
       <div className="flex justify-between items-center mb-8">
           <h1 className="text-3xl font-normal text-m3-on-surface">Game Hub</h1>
           <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2 px-6 py-3 bg-m3-primary-container text-m3-on-primary-container rounded-2xl font-medium hover:shadow-elevation-1 transition-all">
               {showCreate ? <X className="w-5 h-5"/> : <Plus className="w-5 h-5"/>}
               {showCreate ? 'Close' : 'Create Room'}
           </button>
       </div>
       
       {showCreate && (
           <div className="mb-8 p-6 bg-m3-surface-container rounded-[28px] animate-slide-down border border-m3-outline-variant/50">
               <h3 className="text-xl mb-6">Start a New Game</h3>
               <form onSubmit={handleCreateRoom} className="space-y-6">
                   <div className="flex flex-col md:flex-row gap-6">
                       {/* Game Selection */}
                       <div className="flex-1">
                           <label className="text-xs uppercase tracking-wider text-m3-on-surface-variant font-medium mb-3 block">Select Game</label>
                           <div className="grid grid-cols-2 gap-4">
                               {GAMES.map(g => (
                                   <div 
                                      key={g.id} 
                                      onClick={() => setSelectedGame(g.id)}
                                      className={`cursor-pointer p-4 rounded-xl border flex items-center gap-3 transition-all ${selectedGame === g.id ? 'border-google-blue bg-google-blue/5' : 'border-m3-outline-variant/30 hover:bg-m3-surface'}`}
                                   >
                                       <div className={`p-2 rounded-full ${g.color} text-white`}>
                                           <g.icon className="w-5 h-5"/>
                                       </div>
                                       <span className="font-medium">{g.label}</span>
                                   </div>
                               ))}
                           </div>
                       </div>
                       
                       <div className="flex-1 space-y-4">
                           <div>
                               <label className="text-xs uppercase tracking-wider text-m3-on-surface-variant font-medium mb-2 block">Room Name</label>
                               <input type="text" placeholder="e.g. Friday Fun" value={roomName} onChange={e => setRoomName(e.target.value)} className="w-full px-4 py-3 bg-m3-surface border border-m3-outline rounded-xl outline-none focus:border-google-blue" required />
                           </div>
                           
                           {/* Game Specific Config */}
                           {selectedGame === 'rps' && (
                               <div className="flex gap-4">
                                   <div className="flex-1">
                                       <label className="text-xs text-m3-on-surface-variant mb-1 block">Best Of (Rounds)</label>
                                       <select value={bestOf} onChange={e => setBestOf(e.target.value)} className="w-full px-4 py-3 bg-m3-surface border border-m3-outline rounded-xl outline-none">
                                           <option value="1">1 (Sudden Death)</option>
                                           <option value="3">3</option>
                                           <option value="5">5</option>
                                       </select>
                                   </div>
                                   <div className="flex-1">
                                        <label className="text-xs text-m3-on-surface-variant mb-1 block">Turn Timeout</label>
                                        <select value={timeoutSeconds} onChange={e => setTimeoutSeconds(e.target.value)} className="w-full px-4 py-3 bg-m3-surface border border-m3-outline rounded-xl outline-none">
                                           <option value="15">15s</option>
                                           <option value="30">30s</option>
                                           <option value="60">60s</option>
                                       </select>
                                   </div>
                               </div>
                           )}
                           
                           {selectedGame === 'mine' && (
                               <div>
                                   <label className="text-xs text-m3-on-surface-variant mb-1 block">Difficulty</label>
                                   <div className="flex gap-2">
                                       {['easy', 'medium', 'hard'].map(d => (
                                           <button 
                                              type="button" 
                                              key={d} 
                                              onClick={() => setMineDifficulty(d)}
                                              className={`flex-1 py-2 rounded-lg border text-sm capitalize transition-colors ${mineDifficulty === d ? 'bg-m3-primary text-white border-transparent' : 'border-m3-outline hover:bg-m3-surface-container-high'}`}
                                           >
                                               {d}
                                           </button>
                                       ))}
                                   </div>
                                    <div className="text-xs text-m3-on-surface-variant mt-2">
                                       {mineDifficulty === 'easy' && '9x9 Grid, 10 Mines'}
                                       {mineDifficulty === 'medium' && '16x16 Grid, 40 Mines'}
                                       {mineDifficulty === 'hard' && '30x16 Grid, 99 Mines'}
                                   </div>
                               </div>
                           )}
                       </div>
                   </div>
                   <div className="flex justify-end">
                       <button type="submit" className="px-8 py-3 bg-google-blue text-white rounded-full font-medium shadow-elevation-1 hover:shadow-elevation-2">
                           Create Room
                       </button>
                   </div>
               </form>
           </div>
       )}
       
       {/* Rooms Grid */}
       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
           {rooms.length === 0 ? (
               <div className="col-span-full text-center py-20 text-m3-on-surface-variant/50">
                   <Gamepad2 className="w-12 h-12 mx-auto mb-4 opacity-50"/>
                   No active rooms. Create one to start playing!
               </div>
           ) : (
               rooms.map(room => (
                   <div key={room.id} onClick={() => handleJoin(room)} className="group cursor-pointer bg-m3-surface-container hover:bg-m3-surface-container-high border border-m3-outline-variant/30 rounded-2xl p-5 transition-all hover:-translate-y-1 hover:shadow-xl relative overflow-hidden">
                       <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                           {room.game === 'mine' ? <Bomb className="w-24 h-24 rotate-12"/> : <Scissors className="w-24 h-24 -rotate-12"/> }
                       </div>
                       
                       <div className="relative">
                           <div className="flex justify-between items-start mb-4">
                               <div className={`p-2 rounded-xl text-white ${room.game === 'mine' ? 'bg-google-red' : 'bg-google-blue'}`}>
                                   {room.game === 'mine' ? <Bomb className="w-6 h-6"/> : <Scissors className="w-6 h-6"/>}
                               </div>
                               <div className="px-2 py-1 bg-m3-surface/50 rounded text-xs font-mono">
                                   {room.players?.length || 0} / {room.game === 'mine' ? 8 : 2}
                               </div>
                           </div>
                           
                           <h3 className="text-lg font-bold mb-1">{room.name}</h3>
                           <p className="text-sm text-m3-on-surface-variant mb-4 capitalize">
                               {room.game === 'mine' ? `${room.config.difficulty} Mode` : `Best of ${room.config.bestOf}`}
                           </p>
                           
                           <div className="flex items-center gap-2 text-xs text-m3-on-surface-variant/70">
                               <User className="w-3 h-3"/>
                               <span>Created by {room.createdBy === user.uid ? 'You' : 'User ' + room.createdBy.slice(0,4)}</span>
                           </div>
                       </div>
                   </div>
               ))
           )}
       </div>
    </div>
  );
}

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
