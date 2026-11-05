import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isHead, useAuth } from '../auth/AuthProvider';
import { MemberCard } from '../components/MemberCard';
import { EmptyState, Modal, PageHeader, Pill, Spinner, STATUS_TONE } from '../components/ui';
import { downloadCsv, parseCsv } from '../lib/csv';
import { supabase } from '../lib/supabase';
import {
  CATEGORY_LABEL,
  endSeq,
  LANGUAGE_LABEL,
  type Area,
  type Category,
  type ImportResult,
  type Language,
  type MemberRow,
  type RecordSource,
} from '../lib/types';

const TEMPLATE: string[][] = [
  ['name', 'phone', 'category', 'area', 'address', 'dob', 'language', 'plan_years', 'issues_remaining', 'receipt_no', 'amount', 'payment_mode'],
  ['Aarav Patel', '9876543210', 'balak', 'Mayur Vihar', 'B-12, Mayur Vihar Ph 1', '2015-06-21', 'gujarati', '1', '', 'R-1021', '150', 'cash'],
  ['Diya Shah', '9812345678', 'balika', 'Dwarka', '', '2017-02-03', 'english', '3', '10', 'R-1022', '400', 'upi'],
];

const SOURCE_LABEL: Record<RecordSource, string> = { online: '🌐 Online', manual: '✍️ By hand', import: '📄 CSV' };

const emptyForm = {
  name: '',
  phone: '',
  category: '' as Category | '',
  area: '',
  address: '',
  dob: '',
  language: '',
  plan_years: '1',
  issues_remaining: '',
  receipt_no: '',
  amount: '',
  payment_mode: '',
};

type Filter = 'all' | 'active' | 'expiring' | 'none';

export default function Members() {
  const { profile } = useAuth();
  const head = isHead(profile);
  const [params] = useSearchParams();
  const allowedCategories: Category[] =
    profile?.role === 'balika_head' ? ['balika'] : profile?.role === 'volunteer' && profile.category ? [profile.category] : ['balak', 'balika'];

  const [rows, setRows] = useState<MemberRow[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [latestSeq, setLatestSeq] = useState<Record<Language, number>>({ gu: 0, en: 0 });
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category | ''>('');
  const [areaId, setAreaId] = useState('');
  const [filter, setFilter] = useState<Filter>(params.get('filter') === 'expiring' ? 'expiring' : 'all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm, category: allowedCategories.length === 1 ? allowedCategories[0] : '' });
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cardFor, setCardFor] = useState<MemberRow | null>(null);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [printCards, setPrintCards] = useState(false);

  const load = useCallback(async () => {
    const [m, i] = await Promise.all([
      supabase.from('members').select('*, areas(name), subscriptions(*)').order('created_at', { ascending: false }).limit(5000),
      supabase.from('issues').select('language, seq_no'),
    ]);
    if (m.error) setError(m.error.message);
    setRows((m.data as MemberRow[]) ?? []);
    const seq = { gu: 0, en: 0 };
    for (const x of (i.data as { language: Language; seq_no: number }[]) ?? []) seq[x.language] = Math.max(seq[x.language], x.seq_no);
    setLatestSeq(seq);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
    supabase.from('areas').select('*').order('name').then(({ data }) => setAreas((data as Area[]) ?? []));
  }, [load]);

  const isExpiring = useCallback(
    (r: MemberRow) => r.subscriptions.some((s) => s.status === 'active' && endSeq(s) - latestSeq[s.language] <= 2),
    [latestSeq],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (category && r.category !== category) return false;
      if (areaId && String(r.area_id ?? '') !== areaId) return false;
      if (filter === 'active' && !r.subscriptions.some((s) => s.status === 'active')) return false;
      if (filter === 'expiring' && !isExpiring(r)) return false;
      if (filter === 'none' && r.subscriptions.some((s) => s.status === 'active' || s.status === 'pending')) return false;
      return !q || r.full_name.toLowerCase().includes(q) || r.phone.includes(q) || r.card_code.toLowerCase() === q;
    });
  }, [rows, search, category, areaId, filter, isExpiring]);

  async function runImport(items: Record<string, string>[], source: RecordSource) {
    setBusy(true);
    setError(null);
    setResult(null);
    const { data, error } = await supabase.rpc('import_members', { p_rows: items, p_source: source });
    setBusy(false);
    if (error) {
      setError(error.message);
      return null;
    }
    setResult(data as ImportResult);
    void load();
    return data as ImportResult;
  }

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const items = await parseCsv(file);
    if (items.length === 0) return setError('The file has no rows.');
    await runImport(items, 'import');
  }

  async function addManual(e: FormEvent) {
    e.preventDefault();
    const res = await runImport([form], 'manual');
    if (res && res.errors.length === 0) {
      // Keep phone and area so siblings sharing a number can be added quickly.
      setForm({ ...form, name: '', dob: '', receipt_no: '', amount: '', issues_remaining: '' });
    }
  }

  function exportCsv() {
    downloadCsv('balaks-balikas.csv', [
      ['name', 'phone', 'category', 'area', 'address', 'card_code', 'subscriptions', 'added_via'],
      ...filtered.map((r) => [
        r.full_name,
        r.phone,
        r.category,
        r.areas?.name ?? '',
        r.address ?? '',
        r.card_code,
        r.subscriptions.map((s) => `${LANGUAGE_LABEL[s.language]} ${s.plan_years}y issues ${s.start_issue_seq}-${endSeq(s)} (${s.status})`).join('; '),
        r.source,
      ]),
    ]);
  }

  const set = (key: keyof typeof emptyForm) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [key]: e.target.value });

  if (printCards) {
    return (
      <div className="space-y-4">
        <div className="no-print flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl">🪪 Member cards ({filtered.length})</h1>
          <div className="flex gap-2">
            <button type="button" className="btn-primary" onClick={() => window.print()}>🖨️ Print</button>
            <button type="button" className="btn-outline" onClick={() => setPrintCards(false)}>← Back</button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
          {filtered.map((r) => (
            <div key={r.id} className="break-inside-avoid">
              <MemberCard name={r.full_name} phone={r.phone} category={r.category} code={r.card_code} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        emoji="🧒"
        tone="sky"
        title="Balaks & Balikas"
        subtitle="Everyone registered by name and mobile number. Signing up with that number shows them their own books."
        actions={
          <>
            {head && (
              <button type="button" className="btn-primary" onClick={() => setShowForm(!showForm)}>
                {showForm ? 'Close form' : '➕ Add person'}
              </button>
            )}
            {head && (
              <label className="btn-outline cursor-pointer">
                {busy ? 'Uploading…' : '📄 Upload CSV'}
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={upload} disabled={busy} />
              </label>
            )}
            {head && <button type="button" className="btn-ghost" onClick={() => downloadCsv('members-template.csv', TEMPLATE)}>Template</button>}
            <button type="button" className="btn-outline" onClick={exportCsv}>⬇️ Export</button>
            <button type="button" className="btn-grape" onClick={() => setPrintCards(true)}>🪪 Cards</button>
          </>
        }
      />

      {head && showForm && (
        <form onSubmit={addManual} className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label">Name *</label>
            <input className="input" value={form.name} onChange={set('name')} required />
          </div>
          <div>
            <label className="label">Mobile number *</label>
            <input className="input" inputMode="numeric" value={form.phone} onChange={set('phone')} required />
          </div>
          <div>
            <label className="label">Category *</label>
            <select className="input" value={form.category} onChange={set('category')} required>
              <option value="">Select</option>
              {allowedCategories.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Area</label>
            <select className="input" value={form.area} onChange={set('area')}>
              <option value="">Select area</option>
              {areas.filter((a) => a.is_active).map((a) => (
                <option key={a.id} value={a.name}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Address</label>
            <input className="input" value={form.address} onChange={set('address')} />
          </div>
          <div>
            <label className="label">Date of birth</label>
            <input type="date" className="input" value={form.dob} onChange={set('dob')} />
          </div>

          <div className="mt-2 font-extrabold text-ink-600 sm:col-span-2 lg:col-span-3">📚 Subscription (leave language empty to skip)</div>
          <div>
            <label className="label">Language</label>
            <select className="input" value={form.language} onChange={set('language')}>
              <option value="">No subscription yet</option>
              <option value="gu">Gujarati (monthly)</option>
              <option value="en">English (every 2 months)</option>
            </select>
          </div>
          <div>
            <label className="label">Plan</label>
            <select className="input" value={form.plan_years} onChange={set('plan_years')}>
              <option value="1">1 year</option>
              <option value="3">3 years</option>
            </select>
          </div>
          <div>
            <label className="label">Issues remaining (existing subscribers)</label>
            <input className="input" inputMode="numeric" placeholder="Full plan if empty" value={form.issues_remaining} onChange={set('issues_remaining')} />
          </div>
          <div>
            <label className="label">Receipt no.</label>
            <input className="input" value={form.receipt_no} onChange={set('receipt_no')} />
          </div>
          <div>
            <label className="label">Amount (₹)</label>
            <input className="input" inputMode="decimal" value={form.amount} onChange={set('amount')} />
          </div>
          <div>
            <label className="label">Payment mode</label>
            <select className="input" value={form.payment_mode} onChange={set('payment_mode')}>
              <option value="">—</option>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save person'}</button>
          </div>
        </form>
      )}

      {result && (
        <div className={result.errors.length ? 'alert-error' : 'alert-ok'}>
          <div>
            {result.created_members} new person(s), {result.existing_members} already existed, {result.created_subscriptions} subscription(s) added.
          </div>
          {result.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {result.errors.map((er) => (
                <li key={er.row}>Row {er.row}: {er.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="alert-error">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', 'All'],
            ['active', '✅ Active'],
            ['expiring', '⏰ Ending soon'],
            ['none', '💤 No subscription'],
          ] as [Filter, string][]
        ).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={`btn btn-sm ${filter === k ? 'bg-ink-800 text-white' : 'btn-outline'}`}>
            {label}
          </button>
        ))}
        <input className="input max-w-xs py-1.5" placeholder="🔎 Name, mobile or card code" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input w-auto py-1.5" value={areaId} onChange={(e) => setAreaId(e.target.value)} aria-label="Area">
          <option value="">📍 All areas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        {allowedCategories.length > 1 && (
          <select className="input w-auto py-1.5" value={category} onChange={(e) => setCategory(e.target.value as Category | '')} aria-label="Category">
            <option value="">Balak + Balika</option>
            <option value="balak">👦 Balaks</option>
            <option value="balika">👧 Balikas</option>
          </select>
        )}
        <span className="self-center text-sm font-bold text-ink-400">{filtered.length} shown</span>
      </div>

      {!loaded && <Spinner />}
      {loaded && rows.length === 0 && <EmptyState title="No one registered yet" hint="Add people by hand, upload a CSV, or open online registration." />}

      {loaded && rows.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((r) => (
            <div key={r.id} className={`card space-y-3 border-l-8 ${r.category === 'balak' ? 'border-l-sky2-400' : 'border-l-bubble-400'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-lg font-extrabold">
                    {r.category === 'balak' ? '👦' : '👧'} {r.full_name}
                  </div>
                  <div className="text-sm font-semibold text-ink-500">
                    {r.phone} · {r.areas?.name ?? 'No area'}
                  </div>
                </div>
                <span className="chip bg-ink-800/5 text-ink-500">{SOURCE_LABEL[r.source]}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {r.subscriptions.length === 0 && <Pill tone="grape">No subscription</Pill>}
                {r.subscriptions.map((s) => (
                  <Pill key={s.id} tone={STATUS_TONE[s.status]}>
                    {s.language === 'gu' ? '📗' : '📘'} {s.plan_years}y · #{s.start_issue_seq}–{endSeq(s)} · {s.status}
                  </Pill>
                ))}
                {isExpiring(r) && <Pill tone="bubble">⏰ ending soon</Pill>}
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-outline btn-sm" onClick={() => setCardFor(r)}>🪪 Card</button>
                {head && <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(r)}>✏️ Edit</button>}
                {isExpiring(r) && (
                  <a
                    className="btn-ghost btn-sm text-bubble-600"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://wa.me/91${r.phone}?text=${encodeURIComponent(`Jai Swaminarayan! ⏰ ${r.full_name}'s Bal Prakash subscription is ending soon. Please renew when registration opens: ${window.location.origin}/register`)}`}
                  >
                    💬 Remind
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={cardFor !== null} onClose={() => setCardFor(null)} title="🪪 Member card">
        {cardFor && (
          <div className="space-y-3">
            <MemberCard name={cardFor.full_name} phone={cardFor.phone} category={cardFor.category} code={cardFor.card_code} />
            <button type="button" className="btn-outline w-full" onClick={() => window.print()}>🖨️ Print</button>
          </div>
        )}
      </Modal>

      <EditModal member={editing} areas={areas} onClose={() => setEditing(null)} onSaved={load} />
    </>
  );
}

function EditModal({ member, areas, onClose, onSaved }: { member: MemberRow | null; areas: Area[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ full_name: '', phone: '', area_id: '', address: '', notes: '' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (member) {
      setF({ full_name: member.full_name, phone: member.phone, area_id: member.area_id ? String(member.area_id) : '', address: member.address ?? '', notes: member.notes ?? '' });
      setError(null);
    }
  }, [member]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!member) return;
    const { error } = await supabase
      .from('members')
      .update({ full_name: f.full_name.trim(), phone: f.phone, area_id: f.area_id ? Number(f.area_id) : null, address: f.address.trim() || null, notes: f.notes.trim() || null })
      .eq('id', member.id);
    if (error) return setError(error.message.includes('duplicate') ? 'Someone with this name and mobile already exists.' : error.message);
    onClose();
    onSaved();
  }

  return (
    <Modal open={member !== null} onClose={onClose} title="✏️ Edit person">
      <form onSubmit={save} className="space-y-3">
        <div>
          <label className="label" htmlFor="e-name">Name</label>
          <input id="e-name" className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} required />
        </div>
        <div>
          <label className="label" htmlFor="e-phone">Mobile number</label>
          <input id="e-phone" className="input" inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required />
          <p className="mt-1 text-xs font-semibold text-ink-400">Changing the number moves these books to whoever signs up with the new number.</p>
        </div>
        <div>
          <label className="label" htmlFor="e-area">Area</label>
          <select id="e-area" className="input" value={f.area_id} onChange={(e) => setF({ ...f, area_id: e.target.value })}>
            <option value="">No area</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="e-address">Address</label>
          <input id="e-address" className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="e-notes">Notes</label>
          <input id="e-notes" className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </div>
        {error && <p className="alert-error">{error}</p>}
        <button type="submit" className="btn-primary w-full">Save changes</button>
      </form>
    </Modal>
  );
}
