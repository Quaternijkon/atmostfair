import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { collection, query, addDoc, deleteDoc, doc, where, onSnapshot, getDocs, updateDoc, startAt, endAt, orderBy, db } from '../lib/localData';
import { UserPlus, MessageSquare, Trash2, X, Send, Search, ArrowLeft } from './Icons';
import Avatar from './Avatar';
import { useUI } from './UIContext';
import { createFriendAcceptPatch, createFriendMessageData, createFriendRequestData, getRejectableFriendRequestId } from '../lib/friendDomain';
import { MESSAGE_TEXT_MAX_LENGTH } from '../lib/messageDomain';
import { nowMs } from '../lib/time';

export default function FriendSystem({ user, onClose, t }) {
    const { showToast } = useUI();
    const [view, setView] = useState('list'); // list, add, chat
    const [relationships, setRelationships] = useState([]);
    const [friends, setFriends] = useState([]);
    const [requests, setRequests] = useState([]); 
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearchingFriends, setIsSearchingFriends] = useState(false);
    const [activeChatFriend, setActiveChatFriend] = useState(null);
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [isSendingFriendMessage, setIsSendingFriendMessage] = useState(false);
    const isSendingFriendMessageRef = useRef(false);
    const isSearchingFriendsRef = useRef(false);
    const [pendingFriendActionIds, setPendingFriendActionIds] = useState(() => new Set());
    const pendingFriendActionIdsRef = useRef(new Set());
    const [searchResults, setSearchResults] = useState([]);
    const currentUserName = () => user.displayName || user.email?.split('@')[0] || t('userLabel');
    const isFriendActionPending = (actionId) => pendingFriendActionIds.has(actionId);

    const runFriendAction = async (actionId, action) => {
        if (!actionId || pendingFriendActionIdsRef.current.has(actionId)) return false;

        pendingFriendActionIdsRef.current = new Set(pendingFriendActionIdsRef.current).add(actionId);
        setPendingFriendActionIds(new Set(pendingFriendActionIdsRef.current));

        try {
            await action();
            return true;
        } catch (error) {
            console.error(error);
            showToast(t('friendActionFailed'), 'error');
            return false;
        } finally {
            const nextPendingIds = new Set(pendingFriendActionIdsRef.current);
            nextPendingIds.delete(actionId);
            pendingFriendActionIdsRef.current = nextPendingIds;
            setPendingFriendActionIds(new Set(pendingFriendActionIdsRef.current));
        }
    };

    // 1. Fetch Friends & Requests
    useEffect(() => {
        if (!user) return;
        
        // This is a simplified "Friends" implementation using a 'relationships' collection
        // Schema: { uid1, uid2, type: 'friend' | 'pending', initiator: uid }
        // We query twice (where uid1==me, where uid2==me) or use a composite ID.
        // For simplicity in this demo, let's assume we store frienships in a `users/{uid}/friends` subcollection
        // Use a root collection `friendships` where array `members` contains [uid1, uid2].
        
        const q = query(collection(db, 'friendships'), where('members', 'array-contains', user.uid));
        
        const unsub = onSnapshot(q, (snapshot) => {
            const all = snapshot.docs.map(d => ({id:d.id, ...d.data()}));
            setRelationships(all);
            
            const confirmed = [];
            const pendingRecv = [];
            
            all.forEach(rel => {
                const otherId = rel.members.find(id => id !== user.uid);
                const otherName = rel.names?.[otherId] || t('unknownUser');
                
                if (rel.status === 'confirmed') {
                    confirmed.push({ ...rel, otherId, otherName });
                } else if (rel.status === 'pending' && rel.initiator !== user.uid) {
                    pendingRecv.push({ ...rel, otherId, otherName });
                }
            });
            
            setFriends(confirmed);
            setRequests(pendingRecv);
        });
        
        return () => unsub();
    }, [t, user]);

    // 2. Chat Listener
    useEffect(() => {
        if (!activeChatFriend) return;
        
        // Chat stored in `friend_messages` collection
        const chatId = activeChatFriend.id; // Friendship ID as Chat ID
        const q = query(
            collection(db, 'friend_messages'),
            where('chatId', '==', chatId)
            // Order by handled in memory or composite index needed. For MVP, sort in mem.
        );
        
        const unsub = onSnapshot(q, (snap) => {
            const msgs = snap.docs.map(d => ({id:d.id, ...d.data()})).sort((a,b) => a.createdAt - b.createdAt);
            setChatMessages(msgs);
        });

        return () => unsub();
    }, [activeChatFriend]);

    const handleSearch = async () => {
        const term = searchTerm.trim();
        if (!term) return;
        if (isSearchingFriendsRef.current) return;

        isSearchingFriendsRef.current = true;
        setIsSearchingFriends(true);
        setSearchResults([]);

        const usersRef = collection(db, 'users');
        const results = new Map(); // Use Map to deduplicate by UID

        try {
            // 1. Exact Email Match
            const qEmail = query(usersRef, where('email', '==', term));
            const snapEmail = await getDocs(qEmail);
            snapEmail.forEach(d => results.set(d.id, {uid: d.id, ...d.data()}));

            // 2. Exact UID Match (if term looks like an ID)
            if (term.length > 20) {
                 // Try to fetch doc directly? Or just query. 
                 // Since we don't know if term is ID, let's just query field 'uid' if it exists or document ID.
                 // Actually `where('uid', '==', term)` is safer if we duplicate uid in doc.
                 const qUid = query(usersRef, where('uid', '==', term));
                 const snapUid = await getDocs(qUid);
                 snapUid.forEach(d => results.set(d.id, {uid: d.id, ...d.data()}));
            }

            // 3. Prefix Match on Display Name
            // Note: This requires an index on `displayName`
            const qName = query(usersRef, 
                orderBy('displayName'), 
                startAt(term), 
                endAt(term + '\uf8ff')
            );
            const snapName = await getDocs(qName);
            snapName.forEach(d => results.set(d.id, {uid: d.id, ...d.data()}));

            // Filter out self
            results.delete(user.uid);

            setSearchResults(Array.from(results.values()));
        } catch(e) { 
            console.error(e); 
            // Fallback if index missing for name search
            if (e.code === 'failed-precondition') {
                 showToast(t('friendSearchIndexPending'), 'error');
            } else {
                 showToast(t('friendSearchFailed'), 'error');
            }
        } finally {
            isSearchingFriendsRef.current = false;
            setIsSearchingFriends(false);
        }
    };

    const sendRequest = async (targetUser) => runFriendAction(`request:${targetUser.uid}`, async () => {
        const requestData = createFriendRequestData(relationships, user, targetUser, nowMs());
        if (!requestData) {
            showToast(t('friendRequestUnavailable'), 'info');
            return;
        }

        await addDoc(collection(db, 'friendships'), requestData);
        showToast(t('friendRequestSent'), 'success');
        setView('list');
        setSearchResults([]);
        setSearchTerm('');
        
        // Notify via mailbox
        try {
            await addDoc(collection(db, 'notifications'), {
                recipientId: targetUser.uid,
                type: 'friend_req',
                title: t('friendRequestTitle'),
                message: t('friendRequestMessage', { name: user.displayName || t('userLabel') }),
                read: false,
                createdAt: nowMs()
            });
        } catch (error) {
            console.error(error);
        }
    });

    const acceptRequest = async (rel) => runFriendAction(`accept:${rel.id}`, async () => {
        const acceptPatch = createFriendAcceptPatch(rel, user);
        if (!acceptPatch) {
            showToast(t('friendActionUnavailable'), 'info');
            return;
        }
        await updateDoc(doc(db, 'friendships', rel.id), acceptPatch);
        showToast(t('friendAdded'), 'success');
    });
    
    const rejectRequest = async (rel) => runFriendAction(`reject:${rel.id}`, async () => {
        const rejectableId = getRejectableFriendRequestId(rel, user);
        if (!rejectableId) {
            showToast(t('friendActionUnavailable'), 'info');
            return;
        }
        await deleteDoc(doc(db, 'friendships', rejectableId));
    });

    const sendMessage = async (e) => {
        e.preventDefault();
        if (isSendingFriendMessageRef.current) return;

        const messageData = createFriendMessageData(relationships, activeChatFriend, user, chatInput, nowMs());
        if (!messageData) {
            showToast(t('friendActionUnavailable'), 'info');
            return;
        }

        isSendingFriendMessageRef.current = true;
        setIsSendingFriendMessage(true);
        try {
            await addDoc(collection(db, 'friend_messages'), messageData);
            await addDoc(collection(db, 'notifications'), {
                recipientId: activeChatFriend.otherId,
                type: 'friend_message',
                title: t('friendMessageTitle', { name: currentUserName() }),
                message: messageData.text,
                chatId: messageData.chatId,
                read: false,
                createdAt: nowMs()
            });
            setChatInput('');
        } catch (error) {
            console.error(error);
            showToast(t('messageSendFailed'), 'error');
        } finally {
            isSendingFriendMessageRef.current = false;
            setIsSendingFriendMessage(false);
        }
    };

    // --- Render ---

    return (
        <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
        >
            {/* Modal Container: Max width restricted for desktop, full width/height adaptable for mobile */}
            <motion.div 
                initial={{ scale: 0.95, opacity: 0, y: 30 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 30 }}
                transition={{ type: "spring", damping: 25, stiffness: 350 }}
                onClick={(e) => e.stopPropagation()}
                className="app-dialog relative flex h-[85vh] w-full max-w-4xl overflow-hidden p-0 md:h-[650px]"
            >
                
                {/* Close Button (Global for Desktop, integrated in headers for mobile) */}
                <button onClick={onClose} className="app-icon-button absolute right-4 top-4 z-[60] bg-black/10 md:hidden">
                    <X className="w-5 h-5"/>
                </button>

                {/* Sidebar (Friend List / Search) - Hidden on Mobile if Chat is Active */}
                <div className={`w-full md:w-80 lg:w-96 bg-m3-surface-container border-r border-m3-outline-variant/20 flex flex-col md:flex ${activeChatFriend ? 'hidden' : 'flex'}`}>
                    {/* Header */}
                    <div className="flex shrink-0 items-center justify-between border-b border-m3-outline-variant/10 p-4 md:p-5">
                        <h2 className="text-xl font-medium text-m3-on-surface">{t('friends')}</h2>
                        <button onClick={onClose} className="app-icon-button hidden md:inline-flex"><X className="w-5 h-5"/></button>
                    </div>
                    
                    {/* Action Area */}
                    <div className="p-4 pb-2 shrink-0">
                        <button 
                            onClick={() => { setView(view === 'add' ? 'list' : 'add'); setSearchTerm(''); setSearchResults([]); }}
                            className={`app-button w-full ${view === 'add' ? 'bg-m3-secondary-container text-m3-on-secondary-container shadow-sm' : 'border border-m3-outline-variant bg-m3-surface hover:bg-m3-surface-container-high'}`}
                        >
                            {view === 'add' ? <ArrowLeft className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />} 
                            {view === 'add' ? t('backToList') : t('addFriend')}
                        </button>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto px-2">
                        {/* Requests Section */}
                        {requests.length > 0 && view !== 'add' && (
                            <div className="px-2 py-2 mb-2">
                                <div className="text-xs font-bold text-m3-on-surface-variant uppercase mb-2 px-2">{t('requests')}</div>
                                {requests.map(req => {
                                    const isAcceptingRequest = isFriendActionPending(`accept:${req.id}`);
                                    const isRejectingRequest = isFriendActionPending(`reject:${req.id}`);

                                    return (
                                        <div key={req.id} className="app-card mb-2 p-3">
                                            <div className="flex items-center gap-3 mb-3">
                                                <Avatar name={req.otherName} size="sm" />
                                                <span className="text-sm font-medium text-m3-on-surface">{req.otherName}</span>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => acceptRequest(req)} disabled={isAcceptingRequest || isRejectingRequest} aria-busy={isAcceptingRequest} className="app-button flex-1 bg-google-blue/10 px-3 text-xs text-google-blue hover:bg-google-blue/20">{isAcceptingRequest ? t('processing') : t('accept')}</button>
                                                <button onClick={() => rejectRequest(req)} disabled={isAcceptingRequest || isRejectingRequest} aria-busy={isRejectingRequest} className="app-button flex-1 bg-m3-surface-container-highest px-3 text-xs text-m3-on-surface-variant hover:bg-m3-outline-variant">{isRejectingRequest ? t('processing') : t('ignore')}</button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {view === 'add' ? (
                            <div className="p-2 animate-fade-in">
                                <div className="flex gap-2 mb-4">
                                    <div className="flex-1 relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-m3-on-surface-variant" />
                                        <input
                                            value={searchTerm}
                                            onChange={e=>setSearchTerm(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                            className="app-input rounded-full pl-9"
                                            placeholder={t('searchPlaceholderUser')}
                                            disabled={isSearchingFriends}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleSearch}
                                        disabled={!searchTerm.trim() || isSearchingFriends}
                                        aria-busy={isSearchingFriends}
                                        className="app-button-primary px-4"
                                    >
                                        {isSearchingFriends ? t('processing') : t('go')}
                                    </button>
                                </div>

                                {searchResults.length === 0 && searchTerm && (
                                    <div className="text-center text-sm text-m3-on-surface-variant mt-8 px-4 opacity-70">
                                        {t('searchHint')}
                                    </div>
                                )}

                                <div className="space-y-2">
                                    {searchResults.map(u => {
                                        const isRequestingFriend = isFriendActionPending(`request:${u.uid}`);

                                        return (
                                            <div key={u.uid} className="app-card flex items-center justify-between p-3">
                                                 <div className="flex items-center gap-3 overflow-hidden">
                                                     <Avatar name={u.displayName} size="sm"/>
                                                     <div className="min-w-0">
                                                         <div className="text-sm font-medium text-m3-on-surface truncate">{u.displayName}</div>
                                                         <div className="text-xs text-m3-on-surface-variant truncate">{u.email}</div>
                                                     </div>
                                                 </div>
                                                 <button onClick={() => sendRequest(u)} disabled={isRequestingFriend} aria-busy={isRequestingFriend} className={`app-icon-button text-google-blue hover:bg-google-blue/10 ${isRequestingFriend ? 'w-auto px-3 text-xs' : ''}`}>{isRequestingFriend ? t('processing') : <UserPlus className="w-5 h-5"/>}</button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-1 p-2">
                                {friends.map(f => (
                                    <button
                                        type="button"
                                        key={f.id} 
                                        onClick={() => { setActiveChatFriend(f); setView('chat'); }}
                                        className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl p-3 text-left transition-all ${activeChatFriend?.id === f.id ? 'bg-m3-secondary-container text-m3-on-secondary-container' : 'text-m3-on-surface hover:bg-m3-surface'}`}
                                    >
                                        <Avatar name={f.otherName} className="shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">{f.otherName}</div>
                                            <div className="text-xs opacity-70 truncate">{t('tapToChat')}</div>
                                        </div>
                                    </button>
                                ))}
                                {friends.length === 0 && requests.length === 0 && (
                                    <div className="app-card-quiet mt-8 flex flex-col items-center gap-3 p-6 text-center text-sm text-m3-on-surface-variant">
                                        <UserPlus className="h-8 w-8 text-google-blue" />
                                        <span>{t('noFriends')}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Chat Area - Full Screen on Mobile if Active */}
                <div className={`flex-1 bg-m3-surface flex flex-col w-full absolute md:relative inset-0 z-20 md:z-auto transition-transform duration-300 ${activeChatFriend ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}`}>
                    {!activeChatFriend ? (
                        <div className="flex-1 hidden md:flex flex-col items-center justify-center text-m3-on-surface-variant opacity-30 select-none">
                            <div className="w-24 h-24 bg-m3-surface-container rounded-full flex items-center justify-center mb-4">
                                <MessageSquare className="w-10 h-10" />
                            </div>
                            <div className="text-lg">{t('selectFriend')}</div>
                        </div>
                    ) : (
                        <>
                            {/* Chat Header */}
                            <div className="px-4 py-3 border-b border-m3-outline-variant/10 flex items-center gap-3 bg-m3-surface-container-low shrink-0 h-16">
                                <button onClick={() => setActiveChatFriend(null)} className="app-icon-button -ml-2 text-m3-on-surface md:hidden"><ArrowLeft className="w-6 h-6"/></button>
                                <Avatar name={activeChatFriend.otherName} size="sm" />
                                <div className="font-medium text-m3-on-surface text-lg truncate">{activeChatFriend.otherName}</div>
                            </div>

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-m3-surface scroll-smooth">
                                {chatMessages.map(msg => {
                                    const isMe = msg.senderId === user.uid;
                                    return (
                                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-slide-up`}>
                                            <div className={`max-w-[80%] break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm md:max-w-[70%] ${isMe ? 'rounded-br-sm bg-google-blue text-white' : 'rounded-bl-sm bg-m3-surface-container-high text-m3-on-surface'}`}>
                                                {msg.text}
                                            </div>
                                        </div>
                                    )
                                })}
                                <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
                            </div>

                            {/* Input Area */}
                            <form onSubmit={sendMessage} className="p-3 md:p-4 border-t border-m3-outline-variant/10 flex gap-2 bg-m3-surface shrink-0" aria-busy={isSendingFriendMessage}>
                                <input 
                                    value={chatInput} 
                                    onChange={e=>setChatInput(e.target.value)} 
                                    className="app-input flex-1 rounded-full"
                                    placeholder={t('typeMessage')}
                                    maxLength={MESSAGE_TEXT_MAX_LENGTH}
                                    disabled={isSendingFriendMessage}
                                />
                                <button disabled={isSendingFriendMessage || !chatInput.trim()} className={`app-icon-button border-transparent bg-google-blue text-white hover:bg-google-blue hover:text-white hover:shadow-elevation-1 ${isSendingFriendMessage ? 'w-auto px-3 text-xs' : ''}`}>
                                    {isSendingFriendMessage ? t('processing') : <Send className="w-5 h-5"/>}
                                </button>
                            </form>
                        </>
                    )}
                </div>

            </motion.div>
        </motion.div>
    );
}

// Add these icons if missing logic elsewhere, but likely ICONS import handles it or fails. 
// Assuming Icons.jsx has these exports or similar. 
// UserPlus, MessageSquare, Trash2, X, Send are standard names.
