import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { BookBuddy, KidReader } from '../components/Art';
import { MemberCard } from '../components/MemberCard';
import { EmptyState, Modal, Spinner } from '../components/ui';
import { formatDate } from '../lib/dates';
import { useI18n, type StringKey } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { issueLabel, LANGUAGE_LABEL, type Distribution, type HelpRequest, type Issue, type Member, type Subscription } from '../lib/types';

type DistributionWithIssue = Distribution & { issues: Issue };
type SubscriptionWithBooks = Subscription & { distributions: DistributionWithIssue[] };
type MemberWithBooks = Member & { subscriptions: SubscriptionWithBooks[]; help_requests: HelpRequest[] };

const BOOK_COLORS = ['bg-saffron-400', 'bg-sky2-400', 'bg-leaf-400', 'bg-bubble-400', 'bg-grape-400', 'bg-sunny-400'];
const STATUS_KEY: Record<Subscription['status'], StringKey> = {
  active: 'statusActive',
  pending: 'statusPending',
  expired: 'statusExpired',
  cancelled: 'statusCancelled',
};

function HelpBox({ member, onSent }: { member: MemberWithBooks; onSent: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.from('help_requests').insert([{ member_id: member.id, message: msg.trim() }]);
    if (error) return setError(error.message);
    setMsg('');
    setSent(true);
    setOpen(false);
    onSent();
  }

  const requests = [...member.help_requests].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="space-y-2">
      {requests.map((r) => (
        <div key={r.id} className="rounded-2xl bg-sky2-50 px-4 py-2.5 text-sm">
          <div className="font-semibold text-ink-700">💬 {r.message}</div>
          {r.response && (
            <div className="mt-1 font-semibold text-leaf-700">
              {t('reply')}: {r.response}
            </div>
          )}
          <div className="text-xs text-ink-400">{formatDate(r.created_at)}</div>
        </div>
      ))}
      {sent && <p className="alert-ok">{t('helpSent')}</p>}
      {open ? (
        <form onSubmit={send} className="flex flex-col gap-2 sm:flex-row">
          <input className="input" maxLength={500} placeholder={t('helpPlaceholder')} value={msg} onChange={(e) => setMsg(e.target.value)} required autoFocus />
          <button type="submit" className="btn-sky shrink-0">{t('send')}</button>
        </form>
      ) : (
        <button type="button" className="btn-ghost btn-sm text-sky2-700" onClick={() => setOpen(true)}>
          🙋 {t('needHelp')}
        </button>
      )}
      {error && <p className="alert-error">{error}</p>}
    </div>
  );
}

export default function MyBooks() {
  const { profile } = useAuth();
  const { t } = useI18n();
  const [people, setPeople] = useState<MemberWithBooks[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [cardFor, setCardFor] = useState<MemberWithBooks | null>(null);

  const load = useCallback(async () => {
    if (!profile?.phone) {
      setLoaded(true);
      return;
    }
    const { data } = await supabase
      .from('members')
      .select('*, help_requests(*), subscriptions(*, distributions(*, issues(*)))')
      .eq('phone', profile.phone)
      .order('full_name');
    setPeople((data as MemberWithBooks[]) ?? []);
    setLoaded(true);
  }, [profile?.phone]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!loaded) return <Spinner />;

  if (!profile?.phone) {
    return <EmptyState title={t('myBooks')} hint={t('signInWithMobile')} />;
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-4xl bg-gradient-to-br from-sunny-300 via-saffron-400 to-bubble-400 p-6 text-white shadow-soft">
        <span className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15" />
        <span className="absolute -bottom-12 right-24 h-28 w-28 rounded-full bg-white/10" />
        <div className="relative flex items-center gap-4">
          <BookBuddy className="h-20 w-20 shrink-0 animate-float" />
          <div>
            <h1 className="text-3xl text-white">{t('myBooks')} 📚</h1>
            <p className="font-bold opacity-95">
              {t('myBooksSub')} {profile.phone}
            </p>
          </div>
        </div>
      </div>

      {people.length === 0 && (
        <EmptyState title={t('noRegistration')} hint={t('contactHead')}>
          <Link to="/register" className="btn-primary mt-2">📝 {t('registerCta')}</Link>
        </EmptyState>
      )}

      {people.map((p) => (
        <div key={p.id} className="card space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <KidReader variant={p.category} className="h-16 w-14" />
              <div>
                <div className="text-2xl font-extrabold">{p.full_name}</div>
                <div className={`chip ${p.category === 'balak' ? 'bg-sky2-100 text-sky2-700' : 'bg-bubble-100 text-bubble-700'}`}>
                  {p.category === 'balak' ? `👦 ${t('balak')}` : `👧 ${t('balika')}`}
                </div>
              </div>
            </div>
            <button type="button" className="btn-grape btn-sm" onClick={() => setCardFor(p)}>
              🪪 {t('myCard')}
            </button>
          </div>

          {p.subscriptions.length === 0 && <div className="font-semibold text-ink-400">{t('noSubscription')}</div>}

          {p.subscriptions
            .filter((s) => s.status !== 'cancelled')
            .map((s) => {
              const books = [...s.distributions].sort((a, b) => b.issues.seq_no - a.issues.seq_no);
              const collected = books.filter((d) => d.status !== 'pending').length;
              const waiting = books.length - collected;
              const toCome = Math.max(s.total_issues - books.length, 0);
              const expiring = s.status === 'active' && toCome <= 2;
              return (
                <div key={s.id} className="overflow-hidden rounded-3xl border-2 border-ink-800/5">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-sunny-50 to-saffron-50 px-4 py-3">
                    <div className="font-extrabold">
                      {s.language === 'gu' ? '📗' : '📘'} {LANGUAGE_LABEL[s.language]} · {s.plan_years} {t('yearPlan')}
                    </div>
                    <span
                      className={`chip ${
                        s.status === 'active' ? 'bg-leaf-100 text-leaf-700' : s.status === 'pending' ? 'bg-sunny-100 text-sunny-700' : 'bg-grape-100 text-grape-700'
                      }`}
                    >
                      {t(STATUS_KEY[s.status])}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 p-3 text-center">
                    <div className="rounded-2xl bg-leaf-50 py-3">
                      <div className="text-3xl font-extrabold text-leaf-600">{collected}</div>
                      <div className="text-xs font-bold text-ink-500">✅ {t('collected')}</div>
                    </div>
                    <div className="rounded-2xl bg-saffron-50 py-3">
                      <div className="text-3xl font-extrabold text-saffron-600">{waiting}</div>
                      <div className="text-xs font-bold text-ink-500">🎁 {t('readyToCollect')}</div>
                    </div>
                    <div className="rounded-2xl bg-grape-50 py-3">
                      <div className="text-3xl font-extrabold text-grape-600">{toCome}</div>
                      <div className="text-xs font-bold text-ink-500">🚚 {t('stillToCome')}</div>
                    </div>
                  </div>

                  {expiring && (
                    <div className="mx-3 mb-3 rounded-2xl bg-bubble-50 px-4 py-2 text-sm font-bold text-bubble-700">
                      ⏰ {t('expiringSoon', { n: toCome })}{' '}
                      <Link to="/register" className="underline">📝</Link>
                    </div>
                  )}

                  {books.length > 0 && (
                    <ul className="grid gap-2 px-3 pb-3 sm:grid-cols-2">
                      {books.map((d, i) => (
                        <li key={d.id} className="flex items-center gap-3 rounded-2xl border-2 border-ink-800/5 bg-white px-3 py-2.5">
                          <span className={`flex h-12 w-9 shrink-0 items-center justify-center rounded-md text-lg text-white shadow-pop ${BOOK_COLORS[i % BOOK_COLORS.length]}`}>
                            {d.status === 'pending' ? '🎁' : '✓'}
                          </span>
                          <div className="min-w-0 text-sm">
                            <div className="truncate font-extrabold">{issueLabel(d.issues)}</div>
                            {d.status === 'pending' ? (
                              <div className="font-bold text-saffron-600">{t('readyToCollect')}</div>
                            ) : (
                              <div className="font-semibold text-ink-500">
                                {d.status === 'self'
                                  ? t('collectedByYou')
                                  : `${t('collectedBy')} ${d.collected_by_name}${d.mediator_relation ? ` (${d.mediator_relation})` : ''}`}
                                {d.handed_on && <span className="text-ink-400"> · {formatDate(d.handed_on)}</span>}
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}

          <HelpBox member={p} onSent={load} />
        </div>
      ))}

      <Modal open={cardFor !== null} onClose={() => setCardFor(null)} title={`🪪 ${t('myCard')}`}>
        {cardFor && (
          <div className="space-y-3">
            <MemberCard name={cardFor.full_name} phone={cardFor.phone} category={cardFor.category} code={cardFor.card_code} />
            <p className="text-center text-sm font-semibold text-ink-500">{t('cardHint')}</p>
            <button type="button" className="btn-outline w-full" onClick={() => window.print()}>🖨️ Print</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
