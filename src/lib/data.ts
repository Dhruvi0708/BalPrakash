import { supabase } from './supabase';
import type { Area, BookRow, RegistrationCycle, TeamMember } from './types';

const PAGE = 1000; // Supabase returns at most 1000 rows per request

/** Reads every row of a query, page by page. `build` must return a fresh query each time. */
export async function fetchAll<T>(
  build: () => { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }> },
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data as T[]) ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** Book rows the signed-in user may see (the database applies the role rules). */
export function fetchBookRows(filter?: (q: ReturnType<typeof bookQuery>) => ReturnType<typeof bookQuery>): Promise<BookRow[]> {
  return fetchAll<BookRow>(() => (filter ? filter(bookQuery()) : bookQuery()));
}

function bookQuery() {
  return supabase.from('book_report').select('*').order('member_code').order('seq_no');
}

export async function fetchAreas(): Promise<Area[]> {
  const { data } = await supabase.from('areas').select('id, name, is_active').order('name');
  return (data as Area[]) ?? [];
}

export async function fetchVolunteers(): Promise<TeamMember[]> {
  const { data } = await supabase.from('team_members').select('*').eq('role', 'volunteer').eq('is_active', true).order('full_name');
  return (data as TeamMember[]) ?? [];
}

export async function fetchCycles(): Promise<RegistrationCycle[]> {
  const { data } = await supabase.from('registration_cycles').select('*').order('year', { ascending: false });
  return (data as RegistrationCycle[]) ?? [];
}
