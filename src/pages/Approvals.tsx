import { useEffect, useState } from 'react';
import { formatDateTime } from '../lib/dates';
import { supabase } from '../lib/supabase';
import {
  CATEGORY_LABEL,
  LANGUAGE_LABEL,
  PAYMENT_MODE_LABEL,
  type Area,
  type Language,
  type Member,
  type Subscription,
} from '../lib/types';

type PendingRow = Subscription & {
  members: Pick<Member, 'full_name' | 'phone' | 'category' | 'address'> & { areas: Pick<Area, 'name'> | null };
};

export default function Approvals() {
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [nextSeq, setNextSeq] = useState<Record<Language, number>>({ gu: 1, en: 1 });
  const [startSeq, setStartSeq] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const [subs, issues] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('*, members(full_name, phone, category, address, areas(name))')
        .eq('status', 'pending')
        .order('created_at'),
      supabase.from('issues').select('language, seq_no'),
    ]);
    if (subs.error) setError(subs.error.message);
    setRows((subs.data as PendingRow[]) ?? []);
    const next = { gu: 1, en: 1 };
    for (const i of (issues.data as { language: Language; seq_no: number }[]) ?? []) {
      next[i.language] = Math.max(next[i.language], i.seq_no + 1);
    }
    setNextSeq(next);
    setLoaded(true);
  }

  useEffect(() => {
    void load();
  }, []);

  async function approve(row: PendingRow) {
    setError(null);
    setBusyId(row.id);
    const seq = startSeq[row.id];
    const { error } = await supabase.rpc('approve_subscription', {
      p_subscription_id: row.id,
      p_start_issue_seq: seq ? Number(seq) : null,
    });
    setBusyId(null);
    if (error) return setError(error.message);
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
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Approvals</h1>
        <p className="text-sm text-slate-500">
          Online registrations waiting for payment to be checked. Approved subscriptions start from the next issue unless you change it.
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loaded && rows.length === 0 && <div className="card text-center text-sm text-slate-500">Nothing waiting for approval.</div>}

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="card space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-lg font-semibold">{r.members.full_name}</div>
                <div className="text-sm text-slate-500">
                  {CATEGORY_LABEL[r.members.category]} · {r.members.phone}
                  {r.members.areas && ` · ${r.members.areas.name}`}
                </div>
                {r.members.address && <div className="text-sm text-slate-500">{r.members.address}</div>}
              </div>
              <div className="text-right text-xs text-slate-400">Received {formatDateTime(r.created_at)}</div>
            </div>

            <div className="grid gap-2 rounded-lg bg-slate-50 px-4 py-3 text-sm sm:grid-cols-3">
              <div>
                <div className="text-xs text-slate-500">Subscription</div>
                {LANGUAGE_LABEL[r.language]} · {r.plan_years} year ({r.total_issues} issues)
              </div>
              <div>
                <div className="text-xs text-slate-500">Payment</div>
                {r.payment_mode ? PAYMENT_MODE_LABEL[r.payment_mode] : 'Not given'}
                {r.amount !== null && ` · ₹${r.amount}`}
              </div>
              <div>
                <div className="text-xs text-slate-500">UPI ref / receipt</div>
                {r.receipt_no ?? '—'}
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="label" htmlFor={`seq-${r.id}`}>Start from issue no.</label>
                <input
                  id={`seq-${r.id}`}
                  className="input w-32"
                  inputMode="numeric"
                  placeholder={String(nextSeq[r.language])}
                  value={startSeq[r.id] ?? ''}
                  onChange={(e) => setStartSeq({ ...startSeq, [r.id]: e.target.value })}
                />
              </div>
              <button type="button" className="btn-primary" disabled={busyId === r.id} onClick={() => approve(r)}>
                Approve
              </button>
              <button type="button" className="btn-outline" disabled={busyId === r.id} onClick={() => reject(r)}>
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
