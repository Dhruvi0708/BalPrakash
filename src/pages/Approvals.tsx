import { useEffect, useState } from 'react';
import { Confetti } from '../components/Art';
import { EmptyState, PageHeader, Pill, Spinner } from '../components/ui';
import { formatDateTime } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { CATEGORY_LABEL, LANGUAGE_LABEL, PAYMENT_MODE_LABEL, type Area, type Language, type Member, type Subscription } from '../lib/types';

type PendingRow = Subscription & {
  members: Pick<Member, 'id' | 'full_name' | 'phone' | 'category' | 'address'> & {
    areas: Pick<Area, 'name'> | null;
    subscriptions: Pick<Subscription, 'id' | 'language' | 'status' | 'start_issue_seq' | 'total_issues'>[];
  };
};

export default function Approvals() {
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [nextSeq, setNextSeq] = useState<Record<Language, number>>({ gu: 1, en: 1 });
  const [startSeq, setStartSeq] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [celebrate, setCelebrate] = useState(0);

  async function load() {
    const [subs, issues] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('*, members(id, full_name, phone, category, address, areas(name), subscriptions(id, language, status, start_issue_seq, total_issues))')
        .eq('status', 'pending')
        .order('created_at'),
      supabase.from('issues').select('language, seq_no'),
    ]);
    if (subs.error) setError(subs.error.message);
    setRows((subs.data as PendingRow[]) ?? []);
    const next = { gu: 1, en: 1 };
    for (const i of (issues.data as { language: Language; seq_no: number }[]) ?? []) next[i.language] = Math.max(next[i.language], i.seq_no + 1);
    setNextSeq(next);
    setLoaded(true);
  }

  useEffect(() => {
    void load();
  }, []);

  // A renewal starts right after the current subscription ends.
  function defaultStart(r: PendingRow): number {
    const current = r.members.subscriptions.filter((s) => s.language === r.language && s.status === 'active');
    const after = Math.max(0, ...current.map((s) => s.start_issue_seq + s.total_issues));
    return Math.max(nextSeq[r.language], after);
  }

  async function approve(row: PendingRow) {
    setError(null);
    setBusyId(row.id);
    const seq = startSeq[row.id];
    const { error } = await supabase.rpc('approve_subscription', { p_subscription_id: row.id, p_start_issue_seq: seq ? Number(seq) : null });
    setBusyId(null);
    if (error) return setError(error.message);
    setCelebrate((n) => n + 1);
    void load();
  }

  async function reject(row: PendingRow) {
    const reason = window.prompt(`Reason for rejecting ${row.members.full_name}'s registration (optional):`);
    if (reason === null) return;
    setError(null);
    setBusyId(row.id);
    const { error } = await supabase.rpc('reject_subscription', { p_subscription_id: row.id, p_reason: reason });
    setBusyId(null);
    if (error) return setError(error.message);
    void load();
  }

  return (
    <div className="relative space-y-6">
      {celebrate > 0 && <Confetti key={celebrate} />}
      <PageHeader emoji="✅" tone="leaf" title="Approvals" subtitle="Check the payment, then approve. New subscriptions start from the next issue; renewals start right after the current one ends." />

      {error && <p className="alert-error">{error}</p>}
      {!loaded && <Spinner />}
      {loaded && rows.length === 0 && <EmptyState title="All caught up! 🎉" hint="No registrations are waiting for approval." />}

      <div className="grid gap-4 xl:grid-cols-2">
        {rows.map((r) => {
          const renewal = r.members.subscriptions.some((s) => s.language === r.language && s.status === 'active');
          return (
            <div key={r.id} className={`card space-y-4 border-l-8 ${r.members.category === 'balak' ? 'border-l-sky2-400' : 'border-l-bubble-400'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-xl font-extrabold">
                    {r.members.category === 'balak' ? '👦' : '👧'} {r.members.full_name}
                  </div>
                  <div className="text-sm font-semibold text-ink-500">
                    {CATEGORY_LABEL[r.members.category]} · {r.members.phone}
                    {r.members.areas && ` · ${r.members.areas.name}`}
                  </div>
                  {r.members.address && <div className="text-sm text-ink-400">{r.members.address}</div>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {renewal ? <Pill tone="grape">🔁 Renewal</Pill> : <Pill tone="sunny">✨ New</Pill>}
                  <span className="text-xs font-semibold text-ink-400">{formatDateTime(r.created_at)}</span>
                </div>
              </div>

              <div className="grid gap-2 rounded-3xl bg-sunny-50 p-4 text-sm sm:grid-cols-3">
                <div>
                  <div className="text-xs font-extrabold uppercase text-ink-400">Subscription</div>
                  <div className="font-bold">
                    {r.language === 'gu' ? '📗' : '📘'} {LANGUAGE_LABEL[r.language]} · {r.plan_years}y ({r.total_issues} issues)
                  </div>
                </div>
                <div>
                  <div className="text-xs font-extrabold uppercase text-ink-400">Payment</div>
                  <div className="font-bold">
                    {r.payment_mode ? PAYMENT_MODE_LABEL[r.payment_mode] : 'Not given'}
                    {r.amount !== null && ` · ₹${r.amount}`}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-extrabold uppercase text-ink-400">UPI ref / receipt</div>
                  <div className="font-mono font-bold">{r.receipt_no ?? '—'}</div>
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="label" htmlFor={`seq-${r.id}`}>Start from issue no.</label>
                  <input
                    id={`seq-${r.id}`}
                    className="input w-28"
                    inputMode="numeric"
                    placeholder={String(defaultStart(r))}
                    value={startSeq[r.id] ?? ''}
                    onChange={(e) => setStartSeq({ ...startSeq, [r.id]: e.target.value })}
                  />
                </div>
                <button type="button" className="btn-green" disabled={busyId === r.id} onClick={() => approve(r)}>✅ Approve</button>
                <button type="button" className="btn-outline" disabled={busyId === r.id} onClick={() => reject(r)}>✖ Reject</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
