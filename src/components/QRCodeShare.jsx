import React from 'react';
import { X, Copy } from './Icons';
import { useUI } from './UIContext';

const QRCodeShare = ({ url, title, onClose, t = (k) => k }) => {
  const { showToast } = useUI();
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;

  const copyToClipboard = async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(url);
      showToast(t('linkCopied'), 'success');
    } catch {
      showToast(t('shareUnavailable'), 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="app-dialog flex flex-col items-center">
        
        <div className="w-full flex justify-between items-center mb-4">
          <h3 className="ml-2 text-xl font-medium text-m3-on-surface">{t('shareProject')}</h3>
          <button onClick={onClose} className="app-icon-button" title={t('close')}>
            <X className="w-5 h-5 text-m3-on-surface" />
          </button>
        </div>

        <div className="bg-white p-4 rounded-xl mb-6 shadow-sm">
          <img src={qrUrl} alt={t('qrCodeAlt')} className="w-48 h-48" />
        </div>

        <div className="text-center mb-6">
          <p className="font-medium text-m3-on-surface mb-1">{title}</p>
          <p className="text-sm text-m3-on-surface-variant break-all px-4 line-clamp-2">{url}</p>
        </div>

        <div className="w-full flex gap-3">
            <button 
                onClick={copyToClipboard}
                className="app-button-tonal flex-1"
            >
                <Copy className="w-4 h-4" />
                {t('copyLink')}
            </button>
        </div>
      </div>
    </div>
  );
};

export default QRCodeShare;
