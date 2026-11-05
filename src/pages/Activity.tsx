import { useEffect, useState } from 'react';
import { EmptyState, PageHeader, Spinner } from '../components/ui';
import { formatDateTime } from '../lib/dates';
import { supabase } from '../lib/supabase';

interface AuditRow {
  id: number;
  actor: string | null;
  action: 'insert' | 'update' | 'delete';
  table_name: string;
  record_id: string | null;
  details: Record<string, unknown> | null;
  at: string;
}

const TABLE_LABEL: Record<string, { emoji: string; name: string }> = {
  members: { emoji: '🧒', name: 'Person' },
  subscriptions: { emoji: '📚', name: 'Subscription' },
  distributions: { emoji: '🎁', name: 'Distribution' },
  stock_receipts: { emoji: '📦', name: 'Stock' },
  profiles: { emoji: '👥', name: 'Role' },
};

function describe(r: AuditRow): string {
  const d = r.details ?? {};
  const row = (r.action === 'update' ? (d.new as Record<string, unknown>) : d) ?? {};
  const old = r.action === 'update' ? ((d.old as Record<string, unknown>) ?? {}) : {};
  switch (r.table_name) {
    case 'members':
      return `${r.action === 'insert' ? 'Added' : r.action === 'delete' ? 'Removed' : 'Edited'} ${String(row.full_name ?? '')}`;
    case 'subscriptions':
      if (r.action === 'update' && old.status !== row.status) return `Subscription #${r.record_id}: ${String(old.status)} → ${String(row.status)}`;
      return `${r.action === 'insert' ? 'New' : r.action === 'delete' ? 'Removed' : 'Edited'} ${String(row.language) === 'gu' ? 'Gujarati' : 'English'} subscription #${r.record_id}`;
    case 'distributions':
      return row.status === 'pending'
        ? `Undid handover #${r.record_id}`
        : row.status === 'mediator'
          ? `Book #${r.record_id} given to mediator ${String(row.collected_by_name ?? '')}`
          : `Book #${r.record_id} collected by the child`;
    case 'stock_receipts':
      return `${r.action === 'insert' ? 'Recorded' : 'Changed'} ${String(row.quantity ?? '')} ${String(row.category ?? '')} books`;
    case 'profiles':
      return `Role changed to ${String(row.role ?? '')}${row.category ? ` (${String(row.category)})` : ''}`;
    default:
      return `${r.action} ${r.table_name}`;
  }
}

export default function Activity() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [table, setTable] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let q = supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(300);
    if (table) q = q.eq('table_name', table);
    Promise.all([q, supabase.from('profiles').select('id, full_name')]).then(([a, p]) => {
      setRows((a.data as AuditRow[]) ?? []);
      setNames(Object.fromEntries(((p.data as { id: string; full_name: string | null }[]) ?? []).map((x) => [x.id, x.full_name ?? 'Unknown'])));
      setLoaded(true);
    });
  }, [table]);

  return (
    <>
      <PageHeader emoji="🕑" tone="grape" title="Activity log" subtitle="Who changed what, and when. The latest 300 changes." />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`btn btn-sm ${table === '' ? 'bg-ink-800 text-white' : 'btn-outline'}`} onClick={() => setTable('')}>All</button>
        {Object.entries(TABLE_LABEL).map(([k, v]) => (
          <button key={k} type="button" className={`btn btn-sm ${table === k ? 'bg-ink-800 text-white' : 'btn-outline'}`} onClick={() => setTable(k)}>
            {v.emoji} {v.name}
          </button>
        ))}
      </div>
      {!loaded && <Spinner />}
      {loaded && rows.length === 0 && <EmptyState title="No activity yet" />}
      {rows.length > 0 && (
        <div className="card p-0">
          <ul className="divide-y-2 divide-ink-800/5">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-grape-50 text-xl">{TABLE_LABEL[r.table_name]?.emoji ?? '•'}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{describe(r)}</div>
                  <div className="text-xs font-semibold text-ink-400">
                    {r.actor ? names[r.actor] ?? 'Unknown user' : 'Online form / system'} · {formatDateTime(r.at)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
