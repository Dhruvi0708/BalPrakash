export type AppRole = 'main_head' | 'balika_head' | 'volunteer' | 'subscriber';
export type Category = 'balak' | 'balika';
export type Language = 'gu' | 'en';
export type RecordSource = 'online' | 'manual' | 'import';
export type BookStatus = 'pending' | 'given' | 'given_to_volunteer' | 'delivered';
export type PaymentMode = 'cash' | 'upi' | 'cheque' | 'other';

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

export interface Subscription {
  id: number;
  member_id: number;
  language: Language;
  plan_years: number;
  start_issue_seq: number;
  total_issues: number;
  status: 'pending' | 'active' | 'expired' | 'cancelled';
  receipt_no: string | null;
  amount: number | null;
  payment_mode: PaymentMode | null;
  cycle_id: number | null;
  created_at: string;
}

export interface Member {
  id: number;
  member_code: string;
  full_name: string;
  phone: string;
  category: Category;
  area_id: number | null;
  address: string | null;
  dob: string | null;
  notes: string | null;
  source: RecordSource;
  created_at: string;
}

export interface MemberRow extends Member {
  areas: Pick<Area, 'name'> | null;
  subscriptions: Subscription[];
}

export interface StockReceipt {
  id: number;
  issue_id: number;
  category: Category;
  quantity: number;
  received_on: string;
  notes: string | null;
}

export interface TeamMember {
  id: number;
  full_name: string;
  phone: string;
  email: string | null;
  role: 'volunteer' | 'balika_head';
  category: Category | null;
  area_id: number | null;
  user_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface RegistrationCycle {
  id: number;
  year: number;
  title: string | null;
  is_current: boolean;
  started_at: string;
  closed_at: string | null;
}

/** One book for one member: a row of the book_report view. */
export interface BookRow {
  id: number;
  status: BookStatus;
  issue_id: number;
  language: Language;
  seq_no: number;
  issue_month: number | null;
  issue_year: number | null;
  issue_title: string | null;
  subscription_id: number;
  plan_years: number;
  registration_year: number | null;
  member_id: number;
  member_code: string;
  full_name: string;
  phone: string;
  category: Category;
  area_id: number | null;
  mandal: string | null;
  volunteer_id: number | null;
  volunteer_name: string | null;
  handed_on: string | null;
  handed_by_name: string | null;
  delivered_on: string | null;
  delivered_by_name: string | null;
  notes: string | null;
  updated_at: string;
}

export interface BookEvent {
  id: number;
  distribution_id: number;
  status: BookStatus;
  previous_status: BookStatus | null;
  volunteer_name: string | null;
  at: string;
  by_name: string | null;
  note: string | null;
}

export interface ImportResult {
  created_members: number;
  existing_members: number;
  created_subscriptions: number;
  errors: { row: number; message: string }[];
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function issueLabel(issue: { seq_no: number; issue_month: number | null; issue_year: number | null; title?: string | null; issue_title?: string | null; language?: Language }): string {
  const when = issue.issue_month && issue.issue_year ? `${MONTHS[issue.issue_month - 1]} ${issue.issue_year}` : '';
  const lang = issue.language ? `${issue.language === 'gu' ? 'Gujarati' : 'English'} ` : '';
  const name = issue.title || issue.issue_title || `${lang}Issue ${issue.seq_no}`;
  return when ? `${name} · ${when}` : name;
}

/** Last issue number covered by a subscription. */
export function endSeq(s: Pick<Subscription, 'start_issue_seq' | 'total_issues'>): number {
  return s.start_issue_seq + s.total_issues - 1;
}

export const ROLE_LABEL: Record<AppRole, string> = {
  main_head: 'Main Head (Prakash Head)',
  balika_head: 'Balika Head',
  volunteer: 'Volunteer',
  subscriber: 'Not on the team yet',
};

export const STATUS_LABEL: Record<BookStatus, string> = {
  pending: 'Pending',
  given: 'Given',
  given_to_volunteer: 'Given to Volunteer',
  delivered: 'Delivered',
};

export const STATUS_EMOJI: Record<BookStatus, string> = {
  pending: '⏳',
  given: '✅',
  given_to_volunteer: '🤝',
  delivered: '🎉',
};

export const LANGUAGE_LABEL: Record<Language, string> = { gu: 'Gujarati', en: 'English' };
export const CATEGORY_LABEL: Record<Category, string> = { balak: 'Balak', balika: 'Balika' };
export const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = { cash: 'Cash', upi: 'UPI', cheque: 'Cheque', other: 'Other' };
