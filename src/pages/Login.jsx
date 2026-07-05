import React, { useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  updateProfile
} from '../lib/localAuth';
import { auth } from '../lib/localAuth';
import AtmostfairLogo from '../components/Logo';

export default function Login({ lang, setLang, t }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [guestName, setGuestName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const authErrorMessage = (action, authError) => t('actionFailed', {
    action,
    message: authError?.message || t('failed')
  });

  // Standard Email/Pass with Auto-Registration
  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
        try {
          const userCredential = await createUserWithEmailAndPassword(auth, email, password);
          if (userCredential.user) {
            await updateProfile(userCredential.user, { displayName: email.split('@')[0] });
          }
        } catch (createError) {
          if (createError.code === 'auth/email-already-in-use') {
            setError(t('passwordError'));
          } else {
            setError(authErrorMessage(t('signIn'), createError));
          }
        }
      } else if (e.code === 'auth/wrong-password') {
        setError(t('passwordError'));
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Guest Login Handler
  const handleGuestLogin = async (e) => {
    e.preventDefault();
    if (!guestName.trim()) return setError(t('setGuestName'));
    setLoading(true);
    setError('');
    try {
      const result = await signInAnonymously(auth, guestName.trim());
      await updateProfile(result.user, { displayName: guestName.trim() });
    } catch (e) {
      setError(authErrorMessage(t('guestLogin'), e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell flex min-h-screen items-start justify-center px-4 pb-8 pt-20 md:items-center md:py-8">
      <button
        onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
        className="app-button-quiet absolute right-4 top-4 bg-white/75 px-4 text-xs backdrop-blur"
      >
        {t('switchLang')}
      </button>

      <div className="grid w-full max-w-5xl items-stretch gap-5 md:grid-cols-[1.05fr_0.95fr]">
        <section className="app-card order-2 flex min-h-[320px] flex-col justify-between overflow-hidden p-7 sm:p-9 md:order-1 md:min-h-[420px]">
          <div>
            <div className="mb-7 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <AtmostfairLogo className="text-4xl" />
              <div>
                <h1 className="text-3xl font-medium tracking-normal text-m3-on-surface">Atmostfair</h1>
                <p className="mt-1 text-sm text-m3-on-surface-variant">{t('continueTo')}</p>
              </div>
            </div>

            <div className="grid grid-cols-4 overflow-hidden rounded-full">
              <div className="h-1.5 bg-google-blue" />
              <div className="h-1.5 bg-google-red" />
              <div className="h-1.5 bg-google-yellow" />
              <div className="h-1.5 bg-google-green" />
            </div>
          </div>

          <div className="mt-10 space-y-4">
            <div className="app-chip app-chip-blue">{t('signIn')}</div>
            <p className="max-w-md text-balance text-2xl font-medium leading-tight text-m3-on-surface">
              {t('loginReg')}
            </p>
          </div>
        </section>

        <section className="app-card order-1 p-6 sm:p-8 md:order-2">
          <div className="mb-6">
            <h2 className="text-2xl font-medium text-m3-on-surface">{t('signIn')}</h2>
            <p className="mt-1 text-sm text-m3-on-surface-variant">{t('continueTo')}</p>
          </div>

          {error && (
            <div className="mb-4 rounded-2xl border border-google-red/20 bg-google-red/10 p-3 text-sm font-medium text-google-red">
              {error}
            </div>
          )}

          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div>
              <label className="app-label">{t('emailAddr')}</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="app-input"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="app-label">{t('password')}</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="app-input"
                autoComplete="current-password"
              />
            </div>

            <button type="submit" disabled={loading} className="app-button-primary w-full">
              {loading ? t('processing') : t('loginReg')}
            </button>
          </form>

          <div className="my-7 border-t border-m3-outline-variant/45" />

          <form onSubmit={handleGuestLogin} className="space-y-3">
            <label className="app-label">{t('guestName')}</label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                required
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                className="app-input"
                placeholder={t('guestName')}
                autoComplete="nickname"
              />
              <button type="submit" disabled={loading} className="app-button-tonal whitespace-nowrap">
                {t('guestLogin')}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
