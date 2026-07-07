import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Scissors, Hand, Disc, Trophy, User, Check, Play, Plus, X, Gamepad2, Bomb, Flag, Grid3x3, AlertTriangle, Share2, RotateCcw } from './Icons';
import { useUI } from './UIContext';
import { collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query, where, getDoc, db } from '../lib/localData';
import { nowMs } from '../lib/time';
import {
  PROJECT_CHILD_TEXT_MAX_LENGTH,
  createGameRoomCreateData,
  createGameRoomJoinPatch,
  createGameRoomSummary,
  createUserGameResultHistory,
  createGameRoomInviteUrl,
  getGameRoomInviteId,
  createMineRoomProgressPatch,
  createRpsNextRoundPatch,
  normalizeMineProgressInput,
  normalizeRpsScoreInput,
} from '../lib/projectDomain';

const RPS_ICONS = { rock: Disc, paper: Hand, scissors: Scissors };
const RPS_COLORS = { rock: 'text-google-red', paper: 'text-google-blue', scissors: 'text-google-yellow' };

function MoveIcon({ move, className = 'w-10 h-10' }) {
  const Icon = RPS_ICONS[move] || Disc;
  return <Icon className={`${className} ${RPS_COLORS[move] || 'text-m3-on-surface-variant'}`} />;
}

// --- Rock Paper Scissors Game ---
const RPSGame = ({ user, room, projectId, isStopped = false, onLeave, t }) => {
  const { showToast } = useUI();
  const canInteract = !isStopped;
  
  // Game State derived from room
  const [timeLeft, setTimeLeft] = useState(0);
  const [selectedMoveState, setSelectedMoveState] = useState(() => ({ round: room.currentRound, move: null }));
  const [isJoiningRpsGame, setIsJoiningRpsGame] = useState(false);
  const isJoiningRpsGameRef = useRef(false);
  const [showdownAnim, setShowdownAnim] = useState(null); // Local state for animation trigger
  const selectedMove = selectedMoveState.round === room.currentRound ? selectedMoveState.move : null;
  
  const isPlayer = room.players && room.players.some(p => p.uid === user.uid);
  const me = isPlayer ? room.players.find(p => p.uid === user.uid) : null;
  const opponent = isPlayer ? room.players.find(p => p.uid !== user.uid) : null;
  const myScore = me ? normalizeRpsScoreInput(me.score, room.config) : 0;
  const opponentScore = opponent ? normalizeRpsScoreInput(opponent.score, room.config) : 0;
  const isSpectator = !isPlayer;
  const isHost = room.players && room.players.length > 0 && room.players[0].uid === user.uid; // Simple host logic
  
  const startNextRound = useCallback(async () => {
       if (!canInteract) return;
       const updateData = createRpsNextRoundPatch(room, nowMs());
       if (!updateData) return;
       await updateDoc(doc(db, 'game_rooms', room.id), updateData);
  }, [canInteract, room]);

  const handleMove = useCallback(async (move) => {
      if (!canInteract) return;
      if ((selectedMove || me.move) && room.status === 'playing') return; // Already acted locally
      setSelectedMoveState({ round: room.currentRound, move });
      
      let newPlayers = room.players.map(p => {
          if (p.uid === user.uid) return { ...p, move: move };
          return p;
      });

      // Bot Logic
      const bot = newPlayers.find(p => p.uid === 'computer');
      if (bot && !bot.move) {
          const moves = ['rock', 'paper', 'scissors'];
          const botMove = moves[Math.floor(Math.random() * moves.length)];
          newPlayers = newPlayers.map(p => 
              p.uid === 'computer' ? { ...p, move: botMove } : p
          );
      }
      
      const allMoved = newPlayers.every(p => p.move);
      let updateData = { players: newPlayers };
      
      if (allMoved) {
          // Both moved -> Calculate Result & Enter Showdown
            const p1 = { ...newPlayers[0], score: normalizeRpsScoreInput(newPlayers[0]?.score, room.config) };
            const p2 = { ...newPlayers[1], score: normalizeRpsScoreInput(newPlayers[1]?.score, room.config) };
            let winnerId = null; // Round winner

            if (p1.move !== p2.move) {
                if (
                    (p1.move === 'rock' && p2.move === 'scissors') ||
                    (p1.move === 'paper' && p2.move === 'rock') ||
                    (p1.move === 'scissors' && p2.move === 'paper')
                ) {
                    winnerId = p1.uid;
                    p1.score = normalizeRpsScoreInput(p1.score + 1, room.config);
                } else {
                    winnerId = p2.uid;
                    p2.score = normalizeRpsScoreInput(p2.score + 1, room.config);
                }
            }
            newPlayers = [p1, p2];
           
          // Record History
          const historyItem = {
              round: room.currentRound,
              p1Move: p1.move,
              p2Move: p2.move,
              winnerId,
              timestamp: nowMs()
          };
          const history = [...(room.history || []), historyItem];
          
          // Enter Showdown Mode
          updateData = {
              players: newPlayers, // Save moves/scores
              history,
              status: 'showdown',
              showdownEndTime: nowMs() + 3000 // 3 seconds animation
          };
      }
      
      await updateDoc(doc(db, 'game_rooms', room.id), updateData);
  }, [canInteract, me, room, selectedMove, user.uid]);

  // Timer & Game Loop logic
  useEffect(() => {
    if (!room) return;

    const interval = setInterval(() => {
        const now = nowMs();

        // 1. PLAYING STATE TIMER
        if (room.status === 'playing') {
            const elapsed = (now - (room.roundStartTime || now)) / 1000;
            const remaining = Math.max(0, room.config.timeout - elapsed);
            setTimeLeft(remaining);

            // Timeout Auto-move (Client side enforcement by player themselves)
            if (canInteract && remaining <= 0 && isPlayer && !me.move) {
               // Auto-play random or rock
               const moves = ['rock', 'paper', 'scissors'];
               const randomMove = moves[Math.floor(Math.random() * moves.length)];
               handleMove(randomMove);
            }
        }

        // 2. SHOWDOWN STATE TIMER (Host only handles transition)
        if (canInteract && room.status === 'showdown' && isHost) {
             if (now > room.showdownEndTime) {
                 startNextRound();
             }
        }

    }, 200);
    return () => clearInterval(interval);
  }, [canInteract, handleMove, isHost, isPlayer, me, room, startNextRound]);

  
  const joinGame = async () => {
      if (!canInteract) return;
      if (isJoiningRpsGameRef.current) return;
      const updateData = createGameRoomJoinPatch(room, user, user.displayName || t('userLabel'), nowMs());
      if (!updateData) return;
      isJoiningRpsGameRef.current = true;
      setIsJoiningRpsGame(true);
      try {
          await updateDoc(doc(db, 'game_rooms', room.id), updateData);
      } catch (error) {
          console.error(error);
          showToast(t('gameActionFailed'), 'error');
      } finally {
          isJoiningRpsGameRef.current = false;
          setIsJoiningRpsGame(false);
      }
  };

  if(!room) return null;

  return (
    <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
                <button onClick={onLeave} className="app-icon-button"><X className="w-5 h-5"/></button>
                <h2 className="text-xl font-medium">{room.name}</h2>
            </div>
            <div className="flex items-center gap-4 bg-m3-surface-container px-3 py-1.5 rounded-full text-sm font-medium">
                <span className="text-google-blue">{t('bestOf')} {room.config.bestOf}</span>
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
                                 <div className="app-card-quiet flex h-28 w-28 items-center justify-center p-5">
                                     <MoveIcon move={room.players[0].move} className="w-16 h-16" />
                                 </div>
                                 <div className="mt-2 text-lg font-bold text-m3-on-surface">{room.players[0].name}</div>
                             </motion.div>

                             <div className="text-2xl font-black italic text-m3-on-surface-variant">VS</div>

                             {/* P2 */}
                             <motion.div 
                                initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.2 }}
                                className="flex flex-col items-center"
                             >
                                 <div className="app-card-quiet flex h-28 w-28 items-center justify-center p-5">
                                     <MoveIcon move={room.players[1].move} className="w-16 h-16" />
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
                                if (p1.move === p2.move) return t('draw');
                                // We calculated round winner logic in handleMove but hard to reconstruct here cleanly without duplicating logic
                                // Or reading last history item?
                                const lastRound = room.history && room.history[room.history.length - 1];
                                if (lastRound) {
                                    if (!lastRound.winnerId) return t('draw');
                                    const winnerName = room.players.find(p => p.uid === lastRound.winnerId)?.name;
                                    return t('wins', { name: winnerName });
                                }
                                return t('roundOver');
                            })()}
                         </motion.div>
                         <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} 
                            className="mt-2 text-sm text-m3-on-surface-variant"
                         >
                             {t('nextRoundStarting')}
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
                       <Clock className="h-8 w-8 animate-pulse text-google-blue" /> :
                       room.status === 'finished' && room.winnerId === opponent.uid ? 
                       <Trophy className="w-8 h-8 text-google-yellow"/> :
                       <User className="w-8 h-8 text-m3-on-surface-variant"/>
                   ) : <User className="w-8 h-8 text-m3-on-surface-variant/30"/>}
                   
                   {/* Score Badge */}
                   {opponent && <div className="absolute -top-1 -right-1 bg-google-red text-white text-xs w-6 h-6 flex items-center justify-center rounded-full border border-white">{opponentScore}</div>}
                </div>
                <div className="text-sm font-medium text-m3-on-surface">{opponent?.name || t('waiting')}</div>
                {opponent?.move && room.status === 'playing' && <div className="text-xs text-google-green mt-1 font-medium">{t('ready')}</div>}
            </div>
            
            {/* Center Status / Result */}
            <div className="text-center h-20 flex items-center justify-center">
                 {room.status === 'waiting' && <span className="text-m3-on-surface-variant animate-pulse">{t('waitingForOpponent')}</span>}
                 {room.status === 'playing' && <div className="text-4xl font-display font-medium text-m3-on-surface/20">{t('round')} {room.currentRound}</div>}
                 {room.status === 'finished' && (
                     <motion.div initial={{scale:0}} animate={{scale:1}} className="flex flex-col items-center">
                         <div className="text-2xl font-bold text-google-yellow mb-1">{room.winnerId === user.uid ? t('victory') : t('defeat')}</div>
                         <button onClick={onLeave} className="app-button bg-m3-primary text-sm text-white">{t('leaveRoom')}</button>
                     </motion.div>
                 )}
            </div>

            {/* My Area */}
            <div className="flex flex-col items-center w-full">
                {isPlayer ? (
                    <>
                        <div className="flex items-center gap-6 mb-8">
                            {['rock', 'paper', 'scissors'].map(move => {
                                const ButtonIcon = RPS_ICONS[move];
                                const isSelected = selectedMove === move || me.move === move;
                                return (
                                    <button
                                        key={move}
                                        disabled={!canInteract || !!selectedMove || room.status !== 'playing'}
                                        onClick={() => handleMove(move)}
                                        className={`touch-target flex h-20 w-20 items-center justify-center rounded-2xl transition-all duration-200
                                            ${isSelected
                                                ? `bg-m3-primary-container ring-4 ring-google-blue/30 shadow-elevation-1`
                                                : `bg-m3-surface-container hover:bg-m3-surface-container-high hover:ring-2 hover:ring-google-blue/20 shadow-sm`
                                            }
                                            ${(selectedMove && !isSelected) ? 'opacity-40 saturate-50' : ''}
                                        `}
                                    >
                                        <ButtonIcon className={`w-10 h-10 ${isSelected ? RPS_COLORS[move] : 'text-m3-on-surface'}`} />
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex flex-col items-center">
                            <div className="text-lg font-medium">{me.name} ({t('you')})</div>
                            <div className="text-sm text-m3-on-surface-variant">{t('score')}: {myScore}</div>
                        </div>
                    </>
                ) : (
                    <button onClick={joinGame} disabled={!canInteract || isJoiningRpsGame} aria-busy={isJoiningRpsGame} className="app-button-primary px-8">
                        {isJoiningRpsGame ? t('processing') : t('joinGame')}
                    </button>
                )}
            </div>
            
        </div>
        
        {/* History Log Panel */}
        {room.history && room.history.length > 0 && (
            <div className="mt-8 pt-4 border-t border-m3-outline-variant/10">
                <h4 className="text-xs font-medium text-m3-on-surface-variant uppercase tracking-wider mb-3">{t('previousRounds')}</h4>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {[...room.history].reverse().map((round, i) => (
                            <div key={i} className="flex-shrink-0 flex min-w-[88px] flex-col items-center rounded-xl border border-m3-outline-variant/30 bg-m3-surface-container p-2">
                                <span className="text-[10px] text-m3-on-surface-variant mb-1">R{round.round}</span>
                                <div className="flex items-center gap-2">
                                    <MoveIcon move={round.p1Move} className="w-4 h-4" />
                                    <span className="text-xs text-m3-on-surface-variant">vs</span>
                                    <MoveIcon move={round.p2Move} className="w-4 h-4" />
                                </div>
                            </div>
                    ))}
                </div>
            </div>
        )}
    </div>
  );
};


const MINE_NUMBER_COLORS = [
  '',
  'text-google-blue',
  'text-google-green',
  'text-google-red',
  'text-google-yellow',
  'text-m3-primary',
  'text-google-blue',
  'text-google-green',
  'text-google-red',
];

function createMineLocations(rows, cols, mines) {
  const locations = [];
  while (locations.length < mines) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    const key = `${r},${c}`;
    if (!locations.includes(key)) locations.push(key);
  }
  return locations;
}

function MineCell({
  r,
  c,
  status,
  revealed,
  flags,
  mineLocations,
  explodedMine,
  countMines,
  revealCell,
  toggleFlag,
  handleChord,
}) {
  const longPressTimer = useRef(null);
  const key = `${r},${c}`;
  const isRevealed = revealed.has(key);
  const isFlagged = flags.has(key);
  const isMine = mineLocations.has(key);
  const isExploded = explodedMine?.r === r && explodedMine?.c === c;
  const count = !isMine ? countMines(r, c) : 0;

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  let content = null;
  let bgClass = 'bg-m3-surface-container-high hover:bg-m3-surface-container-highest';

  if (status === 'dead' && isMine) {
    bgClass = isExploded ? 'bg-google-red' : 'bg-m3-surface-container-highest';
    content = <Bomb className={`w-4 h-4 ${isExploded ? 'text-white' : 'text-google-red'}`} />;
  } else if (isRevealed) {
    bgClass = 'bg-m3-surface-container border border-m3-outline/5';
    if (isMine) {
      content = <Bomb className="w-5 h-5 text-google-red" />;
    } else if (count > 0) {
      content = <span className={`text-lg font-bold ${MINE_NUMBER_COLORS[count] || 'text-m3-on-surface'}`}>{count}</span>;
    }
  } else if (isFlagged) {
    content = <Flag className="w-4 h-4 text-google-red" />;
  }

  const clearLongPressTimer = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  const handlePointerDown = (event) => {
    if (event.button === 2) return;
    clearLongPressTimer();
    longPressTimer.current = setTimeout(() => {
      toggleFlag(r, c);
      longPressTimer.current = null;
    }, 500);
  };

  const handlePointerUp = () => {
    clearLongPressTimer();
  };

  return (
    <button
      type="button"
      aria-label={`${r + 1}, ${c + 1}`}
      className={`flex h-9 w-9 select-none items-center justify-center rounded-md transition-colors sm:h-10 sm:w-10 ${bgClass} ${isRevealed ? 'cursor-default' : 'cursor-pointer'}`}
      onClick={() => { if (!isFlagged && !isRevealed) revealCell(r, c); else if (isRevealed) handleChord(r, c); }}
      onContextMenu={(event) => { event.preventDefault(); toggleFlag(r, c); }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {content}
    </button>
  );
}


// --- Minesweeper Game ---
const MinesweeperGame = ({ user, room, isStopped = false, onLeave, t }) => {
  const { showToast } = useUI();
  const { rows, cols, mines } = room.config;
  const canInteract = !isStopped;
  const [status, setStatus] = useState(() => room.config.mineLocations ? 'ready' : 'loading'); // loading, ready, playing, dead, won
  const [isJoiningMinesweeper, setIsJoiningMinesweeper] = useState(false);
  const isJoiningMinesweeperRef = useRef(false);
  const [flags, setFlags] = useState(new Set());
  const [revealed, setRevealed] = useState(new Set());
  const [explodedMine, setExplodedMine] = useState(null); // {r, c}
  const mineLocations = useMemo(() => new Set(room.config.mineLocations || []), [room.config.mineLocations]);
  const grid = useMemo(() => {
    return Array.from({ length: rows }, (_, r) => (
      Array.from({ length: cols }, (_, c) => ({ r, c }))
    ));
  }, [cols, rows]);
  
  const isPlayer = room.players && room.players.some(p => p.uid === user.uid);
  const me = isPlayer ? room.players.find(p => p.uid === user.uid) : null;
  const isSpectator = !isPlayer || me?.status === 'spectating'; // if implemented
  const sortedPlayers = useMemo(() => (
    [...(room.players || [])].sort((a, b) => normalizeMineProgressInput(b.progress) - normalizeMineProgressInput(a.progress))
  ), [room.players]);
  const difficultyLabels = {
    easy: t('difficultyEasy'),
    medium: t('difficultyMedium'),
    hard: t('difficultyHard'),
  };

  // Sync progress to shared local data.
  useEffect(() => {
      if (!canInteract) return;
      if (!isPlayer || status === 'loading' || room.isLocal) return; // Skip for Local/Practice games
      
      const totalSafe = (rows * cols) - mines;
      const progress = revealed.size;
      const percent = Math.floor((progress / totalSafe) * 100);
      
      // Debounce update to avoid spamming
      const timer = setTimeout(() => {
          if (me.progress !== percent || me.status !== status) {
               const nextStatus = (status === 'dead' || status === 'won') ? status : 'playing';
               const updateData = createMineRoomProgressPatch(room, user, percent, nextStatus, nowMs());
               if (updateData) updateDoc(doc(db, 'game_rooms', room.id), updateData);
          }
      }, 1000);
      return () => clearTimeout(timer);
  }, [canInteract, cols, isPlayer, me?.progress, me?.status, mines, revealed.size, room, rows, status, user]);

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
    if (!canInteract) return;
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

  const toggleFlag = (r, c) => {
      if (!canInteract) return;
      if (status === 'dead' || status === 'won' || revealed.has(`${r},${c}`)) return;
      
      const key = `${r},${c}`;
      const newFlags = new Set(flags);
      if (newFlags.has(key)) newFlags.delete(key);
      else newFlags.add(key);
      setFlags(newFlags);
  };

  const handleChord = (r, c) => {
      if (!canInteract) return;
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
       if (!canInteract) return;
       if (isJoiningMinesweeperRef.current) return;
       const updateData = createGameRoomJoinPatch(room, user, user.displayName || t('userLabel'), nowMs());
       if (!updateData) return;
       isJoiningMinesweeperRef.current = true;
       setIsJoiningMinesweeper(true);
       try {
           await updateDoc(doc(db, 'game_rooms', room.id), updateData);
       } catch (error) {
           console.error(error);
           showToast(t('gameActionFailed'), 'error');
       } finally {
           isJoiningMinesweeperRef.current = false;
           setIsJoiningMinesweeper(false);
       }
  };

  if (!room) return null;

  return (
      <div className="flex h-full flex-col gap-6 overflow-hidden p-2 sm:p-4 lg:flex-row">
        {/* Game Area */}
        <div className="flex-1 flex flex-col items-center overflow-auto">
             <div className="flex justify-between w-full max-w-2xl mb-4 items-center">
                 <div className="flex items-center gap-2">
                     <button onClick={onLeave} className="app-icon-button"><X className="w-5 h-5"/></button>
                     <div className="flex flex-col">
                        <h2 className="font-bold text-lg">{room.name}</h2>
                        <span className="text-xs text-m3-on-surface-variant">{difficultyLabels[room.config.difficulty] || room.config.difficulty}</span>
                     </div>
                 </div>
                 <div className="flex flex-wrap gap-2">
                     <div className="app-chip app-chip-red">
                         <Flag className="w-4 h-4 text-google-red"/> {mines - flags.size}
                     </div>
                     <div className="app-chip app-chip-blue">
                         <Clock className="w-4 h-4 text-google-blue"/> 
                         {/* Timer could be local based on start time */}
                         {t('playing')}
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
                            <MineCell
                              key={`${r}-${c}`}
                              r={cell.r}
                              c={cell.c}
                              status={status}
                              revealed={revealed}
                              flags={flags}
                              mineLocations={mineLocations}
                              explodedMine={explodedMine}
                              countMines={countMines}
                              revealCell={revealCell}
                              toggleFlag={toggleFlag}
                              handleChord={handleChord}
                            />
                        )))}
                     </div>
                 </div>
             ) : (
                 <div className="flex-1 flex items-center justify-center flex-col gap-4">
                     <Grid3x3 className="w-24 h-24 text-m3-on-surface-variant/20"/>
                    <button onClick={joinGame} disabled={!canInteract || isJoiningMinesweeper} aria-busy={isJoiningMinesweeper} className="app-button-primary px-6">
                         {isJoiningMinesweeper ? t('processing') : t('joinMinesweeper')}
                     </button>
                 </div>
             )}
             
             {status === 'dead' && (
                 <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="app-card-quiet mt-4 flex items-center gap-3 border-google-red/30 bg-google-red/10 p-4 text-google-red">
                     <AlertTriangle className="w-6 h-6"/>
                     <div>
                         <div className="font-bold">{t('gameOver')}</div>
                         <div className="text-sm">{t('youCleared', { percent: Math.floor((revealed.size / ((rows*cols)-mines))*100) })}</div>
                         <button onClick={() => setStatus('ready')} className="app-button-quiet mt-2 min-h-0 px-0 py-0 text-xs text-google-red hover:bg-transparent">{t('spectateOthers')}</button>
                     </div>
                 </motion.div>
             )}
             {status === 'won' && (
                 <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="app-card-quiet mt-4 flex items-center gap-3 border-google-green/30 bg-google-green/10 p-4 text-google-green">
                     <Trophy className="w-6 h-6 text-google-yellow"/>
                     <div className="font-bold">{t('missionAccomplished')}</div>
                 </motion.div>
             )}
        </div>
        
        {/* Sidebar: Players List */}
         <div className="app-card-quiet flex h-full w-full flex-col p-4 lg:w-80">
             <h3 className="font-medium text-sm mb-4 flex items-center gap-2"><User className="w-4 h-4"/> {t('players')} ({room.players?.length})</h3>
             <div className="flex-1 overflow-y-auto space-y-3">
                 {sortedPlayers.map(p => {
                     const progress = normalizeMineProgressInput(p.progress);
                     return (
                     <div key={p.uid} className={`relative rounded-xl border p-3 ${p.status === 'dead' ? 'border-google-red/30 bg-google-red/10' : 'border-m3-outline-variant/30 bg-m3-surface'}`}>
                         <div className="flex justify-between items-center mb-1">
                             <span className="font-medium text-sm truncate max-w-[120px]">{p.name} {p.uid === user.uid && `(${t('you')})`}</span>
                             {p.status === 'dead' && <span className="app-chip app-chip-red min-h-0 px-2 py-0 text-[10px]">{t('failed')}</span>}
                             {p.status === 'won' && <span className="app-chip app-chip-green min-h-0 px-2 py-0 text-[10px]">{t('success')}</span>}
                             {p.status === 'playing' && <span className="text-xs font-mono">{progress}%</span>}
                         </div>
                         <div className="h-2 bg-m3-surface-container-high rounded-full overflow-hidden">
                             <motion.div 
                                className={`h-full ${p.status === 'dead' ? 'bg-google-red' : p.status === 'won' ? 'bg-google-green' : 'bg-google-blue'}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                             />
                         </div>
                     </div>
                     );
                 })}
             </div>
         </div>
      </div>
  );
};


export default function GameHubView({ project, user, isStopped = false, t }) {
  const { showToast } = useUI();
  const canInteract = !isStopped;
  const [activeTab, setActiveTab] = useState('lobby'); // lobby | finished
  const [roomsSnapshot, setRoomsSnapshot] = useState({ projectId: null, items: [] });
  const [gameRoomsLoadError, setGameRoomsLoadError] = useState(false);
  const [gameRoomsReloadKey, setGameRoomsReloadKey] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState(null); // If joined/spectating a room
  const [manualRoomInviteUrl, setManualRoomInviteUrl] = useState('');
  const handledInviteRef = useRef(null);
  
  // Create Form State
  const [roomName, setRoomName] = useState('');
  const [selectedGame, setSelectedGame] = useState('rps'); // rps, mine
  const [bestOf, setBestOf] = useState(3);
  const [timeoutSeconds, setTimeoutSeconds] = useState(30);
  const [mineDifficulty, setMineDifficulty] = useState('easy'); // easy, medium, hard
  const [vsComputer, setVsComputer] = useState(false);
  const [isCreatingGameRoom, setIsCreatingGameRoom] = useState(false);
  const isCreatingGameRoomRef = useRef(false);

  const replaceRoomInviteUrl = useCallback((roomId) => {
      if (typeof window === 'undefined') return;
      const nextUrl = createGameRoomInviteUrl(window.location.href, roomId);
      if (nextUrl) window.history.replaceState(window.history.state, '', nextUrl);
  }, []);

  // Sync Rooms
  useEffect(() => {
    const q = query(
        collection(db, 'game_rooms'), 
        where('projectId', '==', project.id)
    );
    
    const unsub = onSnapshot(q, (snapshot) => {
        const nextRooms = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setGameRoomsLoadError(false);
        setRoomsSnapshot({ projectId: project.id, items: nextRooms });

        const inviteRoomId = typeof window === 'undefined' ? null : getGameRoomInviteId(window.location.search);
        const inviteKey = inviteRoomId ? `${project.id}:${inviteRoomId}` : null;
        if (!inviteRoomId || handledInviteRef.current === inviteKey) return;

        handledInviteRef.current = inviteKey;
        const invitedRoom = nextRooms.find((room) => room.id === inviteRoomId);
        if (invitedRoom) {
            setActiveRoomId(invitedRoom.id);
            setActiveTab(invitedRoom.status === 'finished' ? 'finished' : 'lobby');
            replaceRoomInviteUrl(invitedRoom.id);
            return;
        }

        replaceRoomInviteUrl(null);
        showToast(t('roomInviteUnavailable'), 'info');
    }, (error) => {
        console.error("Error loading game rooms:", error);
        setGameRoomsLoadError(true);
    });
    return () => unsub();
  }, [gameRoomsReloadKey, project.id, replaceRoomInviteUrl, showToast, t]);

  const rooms = useMemo(
      () => (roomsSnapshot.projectId === project.id ? roomsSnapshot.items : []),
      [project.id, roomsSnapshot.items, roomsSnapshot.projectId],
  );

  const visibleRooms = useMemo(() => (
      rooms.filter(room => (
          activeTab === 'lobby'
              ? ['waiting', 'playing', 'showdown'].includes(room.status)
              : room.status === 'finished'
      ))
  ), [activeTab, rooms]);

  const userResultHistory = useMemo(
      () => createUserGameResultHistory(rooms, user.uid, 3),
      [rooms, user.uid],
  );

  const currentActiveRoom = useMemo(() => (
      activeRoomId ? rooms.find(room => room.id === activeRoomId) || null : null
  ), [activeRoomId, rooms]);

  const openRoom = useCallback((room) => {
      if (!room?.id) return;
      setActiveRoomId(room.id);
      setActiveTab(room.status === 'finished' ? 'finished' : 'lobby');
      replaceRoomInviteUrl(room.id);
  }, [replaceRoomInviteUrl]);

  const closeRoom = useCallback(() => {
      setActiveRoomId(null);
      replaceRoomInviteUrl(null);
  }, [replaceRoomInviteUrl]);

  const copyRoomInvite = useCallback(async (room) => {
      const inviteUrl = typeof window === 'undefined' ? '' : createGameRoomInviteUrl(window.location.href, room?.id);
      if (!inviteUrl || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
          if (inviteUrl) {
              setManualRoomInviteUrl(inviteUrl);
              showToast(t('roomInviteManualCopy'), 'info');
          } else {
              showToast(t('roomInviteUnavailable'), 'error');
          }
          return;
      }

      try {
          await navigator.clipboard.writeText(inviteUrl);
          setManualRoomInviteUrl('');
          showToast(t('roomInviteCopied'), 'success');
      } catch {
          setManualRoomInviteUrl(inviteUrl);
          showToast(t('roomInviteManualCopy'), 'info');
      }
  }, [showToast, t]);

  const handleCreateRoom = async (e) => {
      e.preventDefault();
      if (isCreatingGameRoomRef.current) return;
      if (!canInteract || !roomName.trim()) return;

      const createdAt = nowMs();
      const baseRoom = createGameRoomCreateData(project.id, user, roomName, selectedGame, {
          bestOf,
          timeout: timeoutSeconds,
          vsComputer,
          userName: user.displayName || t('you'),
          botName: t('bot'),
          difficulty: mineDifficulty,
      }, createdAt);
      if (!baseRoom) return;

      const newRoom = selectedGame === 'mine'
          ? {
              ...baseRoom,
              config: {
                  ...baseRoom.config,
                  mineLocations: createMineLocations(baseRoom.config.rows, baseRoom.config.cols, baseRoom.config.mines),
              },
          }
          : baseRoom;

      isCreatingGameRoomRef.current = true;
      setIsCreatingGameRoom(true);
      try {
          const ref = await addDoc(collection(db, 'game_rooms'), newRoom);
          setShowCreate(false);
          setRoomName('');
          openRoom({ id: ref.id, status: newRoom.status });
      } catch (error) {
          console.error(error);
          showToast(t('gameActionFailed'), 'error');
      } finally {
          isCreatingGameRoomRef.current = false;
          setIsCreatingGameRoom(false);
      }
  };
  
  const handleJoin = async (room) => {
       openRoom(room);
  };
  
      if (gameRoomsLoadError) {
          return (
            <div className="flex h-full min-h-[360px] animate-fade-in items-center justify-center px-4">
                <div role="alert" className="app-card flex max-w-md flex-col items-center gap-4 px-6 py-8 text-center">
                    <Gamepad2 className="h-10 w-10 text-m3-on-surface-variant/70" />
                    <p className="text-sm font-medium text-m3-on-surface-variant">{t('gameRoomsLoadFailed')}</p>
                    <button
                      type="button"
                      onClick={() => setGameRoomsReloadKey((current) => current + 1)}
                      className="app-button-quiet text-google-blue"
                    >
                        <RotateCcw className="h-4 w-4" />
                        {t('chatRetry')}
                    </button>
                </div>
            </div>
          );
      }

      if (currentActiveRoom) {
          if (currentActiveRoom.game === 'mine') {
              return <MinesweeperGame key={currentActiveRoom.id} user={user} room={currentActiveRoom} isStopped={isStopped} onLeave={closeRoom} t={t} />;
          }
          return <RPSGame key={currentActiveRoom.id} user={user} room={currentActiveRoom} projectId={project.id} isStopped={isStopped} onLeave={closeRoom} t={t} />;
      }
  
  const GAMES = [
      { id: 'rps', label: t('rockPaperScissors'), icon: Scissors, color: 'bg-google-blue' },
      { id: 'mine', label: t('minesweeper'), icon: Bomb, color: 'bg-google-red' }
  ];
  const difficultyLabels = {
      easy: t('difficultyEasy'),
      medium: t('difficultyMedium'),
      hard: t('difficultyHard'),
  };
  const gameHistoryResultLabels = {
      win: t('gameHistoryWin'),
      loss: t('gameHistoryLoss'),
      draw: t('gameHistoryDraw'),
  };

  return (
    <div className="flex h-full flex-col animate-fade-in">
       {/* Header */}
       <div className="mb-6 flex items-center justify-between">
           <div>
               <h1 className="text-3xl font-medium text-m3-on-surface">{t('gameHub')}</h1>
               <div className="mt-3 inline-flex rounded-full border border-m3-outline-variant/50 bg-m3-surface-container p-1">
                   <button
                     type="button"
                     aria-pressed={activeTab === 'lobby'}
                     onClick={() => setActiveTab('lobby')}
                     className={`min-h-10 rounded-full px-4 text-sm font-medium transition-colors ${activeTab === 'lobby' ? 'bg-m3-primary text-m3-on-primary' : 'text-m3-on-surface-variant hover:bg-m3-surface-container-high hover:text-m3-on-surface'}`}
                   >
                       {t('activeRooms')}
                   </button>
                   <button
                     type="button"
                     aria-pressed={activeTab === 'finished'}
                     onClick={() => setActiveTab('finished')}
                     className={`min-h-10 rounded-full px-4 text-sm font-medium transition-colors ${activeTab === 'finished' ? 'bg-m3-primary text-m3-on-primary' : 'text-m3-on-surface-variant hover:bg-m3-surface-container-high hover:text-m3-on-surface'}`}
                   >
                       {t('finishedRooms')}
                   </button>
               </div>
           </div>
           <button onClick={() => setShowCreate(!showCreate)} disabled={!canInteract} className="app-button-tonal">
               {showCreate ? <X className="w-5 h-5"/> : <Plus className="w-5 h-5"/>}
               {showCreate ? t('close') : t('createRoom')}
           </button>
       </div>

       <section className="app-card-quiet mb-6 p-4 sm:p-5">
           <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
               <div className="min-w-0">
                   <div className="mb-3 flex items-center gap-2">
                       <Trophy className="h-5 w-5 text-google-yellow" />
                       <h2 className="text-base font-medium text-m3-on-surface">{t('gameMyHistory')}</h2>
                   </div>
                   <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                       {[
                           [t('gameHistoryRecord', { count: userResultHistory.stats.total }), userResultHistory.stats.total],
                           [t('gameHistoryWins'), userResultHistory.stats.wins],
                           [t('gameHistoryLosses'), userResultHistory.stats.losses],
                           [t('gameHistoryDraws'), userResultHistory.stats.draws],
                       ].map(([label, value]) => (
                           <div key={label} className="rounded-xl border border-m3-outline-variant/30 bg-m3-surface-container/70 px-3 py-2">
                               <div className="text-lg font-semibold leading-tight text-m3-on-surface">{value}</div>
                               <div className="text-xs text-m3-on-surface-variant">{label}</div>
                           </div>
                       ))}
                   </div>
               </div>

               <div className="min-w-0 lg:w-[min(100%,26rem)]">
                   <div className="mb-2 text-xs font-medium uppercase tracking-wide text-m3-on-surface-variant">{t('gameHistoryRecent')}</div>
                   {userResultHistory.recent.length === 0 ? (
                       <div className="rounded-xl border border-dashed border-m3-outline-variant/40 px-3 py-4 text-sm text-m3-on-surface-variant">
                           {t('gameHistoryEmpty')}
                       </div>
                   ) : (
                       <div className="grid gap-2">
                           {userResultHistory.recent.map((entry) => {
                               return (
                                   <button
                                     type="button"
                                     key={entry.id}
                                     onClick={() => handleJoin(rooms.find((room) => room.id === entry.id) || { id: entry.id, status: 'finished' })}
                                     className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-m3-outline-variant/20 bg-m3-surface-container/50 px-3 py-2 text-left transition-colors hover:border-google-blue/30 hover:bg-m3-surface-container-high"
                                   >
                                       <div className="min-w-0">
                                           <div className="truncate text-sm font-medium text-m3-on-surface">{entry.roomName}</div>
                                           <div className="text-xs text-m3-on-surface-variant">{t('gameScoreLine', { score: entry.scoreLine || '-' })}</div>
                                       </div>
                                       <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                                           entry.result === 'win'
                                               ? 'bg-google-green/10 text-google-green'
                                               : entry.result === 'loss'
                                                   ? 'bg-google-red/10 text-google-red'
                                           : 'bg-m3-surface-container-high text-m3-on-surface-variant'
                                       }`}>
                                           {gameHistoryResultLabels[entry.result] || gameHistoryResultLabels.draw}
                                       </span>
                                   </button>
                               );
                           })}
                       </div>
                   )}
               </div>
           </div>
       </section>
       
       {showCreate && canInteract && (
           <div className="app-card mb-8 animate-slide-down p-5 sm:p-6">
               <h3 className="mb-6 text-xl font-medium">{t('startNewGame')}</h3>
               <form onSubmit={handleCreateRoom} className="space-y-6" aria-busy={isCreatingGameRoom}>
                   <div className="flex flex-col md:flex-row gap-6">
                       {/* Game Selection */}
                       <div className="flex-1">
                           <label className="app-label mb-3 uppercase tracking-wide">{t('selectGame')}</label>
                           <div className="grid grid-cols-2 gap-4">
                               {GAMES.map(g => (
                                   <button
                                      type="button"
                                      key={g.id} 
                                      onClick={() => setSelectedGame(g.id)}
                                      disabled={isCreatingGameRoom}
                                      className={`app-card flex min-h-[84px] cursor-pointer items-center gap-3 p-4 text-left disabled:cursor-not-allowed disabled:opacity-50 ${selectedGame === g.id ? 'border-google-blue bg-google-blue/5' : 'hover:bg-m3-surface'}`}
                                   >
                                       <div className={`p-2 rounded-full ${g.color} text-white`}>
                                           <g.icon className="w-5 h-5"/>
                                       </div>
                                       <span className="font-medium">{g.label}</span>
                                   </button>
                               ))}
                           </div>
                       </div>
                       
                       <div className="flex-1 space-y-4">
                           <div>
                               <label className="app-label uppercase tracking-wide">{t('roomName')}</label>
                               <input type="text" placeholder={t('roomNamePlaceholder')} value={roomName} onChange={e => setRoomName(e.target.value)} className="app-input" maxLength={PROJECT_CHILD_TEXT_MAX_LENGTH} disabled={isCreatingGameRoom} required />
                           </div>
                           
                           {/* Game Specific Config */}
                           {selectedGame === 'rps' && (
                               <>
                                       <div className="flex gap-4">
                                           <div className="flex-1">
                                           <label className="app-label">{t('bestOfRounds')}</label>
                                           <select value={bestOf} onChange={e => setBestOf(e.target.value)} className="app-input" disabled={isCreatingGameRoom}>
                                               <option value="1">1 ({t('suddenDeath')})</option>
                                               <option value="3">3</option>
                                               <option value="5">5</option>
                                           </select>
                                       </div>
                                       <div className="flex-1">
                                            <label className="app-label">{t('turnTimeout')}</label>
                                            <select value={timeoutSeconds} onChange={e => setTimeoutSeconds(e.target.value)} className="app-input" disabled={isCreatingGameRoom}>
                                               <option value="15">15s</option>
                                               <option value="30">30s</option>
                                               <option value="60">60s</option>
                                           </select>
                                       </div>
                                   </div>

                                   <button type="button" className="app-card mt-4 flex w-full cursor-pointer items-center gap-2 p-3 text-left disabled:cursor-not-allowed disabled:opacity-50" onClick={() => setVsComputer(!vsComputer)} disabled={isCreatingGameRoom}>
                                       <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${vsComputer ? 'bg-google-blue border-google-blue' : 'border-m3-outline'}`}>
                                           {vsComputer && <Check className="w-3.5 h-3.5 text-white"/>}
                                       </div>
                                       <span className="text-sm font-medium">{t('playVsComputer')}</span>
                                   </button>
                               </>
                           )}
                           
                               {selectedGame === 'mine' && (
                                   <div>
                                   <label className="app-label">{t('difficulty')}</label>
                                   <div className="flex gap-2">
                                       {['easy', 'medium', 'hard'].map(d => (
                                           <button 
                                              type="button" 
                                              key={d} 
                                              onClick={() => setMineDifficulty(d)}
                                              disabled={isCreatingGameRoom}
                                              className={`app-button flex-1 border text-sm capitalize ${mineDifficulty === d ? 'bg-m3-primary text-white border-transparent' : 'border-m3-outline hover:bg-m3-surface-container-high'}`}
                                           >
                                               {difficultyLabels[d]}
                                           </button>
                                       ))}
                                   </div>
                                    <div className="text-xs text-m3-on-surface-variant mt-2">
                                       {mineDifficulty === 'easy' && t('minesEasyDesc')}
                                       {mineDifficulty === 'medium' && t('minesMediumDesc')}
                                       {mineDifficulty === 'hard' && t('minesHardDesc')}
                                   </div>
                               </div>
                           )}
                       </div>
                   </div>
                   <div className="flex justify-end">
                       <button type="submit" disabled={isCreatingGameRoom} className="app-button-primary px-8">
                           {isCreatingGameRoom ? t('processing') : t('createRoom')}
                       </button>
                   </div>
               </form>
           </div>
       )}
       
           {manualRoomInviteUrl && (
               <div role="alert" className="app-card-quiet flex flex-col gap-3 border-google-blue/25 bg-google-blue/5 p-4 text-sm text-m3-on-surface-variant">
                   <div className="flex items-start justify-between gap-3">
                       <div>
                           <div className="font-medium text-m3-on-surface">{t('roomInviteManualCopy')}</div>
                           <p className="mt-1">{t('roomInviteManualCopyHint')}</p>
                       </div>
                       <button
                         type="button"
                         onClick={() => setManualRoomInviteUrl('')}
                         className="app-icon-button h-10 min-h-10 w-10 shrink-0"
                         title={t('close')}
                         aria-label={t('close')}
                       >
                           <X className="h-4 w-4" />
                       </button>
                   </div>
                   <input
                     readOnly
                     value={manualRoomInviteUrl}
                     onFocus={(event) => event.target.select()}
                     className="app-input font-mono text-xs"
                     aria-label={t('copyRoomInvite')}
                   />
               </div>
           )}

           {/* Rooms Grid */}
           <div className="workspace-grid">
               {visibleRooms.length === 0 ? (
                   <div className="app-card-quiet col-span-full py-20 text-center text-m3-on-surface-variant/60">
                       <Gamepad2 className="w-12 h-12 mx-auto mb-4 opacity-50"/>
                       {activeTab === 'finished' ? t('noFinishedRooms') : t('noActiveRooms')}
                   </div>
           ) : (
                  visibleRooms.map(room => {
                   const roomSummary = createGameRoomSummary(room) || {};
                   const isFinishedRoom = room.status === 'finished';
                   const roomCapacity = room.game === 'mine' ? 8 : 2;
                   const roomPlayerCount = Math.min(roomSummary.playerCount || 0, roomCapacity);
                   return (
                   <article key={room.id} className="app-card group relative w-full overflow-hidden p-5 hover:border-google-blue/30 hover:bg-m3-surface-container-high">
                       <button
                         type="button"
                         onClick={() => handleJoin(room)}
                         className="relative block w-full cursor-pointer text-left"
                       >
                           <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                               {room.game === 'mine' ? <Bomb className="w-24 h-24 rotate-12"/> : <Scissors className="w-24 h-24 -rotate-12"/> }
                           </div>
                           
                           <div className="relative">
                               <div className="mb-4 flex items-start justify-between pr-12">
                                   <div className={`p-2 rounded-xl text-white ${room.game === 'mine' ? 'bg-google-red' : 'bg-google-blue'}`}>
                                       {room.game === 'mine' ? <Bomb className="w-6 h-6"/> : <Scissors className="w-6 h-6"/>}
                                   </div>
                                   <div className="px-2 py-1 bg-m3-surface/50 rounded text-xs font-mono">
                                       {roomPlayerCount} / {roomCapacity}
                                   </div>
                               </div>

                               <h3 className="text-lg font-bold mb-1">{room.name}</h3>
                               <p className="text-sm text-m3-on-surface-variant mb-4 capitalize">
                                   {room.game === 'mine' ? `${difficultyLabels[room.config.difficulty] || room.config.difficulty}` : `${t('bestOf')} ${room.config.bestOf}`}
                               </p>

                               {isFinishedRoom && (
                                   <div className="mb-4 rounded-lg border border-google-yellow/25 bg-google-yellow/10 p-3">
                                       <div className="mb-2 flex items-center gap-2 text-sm font-medium text-m3-on-surface">
                                           <Trophy className="h-4 w-4 text-google-yellow" />
                                           {t('gameResult')}
                                       </div>
                                       <div className="grid gap-1 text-xs text-m3-on-surface-variant">
                                           <div>{t('gameWinner', { name: roomSummary.winnerName || t('draw') })}</div>
                                           <div>{t('gameScoreLine', { score: roomSummary.scoreLine || '-' })}</div>
                                           <div>{t('gameRoundsPlayed', { count: roomSummary.roundsPlayed || 0 })}</div>
                                           {roomSummary.lastRound && (
                                               <div>{t('gameLastRound', { round: roomSummary.lastRound.round })}</div>
                                           )}
                                       </div>
                                   </div>
                               )}

                               <div className="flex items-center gap-2 text-xs text-m3-on-surface-variant/70">
                                   <User className="w-3 h-3"/>
                                   <span>{t('createdBy')} {room.createdBy === user.uid ? t('you') : `${t('userLabel')} ${room.createdBy.slice(0,4)}`}</span>
                               </div>
                           </div>
                       </button>
                       <button
                         type="button"
                         onClick={() => copyRoomInvite(room)}
                         className="app-icon-button absolute right-4 top-4 z-10 bg-m3-surface-container/80 hover:bg-google-blue/10 hover:text-google-blue"
                         title={t('copyRoomInvite')}
                         aria-label={t('copyRoomInvite')}
                       >
                           <Share2 className="h-4 w-4" />
                       </button>
                   </article>
                   );
                  })
           )}
       </div>
    </div>
  );
}
