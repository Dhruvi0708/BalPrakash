import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { formatDateTime } from '../lib/dates';
import { isValidPhone } from '../lib/phone';
import { supabase } from '../lib/supabase';
import type { Area, RegistrationWindow } from '../lib/types';

const emptyForm = {
  name: '',
  phone: '',
  category: '',
  area_id: '',
  address: '',
  dob: '',
  language: '',
  plan_years: '1',
  payment_mode: '',
  receipt_no: '',
  amount: '',
};

export default function Register() {
  const [window_, setWindow] = useState<RegistrationWindow | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ name: string; phone: string } | null>(null);

  useEffect(() => {
    // The open window, or else the next upcoming one.
    Promise.all([
      supabase
        .from('registration_windows')
        .select('*')
        .gt('closes_at', new Date().toISOString())
        .order('opens_at')
        .limit(1),
      supabase.from('areas').select('*').eq('is_active', true).order('name'),
    ]).then(([w, a]) => {
      setWindow(((w.data as RegistrationWindow[]) ?? [])[0] ?? null);
      setAreas((a.data as Area[]) ?? []);
      setLoaded(true);
    });
  }, []);

  const isOpen = window_ !== null && new Date(window_.opens_at) <= new Date();

  const set = (key: keyof typeof emptyForm) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidPhone(form.phone)) return setError('Enter a valid 10-digit mobile number.');
    setBusy(true);
    const { data, error } = await supabase.rpc('submit_registration', {
      p_name: form.name,
      p_phone: form.phone,
      p_category: form.category,
      p_language: form.language,
      p_plan_years: Number(form.plan_years),
      p_area_id: form.area_id ? Number(form.area_id) : null,
      p_address: form.address || null,
      p_dob: form.dob || null,
      p_payment_mode: form.payment_mode || null,
      p_receipt_no: form.receipt_no || null,
      p_amount: form.amount ? Number(form.amount) : null,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setDone(data as { name: string; phone: string });
  }

  function registerAnother() {
    // Keep contact details so siblings sharing a number are quick to add.
    setForm({ ...emptyForm, phone: form.phone, area_id: form.area_id, address: form.address, payment_mode: form.payment_mode });
    setDone(null);
  }

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-xl space-y-5">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-saffron-600 text-2xl font-bold text-white">બા</div>
          <h1 className="text-2xl font-semibold">Bal Prakash registration</h1>
          <p className="text-sm text-slate-500">Delhi · Gujarati (monthly) and English (every 2 months)</p>
        </div>

        {!loaded && <div className="card text-center text-slate-500">Loading…</div>}

        {loaded && !isOpen && (
          <div className="card space-y-2 text-center">
            <div className="text-lg font-medium">Registration is closed right now</div>
            {window_ ? (
              <p className="text-sm text-slate-600">
                <b>{window_.title}</b> opens on {formatDateTime(window_.opens_at)}.
              </p>
            ) : (
              <p className="text-sm text-slate-600">Please check again later or contact your Bal Prakash head.</p>
            )}
          </div>
        )}

        {loaded && isOpen && done && (
          <div className="card space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">✓</div>
            <div>
              <div className="text-lg font-semibold">Registration received for {done.name}</div>
              <p className="mt-1 text-sm text-slate-600">
                Your head will check the payment and confirm it. To follow your books, create an account with mobile number{' '}
                <b>{done.phone}</b>.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" className="btn-outline" onClick={registerAnother}>Register another person</button>
              <Link to="/" className="btn-primary">Sign in / create account</Link>
            </div>
          </div>
        )}

        {loaded && isOpen && !done && window_ && (
          <form onSubmit={submit} className="card space-y-4">
            <div className="rounded-lg bg-saffron-50 px-4 py-3 text-sm text-saffron-700">
              <b>{window_.title}</b> · open until {formatDateTime(window_.closes_at)}
              {window_.instructions && <p className="mt-1 whitespace-pre-line text-slate-700">{window_.instructions}</p>}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="r-name">Name of balak / balika *</label>
                <input id="r-name" className="input" value={form.name} onChange={set('name')} maxLength={100} required />
              </div>
              <div>
                <label className="label" htmlFor="r-phone">Mobile number *</label>
                <input id="r-phone" className="input" inputMode="numeric" autoComplete="tel" value={form.phone} onChange={set('phone')} required />
              </div>
              <div>
                <label className="label" htmlFor="r-category">Balak or Balika *</label>
                <select id="r-category" className="input" value={form.category} onChange={set('category')} required>
                  <option value="">Select</option>
                  <option value="balak">Balak</option>
                  <option value="balika">Balika</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="r-language">Language *</label>
                <select id="r-language" className="input" value={form.language} onChange={set('language')} required>
                  <option value="">Select</option>
                  <option value="gu">Gujarati (every month)</option>
                  <option value="en">English (every 2 months)</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="r-plan">Plan *</label>
                <select id="r-plan" className="input" value={form.plan_years} onChange={set('plan_years')} required>
                  <option value="1">1 year</option>
                  <option value="3">3 years</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="r-area">Area</label>
                <select id="r-area" className="input" value={form.area_id} onChange={set('area_id')}>
                  <option value="">Select area</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="r-dob">Date of birth</label>
                <input id="r-dob" type="date" className="input" value={form.dob} onChange={set('dob')} />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="r-address">Address</label>
                <input id="r-address" className="input" value={form.address} onChange={set('address')} maxLength={300} />
              </div>
            </div>

            <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="r-mode">Paid by</label>
                <select id="r-mode" className="input" value={form.payment_mode} onChange={set('payment_mode')}>
                  <option value="">Select</option>
                  <option value="upi">UPI</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="r-receipt">UPI ref / receipt no.</label>
                <input id="r-receipt" className="input" value={form.receipt_no} onChange={set('receipt_no')} maxLength={60} />
              </div>
              <div>
                <label className="label" htmlFor="r-amount">Amount (₹)</label>
                <input id="r-amount" className="input" inputMode="decimal" value={form.amount} onChange={set('amount')} />
              </div>
            </div>

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? 'Submitting…' : 'Submit registration'}</button>
          </form>
        )}

        <p className="text-center text-sm text-slate-500">
          Already registered? <Link to="/" className="font-medium text-saffron-700 hover:underline">Sign in to see your books</Link>
        </p>
      </div>
    </div>
  );
}
