import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, limit, addDoc, onSnapshot, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Send } from './Icons'; 
import Avatar from './Avatar';
import { useUI } from './UIComponents';

export default function ChatRoom({ projectId, user, t }) {
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const dummyRef = useRef(null);
    const { showToast } = useUI();
    
    // Listen to messages
    useEffect(() => {
        if (!projectId) return;
        
        // Define ref for this project's chat
        const q = query(
            collection(db, 'project_chats'), 
            where('projectId', '==', projectId),
            orderBy('createdAt', 'asc'),
            limit(100) // Show last 100 messages
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setMessages(msgs);
            setTimeout(() => dummyRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        });

        return () => unsubscribe();
    }, [projectId]);

    const handleSend = async (e) => {
        e.preventDefault();
        if (!inputText.trim()) return;

        try {
            await addDoc(collection(db, 'project_chats'), {
                projectId,
                text: inputText.trim(),
                uid: user.uid,
                name: user.displayName || 'Anonymous',
                createdAt: Date.now()
            });
            setInputText('');
            // Scroll handled by snapshot listener
        } catch (error) {
            console.error("Error sending message:", error);
            showToast('Failed to send message', 'error');
        }
    };

    const formatTime = (ts) => {
        if (!ts) return '';
        const date = new Date(ts);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) + (!isToday ? ` ${date.toLocaleDateString()}` : '');
    };

    return (
        <div className="flex flex-col h-[500px] bg-m3-surface md:rounded-[24px] overflow-hidden border border-m3-outline-variant/20 shadow-elevation-1">
            {/* Header */}
            <div className="p-4 bg-m3-surface-container border-b border-m3-outline-variant/30 font-medium text-m3-on-surface">
                {t('chatRoom') || 'Chat Room'}
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-m3-surface/50">
                {messages.length === 0 && (
                    <div className="text-center text-m3-on-surface-variant text-sm mt-10 opacity-50">
                        {t('noMessagesYet') || 'No messages yet. Say hello!'}
                    </div>
                )}
                {messages.map((msg, idx) => {
                    const isMine = msg.uid === user.uid;
                    const showHeader = idx === 0 || messages[idx-1].uid !== msg.uid || (msg.createdAt - messages[idx-1].createdAt) > 300000; // 5 mins gap

                    return (
                        <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                            {showHeader && (
                                <div className={`flex items-center gap-2 mb-1 mt-2 text-xs text-m3-on-surface-variant ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                                    <span className="font-bold">{msg.name}</span>
                                    <span className="opacity-70 text-[10px]">{formatTime(msg.createdAt)}</span>
                                </div>
                            )}
                            <div className={`flex items-end gap-2 max-w-[80%] ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                                {!isMine && showHeader && <Avatar name={msg.name} size="sm" />}
                                {!isMine && !showHeader && <div className="w-8" />} {/* Spacer */}
                                
                                <div className={`px-4 py-2 rounded-2xl text-sm break-words ${
                                    isMine 
                                    ? 'bg-google-blue text-white rounded-br-none' 
                                    : 'bg-m3-surface-container-high text-m3-on-surface rounded-bl-none'
                                }`}>
                                    {msg.text}
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={dummyRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSend} className="p-3 bg-m3-surface-container flex items-center gap-2 border-t border-m3-outline-variant/30">
                <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={t('typeMessage') || 'Type a message...'}
                    className="flex-1 bg-m3-surface px-4 py-2.5 rounded-full border border-m3-outline-variant focus:border-google-blue focus:ring-1 focus:ring-google-blue outline-none transition-all text-sm"
                />
                <button 
                    type="submit" 
                    disabled={!inputText.trim()}
                    className="p-3 bg-google-blue text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-elevation-1 transition-all"
                >
                    <Send className="w-5 h-5" />
                </button>
            </form>
        </div>
    );
}
