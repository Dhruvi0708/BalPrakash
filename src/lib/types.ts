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

export interface Family {
  id: number;
  parent_name: string;
  phone: string;
  alt_phone: string | null;
  email: string | null;
  address: string | null;
  area_id: number | null;
  access_code: string;
  source: RecordSource;
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
}

export interface Member {
  id: number;
  family_id: number;
  full_name: string;
  category: Category;
  dob: string | null;
  source: RecordSource;
}

export interface MemberRow extends Member {
  families: Pick<Family, 'parent_name' | 'phone' | 'access_code'> & { areas: Pick<Area, 'name'> | null };
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
