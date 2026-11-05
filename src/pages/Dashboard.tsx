import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { isMainHead, useAuth } from '../auth/AuthProvider';
import { BookBuddy, Cloud, KidReader, Sun } from '../components/Art';
import { StatusPill } from '../components/BookActions';
import { MemberDetail } from '../components/MemberDetail';
import { StatCard } from '../components/ui';
import { greeting } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { CATEGORY_LABEL, type BookStatus, type BookRow, type MemberRow } from '../lib/types';

interface YearSummary {
  year: number;
  is_current: boolean;
  balak: number;
  balika: number;
  pending: number;
  given: number;
  given_to_volunteer: number;
  delivered: number;
}

interface Summary {
  balak: number;
  balika: number;
  volunteers: number;
  status: Partial<Record<BookStatus, number>>;
  years: YearSummary[];
}

export default function Dashboard() {
  const { profile } = useAuth();
  const main = isMainHead(profile);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase.rpc('dashboard_summary').then(({ data, error }) => {
      if (error) setError(error.message);
      else setSummary(data as Summary);
    });
  }, []);

  const st = summary?.status ?? {};
  const v = (n: number | undefined) => (summary ? (n ?? 0) : '–');

  return (
    <>
      <div className="relative overflow-hidden rounded-4xl bg-gradient-to-br from-sky2-400 via-grape-400 to-bubble-400 p-6 text-white shadow-soft sm:p-8">
        <Cloud className="absolute -left-4 top-4 h-12 w-24 opacity-80" />
        <Sun className="absolute right-4 top-4 h-16 w-16 animate-wiggle" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-lg font-bold opacity-90">{greeting()} 👋</div>
            <h1 className="text-3xl text-white sm:text-4xl">Jai Swaminarayan, {profile?.full_name?.split(' ')[0] ?? 'sevak'}!</h1>
            <p className="mt-1 max-w-md font-semibold opacity-95">
              {main ? 'Every Balak and Balika book in Delhi, at a glance.' : 'Every Balika book, at a glance.'}
            </p>
          </div>
          <div className="flex items-end gap-1">
            {main && <KidReader variant="balak" className="h-20 w-16 animate-float" />}
            <BookBuddy className="h-24 w-24 animate-float-slow" />
            <KidReader variant="balika" className="h-20 w-16 animate-float" />
          </div>
        </div>
      </div>

      {error && <p className="alert-error">{error}</p>}

      <div className={`grid grid-cols-2 gap-3 ${main ? 'lg:grid-cols-3' : ''}`}>
        {main && <StatCard emoji="👦" label="Registered Balaks" value={v(summary?.balak)} tone="sky" />}
        <StatCard emoji="👧" label="Registered Balikas" value={v(summary?.balika)} tone="bubble" />
        <StatCard emoji="🙋" label="Volunteers" value={v(summary?.volunteers)} tone="grape" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link to="/distribution" className="block transition hover:-translate-y-0.5">
          <StatCard emoji="⏳" label="Books pending" value={v(st.pending)} tone="sunny" hint="Not handed over yet" />
        </Link>
        <StatCard emoji="✅" label="Given directly" value={v(st.given)} tone="leaf" hint="By a head, to the child" />
        <StatCard emoji="🤝" label="With volunteers" value={v(st.given_to_volunteer)} tone="sky" hint="Not delivered yet" />
        <StatCard emoji="🎉" label="Delivered" value={v(st.delivered)} tone="grape" hint="By volunteers, to the child" />
      </div>

      <FindMember />

      {summary && summary.years.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <div className="px-5 pt-4 text-lg font-extrabold">📅 Year-wise summary</div>
          <table className="mt-2 w-full min-w-[640px] text-left text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-2.5">Year</th>
                {main && <th className="px-4 py-2.5">Balaks</th>}
                <th className="px-4 py-2.5">Balikas</th>
                <th className="px-4 py-2.5">⏳ Pending</th>
                <th className="px-4 py-2.5">✅ Given</th>
                <th className="px-4 py-2.5">🤝 With volunteers</th>
                <th className="px-4 py-2.5">🎉 Delivered</th>
              </tr>
            </thead>
            <tbody>
              {summary.years.map((y) => (
                <tr key={y.year} className="border-t border-ink-800/5 font-semibold tabular-nums">
                  <td className="px-4 py-2.5 font-extrabold">
                    {y.year} {y.is_current && <span className="ml-1 rounded-full bg-leaf-100 px-2 py-0.5 text-xs text-leaf-700">current</span>}
                  </td>
                  {main && <td className="px-4 py-2.5">{y.balak}</td>}
                  <td className="px-4 py-2.5">{y.balika}</td>
                  <td className="px-4 py-2.5">{y.pending}</td>
                  <td className="px-4 py-2.5">{y.given}</td>
                  <td className="px-4 py-2.5">{y.given_to_volunteer}</td>
                  <td className="px-4 py-2.5">{y.delivered}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { to: '/register-member', emoji: '📝', label: 'Register Member', tone: 'bg-leaf-100 text-leaf-700', show: main },
          { to: '/distribution', emoji: '🎁', label: 'Book Distribution', tone: 'bg-sunny-100 text-sunny-700', show: true },
          { to: main ? '/balaks' : '/balikas', emoji: main ? '👦' : '👧', label: main ? 'Balak List' : 'Balika List', tone: 'bg-sky2-100 text-sky2-700', show: true },
          { to: '/reports', emoji: '📊', label: 'Excel Reports', tone: 'bg-bubble-100 text-bubble-700', show: true },
        ]
          .filter((a) => a.show)
          .map((a) => (
            <Link key={a.to} to={a.to} className={`flex flex-col items-center gap-1 rounded-4xl border-2 border-white py-5 font-extrabold shadow-pop transition hover:-translate-y-0.5 ${a.tone}`}>
              <span className="text-4xl">{a.emoji}</span>
              {a.label}
            </Link>
          ))}
      </div>
    </>
  );
}

/** Search by mobile, name or Member ID. Children who share a number are listed one by one. */
function FindMember() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<MemberRow[] | null>(null);
  const [latest, setLatest] = useState<Record<number, BookRow>>({});
  const [openId, setOpenId] = useState<number | null>(null);

  async function find(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    const digits = term.replace(/\D/g, '');
    let query = supabase.from('members').select('*, areas(name), subscriptions(*)').order('member_code').limit(50);
    if (/^bp-?[bg]-?\d+$/i.test(term)) query = query.ilike('member_code', term.toUpperCase());
    else if (digits.length >= 4 && digits.length === term.replace(/[\s+-]/g, '').length) query = query.like('phone', `%${digits.slice(-10)}%`);
    else query = query.ilike('full_name', `%${term.replace(/[%_,()]/g, '')}%`);
    const { data } = await query;
    const list = (data as MemberRow[]) ?? [];
    setResults(list);
    if (list.length) {
      const { data: b } = await supabase.from('book_report').select('*').in('member_id', list.map((m) => m.id)).order('seq_no');
      const map: Record<number, BookRow> = {};
      for (const row of (b as BookRow[]) ?? []) map[row.member_id] = row;
      setLatest(map);
    }
  }

  return (
    <div className="card space-y-3">
      <form onSubmit={find} className="flex flex-wrap gap-2">
        <input
          className="input min-w-[14rem] flex-1"
          placeholder="🔎 Find by mobile number, name or Member ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Find member"
        />
        <button type="submit" className="btn-primary">Search</button>
      </form>
      {results && results.length === 0 && <p className="text-sm font-bold text-ink-400">No member found.</p>}
      {results && results.length > 0 && (
        <ul className="divide-y divide-ink-800/5">
          {results.map((m) => (
            <li key={m.id}>
              <button type="button" className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-left hover:bg-saffron-50/50" onClick={() => setOpenId(m.id)}>
                <span className="font-mono text-xs font-bold text-ink-500">{m.member_code}</span>
                <span className="font-extrabold">{m.category === 'balak' ? '👦' : '👧'} {m.full_name}</span>
                <span className="text-sm font-semibold text-ink-500">{CATEGORY_LABEL[m.category]} · {m.phone} · {m.areas?.name ?? 'No mandal'}</span>
                <span className="ml-auto">{latest[m.id] ? <StatusPill status={latest[m.id].status} /> : <span className="text-xs font-semibold text-ink-400">No books yet</span>}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <MemberDetail memberId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
