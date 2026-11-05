export type AppRole = 'main_head' | 'balika_head' | 'volunteer' | 'subscriber';
export type Category = 'balak' | 'balika';
export type Language = 'gu' | 'en';
export type RecordSource = 'online' | 'manual' | 'import';

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: AppRole;
  category: Category | null;
  area_id: number | null;
}

export interface Area {
  id: number;
  name: string;
  notes: string | null;
  is_active: boolean;
}

export interface Issue {
  id: number;
  language: Language;
  seq_no: number;
  issue_month: number | null;
  issue_year: number | null;
  title: string | null;
}

export interface Distribution {
  id: number;
  issue_id: number;
  subscription_id: number;
  status: 'pending' | 'self' | 'mediator';
  collected_by_name: string | null;
  mediator_relation: string | null;
  mediator_phone: string | null;
  handed_on: string | null;
  handed_by: string | null;
  notes: string | null;
}

export interface Subscription {
  id: number;
  member_id: number;
  language: Language;
  plan_years: number;
  start_issue_seq: number;
  total_issues: number;
  payment_status: 'pending' | 'verified' | 'rejected';
  status: 'pending' | 'active' | 'expired' | 'cancelled';
  receipt_no: string | null;
  amount: number | null;
  payment_mode: PaymentMode | null;
  source: RecordSource;
  review_note: string | null;
  created_at: string;
}

export type PaymentMode = 'cash' | 'upi' | 'cheque' | 'other';

export interface RegistrationWindow {
  id: number;
  title: string;
  opens_at: string;
  closes_at: string;
  instructions: string | null;
}

export const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = { cash: 'Cash', upi: 'UPI', cheque: 'Cheque', other: 'Other' };

export interface Member {
  id: number;
  full_name: string;
  phone: string;
  category: Category;
  area_id: number | null;
  address: string | null;
  dob: string | null;
  notes: string | null;
  card_code: string;
  source: RecordSource;
}

export interface StockReceipt {
  id: number;
  issue_id: number;
  category: Category;
  quantity: number;
  received_on: string;
  notes: string | null;
}

export interface HelpRequest {
  id: number;
  member_id: number;
  message: string;
  status: 'open' | 'resolved';
  response: string | null;
  created_at: string;
  resolved_at: string | null;
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function issueLabel(issue: Pick<Issue, 'seq_no' | 'issue_month' | 'issue_year' | 'title'>): string {
  const when = issue.issue_month && issue.issue_year ? `${MONTHS[issue.issue_month - 1]} ${issue.issue_year}` : '';
  const name = issue.title || `Issue ${issue.seq_no}`;
  return when ? `${name} · ${when}` : name;
}

/** Last issue number covered by a subscription. */
export function endSeq(s: Pick<Subscription, 'start_issue_seq' | 'total_issues'>): number {
  return s.start_issue_seq + s.total_issues - 1;
}

export interface MemberRow extends Member {
  areas: Pick<Area, 'name'> | null;
  subscriptions: Subscription[];
}

export interface ImportResult {
  created_members: number;
  existing_members: number;
  created_subscriptions: number;
  errors: { row: number; message: string }[];
}

export const ROLE_LABEL: Record<AppRole, string> = {
  main_head: 'Main Head (Delhi)',
  balika_head: 'Balika Prakash Head',
  volunteer: 'Volunteer',
  subscriber: 'Subscriber',
};

export const LANGUAGE_LABEL: Record<Language, string> = { gu: 'Gujarati', en: 'English' };
export const CATEGORY_LABEL: Record<Category, string> = { balak: 'Balak', balika: 'Balika' };
