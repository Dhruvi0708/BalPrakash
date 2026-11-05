import { useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '../components/ui';
import { formatDateTime, toLocalInput } from '../lib/dates';
import { supabase } from '../lib/supabase';
import type { RegistrationWindow } from '../lib/types';

function statusOf(w: RegistrationWindow, now: Date): 'open' | 'upcoming' | 'closed' {
  if (new Date(w.closes_at) <= now) return 'closed';
  return new Date(w.opens_at) <= now ? 'open' : 'upcoming';
}

const STATUS_STYLE = {
  open: 'bg-leaf-100 text-leaf-700',
  upcoming: 'bg-sky2-100 text-sky2-700',
  closed: 'bg-ink-800/5 text-ink-500',
};

export default function RegistrationWindows() {
  const [windows, setWindows] = useState<RegistrationWindow[]>([]);
  const [title, setTitle] = useState('');
  const [opensAt, setOpensAt] = useState(() => toLocalInput(new Date()));
  const [closesAt, setClosesAt] = useState(() => toLocalInput(new Date(Date.now() + 30 * 24 * 3600 * 1000)));
  const [instructions, setInstructions] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const link = `${window.location.origin}/register`;
  const now = new Date();

  async function load() {
    const { data } = await supabase.from('registration_windows').select('*').order('opens_at', { ascending: false });
    setWindows((data as RegistrationWindow[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.from('registration_windows').insert([
      {
        title: title.trim(),
        opens_at: new Date(opensAt).toISOString(),
        closes_at: new Date(closesAt).toISOString(),
        instructions: instructions.trim() || null,
      },
    ]);
    if (error) return setError(error.message.includes('check') ? 'Closing time must be after opening time.' : error.message);
    setTitle('');
    setInstructions('');
    void load();
  }

  async function closeNow(w: RegistrationWindow) {
    // closes_at must stay after opens_at, so an upcoming window is closed by moving both.
    const t = new Date();
    const opens = new Date(w.opens_at) < t ? w.opens_at : new Date(t.getTime() - 60_000).toISOString();
    await supabase.from('registration_windows').update({ opens_at: opens, closes_at: t.toISOString() }).eq('id', w.id);
    void load();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const shareText = encodeURIComponent(`Bal Prakash registration is open. Register here: ${link}`);

  return (
    <div className="space-y-5">
      <PageHeader
        emoji="📝"
        tone="bubble"
        title="Registration"
        subtitle="While a window is open, anyone can register on the public form. Entries wait in Approvals until a head verifies the payment."
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-4xl bg-gradient-to-r from-bubble-400 to-grape-500 p-5 text-white shadow-soft">
        <div className="min-w-0">
          <div className="text-sm font-bold opacity-90">🔗 Public registration link</div>
          <div className="truncate font-mono text-lg font-bold">{link}</div>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-outline" onClick={copyLink}>{copied ? '✅ Copied' : '📋 Copy link'}</button>
          <a className="btn-green" href={`https://wa.me/?text=${shareText}`} target="_blank" rel="noreferrer">💬 Share on WhatsApp</a>
        </div>
      </div>

      <form onSubmit={create} className="card grid gap-3 sm:grid-cols-2">
        <div className="text-lg font-extrabold sm:col-span-2">✨ Open a new registration window</div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="w-title">Title *</label>
          <input id="w-title" className="input" placeholder="e.g. Registration 2027" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="w-open">Opens *</label>
          <input id="w-open" type="datetime-local" className="input" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="w-close">Closes *</label>
          <input id="w-close" type="datetime-local" className="input" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} required />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="w-instr">Payment instructions (shown on the form)</label>
          <textarea
            id="w-instr"
            className="input min-h-[80px]"
            placeholder={'e.g. Fee: Gujarati ₹150/year, English ₹100/year.\nPay by UPI to balprakash@upi and enter the UPI reference number.'}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </div>
        {error && <p className="alert-error sm:col-span-2">{error}</p>}
        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary">🚀 Save window</button>
        </div>
      </form>

      <div className="card p-0">
        <ul className="divide-y-2 divide-ink-800/5">
          {windows.map((w) => {
            const status = statusOf(w, now);
            return (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <div className="flex items-center gap-2 text-lg font-extrabold">
                    {w.title}
                    <span className={`chip ${STATUS_STYLE[status]}`}>{status === 'open' ? '🟢 open' : status === 'upcoming' ? '🔜 upcoming' : 'closed'}</span>
                  </div>
                  <div className="text-sm font-semibold text-ink-500">
                    {formatDateTime(w.opens_at)} → {formatDateTime(w.closes_at)}
                  </div>
                </div>
                {status !== 'closed' && (
                  <button type="button" className="btn-outline py-1.5" onClick={() => closeNow(w)}>Close now</button>
                )}
              </li>
            );
          })}
          {windows.length === 0 && <li className="px-5 py-6 text-center font-bold text-ink-400">No registration windows yet.</li>}
        </ul>
      </div>
    </div>
  );
}
