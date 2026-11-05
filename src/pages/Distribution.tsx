import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isMainHead, useAuth } from '../auth/AuthProvider';
import { HandoverModal, StatusPill, type HandoverMode } from '../components/BookActions';
import { MemberDetail } from '../components/MemberDetail';
import { EmptyState, PageHeader, Spinner } from '../components/ui';
import { formatDate } from '../lib/dates';
import { fetchAreas, fetchBookRows } from '../lib/data';
import { undoBookStatus } from '../lib/offline';
import { supabase } from '../lib/supabase';
import { issueLabel, STATUS_EMOJI, STATUS_LABEL, type Area, type BookRow, type BookStatus, type Category, type Issue } from '../lib/types';
import Issues from './Issues';

const STATUSES: BookStatus[] = ['pending', 'given_to_volunteer', 'given', 'delivered'];

export default function Distribution() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'stock' ? 'stock' : 'hand';

  return (
    <>
      <PageHeader
        emoji="🎁"
        tone="leaf"
        title="Book Distribution"
        subtitle="Give books directly to children, or hand them to a volunteer who delivers them."
      />
      <div className="flex gap-2">
        <button type="button" className={`btn ${tab === 'hand' ? 'bg-ink-800 text-white' : 'btn-outline'}`} onClick={() => setParams({})}>
          🎁 Hand out books
        </button>
        <button type="button" className={`btn ${tab === 'stock' ? 'bg-ink-800 text-white' : 'btn-outline'}`} onClick={() => setParams({ tab: 'stock' })}>
          📦 Books received
        </button>
      </div>
      {tab === 'hand' ? <HandOut /> : <Issues />}
    </>
  );
}

function HandOut() {
  const { profile } = useAuth();
  const main = isMainHead(profile);
  const [params, setParams] = useSearchParams();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [rows, setRows] = useState<BookRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<Category | ''>(main ? '' : 'balika');
  const [status, setStatus] = useState<BookStatus | ''>('pending');
  const [areaId, setAreaId] = useState('');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<HandoverMode | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [openMember, setOpenMember] = useState<number | null>(null);

  const issueId = params.get('issue') ? Number(params.get('issue')) : null;

  useEffect(() => {
    void fetchAreas().then(setAreas);
    // Only issues whose books have arrived have a distribution list.
    void supabase
      .from('issues')
      .select('*, stock_receipts!inner(id)')
      .order('issue_year', { ascending: false })
      .order('issue_month', { ascending: false })
      .order('seq_no', { ascending: false })
      .then(({ data }) => {
        const list = (data as Issue[]) ?? [];
        setIssues(list);
        if (!issueId && list[0]) setParams({ issue: String(list[0].id) }, { replace: true });
        if (list.length === 0) setLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!issueId) return;
    try {
      setRows(await fetchBookRows((q) => q.eq('issue_id', issueId)));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoaded(true);
  }, [issueId]);

  useEffect(() => {
    setLoaded(false);
    setPicked(new Set());
    void load();
  }, [load]);

  const inScope = useMemo(
    () => rows.filter((r) => (!category || r.category === category) && (!areaId || String(r.area_id ?? '') === areaId)),
    [rows, category, areaId],
  );
  const counts = useMemo(() => {
    const c: Record<BookStatus, number> = { pending: 0, given: 0, given_to_volunteer: 0, delivered: 0 };
    for (const r of inScope) c[r.status]++;
    return c;
  }, [inScope]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return inScope.filter(
      (r) =>
        (!status || r.status === status) &&
        (!q || r.full_name.toLowerCase().includes(q) || r.member_code.toLowerCase().includes(q) || (digits.length >= 3 && r.phone.includes(digits)) || (r.volunteer_name ?? '').toLowerCase().includes(q)),
    );
  }, [inScope, status, search]);

  const pickedRows = shown.filter((r) => picked.has(r.id));
  const allPicked = shown.length > 0 && pickedRows.length === shown.length;

  function toggle(id: number) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  }

  function start(m: HandoverMode, list: BookRow[]) {
    setPicked(new Set(list.map((r) => r.id)));
    setMode(m);
  }

  async function undo(list: BookRow[]) {
    if (list.length > 1 && !window.confirm(`Move ${list.length} book(s) one step back?`)) return;
    const res = await undoBookStatus(list.map((r) => r.id));
    setMessage(res.error ? `⚠️ ${res.error}` : `↩️ ${res.updated} book(s) moved one step back.`);
    setPicked(new Set());
    void load();
  }

  const can = (s: BookStatus) => pickedRows.length > 0 && pickedRows.every((r) => r.status === s);
  const issue = issues.find((i) => i.id === issueId);

  return (
    <>
      <div className="card flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <label className="label" htmlFor="d-issue">Book</label>
          <select id="d-issue" className="input" value={issueId ?? ''} onChange={(e) => setParams({ issue: e.target.value })}>
            {issues.length === 0 && <option value="">No books received yet</option>}
            {issues.map((i) => (
              <option key={i.id} value={i.id}>
                {i.language === 'gu' ? '📗' : '📘'} {issueLabel(i)}
              </option>
            ))}
          </select>
        </div>
        {main && (
          <div>
            <label className="label" htmlFor="d-cat">Side</label>
            <select id="d-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value as Category | '')}>
              <option value="">Balak + Balika</option>
              <option value="balak">👦 Balaks</option>
              <option value="balika">👧 Balikas</option>
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="d-area">Mandal</label>
          <select id="d-area" className="input" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            <option value="">All mandals</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[12rem] flex-1">
          <label className="label" htmlFor="d-search">Search</label>
          <input id="d-search" className="input" placeholder="Name, ID, mobile or volunteer" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(status === s ? '' : s)}
            className={`rounded-3xl border-2 p-3 text-left transition ${status === s ? 'border-ink-800 bg-white shadow-pop' : 'border-white bg-white/70'}`}
          >
            <div className="text-2xl font-extrabold tabular-nums">{counts[s]}</div>
            <div className="text-sm font-bold text-ink-500">
              {STATUS_EMOJI[s]} {STATUS_LABEL[s]}
            </div>
          </button>
        ))}
      </div>

      {message && <p className="alert-ok">{message}</p>}
      {error && <p className="alert-error">{error}</p>}

      {pickedRows.length > 0 && (
        <div className="sticky top-28 z-20 flex flex-wrap items-center gap-2 rounded-3xl bg-ink-800 p-3 text-white shadow-soft">
          <span className="font-extrabold">{pickedRows.length} selected</span>
          {can('pending') && (
            <>
              <button type="button" className="btn-green btn-sm" onClick={() => setMode('given')}>✅ Give Book</button>
              <button type="button" className="btn-sky btn-sm" onClick={() => setMode('given_to_volunteer')}>🤝 Give to Volunteer</button>
            </>
          )}
          {can('given_to_volunteer') && (
            <>
              <button type="button" className="btn-grape btn-sm" onClick={() => setMode('delivered')}>🎉 Mark Delivered</button>
              <button type="button" className="btn-sky btn-sm" onClick={() => setMode('given_to_volunteer')}>🔁 Hand to another volunteer</button>
            </>
          )}
          {pickedRows.every((r) => r.status !== 'pending') && (
            <button type="button" className="btn-outline btn-sm text-ink-800" onClick={() => void undo(pickedRows)}>↩️ Undo</button>
          )}
          {!pickedRows.every((r) => r.status === pickedRows[0].status) && (
            <span className="text-sm font-semibold opacity-80">Pick books with the same status to act on them together.</span>
          )}
          <button type="button" className="btn-ghost btn-sm ml-auto text-white" onClick={() => setPicked(new Set())}>Clear</button>
        </div>
      )}

      {!loaded && <Spinner />}
      {loaded && issues.length === 0 && (
        <EmptyState title="No books received yet" hint="Open “Books received”, add the issue and record the books from the Karyalaya. The list of children is made automatically." />
      )}
      {loaded && issue && rows.length === 0 && <EmptyState title="Nobody is due this book" hint="Registered members whose plan covers this issue appear here." />}

      {loaded && shown.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allPicked}
                    onChange={() => setPicked(allPicked ? new Set() : new Set(shown.map((r) => r.id)))}
                  />
                </th>
                <th className="px-3 py-3">Member ID</th>
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Mobile</th>
                <th className="px-3 py-3">Mandal</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Volunteer / date</th>
                <th className="px-3 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className={`border-t border-ink-800/5 ${picked.has(r.id) ? 'bg-sunny-50' : 'hover:bg-saffron-50/50'}`}>
                  <td className="px-3 py-2.5">
                    <input type="checkbox" aria-label={`Select ${r.full_name}`} checked={picked.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs font-bold text-ink-500">{r.member_code}</td>
                  <td className="px-3 py-2.5">
                    <button type="button" className="text-left font-extrabold hover:text-saffron-600" onClick={() => setOpenMember(r.member_id)}>
                      {r.category === 'balak' ? '👦' : '👧'} {r.full_name}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 font-semibold tabular-nums">{r.phone}</td>
                  <td className="px-3 py-2.5 font-semibold text-ink-500">{r.mandal ?? '—'}</td>
                  <td className="px-3 py-2.5"><StatusPill status={r.status} /></td>
                  <td className="px-3 py-2.5 text-xs font-semibold text-ink-500">
                    {r.volunteer_name && <div>🤝 {r.volunteer_name}</div>}
                    {r.status === 'delivered' && r.delivered_on ? `Delivered ${formatDate(r.delivered_on)}` : r.handed_on ? formatDate(r.handed_on) : ''}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      {r.status === 'pending' && (
                        <>
                          <button type="button" className="btn-green btn-sm" onClick={() => start('given', [r])}>✅ Give</button>
                          <button type="button" className="btn-sky btn-sm" onClick={() => start('given_to_volunteer', [r])}>🤝</button>
                        </>
                      )}
                      {r.status === 'given_to_volunteer' && (
                        <button type="button" className="btn-grape btn-sm" onClick={() => start('delivered', [r])}>🎉 Delivered</button>
                      )}
                      {r.status !== 'pending' && (
                        <button type="button" className="btn-ghost btn-sm" onClick={() => void undo([r])} aria-label="Undo">↩️</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {loaded && rows.length > 0 && shown.length === 0 && <p className="text-center font-bold text-ink-400">Nothing matches these filters.</p>}

      <HandoverModal
        books={pickedRows.length ? pickedRows : rows.filter((r) => picked.has(r.id))}
        mode={mode}
        onClose={() => setMode(null)}
        onDone={(msg) => {
          setMode(null);
          setMessage(msg);
          setPicked(new Set());
          void load();
        }}
      />
      <MemberDetail memberId={openMember} onClose={() => setOpenMember(null)} onChanged={load} />
    </>
  );
}
