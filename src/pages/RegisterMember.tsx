import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Confetti } from '../components/Art';
import { PageHeader } from '../components/ui';
import { downloadCsv, parseCsv } from '../lib/csv';
import { fetchAreas, fetchCycles } from '../lib/data';
import { supabase } from '../lib/supabase';
import { CATEGORY_LABEL, type Area, type Category, type ImportResult, type RegistrationCycle } from '../lib/types';

const TEMPLATE: string[][] = [
  ['name', 'phone', 'category', 'mandal', 'address', 'dob', 'language', 'plan_years', 'issues_remaining', 'receipt_no', 'amount', 'payment_mode'],
  ['Aarav Patel', '9876543210', 'balak', 'Mayur Vihar', 'B-12, Mayur Vihar Ph 1', '2015-06-21', 'gujarati', '1', '', 'R-1021', '150', 'cash'],
  ['Diya Patel', '9876543210', 'balika', 'Mayur Vihar', '', '2017-02-03', 'english', '3', '10', 'R-1022', '400', 'upi'],
];

const empty = {
  name: '',
  phone: '',
  category: '' as Category | '',
  area_id: '',
  language: 'gu',
  plan_years: '1',
  issues_remaining: '',
  receipt_no: '',
  amount: '',
  payment_mode: '',
  address: '',
  dob: '',
  notes: '',
};

interface Registered {
  member_code: string;
  full_name: string;
  registration_year: number;
}

export default function RegisterMember() {
  const [params] = useSearchParams();
  const startCategory = params.get('category');
  const [areas, setAreas] = useState<Area[]>([]);
  const [cycle, setCycle] = useState<RegistrationCycle | null | undefined>(undefined);
  const [form, setForm] = useState({ ...empty, category: startCategory === 'balak' || startCategory === 'balika' ? startCategory : '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Registered | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    void fetchAreas().then(setAreas);
    void fetchCycles().then((c) => setCycle(c.find((x) => x.is_current) ?? null));
  }, []);

  const set = (key: keyof typeof empty) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [key]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    setBusy(true);
    const { data, error } = await supabase.rpc('register_member', {
      p_name: form.name,
      p_phone: form.phone,
      p_category: form.category,
      p_area_id: form.area_id ? Number(form.area_id) : null,
      p_language: form.language,
      p_plan_years: Number(form.plan_years),
      p_address: form.address || null,
      p_dob: form.dob || null,
      p_notes: form.notes || null,
      p_receipt_no: form.receipt_no || null,
      p_amount: form.amount ? Number(form.amount) : null,
      p_payment_mode: form.payment_mode || null,
      p_issues_remaining: form.issues_remaining ? Number(form.issues_remaining) : null,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setDone(data as Registered);
    // Keep mobile, mandal and plan so brothers and sisters can be added straight after.
    setForm({ ...form, name: '', dob: '', receipt_no: '', amount: '', issues_remaining: '', notes: '' });
  }

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setResult(null);
    const rows = await parseCsv(file);
    if (rows.length === 0) return setError('The file has no rows.');
    setBusy(true);
    const { data, error } = await supabase.rpc('import_members', { p_rows: rows, p_source: 'import' });
    setBusy(false);
    if (error) return setError(error.message);
    setResult(data as ImportResult);
  }

  return (
    <>
      <PageHeader
        emoji="📝"
        tone="leaf"
        title="Register Member"
        subtitle="Only the Main Head registers Balaks and Balikas. A permanent Member ID is created automatically."
      />

      {cycle === null && (
        <div className="alert-error">
          No registration year is open yet. <Link to="/registration" className="font-extrabold underline">Start one on Annual Registration</Link> first.
        </div>
      )}
      {cycle && (
        <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-ink-600">
          <span className="rounded-full bg-leaf-100 px-3 py-1 text-leaf-700">📅 Registering for {cycle.year}</span>
          Several children can share one mobile number. Each gets their own Member ID.
        </div>
      )}

      {done && (
        <div className="relative overflow-hidden rounded-4xl bg-gradient-to-br from-leaf-400 to-sky2-400 p-6 text-white shadow-soft">
          <Confetti pieces={24} />
          <div className="relative">
            <div className="text-sm font-bold opacity-90">🎉 Registered for {done.registration_year}</div>
            <div className="text-2xl font-extrabold">{done.full_name}</div>
            <div className="mt-2 inline-block rounded-2xl bg-white px-4 py-2 font-mono text-2xl font-extrabold text-ink-800">{done.member_code}</div>
            <p className="mt-2 text-sm font-semibold opacity-95">Mobile and mandal are kept below so you can add a brother or sister quickly.</p>
          </div>
        </div>
      )}

      <form onSubmit={save} className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="label" htmlFor="m-id">Member ID</label>
          <input id="m-id" className="input bg-ink-800/5" value="Created automatically" disabled />
        </div>
        <div>
          <label className="label" htmlFor="m-name">Member name *</label>
          <input id="m-name" className="input" value={form.name} onChange={set('name')} required />
        </div>
        <div>
          <label className="label" htmlFor="m-phone">Mobile number *</label>
          <input id="m-phone" className="input" inputMode="numeric" placeholder="98765 43210" value={form.phone} onChange={set('phone')} required />
        </div>
        <div>
          <label className="label">Category *</label>
          <div className="flex gap-2">
            {(['balak', 'balika'] as Category[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setForm({ ...form, category: c })}
                className={`btn flex-1 ${form.category === c ? (c === 'balak' ? 'bg-sky2-500 text-white shadow-pop' : 'bg-bubble-500 text-white shadow-pop') : 'btn-outline'}`}
                aria-pressed={form.category === c}
              >
                {c === 'balak' ? '👦' : '👧'} {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="m-area">Mandal{areas.length > 0 ? ' *' : ''}</label>
          <select id="m-area" className="input" value={form.area_id} onChange={set('area_id')} required={areas.length > 0}>
            <option value="">Select mandal</option>
            {areas.filter((a) => a.is_active).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          {areas.length === 0 && <p className="mt-1 text-xs font-semibold text-ink-400">No mandals in the list yet. Upload a sheet with a mandal column below and they are added.</p>}
        </div>
        <div>
          <label className="label" htmlFor="m-lang">Bal Prakash</label>
          <select id="m-lang" className="input" value={form.language} onChange={set('language')}>
            <option value="gu">📗 Gujarati (monthly)</option>
            <option value="en">📘 English (every 2 months)</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="m-plan">Plan</label>
          <select id="m-plan" className="input" value={form.plan_years} onChange={set('plan_years')}>
            <option value="1">1 year</option>
            <option value="3">3 years</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="m-receipt">Receipt no.</label>
          <input id="m-receipt" className="input" value={form.receipt_no} onChange={set('receipt_no')} />
        </div>
        <div>
          <label className="label" htmlFor="m-amount">Amount (₹)</label>
          <input id="m-amount" className="input" inputMode="decimal" value={form.amount} onChange={set('amount')} />
        </div>

        <details className="sm:col-span-2 lg:col-span-3">
          <summary className="cursor-pointer text-sm font-extrabold text-ink-500">More details (optional)</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="label" htmlFor="m-mode">Payment mode</label>
              <select id="m-mode" className="input" value={form.payment_mode} onChange={set('payment_mode')}>
                <option value="">—</option>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="m-dob">Date of birth</label>
              <input id="m-dob" type="date" className="input" value={form.dob} onChange={set('dob')} />
            </div>
            <div>
              <label className="label" htmlFor="m-left">Books remaining (only if part-way through a plan)</label>
              <input id="m-left" className="input" inputMode="numeric" placeholder="Full plan if empty" value={form.issues_remaining} onChange={set('issues_remaining')} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="m-address">Address</label>
              <input id="m-address" className="input" value={form.address} onChange={set('address')} />
            </div>
            <div>
              <label className="label" htmlFor="m-notes">Notes</label>
              <input id="m-notes" className="input" value={form.notes} onChange={set('notes')} />
            </div>
          </div>
        </details>

        {error && <p className="alert-error sm:col-span-2 lg:col-span-3">{error}</p>}
        <div className="sm:col-span-2 lg:col-span-3">
          <button type="submit" className="btn-primary" disabled={busy || !form.category || !cycle}>
            {busy ? 'Saving…' : '✨ Register & create Member ID'}
          </button>
        </div>
      </form>

      <div className="card space-y-3">
        <h2 className="text-lg">📄 Add many at once from a sheet</h2>
        <p className="text-sm font-semibold text-ink-500">
          Upload a CSV with one row per child. People already registered (same name and mobile) are not added twice. Each new child gets a Member ID.
        </p>
        <div className="flex flex-wrap gap-2">
          <label className={`btn-outline cursor-pointer ${!cycle ? 'pointer-events-none opacity-50' : ''}`}>
            {busy ? 'Uploading…' : '⬆️ Upload CSV'}
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={upload} disabled={busy || !cycle} />
          </label>
          <button type="button" className="btn-ghost" onClick={() => downloadCsv('members-template.csv', TEMPLATE)}>Download template</button>
        </div>
        {result && (
          <div className={result.errors.length ? 'alert-error' : 'alert-ok'}>
            <div>
              {result.created_members} new member(s), {result.existing_members} already registered, {result.created_subscriptions} registration(s) added.
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
      </div>
    </>
  );
}
