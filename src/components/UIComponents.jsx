// src/components/UIComponents.jsx
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { X, Info, Trash2 } from './Icons';

// --- Context ---
const UIContext = createContext();

export const useUI = () => {
    const context = useContext(UIContext);
    if (!context) throw new Error('useUI must be used within a UIProvider');
    return context;
};

// --- Toast Component (Snackbar) ---
const Toast = ({ message, type = 'info', onClose }) => {
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
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-xl shadow-elevation-2 flex items-center gap-3 animate-fade-in-up transition-all ${bgColors[type] || bgColors.info}`}>
            <span className="text-sm font-medium">{message}</span>
            <button onClick={onClose} className="opacity-80 hover:opacity-100 p-1 rounded-full hover:bg-white/20"><X className="w-4 h-4" /></button>
        </div>
    );
};

// --- Dialog Component (Modal) ---
const Dialog = ({ isOpen, title, message, onConfirm, onCancel, confirmText = 'Confirm', cancelText = 'Cancel', type = 'default' }) => {
    if (!isOpen) return null;

    const isDestructive = type === 'destructive';

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-m3-surface-container rounded-[28px] p-6 w-full max-w-sm shadow-elevation-3 animate-scale-in">
                <div className="flex flex-col mb-4">
                    {/* Icon could go here based on type */}
                    <h3 className="text-2xl font-normal text-m3-on-surface mb-2">{title}</h3>
                    <p className="text-sm text-m3-on-surface-variant leading-relaxed">{message}</p>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                    <button 
                         onClick={onCancel} 
                         className="px-4 py-2.5 text-google-blue font-medium hover:bg-google-blue/10 rounded-full text-sm transition-colors"
                    >
                        {cancelText}
                    </button>
                    <button 
                        onClick={onConfirm} 
                        className={`px-5 py-2.5 rounded-full font-medium text-sm shadow-elevation-1 hover:shadow-elevation-2 transition-all ${isDestructive ? 'bg-google-red text-white' : 'bg-google-blue text-white'}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Provider ---
export const UIProvider = ({ children }) => {
    // Toast State
    const [toasts, setToasts] = useState([]);
    
    // Dialog State
    const [dialog, setDialog] = useState({ isOpen: false });

    // Toast Actions
    const showToast = useCallback((message, type = 'info') => {
        const id = Date.now();
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

    return (
        <UIContext.Provider value={{ showToast, confirm, closeDialog }}>
            {children}
            {/* Render Toasts */}
            <div className="fixed bottom-0 left-0 right-0 pointer-events-none flex flex-col items-center gap-2 p-4 z-[100]">
                {toasts.map(toast => (
                    <div key={toast.id} className="pointer-events-auto">
                         <Toast {...toast} onClose={() => removeToast(toast.id)} />
                    </div>
                ))}
            </div>
            {/* Render Dialog */}
            <Dialog {...dialog} />
        </UIContext.Provider>
    );
};
