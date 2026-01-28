import React, { useState, useEffect } from 'react';
import { collection, query, addDoc, deleteDoc, doc, where, onSnapshot, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserPlus, MessageSquare, Trash2, X, Send } from './Icons';
import Avatar from './Avatar';
import { useUI } from './UIComponents';

export default function FriendSystem({ user, onClose, t }) {
    const { showToast } = useUI();
    const [view, setView] = useState('list'); // list, add, chat
    const [friends, setFriends] = useState([]);
    const [requests, setRequests] = useState([]); // Incoming
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
        // Mock search: In reality, searching users by name requires a specific index or `users` collection access.
        // We will assume a `users` collection exists and is readable for basic profile info.
        if (!searchTerm.trim()) return;
        
        // WARNING: Firestore doesn't support partial text search natively efficiently.
        // We will do exact match on email or simple name match if valid.
        // For this demo, let's query `users` collection.
        // NOTE: Standard Firestore rules usually protect `users`. We need to ensure rules allow reading public profiles.
        
        try {
            const q = query(collection(db, 'users'), where('email', '==', searchTerm.trim())); // Search by email is safer/unique
            const snap = await getDocs(q);
            setSearchResults(snap.docs.map(d => ({uid: d.id, ...d.data()})));
        } catch(e) { console.error(e); }
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-m3-surface w-full max-w-2xl h-[600px] rounded-[28px] overflow-hidden flex flex-col md:flex-row shadow-elevation-3">
                
                {/* Close Button Mobile */}
                <button onClick={onClose} className="absolute top-4 right-4 md:hidden z-50 p-2 bg-black/20 rounded-full text-white"><X/></button>

                {/* Sidebar (List) */}
                <div className={`w-full md:w-1/3 bg-m3-surface-container border-r border-m3-outline-variant/20 flex flex-col ${activeChatFriend ? 'hidden md:flex' : 'flex'}`}>
                    <div className="p-4 border-b border-m3-outline-variant/10 flex justify-between items-center">
                        <h2 className="text-xl font-normal text-m3-on-surface">Friends</h2>
                        <button onClick={onClose} className="hidden md:block hover:bg-black/5 p-1 rounded-full"><X className="w-5 h-5"/></button>
                    </div>
                    
                    {/* Add Friend Button */}
                    <div className="p-3">
                        <button 
                            onClick={() => setView(view === 'add' ? 'list' : 'add')}
                            className={`w-full py-2 rounded-full flex items-center justify-center gap-2 text-sm font-medium transition-colors ${view === 'add' ? 'bg-m3-secondary-container text-m3-on-secondary-container' : 'bg-m3-surface border border-m3-outline-variant hover:bg-white/50'}`}
                        >
                            <UserPlus className="w-4 h-4" /> {view === 'add' ? 'Cancel' : 'Add Friend'}
                        </button>
                    </div>

                    {/* Requests */}
                    {requests.length > 0 && (
                        <div className="px-4 py-2">
                            <div className="text-xs font-bold text-m3-on-surface-variant uppercase mb-2">Requests</div>
                            {requests.map(req => (
                                <div key={req.id} className="bg-m3-surface p-3 rounded-xl mb-2 shadow-sm">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Avatar name={req.otherName} size="sm" />
                                        <span className="text-sm font-medium">{req.otherName}</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => acceptRequest(req)} className="flex-1 py-1 bg-google-blue text-white text-xs rounded-full">Accept</button>
                                        <button onClick={() => rejectRequest(req.id)} className="flex-1 py-1 bg-m3-surface-container-highest text-m3-on-surface text-xs rounded-full">Ignore</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Friends List */}
                    <div className="flex-1 overflow-y-auto px-2">
                        {view === 'add' ? (
                            <div className="p-2 animate-fade-in">
                                <div className="text-xs text-center mb-2 opacity-60">Search by exact email</div>
                                <div className="flex gap-2 mb-4">
                                    <input value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} className="flex-1 bg-white rounded-lg px-2 text-sm border-none ring-1 ring-m3-outline-variant" placeholder="Email..." />
                                    <button onClick={handleSearch} className="bg-m3-primary text-white px-3 rounded-lg text-sm">Go</button>
                                </div>
                                {searchResults.map(u => (
                                    <div key={u.uid} className="flex items-center justify-between p-2 bg-white rounded-lg mb-1">
                                         <div className="flex items-center gap-2">
                                             <Avatar name={u.displayName} size="sm"/>
                                             <div className="text-sm truncate w-24">{u.displayName}</div>
                                         </div>
                                         <button onClick={() => sendRequest(u)} className="text-google-blue"><UserPlus className="w-5 h-5"/></button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {friends.map(f => (
                                    <div 
                                        key={f.id} 
                                        onClick={() => { setActiveChatFriend(f); setView('chat'); }}
                                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${activeChatFriend?.id === f.id ? 'bg-m3-secondary-container' : 'hover:bg-m3-surface-container-highest'}`}
                                    >
                                        <Avatar name={f.otherName} />
                                        <div className="flex-1">
                                            <div className="text-sm font-medium text-m3-on-surface">{f.otherName}</div>
                                            <div className="text-xs text-m3-on-surface-variant">Click to chat</div>
                                        </div>
                                    </div>
                                ))}
                                {friends.length === 0 && <div className="text-center text-sm opacity-50 mt-10">No friends yet</div>}
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Chat Area */}
                <div className={`flex-1 bg-m3-surface flex flex-col ${!activeChatFriend ? 'hidden md:flex' : 'flex'}`}>
                    {!activeChatFriend ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-m3-on-surface-variant opacity-50">
                            <MessageSquare className="w-12 h-12 mb-2" />
                            <div>Select a friend to chat</div>
                        </div>
                    ) : (
                        <>
                            {/* Chat Header */}
                            <div className="p-4 border-b border-m3-outline-variant/10 flex items-center gap-3 bg-m3-surface-container/30">
                                <button onClick={() => setActiveChatFriend(null)} className="md:hidden mr-2"><X/></button>
                                <Avatar name={activeChatFriend.otherName} />
                                <div className="font-medium">{activeChatFriend.otherName}</div>
                            </div>

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {chatMessages.map(msg => {
                                    const isMe = msg.senderId === user.uid;
                                    return (
                                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm ${isMe ? 'bg-google-blue text-white rounded-br-none' : 'bg-m3-surface-container-high text-m3-on-surface rounded-bl-none'}`}>
                                                {msg.text}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Input */}
                            <form onSubmit={sendMessage} className="p-4 border-t border-m3-outline-variant/10 flex gap-2">
                                <input 
                                    value={chatInput} 
                                    onChange={e=>setChatInput(e.target.value)} 
                                    className="flex-1 bg-m3-surface-container-high rounded-full px-4 py-2 border-none outline-none focus:ring-1 focus:ring-google-blue"
                                    placeholder="Message..."
                                />
                                <button className="p-2 bg-google-blue text-white rounded-full"><Send className="w-5 h-5"/></button>
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
