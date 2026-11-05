import { useEffect, useState } from 'react';
import { EmptyState, PageHeader, Pill, Spinner, STATUS_TONE } from '../components/ui';
import { formatDateTime } from '../lib/dates';
import { supabase } from '../lib/supabase';
import type { Category, HelpRequest } from '../lib/types';

type Row = HelpRequest & { members: { full_name: string; phone: string; category: Category } };

export default function Requests() {
  const [rows, setRows] = useState<Row[]>([]);
  const [show, setShow] = useState<'open' | 'resolved'>('open');
  const [replies, setReplies] = useState<Record<number, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase.from('help_requests').select('*, members(full_name, phone, category)').order('created_at', { ascending: false }).limit(500);
    setError(error?.message ?? null);
    setRows((data as Row[]) ?? []);
    setLoaded(true);
  }

  useEffect(() => {
    void load();
  }, []);

  async function resolve(r: Row) {
    const { error } = await supabase
      .from('help_requests')
      .update({ status: 'resolved', response: (replies[r.id] ?? '').trim() || null })
      .eq('id', r.id);
    if (error) return setError(error.message);
    void load();
  }

  const shown = rows.filter((r) => r.status === show);

  return (
    <>
      <PageHeader emoji="💬" tone="sky" title="Help requests" subtitle="Questions from families, like “I didn't get my book”. Your reply shows on their My books page." />
      <div className="flex gap-2">
        {(['open', 'resolved'] as const).map((s) => (
          <button key={s} type="button" onClick={() => setShow(s)} className={`btn btn-sm ${show === s ? 'bg-ink-800 text-white' : 'btn-outline'}`}>
            {s === 'open' ? `📬 Open (${rows.filter((r) => r.status === 'open').length})` : '✅ Resolved'}
          </button>
        ))}
      </div>
      {error && <p className="alert-error">{error}</p>}
      {!loaded && <Spinner />}
      {loaded && shown.length === 0 && <EmptyState title={show === 'open' ? 'No open requests 🎉' : 'Nothing resolved yet'} />}
      <div className="grid gap-3 lg:grid-cols-2">
        {shown.map((r) => (
          <div key={r.id} className="card space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-lg font-extrabold">
                  {r.members.category === 'balak' ? '👦' : '👧'} {r.members.full_name}
                </div>
                <div className="text-sm font-semibold text-ink-500">{r.members.phone} · {formatDateTime(r.created_at)}</div>
              </div>
              <Pill tone={STATUS_TONE[r.status]}>{r.status}</Pill>
            </div>
            <p className="rounded-2xl bg-sky2-50 px-4 py-3 font-semibold text-ink-700">“{r.message}”</p>
            {r.status === 'resolved' ? (
              r.response && <p className="font-semibold text-leaf-700">↪ {r.response}</p>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="input"
                  placeholder="Reply (optional), e.g. Your book is at Mayur Vihar sabha"
                  value={replies[r.id] ?? ''}
                  onChange={(e) => setReplies({ ...replies, [r.id]: e.target.value })}
                />
                <button type="button" className="btn-green shrink-0" onClick={() => resolve(r)}>✅ Resolve</button>
                <a className="btn-outline shrink-0" href={`https://wa.me/91${r.members.phone}`} target="_blank" rel="noreferrer">💬</a>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
