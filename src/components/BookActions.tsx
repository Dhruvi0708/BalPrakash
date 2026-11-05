import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { toLocalInput } from '../lib/dates';
import { fetchVolunteers } from '../lib/data';
import { setBookStatus } from '../lib/offline';
import { CATEGORY_LABEL, issueLabel, STATUS_EMOJI, STATUS_LABEL, type BookRow, type BookStatus, type TeamMember } from '../lib/types';
import { Modal, Pill, STATUS_TONE } from './ui';

export function StatusPill({ status }: { status: BookStatus }) {
  return (
    <Pill tone={STATUS_TONE[status]}>
      {STATUS_EMOJI[status]} {STATUS_LABEL[status]}
    </Pill>
  );
}

export type HandoverMode = 'given' | 'given_to_volunteer' | 'delivered';

const TITLES: Record<HandoverMode, string> = {
  given: '✅ Give book directly',
  given_to_volunteer: '🤝 Give to volunteer',
  delivered: '🎉 Mark as delivered',
};

/**
 * Confirms a handover for one or more books.
 * given: a head hands the book straight to the child.
 * given_to_volunteer: a head hands books to a volunteer (not yet with the child).
 * delivered: the volunteer has handed the book to the child.
 */
export function HandoverModal({
  books,
  mode,
  onClose,
  onDone,
}: {
  books: BookRow[];
  mode: HandoverMode | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [volunteers, setVolunteers] = useState<TeamMember[]>([]);
  const [volunteerId, setVolunteerId] = useState('');
  const [manualName, setManualName] = useState('');
  const [when, setWhen] = useState(() => toLocalInput(new Date()));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = mode !== null && books.length > 0;
  const categories = useMemo(() => [...new Set(books.map((b) => b.category))], [books]);
  // Only volunteers who serve the side(s) of the selected books.
  const fitting = volunteers.filter((v) => v.category === null || categories.every((c) => c === v.category));

  useEffect(() => {
    if (!open) return;
    setError(null);
    setVolunteerId('');
    setManualName('');
    setWhen(toLocalInput(new Date()));
    if (mode === 'given_to_volunteer') void fetchVolunteers().then(setVolunteers);
  }, [open, mode]);

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (!mode) return;
    if (mode === 'given_to_volunteer' && !volunteerId && !manualName.trim()) {
      return setError('Choose a volunteer from the list or type their name.');
    }
    setBusy(true);
    setError(null);
    const res = await setBookStatus(
      books.map((b) => b.id),
      {
        status: mode,
        volunteerId: volunteerId ? Number(volunteerId) : null,
        volunteerName: volunteerId ? null : manualName.trim() || null,
        at: new Date(when).toISOString(),
      },
    );
    setBusy(false);
    if (res.error) return setError(res.error);
    const n = books.length;
    if (res.queued) return onDone(`📴 Saved on this phone. ${n} book(s) will update when you're back online.`);
    const skipped = res.skipped ? ` ${res.skipped} skipped (already updated or not allowed).` : '';
    onDone(`${STATUS_EMOJI[mode]} ${res.updated} book(s) marked "${STATUS_LABEL[mode]}".${skipped}`);
  }

  const names = books.slice(0, 6);
  return (
    <Modal open={open} onClose={onClose} title={mode ? TITLES[mode] : ''}>
      <form onSubmit={confirm} className="space-y-4">
        <div className="rounded-3xl bg-ink-800/5 p-3">
          <div className="text-sm font-extrabold text-ink-600">
            {books.length} book{books.length === 1 ? '' : 's'}
          </div>
          <ul className="mt-1 space-y-0.5 text-sm font-semibold text-ink-700">
            {names.map((b) => (
              <li key={b.id}>
                <span className="font-mono text-xs text-ink-400">{b.member_code}</span> {b.full_name} · {issueLabel(b)}
              </li>
            ))}
            {books.length > names.length && <li className="text-ink-400">…and {books.length - names.length} more</li>}
          </ul>
        </div>

        {mode === 'given_to_volunteer' && (
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="h-vol">Volunteer</label>
              <select id="h-vol" className="input" value={volunteerId} onChange={(e) => setVolunteerId(e.target.value)}>
                <option value="">— Type a name below instead —</option>
                {fitting.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.full_name} · {v.phone}
                    {v.category ? ` · ${CATEGORY_LABEL[v.category]}` : ''}
                  </option>
                ))}
              </select>
            </div>
            {!volunteerId && (
              <div>
                <label className="label" htmlFor="h-name">Volunteer name (if not in the list)</label>
                <input id="h-name" className="input" placeholder="e.g. Rameshbhai" value={manualName} onChange={(e) => setManualName(e.target.value)} />
                <p className="mt-1 text-xs font-semibold text-ink-400">A typed name has no login, so a head marks these books delivered later.</p>
              </div>
            )}
            <p className="alert-ok text-sm">This records that the volunteer has the books. They are not marked delivered until the volunteer hands them over.</p>
          </div>
        )}

        <div>
          <label className="label" htmlFor="h-when">{mode === 'delivered' ? 'Delivered on' : 'Handed over on'}</label>
          <input id="h-when" type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} required />
        </div>

        {error && <p className="alert-error">{error}</p>}
        <button type="submit" className={mode === 'given_to_volunteer' ? 'btn-sky w-full' : 'btn-green w-full'} disabled={busy}>
          {busy ? 'Saving…' : `Confirm · ${books.length} book${books.length === 1 ? '' : 's'}`}
        </button>
      </form>
    </Modal>
  );
}
