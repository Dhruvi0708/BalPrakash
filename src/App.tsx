import type { JSX } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, isHead, isMainHead, isVolunteer, useAuth } from './auth/AuthProvider';
import { BookBuddy } from './components/Art';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import { I18nProvider } from './lib/i18n';
import { supabaseConfigured } from './lib/supabase';
import AnnualRegistration from './pages/AnnualRegistration';
import Dashboard from './pages/Dashboard';
import Distribution from './pages/Distribution';
import Login from './pages/Login';
import MemberList from './pages/MemberList';
import RegisterMember from './pages/RegisterMember';
import Reports from './pages/Reports';
import { MyDeliveries, VolunteerHome } from './pages/VolunteerPages';
import Volunteers from './pages/Volunteers';

function NotOnTeam() {
  const { profile, signOut, refreshProfile } = useAuth();
  return (
    <div className="mx-auto max-w-lg p-8">
      <div className="card space-y-3 text-center">
        <BookBuddy className="mx-auto h-24 w-24" mood="sleepy" />
        <h1 className="text-xl">You're not on the team yet</h1>
        <p className="text-sm font-semibold text-ink-500">
          Ask the Main Head to add you as a volunteer with mobile number <b>{profile?.phone ?? 'you signed up with'}</b>. Once added, this page opens your
          books automatically.
        </p>
        <div className="flex justify-center gap-2">
          <button type="button" className="btn-primary" onClick={() => void refreshProfile()}>🔄 Check again</button>
          <button type="button" className="btn-outline" onClick={() => void signOut()}>Sign out</button>
        </div>
      </div>
    </div>
  );
}

function SignedInRoutes() {
  const { session, profile, loading } = useAuth();

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;
  if (!session) return <Login />;
  if (!profile) return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;
  if (!isHead(profile) && !isVolunteer(profile)) return <NotOnTeam />;

  const main = isMainHead(profile);
  const head = isHead(profile);
  const vol = isVolunteer(profile);
  const guard = (ok: boolean, el: JSX.Element) => (ok ? el : <Navigate to="/" replace />);
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={vol ? <VolunteerHome /> : <Dashboard />} />
        {/* Heads */}
        <Route path="balaks" element={guard(main, <MemberList category="balak" />)} />
        <Route path="balikas" element={guard(head, <MemberList category="balika" />)} />
        <Route path="register-member" element={guard(main, <RegisterMember />)} />
        <Route path="volunteers" element={guard(main, <Volunteers />)} />
        <Route path="distribution" element={guard(head, <Distribution />)} />
        <Route path="registration" element={guard(main, <AnnualRegistration />)} />
        <Route path="reports" element={guard(head, <Reports />)} />
        {/* Volunteers */}
        <Route path="my-books" element={guard(vol, <MyDeliveries view="all" />)} />
        <Route path="pending" element={guard(vol, <MyDeliveries view="pending" />)} />
        <Route path="completed" element={guard(vol, <MyDeliveries view="completed" />)} />
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
          <SignedInRoutes />
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  );
}
