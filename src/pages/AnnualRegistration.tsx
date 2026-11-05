import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Modal, PageHeader, Spinner } from '../components/ui';
import { formatDate } from '../lib/dates';
import { supabase } from '../lib/supabase';
import type { RegistrationCycle } from '../lib/types';

interface YearSummary {
  year: number;
  balak: number;
  balika: number;
  pending: number;
  given: number;
  given_to_volunteer: number;
  delivered: number;
}

export default function AnnualRegistration() {
  const [cycles, setCycles] = useState<RegistrationCycle[] | null>(null);
  const [years, setYears] = useState<Record<number, YearSummary>>({});
  const [confirming, setConfirming] = useState(false);
  const [year, setYear] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([
      supabase.from('registration_cycles').select('*').order('year', { ascending: false }),
      supabase.rpc('dashboard_summary'),
    ]);
    const list = (c.data as RegistrationCycle[]) ?? [];
    setCycles(list);
    const map: Record<number, YearSummary> = {};
    for (const y of ((s.data as { years?: YearSummary[] } | null)?.years ?? [])) map[y.year] = y;
    setYears(map);
    const latest = list[0]?.year ?? new Date().getFullYear() - 1;
    setYear(String(Math.max(latest + 1, new Date().getFullYear())));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function start(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('start_registration_year', { p_year: Number(year), p_title: title.trim() || null });
    setBusy(false);
    if (error) return setError(error.message);
    setConfirming(false);
    setTitle('');
    void load();
  }

  const current = cycles?.find((c) => c.is_current);

  return (
    <>
      <PageHeader
        emoji="📅"
        tone="saffron"
        title="Annual Registration"
        subtitle="You decide when a new year's registration begins. Earlier years, their books and history stay saved. Member IDs never change."
      />

      {!cycles && <Spinner />}
      {cycles && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card space-y-2">
            <div className="text-xs font-extrabold uppercase tracking-wider text-ink-400">Registering now for</div>
            {current ? (
              <>
                <div className="text-4xl font-extrabold">{current.year}</div>
                {current.title && <div className="font-bold text-ink-600">{current.title}</div>}
                <div className="text-sm font-semibold text-ink-500">Started {formatDate(current.started_at)}</div>
                <Link to="/register-member" className="btn-primary inline-flex">📝 Register a member</Link>
              </>
            ) : (
              <div className="font-bold text-ink-500">No registration year has been started yet.</div>
            )}
          </div>
          <div className="card space-y-3">
            <div className="text-lg font-extrabold">🌱 Start a new registration year</div>
            <p className="text-sm font-semibold text-ink-500">
              New registrations will be filed under the new year. Children already registered keep their Member ID; register them again for the new year from their details page.
            </p>
            <button type="button" className="btn-green" onClick={() => setConfirming(true)}>Start new year…</button>
          </div>
        </div>
      )}

      {cycles && cycles.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Balaks</th>
                <th className="px-4 py-3">Balikas</th>
                <th className="px-4 py-3">Books pending</th>
                <th className="px-4 py-3">Reached child</th>
                <th className="px-4 py-3">With volunteers</th>
              </tr>
            </thead>
            <tbody>
              {cycles.map((c) => {
                const y = years[c.year];
                return (
                  <tr key={c.id} className="border-t border-ink-800/5 font-semibold tabular-nums">
                    <td className="px-4 py-2.5 font-extrabold">
                      {c.year} {c.is_current && <span className="ml-1 rounded-full bg-leaf-100 px-2 py-0.5 text-xs text-leaf-700">current</span>}
                    </td>
                    <td className="px-4 py-2.5">{formatDate(c.started_at)}{c.closed_at ? ` – ${formatDate(c.closed_at)}` : ''}</td>
                    <td className="px-4 py-2.5">{y?.balak ?? 0}</td>
                    <td className="px-4 py-2.5">{y?.balika ?? 0}</td>
                    <td className="px-4 py-2.5">{y?.pending ?? 0}</td>
                    <td className="px-4 py-2.5">{(y?.given ?? 0) + (y?.delivered ?? 0)}</td>
                    <td className="px-4 py-2.5">{y?.given_to_volunteer ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={confirming} onClose={() => setConfirming(false)} title="🌱 Start a new registration year">
        <form onSubmit={start} className="space-y-3">
          <div>
            <label className="label" htmlFor="y-year">Year</label>
            <input id="y-year" className="input" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="y-title">Name (optional)</label>
            <input id="y-title" className="input" placeholder="e.g. Registration 2027" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          {current && (
            <p className="alert-error text-sm">
              {current.year} will stop taking new registrations. Its records and books are kept, and books still due keep appearing for distribution.
            </p>
          )}
          {error && <p className="alert-error">{error}</p>}
          <button type="submit" className="btn-green w-full" disabled={busy}>{busy ? 'Starting…' : `Yes, start ${year}`}</button>
        </form>
      </Modal>
    </>
  );
}
