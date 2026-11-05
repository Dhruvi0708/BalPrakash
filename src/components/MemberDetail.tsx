import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { isMainHead, useAuth } from '../auth/AuthProvider';
import { formatDateTime } from '../lib/dates';
import { fetchAreas, fetchBookRows } from '../lib/data';
import { undoBookStatus } from '../lib/offline';
import { supabase } from '../lib/supabase';
import {
  CATEGORY_LABEL,
  endSeq,
  issueLabel,
  LANGUAGE_LABEL,
  STATUS_EMOJI,
  STATUS_LABEL,
  type Area,
  type BookEvent,
  type BookRow,
  type MemberRow,
  type RegistrationCycle,
} from '../lib/types';
import { HandoverModal, StatusPill, type HandoverMode } from './BookActions';
import { Modal, Pill, Spinner } from './ui';

/** Everything about one member: details, registrations, every book and its full history. */
export function MemberDetail({ memberId, onClose, onChanged }: { memberId: number | null; onClose: () => void; onChanged?: () => void }) {
  const { profile } = useAuth();
  const main = isMainHead(profile);
  const [member, setMember] = useState<MemberRow | null>(null);
  const [books, setBooks] = useState<BookRow[]>([]);
  const [events, setEvents] = useState<BookEvent[]>([]);
  const [cycles, setCycles] = useState<RegistrationCycle[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<HandoverMode | null>(null);
  const [selected, setSelected] = useState<BookRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [renewing, setRenewing] = useState(false);

  const load = useCallback(async () => {
    if (memberId === null) return;
    setLoading(true);
    const [m, b, c] = await Promise.all([
      supabase.from('members').select('*, areas(name), subscriptions(*)').eq('id', memberId).maybeSingle(),
      fetchBookRows((q) => q.eq('member_id', memberId)),
      supabase.from('registration_cycles').select('*').order('year', { ascending: false }),
    ]);
    setMember((m.data as MemberRow | null) ?? null);
    setBooks(b);
    setCycles((c.data as RegistrationCycle[]) ?? []);
    if (b.length) {
      const { data } = await supabase.from('distribution_events').select('*').in('distribution_id', b.map((x) => x.id)).order('at');
      setEvents((data as BookEvent[]) ?? []);
    } else setEvents([]);
    setLoading(false);
  }, [memberId]);

  useEffect(() => {
    setMessage(null);
    setEditing(false);
    setRenewing(false);
    void load();
  }, [load]);

  const changed = () => {
    void load();
    onChanged?.();
  };

  function act(m: HandoverMode, rows: BookRow[]) {
    setSelected(rows);
    setMode(m);
  }

  async function undo(row: BookRow) {
    const res = await undoBookStatus([row.id]);
    setMessage(res.error ? `⚠️ ${res.error}` : '↩️ Moved one step back.');
    changed();
  }

  const pending = books.filter((b) => b.status === 'pending');
  const current = cycles.find((c) => c.is_current);
  const yearOf = (cycleId: number | null) => cycles.find((c) => c.id === cycleId)?.year;
  const inCurrent = member?.subscriptions.some((s) => s.cycle_id === current?.id && s.status === 'active');

  return (
    <Modal open={memberId !== null} onClose={onClose} title={member ? `${member.category === 'balak' ? '👦' : '👧'} ${member.full_name}` : 'Member'}>
      {loading && !member && <Spinner />}
      {member && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-2xl bg-ink-800 px-3 py-1 font-mono text-sm font-bold text-white">{member.member_code}</span>
            <Pill tone={member.category === 'balak' ? 'sky' : 'bubble'}>{CATEGORY_LABEL[member.category]}</Pill>
            <span className="text-sm font-bold text-ink-500">
              📱 {member.phone} · 📍 {member.areas?.name ?? 'No mandal'}
            </span>
          </div>
          {member.address && <p className="text-sm font-semibold text-ink-500">🏠 {member.address}</p>}

          <div className="flex flex-wrap gap-1.5">
            {member.subscriptions.length === 0 && <Pill tone="grape">Not registered for any year</Pill>}
            {member.subscriptions.map((s) => (
              <Pill key={s.id} tone={s.status === 'active' ? 'leaf' : 'grape'}>
                {yearOf(s.cycle_id) ?? '—'} · {LANGUAGE_LABEL[s.language]} {s.plan_years} yr · books #{s.start_issue_seq}–{endSeq(s)} · {s.status}
              </Pill>
            ))}
          </div>

          {main && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(!editing)}>✏️ Edit details</button>
              {current && !inCurrent && (
                <button type="button" className="btn-outline btn-sm" onClick={() => setRenewing(!renewing)}>📝 Register for {current.year}</button>
              )}
            </div>
          )}
          {editing && <EditMember member={member} onSaved={() => { setEditing(false); changed(); }} />}
          {renewing && current && <RenewForm memberId={member.id} year={current.year} onSaved={() => { setRenewing(false); changed(); }} />}

          {message && <p className="alert-ok">{message}</p>}

          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg">📚 Books ({books.length})</h3>
            {pending.length > 1 && (
              <div className="flex gap-1.5">
                <button type="button" className="btn-green btn-sm" onClick={() => act('given', pending)}>✅ Give all {pending.length}</button>
                <button type="button" className="btn-sky btn-sm" onClick={() => act('given_to_volunteer', pending)}>🤝 To volunteer</button>
              </div>
            )}
          </div>
          {books.length === 0 && <p className="text-sm font-semibold text-ink-400">No books yet. Books appear here once stock for an issue is recorded.</p>}
          <ul className="space-y-2">
            {books.map((b) => (
              <li key={b.id} className="rounded-3xl border-2 border-ink-800/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-extrabold">{issueLabel(b)}</div>
                  <StatusPill status={b.status} />
                </div>
                <div className="mt-1 text-xs font-semibold text-ink-500">
                  {b.volunteer_name && <>🤝 {b.volunteer_name} · </>}
                  {b.handed_on && <>handed over {formatDateTime(b.handed_on)}{b.handed_by_name ? ` by ${b.handed_by_name}` : ''}</>}
                  {b.delivered_on && <> · delivered {formatDateTime(b.delivered_on)}</>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {b.status === 'pending' && (
                    <>
                      <button type="button" className="btn-green btn-sm" onClick={() => act('given', [b])}>✅ Give Book</button>
                      <button type="button" className="btn-sky btn-sm" onClick={() => act('given_to_volunteer', [b])}>🤝 Give to Volunteer</button>
                    </>
                  )}
                  {b.status === 'given_to_volunteer' && (
                    <button type="button" className="btn-grape btn-sm" onClick={() => act('delivered', [b])}>🎉 Mark delivered</button>
                  )}
                  {b.status !== 'pending' && (
                    <button type="button" className="btn-ghost btn-sm" onClick={() => void undo(b)}>↩️ Undo</button>
                  )}
                </div>
                <History events={events.filter((e) => e.distribution_id === b.id)} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <HandoverModal
        books={selected}
        mode={mode}
        onClose={() => setMode(null)}
        onDone={(msg) => {
          setMode(null);
          setMessage(msg);
          changed();
        }}
      />
    </Modal>
  );
}

function History({ events }: { events: BookEvent[] }) {
  const [open, setOpen] = useState(false);
  if (events.length === 0) return null;
  return (
    <div className="mt-2">
      <button type="button" className="text-xs font-extrabold text-saffron-600 hover:underline" onClick={() => setOpen(!open)}>
        {open ? 'Hide history' : `History (${events.length})`}
      </button>
      {open && (
        <ol className="mt-1 space-y-1 border-l-2 border-saffron-200 pl-3 text-xs font-semibold text-ink-500">
          {events.map((e) => (
            <li key={e.id}>
              {STATUS_EMOJI[e.status]} <b>{STATUS_LABEL[e.status]}</b>
              {e.volunteer_name ? ` · ${e.volunteer_name}` : ''} · {formatDateTime(e.at)}
              {e.by_name ? ` · by ${e.by_name}` : ''}
              {e.note ? ` · ${e.note}` : ''}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function EditMember({ member, onSaved }: { member: MemberRow; onSaved: () => void }) {
  const [areas, setAreas] = useState<Area[]>([]);
  const [f, setF] = useState({
    full_name: member.full_name,
    phone: member.phone,
    area_id: member.area_id ? String(member.area_id) : '',
    address: member.address ?? '',
    notes: member.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchAreas().then(setAreas);
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase
      .from('members')
      .update({
        full_name: f.full_name.trim(),
        phone: f.phone,
        area_id: f.area_id ? Number(f.area_id) : null,
        address: f.address.trim() || null,
        notes: f.notes.trim() || null,
      })
      .eq('id', member.id);
    if (error) return setError(error.message.includes('duplicate') ? 'Someone with this name and mobile already exists.' : error.message);
    onSaved();
  }

  return (
    <form onSubmit={save} className="grid gap-3 rounded-3xl bg-saffron-50 p-4 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="e-name">Name</label>
        <input id="e-name" className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} required />
      </div>
      <div>
        <label className="label" htmlFor="e-phone">Mobile number</label>
        <input id="e-phone" className="input" inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required />
      </div>
      <div>
        <label className="label" htmlFor="e-area">Mandal</label>
        <select id="e-area" className="input" value={f.area_id} onChange={(e) => setF({ ...f, area_id: e.target.value })}>
          <option value="">No mandal</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="e-address">Address</label>
        <input id="e-address" className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="e-notes">Notes</label>
        <input id="e-notes" className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </div>
      <p className="text-xs font-semibold text-ink-400 sm:col-span-2">The Member ID ({member.member_code}) and category never change.</p>
      {error && <p className="alert-error sm:col-span-2">{error}</p>}
      <button type="submit" className="btn-primary sm:col-span-2">Save changes</button>
    </form>
  );
}

export function RenewForm({ memberId, year, onSaved }: { memberId: number; year: number; onSaved: () => void }) {
  const [language, setLanguage] = useState('gu');
  const [plan, setPlan] = useState('1');
  const [receipt, setReceipt] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.rpc('add_registration', {
      p_member_id: memberId,
      p_language: language,
      p_plan_years: Number(plan),
      p_receipt_no: receipt.trim() || null,
      p_amount: amount ? Number(amount) : null,
    });
    if (error) return setError(error.message);
    onSaved();
  }

  return (
    <form onSubmit={save} className="grid gap-3 rounded-3xl bg-leaf-50 p-4 sm:grid-cols-2">
      <div className="font-extrabold sm:col-span-2">📝 Register for {year}</div>
      <div>
        <label className="label" htmlFor="r-lang">Language</label>
        <select id="r-lang" className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="gu">Gujarati (monthly)</option>
          <option value="en">English (every 2 months)</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="r-plan">Plan</label>
        <select id="r-plan" className="input" value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="1">1 year</option>
          <option value="3">3 years</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="r-receipt">Receipt no.</label>
        <input id="r-receipt" className="input" value={receipt} onChange={(e) => setReceipt(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="r-amount">Amount (₹)</label>
        <input id="r-amount" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      {error && <p className="alert-error sm:col-span-2">{error}</p>}
      <button type="submit" className="btn-green sm:col-span-2">Save registration</button>
    </form>
  );
}
