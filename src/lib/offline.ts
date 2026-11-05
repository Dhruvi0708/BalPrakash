import { supabase } from './supabase';

// Distribution marks made without signal are kept on the device and sent when back online.
// Each entry is the full change for one distribution row, so the latest mark wins.

export interface DistributionPatch {
  status: 'pending' | 'self' | 'mediator';
  collected_by_name?: string | null;
  mediator_relation?: string | null;
  mediator_phone?: string | null;
  handed_on?: string | null;
}

const KEY = 'bp-offline-marks';
type Queue = Record<string, DistributionPatch>;
const listeners = new Set<(n: number) => void>();

function read(): Queue {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Queue;
  } catch {
    return {};
  }
}

function write(q: Queue) {
  try {
    localStorage.setItem(KEY, JSON.stringify(q));
  } catch {
    // storage unavailable: nothing more we can do offline
  }
  listeners.forEach((l) => l(Object.keys(q).length));
}

export function pendingCount(): number {
  return Object.keys(read()).length;
}

export function subscribeQueue(cb: (n: number) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function isNetworkError(message: string): boolean {
  return /failed to fetch|networkerror|load failed|network request failed/i.test(message);
}

/** Saves a mark now, or queues it when offline. Returns an error message for real failures. */
export async function saveMark(id: number, patch: DistributionPatch): Promise<{ queued: boolean; error?: string }> {
  const full: DistributionPatch = { ...patch, handed_on: patch.status === 'pending' ? null : new Date().toISOString() };
  if (!navigator.onLine) {
    write({ ...read(), [id]: full });
    return { queued: true };
  }
  const { error } = await supabase.from('distributions').update(full).eq('id', id);
  if (error && isNetworkError(error.message)) {
    write({ ...read(), [id]: full });
    return { queued: true };
  }
  return { queued: false, error: error?.message };
}

let flushing = false;

export async function flushQueue(): Promise<void> {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    const q = read();
    for (const [id, patch] of Object.entries(q)) {
      const { error } = await supabase.from('distributions').update(patch).eq('id', Number(id));
      if (error && isNetworkError(error.message)) break;
      const rest = read();
      delete rest[id];
      write(rest);
    }
  } finally {
    flushing = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushQueue());
  setTimeout(() => void flushQueue(), 2000);
}
