import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { CATEGORY_LABEL, LANGUAGE_LABEL, type Family, type Member, type Subscription } from '../lib/types';

type FamilyWithMembers = Family & { members: (Member & { subscriptions: Subscription[] })[] };

export default function MyFamily() {
  const { session, profile, refreshProfile } = useAuth();
  const [families, setFamilies] = useState<FamilyWithMembers[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from('families')
      .select('*, members(*, subscriptions(*))')
      .eq('user_id', session?.user.id ?? '');
    setFamilies((data as FamilyWithMembers[]) ?? []);
    setLoaded(true);
  }

  useEffect(() => {
    void load();
  }, [session?.user.id]);

  async function link(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.rpc('link_family', { p_phone: phone, p_code: code });
    if (error) return setError(error.message);
    setCode('');
    await refreshProfile();
    void load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">My family</h1>
        <p className="text-sm text-slate-500">Your children's Bal Prakash subscriptions.</p>
      </div>

      {families.map((f) => (
        <div key={f.id} className="card space-y-3">
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              <div className="font-medium">{f.parent_name}</div>
              <div className="text-sm text-slate-500">{f.phone}</div>
            </div>
          </div>
          <ul className="divide-y divide-slate-100">
            {f.members.map((m) => (
              <li key={m.id} className="py-3">
                <div className="font-medium">
                  {m.full_name} <span className="text-xs font-normal text-slate-500">· {CATEGORY_LABEL[m.category]}</span>
                </div>
                {m.subscriptions.length === 0 && <div className="text-sm text-slate-400">No subscription yet</div>}
                {m.subscriptions.map((s) => (
                  <div key={s.id} className="text-sm text-slate-600">
                    {LANGUAGE_LABEL[s.language]} · {s.plan_years} year plan · {s.total_issues} issues ·{' '}
                    <span className={s.status === 'active' ? 'text-green-700' : 'text-amber-700'}>{s.status}</span>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {loaded && (
        <form onSubmit={link} className="card max-w-md space-y-3">
          <div className="font-medium">{families.length ? 'Link another family' : 'Link your family'}</div>
          <p className="text-sm text-slate-500">
            Enter the mobile number given at registration and the 6-letter family code from your Bal Prakash head.
          </p>
          <input className="input" inputMode="numeric" placeholder="Mobile number" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          <input className="input font-mono uppercase" placeholder="Family code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required />
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="submit" className="btn-primary">Link family</button>
        </form>
      )}
    </div>
  );
}
