import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { EmptyState, Modal, PageHeader, Pill, Spinner } from '../components/ui';
import { fetchAll, fetchAreas } from '../lib/data';
import { supabase } from '../lib/supabase';
import { CATEGORY_LABEL, type Area, type Category, type TeamMember } from '../lib/types';

interface Counts {
  holding: number;
  delivered: number;
}

const blank = { full_name: '', phone: '', email: '', role: 'volunteer' as TeamMember['role'], category: '' as Category | '', area_id: '' };

export default function Volunteers() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [counts, setCounts] = useState<Record<number, Counts>>({});
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<TeamMember | 'new' | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(async () => {
    const [t, d] = await Promise.all([
      supabase.from('team_members').select('*').order('role').order('full_name'),
      fetchAll<{ volunteer_id: number; status: string }>(() =>
        supabase.from('distributions').select('volunteer_id, status').not('volunteer_id', 'is', null),
      ),
    ]);
    setTeam((t.data as TeamMember[]) ?? []);
    const c: Record<number, Counts> = {};
    for (const row of d) {
      c[row.volunteer_id] ??= { holding: 0, delivered: 0 };
      if (row.status === 'given_to_volunteer') c[row.volunteer_id].holding++;
      if (row.status === 'delivered') c[row.volunteer_id].delivered++;
    }
    setCounts(c);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
    void fetchAreas().then(setAreas);
  }, [load]);

  const areaName = (id: number | null) => areas.find((a) => a.id === id)?.name ?? 'Any mandal';
  const shown = team.filter((t) => showInactive || t.is_active);

  return (
    <>
      <PageHeader
        emoji="🙋"
        tone="grape"
        title="Volunteers"
        subtitle="Add a volunteer with their mobile number. When they create an account with that number, they get their own login automatically."
        actions={<button type="button" className="btn-primary" onClick={() => setEditing('new')}>➕ Add volunteer</button>}
      />

      <label className="flex items-center gap-2 text-sm font-bold text-ink-500">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show removed volunteers
      </label>

      {!loaded && <Spinner />}
      {loaded && shown.length === 0 && <EmptyState title="No volunteers yet" hint="Add your first volunteer with their name and mobile number." />}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((t) => (
          <div key={t.id} className={`card space-y-2 ${t.is_active ? '' : 'opacity-60'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-lg font-extrabold">{t.role === 'balika_head' ? '👑' : '🙋'} {t.full_name}</div>
                <div className="text-sm font-semibold text-ink-500">📱 {t.phone} · 📍 {areaName(t.area_id)}</div>
              </div>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(t)}>✏️</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Pill tone={t.role === 'balika_head' ? 'bubble' : 'grape'}>{t.role === 'balika_head' ? 'Balika Head' : 'Volunteer'}</Pill>
              <Pill tone="sky">{t.category ? CATEGORY_LABEL[t.category] : 'Balak + Balika'}</Pill>
              {t.user_id ? <Pill tone="leaf">✅ Login active</Pill> : <Pill tone="sunny">⏳ Not signed up yet</Pill>}
              {!t.is_active && <Pill tone="bubble">Removed</Pill>}
            </div>
            {t.role === 'volunteer' && (
              <div className="text-sm font-bold text-ink-600">
                🤝 {counts[t.id]?.holding ?? 0} with them · 🎉 {counts[t.id]?.delivered ?? 0} delivered
              </div>
            )}
          </div>
        ))}
      </div>

      <TeamForm member={editing} areas={areas} onClose={() => setEditing(null)} onSaved={load} />
    </>
  );
}

function TeamForm({ member, areas, onClose, onSaved }: { member: TeamMember | 'new' | null; areas: Area[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isNew = member === 'new';

  useEffect(() => {
    setError(null);
    if (member === 'new') setF(blank);
    else if (member)
      setF({
        full_name: member.full_name,
        phone: member.phone,
        email: member.email ?? '',
        role: member.role,
        category: member.category ?? '',
        area_id: member.area_id ? String(member.area_id) : '',
      });
  }, [member]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const row = {
      full_name: f.full_name.trim(),
      phone: f.phone,
      email: f.email.trim() || null,
      role: f.role,
      category: f.role === 'balika_head' ? 'balika' : f.category || null,
      area_id: f.area_id ? Number(f.area_id) : null,
    };
    const { error } = isNew
      ? await supabase.from('team_members').insert([row])
      : await supabase.from('team_members').update(row).eq('id', (member as TeamMember).id);
    setBusy(false);
    if (error) return setError(error.message.includes('team_members_phone_key') ? 'Someone on the team already has this mobile number.' : error.message);
    onClose();
    onSaved();
  }

  async function setActive(active: boolean) {
    if (!member || member === 'new') return;
    const msg = active
      ? `Bring ${member.full_name} back on the team?`
      : `Remove ${member.full_name}? Their login stops working. Books already handed to them stay in the records.`;
    if (!window.confirm(msg)) return;
    const { error } = await supabase.from('team_members').update({ is_active: active }).eq('id', member.id);
    if (error) return setError(error.message);
    onClose();
    onSaved();
  }

  return (
    <Modal open={member !== null} onClose={onClose} title={isNew ? '➕ Add volunteer' : '✏️ Edit team member'}>
      <form onSubmit={save} className="space-y-3">
        <div>
          <label className="label" htmlFor="t-name">Name *</label>
          <input id="t-name" className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} required />
        </div>
        <div>
          <label className="label" htmlFor="t-phone">Mobile number *</label>
          <input id="t-phone" className="input" inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required />
          <p className="mt-1 text-xs font-semibold text-ink-400">They sign up in the app with this number and their own password.</p>
        </div>
        <div>
          <label className="label" htmlFor="t-role">Role</label>
          <select id="t-role" className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as TeamMember['role'] })}>
            <option value="volunteer">Volunteer</option>
            <option value="balika_head">Balika Head</option>
          </select>
        </div>
        {f.role === 'volunteer' && (
          <div>
            <label className="label" htmlFor="t-side">Side</label>
            <select id="t-side" className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as Category | '' })}>
              <option value="">Balak + Balika</option>
              <option value="balak">Balak only</option>
              <option value="balika">Balika only</option>
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="t-area">Mandal</label>
          <select id="t-area" className="input" value={f.area_id} onChange={(e) => setF({ ...f, area_id: e.target.value })}>
            <option value="">Any mandal</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <details>
          <summary className="cursor-pointer text-sm font-extrabold text-ink-500">Signs in with Google instead?</summary>
          <div className="mt-2">
            <label className="label" htmlFor="t-email">Google email</label>
            <input id="t-email" type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </div>
        </details>
        {error && <p className="alert-error">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        {!isNew && member && (
          <button type="button" className="btn-ghost w-full text-bubble-600" onClick={() => void setActive(!member.is_active)}>
            {member.is_active ? 'Remove from team' : 'Bring back on team'}
          </button>
        )}
      </form>
    </Modal>
  );
}
