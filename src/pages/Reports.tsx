import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { PageHeader } from '../components/ui';
import { downloadReport, REPORTS, type ReportKind } from '../lib/excel';

const BY_ROLE: Record<string, ReportKind[]> = {
  main_head: ['balak-details', 'balika-details', 'volunteer-distribution', 'master'],
  balika_head: ['balika-details', 'balika-distribution'],
  volunteer: ['my-assigned', 'my-completed'],
};

const EMOJI: Record<ReportKind, string> = {
  'balak-details': '👦',
  'balika-details': '👧',
  'volunteer-distribution': '🤝',
  master: '📚',
  'balika-distribution': '🎁',
  'my-assigned': '📦',
  'my-completed': '🎉',
};

export function ReportButtons({ kinds }: { kinds: ReportKind[] }) {
  const [busy, setBusy] = useState<ReportKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function get(kind: ReportKind) {
    setBusy(kind);
    setError(null);
    try {
      await downloadReport(kind);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {kinds.map((k) => (
          <div key={k} className="card flex items-center gap-4">
            <span className="text-4xl">{EMOJI[k]}</span>
            <div className="min-w-0 flex-1">
              <div className="font-extrabold">{REPORTS[k].file}.xlsx</div>
              <div className="text-sm font-semibold text-ink-500">{REPORTS[k].hint}</div>
            </div>
            <button type="button" className="btn-primary btn-sm shrink-0" onClick={() => void get(k)} disabled={busy !== null}>
              {busy === k ? 'Preparing…' : '⬇️ Download Excel'}
            </button>
          </div>
        ))}
      </div>
      {error && <p className="alert-error">{error}</p>}
    </div>
  );
}

export default function Reports() {
  const { profile } = useAuth();
  return (
    <>
      <PageHeader
        emoji="📊"
        tone="bubble"
        title="Excel Reports"
        subtitle="Each file is made fresh from the latest records when you click. Mobile numbers are kept as text, with filters on every column."
      />
      <ReportButtons kinds={BY_ROLE[profile?.role ?? ''] ?? []} />
    </>
  );
}
