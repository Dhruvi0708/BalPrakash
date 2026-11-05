import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BookBuddy, Cloud, Confetti, Doodles, KidReader, Sun } from '../components/Art';
import { RAINBOW } from '../components/Layout';
import { Spinner } from '../components/ui';
import { formatDateTime } from '../lib/dates';
import { LangSwitch, useI18n } from '../lib/i18n';
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

function Choice({ selected, onClick, children, tone }: { selected: boolean; onClick: () => void; children: ReactNode; tone: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 px-3 py-2.5 font-extrabold transition ${
        selected ? `${tone} text-white shadow-pop` : 'border-ink-800/10 bg-white text-ink-600 hover:border-ink-800/20'
      }`}
    >
      {children}
    </button>
  );
}

export default function Register() {
  const { t } = useI18n();
  const [regWindow, setRegWindow] = useState<RegistrationWindow | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ name: string; phone: string } | null>(null);

  useEffect(() => {
    // The open window, or else the next upcoming one.
    Promise.all([
      supabase.from('registration_windows').select('*').gt('closes_at', new Date().toISOString()).order('opens_at').limit(1),
      supabase.from('areas').select('*').eq('is_active', true).order('name'),
    ]).then(([w, a]) => {
      setRegWindow(((w.data as RegistrationWindow[]) ?? [])[0] ?? null);
      setAreas((a.data as Area[]) ?? []);
      setLoaded(true);
    });
  }, []);

  const isOpen = regWindow !== null && new Date(regWindow.opens_at) <= new Date();

  const set = (key: keyof typeof emptyForm) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [key]: e.target.value });
  const pick = (key: keyof typeof emptyForm, value: string) => setForm({ ...form, [key]: value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidPhone(form.phone)) return setError(t('badPhone'));
    if (!form.category || !form.language) return setError(`${t('balakOrBalika')} · ${t('language')}`);
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function registerAnother() {
    // Keep contact details so siblings sharing a number are quick to add.
    setForm({ ...emptyForm, phone: form.phone, area_id: form.area_id, address: form.address, payment_mode: form.payment_mode });
    setDone(null);
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="h-1.5 w-full" style={{ background: RAINBOW }} />
      <Doodles />
      <Cloud className="absolute left-[3%] top-20 hidden h-14 w-24 animate-float-slow sm:block" />
      <Sun className="absolute right-[5%] top-6 h-16 w-16 animate-wiggle sm:h-20 sm:w-20" />

      <div className="relative mx-auto max-w-2xl space-y-5 px-4 py-8">
        <div className="flex justify-center">
          <LangSwitch />
        </div>
        <div className="flex items-end justify-center gap-1">
          <KidReader variant="balak" className="h-24 w-20 animate-float" />
          <BookBuddy className="h-28 w-28 animate-float-slow" mood={done ? 'wow' : 'happy'} />
          <KidReader variant="balika" className="h-24 w-20 animate-float" />
        </div>
        <div className="text-center">
          <h1 className="text-3xl sm:text-4xl">
            <span className="bg-gradient-to-r from-saffron-500 via-bubble-500 to-grape-500 bg-clip-text text-transparent">{t('regTitle')}</span>
          </h1>
          <p className="font-semibold text-ink-500">{t('regSub')}</p>
        </div>

        {!loaded && <div className="card"><Spinner /></div>}

        {loaded && !isOpen && (
          <div className="card space-y-2 text-center">
            <div className="text-4xl">🌙</div>
            <div className="text-xl font-extrabold">{t('regClosed')}</div>
            {regWindow ? (
              <p className="font-semibold text-ink-500">
                <b>{regWindow.title}</b> {t('regOpensOn')} {formatDateTime(regWindow.opens_at)}
              </p>
            ) : (
              <p className="font-semibold text-ink-500">{t('regCheckLater')}</p>
            )}
          </div>
        )}

        {loaded && isOpen && done && (
          <div className="card relative space-y-4 text-center">
            <Confetti />
            <div className="mx-auto flex h-16 w-16 animate-pop items-center justify-center rounded-full bg-leaf-100 text-4xl">🎉</div>
            <div>
              <div className="text-2xl font-extrabold">
                {t('regDone')} {done.name}
              </div>
              <p className="mt-1 font-semibold text-ink-500">
                {t('regDoneHint')} <b className="text-ink-800">{done.phone}</b>
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" className="btn-outline" onClick={registerAnother}>➕ {t('registerAnother')}</button>
              <Link to="/" className="btn-primary">{t('signInCreate')}</Link>
            </div>
          </div>
        )}

        {loaded && isOpen && !done && regWindow && (
          <form onSubmit={submit} className="card space-y-5">
            <div className="rounded-3xl border-2 border-sunny-200 bg-sunny-50 px-4 py-3 text-sm font-semibold text-ink-700">
              <div className="font-extrabold text-sunny-700">
                ✨ {regWindow.title} · {t('openUntil')} {formatDateTime(regWindow.closes_at)}
              </div>
              {regWindow.instructions && <p className="mt-1 whitespace-pre-line">{regWindow.instructions}</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="r-name">{t('childName')} *</label>
                <input id="r-name" className="input" value={form.name} onChange={set('name')} maxLength={100} required />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="r-phone">{t('mobile')} *</label>
                <input id="r-phone" className="input" inputMode="numeric" autoComplete="tel" value={form.phone} onChange={set('phone')} required />
              </div>
              <div className="sm:col-span-2">
                <span className="label">{t('balakOrBalika')} *</span>
                <div className="flex gap-2">
                  <Choice selected={form.category === 'balak'} onClick={() => pick('category', 'balak')} tone="border-sky2-500 bg-sky2-500">
                    👦 {t('balak')}
                  </Choice>
                  <Choice selected={form.category === 'balika'} onClick={() => pick('category', 'balika')} tone="border-bubble-500 bg-bubble-500">
                    👧 {t('balika')}
                  </Choice>
                </div>
              </div>
              <div className="sm:col-span-2">
                <span className="label">{t('language')} *</span>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Choice selected={form.language === 'gu'} onClick={() => pick('language', 'gu')} tone="border-saffron-500 bg-saffron-500">
                    📗 {t('gujaratiMonthly')}
                  </Choice>
                  <Choice selected={form.language === 'en'} onClick={() => pick('language', 'en')} tone="border-grape-500 bg-grape-500">
                    📘 {t('englishBimonthly')}
                  </Choice>
                </div>
              </div>
              <div className="sm:col-span-2">
                <span className="label">{t('plan')} *</span>
                <div className="flex gap-2">
                  <Choice selected={form.plan_years === '1'} onClick={() => pick('plan_years', '1')} tone="border-leaf-500 bg-leaf-500">
                    ⭐ {t('oneYear')}
                  </Choice>
                  <Choice selected={form.plan_years === '3'} onClick={() => pick('plan_years', '3')} tone="border-leaf-500 bg-leaf-500">
                    🌟 {t('threeYears')}
                  </Choice>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="r-area">{t('area')}</label>
                <select id="r-area" className="input" value={form.area_id} onChange={set('area_id')}>
                  <option value="">{t('selectArea')}</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="r-dob">{t('dob')}</label>
                <input id="r-dob" type="date" className="input" value={form.dob} onChange={set('dob')} />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="r-address">{t('address')}</label>
                <input id="r-address" className="input" value={form.address} onChange={set('address')} maxLength={300} />
              </div>
            </div>

            <div className="grid gap-4 rounded-3xl bg-sky2-50/70 p-4 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="r-mode">{t('paidBy')}</label>
                <select id="r-mode" className="input" value={form.payment_mode} onChange={set('payment_mode')}>
                  <option value="">{t('select')}</option>
                  <option value="upi">UPI</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="r-receipt">{t('receipt')}</label>
                <input id="r-receipt" className="input" value={form.receipt_no} onChange={set('receipt_no')} maxLength={60} />
              </div>
              <div>
                <label className="label" htmlFor="r-amount">{t('amount')}</label>
                <input id="r-amount" className="input" inputMode="decimal" value={form.amount} onChange={set('amount')} />
              </div>
            </div>

            {error && <p className="alert-error">{error}</p>}
            <button type="submit" className="btn-primary w-full py-3 text-lg" disabled={busy}>
              {busy ? t('submitting') : `${t('submitReg')} 🎈`}
            </button>
          </form>
        )}

        <p className="text-center font-semibold text-ink-500">
          {t('alreadyRegistered')}{' '}
          <Link to="/" className="font-extrabold text-saffron-600 hover:underline">{t('seeBooks')}</Link>
        </p>
      </div>
    </div>
  );
}
