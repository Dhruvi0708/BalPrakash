import type { JSX } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, isHead, isStaff, useAuth } from './auth/AuthProvider';
import { BookBuddy } from './components/Art';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import { I18nProvider } from './lib/i18n';
import { supabaseConfigured } from './lib/supabase';
import Activity from './pages/Activity';
import Approvals from './pages/Approvals';
import Areas from './pages/Areas';
import Dashboard from './pages/Dashboard';
import Distribution from './pages/Distribution';
import Issues from './pages/Issues';
import Login from './pages/Login';
import Members from './pages/Members';
import MyBooks from './pages/MyBooks';
import Register from './pages/Register';
import RegistrationWindows from './pages/RegistrationWindows';
import Requests from './pages/Requests';
import Users from './pages/Users';

function SignedInRoutes() {
  const { session, profile, loading } = useAuth();

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;
  if (!session) return <Login />;

  const staff = isStaff(profile);
  const head = isHead(profile);
  const main = profile?.role === 'main_head';
  const guard = (ok: boolean, el: JSX.Element) => (ok ? el : <Navigate to="/" replace />);
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={staff ? <Dashboard /> : <Navigate to="/my-books" replace />} />
        <Route path="distribution" element={guard(staff, <Distribution />)} />
        <Route path="issues" element={guard(head, <Issues />)} />
        <Route path="members" element={guard(staff, <Members />)} />
        <Route path="approvals" element={guard(head, <Approvals />)} />
        <Route path="requests" element={guard(head, <Requests />)} />
        <Route path="areas" element={guard(head, <Areas />)} />
        <Route path="registration" element={guard(main, <RegistrationWindows />)} />
        <Route path="users" element={guard(main, <Users />)} />
        <Route path="activity" element={guard(main, <Activity />)} />
        <Route path="my-books" element={<MyBooks />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  if (!supabaseConfigured) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <div className="card space-y-2 text-center">
          <BookBuddy className="mx-auto h-20 w-20" mood="sleepy" />
          <h1 className="text-xl">Supabase is not configured</h1>
          <p className="text-sm font-semibold text-ink-500">
            Copy <code>.env.example</code> to <code>.env.local</code> and fill in your Supabase URL and anon key.
          </p>
        </div>
      </div>
    );
  }
  return (
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* The registration form is public: no login needed. */}
            <Route path="/register" element={<Register />} />
            <Route path="/*" element={<SignedInRoutes />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  );
}
