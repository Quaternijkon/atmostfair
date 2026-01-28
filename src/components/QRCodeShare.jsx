import React from 'react';
import { X, Copy } from './Icons';

/**
 * QRCodeShare Component
 * Uses a public API to generate a QR code for the current URL.
 * Includes "Copy Link" functionality.
 */
const QRCodeShare = ({ url, title, onClose, t = (k) => k }) => {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(url).then(() => {
      alert(t('linkCopied') || 'Link copied!');
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
      <div className="bg-m3-surface-container rounded-[28px] p-6 w-full max-w-sm shadow-elevation-3 flex flex-col items-center">
        
        <div className="w-full flex justify-between items-center mb-4">
          <h3 className="text-xl font-normal text-m3-on-surface ml-2">{t('shareProject') || 'Share Project'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-m3-surface-container-high rounded-full">
            <X className="w-5 h-5 text-m3-on-surface" />
          </button>
        </div>

        <div className="bg-white p-4 rounded-xl mb-6 shadow-sm">
          <img src={qrUrl} alt="QR Code" className="w-48 h-48" />
        </div>

        <div className="text-center mb-6">
          <p className="font-medium text-m3-on-surface mb-1">{title}</p>
          <p className="text-sm text-m3-on-surface-variant break-all px-4 line-clamp-2">{url}</p>
        </div>

        <div className="w-full flex gap-3">
            <button 
                onClick={copyToClipboard}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-m3-primary-container text-m3-on-primary-container rounded-full font-medium transition-shadow hover:shadow-elevation-1"
            >
                <Copy className="w-4 h-4" />
                {t('copyLink') || 'Copy Link'}
            </button>
        </div>
      </div>
    </div>
  );
};

export default QRCodeShare;
