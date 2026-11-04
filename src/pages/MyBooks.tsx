import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { formatDate } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { CATEGORY_LABEL, LANGUAGE_LABEL, type Distribution, type Issue, type Member, type Subscription } from '../lib/types';

type DistributionWithIssue = Distribution & { issues: Issue };
type SubscriptionWithBooks = Subscription & { distributions: DistributionWithIssue[] };
type MemberWithBooks = Member & { subscriptions: SubscriptionWithBooks[] };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function issueLabel(issue: Issue): string {
  const when = issue.issue_month && issue.issue_year ? ` · ${MONTHS[issue.issue_month - 1]} ${issue.issue_year}` : '';
  return issue.title ? `${issue.title}${when}` : `Issue ${issue.seq_no}${when}`;
}

export default function MyBooks() {
  const { profile } = useAuth();
  const [people, setPeople] = useState<MemberWithBooks[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!profile?.phone) {
      setLoaded(true);
      return;
    }
    supabase
      .from('members')
      .select('*, subscriptions(*, distributions(*, issues(*)))')
      .eq('phone', profile.phone)
      .order('full_name')
      .then(({ data }) => {
        setPeople((data as MemberWithBooks[]) ?? []);
        setLoaded(true);
      });
  }, [profile?.phone]);

  if (!loaded) return <div className="text-slate-500">Loading…</div>;

  if (!profile?.phone) {
    return (
      <div className="card max-w-lg space-y-2">
        <h1 className="text-lg font-semibold">My books</h1>
        <p className="text-sm text-slate-600">
          To see your Bal Prakash books, sign out and sign in with the mobile number you registered with.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">My books</h1>
        <p className="text-sm text-slate-500">Bal Prakash registered with {profile.phone}.</p>
      </div>

      {people.length === 0 && (
        <div className="card text-sm text-slate-600">
          No registration found for {profile.phone} yet. Please contact your Bal Prakash head.
        </div>
      )}

      {people.map((p) => (
        <div key={p.id} className="card space-y-4">
          <div>
            <div className="text-lg font-semibold">{p.full_name}</div>
            <div className="text-sm text-slate-500">{CATEGORY_LABEL[p.category]}</div>
          </div>

          {p.subscriptions.length === 0 && <div className="text-sm text-slate-400">No subscription yet.</div>}

          {p.subscriptions.map((s) => {
            const books = [...s.distributions].sort((a, b) => b.issues.seq_no - a.issues.seq_no);
            const collected = books.filter((d) => d.status !== 'pending').length;
            const waiting = books.length - collected;
            const toCome = Math.max(s.total_issues - books.length, 0);
            return (
              <div key={s.id} className="rounded-lg border border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="font-medium">
                    {LANGUAGE_LABEL[s.language]} · {s.plan_years} year plan
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      s.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {s.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 divide-x divide-slate-100 text-center">
                  <div className="px-2 py-3">
                    <div className="text-2xl font-semibold tabular-nums text-green-700">{collected}</div>
                    <div className="text-xs text-slate-500">Collected</div>
                  </div>
                  <div className="px-2 py-3">
                    <div className="text-2xl font-semibold tabular-nums text-saffron-700">{waiting}</div>
                    <div className="text-xs text-slate-500">Ready to collect</div>
                  </div>
                  <div className="px-2 py-3">
                    <div className="text-2xl font-semibold tabular-nums text-slate-600">{toCome}</div>
                    <div className="text-xs text-slate-500">Still to come</div>
                  </div>
                </div>

                {books.length > 0 && (
                  <ul className="divide-y divide-slate-100 border-t border-slate-100">
                    {books.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                        <span className="font-medium">{issueLabel(d.issues)}</span>
                        {d.status === 'pending' ? (
                          <span className="text-saffron-700">Ready to collect</span>
                        ) : (
                          <span className="text-slate-600">
                            {d.status === 'self'
                              ? 'Collected by you'
                              : `Collected by ${d.collected_by_name}${d.mediator_relation ? ` (${d.mediator_relation})` : ''}`}
                            {d.handed_on && <span className="text-slate-400"> · {formatDate(d.handed_on)}</span>}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
