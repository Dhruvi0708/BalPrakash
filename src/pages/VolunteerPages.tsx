import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { BookBuddy, Cloud, Sun } from '../components/Art';
import { HandoverModal, StatusPill } from '../components/BookActions';
import { EmptyState, PageHeader, Spinner, StatCard } from '../components/ui';
import { formatDateTime, greeting } from '../lib/dates';
import { fetchBookRows } from '../lib/data';
import { undoBookStatus } from '../lib/offline';
import { supabase } from '../lib/supabase';
import { CATEGORY_LABEL, issueLabel, type BookRow, type TeamMember } from '../lib/types';
import { ReportButtons } from './Reports';

/** The signed-in volunteer's own team record (mandal, side). */
function useMyTeamRecord() {
  const { session } = useAuth();
  const [me, setMe] = useState<(TeamMember & { areas: { name: string } | null }) | null>(null);
  useEffect(() => {
    if (!session) return;
    void supabase
      .from('team_members')
      .select('*, areas(name)')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setMe(data as typeof me));
  }, [session]);
  return me;
}

function useMyBooks() {
  const [rows, setRows] = useState<BookRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      // The database only returns books handed to this volunteer.
      setRows(await fetchBookRows());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { rows, error, load };
}

export function VolunteerHome() {
  const { profile } = useAuth();
  const me = useMyTeamRecord();
  const { rows } = useMyBooks();
  const pending = rows?.filter((r) => r.status === 'given_to_volunteer') ?? [];
  const done = rows?.filter((r) => r.status === 'delivered') ?? [];

  return (
    <>
      <div className="relative overflow-hidden rounded-4xl bg-gradient-to-br from-leaf-400 via-sky2-400 to-grape-400 p-6 text-white shadow-soft sm:p-8">
        <Cloud className="absolute -left-4 top-4 h-12 w-24 opacity-80" />
        <Sun className="absolute right-4 top-4 h-16 w-16 animate-wiggle" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-lg font-bold opacity-90">{greeting()} 👋</div>
            <h1 className="text-3xl text-white sm:text-4xl">Jai Swaminarayan, {profile?.full_name?.split(' ')[0] ?? 'sevak'}!</h1>
            <p className="mt-1 font-semibold opacity-95">
              📍 {me?.areas?.name ?? 'Any mandal'} · {me?.category ? CATEGORY_LABEL[me.category] : 'Balak + Balika'}
            </p>
          </div>
          <BookBuddy className="h-24 w-24 animate-float-slow" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard emoji="📦" label="Assigned to me" value={rows ? rows.length : '–'} tone="sky" />
        <Link to="/pending" className="block transition hover:-translate-y-0.5">
          <StatCard emoji="🤝" label="To deliver" value={rows ? pending.length : '–'} tone="saffron" />
        </Link>
        <Link to="/completed" className="block transition hover:-translate-y-0.5">
          <StatCard emoji="🎉" label="Delivered" value={rows ? done.length : '–'} tone="leaf" />
        </Link>
      </div>

      {pending.length > 0 && (
        <Link to="/pending" className="btn-primary w-full justify-center text-base">🎁 Start delivering ({pending.length}) →</Link>
      )}
      {rows && rows.length === 0 && (
        <EmptyState title="No books assigned yet" hint="When the Main Head or Balika Head hands books to you, they appear here." />
      )}

      <ReportButtons kinds={['my-assigned', 'my-completed']} />
    </>
  );
}

const VIEWS = {
  all: { title: 'My Assigned Books', emoji: '📦', subtitle: 'Every book handed to you, delivered or not.' },
  pending: { title: 'Pending Deliveries', emoji: '🤝', subtitle: 'Find the child, hand over the book, then tap “Mark as Delivered”.' },
  completed: { title: 'Completed Deliveries', emoji: '🎉', subtitle: 'Books you have handed to children.' },
} as const;

export function MyDeliveries({ view }: { view: keyof typeof VIEWS }) {
  const { rows, error, load } = useMyBooks();
  const [search, setSearch] = useState('');
  const [mandal, setMandal] = useState('');
  const [deliver, setDeliver] = useState<BookRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return (rows ?? []).filter(
      (r) =>
        (view === 'all' || (view === 'pending' ? r.status === 'given_to_volunteer' : r.status === 'delivered')) &&
        (!mandal || r.mandal === mandal) &&
        (!q || r.full_name.toLowerCase().includes(q) || r.member_code.toLowerCase().includes(q) || (digits.length >= 3 && r.phone.includes(digits))),
    );
  }, [rows, view, search, mandal]);
  const mandals = [...new Set((rows ?? []).map((r) => r.mandal).filter(Boolean))] as string[];

  async function undo(r: BookRow) {
    const res = await undoBookStatus([r.id]);
    setMessage(res.error ? `⚠️ ${res.error}` : `↩️ ${r.full_name}'s book is back in your pending list.`);
    void load();
  }

  const v = VIEWS[view];
  return (
    <>
      <PageHeader emoji={v.emoji} tone={view === 'completed' ? 'leaf' : 'sky'} title={v.title} subtitle={v.subtitle} />
      <div className="flex flex-wrap gap-2">
        <input className="input max-w-xs py-1.5" placeholder="🔎 Name, ID or mobile" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
        {mandals.length > 1 && (
          <select className="input w-auto py-1.5" value={mandal} onChange={(e) => setMandal(e.target.value)} aria-label="Mandal">
            <option value="">📍 All mandals</option>
            {mandals.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        )}
        <span className="self-center text-sm font-bold text-ink-400">{list.length} book(s)</span>
      </div>
      {message && <p className="alert-ok">{message}</p>}
      {error && <p className="alert-error">{error}</p>}
      {!rows && <Spinner />}
      {rows && list.length === 0 && (
        <EmptyState title={view === 'pending' ? 'Nothing left to deliver 🎉' : 'Nothing here yet'} hint={view === 'pending' ? 'Great work! New books appear here when they are handed to you.' : undefined} />
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {list.map((r) => (
          <div key={r.id} className={`card space-y-2 border-l-8 ${r.category === 'balak' ? 'border-l-sky2-400' : 'border-l-bubble-400'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-lg font-extrabold">{r.category === 'balak' ? '👦' : '👧'} {r.full_name}</div>
                <div className="text-sm font-semibold text-ink-500">
                  <span className="font-mono">{r.member_code}</span> · 📍 {r.mandal ?? '—'}
                </div>
              </div>
              <StatusPill status={r.status} />
            </div>
            <div className="text-sm font-bold text-ink-700">📖 {issueLabel(r)}</div>
            <div className="text-xs font-semibold text-ink-500">
              {r.handed_on && <>Received from {r.handed_by_name ?? 'head'} on {formatDateTime(r.handed_on)}</>}
              {r.delivered_on && <> · Delivered {formatDateTime(r.delivered_on)}</>}
            </div>
            <div className="flex flex-wrap gap-2">
              {r.status === 'given_to_volunteer' && (
                <button type="button" className="btn-green" onClick={() => setDeliver([r])}>🎉 Mark as Delivered</button>
              )}
              <a className="btn-outline btn-sm" href={`tel:${r.phone}`}>📞 {r.phone}</a>
              {r.status === 'delivered' && (
                <button type="button" className="btn-ghost btn-sm" onClick={() => void undo(r)}>↩️ Not delivered</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <HandoverModal
        books={deliver}
        mode={deliver.length ? 'delivered' : null}
        onClose={() => setDeliver([])}
        onDone={(msg) => {
          setDeliver([]);
          setMessage(msg);
          void load();
        }}
      />
    </>
  );
}
