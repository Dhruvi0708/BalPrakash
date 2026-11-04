import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isHead, useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';

interface Counts {
  balak: number;
  balika: number;
  gu: number;
  en: number;
  pendingApproval: number;
}

export default function Dashboard() {
  const { profile } = useAuth();
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    async function load() {
      // RLS already limits these to the side the user manages.
      const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
      const [balak, balika, gu, en, pendingApproval] = await Promise.all([
        count(supabase.from('members').select('id', { count: 'exact', head: true }).eq('category', 'balak')),
        count(supabase.from('members').select('id', { count: 'exact', head: true }).eq('category', 'balika')),
        count(supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('language', 'gu')),
        count(supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('language', 'en')),
        count(supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
      ]);
      setCounts({ balak, balika, gu, en, pendingApproval });
    }
    void load();
  }, []);

  const tiles = [
    { label: 'Balaks', value: counts?.balak, show: profile?.role !== 'balika_head' && profile?.category !== 'balika' },
    { label: 'Balikas', value: counts?.balika, show: profile?.role !== 'volunteer' || profile?.category === 'balika' },
    { label: 'Active Gujarati subscriptions', value: counts?.gu, show: true },
    { label: 'Active English subscriptions', value: counts?.en, show: true },
    { label: 'Waiting for approval', value: counts?.pendingApproval, show: isHead(profile) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Namaste, {profile?.full_name ?? 'sevak'}</h1>
        <p className="text-sm text-slate-500">Overview of the Bal Prakash records you manage.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {tiles
          .filter((t) => t.show)
          .map((t) => (
            <div key={t.label} className="card">
              <div className="text-sm text-slate-500">{t.label}</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums">{t.value ?? '–'}</div>
            </div>
          ))}
      </div>

      {isHead(profile) && (counts?.pendingApproval ?? 0) > 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-saffron-100 bg-saffron-50">
          <div>
            <div className="font-medium">{counts?.pendingApproval} registration(s) waiting for approval</div>
            <div className="text-sm text-slate-500">Check the payment and approve or reject.</div>
          </div>
          <Link to="/approvals" className="btn-primary">Review now</Link>
        </div>
      )}

      {isHead(profile) && (
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-medium">Add existing balaks and balikas</div>
            <div className="text-sm text-slate-500">Upload a CSV sheet or add them one by one.</div>
          </div>
          <Link to="/members" className="btn-primary">Go to members</Link>
        </div>
      )}
    </div>
  );
}
