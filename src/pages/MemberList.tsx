import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { isMainHead, useAuth } from '../auth/AuthProvider';
import { HandoverModal, StatusPill, type HandoverMode } from '../components/BookActions';
import { MemberDetail } from '../components/MemberDetail';
import { EmptyState, PageHeader, Spinner } from '../components/ui';
import { fetchAll, fetchAreas, fetchBookRows } from '../lib/data';
import { downloadReport } from '../lib/excel';
import { supabase } from '../lib/supabase';
import { CATEGORY_LABEL, type Area, type BookRow, type Category, type MemberRow } from '../lib/types';

type Filter = 'all' | 'pending' | 'with_volunteer' | 'up_to_date';

export default function MemberList({ category }: { category: Category }) {
  const { profile } = useAuth();
  const main = isMainHead(profile);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [books, setBooks] = useState<BookRow[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [areaId, setAreaId] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<number | null>(null);
  const [mode, setMode] = useState<HandoverMode | null>(null);
  const [selected, setSelected] = useState<BookRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, b] = await Promise.all([
        fetchAll<MemberRow>(() => supabase.from('members').select('*, areas(name), subscriptions(*)').eq('category', category).order('member_code')),
        fetchBookRows((q) => q.eq('category', category)),
      ]);
      setMembers(m);
      setBooks(b);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoaded(true);
  }, [category]);

  useEffect(() => {
    setLoaded(false);
    void load();
    void fetchAreas().then(setAreas);
  }, [load]);

  const booksByMember = useMemo(() => {
    const map = new Map<number, BookRow[]>();
    for (const b of books) map.set(b.member_id, [...(map.get(b.member_id) ?? []), b]);
    return map;
  }, [books]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return members.filter((m) => {
      if (areaId && String(m.area_id ?? '') !== areaId) return false;
      const mine = booksByMember.get(m.id) ?? [];
      if (filter === 'pending' && !mine.some((b) => b.status === 'pending')) return false;
      if (filter === 'with_volunteer' && !mine.some((b) => b.status === 'given_to_volunteer')) return false;
      if (filter === 'up_to_date' && (mine.length === 0 || mine.some((b) => b.status === 'pending' || b.status === 'given_to_volunteer'))) return false;
      if (!q) return true;
      return (
        m.full_name.toLowerCase().includes(q) ||
        m.member_code.toLowerCase().includes(q) ||
        (digits.length >= 3 && m.phone.includes(digits))
      );
    });
  }, [members, booksByMember, search, areaId, filter]);

  function act(m: HandoverMode, member: MemberRow) {
    setSelected((booksByMember.get(member.id) ?? []).filter((b) => b.status === 'pending'));
    setMode(m);
  }

  async function download() {
    setDownloading(true);
    try {
      await downloadReport(category === 'balak' ? 'balak-details' : 'balika-details');
    } catch (e) {
      setError((e as Error).message);
    }
    setDownloading(false);
  }

  const label = CATEGORY_LABEL[category];
  return (
    <>
      <PageHeader
        emoji={category === 'balak' ? '👦' : '👧'}
        tone={category === 'balak' ? 'sky' : 'bubble'}
        title={`${label} List`}
        subtitle={`Search by name, Member ID or mobile number. Members who share a mobile number are listed separately.`}
        actions={
          <>
            {main && <Link to={`/register-member?category=${category}`} className="btn-primary">➕ Register {label}</Link>}
            <button type="button" className="btn-outline" onClick={() => void download()} disabled={downloading}>
              {downloading ? 'Preparing…' : `⬇️ ${label} Details.xlsx`}
            </button>
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        <input
          className="input max-w-xs py-1.5"
          placeholder="🔎 Name, ID or mobile"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search"
        />
        <select className="input w-auto py-1.5" value={areaId} onChange={(e) => setAreaId(e.target.value)} aria-label="Mandal">
          <option value="">📍 All mandals</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        {(
          [
            ['all', 'All'],
            ['pending', '⏳ Book pending'],
            ['with_volunteer', '🤝 With volunteer'],
            ['up_to_date', '✅ All received'],
          ] as [Filter, string][]
        ).map(([k, text]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={`btn btn-sm ${filter === k ? 'bg-ink-800 text-white' : 'btn-outline'}`}>
            {text}
          </button>
        ))}
        <span className="self-center text-sm font-bold text-ink-400">{filtered.length} of {members.length}</span>
      </div>

      {message && <p className="alert-ok">{message}</p>}
      {error && <p className="alert-error">{error}</p>}
      {!loaded && <Spinner />}
      {loaded && members.length === 0 && (
        <EmptyState title={`No ${label}s registered yet`} hint={main ? `Use “Register ${label}” to add the first one.` : 'The Main Head registers members.'} />
      )}

      {loaded && members.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Member ID</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Mobile</th>
                <th className="px-4 py-3">Mandal</th>
                <th className="px-4 py-3">Latest book</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const mine = booksByMember.get(m.id) ?? [];
                const latest = mine[mine.length - 1];
                const pending = mine.filter((b) => b.status === 'pending').length;
                return (
                  <tr key={m.id} className="border-t border-ink-800/5 hover:bg-saffron-50/50">
                    <td className="px-4 py-2.5 font-mono text-xs font-bold text-ink-500">{m.member_code}</td>
                    <td className="px-4 py-2.5">
                      <button type="button" className="text-left font-extrabold text-ink-800 hover:text-saffron-600" onClick={() => setOpenId(m.id)}>
                        {m.full_name}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 font-semibold tabular-nums">{m.phone}</td>
                    <td className="px-4 py-2.5 font-semibold text-ink-500">{m.areas?.name ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      {latest ? <StatusPill status={latest.status} /> : <span className="text-xs font-semibold text-ink-400">No books yet</span>}
                      {pending > 1 && <span className="ml-1 text-xs font-bold text-saffron-600">{pending} pending</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        {pending > 0 && (
                          <>
                            <button type="button" className="btn-green btn-sm" onClick={() => act('given', m)}>✅ Give Book</button>
                            <button type="button" className="btn-sky btn-sm" onClick={() => act('given_to_volunteer', m)}>🤝 Volunteer</button>
                          </>
                        )}
                        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpenId(m.id)}>Details</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <MemberDetail memberId={openId} onClose={() => setOpenId(null)} onChanged={load} />
      <HandoverModal
        books={selected}
        mode={mode}
        onClose={() => setMode(null)}
        onDone={(msg) => {
          setMode(null);
          setMessage(msg);
          void load();
        }}
      />
    </>
  );
}
