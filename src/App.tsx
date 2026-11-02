import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, isHead, isStaff, useAuth } from './auth/AuthProvider';
import Layout from './components/Layout';
import { supabaseConfigured } from './lib/supabase';
import Areas from './pages/Areas';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Members from './pages/Members';
import MyFamily from './pages/MyFamily';
import Users from './pages/Users';

function AppRoutes() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>;
  }
  if (!session) return <Login />;

  const staff = isStaff(profile);
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={staff ? <Dashboard /> : <Navigate to="/my-family" replace />} />
        <Route path="members" element={staff ? <Members /> : <Navigate to="/" replace />} />
        <Route path="areas" element={isHead(profile) ? <Areas /> : <Navigate to="/" replace />} />
        <Route path="users" element={profile?.role === 'main_head' ? <Users /> : <Navigate to="/" replace />} />
        <Route path="my-family" element={<MyFamily />} />
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
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
