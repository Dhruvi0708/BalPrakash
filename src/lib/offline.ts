import { supabase } from './supabase';
import type { BookStatus } from './types';

// Book status changes go through the set_book_status / undo_book_status database functions,
// which check who is allowed to do what. Changes made without signal are kept on the device
// (with the time they happened) and sent when the phone is back online.

export interface BookChange {
  status: Exclude<BookStatus, 'pending'>;
  volunteerId?: number | null;
  volunteerName?: string | null;
  at?: string;
  note?: string | null;
}

export interface ChangeResult {
  updated: number;
  skipped: number;
  queued: boolean;
  error?: string;
}

interface QueuedChange extends BookChange {
  ids: number[];
  at: string;
}

const KEY = 'bp-offline-books';
const listeners = new Set<(n: number) => void>();

function read(): QueuedChange[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? (v as QueuedChange[]) : [];
  } catch {
    return [];
  }
}

function write(q: QueuedChange[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(q));
  } catch {
    // storage unavailable: nothing more we can do offline
  }
  listeners.forEach((l) => l(q.reduce((n, c) => n + c.ids.length, 0)));
}

export function pendingCount(): number {
  return read().reduce((n, c) => n + c.ids.length, 0);
}

export function subscribeQueue(cb: (n: number) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function isNetworkError(message: string): boolean {
  return /failed to fetch|networkerror|load failed|network request failed/i.test(message);
}

async function send(ids: number[], c: BookChange & { at: string }) {
  return supabase.rpc('set_book_status', {
    p_ids: ids,
    p_status: c.status,
    p_volunteer_id: c.volunteerId ?? null,
    p_volunteer_name: c.volunteerName ?? null,
    p_at: c.at,
    p_note: c.note ?? null,
  });
}

/** Moves books forward (given / given to volunteer / delivered), or queues the change when offline. */
export async function setBookStatus(ids: number[], change: BookChange): Promise<ChangeResult> {
  const full = { ...change, at: change.at ?? new Date().toISOString() };
  if (!navigator.onLine) {
    write([...read(), { ...full, ids }]);
    return { updated: 0, skipped: 0, queued: true };
  }
  const { data, error } = await send(ids, full);
  if (error && isNetworkError(error.message)) {
    write([...read(), { ...full, ids }]);
    return { updated: 0, skipped: 0, queued: true };
  }
  if (error) return { updated: 0, skipped: 0, queued: false, error: error.message };
  const res = data as { updated: number; skipped: number };
  return { ...res, queued: false };
}

/** Moves books one step back (heads: to pending; volunteers: delivered back to "with me"). */
export async function undoBookStatus(ids: number[]): Promise<{ updated: number; error?: string }> {
  const { data, error } = await supabase.rpc('undo_book_status', { p_ids: ids });
  if (error) return { updated: 0, error: error.message };
  return data as { updated: number };
}

let flushing = false;

export async function flushQueue(): Promise<void> {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    for (;;) {
      const [next] = read();
      if (!next) break;
      const { error } = await send(next.ids, next);
      if (error && isNetworkError(error.message)) break;
      // Other errors (e.g. no longer allowed) are dropped so the queue can't get stuck.
      write(read().slice(1));
    }
  } finally {
    flushing = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushQueue());
  setTimeout(() => void flushQueue(), 2000);
}
