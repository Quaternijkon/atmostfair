import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, limit, addDoc, onSnapshot, where, db } from '../lib/localData';
import { formatDate, formatTime as formatLocaleTime } from '../lib/locale';
import { RotateCcw, Send } from './Icons';
import Avatar from './Avatar';
import { useUI } from './UIContext';
import { nowMs } from '../lib/time';
import { MESSAGE_TEXT_MAX_LENGTH } from '../lib/messageDomain';

export default function ChatRoom({ projectId, user, currentUser, isStopped = false, t }) {
    const activeUser = user || currentUser;
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const [chatLoadError, setChatLoadError] = useState(false);
    const [chatReloadKey, setChatReloadKey] = useState(0);
    const dummyRef = useRef(null);
    const isSendingMessageRef = useRef(false);
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
            setChatLoadError(false);
            setMessages(msgs);
            setTimeout(() => dummyRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }, (error) => {
            console.error("Error loading messages:", error);
            setChatLoadError(true);
        });

        return () => unsubscribe();
    }, [projectId, chatReloadKey]);

    const handleSend = async (e) => {
        e.preventDefault();
        if (isStopped || !inputText.trim()) return;
        if (isSendingMessageRef.current) return;

        const messageText = inputText.trim();
        isSendingMessageRef.current = true;
        setIsSendingMessage(true);
        try {
            await addDoc(collection(db, 'project_chats'), {
                projectId,
                text: messageText,
                uid: activeUser.uid,
                name: activeUser.displayName || t('anonymousUser'),
                createdAt: nowMs()
            });
            setInputText('');
            // Scroll handled by snapshot listener
        } catch (error) {
            console.error("Error sending message:", error);
            showToast(t('messageSendFailed'), 'error');
        } finally {
            isSendingMessageRef.current = false;
            setIsSendingMessage(false);
        }
    };

    const formatTime = (ts) => {
        if (!ts) return '';
        const date = new Date(ts);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        return formatLocaleTime(ts, t, { hour: '2-digit', minute: '2-digit', hour12: false }) + (!isToday ? ` ${formatDate(ts, t)}` : '');
    };

    return (
        <div className="app-card flex h-[500px] flex-col overflow-hidden">
            {/* Header */}
            <div className="border-b border-m3-outline-variant/30 bg-m3-surface-container p-4 font-medium text-m3-on-surface">
                {t('chatRoom')}
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-m3-surface/50">
                {chatLoadError ? (
                    <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 text-center text-sm text-m3-on-surface-variant">
                        <p>{t('chatLoadFailed')}</p>
                        <button
                            type="button"
                            onClick={() => setChatReloadKey((current) => current + 1)}
                            className="app-button-quiet text-google-blue"
                        >
                            <RotateCcw className="h-4 w-4" />
                            {t('chatRetry')}
                        </button>
                    </div>
                ) : messages.length === 0 && (
                    <div className="text-center text-m3-on-surface-variant text-sm mt-10 opacity-50">
                        {t('noMessagesYet')}
                    </div>
                )}
                {!chatLoadError && messages.map((msg, idx) => {
                    const isMine = msg.uid === activeUser.uid;
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
            <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-m3-outline-variant/30 bg-m3-surface-container p-3" aria-busy={isSendingMessage}>
                <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={t('typeMessage')}
                    disabled={isStopped || isSendingMessage}
                    maxLength={MESSAGE_TEXT_MAX_LENGTH}
                    className="app-input flex-1 rounded-full"
                />
                <button 
                    type="submit" 
                    disabled={isStopped || isSendingMessage || !inputText.trim()}
                    className={`app-icon-button border-transparent bg-google-blue text-white hover:bg-google-blue hover:text-white hover:shadow-elevation-1 ${isSendingMessage ? 'w-auto px-3 text-xs' : ''}`}
                >
                    {isSendingMessage ? t('processing') : <Send className="w-5 h-5" />}
                </button>
            </form>
        </div>
    );
}
