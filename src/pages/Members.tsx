import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { isHead, useAuth } from '../auth/AuthProvider';
import { downloadCsv, parseCsv } from '../lib/csv';
import { supabase } from '../lib/supabase';
import {
  CATEGORY_LABEL,
  LANGUAGE_LABEL,
  type Area,
  type Category,
  type ImportResult,
  type MemberRow,
  type RecordSource,
} from '../lib/types';

const TEMPLATE: string[][] = [
  ['parent_name', 'phone', 'area', 'address', 'child_name', 'category', 'dob', 'language', 'plan_years', 'issues_remaining', 'receipt_no', 'amount', 'payment_mode'],
  ['Ramesh Patel', '9876543210', 'Mayur Vihar', 'B-12, Mayur Vihar Ph 1', 'Aarav Patel', 'balak', '2015-06-21', 'gujarati', '1', '', 'R-1021', '150', 'cash'],
  ['Ramesh Patel', '9876543210', 'Mayur Vihar', '', 'Diya Patel', 'balika', '2017-02-03', 'english', '3', '10', 'R-1022', '400', 'upi'],
];

const SOURCE_LABEL: Record<RecordSource, string> = { online: 'Online form', manual: 'Added by hand', import: 'CSV import' };

const emptyForm = {
  parent_name: '',
  phone: '',
  area: '',
  address: '',
  child_name: '',
  category: '' as Category | '',
  dob: '',
  language: '',
  plan_years: '1',
  issues_remaining: '',
  receipt_no: '',
  amount: '',
  payment_mode: '',
};

export default function Members() {
  const { profile } = useAuth();
  const head = isHead(profile);
  const allowedCategories: Category[] =
    profile?.role === 'balika_head' ? ['balika'] : profile?.role === 'volunteer' && profile.category ? [profile.category] : ['balak', 'balika'];

  const [rows, setRows] = useState<MemberRow[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category | ''>('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm, category: allowedCategories.length === 1 ? allowedCategories[0] : '' });
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error } = await supabase
      .from('members')
      .select('*, families(parent_name, phone, access_code, areas(name)), subscriptions(*)')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) setError(error.message);
    setRows((data as MemberRow[]) ?? []);
  }

  useEffect(() => {
    void load();
    supabase
      .from('areas')
      .select('*')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setAreas((data as Area[]) ?? []));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!category || r.category === category) &&
        (!q ||
          r.full_name.toLowerCase().includes(q) ||
          r.families.parent_name.toLowerCase().includes(q) ||
          r.families.phone.includes(q)),
    );
  }, [rows, search, category]);

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
      // Keep the parent details so siblings can be added quickly.
      setForm({ ...form, child_name: '', dob: '', receipt_no: '', amount: '', issues_remaining: '' });
    }
  }

  const set = (key: keyof typeof emptyForm) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [key]: e.target.value });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Balaks & Balikas</h1>
          <p className="text-sm text-slate-500">
            Records added by hand, by CSV upload, or (once registration opens) through the online form all appear here.
          </p>
        </div>
        {head && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Close form' : '+ Add member'}
            </button>
            <label className="btn-outline cursor-pointer">
              {busy ? 'Uploading…' : 'Upload CSV'}
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={upload} disabled={busy} />
            </label>
            <button type="button" className="btn-outline" onClick={() => downloadCsv('members-template.csv', TEMPLATE)}>
              CSV template
            </button>
          </div>
        )}
      </div>

      {head && showForm && (
        <form onSubmit={addManual} className="card grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 font-medium">Parent / family</div>
          <div>
            <label className="label">Parent name *</label>
            <input className="input" value={form.parent_name} onChange={set('parent_name')} required />
          </div>
          <div>
            <label className="label">Mobile number *</label>
            <input className="input" inputMode="numeric" value={form.phone} onChange={set('phone')} required />
          </div>
          <div>
            <label className="label">Area</label>
            <select className="input" value={form.area} onChange={set('area')}>
              <option value="">Select area</option>
              {areas.map((a) => (
                <option key={a.id} value={a.name}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Address</label>
            <input className="input" value={form.address} onChange={set('address')} />
          </div>

          <div className="sm:col-span-2 mt-2 font-medium">Child</div>
          <div>
            <label className="label">Child name *</label>
            <input className="input" value={form.child_name} onChange={set('child_name')} required />
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
            <label className="label">Date of birth</label>
            <input type="date" className="input" value={form.dob} onChange={set('dob')} />
          </div>

          <div className="sm:col-span-2 mt-2 font-medium">Subscription (leave language empty to skip)</div>
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
            <label className="label">Issues remaining (existing subscribers only)</label>
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
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save member'}</button>
          </div>
        </form>
      )}

      {result && (
        <div className={`rounded-lg px-4 py-3 text-sm ${result.errors.length ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-700'}`}>
          <div>
            {result.created_members} new member(s), {result.existing_members} already existed, {result.created_subscriptions} subscription(s) added.
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
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Search name or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
        {allowedCategories.length > 1 && (
          <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value as Category | '')}>
            <option value="">All</option>
            <option value="balak">Balaks</option>
            <option value="balika">Balikas</option>
          </select>
        )}
        <span className="self-center text-sm text-slate-500">{filtered.length} shown</span>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Child</th>
              <th className="px-4 py-3">Parent</th>
              <th className="px-4 py-3">Area</th>
              <th className="px-4 py-3">Subscriptions</th>
              <th className="px-4 py-3">Family code</th>
              <th className="px-4 py-3">Added via</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{r.full_name}</div>
                  <div className="text-xs text-slate-500">{CATEGORY_LABEL[r.category]}</div>
                </td>
                <td className="px-4 py-3">
                  <div>{r.families.parent_name}</div>
                  <div className="text-xs text-slate-500">{r.families.phone}</div>
                </td>
                <td className="px-4 py-3">{r.families.areas?.name ?? '—'}</td>
                <td className="px-4 py-3">
                  {r.subscriptions.length === 0 && <span className="text-slate-400">None</span>}
                  {r.subscriptions.map((s) => (
                    <div key={s.id} className="text-xs">
                      {LANGUAGE_LABEL[s.language]} · {s.plan_years}y · issues {s.start_issue_seq}–{s.start_issue_seq + s.total_issues - 1}{' '}
                      <span className={s.status === 'active' ? 'text-green-700' : 'text-amber-700'}>({s.status})</span>
                    </div>
                  ))}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{r.families.access_code}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{SOURCE_LABEL[r.source]}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No records yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
