import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { isHead, isStaff, useAuth } from '../auth/AuthProvider';
import { ROLE_LABEL } from '../lib/types';

interface NavItem {
  to: string;
  label: string;
  show: boolean;
}

export default function Layout() {
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  const items: NavItem[] = [
    { to: '/', label: 'Dashboard', show: isStaff(profile) },
    { to: '/members', label: 'Balaks & Balikas', show: isStaff(profile) },
    { to: '/areas', label: 'Areas', show: isHead(profile) },
    { to: '/users', label: 'Team & roles', show: profile?.role === 'main_head' },
    { to: '/my-books', label: 'My books', show: true },
  ];

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `block rounded-lg px-3 py-2 text-sm font-medium ${
      isActive ? 'bg-saffron-100 text-saffron-700' : 'text-slate-600 hover:bg-slate-100'
    }`;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
              onClick={() => setOpen(!open)}
              aria-label="Toggle menu"
            >
              ☰
            </button>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-saffron-600 font-bold text-white">બા</span>
            <div className="leading-tight">
              <div className="font-semibold">Bal Prakash Delhi</div>
              <div className="text-xs text-slate-500">{profile ? ROLE_LABEL[profile.role] : ''}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline">{profile?.full_name}</span>
            <button type="button" className="btn-outline py-1.5" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6">
        <nav className={`${open ? 'block' : 'hidden'} fixed inset-x-4 top-16 z-20 rounded-xl border bg-white p-2 shadow-lg md:static md:block md:w-52 md:shrink-0 md:border-0 md:bg-transparent md:p-0 md:shadow-none`}>
          {items
            .filter((i) => i.show)
            .map((i) => (
              <NavLink key={i.to} to={i.to} end className={linkClass} onClick={() => setOpen(false)}>
                {i.label}
              </NavLink>
            ))}
        </nav>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
