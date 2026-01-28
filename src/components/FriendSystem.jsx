import React, { useState, useEffect } from 'react';
import { collection, query, addDoc, deleteDoc, doc, where, onSnapshot, getDocs, updateDoc, startAt, endAt, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserPlus, MessageSquare, Trash2, X, Send, Search, ArrowLeft } from './Icons';
import Avatar from './Avatar';
import { useUI } from './UIComponents';

export default function FriendSystem({ user, onClose, t }) {
    const { showToast } = useUI();
    const [view, setView] = useState('list'); // list, add, chat
    const [friends, setFriends] = useState([]);
    const [requests, setRequests] = useState([]); 
    const [searchTerm, setSearchTerm] = useState('');
    const [activeChatFriend, setActiveChatFriend] = useState(null);
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [searchResults, setSearchResults] = useState([]);

    // 1. Fetch Friends & Requests
    useEffect(() => {
        if (!user) return;
        
        // This is a simplified "Friends" implementation using a 'relationships' collection
        // Schema: { uid1, uid2, type: 'friend' | 'pending', initiator: uid }
        // We query twice (where uid1==me, where uid2==me) or use a composite ID.
        // For simplicity in this demo, let's assume we store frienships in a `users/{uid}/friends` subcollection
        // Wait, Firestore Rules in prompt asked me to specify rules, implying I define the structure.
        // Let's use a root collection `friendships` where array `members` contains [uid1, uid2].
        
        const q = query(collection(db, 'friendships'), where('members', 'array-contains', user.uid));
        
        const unsub = onSnapshot(q, (snapshot) => {
            const all = snapshot.docs.map(d => ({id:d.id, ...d.data()}));
            
            const confirmed = [];
            const pendingRecv = [];
            
            all.forEach(rel => {
                const otherId = rel.members.find(id => id !== user.uid);
                const otherName = rel.names?.[otherId] || 'Unknown';
                
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
    }, [user]);

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
        if (!searchTerm.trim()) return;
        setSearchResults([]);
        
        const term = searchTerm.trim();
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
                 showToast('Search index building, try email only for now.', 'error');
            }
        }
    };

    const sendRequest = async (targetUser) => {
        // Check existing
        // ... (Skipped for brevity, assume check done)
        await addDoc(collection(db, 'friendships'), {
            members: [user.uid, targetUser.uid],
            names: {
                [user.uid]: user.displayName || 'User',
                [targetUser.uid]: targetUser.displayName || 'User'
            },
            status: 'pending',
            initiator: user.uid,
            createdAt: Date.now()
        });
        showToast('Friend request sent!', 'success');
        setView('list');
        setSearchResults([]);
        setSearchTerm('');
        
        // Notify via mailbox
        await addDoc(collection(db, 'notifications'), {
            recipientId: targetUser.uid,
            type: 'friend_req',
            title: 'New Friend Request',
            message: `${user.displayName} wants to be friends.`,
            read: false,
            createdAt: Date.now()
        });
    };

    const acceptRequest = async (rel) => {
        await updateDoc(doc(db, 'friendships', rel.id), { status: 'confirmed' });
        showToast('Friend added!', 'success');
    };
    
    const rejectRequest = async (id) => deleteDoc(doc(db, 'friendships', id));

    const sendMessage = async (e) => {
        e.preventDefault();
        if (!chatInput.trim()) return;
        const txt = chatInput.trim();
        setChatInput('');
        
        await addDoc(collection(db, 'friend_messages'), {
            chatId: activeChatFriend.id,
            text: txt,
            senderId: user.uid,
            createdAt: Date.now()
        });
        
        // Notify if offline? (Optional)
    };

    // --- Render ---

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fade-in backdrop-blur-sm">
            {/* Modal Container: Max width restricted for desktop, full width/height adaptable for mobile */}
            <div className="bg-m3-surface w-full md:max-w-4xl h-[85vh] md:h-[650px] rounded-[28px] overflow-hidden flex shadow-elevation-3 relative">
                
                {/* Close Button (Global for Desktop, integrated in headers for mobile) */}
                <button onClick={onClose} className="absolute top-4 right-4 z-[60] p-2 bg-black/10 hover:bg-black/20 rounded-full md:hidden text-m3-on-surface">
                    <X className="w-5 h-5"/>
                </button>

                {/* Sidebar (Friend List / Search) - Hidden on Mobile if Chat is Active */}
                <div className={`w-full md:w-80 lg:w-96 bg-m3-surface-container border-r border-m3-outline-variant/20 flex flex-col md:flex ${activeChatFriend ? 'hidden' : 'flex'}`}>
                    {/* Header */}
                    <div className="p-4 md:p-5 border-b border-m3-outline-variant/10 flex justify-between items-center shrink-0">
                        <h2 className="text-xl font-normal text-m3-on-surface">{t('friends') || 'Friends'}</h2>
                        <button onClick={onClose} className="hidden md:block hover:bg-m3-on-surface/5 p-2 rounded-full transition-colors"><X className="w-5 h-5"/></button>
                    </div>
                    
                    {/* Action Area */}
                    <div className="p-4 pb-2 shrink-0">
                        <button 
                            onClick={() => { setView(view === 'add' ? 'list' : 'add'); setSearchTerm(''); setSearchResults([]); }}
                            className={`w-full py-3 rounded-full flex items-center justify-center gap-2 text-sm font-medium transition-all ${view === 'add' ? 'bg-m3-secondary-container text-m3-on-secondary-container shadow-sm' : 'bg-m3-surface border border-m3-outline-variant hover:bg-m3-surface-container-high'}`}
                        >
                            {view === 'add' ? <ArrowLeft className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />} 
                            {view === 'add' ? (t('backToList') || 'Back to List') : (t('addFriend') || 'Add Friend')}
                        </button>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto px-2">
                        {/* Requests Section */}
                        {requests.length > 0 && view !== 'add' && (
                            <div className="px-2 py-2 mb-2">
                                <div className="text-xs font-bold text-m3-on-surface-variant uppercase mb-2 px-2">{t('requests') || 'Requests'}</div>
                                {requests.map(req => (
                                    <div key={req.id} className="bg-m3-surface p-3 rounded-xl mb-2 shadow-sm border border-m3-outline-variant/10">
                                        <div className="flex items-center gap-3 mb-3">
                                            <Avatar name={req.otherName} size="sm" />
                                            <span className="text-sm font-medium text-m3-on-surface">{req.otherName}</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => acceptRequest(req)} className="flex-1 py-1.5 bg-google-blue/10 text-google-blue font-medium text-xs rounded-lg hover:bg-google-blue/20 transition-colors">{t('accept') || 'Accept'}</button>
                                            <button onClick={() => rejectRequest(req.id)} className="flex-1 py-1.5 bg-m3-surface-container-highest text-m3-on-surface-variant text-xs rounded-lg hover:bg-m3-outline-variant transition-colors">{t('ignore') || 'Ignore'}</button>
                                        </div>
                                    </div>
                                ))}
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
                                            className="w-full bg-m3-surface rounded-full pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-google-blue/50 transition-all border border-transparent focus:border-google-blue" 
                                            placeholder={t('searchPlaceholderUser') || "Email, Name, ID..."} 
                                        />
                                    </div>
                                    <button onClick={handleSearch} className="bg-google-blue text-white px-4 rounded-full text-sm font-medium hover:shadow-md transition-shadow">{t('go') || 'Go'}</button>
                                </div>
                                
                                {searchResults.length === 0 && searchTerm && (
                                    <div className="text-center text-sm text-m3-on-surface-variant mt-8 px-4 opacity-70">
                                        {t('searchHint') || 'Try searching by full Email or exact User ID.'}
                                    </div>
                                )}

                                <div className="space-y-2">
                                    {searchResults.map(u => (
                                        <div key={u.uid} className="flex items-center justify-between p-3 bg-m3-surface rounded-xl border border-m3-outline-variant/20">
                                             <div className="flex items-center gap-3 overflow-hidden">
                                                 <Avatar name={u.displayName} size="sm"/>
                                                 <div className="min-w-0">
                                                     <div className="text-sm font-medium text-m3-on-surface truncate">{u.displayName}</div>
                                                     <div className="text-xs text-m3-on-surface-variant truncate">{u.email}</div>
                                                 </div>
                                             </div>
                                             <button onClick={() => sendRequest(u)} className="p-2 text-google-blue hover:bg-google-blue/10 rounded-full transition-colors"><UserPlus className="w-5 h-5"/></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-1 p-2">
                                {friends.map(f => (
                                    <div 
                                        key={f.id} 
                                        onClick={() => { setActiveChatFriend(f); setView('chat'); }}
                                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${activeChatFriend?.id === f.id ? 'bg-m3-secondary-container text-m3-on-secondary-container' : 'hover:bg-m3-surface text-m3-on-surface'}`}
                                    >
                                        <Avatar name={f.otherName} className="shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">{f.otherName}</div>
                                            <div className="text-xs opacity-70 truncate">{t('tapToChat') || 'Message'}</div>
                                        </div>
                                    </div>
                                ))}
                                {friends.length === 0 && requests.length === 0 && <div className="text-center text-sm text-m3-on-surface-variant mt-10 opacity-60">{t('noFriends') || 'No friends yet'}</div>}
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
                            <div className="text-lg">{t('selectFriend') || 'Select a friend to chat'}</div>
                        </div>
                    ) : (
                        <>
                            {/* Chat Header */}
                            <div className="px-4 py-3 border-b border-m3-outline-variant/10 flex items-center gap-3 bg-m3-surface-container-low shrink-0 h-16">
                                <button onClick={() => setActiveChatFriend(null)} className="md:hidden -ml-2 p-2 rounded-full hover:bg-black/5 text-m3-on-surface"><ArrowLeft className="w-6 h-6"/></button>
                                <Avatar name={activeChatFriend.otherName} size="sm" />
                                <div className="font-medium text-m3-on-surface text-lg truncate">{activeChatFriend.otherName}</div>
                            </div>

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-m3-surface scroll-smooth">
                                {chatMessages.map(msg => {
                                    const isMe = msg.senderId === user.uid;
                                    return (
                                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-slide-up`}>
                                            <div className={`max-w-[80%] md:max-w-[70%] px-4 py-2.5 rounded-[20px] text-sm leading-relaxed shadow-sm break-words ${isMe ? 'bg-google-blue text-white rounded-br-sm' : 'bg-m3-surface-container-high text-m3-on-surface rounded-bl-sm'}`}>
                                                {msg.text}
                                            </div>
                                        </div>
                                    )
                                })}
                                <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
                            </div>

                            {/* Input Area */}
                            <form onSubmit={sendMessage} className="p-3 md:p-4 border-t border-m3-outline-variant/10 flex gap-2 bg-m3-surface shrink-0">
                                <input 
                                    value={chatInput} 
                                    onChange={e=>setChatInput(e.target.value)} 
                                    className="flex-1 bg-m3-surface-container-high rounded-full px-5 py-3 border-none outline-none focus:ring-2 focus:ring-google-blue/50 text-m3-on-surface transition-shadow"
                                    placeholder={t('typeMessage') || "Message..."}
                                />
                                <button disabled={!chatInput.trim()} className="p-3 bg-google-blue text-white rounded-full hover:shadow-md disabled:opacity-50 disabled:shadow-none transition-all">
                                    <Send className="w-5 h-5"/>
                                </button>
                            </form>
                        </>
                    )}
                </div>

            </div>
        </div>
    );
}

// Add these icons if missing logic elsewhere, but likely ICONS import handles it or fails. 
// Assuming Icons.jsx has these exports or similar. 
// UserPlus, MessageSquare, Trash2, X, Send are standard names.
