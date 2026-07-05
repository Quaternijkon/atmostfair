// src/components/UIComponents.jsx
import React, { useState, useCallback, useEffect } from 'react';
import { X, Info, Trash2 } from './Icons';
import { nowMs } from '../lib/time';
import { UIContext } from './UIContext';

// --- Toast Component (Snackbar) ---
const Toast = ({ message, type = 'info', onClose, t }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 4000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const bgColors = {
        info: 'bg-m3-inverse-surface text-m3-inverse-on-surface',
        success: 'bg-google-green text-white',
        error: 'bg-google-red text-white',
    };

    return (
        <div className={`fixed bottom-6 left-1/2 z-[100] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 animate-fade-in-up items-center gap-3 rounded-2xl px-5 py-3 shadow-elevation-2 transition-all ${bgColors[type] || bgColors.info}`}>
            <span className="text-sm font-medium">{message}</span>
            <button onClick={onClose} className="app-icon-button border-white/15 text-current opacity-80 hover:bg-white/20 hover:text-current hover:opacity-100" title={t('close')}><X className="w-4 h-4" /></button>
        </div>
    );
};

// --- Dialog Component (Modal) ---
const Dialog = ({ isOpen, title, message, onConfirm, onCancel, confirmText, cancelText, type = 'default', t }) => {
    if (!isOpen) return null;

    const isDestructive = type === 'destructive';

    return (
        <div className="fixed inset-0 z-[100] flex animate-fade-in items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
            <div className="app-dialog animate-scale-in">
                <div className="flex flex-col mb-4">
                    {/* Icon could go here based on type */}
                    <h3 className="mb-2 text-2xl font-medium text-m3-on-surface">{title}</h3>
                    <p className="text-sm text-m3-on-surface-variant leading-relaxed">{message}</p>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                    <button 
                         onClick={onCancel} 
                         className="app-button-quiet"
                    >
                        {cancelText || t('cancel')}
                    </button>
                    <button 
                        onClick={onConfirm} 
                        className={isDestructive ? 'app-button bg-google-red text-white hover:shadow-elevation-1' : 'app-button-primary'}
                    >
                        {confirmText || t('confirm')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Provider ---
export const UIProvider = ({ children, t = (key) => key }) => {
    // Toast State
    const [toasts, setToasts] = useState([]);
    
    // Dialog State
    const [dialog, setDialog] = useState({ isOpen: false });

    // Toast Actions
    const showToast = useCallback((message, type = 'info') => {
        const id = nowMs();
        setToasts(prev => [...prev, { id, message, type }]);
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // Dialog Actions
    const confirm = useCallback(({ title, message, confirmText, cancelText, type, onConfirm }) => {
        setDialog({
            isOpen: true,
            title,
            message,
            confirmText,
            cancelText,
            type,
            onConfirm: () => {
                if (onConfirm) onConfirm();
                setDialog(prev => ({ ...prev, isOpen: false }));
            },
            onCancel: () => setDialog(prev => ({ ...prev, isOpen: false }))
        });
    }, []);

    const closeDialog = useCallback(() => {
        setDialog(prev => ({ ...prev, isOpen: false }));
    }, []);

    const contextValue = { showToast, confirm, closeDialog };
    const renderedChildren = typeof children === 'function' ? children(contextValue) : children;

    return (
        <UIContext.Provider value={contextValue}>
            {renderedChildren}
            {/* Render Toasts */}
            <div className="fixed bottom-0 left-0 right-0 pointer-events-none flex flex-col items-center gap-2 p-4 z-[100]">
                {toasts.map(toast => (
                    <div key={toast.id} className="pointer-events-auto">
                         <Toast {...toast} onClose={() => removeToast(toast.id)} t={t} />
                    </div>
                ))}
            </div>
            {/* Render Dialog */}
            <Dialog {...dialog} t={t} />
        </UIContext.Provider>
    );
};
