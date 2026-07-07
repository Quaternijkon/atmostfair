import React, { useState } from 'react';
import { X, Copy, RotateCcw, AlertTriangle } from './Icons';
import { useUI } from './UIContext';

const QRCodeShare = ({ url, title, onClose, t = (k) => k }) => {
  const { showToast } = useUI();
  const [qrLoadError, setQrLoadError] = useState(false);
  const [qrRetryKey, setQrRetryKey] = useState(0);
  const [manualShareUrl, setManualShareUrl] = useState('');
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}&retry=${qrRetryKey}`;

  const copyToClipboard = async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(url);
      setManualShareUrl('');
      showToast(t('linkCopied'), 'success');
    } catch {
      if (url) {
        setManualShareUrl(url);
        showToast(t('shareManualCopy'), 'info');
      } else {
        showToast(t('shareUnavailable'), 'error');
      }
    }
  };

  const retryQrCode = () => {
    setQrRetryKey((current) => current + 1);
    setQrLoadError(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="app-dialog flex flex-col items-center">
        
        <div className="w-full flex justify-between items-center mb-4">
          <h3 className="ml-2 text-xl font-medium text-m3-on-surface">{t('shareProject')}</h3>
          <button type="button" onClick={onClose} className="app-icon-button" title={t('close')}>
            <X className="w-5 h-5 text-m3-on-surface" />
          </button>
        </div>

        <div className="mb-6 flex h-56 w-56 items-center justify-center rounded-xl bg-white p-4 shadow-sm">
          {qrLoadError ? (
            <div role="alert" className="flex h-48 w-48 flex-col items-center justify-center gap-3 rounded-lg border border-google-yellow/30 bg-google-yellow/10 p-4 text-center text-sm font-medium text-m3-on-surface-variant">
              <AlertTriangle className="h-6 w-6 text-google-yellow" />
              <p>{t('qrCodeLoadFailed')}</p>
              <button type="button" onClick={retryQrCode} className="app-button-quiet min-h-10 text-google-blue">
                <RotateCcw className="h-4 w-4" />
                {t('qrCodeRetry')}
              </button>
            </div>
          ) : (
            <img
              key={qrRetryKey}
              src={qrUrl}
              alt={t('qrCodeAlt')}
              className="h-48 w-48"
              loading="lazy"
              onError={() => setQrLoadError(true)}
            />
          )}
        </div>

        <div className="text-center mb-6">
          <p className="font-medium text-m3-on-surface mb-1">{title}</p>
          <p className="text-sm text-m3-on-surface-variant break-all px-4 line-clamp-2">{url}</p>
        </div>

        {manualShareUrl && (
          <div role="alert" className="mb-4 w-full rounded-2xl border border-google-blue/25 bg-google-blue/5 p-3 text-sm text-m3-on-surface-variant">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-m3-on-surface">{t('shareManualCopy')}</div>
                <p className="mt-1">{t('shareManualCopyHint')}</p>
              </div>
              <button
                type="button"
                onClick={() => setManualShareUrl('')}
                className="app-icon-button h-10 min-h-10 w-10 shrink-0"
                title={t('close')}
                aria-label={t('close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              readOnly
              value={manualShareUrl}
              onFocus={(event) => event.target.select()}
              className="app-input font-mono text-xs"
              aria-label={t('copyLink')}
            />
          </div>
        )}

        <div className="w-full flex gap-3">
            <button 
                type="button"
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
