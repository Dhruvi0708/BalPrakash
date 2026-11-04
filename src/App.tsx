import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, isHead, isStaff, useAuth } from './auth/AuthProvider';
import Layout from './components/Layout';
import { supabaseConfigured } from './lib/supabase';
import Approvals from './pages/Approvals';
import Areas from './pages/Areas';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Members from './pages/Members';
import MyBooks from './pages/MyBooks';
import Register from './pages/Register';
import RegistrationWindows from './pages/RegistrationWindows';
import Users from './pages/Users';

function SignedInRoutes() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>;
  }
  if (!session) return <Login />;

  const staff = isStaff(profile);
  const head = isHead(profile);
  const main = profile?.role === 'main_head';
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={staff ? <Dashboard /> : <Navigate to="/my-books" replace />} />
        <Route path="members" element={staff ? <Members /> : <Navigate to="/" replace />} />
        <Route path="approvals" element={head ? <Approvals /> : <Navigate to="/" replace />} />
        <Route path="areas" element={head ? <Areas /> : <Navigate to="/" replace />} />
        <Route path="registration" element={main ? <RegistrationWindows /> : <Navigate to="/" replace />} />
        <Route path="users" element={main ? <Users /> : <Navigate to="/" replace />} />
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
        <div className="card space-y-2">
          <h1 className="text-lg font-semibold">Supabase is not configured</h1>
          <p className="text-sm text-slate-600">
            Copy <code>.env.example</code> to <code>.env.local</code> and fill in your Supabase URL and anon key.
          </p>
        </div>
      </div>
    );
  }
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* The registration form is public: no login needed. */}
          <Route path="/register" element={<Register />} />
          <Route path="/*" element={<SignedInRoutes />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
