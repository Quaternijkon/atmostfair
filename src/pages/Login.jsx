import React, { useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInAnonymously,
  GoogleAuthProvider,
  GithubAuthProvider,
  OAuthProvider,
  sendSignInLinkToEmail,
  updateProfile
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Mail } from '../components/Icons';
import AtmostfairLogo from '../components/Logo';
import { GoogleIcon, GithubIcon, MicrosoftIcon } from '../components/AuthIcons';

export default function Login({ lang, setLang, t }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [guestName, setGuestName] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  // Magic Link Logic
  const handleMagicLink = async () => {
    if (!email) return setError(t('enterEmail'));
    setLoading(true);
    setError('');
    const actionCodeSettings = {
      url: window.location.href,
      handleCodeInApp: true,
    };
    try {
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      window.localStorage.setItem('emailForSignIn', email);
      setInfo(t('magicLinkInfo'));
    } catch (e) {
      setError(t('magicLinkError') + ': ' + e.message);
    } finally {
      setLoading(false);
    }
  };

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
            setError(t('signIn') + ' failed: ' + createError.message);
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
      const result = await signInAnonymously(auth);
      await updateProfile(result.user, { displayName: guestName });
    } catch (e) {
      setError(t('guestLogin') + ' failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // Social Login
  const handleSocialLogin = async (providerName) => {
    setLoading(true);
    setError('');
    let provider;
    switch (providerName) {
      case 'google': provider = new GoogleAuthProvider(); break;
      case 'github': provider = new GithubAuthProvider(); break;
      case 'microsoft': provider = new OAuthProvider('microsoft.com'); break;
      default: return;
    }
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      setError(t('signIn') + ' failed: ' + e.message + ' (Check Firebase Console)');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-m3-surface p-4 font-sans text-m3-on-surface">
      <div className="bg-m3-surface-container w-full max-w-[400px] p-8 rounded-[28px] shadow-elevation-2">
        <div className="absolute top-4 right-4">
            <button 
                onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
                className="px-3 py-1 text-xs rounded-full border border-m3-outline-variant hover:bg-m3-on-surface/5 transition-colors"
            >
                {t('switchLang')}
            </button>
        </div>
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="mb-4">
            <AtmostfairLogo className="text-4xl" />
          </div>
          <h1 className="text-2xl font-normal text-m3-on-surface">{t('signIn')}</h1>
          <p className="text-m3-on-surface-variant text-sm mt-2">{t('continueTo')}</p>
        </div>

        {error && <div className="bg-google-red/10 text-google-red p-3 rounded-lg text-sm mb-4">{error}</div>}
        {info && <div className="bg-google-green/10 text-google-green p-3 rounded-lg text-sm mb-4">{info}</div>}

        <div className="space-y-3 mb-6">
          <button onClick={() => handleSocialLogin('google')} className="relative w-full flex items-center justify-center gap-3 bg-white border border-m3-outline-variant hover:bg-gray-50 transition-colors p-2.5 rounded-full text-sm font-medium text-m3-on-surface">
            <GoogleIcon className="w-5 h-5 absolute left-4" />
            <span>{t('googleLogin')}</span>
          </button>
          <button onClick={() => handleSocialLogin('github')} className="relative w-full flex items-center justify-center gap-3 bg-white border border-m3-outline-variant hover:bg-gray-50 transition-colors p-2.5 rounded-full text-sm font-medium text-m3-on-surface">
            <GithubIcon className="w-5 h-5 absolute left-4" />
            <span>{t('githubLogin')}</span>
          </button>
          <button onClick={() => handleSocialLogin('microsoft')} className="relative w-full flex items-center justify-center gap-3 bg-white border border-m3-outline-variant hover:bg-gray-50 transition-colors p-2.5 rounded-full text-sm font-medium text-m3-on-surface">
            <MicrosoftIcon className="w-5 h-5 absolute left-4" />
            <span>{t('microsoftLogin')}</span>
          </button>
        </div>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-m3-outline-variant"></div></div>
          <div className="relative flex justify-center text-xs uppercase tracking-wider"><span className="px-2 bg-m3-surface-container text-m3-on-surface-variant">{t('or')}</span></div>
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-4">
          <div className="group relative">
            <input
              type="email" required
              placeholder=" "
              value={email} onChange={e => setEmail(e.target.value)}
              className="peer w-full px-4 py-3 border border-m3-outline rounded-lg bg-transparent text-m3-on-surface focus:border-google-blue focus:border-2 outline-none transition-colors"
            />
            <label className="absolute left-3 -top-2.5 bg-m3-surface-container px-1 text-xs text-m3-on-surface-variant transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-base peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-google-blue">
              {t('emailAddr')}
            </label>
          </div>

          <div className="group relative">
            <input
              type="password" required
              placeholder=" "
              value={password} onChange={e => setPassword(e.target.value)}
              className="peer w-full px-4 py-3 border border-m3-outline rounded-lg bg-transparent text-m3-on-surface focus:border-google-blue focus:border-2 outline-none transition-colors"
            />
            <label className="absolute left-3 -top-2.5 bg-m3-surface-container px-1 text-xs text-m3-on-surface-variant transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-base peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-google-blue">
              {t('password')}
            </label>
          </div>

          <div className="flex flex-col gap-3 mt-4">
            <button type="submit" disabled={loading} className="w-full bg-google-blue text-white py-2.5 rounded-full font-medium hover:shadow-elevation-1 hover:bg-google-blue/90 transition-all">
              {loading ? t('processing') : t('loginReg')}
            </button>
            <div className="flex justify-center items-center text-sm pt-2">
              <button type="button" onClick={handleMagicLink} className="text-m3-on-surface-variant hover:text-google-blue border border-m3-outline-variant/50 hover:border-google-blue/50 px-4 py-2 rounded-full text-xs transition-colors flex items-center gap-2">
                <Mail className="w-3 h-3" /> {t('magicLink')}
              </button>
            </div>
          </div>
        </form>

        <div className="mt-8 pt-6 border-t border-m3-outline-variant">
          <form onSubmit={handleGuestLogin} className="flex gap-2 items-center">
            <div className="relative flex-1">
              <input
                type="text"
                required
                placeholder={t('guestName')}
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                className="w-full pl-4 pr-4 py-2 bg-m3-surface border border-m3-outline-variant rounded-lg text-sm text-m3-on-surface focus:border-m3-outline outline-none"
              />
            </div>
            <button type="submit" disabled={loading} className="text-m3-on-surface font-medium text-sm hover:bg-m3-on-surface/5 px-4 py-2 rounded-full transition-colors whitespace-nowrap">
              {t('guestLogin')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
