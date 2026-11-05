import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { isHead, isStaff, useAuth } from '../auth/AuthProvider';
import { LangSwitch, useI18n } from '../lib/i18n';
import { pendingCount, subscribeQueue } from '../lib/offline';
import { ROLE_LABEL } from '../lib/types';
import { BookBuddy } from './Art';

export const RAINBOW = 'linear-gradient(90deg, #ff7a1a, #ffc41f, #12c85f, #33a5ff, #925cf6, #ec4899)';

interface NavItem {
  to: string;
  label: string;
  emoji: string;
  show: boolean;
}

export default function Layout() {
  const { profile, signOut } = useAuth();
  const { t } = useI18n();
  const [queued, setQueued] = useState(pendingCount());
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    const unsub = subscribeQueue(setQueued);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      unsub();
    };
  }, []);

  const staff = isStaff(profile);
  const head = isHead(profile);
  const main = profile?.role === 'main_head';

  const items: NavItem[] = [
    { to: '/', label: 'Dashboard', emoji: '🏠', show: staff },
    { to: '/distribution', label: 'Distribute', emoji: '🎁', show: staff },
    { to: '/issues', label: 'Issues & stock', emoji: '📦', show: head },
    { to: '/members', label: 'Balaks & Balikas', emoji: '🧒', show: staff },
    { to: '/approvals', label: 'Approvals', emoji: '✅', show: head },
    { to: '/requests', label: 'Help requests', emoji: '💬', show: head },
    { to: '/registration', label: 'Registration', emoji: '📝', show: main },
    { to: '/areas', label: 'Areas', emoji: '📍', show: head },
    { to: '/users', label: 'Team & roles', emoji: '👥', show: main },
    { to: '/activity', label: 'Activity log', emoji: '🕑', show: main },
    { to: '/my-books', label: t('myBooks'), emoji: '📚', show: true },
  ].filter((i) => i.show);

  const desktopLink = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-bold transition ${
      isActive ? 'bg-white text-saffron-700 shadow-pop' : 'text-ink-600 hover:bg-white/60'
    }`;
  const mobileLink = ({ isActive }: { isActive: boolean }) =>
    `flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold transition ${
      isActive ? 'bg-gradient-to-r from-saffron-500 to-bubble-500 text-white shadow-glow' : 'bg-white/80 text-ink-600'
    }`;

  return (
    <div className="min-h-screen">
      <div className="no-print h-1.5 w-full" style={{ background: RAINBOW }} />
      <header className="no-print sticky top-0 z-30 border-b-2 border-white/70 bg-[#fff8ef]/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5">
          <NavLink to="/" className="flex items-center gap-2.5">
            <BookBuddy className="h-11 w-11" />
            <div className="leading-tight">
              <div className="text-lg font-extrabold text-ink-900">{t('appName')}</div>
              <div className="text-xs font-bold text-saffron-600">{profile ? ROLE_LABEL[profile.role] : ''}</div>
            </div>
          </NavLink>
          <div className="flex items-center gap-2">
            <LangSwitch className="hidden sm:inline-flex" />
            <span className="hidden max-w-[10rem] truncate text-sm font-bold text-ink-600 md:inline">{profile?.full_name}</span>
            <button type="button" className="btn-outline btn-sm" onClick={signOut}>
              {t('signOut')}
            </button>
          </div>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-4 pb-2.5 md:hidden">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end className={mobileLink}>
              <span>{i.emoji}</span>
              {i.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {(!online || queued > 0) && (
        <div className="no-print mx-auto mt-3 max-w-7xl px-4">
          <div className={`rounded-2xl px-4 py-2 text-sm font-bold ${online ? 'bg-sky2-100 text-sky2-700' : 'bg-sunny-100 text-sunny-700'}`}>
            {online
              ? `🔄 Syncing ${queued} saved change(s)…`
              : `📴 You're offline. Marks you make are saved on this phone${queued ? ` (${queued} waiting)` : ''} and will sync automatically.`}
          </div>
        </div>
      )}

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <nav className="no-print sticky top-24 hidden h-fit w-56 shrink-0 space-y-1 md:block">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end className={desktopLink}>
              <span className="text-xl">{i.emoji}</span>
              {i.label}
            </NavLink>
          ))}
          <div className="pt-4">
            <LangSwitch />
          </div>
        </nav>
        <main className="min-w-0 flex-1 space-y-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
