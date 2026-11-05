import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { PageHeader } from '../components/ui';
import { downloadCsv, parseCsv } from '../lib/csv';
import { supabase } from '../lib/supabase';
import type { Area } from '../lib/types';

const AREA_COLORS = ['bg-saffron-100', 'bg-sky2-100', 'bg-leaf-100', 'bg-bubble-100', 'bg-grape-100', 'bg-sunny-100'];

export default function Areas() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from('areas').select('*').order('name');
    setAreas((data as Area[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function addOne(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.rpc('import_areas', { p_names: [name] });
    if (error) return setError(error.message);
    setName('');
    setMessage('Area added.');
    void load();
  }

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    const rows = await parseCsv(file);
    const names = rows.map((r) => r.name ?? r.area ?? '').filter(Boolean);
    if (names.length === 0) return setError('No "name" column found in the file.');
    const { data, error } = await supabase.rpc('import_areas', { p_names: names });
    if (error) return setError(error.message);
    setMessage(`${data} new area(s) added, ${names.length - (data as number)} already existed.`);
    void load();
  }

  async function toggle(area: Area) {
    await supabase.from('areas').update({ is_active: !area.is_active }).eq('id', area.id);
    void load();
  }

  return (
    <>
      <PageHeader emoji="📍" tone="leaf" title="Areas / sabhas" subtitle="Used to group people and split distribution lists by locality." />

      <div className="grid gap-4 md:grid-cols-2">
        <form onSubmit={addOne} className="card space-y-3">
          <div className="text-lg font-extrabold">➕ Add an area</div>
          <input className="input" placeholder="e.g. Mayur Vihar" value={name} onChange={(e) => setName(e.target.value)} required />
          <button className="btn-primary" type="submit">Add</button>
        </form>

        <div className="card space-y-3">
          <div className="text-lg font-extrabold">📄 Upload a list (CSV)</div>
          <p className="text-sm font-semibold text-ink-500">One column called <code>name</code>. Duplicates are skipped.</p>
          <div className="flex flex-wrap gap-2">
            <label className="btn-sky cursor-pointer">
              Choose CSV file
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={upload} />
            </label>
            <button type="button" className="btn-outline" onClick={() => downloadCsv('areas-template.csv', [['name'], ['Mayur Vihar'], ['Dwarka']])}>
              Download template
            </button>
          </div>
        </div>
      </div>

      {message && <p className="alert-ok">{message}</p>}
      {error && <p className="alert-error">{error}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {areas.map((a, i) => (
          <div key={a.id} className={`flex flex-col justify-between gap-2 rounded-4xl border-2 border-white p-4 shadow-pop ${a.is_active ? AREA_COLORS[i % AREA_COLORS.length] : 'bg-ink-800/5'}`}>
            <span className={`text-lg font-extrabold ${a.is_active ? '' : 'text-ink-400 line-through'}`}>📍 {a.name}</span>
            <button type="button" className="self-start text-sm font-bold text-ink-500 hover:underline" onClick={() => toggle(a)}>
              {a.is_active ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        ))}
        {areas.length === 0 && <div className="col-span-full text-center font-bold text-ink-400">No areas yet.</div>}
      </div>
    </>
  );
}
