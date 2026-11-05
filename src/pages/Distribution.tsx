import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Confetti, KidReader } from '../components/Art';
import { QrScanner } from '../components/QrScanner';
import { EmptyState, Modal, PageHeader, Pill, ProgressBar, Spinner, STATUS_TONE } from '../components/ui';
import { downloadCsv } from '../lib/csv';
import { formatDateTime } from '../lib/dates';
import { saveMark, type DistributionPatch } from '../lib/offline';
import { supabase } from '../lib/supabase';
import { CATEGORY_LABEL, issueLabel, type Area, type Category, type Distribution, type Issue } from '../lib/types';

type Row = Distribution & {
  subscriptions: {
    id: number;
    language: string;
    members: { id: number; full_name: string; phone: string; category: Category; card_code: string; area_id: number | null; areas: { name: string } | null };
  };
};

type StatusFilter = 'all' | 'pending' | 'collected';

function waLink(phone: string, text: string) {
  return `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;
}

export default function Distribution() {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [status, setStatus] = useState<StatusFilter>('pending');
  const [areaId, setAreaId] = useState<string>(profile?.role === 'volunteer' && profile.area_id ? String(profile.area_id) : '');
  const [category, setCategory] = useState<Category | ''>('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [mediatorFor, setMediatorFor] = useState<Row[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanHit, setScanHit] = useState<{ code: string; rows: Row[] } | null>(null);
  const [celebrate, setCelebrate] = useState(0);

  const issueId = params.get('issue') ? Number(params.get('issue')) : null;
  const issue = issues.find((i) => i.id === issueId) ?? null;

  useEffect(() => {
    Promise.all([
      supabase.from('issues').select('*, stock_receipts(id)').order('created_at', { ascending: false }),
      supabase.from('areas').select('*').order('name'),
    ]).then(([i, a]) => {
      const withStock = ((i.data as (Issue & { stock_receipts: { id: number }[] })[]) ?? []).filter((x) => x.stock_receipts.length > 0);
      setIssues(withStock);
      setAreas((a.data as Area[]) ?? []);
      if (!params.get('issue') && withStock[0]) setParams({ issue: String(withStock[0].id) }, { replace: true });
      if (withStock.length === 0) setLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!issueId) return;
    const { data, error } = await supabase
      .from('distributions')
      .select('*, subscriptions!inner(id, language, members!inner(id, full_name, phone, category, card_code, area_id, areas(name)))')
      .eq('issue_id', issueId)
      .limit(5000);
    setError(error?.message ?? null);
    setRows(((data as Row[]) ?? []).sort((a, b) => a.subscriptions.members.full_name.localeCompare(b.subscriptions.members.full_name)));
    setSelected(new Set());
    setLoaded(true);
  }, [issueId]);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.subscriptions.members.category))), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const m = r.subscriptions.members;
      if (status === 'pending' && r.status !== 'pending') return false;
      if (status === 'collected' && r.status === 'pending') return false;
      if (areaId && String(m.area_id ?? '') !== areaId) return false;
      if (category && m.category !== category) return false;
      return !q || m.full_name.toLowerCase().includes(q) || m.phone.includes(q) || m.card_code.toLowerCase() === q;
    });
  }, [rows, status, areaId, category, search]);

  const total = rows.length;
  const done = rows.filter((r) => r.status !== 'pending').length;
  const viaMediator = rows.filter((r) => r.status === 'mediator').length;

  async function mark(targets: Row[], patch: DistributionPatch) {
    setError(null);
    setNotice(null);
    let queued = 0;
    for (const r of targets) {
      const res = await saveMark(r.id, patch);
      if (res.error) {
        setError(res.error);
        break;
      }
      if (res.queued) queued += 1;
      setRows((prev) =>
        prev.map((x) =>
          x.id === r.id
            ? {
                ...x,
                status: patch.status,
                collected_by_name: patch.collected_by_name ?? null,
                mediator_relation: patch.mediator_relation ?? null,
                mediator_phone: patch.mediator_phone ?? null,
                handed_on: patch.status === 'pending' ? null : new Date().toISOString(),
              }
            : x,
        ),
      );
    }
    setSelected(new Set());
    if (queued) setNotice(`📴 Saved on this phone (${queued}). It will sync when you're back online.`);
    if (patch.status !== 'pending') setCelebrate((n) => n + 1);
  }

  function onScan(code: string) {
    const hits = rows.filter((r) => r.subscriptions.members.card_code === code);
    setScanHit({ code, rows: hits });
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportCsv() {
    if (!issue) return;
    downloadCsv(`distribution-${issue.language}-${issue.seq_no}.csv`, [
      ['name', 'phone', 'category', 'area', 'status', 'collected_by', 'relation', 'mediator_phone', 'handed_on'],
      ...filtered.map((r) => {
        const m = r.subscriptions.members;
        return [
          m.full_name,
          m.phone,
          m.category,
          m.areas?.name ?? '',
          r.status,
          r.status === 'self' ? m.full_name : r.collected_by_name ?? '',
          r.mediator_relation ?? '',
          r.mediator_phone ?? '',
          r.handed_on ? formatDateTime(r.handed_on) : '',
        ];
      }),
    ]);
  }

  const selectedRows = filtered.filter((r) => selected.has(r.id));
  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id) || r.status !== 'pending');

  return (
    <>
      <PageHeader
        emoji="🎁"
        tone="leaf"
        title="Distribute books"
        subtitle="Tap ✅ when a child collects their book, or 🤝 when someone collects it for them."
        actions={
          issue && (
            <>
              <button type="button" className="btn-grape" onClick={() => setScanning(true)}>📷 Scan card</button>
              <button type="button" className="btn-outline" onClick={exportCsv}>⬇️ CSV</button>
              <button type="button" className="btn-outline" onClick={() => window.print()}>🖨️ Print</button>
            </>
          )
        }
      />

      {loaded && issues.length === 0 && (
        <EmptyState title="No books to distribute yet" hint="Record stock for an issue on the Issues & stock page first." />
      )}

      {issues.length > 0 && (
        <div className="card relative space-y-4">
          {celebrate > 0 && <Confetti key={celebrate} pieces={18} />}
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[14rem] flex-1">
              <label className="label" htmlFor="d-issue">Issue</label>
              <select id="d-issue" className="input" value={issueId ?? ''} onChange={(e) => setParams({ issue: e.target.value })}>
                {issues.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.language === 'gu' ? '📗 Gujarati' : '📘 English'} · {issueLabel(i)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <KidReader variant="balak" className="h-14 w-12" />
              <div>
                <div className="text-3xl font-extrabold tabular-nums">
                  {done}<span className="text-lg text-ink-400"> / {total}</span>
                </div>
                <div className="text-xs font-bold text-ink-500">given · {viaMediator} via mediator</div>
              </div>
            </div>
          </div>
          <ProgressBar value={done} max={total} tone="leaf" />

          <div className="no-print flex flex-wrap gap-2">
            {(['pending', 'collected', 'all'] as StatusFilter[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`btn btn-sm ${status === s ? 'bg-ink-800 text-white' : 'btn-outline'}`}
              >
                {s === 'pending' ? `⏳ Pending (${total - done})` : s === 'collected' ? `✅ Given (${done})` : `All (${total})`}
              </button>
            ))}
            <select className="input w-auto py-1.5" value={areaId} onChange={(e) => setAreaId(e.target.value)} aria-label="Area">
              <option value="">📍 All areas</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {categories.length > 1 && (
              <select className="input w-auto py-1.5" value={category} onChange={(e) => setCategory(e.target.value as Category | '')} aria-label="Category">
                <option value="">Balak + Balika</option>
                <option value="balak">👦 Balaks</option>
                <option value="balika">👧 Balikas</option>
              </select>
            )}
            <input className="input max-w-[14rem] py-1.5" placeholder="🔎 Name, mobile or card" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      )}

      {error && <p className="alert-error">{error}</p>}
      {notice && <p className="alert-ok">{notice}</p>}

      {issue && !loaded && <Spinner />}

      {selectedRows.length > 0 && (
        <div className="no-print sticky top-28 z-20 flex flex-wrap items-center justify-between gap-2 rounded-3xl bg-ink-800 px-4 py-3 text-white shadow-soft">
          <span className="font-extrabold">{selectedRows.length} selected</span>
          <div className="flex gap-2">
            <button type="button" className="btn-green btn-sm" onClick={() => mark(selectedRows, { status: 'self' })}>✅ Mark all collected</button>
            <button type="button" className="btn-sky btn-sm" onClick={() => setMediatorFor(selectedRows)}>🤝 Via one mediator</button>
            <button type="button" className="btn-ghost btn-sm text-white" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        </div>
      )}

      {issue && loaded && (
        <div className="card overflow-hidden p-0">
          <div className="table-head flex items-center gap-3 px-4 py-3">
            <input
              type="checkbox"
              className="no-print h-5 w-5 accent-leaf-500"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(filtered.filter((r) => r.status === 'pending').map((r) => r.id)))}
              aria-label="Select all pending"
            />
            <span className="flex-1">Child</span>
            <span className="hidden w-40 sm:block">Status</span>
            <span className="no-print w-52 text-right">Actions</span>
          </div>
          <ul className="divide-y-2 divide-ink-800/5">
            {filtered.map((r) => {
              const m = r.subscriptions.members;
              const pending = r.status === 'pending';
              return (
                <li key={r.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${pending ? '' : 'bg-leaf-50/50'}`}>
                  <input
                    type="checkbox"
                    className="no-print h-5 w-5 accent-leaf-500"
                    checked={selected.has(r.id)}
                    disabled={!pending}
                    onChange={() => toggle(r.id)}
                    aria-label={`Select ${m.full_name}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-extrabold">
                      <span>{m.category === 'balak' ? '👦' : '👧'}</span>
                      <span className="truncate">{m.full_name}</span>
                    </div>
                    <div className="text-xs font-semibold text-ink-400">
                      {m.phone} · {m.areas?.name ?? 'No area'} · {CATEGORY_LABEL[m.category]}
                    </div>
                  </div>
                  <div className="w-full text-sm sm:w-40">
                    <Pill tone={STATUS_TONE[r.status]}>{pending ? '⏳ Pending' : r.status === 'self' ? '✅ Self' : '🤝 Mediator'}</Pill>
                    {!pending && (
                      <div className="mt-0.5 text-xs font-semibold text-ink-400">
                        {r.status === 'mediator' && `${r.collected_by_name}${r.mediator_relation ? ` (${r.mediator_relation})` : ''} · `}
                        {r.handed_on && formatDateTime(r.handed_on)}
                      </div>
                    )}
                  </div>
                  <div className="no-print flex w-full justify-end gap-1.5 sm:w-52">
                    {pending ? (
                      <>
                        <button type="button" className="btn-green btn-sm" onClick={() => mark([r], { status: 'self' })} title="Collected by the child">✅ Self</button>
                        <button type="button" className="btn-sky btn-sm" onClick={() => setMediatorFor([r])} title="Collected by someone else">🤝</button>
                        <a
                          className="btn-outline btn-sm"
                          href={waLink(m.phone, `Jai Swaminarayan! 📚 The new Bal Prakash (${issue ? issueLabel(issue) : ''}) for ${m.full_name} is ready to collect.`)}
                          target="_blank"
                          rel="noreferrer"
                          title="Tell them on WhatsApp"
                        >
                          💬
                        </a>
                      </>
                    ) : (
                      <>
                        {r.status === 'mediator' && (
                          <a
                            className="btn-outline btn-sm"
                            href={waLink(m.phone, `Jai Swaminarayan! 📚 ${m.full_name}'s Bal Prakash (${issue ? issueLabel(issue) : ''}) was collected by ${r.collected_by_name}.`)}
                            target="_blank"
                            rel="noreferrer"
                            title="Tell them on WhatsApp"
                          >
                            💬
                          </a>
                        )}
                        <button type="button" className="btn-ghost btn-sm" onClick={() => mark([r], { status: 'pending' })}>↩ Undo</button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-4 py-10 text-center font-bold text-ink-400">
                {status === 'pending' && total > 0 ? '🎉 Everyone in this list has their book!' : 'Nobody matches these filters.'}
              </li>
            )}
          </ul>
        </div>
      )}

      <MediatorModal
        rows={mediatorFor}
        onClose={() => setMediatorFor(null)}
        onSave={async (patch) => {
          if (mediatorFor) await mark(mediatorFor, patch);
          setMediatorFor(null);
          setScanHit(null);
        }}
      />

      <Modal
        open={scanning}
        onClose={() => {
          setScanning(false);
          setScanHit(null);
        }}
        title="📷 Scan member card"
      >
        {scanning && <QrScanner onCode={onScan} />}
        {scanHit && (
          <div className="mt-4 space-y-2">
            {scanHit.rows.length === 0 && <p className="alert-error">No book in this issue for card {scanHit.code}.</p>}
            {scanHit.rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-3xl bg-leaf-50 p-3">
                <div>
                  <div className="text-lg font-extrabold">{r.subscriptions.members.full_name}</div>
                  <Pill tone={STATUS_TONE[r.status]}>{r.status === 'pending' ? '⏳ Pending' : r.status === 'self' ? '✅ Already given' : '🤝 Given via mediator'}</Pill>
                </div>
                {r.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-green"
                      onClick={async () => {
                        await mark([r], { status: 'self' });
                        setScanHit({ ...scanHit, rows: scanHit.rows.map((x) => (x.id === r.id ? { ...x, status: 'self' } : x)) });
                      }}
                    >
                      ✅ Self
                    </button>
                    <button type="button" className="btn-sky" onClick={() => setMediatorFor([r])}>🤝</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}

function MediatorModal({ rows, onClose, onSave }: { rows: Row[] | null; onClose: () => void; onSave: (p: DistributionPatch) => Promise<void> }) {
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (rows) {
      setName('');
      setRelation('');
      setPhone('');
    }
  }, [rows]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await onSave({ status: 'mediator', collected_by_name: name.trim(), mediator_relation: relation.trim() || null, mediator_phone: phone.trim() || null });
    setBusy(false);
  }

  const who = rows?.length === 1 ? rows[0].subscriptions.members.full_name : `${rows?.length ?? 0} children`;

  return (
    <Modal open={rows !== null} onClose={onClose} title="🤝 Collected by someone else">
      <form onSubmit={submit} className="space-y-3">
        <p className="font-semibold text-ink-500">Who collected the book for <b className="text-ink-800">{who}</b>?</p>
        <div>
          <label className="label" htmlFor="m-name">Mediator's name *</label>
          <input id="m-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="m-rel">Relation</label>
            <input id="m-rel" className="input" list="relations" placeholder="e.g. mother, uncle" value={relation} onChange={(e) => setRelation(e.target.value)} />
            <datalist id="relations">
              {['Mother', 'Father', 'Brother', 'Sister', 'Grandparent', 'Uncle', 'Aunt', 'Neighbour', 'Friend'].map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label" htmlFor="m-phone">Mediator's mobile</label>
            <input id="m-phone" className="input" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <button type="submit" className="btn-sky w-full" disabled={busy}>{busy ? 'Saving…' : 'Save handover'}</button>
      </form>
    </Modal>
  );
}
