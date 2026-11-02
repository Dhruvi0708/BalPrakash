import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { ROLE_LABEL, type AppRole, type Category, type Profile } from '../lib/types';

export default function Users() {
  const { profile: me } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from('profiles').select('*').order('role').order('full_name');
    setUsers((data as Profile[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(u: Profile, role: AppRole, category: Category | null) {
    setError(null);
    const { error } = await supabase
      .from('profiles')
      .update({ role, category: role === 'volunteer' ? category : role === 'balika_head' ? 'balika' : null })
      .eq('id', u.id);
    if (error) setError(error.message);
    void load();
  }

  const q = search.trim().toLowerCase();
  const shown = users.filter((u) => !q || (u.full_name ?? '').toLowerCase().includes(q) || (u.phone ?? '').includes(q));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Team & roles</h1>
        <p className="text-sm text-slate-500">
          Ask a sevak to create an account first, then give them a role here. Volunteers only see their own side.
        </p>
      </div>
      <input className="input max-w-xs" placeholder="Search name or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Side (volunteers)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3">{u.full_name ?? '—'}</td>
                <td className="px-4 py-3">{u.phone ?? '—'}</td>
                <td className="px-4 py-3">
                  <select
                    className="input w-auto"
                    value={u.role}
                    disabled={u.id === me?.id}
                    onChange={(e) => save(u, e.target.value as AppRole, u.category)}
                  >
                    {(Object.keys(ROLE_LABEL) as AppRole[]).map((r) => (
                      <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  {u.role === 'volunteer' ? (
                    <select
                      className="input w-auto"
                      value={u.category ?? ''}
                      onChange={(e) => save(u, u.role, (e.target.value || null) as Category | null)}
                    >
                      <option value="">Not set</option>
                      <option value="balak">Balak</option>
                      <option value="balika">Balika</option>
                    </select>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
