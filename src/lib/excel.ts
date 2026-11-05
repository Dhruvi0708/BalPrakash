import { fetchAll, fetchBookRows } from './data';
import { supabase } from './supabase';
import { CATEGORY_LABEL, issueLabel, LANGUAGE_LABEL, STATUS_LABEL, type BookRow, type Category, type MemberRow, type TeamMember } from './types';

type Cell = string | number | Date | null;

interface Column {
  header: string;
  key: string;
  width: number;
  kind?: 'text' | 'date' | 'number';
}

interface Sheet {
  name: string;
  columns: Column[];
  rows: Record<string, Cell>[];
}

/** Builds a formatted .xlsx (bold headers, filters, frozen header row) and downloads it. */
export async function downloadWorkbook(filename: string, sheets: Sheet[]): Promise<void> {
  const { default: ExcelJS } = await import('exceljs'); // loaded only when someone downloads
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bal Prakash Delhi';
  wb.created = new Date();

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = sheet.columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width,
      // Mobile numbers and IDs are stored as text so leading zeros are never lost.
      style: c.kind === 'date' ? { numFmt: 'dd-mmm-yyyy hh:mm' } : c.kind === 'number' ? {} : { numFmt: '@' },
    }));
    for (const r of sheet.rows) {
      const row: Record<string, Cell> = {};
      for (const c of sheet.columns) {
        const v = r[c.key] ?? null;
        row[c.key] = c.kind === 'text' || c.kind === undefined ? (v === null ? '' : String(v)) : v;
      }
      ws.addRow(row);
    }
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF7A1A' } };
    header.alignment = { vertical: 'middle' };
    header.height = 22;
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const date = (iso: string | null) => (iso ? new Date(iso) : null);

// ---------------------------------------------------------------------------
// Report definitions
// ---------------------------------------------------------------------------

const BOOK_COLUMNS: Column[] = [
  { header: 'Member ID', key: 'code', width: 12 },
  { header: 'Member Name', key: 'name', width: 24 },
  { header: 'Mobile Number', key: 'phone', width: 14 },
  { header: 'Category', key: 'category', width: 10 },
  { header: 'Mandal', key: 'mandal', width: 18 },
  { header: 'Registration Year', key: 'year', width: 10, kind: 'number' },
  { header: 'Book', key: 'book', width: 26 },
  { header: 'Book Status', key: 'status', width: 18 },
  { header: 'Volunteer Name', key: 'volunteer', width: 20 },
  { header: 'Handover Date', key: 'handed', width: 18, kind: 'date' },
  { header: 'Delivery Date', key: 'delivered', width: 18, kind: 'date' },
  { header: 'Handed Over By', key: 'handedBy', width: 18 },
  { header: 'Delivered By', key: 'deliveredBy', width: 18 },
];

function bookRow(b: BookRow): Record<string, Cell> {
  return {
    code: b.member_code,
    name: b.full_name,
    phone: b.phone,
    category: CATEGORY_LABEL[b.category],
    mandal: b.mandal,
    year: b.registration_year,
    book: issueLabel(b),
    status: STATUS_LABEL[b.status],
    volunteer: b.volunteer_name,
    handed: date(b.handed_on),
    // A book handed straight to the child is delivered at the same moment.
    delivered: date(b.status === 'given' ? b.handed_on : b.delivered_on),
    handedBy: b.handed_by_name,
    deliveredBy: b.status === 'given' ? b.handed_by_name : b.delivered_by_name,
  };
}

const MEMBER_COLUMNS: Column[] = [
  { header: 'Member ID', key: 'code', width: 12 },
  { header: 'Member Name', key: 'name', width: 24 },
  { header: 'Mobile Number', key: 'phone', width: 14 },
  { header: 'Category', key: 'category', width: 10 },
  { header: 'Mandal', key: 'mandal', width: 18 },
  { header: 'Registration Year', key: 'year', width: 10, kind: 'number' },
  { header: 'Language / Plan', key: 'plan', width: 22 },
  { header: 'Latest Book', key: 'book', width: 26 },
  { header: 'Book Status', key: 'status', width: 18 },
  { header: 'Volunteer Name', key: 'volunteer', width: 20 },
  { header: 'Handover Date', key: 'handed', width: 18, kind: 'date' },
  { header: 'Delivery Date', key: 'delivered', width: 18, kind: 'date' },
  { header: 'Books Pending', key: 'pending', width: 9, kind: 'number' },
  { header: 'Books Received', key: 'received', width: 9, kind: 'number' },
  { header: 'Address', key: 'address', width: 28 },
];

async function memberSheet(category: Category, books: BookRow[], years: Map<number, number>): Promise<Sheet> {
  const members = await fetchAll<MemberRow>(() =>
    supabase.from('members').select('*, areas(name), subscriptions(*)').eq('category', category).order('member_code'),
  );
  const byMember = new Map<number, BookRow[]>();
  for (const b of books) byMember.set(b.member_id, [...(byMember.get(b.member_id) ?? []), b]);

  return {
    name: `${CATEGORY_LABEL[category]} Details`,
    columns: MEMBER_COLUMNS,
    rows: members.map((m) => {
      const mine = (byMember.get(m.id) ?? []).sort((a, b) => (a.issue_year ?? 0) - (b.issue_year ?? 0) || (a.issue_month ?? 0) - (b.issue_month ?? 0) || a.seq_no - b.seq_no);
      const latest = mine[mine.length - 1];
      const subs = [...m.subscriptions].sort((a, b) => b.created_at.localeCompare(a.created_at));
      const latestYear = subs.map((s) => (s.cycle_id ? years.get(s.cycle_id) : undefined)).find((y) => y !== undefined) ?? null;
      return {
        code: m.member_code,
        name: m.full_name,
        phone: m.phone,
        category: CATEGORY_LABEL[m.category],
        mandal: m.areas?.name ?? null,
        year: latestYear,
        plan: subs.filter((s) => s.status === 'active').map((s) => `${LANGUAGE_LABEL[s.language]} ${s.plan_years} yr`).join(', ') || 'No active plan',
        book: latest ? issueLabel(latest) : null,
        status: latest ? STATUS_LABEL[latest.status] : null,
        volunteer: latest?.volunteer_name ?? null,
        handed: date(latest?.handed_on ?? null),
        delivered: date(latest ? (latest.status === 'given' ? latest.handed_on : latest.delivered_on) : null),
        pending: mine.filter((b) => b.status === 'pending' || b.status === 'given_to_volunteer').length,
        received: mine.filter((b) => b.status === 'given' || b.status === 'delivered').length,
        address: m.address,
      };
    }),
  };
}

async function cycleYears(): Promise<Map<number, number>> {
  const { data } = await supabase.from('registration_cycles').select('id, year');
  return new Map(((data as { id: number; year: number }[]) ?? []).map((c) => [c.id, c.year]));
}

const stamp = () => new Date().toISOString().slice(0, 10);

export type ReportKind =
  | 'balak-details'
  | 'balika-details'
  | 'volunteer-distribution'
  | 'master'
  | 'balika-distribution'
  | 'my-assigned'
  | 'my-completed';

export const REPORTS: Record<ReportKind, { title: string; file: string; hint: string }> = {
  'balak-details': { title: 'Balak Details', file: 'Balak Details', hint: 'Every Balak with ID, mobile, mandal and latest book status.' },
  'balika-details': { title: 'Balika Details', file: 'Balika Details', hint: 'Every Balika with ID, mobile, mandal and latest book status.' },
  'volunteer-distribution': { title: 'Volunteer Distribution', file: 'Volunteer Distribution', hint: 'Books handed to volunteers: still with them, and delivered.' },
  master: { title: 'Complete Master Report', file: 'Complete Master Report', hint: 'Balaks, Balikas, every book and the volunteer list, one sheet each.' },
  'balika-distribution': { title: 'Balika Distribution Report', file: 'Balika Distribution Report', hint: 'Every Balika book with its status, volunteer and dates.' },
  'my-assigned': { title: 'My Assigned Books', file: 'My Assigned Books', hint: 'Books handed to you that still need delivering.' },
  'my-completed': { title: 'My Completed Distribution', file: 'My Completed Distribution', hint: 'Books you have delivered.' },
};

/** Builds a report from the latest database records. The database limits rows to the user's role. */
export async function downloadReport(kind: ReportKind): Promise<void> {
  const file = `${REPORTS[kind].file} ${stamp()}.xlsx`;

  if (kind === 'balak-details' || kind === 'balika-details') {
    const category: Category = kind === 'balak-details' ? 'balak' : 'balika';
    const [books, years] = await Promise.all([fetchBookRows((q) => q.eq('category', category)), cycleYears()]);
    return downloadWorkbook(file, [await memberSheet(category, books, years)]);
  }

  if (kind === 'balika-distribution') {
    const books = await fetchBookRows((q) => q.eq('category', 'balika'));
    return downloadWorkbook(file, [{ name: 'Balika Distribution', columns: BOOK_COLUMNS, rows: books.map(bookRow) }]);
  }

  if (kind === 'volunteer-distribution') {
    const books = await fetchBookRows((q) => q.in('status', ['given_to_volunteer', 'delivered']));
    books.sort((a, b) => (a.volunteer_name ?? '').localeCompare(b.volunteer_name ?? '') || a.member_code.localeCompare(b.member_code));
    return downloadWorkbook(file, [
      { name: 'With Volunteers', columns: BOOK_COLUMNS, rows: books.filter((b) => b.status === 'given_to_volunteer').map(bookRow) },
      { name: 'Delivered', columns: BOOK_COLUMNS, rows: books.filter((b) => b.status === 'delivered').map(bookRow) },
    ]);
  }

  if (kind === 'my-assigned' || kind === 'my-completed') {
    const status = kind === 'my-assigned' ? 'given_to_volunteer' : 'delivered';
    const books = await fetchBookRows((q) => q.eq('status', status));
    return downloadWorkbook(file, [{ name: REPORTS[kind].title, columns: BOOK_COLUMNS, rows: books.map(bookRow) }]);
  }

  // Complete master report
  const [books, years, teamRes] = await Promise.all([
    fetchBookRows(),
    cycleYears(),
    supabase.from('team_members').select('*, areas(name)').order('full_name'),
  ]);
  const team = (teamRes.data as (TeamMember & { areas: { name: string } | null })[]) ?? [];
  const [balaks, balikas] = await Promise.all([
    memberSheet('balak', books.filter((b) => b.category === 'balak'), years),
    memberSheet('balika', books.filter((b) => b.category === 'balika'), years),
  ]);
  return downloadWorkbook(file, [
    balaks,
    balikas,
    { name: 'All Books', columns: BOOK_COLUMNS, rows: books.map(bookRow) },
    {
      name: 'Team',
      columns: [
        { header: 'Name', key: 'name', width: 24 },
        { header: 'Mobile Number', key: 'phone', width: 14 },
        { header: 'Role', key: 'role', width: 14 },
        { header: 'Side', key: 'side', width: 12 },
        { header: 'Mandal', key: 'mandal', width: 18 },
        { header: 'Login linked', key: 'linked', width: 12 },
        { header: 'Active', key: 'active', width: 8 },
        { header: 'With them now', key: 'holding', width: 12, kind: 'number' },
        { header: 'Delivered', key: 'delivered', width: 10, kind: 'number' },
      ],
      rows: team.map((t) => ({
        name: t.full_name,
        phone: t.phone,
        role: t.role === 'balika_head' ? 'Balika Head' : 'Volunteer',
        side: t.category ? CATEGORY_LABEL[t.category] : 'Both',
        mandal: t.areas?.name ?? null,
        linked: t.user_id ? 'Yes' : 'Not signed up yet',
        active: t.is_active ? 'Yes' : 'No',
        holding: books.filter((b) => b.volunteer_id === t.id && b.status === 'given_to_volunteer').length,
        delivered: books.filter((b) => b.volunteer_id === t.id && b.status === 'delivered').length,
      })),
    },
  ]);
}
