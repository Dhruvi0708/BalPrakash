import { useEffect, type ReactNode } from 'react';
import { BookBuddy } from './Art';

export type Tone = 'saffron' | 'bubble' | 'sky' | 'leaf' | 'grape' | 'sunny';

const TONE_BG: Record<Tone, string> = {
  saffron: 'from-saffron-400 to-saffron-500',
  bubble: 'from-bubble-400 to-bubble-500',
  sky: 'from-sky2-400 to-sky2-500',
  leaf: 'from-leaf-400 to-leaf-500',
  grape: 'from-grape-400 to-grape-500',
  sunny: 'from-sunny-300 to-sunny-500',
};

const TONE_SOFT: Record<Tone, string> = {
  saffron: 'bg-saffron-50 text-saffron-700 border-saffron-100',
  bubble: 'bg-bubble-50 text-bubble-700 border-bubble-100',
  sky: 'bg-sky2-50 text-sky2-700 border-sky2-100',
  leaf: 'bg-leaf-50 text-leaf-700 border-leaf-100',
  grape: 'bg-grape-50 text-grape-700 border-grape-100',
  sunny: 'bg-sunny-50 text-sunny-700 border-sunny-100',
};

export function PageHeader({
  emoji,
  title,
  subtitle,
  tone = 'saffron',
  actions,
}: {
  emoji: string;
  title: string;
  subtitle?: string;
  tone?: Tone;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-4">
        <span className={`flex h-14 w-14 shrink-0 animate-pop items-center justify-center rounded-3xl bg-gradient-to-br text-3xl shadow-pop ${TONE_BG[tone]}`}>
          {emoji}
        </span>
        <div>
          <h1 className="text-2xl sm:text-3xl">{title}</h1>
          {subtitle && <p className="text-[15px] leading-snug text-ink-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ emoji, label, value, tone, hint }: { emoji: string; label: string; value: ReactNode; tone: Tone; hint?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-4xl bg-gradient-to-br p-5 text-white shadow-soft ${TONE_BG[tone]}`}>
      <span className="absolute -right-3 -top-3 text-6xl opacity-25">{emoji}</span>
      <div className="text-sm font-bold opacity-90">{label}</div>
      <div className="mt-1 text-4xl font-extrabold tabular-nums leading-none">{value}</div>
      {hint && <div className="mt-1 text-xs font-semibold opacity-90">{hint}</div>}
    </div>
  );
}

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`chip border ${TONE_SOFT[tone]}`}>{children}</span>;
}

export function ProgressBar({ value, max, tone = 'leaf' }: { value: number; max: number; tone?: Tone }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-ink-800/5">
      <div className={`h-full rounded-full bg-gradient-to-r transition-all ${TONE_BG[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 py-10 text-center">
      <BookBuddy className="h-24 w-24 animate-float" mood="sleepy" />
      <div className="text-lg font-extrabold text-ink-700">{title}</div>
      {hint && <p className="max-w-sm text-sm text-ink-500">{hint}</p>}
      {children}
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-3 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full max-w-lg animate-pop overflow-y-auto rounded-4xl border-2 border-white bg-white p-6 shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl">{title}</h2>
          <button type="button" className="btn-ghost h-9 w-9 rounded-full p-0 text-xl" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-ink-500">
      <BookBuddy className="h-12 w-12 animate-wiggle" />
      <span className="font-bold">{label}</span>
    </div>
  );
}

export const STATUS_TONE: Record<string, Tone> = {
  active: 'leaf',
  pending: 'sunny',
  expired: 'grape',
  cancelled: 'bubble',
  given: 'leaf',
  given_to_volunteer: 'sky',
  delivered: 'grape',
};
