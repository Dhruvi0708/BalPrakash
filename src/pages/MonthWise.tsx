import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isMainHead, useAuth } from '../auth/AuthProvider';
import { EmptyState, ProgressBar, Spinner } from '../components/ui';
import { supabase } from '../lib/supabase';
import { MONTHS, type Category, type Language } from '../lib/types';

interface Row {
  issue_id: number;
  issue_year: number | null;
  issue_month: number | null;
  language: Language;
  seq_no: number;
  title: string | null;
  category: Category;
  pending: number;
  given: number;
  given_to_volunteer: number;
  delivered: number;
}

interface BookLine {
  issue_id: number;
  language: Language;
  seq_no: number;
  title: string | null;
  pending: number;
  given: number;
  given_to_volunteer: number;
  delivered: number;
}

interface Month {
  key: string;
  label: string;
  books: BookLine[];
}

const total = (b: Pick<BookLine, 'pending' | 'given' | 'given_to_volunteer' | 'delivered'>) => b.pending + b.given + b.given_to_volunteer + b.delivered;

/** Book distribution month by month: how many books are pending, given, with volunteers and delivered. */
export default function MonthWise() {
  const { profile } = useAuth();
  const main = isMainHead(profile);
  const [, setParams] = useSearchParams();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<string>('');
  const [category, setCategory] = useState<Category | ''>('');

  useEffect(() => {
    void supabase.rpc('month_summary').then(({ data, error }) => {
      if (error) setError(error.message);
      const list = ((data as Row[]) ?? []).map((r) => ({
        ...r,
        pending: Number(r.pending),
        given: Number(r.given),
        given_to_volunteer: Number(r.given_to_volunteer),
        delivered: Number(r.delivered),
      }));
      setRows(list);
      const latest = list.find((r) => r.issue_year)?.issue_year;
      if (latest) setYear(String(latest));
    });
  }, []);

  const years = useMemo(() => [...new Set((rows ?? []).map((r) => r.issue_year).filter((y): y is number => y !== null))], [rows]);

  const months = useMemo(() => {
    const map = new Map<string, Month>();
    for (const r of rows ?? []) {
      if (year && String(r.issue_year ?? '') !== year) continue;
      if (category && r.category !== category) continue;
      const key = r.issue_year && r.issue_month ? `${r.issue_year}-${String(r.issue_month).padStart(2, '0')}` : 'none';
      const label = r.issue_year && r.issue_month ? `${MONTHS[r.issue_month - 1]} ${r.issue_year}` : 'No month set';
      const m = map.get(key) ?? { key, label, books: [] };
      let b = m.books.find((x) => x.issue_id === r.issue_id);
      if (!b) {
        b = { issue_id: r.issue_id, language: r.language, seq_no: r.seq_no, title: r.title, pending: 0, given: 0, given_to_volunteer: 0, delivered: 0 };
        m.books.push(b);
      }
      b.pending += r.pending;
      b.given += r.given;
      b.given_to_volunteer += r.given_to_volunteer;
      b.delivered += r.delivered;
      map.set(key, m);
    }
    // Newest month first; Gujarati before English inside a month.
    return [...map.values()]
      .sort((a, b) => (a.key === 'none' ? 1 : b.key === 'none' ? -1 : b.key.localeCompare(a.key)))
      .map((m) => ({ ...m, books: m.books.sort((a, b) => a.language.localeCompare(b.language) * -1) }));
  }, [rows, year, category]);

  const sum = months.flatMap((m) => m.books).reduce(
    (acc, b) => ({ pending: acc.pending + b.pending, given: acc.given + b.given, given_to_volunteer: acc.given_to_volunteer + b.given_to_volunteer, delivered: acc.delivered + b.delivered }),
    { pending: 0, given: 0, given_to_volunteer: 0, delivered: 0 },
  );

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="mw-year">Year</label>
          <select id="mw-year" className="input w-auto" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        {main && (
          <div>
            <label className="label" htmlFor="mw-cat">Side</label>
            <select id="mw-cat" className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value as Category | '')}>
              <option value="">Balak + Balika</option>
              <option value="balak">👦 Balaks</option>
              <option value="balika">👧 Balikas</option>
            </select>
          </div>
        )}
        <p className="pb-2 text-sm font-semibold text-ink-500">Tap a book to hand it out.</p>
      </div>

      {error && <p className="alert-error">{error}</p>}
      {!rows && !error && <Spinner />}
      {rows && months.length === 0 && <EmptyState title="No books for this period" hint="Months appear here once books for an issue are recorded under “Books received”." />}

      {months.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Month</th>
                <th className="px-4 py-3">Book</th>
                <th className="px-4 py-3 text-right">⏳ Pending</th>
                <th className="px-4 py-3 text-right">✅ Given</th>
                <th className="px-4 py-3 text-right">🤝 With volunteers</th>
                <th className="px-4 py-3 text-right">🎉 Delivered</th>
                <th className="w-40 px-4 py-3">Reached child</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) =>
                m.books.map((b, i) => {
                  const all = total(b);
                  const done = b.given + b.delivered;
                  return (
                    <tr
                      key={`${m.key}-${b.issue_id}`}
                      className={`cursor-pointer font-semibold tabular-nums hover:bg-saffron-50/60 ${i === 0 ? 'border-t-2 border-ink-800/10' : ''}`}
                      onClick={() => setParams({ issue: String(b.issue_id) })}
                    >
                      <td className="px-4 py-2.5 font-extrabold">{i === 0 ? m.label : ''}</td>
                      <td className="px-4 py-2.5">
                        {b.language === 'gu' ? '📗 Gujarati' : '📘 English'} #{b.seq_no}
                        {b.title ? <span className="text-ink-400"> · {b.title}</span> : null}
                      </td>
                      <td className={`px-4 py-2.5 text-right ${b.pending ? 'font-extrabold text-saffron-600' : 'text-ink-400'}`}>{b.pending}</td>
                      <td className="px-4 py-2.5 text-right">{b.given}</td>
                      <td className={`px-4 py-2.5 text-right ${b.given_to_volunteer ? 'text-sky2-600' : ''}`}>{b.given_to_volunteer}</td>
                      <td className="px-4 py-2.5 text-right">{b.delivered}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={done} max={all} tone={done === all ? 'leaf' : 'saffron'} />
                          <span className="w-10 text-right text-xs font-bold">{all ? Math.round((done / all) * 100) : 0}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                }),
              )}
              <tr className="border-t-2 border-ink-800/20 bg-ink-800/5 font-extrabold tabular-nums">
                <td className="px-4 py-3" colSpan={2}>Total {year || 'all years'}</td>
                <td className="px-4 py-3 text-right">{sum.pending}</td>
                <td className="px-4 py-3 text-right">{sum.given}</td>
                <td className="px-4 py-3 text-right">{sum.given_to_volunteer}</td>
                <td className="px-4 py-3 text-right">{sum.delivered}</td>
                <td className="px-4 py-3 text-xs">{total(sum) ? Math.round(((sum.given + sum.delivered) / total(sum)) * 100) : 0}% of {total(sum)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
