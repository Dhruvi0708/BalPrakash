import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { EmptyState, Modal, Pill, ProgressBar, Spinner } from '../components/ui';
import { formatDate } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { CATEGORY_LABEL, issueLabel, MONTHS, type Category, type Issue, type Language, type StockReceipt } from '../lib/types';

interface SubLite {
  language: Language;
  start_issue_seq: number;
  total_issues: number;
  status: string;
  members: { category: Category };
}
interface DistLite {
  issue_id: number;
  status: string;
  subscriptions: { members: { category: Category } };
}

export default function Issues() {
  const { profile } = useAuth();
  const sides: Category[] = profile?.role === 'balika_head' ? ['balika'] : ['balak', 'balika'];

  const [lang, setLang] = useState<Language>('gu');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [stock, setStock] = useState<StockReceipt[]>([]);
  const [subs, setSubs] = useState<SubLite[]>([]);
  const [dists, setDists] = useState<DistLite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [stockFor, setStockFor] = useState<Issue | null>(null);

  const load = useCallback(async () => {
    const [i, s, sb, d] = await Promise.all([
      supabase.from('issues').select('*').order('seq_no', { ascending: false }),
      supabase.from('stock_receipts').select('*'),
      supabase.from('subscriptions').select('language, start_issue_seq, total_issues, status, members!inner(category)').in('status', ['active', 'expired']),
      supabase.from('distributions').select('issue_id, status, subscriptions!inner(members!inner(category))'),
    ]);
    setError(i.error?.message ?? s.error?.message ?? sb.error?.message ?? d.error?.message ?? null);
    setIssues((i.data as Issue[]) ?? []);
    setStock((s.data as StockReceipt[]) ?? []);
    setSubs((sb.data as unknown as SubLite[]) ?? []);
    setDists((d.data as unknown as DistLite[]) ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = issues.filter((i) => i.language === lang);
  const nextSeq = (shown[0]?.seq_no ?? 0) + 1;

  function statsFor(issue: Issue, cat: Category) {
    const received = stock.filter((r) => r.issue_id === issue.id && r.category === cat);
    const qty = received.reduce((n, r) => n + r.quantity, 0);
    const rows = dists.filter((d) => d.issue_id === issue.id && d.subscriptions.members.category === cat);
    // Before stock arrives there are no rows yet, so count eligible subscriptions directly.
    const eligible = received.length
      ? rows.length
      : subs.filter(
          (s) =>
            s.language === issue.language &&
            s.status === 'active' &&
            s.members.category === cat &&
            issue.seq_no >= s.start_issue_seq &&
            issue.seq_no <= s.start_issue_seq + s.total_issues - 1,
        ).length;
    const collected = rows.filter((d) => d.status === 'given' || d.status === 'delivered').length;
    const withVolunteer = rows.filter((d) => d.status === 'given_to_volunteer').length;
    return { received, qty, eligible, collected, withVolunteer, pending: rows.length - collected - withVolunteer };
  }

  const st0 = (issue: Issue) => stock.some((r) => r.issue_id === issue.id);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink-500">
          Add each new issue, then record the books received from the Karyalaya. Everyone due that book then appears under “Hand out books”.
        </p>
        <button type="button" className="btn-primary" onClick={() => setShowAdd(true)}>➕ New issue</button>
      </div>

      <div className="flex gap-2">
        {(['gu', 'en'] as Language[]).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            className={`btn ${lang === l ? (l === 'gu' ? 'bg-saffron-500 text-white shadow-pop' : 'bg-grape-500 text-white shadow-pop') : 'btn-outline'}`}
          >
            {l === 'gu' ? '📗 Gujarati (monthly)' : '📘 English (every 2 months)'}
          </button>
        ))}
      </div>

      {error && <p className="alert-error">{error}</p>}
      {!loaded && <Spinner />}
      {loaded && shown.length === 0 && (
        <EmptyState title="No issues yet" hint="Add the first issue. Use issue no. 1 for the first issue you track in this system.">
          <button type="button" className="btn-primary mt-2" onClick={() => setShowAdd(true)}>➕ Add issue {nextSeq}</button>
        </EmptyState>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {shown.map((issue) => (
          <div key={issue.id} className="card space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wider text-ink-400">Issue no. {issue.seq_no}</div>
                <div className="text-xl font-extrabold">{issueLabel(issue)}</div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-sky btn-sm" onClick={() => setStockFor(issue)}>📥 Record stock</button>
                {st0(issue) && <Link to={`/distribution?issue=${issue.id}`} className="btn-green btn-sm">🎁 Hand out</Link>}
              </div>
            </div>

            {sides.map((cat) => {
              const st = statsFor(issue, cat);
              const diff = st.qty - st.eligible;
              return (
                <div key={cat} className={`rounded-3xl p-4 ${cat === 'balak' ? 'bg-sky2-50' : 'bg-bubble-50'}`}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="font-extrabold">{cat === 'balak' ? '👦' : '👧'} {CATEGORY_LABEL[cat]}s</div>
                    {st.received.length === 0 ? (
                      <Pill tone="sunny">Stock not received yet</Pill>
                    ) : diff < 0 ? (
                      <Pill tone="bubble">Short by {-diff}</Pill>
                    ) : diff > 0 ? (
                      <Pill tone="sky">{diff} spare</Pill>
                    ) : (
                      <Pill tone="leaf">Exact count</Pill>
                    )}
                  </div>
                  <div className="grid grid-cols-5 gap-2 text-center text-sm">
                    <div><div className="text-2xl font-extrabold">{st.eligible}</div><div className="font-bold text-ink-500">eligible</div></div>
                    <div><div className="text-2xl font-extrabold">{st.qty}</div><div className="font-bold text-ink-500">received</div></div>
                    <div><div className="text-2xl font-extrabold text-sky2-600">{st.withVolunteer}</div><div className="font-bold text-ink-500">with volunteers</div></div>
                    <div><div className="text-2xl font-extrabold text-leaf-600">{st.collected}</div><div className="font-bold text-ink-500">reached child</div></div>
                    <div><div className="text-2xl font-extrabold text-saffron-600">{st.pending}</div><div className="font-bold text-ink-500">pending</div></div>
                  </div>
                  {st.received.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <ProgressBar value={st.collected} max={st.eligible} tone="leaf" />
                      <div className="text-xs font-semibold text-ink-400">
                        Received {st.received.map((r) => `${r.quantity} on ${formatDate(r.received_on)}`).join(', ')}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <AddIssueModal open={showAdd} onClose={() => setShowAdd(false)} language={lang} nextSeq={nextSeq} onSaved={load} />
      <StockModal issue={stockFor} sides={sides} onClose={() => setStockFor(null)} onSaved={load} />
    </>
  );
}

function AddIssueModal({ open, onClose, language, nextSeq, onSaved }: { open: boolean; onClose: () => void; language: Language; nextSeq: number; onSaved: () => void }) {
  const now = new Date();
  const [lang, setLang] = useState<Language>(language);
  const [seq, setSeq] = useState(String(nextSeq));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLang(language);
      setSeq(String(nextSeq));
      setError(null);
    }
  }, [open, language, nextSeq]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.from('issues').insert([
      { language: lang, seq_no: Number(seq), issue_month: Number(month), issue_year: Number(year), title: title.trim() || null },
    ]);
    if (error) return setError(error.message.includes('duplicate') ? `Issue ${seq} already exists for this language.` : error.message);
    setTitle('');
    onClose();
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title="➕ New issue">
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="i-lang">Language</label>
          <select id="i-lang" className="input" value={lang} onChange={(e) => setLang(e.target.value as Language)}>
            <option value="gu">Gujarati</option>
            <option value="en">English</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="i-seq">Issue no.</label>
          <input id="i-seq" className="input" inputMode="numeric" value={seq} onChange={(e) => setSeq(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="i-month">Month</label>
          <select id="i-month" className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="i-year">Year</label>
          <input id="i-year" className="input" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} required />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="i-title">Title (optional)</label>
          <input id="i-title" className="input" placeholder="e.g. Diwali special" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        {error && <p className="alert-error sm:col-span-2">{error}</p>}
        <button type="submit" className="btn-primary sm:col-span-2">Save issue</button>
      </form>
    </Modal>
  );
}

function StockModal({ issue, sides, onClose, onSaved }: { issue: Issue | null; sides: Category[]; onClose: () => void; onSaved: () => void }) {
  const [category, setCategory] = useState<Category>(sides[0]);
  const [qty, setQty] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const title = useMemo(() => (issue ? `📥 Stock for ${issueLabel(issue)}` : ''), [issue]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!issue) return;
    setError(null);
    setBusy(true);
    const { error } = await supabase.from('stock_receipts').insert([
      { issue_id: issue.id, category, quantity: Number(qty), received_on: date, notes: notes.trim() || null },
    ]);
    setBusy(false);
    if (error) return setError(error.message);
    setQty('');
    setNotes('');
    onClose();
    onSaved();
  }

  return (
    <Modal open={issue !== null} onClose={onClose} title={title}>
      <form onSubmit={save} className="space-y-3">
        <p className="text-sm font-semibold text-ink-500">
          Recording books creates a pending entry for everyone due this issue. You can record more than once if books arrive in parts.
        </p>
        {sides.length > 1 && (
          <div className="flex gap-2">
            {sides.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`btn flex-1 ${category === c ? (c === 'balak' ? 'bg-sky2-500 text-white' : 'bg-bubble-500 text-white') : 'btn-outline'}`}
              >
                {c === 'balak' ? '👦 Balak' : '👧 Balika'}
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="s-qty">Books received</label>
            <input id="s-qty" className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="s-date">Received on</label>
            <input id="s-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="s-notes">Notes</label>
          <input id="s-notes" className="input" placeholder="e.g. 2 boxes from Karyalaya" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p className="alert-error">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save stock'}</button>
      </form>
    </Modal>
  );
}
