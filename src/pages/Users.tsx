import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { PageHeader } from '../components/ui';
import { supabase } from '../lib/supabase';
import { ROLE_LABEL, type AppRole, type Area, type Category, type Profile } from '../lib/types';

const ROLE_EMOJI: Record<AppRole, string> = { main_head: '👑', balika_head: '🌸', volunteer: '🙋', subscriber: '📚' };

export default function Users() {
  const { profile: me } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [search, setSearch] = useState('');
  const [staffOnly, setStaffOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [p, a] = await Promise.all([supabase.from('profiles').select('*').order('role').order('full_name'), supabase.from('areas').select('*').order('name')]);
    setUsers((p.data as Profile[]) ?? []);
    setAreas((a.data as Area[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(u: Profile, patch: Partial<Pick<Profile, 'role' | 'category' | 'area_id'>>) {
    setError(null);
    const role = patch.role ?? u.role;
    const category = role === 'volunteer' ? (patch.category !== undefined ? patch.category : u.category) : role === 'balika_head' ? 'balika' : null;
    const { error } = await supabase
      .from('profiles')
      .update({ role, category, area_id: patch.area_id !== undefined ? patch.area_id : u.area_id })
      .eq('id', u.id);
    if (error) setError(error.message);
    void load();
  }

  const q = search.trim().toLowerCase();
  const shown = users.filter(
    (u) => (!staffOnly || u.role !== 'subscriber') && (!q || (u.full_name ?? '').toLowerCase().includes(q) || (u.phone ?? '').includes(q)),
  );

  return (
    <>
      <PageHeader emoji="👥" tone="grape" title="Team & roles" subtitle="Ask a sevak to create an account first, then give them a role. Volunteers only see their own side and start on their own area." />
      <div className="flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="🔎 Name or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button type="button" className={`btn btn-sm ${staffOnly ? 'bg-ink-800 text-white' : 'btn-outline'}`} onClick={() => setStaffOnly(!staffOnly)}>
          Team only
        </button>
      </div>
      {error && <p className="alert-error">{error}</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((u) => (
          <div key={u.id} className="card space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-grape-50 text-2xl">{ROLE_EMOJI[u.role]}</span>
              <div className="min-w-0">
                <div className="truncate text-lg font-extrabold">{u.full_name ?? '—'}</div>
                <div className="text-sm font-semibold text-ink-500">{u.phone ?? 'Google account'}</div>
              </div>
            </div>
            <select className="input" value={u.role} disabled={u.id === me?.id} onChange={(e) => save(u, { role: e.target.value as AppRole })} aria-label="Role">
              {(Object.keys(ROLE_LABEL) as AppRole[]).map((r) => (
                <option key={r} value={r}>{ROLE_EMOJI[r]} {ROLE_LABEL[r]}</option>
              ))}
            </select>
            {u.role === 'volunteer' && (
              <div className="grid grid-cols-2 gap-2">
                <select className="input" value={u.category ?? ''} onChange={(e) => save(u, { category: (e.target.value || null) as Category | null })} aria-label="Side">
                  <option value="">Side not set</option>
                  <option value="balak">👦 Balak</option>
                  <option value="balika">👧 Balika</option>
                </select>
                <select className="input" value={u.area_id ?? ''} onChange={(e) => save(u, { area_id: e.target.value ? Number(e.target.value) : null })} aria-label="Area">
                  <option value="">Any area</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
