import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isHead, useAuth } from '../auth/AuthProvider';
import { BookBuddy, Cloud, KidReader, Sun } from '../components/Art';
import { ProgressBar, StatCard } from '../components/ui';
import { supabase } from '../lib/supabase';
import { endSeq, issueLabel, type Issue, type Language } from '../lib/types';

interface Counts {
  balak: number;
  balika: number;
  gu: number;
  en: number;
  pendingApproval: number;
  openHelp: number;
  expiring: number;
}

interface IssueProgress {
  issue: Issue;
  total: number;
  done: number;
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Dashboard() {
  const { profile } = useAuth();
  const head = isHead(profile);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [progress, setProgress] = useState<IssueProgress[]>([]);

  useEffect(() => {
    async function load() {
      // RLS already limits everything to the side the user manages.
      const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
      const [balak, balika, gu, en, pendingApproval, openHelp, issuesRes, activeSubs] = await Promise.all([
        count(supabase.from('members').select('id', { count: 'exact', head: true }).eq('category', 'balak')),
        count(supabase.from('members').select('id', { count: 'exact', head: true }).eq('category', 'balika')),
        count(supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('language', 'gu')),
        count(supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('language', 'en')),
        count(supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
        count(supabase.from('help_requests').select('id', { count: 'exact', head: true }).eq('status', 'open')),
        supabase.from('issues').select('*, stock_receipts(id)').order('seq_no', { ascending: false }),
        supabase.from('subscriptions').select('language, start_issue_seq, total_issues').eq('status', 'active'),
      ]);

      const issues = ((issuesRes.data as (Issue & { stock_receipts: { id: number }[] })[]) ?? []).filter((i) => i.stock_receipts.length);
      const latestSeq: Record<Language, number> = { gu: 0, en: 0 };
      for (const i of (issuesRes.data as Issue[]) ?? []) latestSeq[i.language] = Math.max(latestSeq[i.language], i.seq_no);
      const expiring = ((activeSubs.data as { language: Language; start_issue_seq: number; total_issues: number }[]) ?? []).filter(
        (s) => endSeq(s) - latestSeq[s.language] <= 2,
      ).length;

      setCounts({ balak, balika, gu, en, pendingApproval, openHelp, expiring });

      // Progress for the latest received issue of each language.
      const latest = (['gu', 'en'] as Language[]).map((l) => issues.find((i) => i.language === l)).filter(Boolean) as Issue[];
      const prog = await Promise.all(
        latest.map(async (issue) => {
          const [all, given] = await Promise.all([
            count(supabase.from('distributions').select('id', { count: 'exact', head: true }).eq('issue_id', issue.id)),
            count(supabase.from('distributions').select('id', { count: 'exact', head: true }).eq('issue_id', issue.id).neq('status', 'pending')),
          ]);
          return { issue, total: all, done: given };
        }),
      );
      setProgress(prog);
    }
    void load();
  }, []);

  const showBalak = profile?.role !== 'balika_head' && profile?.category !== 'balika';
  const showBalika = profile?.role !== 'volunteer' || profile?.category === 'balika';

  return (
    <>
      <div className="relative overflow-hidden rounded-4xl bg-gradient-to-br from-sky2-400 via-grape-400 to-bubble-400 p-6 text-white shadow-soft sm:p-8">
        <Cloud className="absolute -left-4 top-4 h-12 w-24 opacity-80" />
        <Cloud className="absolute right-40 top-2 hidden h-10 w-20 opacity-60 sm:block" />
        <Sun className="absolute right-4 top-4 h-16 w-16 animate-wiggle" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-lg font-bold opacity-90">{greeting()} 👋</div>
            <h1 className="text-3xl text-white sm:text-4xl">Jai Swaminarayan, {profile?.full_name?.split(' ')[0] ?? 'sevak'}!</h1>
            <p className="mt-1 max-w-md font-semibold opacity-95">Here's how Bal Prakash is reaching every balak and balika in Delhi.</p>
          </div>
          <div className="flex items-end gap-1">
            <KidReader variant="balak" className="h-20 w-16 animate-float" />
            <BookBuddy className="h-24 w-24 animate-float-slow" />
            <KidReader variant="balika" className="h-20 w-16 animate-float" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {showBalak && <StatCard emoji="👦" label="Balaks" value={counts?.balak ?? '–'} tone="sky" />}
        {showBalika && <StatCard emoji="👧" label="Balikas" value={counts?.balika ?? '–'} tone="bubble" />}
        <StatCard emoji="📗" label="Gujarati subscriptions" value={counts?.gu ?? '–'} tone="saffron" />
        <StatCard emoji="📘" label="English subscriptions" value={counts?.en ?? '–'} tone="grape" />
      </div>

      {head && counts && (counts.pendingApproval > 0 || counts.openHelp > 0 || counts.expiring > 0) && (
        <div className="grid gap-3 md:grid-cols-3">
          {counts.pendingApproval > 0 && (
            <Link to="/approvals" className="card flex items-center gap-3 transition hover:-translate-y-0.5">
              <span className="text-4xl">✅</span>
              <div>
                <div className="text-lg font-extrabold">{counts.pendingApproval} to approve</div>
                <div className="text-sm font-semibold text-ink-500">New online registrations</div>
              </div>
            </Link>
          )}
          {counts.openHelp > 0 && (
            <Link to="/requests" className="card flex items-center gap-3 transition hover:-translate-y-0.5">
              <span className="text-4xl">💬</span>
              <div>
                <div className="text-lg font-extrabold">{counts.openHelp} help request(s)</div>
                <div className="text-sm font-semibold text-ink-500">Waiting for your reply</div>
              </div>
            </Link>
          )}
          {counts.expiring > 0 && (
            <Link to="/members?filter=expiring" className="card flex items-center gap-3 transition hover:-translate-y-0.5">
              <span className="text-4xl">⏰</span>
              <div>
                <div className="text-lg font-extrabold">{counts.expiring} ending soon</div>
                <div className="text-sm font-semibold text-ink-500">2 or fewer issues left: remind to renew</div>
              </div>
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {progress.map((p) => (
          <Link key={p.issue.id} to={`/distribution?issue=${p.issue.id}`} className="card block space-y-3 transition hover:-translate-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wider text-ink-400">
                  {p.issue.language === 'gu' ? '📗 Latest Gujarati issue' : '📘 Latest English issue'}
                </div>
                <div className="text-xl font-extrabold">{issueLabel(p.issue)}</div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-extrabold tabular-nums">{p.total ? Math.round((p.done / p.total) * 100) : 0}%</div>
                <div className="text-xs font-bold text-ink-500">{p.done} of {p.total} given</div>
              </div>
            </div>
            <ProgressBar value={p.done} max={p.total} tone={p.issue.language === 'gu' ? 'saffron' : 'grape'} />
            <div className="text-sm font-bold text-leaf-600">{p.total - p.done > 0 ? `🎁 ${p.total - p.done} still to hand out →` : '🎉 All handed out!'}</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { to: '/distribution', emoji: '🎁', label: 'Distribute', tone: 'bg-leaf-100 text-leaf-700' },
          { to: '/issues', emoji: '📦', label: 'Record stock', tone: 'bg-sunny-100 text-sunny-700', show: head },
          { to: '/members', emoji: '🧒', label: 'Balaks & Balikas', tone: 'bg-sky2-100 text-sky2-700' },
          { to: '/registration', emoji: '📝', label: 'Registration', tone: 'bg-bubble-100 text-bubble-700', show: profile?.role === 'main_head' },
        ]
          .filter((a) => a.show !== false)
          .map((a) => (
            <Link key={a.to} to={a.to} className={`flex flex-col items-center gap-1 rounded-4xl border-2 border-white py-5 font-extrabold shadow-pop transition hover:-translate-y-0.5 ${a.tone}`}>
              <span className="text-4xl">{a.emoji}</span>
              {a.label}
            </Link>
          ))}
      </div>
    </>
  );
}
