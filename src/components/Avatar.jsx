import React, { useMemo } from 'react';

/**
 * Material 3 Style Avatar Component
 * 
 * Generates a consistent avatar based on the user's name.
 * - Takes first 2 letters for English.
 * - Takes first 1 char for non-English (Chinese, etc).
 * - Generates a consistent background color based on name hash.
 */
export default function Avatar({ name, url, size = 'md', className = '' }) {
  const displayChars = useMemo(() => {
    if (!name) return '?';
    const trimmed = name.trim();
    // Check if starts with English
    if (/^[A-Za-z]/.test(trimmed)) {
      return trimmed.slice(0, 2).toUpperCase();
    }
    // Assume CJK or other
    return trimmed.slice(0, 1);
  }, [name]);

  const bgColor = useMemo(() => {
    if (!name) return 'bg-m3-surface-variant';
    const colors = [
      'bg-google-red',
      'bg-google-blue',
      'bg-google-green',
      'bg-google-yellow text-black',
      'bg-purple-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-teal-500',
      'bg-orange-500'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  }, [name]);

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-lg',
    xl: 'w-24 h-24 text-3xl'
  };

  if (url) {
      return (
          <img 
            src={url} 
            alt={name} 
            className={`rounded-full object-cover border border-m3-outline-variant/20 ${sizeClasses[size]} ${className}`} 
          />
      );
  }

  return (
    <div 
        className={`rounded-full flex items-center justify-center font-medium text-white shadow-sm shrink-0 uppercase select-none ${bgColor} ${sizeClasses[size]} ${className}`}
    >
      {displayChars}
    </div>
  );
}
