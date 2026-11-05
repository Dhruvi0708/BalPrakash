import { useState, type FormEvent } from 'react';
import { BookBuddy, Cloud, Doodles, KidReader, Sun } from '../components/Art';
import { RAINBOW } from '../components/Layout';
import { LangSwitch, useI18n } from '../lib/i18n';
import { isValidPhone, phoneToEmail } from '../lib/phone';
import { supabase } from '../lib/supabase';

type Mode = 'signin' | 'signup';

export default function Login() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signInWithGoogle() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) setError(error.message);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidPhone(phone)) return setError(t('badPhone'));
    if (password.length < 6) return setError(t('shortPassword'));
    setBusy(true);
    const email = phoneToEmail(phone);
    const { error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { data: { full_name: name.trim() } } });
    setBusy(false);
    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? t('wrongLogin')
          : error.message === 'User already registered'
            ? t('alreadyAccount')
            : error.message,
      );
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="h-1.5 w-full" style={{ background: RAINBOW }} />
      <Doodles />
      <Cloud className="absolute left-[4%] top-16 h-14 w-24 animate-float-slow" />
      <Cloud className="absolute right-[6%] top-40 h-10 w-20 animate-float" />
      <Sun className="absolute right-[8%] top-6 h-20 w-20 animate-wiggle" />

      <div className="relative mx-auto grid min-h-[calc(100vh-6px)] max-w-5xl items-center gap-8 px-4 py-10 lg:grid-cols-2">
        <div className="text-center lg:text-left">
          <div className="mb-4 flex justify-center lg:justify-start">
            <LangSwitch />
          </div>
          <h1 className="text-4xl leading-tight sm:text-5xl">
            <span className="bg-gradient-to-r from-saffron-500 via-bubble-500 to-grape-500 bg-clip-text text-transparent">{t('appName')}</span>
          </h1>
          <p className="mt-2 text-lg font-semibold text-ink-500">{t('tagline')}</p>
          <div className="mt-6 hidden items-end justify-center gap-2 sm:flex lg:justify-start">
            <KidReader variant="balak" className="h-36 w-28 animate-float" />
            <BookBuddy className="h-40 w-40 animate-float-slow" />
            <KidReader variant="balika" className="h-36 w-28 animate-float" />
          </div>
        </div>

        <div className="mx-auto w-full max-w-sm">
          <div className="mb-3 flex justify-center sm:hidden">
            <BookBuddy className="h-24 w-24 animate-float" />
          </div>
          <div className="card space-y-4">
            <button type="button" onClick={signInWithGoogle} className="btn-outline w-full">
              <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              {t('continueGoogle')}
            </button>

            <div className="flex items-center gap-3 text-xs font-bold text-ink-400">
              <span className="h-0.5 flex-1 rounded bg-ink-800/10" /> {t('orMobile')} <span className="h-0.5 flex-1 rounded bg-ink-800/10" />
            </div>

            <form onSubmit={submit} className="space-y-3">
              {mode === 'signup' && (
                <div>
                  <label className="label" htmlFor="name">{t('yourName')}</label>
                  <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
              )}
              <div>
                <label className="label" htmlFor="phone">{t('mobile')}</label>
                <input id="phone" className="input" inputMode="numeric" autoComplete="tel" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </div>
              <div>
                <label className="label" htmlFor="password">{t('password')}</label>
                <input
                  id="password"
                  type="password"
                  className="input"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && <p className="alert-error">{error}</p>}
              <button type="submit" disabled={busy} className="btn-primary w-full text-base">
                {busy ? t('wait') : mode === 'signin' ? `${t('signIn')} 🚀` : `${t('createAccount')} ✨`}
              </button>
            </form>

            <p className="text-center text-sm font-semibold text-ink-500">
              {mode === 'signin' ? `${t('newHere')} ` : `${t('haveAccount')} `}
              <button
                type="button"
                className="font-extrabold text-saffron-600 hover:underline"
                onClick={() => {
                  setMode(mode === 'signin' ? 'signup' : 'signin');
                  setError(null);
                }}
              >
                {mode === 'signin' ? t('createAccount') : t('signIn')}
              </button>
            </p>
            {mode === 'signin' && <p className="text-center text-xs font-semibold text-ink-400">{t('forgot')}</p>}
          </div>

          <p className="mt-4 rounded-3xl border-2 border-white bg-sunny-100 px-4 py-3 text-center text-sm font-bold text-ink-700 shadow-pop">
            👋 {t('teamHint')}
          </p>
        </div>
      </div>
    </div>
  );
}
