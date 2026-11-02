import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { downloadCsv, parseCsv } from '../lib/csv';
import { supabase } from '../lib/supabase';
import type { Area } from '../lib/types';

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
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Areas / sabhas</h1>
        <p className="text-sm text-slate-500">Used to group people and split distribution lists.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <form onSubmit={addOne} className="card space-y-3">
          <div className="font-medium">Add an area</div>
          <input className="input" placeholder="e.g. Mayur Vihar" value={name} onChange={(e) => setName(e.target.value)} required />
          <button className="btn-primary" type="submit">Add</button>
        </form>

        <div className="card space-y-3">
          <div className="font-medium">Upload a list (CSV)</div>
          <p className="text-sm text-slate-500">One column called <code>name</code>. Duplicates are skipped.</p>
          <div className="flex flex-wrap gap-2">
            <label className="btn-primary cursor-pointer">
              Choose CSV file
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={upload} />
            </label>
            <button
              type="button"
              className="btn-outline"
              onClick={() => downloadCsv('areas-template.csv', [['name'], ['Mayur Vihar'], ['Dwarka']])}
            >
              Download template
            </button>
          </div>
        </div>
      </div>

      {message && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="card p-0">
        <ul className="divide-y divide-slate-100">
          {areas.map((a) => (
            <li key={a.id} className="flex items-center justify-between px-5 py-3">
              <span className={a.is_active ? '' : 'text-slate-400 line-through'}>{a.name}</span>
              <button type="button" className="text-sm text-saffron-700 hover:underline" onClick={() => toggle(a)}>
                {a.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </li>
          ))}
          {areas.length === 0 && <li className="px-5 py-6 text-center text-sm text-slate-500">No areas yet.</li>}
        </ul>
      </div>
    </div>
  );
}
