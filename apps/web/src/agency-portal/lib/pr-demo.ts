/** PR Talent demo data — mirrors InnocenZ_Prototype.html */

import {
  AGENCY_PAYROLL_PV_WEEKS_AGO,
  AGENCY_PAYROLL_WEEK_PVS,
} from '@agency-portal/lib/agency-payroll-demo-pvs';
import {
  seedFinanceHeadStamp,
  buildDemoESignatureDataUrl,
  type FinanceHeadPvStamp,
} from '@agency-portal/lib/finance-head-stamp';
import {
  addDaysToIso,
  getLiveTodayIso,
  getPayrollWeekSundayIso,
  getPreviousWeekSundayIso,
  isWeekPvIssuedOnCalendar,
  getShiftToday,
  migrateDemoDateIso,
  migrateDemoYmd,
  remapIsoByWeekSlide,
  ymdToIso,
} from '@agency-portal/lib/demo-clock';
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { getDrinkMenuForOutlet } from '@agency-portal/lib/outlet-drink-menu';

export type PrSubRole = 'pr_tied';

export interface PrProfile {
  name: string;
  first: string;
  ic: string;
  mobile: string;
  email: string;
  bank: string;
  acc: string;
  av: string;
  avg: string;
  tier: string;
  rep: string;
  shifts: string;
  noshow: string;
  langs: string[];
  prog: number;
  next: string;
}

export const PR_PROFILES: Record<PrSubRole, PrProfile> = {
  pr_tied: {
    name: 'Vicky',
    first: 'Victoria Tan Mei Lin',
    ic: '950312-14-8821',
    mobile: '+60 12-881 2201',
    email: 'Vicky@inz.my',
    bank: 'Maybank',
    acc: '5142 8890 1123',
    av: 'V',
    avg: 'linear-gradient(135deg,#C99B4E,#8a5e22)',
    tier: 'TIER V',
    rep: '4.9',
    shifts: '42',
    noshow: '0',
    langs: ['English', 'Mandarin'],
    prog: 72,
    next: '8 more 5★ shifts to unlock Tier V perks & priority VIP requests.',
  },
};

export interface PrShiftOffer {
  outlet: string;
  event: string;
  date: [number, number, number];
  time: string;
  endNext: boolean;
  distance: string;
  addr: string;
  base: number;
  comm: number;
  vip: boolean;
  rating: string;
}

/** Live “today” — shift cards, check-in, payroll week, topbar */
export const SHIFT_TODAY: [number, number, number] = getShiftToday();

export function shiftTodayIso(): string {
  return ymdToIso(SHIFT_TODAY[0], SHIFT_TODAY[1], SHIFT_TODAY[2]);
}

export { getShiftToday };

const _shiftTomorrow = addDay(SHIFT_TODAY[0], SHIFT_TODAY[1], SHIFT_TODAY[2]);

export const PR_SHIFT_OFFERS: PrShiftOffer[] = [
  {
    outlet: 'Velvet 23',
    event: 'Private VIP — Hennessy Launch',
    date: SHIFT_TODAY,
    time: '22:00 — 04:00',
    endNext: true,
    distance: '1.2 km',
    addr: 'Jalan Changkat, KL',
    base: 280,
    comm: 40,
    vip: true,
    rating: '4.8',
  },
  {
    outlet: 'Onyx KL',
    event: 'Regular',
    date: SHIFT_TODAY,
    time: '10:00 PM – 3:00 AM',
    endNext: true,
    distance: '3.4 km',
    addr: 'Jalan P. Ramlee, KL',
    base: 240,
    comm: 40,
    vip: false,
    rating: '4.6',
  },
  {
    outlet: 'Urban Soul',
    event: 'Launch Party',
    date: _shiftTomorrow,
    time: '20:00 — 01:00',
    endNext: true,
    distance: '5.1 km',
    addr: 'Bukit Bintang, KL',
    base: 220,
    comm: 40,
    vip: true,
    rating: '4.9',
  },
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function dayName(y: number, m: number, d: number) {
  return DAY_NAMES[new Date(y, m - 1, d).getDay()];
}

export function fmtDFriendly(y: number, m: number, d: number) {
  return `${dayName(y, m, d)} · ${String(d).padStart(2, '0')} ${MONTH_NAMES[m - 1]} ${y}`;
}

/** Compact date for PR topbar (no year). */
export function fmtDTopbar(y: number, m: number, d: number) {
  return `${dayName(y, m, d)} ${String(d).padStart(2, '0')} ${MONTH_NAMES[m - 1]}`;
}

export function parseYmdIso(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m, d];
}

/** Display label from ISO date — keeps weekday aligned with prototype calendar */
export function fmtDateLabelFromIso(iso: string) {
  const [y, m, d] = parseYmdIso(iso);
  return fmtDFriendly(y, m, d);
}

/** Relative time for agency notifications on PR Shifts */
export function formatTimeAgo(ms: number, now = Date.now()) {
  const sec = Math.max(0, Math.floor((now - ms) / 1000));
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  return `${day} day${day > 1 ? 's' : ''} ago`;
}

export const DEFAULT_PR_AGENCY_NAME = 'Atlas Agency';

export function fmtDShort(y: number, m: number, d: number) {
  return `${dayName(y, m, d)} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

export function fmtDtable(y: number, m: number, d: number) {
  return `${String(d).padStart(2, '0')} ${MONTH_NAMES[m - 1]}`;
}

/** History list — e.g. "Thu 21 May 2026" */
export function fmtHistDate(y: number, m: number, d: number) {
  return `${dayName(y, m, d)} ${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

export function addDay(
  y: number,
  m: number,
  d: number,
): [number, number, number] {
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + 1);
  return [dt.getFullYear(), dt.getMonth() + 1, dt.getDate()];
}

export function getPrProfile(role: PrSubRole | null): PrProfile {
  return PR_PROFILES[role ?? 'pr_tied'];
}

/** PR portal account fields — merges store overrides with agency roster seed data. */
export function resolvePrAccountFields(
  role: PrSubRole | null,
  opts: {
    prDisplayName?: string | null;
    prIcName?: string | null;
    prMobile?: string | null;
    prEmail?: string | null;
    agencyPr?: {
      name?: string;
      icName?: string;
      mobile?: string;
      email?: string;
      ic?: string;
    } | null;
  } = {},
): {
  displayName: string;
  icName: string;
  mobile: string;
  email: string;
  ic: string;
} {
  const base = getPrProfile(role);
  const agency = opts.agencyPr;
  return {
    displayName:
      opts.prDisplayName?.trim() || agency?.name?.trim() || base.name,
    icName: opts.prIcName?.trim() || agency?.icName?.trim() || base.first,
    mobile: opts.prMobile?.trim() || agency?.mobile?.trim() || base.mobile,
    email: opts.prEmail?.trim() || agency?.email?.trim() || base.email,
    ic: agency?.ic?.trim() || base.ic,
  };
}

/** Outlet / roster UI — render a PR's display name. */
export function formatPrDisplayName(
  prId: string,
  name?: string | null,
): string {
  return name?.trim() || prId;
}

/** Roster / swap inbox — tied PR maps to Vicky demo slot (p1) */
export const TIED_DEMO_ROSTER_PR_ID = 'p1';

export function getPrRosterId(_prSubRole: PrSubRole | null): string {
  return TIED_DEMO_ROSTER_PR_ID;
}

/** True when a PV / receipt / shift row belongs to the logged-in PR profile. */
export function prProfileMatchesPayee(
  payee: { prName?: string; prIc?: string; prId?: string },
  profile: PrProfile,
  rosterId?: string | null,
): boolean {
  if (payee.prId && rosterId && payee.prId === rosterId) return true;
  if (payee.prIc && profile.ic && payee.prIc === profile.ic) return true;
  if (!payee.prName) return false;
  const label = payee.prName.trim().toLowerCase();
  const full = profile.name.trim().toLowerCase();
  const first = profile.first.trim().toLowerCase();
  return (
    label === full ||
    label === first ||
    label.startsWith(`${first} `) ||
    full.startsWith(`${label} `)
  );
}

/** PVs belonging to the logged-in PR only. */
export function filterPvsForPrProfile(
  vouchers: PrPaymentVoucher[],
  profile: PrProfile,
  role: PrSubRole | null,
): PrPaymentVoucher[] {
  if (!role) return [];
  const rosterId = getPrRosterId(role);
  return vouchers.filter((p) =>
    prProfileMatchesPayee(
      { prName: p.prName, prIc: p.prIc },
      profile,
      rosterId,
    ),
  );
}

export function filterReceiptScansForPrProfile(
  scans: PrReceiptScan[],
  profile: PrProfile,
  role: PrSubRole | null,
  vouchers?: PrPaymentVoucher[],
): PrReceiptScan[] {
  const rosterId = getPrRosterId(role);
  const myPvIds = new Set((vouchers ?? []).map((p) => p.id));
  return scans.filter((s) => {
    if (s.prId) return s.prId === rosterId;
    return (
      prProfileMatchesPayee(
        { prName: s.prName, prId: s.prId },
        profile,
        rosterId,
      ) || Boolean(s.pvId && myPvIds.has(s.pvId))
    );
  });
}

export type PrPvStatus =
  'PENDING_REVIEW' | 'SENT' | 'SIGNED' | 'PAID' | 'DISPUTED';

export interface PrPvRow {
  i: number;
  date: string;
  day: string;
  outlet: string;
  desc: string;
  qty: number;
  amt: number;
  ref: string;
  /** Receipt scan IDs that roll into this PV line */
  receiptIds?: string[];
}

export interface PrPaymentVoucher {
  id: string;
  prName: string;
  prIc?: string;
  outlet: string;
  cycle: string;
  issued: string;
  due: string;
  rows: PrPvRow[];
  subtotal: number;
  deduct: number;
  net: number;
  status: PrPvStatus;
  /** Agency Finance Head e-sign — always present before PR receives PV */
  financeHeadName: string;
  financeHeadSignedAt: string;
  /** Finance Head stored e-signature (PNG/SVG data URL) */
  financeHeadSignatureDataUrl?: string;
  prSignedAt?: string;
  /** PR manual digital signature (PNG data URL) */
  prSignatureDataUrl?: string;
  paidAt?: string;
  bankRef?: string;
  /** One PV per calendar week (Mon–Sun) — issued on Saturday */
  weekStartIso?: string;
  weekEndIso?: string;
  /** Shift refs already paid — duplicate payment guard */
  paidRefs?: string[];
  /** PR-submitted dispute — shown to agency for verification */
  prDisputeReason?: string;
  disputedAt?: string;
  disputeUpdatedAt?: string;
  /** Agency internal note after reviewing PR dispute */
  disputeNote?: string;
  prDisputePhotoDataUrl?: string;
  prDisputePhotoDataUrls?: string[];
  /** Set when agency does not resolve within 7 days */
  disputeEscalatedAt?: string;
  /** Finance override of signed/paid PV — audit logged */
  overrideAudit?: {
    at: string;
    reason: string;
    by: string;
    previousStatus: string;
  };
  /** One PV per shift session — legacy; weekly PV uses weekStartIso */
  shiftSessionId?: string;
  timeIn?: string;
  timeOut?: string;
  shiftTime?: string;
  /** All receipt scans logged during this shift (before time-out) */
  receiptIds?: string[];
}

/** Active shift: receipts scanned between Time-In and Time-Out roll into one PV */
export interface PrActiveShiftSession {
  id: string;
  pvId: string;
  outlet: string;
  date: [number, number, number];
  shiftTime: string;
  baseWages: number;
  /** Outlet flat shift pay at check-in (RM/shift; legacy field: wagePerHour) */
  wagePerHour?: number;
  /** Scheduled shift length from roster label */
  shiftHours?: number;
  timeIn: string;
  timeOut?: string;
  receiptIds: string[];
  /** Minutes past shift end — drives OT line on PV */
  overtimeMinutes?: number;
}

export function makeShiftSessionId(
  date: [number, number, number],
  outlet: string,
) {
  const slug = outlet
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toLowerCase()
    .slice(0, 12);
  const [y, m, d] = date;
  return `shift-${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}-${slug}`;
}

export function makeShiftPvId(date: [number, number, number], outlet: string) {
  const slug = outlet
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 6)
    .toUpperCase();
  const [y, m, d] = date;
  return `PV-SHIFT-${y}-${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}-${slug || 'OUT'}`;
}

export function buildPaymentVoucherFromShift(
  session: PrActiveShiftSession,
  receipts: PrReceiptScan[],
  profile: PrProfile,
  financeHead?: FinanceHeadPvStamp,
): PrPaymentVoucher {
  const [y, m, d] = session.date;
  const day = dayName(y, m, d);
  const dateLabel = fmtDtable(y, m, d);
  const drinkIds: string[] = [];
  const tipIds: string[] = [];
  let drinkAmt = 0;
  let tipAmt = 0;
  for (const r of receipts) {
    if (r.drinkCommission > 0) {
      drinkAmt += r.drinkCommission;
      drinkIds.push(r.id);
    }
    if (r.tipCommission > 0) {
      tipAmt += r.tipCommission;
      tipIds.push(r.id);
    }
  }
  const rows: PrPvRow[] = [
    {
      i: 1,
      date: dateLabel,
      day,
      outlet: session.outlet,
      desc: 'Daily Wages',
      qty: 1,
      amt: session.baseWages,
      ref: 'Sealed',
      receiptIds: [],
    },
  ];
  let idx = 2;
  if (drinkAmt > 0) {
    rows.push({
      i: idx++,
      date: dateLabel,
      day,
      outlet: session.outlet,
      desc: 'Commission – Drinks',
      qty: drinkIds.length,
      amt: drinkAmt,
      ref: 'Receipt scans',
      receiptIds: drinkIds,
    });
  }
  if (tipAmt > 0) {
    rows.push({
      i: idx++,
      date: dateLabel,
      day,
      outlet: session.outlet,
      desc: 'Commission – Tips',
      qty: tipIds.length,
      amt: tipAmt,
      ref: 'Receipt scans',
      receiptIds: tipIds,
    });
  }
  const otMin = session.overtimeMinutes ?? 0;
  if (otMin > 0) {
    const otAmt = Math.round((otMin / 60) * 90 * 100) / 100;
    rows.push({
      i: idx++,
      date: dateLabel,
      day,
      outlet: session.outlet,
      desc: 'Overtime (OT)',
      qty: otMin,
      amt: otAmt,
      ref: 'MAX(0, check-out − shift end)',
    });
  }
  const subtotal = rows.reduce((s, r) => s + r.amt, 0);
  const issued = session.timeOut ?? session.timeIn;
  const fh = financeHead ?? seedFinanceHeadStamp(issued);
  return {
    id: session.pvId,
    prName: profile.name,
    prIc: profile.ic,
    outlet: session.outlet,
    cycle: `${dateLabel} shift`,
    issued,
    due: issued,
    rows,
    subtotal,
    deduct: 0,
    net: subtotal,
    status: 'PENDING_REVIEW',
    ...fh,
    shiftSessionId: session.id,
    timeIn: session.timeIn,
    timeOut: session.timeOut,
    shiftTime: session.shiftTime,
    receiptIds: receipts.map((r) => r.id),
    paidRefs: [`${dateLabel}-${session.outlet}-Sealed`],
  };
}

export function pvNeedsPrReview(status: PrPvStatus) {
  return status === 'PENDING_REVIEW' || status === 'SENT';
}

/** Timestamp shown on PV sign / dispute actions */
export function formatPvSignTimestamp(date = new Date()): string {
  return date.toLocaleString('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function pvStatusLabel(status: PrPvStatus) {
  if (status === 'PENDING_REVIEW') return 'PENDING REVIEW';
  return status;
}

/** Parse `issued` / `due` strings like "10 May 2026" to epoch ms */
export function parsePvIssuedMs(issued: string): number {
  const m = issued.trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return 0;
  const day = parseInt(m[1], 10);
  const mon = m[2].slice(0, 3).toLowerCase();
  const monthIdx = MONTH_NAMES.findIndex((name) =>
    name.toLowerCase().startsWith(mon),
  );
  if (monthIdx < 0) return 0;
  return new Date(parseInt(m[3], 10), monthIdx, day).getTime();
}

/** Pay-by Wednesday — 14 days after issue, aligned to that week's Wednesday. */
export function pvPayByDeadlineIsoFromIssueIso(issueDayIso: string): string {
  const [y, m, d] = issueDayIso.split('-').map(Number);
  const anchor = new Date(y, m - 1, d);
  anchor.setDate(anchor.getDate() + 14);
  const daysUntilWed = (3 - anchor.getDay() + 7) % 7;
  anchor.setDate(anchor.getDate() + daysUntilWed);
  return ymdToIso(
    anchor.getFullYear(),
    anchor.getMonth() + 1,
    anchor.getDate(),
  );
}

export function pvPayByDeadlineIsoFromIssued(issued: string): string | null {
  const issuedMs = parsePvIssuedMs(issued);
  if (!issuedMs) return null;
  const d = new Date(issuedMs);
  return pvPayByDeadlineIsoFromIssueIso(
    ymdToIso(d.getFullYear(), d.getMonth() + 1, d.getDate()),
  );
}

export function pvPayByDeadlineMsFromIssued(issued: string): number {
  const iso = pvPayByDeadlineIsoFromIssued(issued);
  if (!iso) return 0;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

export function formatPvPayByDeadline(issued: string): string | null {
  const iso = pvPayByDeadlineIsoFromIssued(issued);
  if (!iso) return null;
  return fmtDateLabelFromIso(iso);
}

export function formatPvPayByDeadlineShort(issued: string): string | null {
  const iso = pvPayByDeadlineIsoFromIssued(issued);
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return fmtDTopbar(y, m, d);
}

export function resolvePvPayByDue(
  pv: Pick<PrPaymentVoucher, 'issued' | 'due'>,
): string {
  return formatPvPayByDeadline(pv.issued) ?? pv.due;
}

export function getLatestPvIssuedMs(pvs: PrPaymentVoucher[]): number {
  if (pvs.length === 0) return 0;
  return Math.max(...pvs.map((p) => parsePvIssuedMs(p.issued)));
}

function isWithdrawalRow(row: PrPvRow): boolean {
  const d = row.desc.toLowerCase();
  return d.includes('withdrawal') || d.includes('advance');
}

/** Gross earnings from PV line items (excludes withdrawal/advance rows). */
export function getPvRowSubtotal(pv: PrPaymentVoucher): number {
  return pv.rows
    .filter((r) => !isWithdrawalRow(r))
    .reduce((s, r) => s + r.amt, 0);
}

/** Net payable — always derived from line items minus header deductions. */
export function getPvNetTotal(pv: PrPaymentVoucher): number {
  return Math.max(0, getPvRowSubtotal(pv) - pv.deduct);
}

/** Align stored subtotal/net with line items (single source of truth). */
export function reconcilePvTotals(pv: PrPaymentVoucher): PrPaymentVoucher {
  const subtotal = getPvRowSubtotal(pv);
  return {
    ...pv,
    subtotal,
    net: Math.max(0, subtotal - pv.deduct),
  };
}

/** Gross sales on PV (subtotal before deductions) */
export function getPvSalesTotal(pv: PrPaymentVoucher): number {
  return getPvRowSubtotal(pv);
}

export type PvDateRecencyFilter = 'all' | 'latest' | 'previous';

export function filterPvsByIssuedRecency(
  pvs: PrPaymentVoucher[],
  filter: PvDateRecencyFilter,
  boundaryMs = getLatestPvIssuedMs(pvs),
): PrPaymentVoucher[] {
  if (filter === 'all') return pvs;
  if (filter === 'latest')
    return pvs.filter((p) => parsePvIssuedMs(p.issued) >= boundaryMs);
  return pvs.filter((p) => parsePvIssuedMs(p.issued) < boundaryMs);
}

export type PvSalesSort = 'default' | 'asc' | 'desc';

export function sortPvsBySales(
  pvs: PrPaymentVoucher[],
  sort: PvSalesSort,
): PrPaymentVoucher[] {
  const list = [...pvs];
  list.sort((a, b) => {
    if (sort === 'asc') return getPvSalesTotal(a) - getPvSalesTotal(b);
    if (sort === 'desc') return getPvSalesTotal(b) - getPvSalesTotal(a);
    return parsePvIssuedMs(b.issued) - parsePvIssuedMs(a.issued);
  });
  return list;
}

export function pvStatusPillVariant(
  status: PrPvStatus,
): 'green' | 'amber' | 'red' | 'ink' {
  if (status === 'PAID' || status === 'SIGNED') return 'green';
  if (status === 'DISPUTED') return 'red';
  if (status === 'PENDING_REVIEW') return 'amber';
  return 'amber';
}

/** Quick picks — PR can choose then edit before submitting dispute */
export const PV_DISPUTE_PRESETS = [
  {
    label: 'Unmatch commission',
    reason: "Commission doesn't match my receipt scans",
  },
  {
    label: 'Missing record',
    reason: 'Missing record from scanned receipts',
  },
  {
    label: 'Unmatch wages',
    reason: "Wages don't match my sealed shift",
  },
  {
    label: 'Repeated record',
    reason: 'Repeated record — already paid in a previous PV',
  },
  {
    label: 'Others',
    reason: '',
  },
] as const;

export function pvDisputePhotos(
  pv: Pick<
    PrPaymentVoucher,
    'prDisputePhotoDataUrl' | 'prDisputePhotoDataUrls'
  >,
) {
  if (pv.prDisputePhotoDataUrls?.length) return pv.prDisputePhotoDataUrls;
  return pv.prDisputePhotoDataUrl ? [pv.prDisputePhotoDataUrl] : [];
}

export const FINANCE_HEAD_LABEL = 'Finance Head · Atlas Agency';

export function seedPrSignature(prName: string) {
  return { prSignatureDataUrl: buildDemoESignatureDataUrl(prName) };
}

export function getPayrollCycleLabel(): {
  label: string;
  range: string;
  nextTransfer: string;
} {
  const [y, m, d] = getShiftToday();
  const date = new Date(y, m - 1, d);
  const dow = date.getDay();
  const diffToSun = -dow;
  const start = new Date(date);
  start.setDate(date.getDate() + diffToSun);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const startLabel = fmtDtable(
    start.getFullYear(),
    start.getMonth() + 1,
    start.getDate(),
  );
  const endLabel = fmtDtable(
    end.getFullYear(),
    end.getMonth() + 1,
    end.getDate(),
  );
  return {
    label: 'Current payroll week',
    range: `${startLabel} – ${endLabel} ${end.getFullYear()}`,
    nextTransfer: 'Manual bank transfer per signed PV',
  };
}

/** @deprecated use getPayrollCycleLabel() */
export const PAYROLL_CYCLE = getPayrollCycleLabel();

export const SEED_PR_PVS: PrPaymentVoucher[] = [
  {
    id: 'PV-2026-0512',
    prName: 'Alice',
    prIc: '990801-08-5564',
    outlet: 'Multi-Outlet (3)',
    cycle: '4 May \u2013 10 May 2026',
    issued: '10 May 2026',
    due: '17 May 2026',
    rows: [
      {
        i: 1,
        date: '4 May',
        day: 'Mon',
        outlet: 'Mermate',
        desc: 'Daily Wages',
        qty: 1,
        amt: 350,
        ref: 'Sealed',
      },
      {
        i: 2,
        date: '5 May',
        day: 'Tue',
        outlet: 'Mermate',
        desc: 'Daily Wages',
        qty: 1,
        amt: 350,
        ref: 'Sealed',
      },
      {
        i: 3,
        date: '6 May',
        day: 'Wed',
        outlet: 'Bear Lounge',
        desc: 'Daily Wages',
        qty: 1,
        amt: 350,
        ref: 'Sealed',
      },
      {
        i: 4,
        date: '7 May',
        day: 'Thu',
        outlet: 'Urban Soul',
        desc: 'Daily Wages',
        qty: 1,
        amt: 350,
        ref: 'Sealed',
      },
      {
        i: 5,
        date: '11 May',
        day: 'Mon',
        outlet: 'Mermate',
        desc: 'Daily Wages',
        qty: 1,
        amt: 380,
        ref: 'Sealed',
      },
    ],
    subtotal: 1780,
    deduct: 200,
    net: 1580,
    status: 'PENDING_REVIEW',
    ...seedFinanceHeadStamp('10 May 2026 · 09:14'),
  },
  {
    id: 'PV-2026-0498',
    prName: 'Bernice',
    prIc: '990415-08-1120',
    outlet: 'Mermate',
    paidRefs: ['27 Apr-Mermate-Sealed', '27 Apr-Mermate-Tap log'],
    cycle: '27 Apr \u2013 3 May 2026',
    issued: '3 May 2026',
    due: '10 May 2026',
    rows: [
      {
        i: 1,
        date: '27 Apr',
        day: 'Sun',
        outlet: 'Mermate',
        desc: 'Daily Wages',
        qty: 1,
        amt: 350,
        ref: 'Sealed',
      },
      {
        i: 2,
        date: '27 Apr',
        day: 'Sun',
        outlet: 'Mermate',
        desc: 'Commission – Drinks',
        qty: 1,
        amt: 170,
        ref: 'Tap log',
        receiptIds: ['rc-seed-1', 'rc-seed-2'],
      },
      {
        i: 3,
        date: '27 Apr',
        day: 'Sun',
        outlet: 'Mermate',
        desc: 'Commission – Tips',
        qty: 1,
        amt: 80,
        ref: 'Tap log',
        receiptIds: ['rc-seed-3'],
      },
    ],
    subtotal: 600,
    deduct: 0,
    net: 600,
    status: 'PAID',
    ...seedFinanceHeadStamp('3 May 2026 · 08:42'),
    prSignedAt: '5 May 2026 · 14:22',
    ...seedPrSignature('Bernice'),
    paidAt: '5 May 2026 · 14:22',
    bankRef: 'INZ-TRF-202605051422',
    shiftSessionId: 'shift-2026-04-27-mermate',
    timeIn: '27 Apr 2026 · 21:04',
    timeOut: '28 Apr 2026 · 02:11',
    shiftTime: '9:00 PM – 2:00 AM',
    receiptIds: ['rc-seed-1', 'rc-seed-2', 'rc-seed-3'],
  },
  {
    id: 'PV-2026-0535-J',
    prName: 'Grace',
    prIc: '990427-14-7685',
    outlet: 'Urban Soul',
    cycle: '11 May \u2013 17 May 2026',
    issued: '17 May 2026',
    due: '24 May 2026',
    rows: [
      {
        i: 1,
        date: '14 May',
        day: 'Wed',
        outlet: 'Urban Soul',
        desc: 'Daily Wages',
        qty: 1,
        amt: 350,
        ref: 'Sealed',
      },
      {
        i: 2,
        date: '15 May',
        day: 'Thu',
        outlet: 'Urban Soul',
        desc: 'Commission – Drinks',
        qty: 1,
        amt: 95,
        ref: 'Tap log',
      },
    ],
    subtotal: 445,
    deduct: 0,
    net: 445,
    status: 'PENDING_REVIEW',
    ...seedFinanceHeadStamp('17 May 2026 · 09:02'),
  },
  {
    id: 'PV-2026-0548-J',
    prName: 'Angie',
    prIc: '990926-14-7786',
    outlet: 'Velvet 23',
    cycle: '18 May \u2013 24 May 2026',
    issued: '24 May 2026',
    due: '10 Jun 2026',
    rows: [
      {
        i: 1,
        date: '20 May',
        day: 'Wed',
        outlet: 'Mermate',
        desc: 'Daily Wages',
        qty: 1,
        amt: 350,
        ref: 'Sealed',
      },
      {
        i: 2,
        date: '21 May',
        day: 'Thu',
        outlet: 'Mermate',
        desc: 'Commission – Drinks',
        qty: 1,
        amt: 140,
        ref: 'Tap log',
      },
      {
        i: 3,
        date: '22 May',
        day: 'Fri',
        outlet: 'Mermate',
        desc: 'Commission – Tips',
        qty: 1,
        amt: 60,
        ref: 'Tap log',
      },
    ],
    subtotal: 550,
    deduct: 50,
    net: 500,
    status: 'SIGNED',
    ...seedFinanceHeadStamp('24 May 2026 · 08:55'),
    prSignedAt: '26 May 2026 · 11:05',
    ...seedPrSignature('Angie'),
  },
  {
    id: 'PV-2026-0472-J',
    prName: 'Angie',
    prIc: '990926-14-7786',
    outlet: 'Velvet 23',
    paidRefs: ['19 Apr-Velvet 23-Sealed'],
    cycle: '13 Apr \u2013 19 Apr 2026',
    issued: '19 Apr 2026',
    due: '26 Apr 2026',
    rows: [
      {
        i: 1,
        date: '18 Apr',
        day: 'Sat',
        outlet: 'Velvet 23',
        desc: 'Daily Wages',
        qty: 1,
        amt: 360,
        ref: 'Sealed',
      },
      {
        i: 2,
        date: '18 Apr',
        day: 'Sat',
        outlet: 'Velvet 23',
        desc: 'Commission – Drinks',
        qty: 1,
        amt: 210,
        ref: 'Tap log',
      },
    ],
    subtotal: 570,
    deduct: 0,
    net: 570,
    status: 'PAID',
    ...seedFinanceHeadStamp('19 Apr 2026 · 09:30'),
    prSignedAt: '21 Apr 2026 · 15:40',
    ...seedPrSignature('Angie'),
    paidAt: '21 Apr 2026 · 15:40',
    bankRef: 'INZ-TRF-202604211540',
  },
  {
    id: 'PV-2026-W20-L',
    prName: 'Vicky',
    prIc: '950312-14-8821',
    outlet: 'Multi-outlet (2)',
    weekStartIso: '2026-05-12',
    weekEndIso: '2026-05-18',
    cycle: '12 May – 18 May 2026',
    issued: '17 May 2026',
    due: '24 May 2026',
    rows: [
      {
        i: 1,
        date: '13 May',
        day: 'Wed',
        outlet: 'Velvet 23',
        desc: 'Daily Wages',
        qty: 1,
        amt: 300,
        ref: 'Sealed',
      },
      {
        i: 2,
        date: '13 May',
        day: 'Wed',
        outlet: 'Velvet 23',
        desc: 'Commission – Drinks',
        qty: 1,
        amt: 112,
        ref: 'Verified',
      },
      {
        i: 3,
        date: '15 May',
        day: 'Fri',
        outlet: 'Mermate',
        desc: 'Daily Wages',
        qty: 1,
        amt: 290,
        ref: 'Sealed',
      },
      {
        i: 4,
        date: '15 May',
        day: 'Fri',
        outlet: 'Mermate',
        desc: 'Commission – Tips',
        qty: 1,
        amt: 78,
        ref: 'Verified',
      },
      {
        i: 5,
        date: '17 May',
        day: 'Sun',
        outlet: 'Velvet 23',
        desc: 'Daily Wages',
        qty: 1,
        amt: 300,
        ref: 'Sealed',
      },
      {
        i: 6,
        date: '17 May',
        day: 'Sun',
        outlet: 'Velvet 23',
        desc: 'Commission – Tables',
        qty: 2,
        amt: 120,
        ref: 'Verified',
      },
      {
        i: 7,
        date: '17 May',
        day: 'Sun',
        outlet: '—',
        desc: 'Early withdrawal',
        qty: 1,
        amt: 150,
        ref: 'Advance · T+1',
      },
    ],
    subtotal: 1200,
    deduct: 150,
    net: 1050,
    status: 'PAID',
    ...seedFinanceHeadStamp('17 May 2026 · 09:02'),
    prSignedAt: '18 May 2026 · 16:20',
    ...seedPrSignature('Vicky'),
    paidAt: '19 May 2026 · 11:42',
    bankRef: 'INZ-TRF-202605191142',
  },
  {
    id: 'PV-2026-W19-L',
    prName: 'Vicky',
    prIc: '950312-14-8821',
    outlet: 'Velvet 23',
    weekStartIso: '2026-05-05',
    weekEndIso: '2026-05-11',
    cycle: '5 May – 11 May 2026',
    issued: '10 May 2026',
    due: '17 May 2026',
    rows: [
      {
        i: 1,
        date: '6 May',
        day: 'Wed',
        outlet: 'Velvet 23',
        desc: 'Daily Wages',
        qty: 1,
        amt: 300,
        ref: 'Sealed',
      },
      {
        i: 2,
        date: '6 May',
        day: 'Wed',
        outlet: 'Velvet 23',
        desc: 'Commission – Drinks',
        qty: 1,
        amt: 95,
        ref: 'Verified',
      },
      {
        i: 3,
        date: '8 May',
        day: 'Fri',
        outlet: 'Velvet 23',
        desc: 'Daily Wages',
        qty: 1,
        amt: 300,
        ref: 'Sealed',
      },
      {
        i: 4,
        date: '8 May',
        day: 'Fri',
        outlet: 'Velvet 23',
        desc: 'Commission – Tips',
        qty: 1,
        amt: 88,
        ref: 'Verified',
      },
      {
        i: 5,
        date: '10 May',
        day: 'Sun',
        outlet: 'Velvet 23',
        desc: 'Daily Wages',
        qty: 1,
        amt: 300,
        ref: 'Sealed',
      },
      {
        i: 6,
        date: '10 May',
        day: 'Sun',
        outlet: 'Velvet 23',
        desc: 'Commission – Tables',
        qty: 1,
        amt: 65,
        ref: 'Verified',
      },
    ],
    subtotal: 1148,
    deduct: 0,
    net: 1148,
    status: 'SIGNED',
    ...seedFinanceHeadStamp('10 May 2026 · 09:14'),
    prSignedAt: '12 May 2026 · 20:05',
    ...seedPrSignature('Vicky'),
  },
  ...AGENCY_PAYROLL_WEEK_PVS,
];

function pvRowDateIso(row: PrPvRow, year: number): string | null {
  const m = row.date.trim().match(/^(\d{1,2})\s+([A-Za-z]+)/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const mon = m[2].slice(0, 3).toLowerCase();
  const months = [
    'jan',
    'feb',
    'mar',
    'apr',
    'may',
    'jun',
    'jul',
    'aug',
    'sep',
    'oct',
    'nov',
    'dec',
  ];
  const mi = months.findIndex((x) => x === mon);
  if (mi < 0) return null;
  return ymdToIso(year, mi + 1, day);
}

function parseIsoYear(iso: string) {
  return parseInt(iso.slice(0, 4), 10);
}

const DAY_NAMES_SHORT = [
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
] as const;

/**
 * Completed payroll weeks ago relative to the latest issued PV Sunday.
 * 0 = just issued (PR review) · 1 = signed, awaiting agency payout · 2+ = paid (History).
 */
export const DEMO_PV_ISSUED_WEEKS_AGO: Record<string, number> = {
  'PV-2026-0498': 5,
  'PV-2026-0472-J': 4,
  'PV-2026-W20-L': 4,
  'PV-2026-W19-L': 3,
  'PV-2026-0535-J': 2,
  'PV-2026-0512': 3,
  'PV-2026-0548-J': 2,
  ...AGENCY_PAYROLL_PV_WEEKS_AGO,
};

/** Seeded payroll-week PV — row amounts are canonical (agency + PR must match). */
export function isDemoTimelinePayrollPv(
  pv: Pick<PrPaymentVoucher, 'id'>,
): boolean {
  return pv.id in DEMO_PV_ISSUED_WEEKS_AGO;
}

/** Most recent weekly PV issue Sunday on or before live today. */
export function latestDemoPvIssueSundayIso(
  fromIso = getLiveTodayIso(),
): string {
  const currentWeekSun = getPayrollWeekSundayIso(fromIso);
  const currentWeekEnd = addDaysToIso(currentWeekSun, 6);
  if (isWeekPvIssuedOnCalendar(currentWeekEnd, fromIso)) {
    return addDaysToIso(currentWeekEnd, 1);
  }
  const prevWeekEnd = addDaysToIso(currentWeekSun, -1);
  return addDaysToIso(prevWeekEnd, 1);
}

/** Weekly PVs are only sent after the payroll week ends (Sunday after Sat week-end). */
export function isDemoWeeklyPvIssued(
  pv: Pick<PrPaymentVoucher, 'weekEndIso'>,
  fromIso = getLiveTodayIso(),
): boolean {
  if (!pv.weekEndIso) return true;
  return isWeekPvIssuedOnCalendar(pv.weekEndIso, fromIso);
}

export function demoPvIssueIsoForWeeksAgo(
  weeksAgo: number,
  fromIso = getLiveTodayIso(),
): string {
  return addDaysToIso(latestDemoPvIssueSundayIso(fromIso), -7 * weeksAgo);
}

/** Sun–Sat payroll week bounds for a completed week N Sundays before the latest issue. */
export function demoPayrollWeekBoundsForWeeksAgo(
  weeksAgo: number,
  fromIso = getLiveTodayIso(),
) {
  const issueIso = demoPvIssueIsoForWeeksAgo(weeksAgo, fromIso);
  const weekEndIso = addDaysToIso(issueIso, -1);
  const weekStartIso = addDaysToIso(weekEndIso, -6);
  const year = parseIsoYear(weekStartIso);
  const [sy, sm, sd] = weekStartIso.split('-').map(Number);
  const [ey, em, ed] = weekEndIso.split('-').map(Number);
  return {
    weekStartIso,
    weekEndIso,
    cycle: `${fmtDtable(sy, sm, sd)} – ${fmtDtable(ey, em, ed)} ${year}`,
  };
}

function issuedLabelFromIso(issueIso: string): string {
  return format(parseISO(issueIso), 'd MMM yyyy');
}

function dueLabelFromIssueIso(issueIso: string): string {
  const dueIso = pvPayByDeadlineIsoFromIssueIso(issueIso);
  const [y, m, d] = dueIso.split('-').map(Number);
  return `${fmtDtable(y, m, d)} ${y}`;
}

function demoPvSignStamp(
  issueIso: string,
  daysAfter: number,
  time = '11:05',
): string {
  const iso = addDaysToIso(issueIso, daysAfter);
  return `${issuedLabelFromIso(iso)} · ${time}`;
}

function payrollWeekBoundsFromIssueIso(issueIso: string) {
  const weekEndIso = addDaysToIso(issueIso, -1);
  const weekStartIso = addDaysToIso(weekEndIso, -6);
  const year = parseIsoYear(weekStartIso);
  const [sy, sm, sd] = weekStartIso.split('-').map(Number);
  const [ey, em, ed] = weekEndIso.split('-').map(Number);
  return {
    weekStartIso,
    weekEndIso,
    cycle: `${fmtDtable(sy, sm, sd)} – ${fmtDtable(ey, em, ed)} ${year}`,
  };
}

function parseCycleStartIso(cycle: string | undefined): string | null {
  if (!cycle) return null;
  const m = cycle.match(/^(\d{1,2}\s+[A-Za-z]+)\s*[–-]/);
  if (!m) return null;
  const year = cycle.match(/(\d{4})\s*$/)?.[1] ?? getLiveTodayIso().slice(0, 4);
  return pvRowDateIso(
    {
      i: 0,
      date: m[1],
      day: '',
      outlet: '',
      desc: '',
      qty: 0,
      amt: 0,
      ref: '',
    },
    parseInt(year, 10),
  );
}

function sourceWeekStartForRemap(
  pv: PrPaymentVoucher,
  seed?: PrPaymentVoucher,
): string | null {
  const anchor = seed ?? pv;
  if (anchor.weekStartIso) return anchor.weekStartIso;
  const fromCycle = parseCycleStartIso(anchor.cycle);
  if (fromCycle) return fromCycle;
  const issuedMs = parsePvIssuedMs(anchor.issued);
  if (!issuedMs) return null;
  const oldDate = new Date(issuedMs);
  const issueIso = ymdToIso(
    oldDate.getFullYear(),
    oldDate.getMonth() + 1,
    oldDate.getDate(),
  );
  return addDaysToIso(addDaysToIso(issueIso, -1), -6);
}

function shiftPvRowsToWeek(
  pv: PrPaymentVoucher,
  targetWeekStartIso: string,
  fromAnchor?: string,
): PrPvRow[] {
  const anchor = fromAnchor ?? pv.weekStartIso;
  if (!anchor) return pv.rows;
  const anchorYear = parseIsoYear(anchor);
  return pv.rows.map((row) => {
    const iso = pvRowDateIso(row, anchorYear);
    if (!iso) return row;
    const dayOffset = differenceInCalendarDays(parseISO(iso), parseISO(anchor));
    const newIso = addDaysToIso(targetWeekStartIso, dayOffset);
    const [y, m, d] = newIso.split('-').map(Number);
    const dayDate = new Date(y, m - 1, d);
    return {
      ...row,
      date: fmtDtable(y, m, d),
      day: DAY_NAMES_SHORT[dayDate.getDay()],
    };
  });
}

/** Map agency payroll seed rows onto Sun–Sat slots (matches agency-payroll-demo-pvs). */
const AGENCY_PAYROLL_SHIFT_SLOTS = [0, 1, 2, 3, 5, 6] as const;

function remapAgencyPayrollRowsToTargetWeek(
  rows: PrPvRow[],
  targetWeekStartIso: string,
): PrPvRow[] {
  const dateOrder: string[] = [];
  for (const row of rows) {
    if (!dateOrder.includes(row.date)) dateOrder.push(row.date);
  }
  const out: PrPvRow[] = [];
  for (let slot = 0; slot < dateOrder.length; slot++) {
    const offset = AGENCY_PAYROLL_SHIFT_SLOTS[slot] ?? slot;
    const iso = addDaysToIso(targetWeekStartIso, offset);
    const [y, m, d] = iso.split('-').map(Number);
    const dayDate = new Date(y, m - 1, d);
    const dateLabel = fmtDtable(y, m, d);
    const dayLabel = DAY_NAMES_SHORT[dayDate.getDay()]!;
    for (const row of rows.filter((r) => r.date === dateOrder[slot])) {
      out.push({ ...row, date: dateLabel, day: dayLabel });
    }
  }
  return out;
}

function alignDemoPaymentVoucherTimeline(
  pv: PrPaymentVoucher,
  weeksAgo: number,
  fromIso = getLiveTodayIso(),
  seed?: PrPaymentVoucher,
): PrPaymentVoucher {
  const issueIso = demoPvIssueIsoForWeeksAgo(weeksAgo, fromIso);
  const issued = issuedLabelFromIso(issueIso);
  const due = dueLabelFromIssueIso(issueIso);
  const financeStamp = seedFinanceHeadStamp(`${issued} · 09:00`);
  const week = payrollWeekBoundsFromIssueIso(issueIso);
  const rowSource = seed ? { ...pv, rows: seed.rows } : pv;
  const sourceWeekStart = sourceWeekStartForRemap(rowSource, seed);
  const rows =
    seed && isDemoTimelinePayrollPv(pv)
      ? remapAgencyPayrollRowsToTargetWeek(seed.rows, week.weekStartIso)
      : sourceWeekStart
        ? shiftPvRowsToWeek(rowSource, week.weekStartIso, sourceWeekStart)
        : rowSource.rows;

  let next: PrPaymentVoucher = {
    ...pv,
    issued,
    due,
    ...financeStamp,
    weekStartIso: week.weekStartIso,
    weekEndIso: week.weekEndIso,
    cycle: week.cycle,
    rows,
  };

  if (weeksAgo >= 2) {
    const signedStamp = demoPvSignStamp(issueIso, 2, '14:22');
    const paidStamp = demoPvSignStamp(issueIso, 3, '11:42');
    const paidIso = addDaysToIso(issueIso, 3).replace(/-/g, '');
    return {
      ...next,
      status: 'PAID',
      prSignedAt: signedStamp,
      prSignatureDataUrl:
        next.prSignatureDataUrl ?? buildDemoESignatureDataUrl(next.prName),
      paidAt: paidStamp,
      bankRef: next.bankRef ?? `INZ-TRF-${paidIso}001`,
      prDisputeReason: undefined,
      disputedAt: undefined,
      disputeNote: undefined,
      disputeUpdatedAt: undefined,
    };
  }

  if (weeksAgo === 1) {
    return {
      ...next,
      status: 'SIGNED',
      prSignedAt: demoPvSignStamp(issueIso, 2, '11:05'),
      prSignatureDataUrl:
        next.prSignatureDataUrl ?? buildDemoESignatureDataUrl(next.prName),
      paidAt: undefined,
      bankRef: undefined,
      prDisputeReason: undefined,
      disputedAt: undefined,
      disputeNote: undefined,
      disputeUpdatedAt: undefined,
    };
  }

  const w0Status = seed?.status ?? 'SENT';
  const w0Base: PrPaymentVoucher = {
    ...next,
    status: w0Status,
    prSignedAt: undefined,
    prSignatureDataUrl: undefined,
    paidAt: undefined,
    bankRef: undefined,
    disputeNote: undefined,
    disputeUpdatedAt: undefined,
  };

  if (w0Status === 'DISPUTED') {
    return {
      ...w0Base,
      prDisputeReason: seed?.prDisputeReason ?? next.prDisputeReason,
      disputedAt: seed?.disputedAt ?? demoPvSignStamp(issueIso, 1, '14:08'),
    };
  }

  return {
    ...w0Base,
    prDisputeReason: undefined,
    disputedAt: undefined,
  };
}

export function remapSeedPaymentVoucher(
  pv: PrPaymentVoucher,
): PrPaymentVoucher {
  const weeksAgo = DEMO_PV_ISSUED_WEEKS_AGO[pv.id];
  if (weeksAgo == null) return pv;
  const seed = SEED_PR_PVS.find((s) => s.id === pv.id);
  return alignDemoPaymentVoucherTimeline(pv, weeksAgo, getLiveTodayIso(), seed);
}

export function remapSeedPaymentVouchers(
  pvs: PrPaymentVoucher[],
): PrPaymentVoucher[] {
  return pvs
    .map((pv) => reconcilePvTotals(remapSeedPaymentVoucher(pv)))
    .filter((pv) => isDemoWeeklyPvIssued(pv));
}

/** Persisted scans that kept pre-comcard legacy identity. */
export function isLegacyReceiptScanIdentity(
  scan: Pick<PrReceiptScan, 'prId' | 'prName'>,
): boolean {
  return (
    scan.prName === 'Jaya Nair' ||
    scan.prName === 'Jaya' ||
    scan.prName === 'Luna'
  );
}

export function mergePersistedReceiptScanWithSeed(
  seed: PrReceiptScan,
  saved?: PrReceiptScan,
): PrReceiptScan {
  if (!saved) return remapSeedReceiptScan(seed);
  const identityFromSeed = isLegacyReceiptScanIdentity(saved);
  return remapSeedReceiptScan({
    ...seed,
    ...saved,
    receiptRef: saved.receiptRef ?? seed.receiptRef,
    prId: identityFromSeed ? seed.prId : (saved.prId ?? seed.prId),
    prName: identityFromSeed ? seed.prName : (saved.prName ?? seed.prName),
    prCode: identityFromSeed ? seed.prCode : (saved.prCode ?? seed.prCode),
  });
}

export function remapSeedReceiptScan(scan: PrReceiptScan): PrReceiptScan {
  if (!scan.date) return scan;
  const iso = ymdToIso(scan.date[0], scan.date[1], scan.date[2]);
  const migrated = migrateDemoDateIso(iso);
  if (migrated === iso) return scan;
  const newDate = migrateDemoYmd(scan.date);
  const [y, m, d] = newDate;
  const dateLabel = `${d} ${MONTH_NAMES[m - 1]} ${y}`;
  return {
    ...scan,
    date: newDate,
    scannedAt: scan.scannedAt.replace(/^\d{1,2}\s+\w+\s+\d{4}/, dateLabel),
    shiftSessionId: scan.shiftSessionId
      ? scan.shiftSessionId.replace(
          /shift-\d{4}-\d{2}-\d{2}-/,
          `shift-${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}-`,
        )
      : scan.shiftSessionId,
    receiptRef:
      scan.id === 'rc-luna-1'
        ? buildDemoReceiptRef(scan.outlet, newDate)
        : scan.receiptRef,
  };
}

export function remapSeedReceiptScans(scans: PrReceiptScan[]): PrReceiptScan[] {
  return scans.map(remapSeedReceiptScan);
}

export function formatRMPlain(n: number) {
  return `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function downloadPvReceipt(
  pv: PrPaymentVoucher,
  profile: { name: string; bank: string; acc: string; ic: string },
) {
  const rowLines =
    pv.rows.length > 0
      ? pv.rows
          .map(
            (r) =>
              `  ${r.date} · ${r.outlet} · ${r.desc} · ${formatRMPlain(r.amt)}`,
          )
          .join('\n')
      : '  (Summary PV — line items in agency portal)';

  const body = [
    'INNOCENZ — PAYMENT RECEIPT',
    '================================',
    '',
    `PV Number:     ${pv.id}`,
    `Status:        ${pv.status}`,
    `Payroll cycle: ${pv.cycle}`,
    `Outlet:        ${pv.outlet}`,
    `Issued:        ${pv.issued}`,
    '',
    'PAYEE',
    `  Name:        ${profile.name}`,
    `  IC:          ${profile.ic}`,
    `  Bank:        ${profile.bank}`,
    `  Account:     ${profile.acc}`,
    '',
    'LINE ITEMS',
    rowLines,
    '',
    `Subtotal:      ${formatRMPlain(pv.subtotal)}`,
    pv.deduct ? `Deductions:    -${formatRMPlain(pv.deduct)}` : '',
    `Net paid:      ${formatRMPlain(pv.net)}`,
    '',
    'SIGNATURES',
    `  Finance Head (Agency): ${pv.financeHeadName}`,
    `  Agency signed:         ${pv.financeHeadSignedAt}`,
    pv.prSignedAt
      ? `  PR signed:             ${pv.prSignedAt}`
      : '  PR signed:             —',
    '',
    pv.paidAt ? `Bank transfer: ${pv.paidAt}` : '',
    pv.bankRef ? `Reference:     ${pv.bankRef}` : '',
    '',
    'Funds route: Outlet → Agency → PR bank (no manual withdraw).',
    'This receipt is immutable once PAID.',
    '',
    `Generated: ${new Date().toLocaleString('en-MY')}`,
  ]
    .filter(Boolean)
    .join('\n');

  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${pv.id}-payment-receipt.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface HistRow {
  d: [number, number, number];
  venue: string;
  wages: number;
  sales: number;
  others: number;
  drinks: number;
  tips: number;
  st: 'PAID' | 'SIGNED' | 'SENT' | 'DISPUTED' | 'SEALED';
  pill: 'green' | 'amber' | 'ink' | 'red';
  durationHours?: number;
}

/** Receipt OCR line item */
export type ReceiptItemCategory = 'drinks' | 'tips' | 'tables' | 'other';

export interface PrReceiptItem {
  label: string;
  qty: number;
  unitPrice: number;
  amount: number;
  category: ReceiptItemCategory;
}

export type ReceiptScanStatus =
  'attached' | 'pending' | 'in_pv' | 'paid' | 'disputed';

/** Resolved badge/filter status — prefers PV dispute over scan lifecycle. */
export function effectiveReceiptScanStatus(
  scan: PrReceiptScan,
): ReceiptScanStatus {
  if (scan.pvStatus === 'DISPUTED' || scan.status === 'disputed')
    return 'disputed';
  if (scan.status === 'attached') return 'attached';
  if (scan.status === 'paid' || scan.pvStatus === 'PAID') return 'paid';
  if (
    scan.status === 'in_pv' ||
    scan.pvStatus === 'SENT' ||
    scan.pvStatus === 'SIGNED'
  ) {
    return 'in_pv';
  }
  return scan.status === 'pending' ? 'pending' : scan.status;
}

export type ReceiptLogSource = 'ocr' | 'manual';
export type ReceiptAgencyVerification = 'pending' | 'approved' | 'rejected';
export type ReceiptEntryMethod = 'scan' | 'manual';

export interface PrReceiptScan {
  id: string;
  /** Unique outlet POS receipt number — global duplicate guard */
  receiptRef: string;
  scannedAt: string;
  /** How the receipt was logged — camera OCR scan vs manual tap entry */
  entryMethod?: ReceiptEntryMethod;
  date: [number, number, number];
  outlet: string;
  prCode: string;
  prName: string;
  /** Agency roster PR id when known */
  prId?: string;
  items: PrReceiptItem[];
  totalLogged: number;
  drinkCommission: number;
  tipCommission: number;
  totalCommission: number;
  /** Shift session — receipts only count toward this shift's PV */
  shiftSessionId?: string;
  /** PV this receipt belongs to (assigned at check-in, finalized at time-out) */
  pvId?: string;
  pvLineDesc?: string;
  pvStatus?: PrPvStatus;
  status: ReceiptScanStatus;
  /** OCR scan vs PR self-log when receipt is unreadable */
  logSource?: ReceiptLogSource;
  manualReason?: string;
  /** Agency must verify manual self-logs before they count as matched */
  agencyVerification?: ReceiptAgencyVerification;
  agencyVerifiedAt?: string;
}

/** Outlet commission rules — matches Check-In running payout (RM15/drink, RM60/table, 100% tips) */
export const RECEIPT_COMMISSION_RULES = {
  drinkPerUnit: 15,
  tablePerUnit: 60,
  tipRate: 1,
} as const;

export function calcReceiptCommissions(items: PrReceiptItem[]) {
  let drinkCommission = 0;
  let tipCommission = 0;
  for (const item of items) {
    if (item.category === 'drinks')
      drinkCommission += item.qty * RECEIPT_COMMISSION_RULES.drinkPerUnit;
    else if (item.category === 'tips')
      tipCommission += item.amount * RECEIPT_COMMISSION_RULES.tipRate;
  }
  return {
    drinkCommission,
    tipCommission,
    totalCommission: drinkCommission + tipCommission,
  };
}

export function buildDemoReceiptRef(
  outlet: string,
  date: [number, number, number] = SHIFT_TODAY,
): string {
  const outletCode =
    outlet
      .replace(/\s+KL$/i, '')
      .trim()
      .split(/\s+/)
      .map((w) => w.slice(0, 4).toUpperCase())
      .join('')
      .slice(0, 4) || 'OUT';
  const [y, m, d] = date;
  const seq = Date.now().toString(36).slice(-5).toUpperCase();
  return `${outletCode}-${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}-${seq}`;
}

export function buildDemoReceiptDraft(
  profile: { name: string; first: string },
  outlet = 'Velvet 23',
  variantIndex = 0,
  prId: string = TIED_DEMO_ROSTER_PR_ID,
  receiptRef?: string,
) {
  const variants: {
    receiptRef: string;
    items: PrReceiptItem[];
  }[] = [
    {
      receiptRef: 'POS-88421',
      items: [
        {
          label: 'Cocktail',
          qty: 2,
          unitPrice: 45,
          amount: 90,
          category: 'drinks',
        },
        { label: 'Tip', qty: 1, unitPrice: 60, amount: 60, category: 'tips' },
      ],
    },
    {
      receiptRef: 'POS-88422',
      items: [
        {
          label: 'Beer',
          qty: 3,
          unitPrice: 35,
          amount: 105,
          category: 'drinks',
        },
        {
          label: 'VIP Table',
          qty: 1,
          unitPrice: 200,
          amount: 200,
          category: 'tables',
        },
      ],
    },
    {
      receiptRef: 'POS-88423',
      items: [
        {
          label: 'Whisky',
          qty: 1,
          unitPrice: 180,
          amount: 180,
          category: 'drinks',
        },
      ],
    },
  ];

  const picked = variants[variantIndex % variants.length]!;
  const items = picked.items;
  const totalLogged = items.reduce((s, i) => s + i.amount, 0);
  const comm = calcReceiptCommissions(items);
  const prCode =
    prId === TIED_DEMO_ROSTER_PR_ID
      ? 'PR-0001'
      : `PR-${prId.replace(/\D/g, '').slice(0, 4).padStart(4, '0') || '0099'}`;
  return {
    receiptRef: receiptRef ?? picked.receiptRef,
    outlet: outlet.includes('KL') ? outlet : `${outlet} KL`,
    prCode,
    prName: profile.first,
    prId,
    items,
    totalLogged,
    ...comm,
  };
}

const CATEGORY_DRAFT_ITEMS: Record<
  'drinks' | 'tips' | 'tables',
  PrReceiptItem[]
> = {
  drinks: [
    {
      label: 'Cocktail',
      qty: 2,
      unitPrice: 45,
      amount: 90,
      category: 'drinks',
    },
    { label: 'Beer', qty: 1, unitPrice: 35, amount: 35, category: 'drinks' },
  ],
  tips: [{ label: 'Tip', qty: 1, unitPrice: 80, amount: 80, category: 'tips' }],
  tables: [
    {
      label: 'VIP Table',
      qty: 1,
      unitPrice: 200,
      amount: 200,
      category: 'tables',
    },
  ],
};

export function buildDemoReceiptDraftForCategory(
  profile: { name: string; first: string },
  outlet: string,
  prId: string,
  category: 'drinks' | 'tips' | 'tables',
  receiptRef?: string,
) {
  const items = CATEGORY_DRAFT_ITEMS[category];
  const totalLogged = items.reduce((s, i) => s + i.amount, 0);
  const comm = calcReceiptCommissions(items);
  const prCode =
    prId === TIED_DEMO_ROSTER_PR_ID
      ? 'PR-0001'
      : `PR-${prId.replace(/\D/g, '').slice(0, 4).padStart(4, '0') || '0099'}`;
  return {
    receiptRef: receiptRef ?? buildDemoReceiptRef(outlet),
    outlet: outlet.includes('KL') ? outlet : `${outlet} KL`,
    prCode,
    prName: profile.first,
    prId,
    items,
    totalLogged,
    ...comm,
  };
}

/** Unique key for duplicate receipt detection (POS ref preferred) */
export function receiptScanFingerprint(input: {
  outlet: string;
  totalLogged: number;
  items: PrReceiptItem[];
  receiptRef?: string;
}): string {
  const ref = input.receiptRef?.trim();
  if (ref) {
    const normalizedOutlet = input.outlet
      .replace(/\s+KL$/i, '')
      .trim()
      .toLowerCase();
    return `ref:${normalizedOutlet}|${ref.toUpperCase()}`;
  }
  const normalizedOutlet = input.outlet
    .replace(/\s+KL$/i, '')
    .trim()
    .toLowerCase();
  const itemsKey = input.items
    .map((i) => `${i.category}|${i.label}|${i.qty}|${i.amount}`)
    .sort()
    .join(';');
  return `fp:${normalizedOutlet}|${input.totalLogged}|${itemsKey}`;
}

export function findDuplicateReceiptScan(
  scans: PrReceiptScan[],
  fingerprint: string,
  ignoreScanId?: string,
): PrReceiptScan | undefined {
  return scans.find((s) => {
    if (ignoreScanId && s.id === ignoreScanId) return false;
    const fp = receiptScanFingerprint({
      outlet: s.outlet,
      totalLogged: s.totalLogged,
      items: s.items,
      receiptRef: s.receiptRef,
    });
    return fp === fingerprint;
  });
}

export function receiptPrimaryCategory(
  scan: PrReceiptScan,
): 'drinks' | 'tips' | 'tables' {
  const cat = scan.items[0]?.category;
  if (cat === 'drinks' || cat === 'tips' || cat === 'tables') return cat;
  return 'drinks';
}

/** Active scan/self-log categories (legacy table receipts map to drinks). */
export function receiptScanCategory(scan: PrReceiptScan): 'drinks' | 'tips' {
  const cat = receiptPrimaryCategory(scan);
  return cat === 'tables' ? 'drinks' : cat;
}

export function receiptBelongsToPvLabel(scan: PrReceiptScan) {
  if (!scan.pvId) return 'PV pending · check out to generate';
  if (scan.status === 'attached') return `→ ${scan.pvId} (this shift)`;
  return scan.pvId;
}

/** Time portion from scannedAt e.g. "4 Jun 2026 · 22:15" → "22:15" */
export function formatReceiptScannedTime(scannedAt: string): string {
  const m = scannedAt.trim().match(/·\s*(\d{1,2}:\d{2})/);
  return m ? m[1] : scannedAt;
}

export function receiptEntryMethod(scan: PrReceiptScan): ReceiptEntryMethod {
  if (scan.entryMethod) return scan.entryMethod;
  if (scan.logSource === 'manual') return 'manual';
  return 'scan';
}

export function receiptEntryMethodLabel(entry: ReceiptEntryMethod): string {
  return entry === 'manual' ? 'Manual' : 'Scanned';
}

export function receiptEntryLoggedLabel(scan: PrReceiptScan): string {
  const entry = receiptEntryMethod(scan);
  if (entry === 'manual') {
    return scan.scannedAt ? `Keyed ${scan.scannedAt}` : 'Manual self-log';
  }
  return `Scanned ${scan.scannedAt}`;
}

export function receiptShiftDetails(
  scan: PrReceiptScan,
  pv?: PrPaymentVoucher | null,
): { shiftTime: string; window: string } {
  if (pv?.shiftTime) {
    const window =
      pv.timeIn && pv.timeOut
        ? `${pv.timeIn} → ${pv.timeOut}`
        : (pv.timeIn ?? '');
    return { shiftTime: pv.shiftTime, window };
  }
  if (pv?.timeIn) {
    return {
      shiftTime: 'Shift',
      window: pv.timeOut ? `${pv.timeIn} → ${pv.timeOut}` : pv.timeIn,
    };
  }
  if (scan.shiftSessionId) {
    const slug = scan.shiftSessionId.match(
      /^shift-(\d{4})-(\d{2})-(\d{2})-(.+)$/,
    );
    if (slug) {
      const months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
      const day = parseInt(slug[3], 10);
      const mon = months[parseInt(slug[2], 10) - 1] ?? slug[2];
      return {
        shiftTime: `${day} ${mon} ${slug[1]}`,
        window: scan.shiftSessionId,
      };
    }
    return { shiftTime: scan.shiftSessionId, window: '' };
  }
  return { shiftTime: '—', window: '' };
}

export function receiptStatusLabel(status: ReceiptScanStatus) {
  if (status === 'attached') return 'ON SHIFT';
  if (status === 'in_pv') return 'IN PV';
  if (status === 'paid') return 'PAID';
  if (status === 'disputed') return 'DISPUTED';
  return 'PENDING';
}

export function receiptStatusPillVariant(
  status: ReceiptScanStatus,
): 'green' | 'amber' | 'red' | 'ink' {
  if (status === 'paid') return 'green';
  if (status === 'disputed') return 'red';
  if (status === 'in_pv') return 'amber';
  if (status === 'attached') return 'amber';
  return 'ink';
}

export function isManualSelfLog(scan: PrReceiptScan) {
  return scan.logSource === 'manual';
}

export function isSelfLogPendingAgency(scan: PrReceiptScan) {
  return isManualSelfLog(scan) && scan.agencyVerification === 'pending';
}

export function isSelfLogVerified(scan: PrReceiptScan) {
  return isManualSelfLog(scan) && scan.agencyVerification === 'approved';
}

export function selfLogVerificationLabel(scan: PrReceiptScan): string {
  if (!isManualSelfLog(scan)) return '';
  if (scan.agencyVerification === 'approved') return 'Agency verified';
  if (scan.agencyVerification === 'rejected') return 'Agency rejected';
  return 'Pending agency verify';
}

export function buildManualReceiptItems(
  category: 'drinks' | 'tips',
  amount: number,
): PrReceiptItem[] {
  const safe = Math.max(0, Math.round(amount * 100) / 100);
  if (category === 'drinks') {
    const unitPrice = 50;
    const qty = Math.max(1, Math.round(safe / unitPrice));
    return [
      {
        label: 'Self-log · drinks (manual)',
        qty,
        unitPrice,
        amount: safe,
        category: 'drinks',
      },
    ];
  }
  return [
    {
      label: 'Self-log · tips (manual)',
      qty: 1,
      unitPrice: safe,
      amount: safe,
      category: 'tips',
    },
  ];
}

export function buildDrinkSelfLogItems(
  drink: { name: string; priceRm: number },
  qty: number,
): PrReceiptItem[] {
  const safeQty = Math.max(1, Math.floor(qty));
  const unitPrice = drink.priceRm;
  const amount = Math.round(unitPrice * safeQty * 100) / 100;
  return [
    {
      label: drink.name,
      qty: safeQty,
      unitPrice,
      amount,
      category: 'drinks',
    },
  ];
}

export type ManualSelfLogInput = {
  category: 'drinks' | 'tips';
  amount: number;
  drinkId?: string;
  drinkQty?: number;
  drinkQtys?: Record<string, number>;
};

export function buildDrinkSelfLogItemsFromQtys(
  outlet: string,
  qtys: Record<string, number>,
): PrReceiptItem[] {
  const menu = getDrinkMenuForOutlet(outlet);
  const items: PrReceiptItem[] = [];
  for (const drink of menu) {
    const qty = Math.floor(qtys[drink.id] ?? 0);
    if (qty > 0) items.push(...buildDrinkSelfLogItems(drink, qty));
  }
  return items;
}

export function resolveManualSelfLogItems(
  manual: ManualSelfLogInput,
  outlet: string,
): PrReceiptItem[] {
  if (manual.category === 'tips') {
    return buildManualReceiptItems('tips', manual.amount);
  }
  if (manual.drinkQtys) {
    const fromQtys = buildDrinkSelfLogItemsFromQtys(outlet, manual.drinkQtys);
    if (fromQtys.length > 0) return fromQtys;
  }
  if (manual.drinkId && manual.drinkQty && manual.drinkQty > 0) {
    const drink = getDrinkMenuForOutlet(outlet).find(
      (d) => d.id === manual.drinkId,
    );
    if (drink) return buildDrinkSelfLogItems(drink, manual.drinkQty);
  }
  return buildManualReceiptItems('drinks', manual.amount);
}

export function manualSelfLogTotal(items: PrReceiptItem[]): number {
  return (
    Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100
  );
}

export const SEED_RECEIPT_SCANS: PrReceiptScan[] = [
  {
    id: 'rc-seed-1',
    receiptRef: 'MER-20260427-084721',
    scannedAt: '27 Apr 2026 · 23:48',
    date: [2026, 4, 27],
    outlet: 'Mermate',
    prCode: 'PR-0042',
    prName: 'Bernice',
    prId: 'pr-comcard-bernice',
    shiftSessionId: 'shift-2026-04-27-mermate',
    items: [
      {
        label: 'Cocktail',
        qty: 6,
        unitPrice: 45,
        amount: 270,
        category: 'drinks',
      },
      { label: 'Beer', qty: 4, unitPrice: 35, amount: 140, category: 'drinks' },
    ],
    totalLogged: 410,
    drinkCommission: 150,
    tipCommission: 0,
    totalCommission: 150,
    pvId: 'PV-2026-0498',
    pvStatus: 'PAID',
    status: 'paid',
  },
  {
    id: 'rc-seed-2',
    receiptRef: 'MER-20260427-091204',
    scannedAt: '27 Apr 2026 · 00:12',
    date: [2026, 4, 27],
    outlet: 'Mermate',
    prCode: 'PR-0042',
    prName: 'Bernice',
    prId: 'pr-comcard-bernice',
    shiftSessionId: 'shift-2026-04-27-mermate',
    items: [
      {
        label: 'Whisky',
        qty: 1,
        unitPrice: 320,
        amount: 320,
        category: 'drinks',
      },
    ],
    totalLogged: 320,
    drinkCommission: 15,
    tipCommission: 0,
    totalCommission: 15,
    pvId: 'PV-2026-0498',
    pvStatus: 'PAID',
    status: 'paid',
  },
  {
    id: 'rc-seed-3',
    receiptRef: 'MER-20260427-091508',
    scannedAt: '27 Apr 2026 · 01:05',
    date: [2026, 4, 27],
    outlet: 'Mermate',
    prCode: 'PR-0042',
    prName: 'Bernice',
    prId: 'pr-comcard-bernice',
    shiftSessionId: 'shift-2026-04-27-mermate',
    items: [
      { label: 'Tip', qty: 1, unitPrice: 80, amount: 80, category: 'tips' },
    ],
    totalLogged: 80,
    drinkCommission: 0,
    tipCommission: 80,
    totalCommission: 80,
    pvId: 'PV-2026-0498',
    pvStatus: 'PAID',
    status: 'paid',
  },
  {
    id: 'rc-seed-4',
    receiptRef: 'BEAR-20260509-002218',
    scannedAt: '9 May 2026 · 00:44',
    date: [2026, 5, 9],
    outlet: 'Bear Lounge',
    prCode: 'PR-0042',
    prName: 'Charlotte',
    prId: 'pr-comcard-charlotte',
    shiftSessionId: 'shift-2026-05-09-bearlounge',
    items: [
      {
        label: 'Cocktail',
        qty: 8,
        unitPrice: 45,
        amount: 360,
        category: 'drinks',
      },
    ],
    totalLogged: 360,
    drinkCommission: 120,
    tipCommission: 0,
    totalCommission: 120,
    pvId: 'PV-2026-0521',
    pvStatus: 'DISPUTED',
    status: 'in_pv',
  },
  {
    id: 'rc-seed-5',
    receiptRef: 'TAP-20260521-233042',
    scannedAt: '21 May 2026 · 23:30',
    entryMethod: 'manual',
    date: [2026, 5, 21],
    outlet: 'Mermate',
    prCode: 'PR-0042',
    prName: 'Hazel',
    prId: 'pr-comcard-hazel',
    shiftSessionId: 'shift-2026-05-21-mermate',
    pvId: 'PV-SHIFT-2026-0521-MERMATE',
    items: [
      {
        label: 'Cocktail',
        qty: 4,
        unitPrice: 45,
        amount: 180,
        category: 'drinks',
      },
      { label: 'Tip', qty: 1, unitPrice: 65, amount: 65, category: 'tips' },
    ],
    totalLogged: 245,
    drinkCommission: 60,
    tipCommission: 65,
    totalCommission: 125,
    status: 'attached',
  },
  {
    id: 'rc-luna-w2-d',
    receiptRef: 'VEL-20260616-203412',
    scannedAt: '16 Jun 2026 · 20:34',
    date: [2026, 6, 16],
    outlet: 'Velvet 23',
    prCode: 'PR-0001',
    prName: 'Vicky',
    prId: 'p1',
    shiftSessionId: 'shift-2026-06-16-velvet23',
    pvId: 'PV-2026-0611-A',
    items: [
      {
        label: 'Cocktail',
        qty: 8,
        unitPrice: 45,
        amount: 360,
        category: 'drinks',
      },
    ],
    totalLogged: 360,
    drinkCommission: 96,
    tipCommission: 0,
    totalCommission: 96,
    pvStatus: 'SENT',
    status: 'in_pv',
  },
  {
    id: 'rc-luna-1',
    receiptRef: 'VEL-20260618-221547',
    scannedAt: '18 Jun 2026 · 22:15',
    date: [2026, 6, 18],
    outlet: 'Velvet 23',
    prCode: 'PR-0001',
    prName: 'Vicky',
    prId: 'p1',
    shiftSessionId: 'shift-2026-06-18-velvet',
    pvId: 'PV-2026-0611-A',
    items: [
      {
        label: 'Champagne',
        qty: 2,
        unitPrice: 280,
        amount: 560,
        category: 'drinks',
      },
      {
        label: 'VIP Table',
        qty: 1,
        unitPrice: 400,
        amount: 400,
        category: 'tables',
      },
    ],
    totalLogged: 960,
    drinkCommission: 30,
    tipCommission: 0,
    totalCommission: 90,
    pvStatus: 'SIGNED',
    status: 'in_pv',
  },
  {
    id: 'rc-luna-2',
    receiptRef: 'TAP-20260603-214208',
    scannedAt: '3 Jun 2026 · 22:08',
    entryMethod: 'manual',
    date: [2026, 6, 3],
    outlet: 'Bear Lounge',
    prCode: 'PR-0001',
    prName: 'Vicky',
    prId: 'p1',
    shiftSessionId: 'shift-2026-06-03-bearlounge',
    pvId: 'PV-2026-0604-L',
    items: [
      {
        label: 'Cocktail',
        qty: 6,
        unitPrice: 45,
        amount: 270,
        category: 'drinks',
      },
    ],
    totalLogged: 270,
    drinkCommission: 85,
    tipCommission: 0,
    totalCommission: 85,
    pvStatus: 'DISPUTED',
    status: 'in_pv',
  },
  {
    id: 'rc-mia-1',
    receiptRef: 'TAP-20260603-234011',
    scannedAt: '3 Jun 2026 · 23:40',
    entryMethod: 'manual',
    date: [2026, 6, 3],
    outlet: 'Mermate',
    prCode: 'PR-0002',
    prName: 'Alice',
    prId: 'pr-comcard-alice',
    shiftSessionId: 'shift-2026-06-03-mermate',
    pvId: 'PV-2026-0608-B',
    items: [
      {
        label: 'Cocktail',
        qty: 5,
        unitPrice: 45,
        amount: 225,
        category: 'drinks',
      },
    ],
    totalLogged: 225,
    drinkCommission: 75,
    tipCommission: 0,
    totalCommission: 75,
    pvStatus: 'PAID',
    status: 'paid',
  },
];

export const LIVE_SEED_PR_PVS = remapSeedPaymentVouchers(SEED_PR_PVS);
export const LIVE_SEED_RECEIPT_SCANS =
  remapSeedReceiptScans(SEED_RECEIPT_SCANS);

export interface PvLineRecord {
  key: string;
  pvId: string;
  pvStatus: PrPvStatus;
  cycle: string;
  date: string;
  outlet: string;
  desc: string;
  qty: number;
  amount: number;
  ref: string;
  receiptIds: string[];
}

export function flattenPvLines(
  pvs: PrPaymentVoucher[],
  scans: PrReceiptScan[],
): PvLineRecord[] {
  const scanById = Object.fromEntries(scans.map((s) => [s.id, s]));
  const lines: PvLineRecord[] = [];
  for (const pv of pvs) {
    for (const row of pv.rows) {
      const receiptIds =
        row.receiptIds ??
        scans
          .filter(
            (s) =>
              s.pvId === pv.id &&
              (s.pvLineDesc === row.desc ||
                row.desc
                  .toLowerCase()
                  .includes(s.pvLineDesc?.toLowerCase() ?? '___')),
          )
          .map((s) => s.id);
      lines.push({
        key: `${pv.id}-${row.i}`,
        pvId: pv.id,
        pvStatus: pv.status,
        cycle: pv.cycle,
        date: row.date,
        outlet: row.outlet,
        desc: row.desc,
        qty: row.qty,
        amount: row.amt,
        ref: row.ref,
        receiptIds: receiptIds.filter((id) => scanById[id]),
      });
    }
  }
  return lines;
}

export function receiptPvCalcNote(scan: PrReceiptScan) {
  const parts: string[] = [];
  if (scan.drinkCommission > 0)
    parts.push(`Drinks ${formatRMPlain(scan.drinkCommission)}`);
  if (scan.tipCommission > 0)
    parts.push(`Tips ${formatRMPlain(scan.tipCommission)}`);
  const calc = parts.join(' + ') || formatRMPlain(0);
  if (scan.pvId) {
    if (scan.status === 'attached') {
      return `${calc} → ${scan.pvId} when you Time-Out`;
    }
    return `${calc} → ${scan.pvId}`;
  }
  return `${calc} · assign at check-in`;
}

/** @deprecated Use store.shiftHistory via shiftHistoryToHistRows — kept for type/export */
export const HIST_ROWS: HistRow[] = [
  {
    d: [2026, 5, 4],
    venue: 'Mermate',
    wages: 350,
    sales: 510,
    others: 60,
    drinks: 24,
    tips: 40,
    st: 'PAID',
    pill: 'green',
  },
  {
    d: [2026, 5, 5],
    venue: 'Mermate',
    wages: 350,
    sales: 520,
    others: 60,
    drinks: 22,
    tips: 50,
    st: 'PAID',
    pill: 'green',
  },
  {
    d: [2026, 5, 6],
    venue: 'Bear Lounge',
    wages: 350,
    sales: 420,
    others: 120,
    drinks: 17,
    tips: 50,
    st: 'PAID',
    pill: 'green',
  },
  {
    d: [2026, 5, 7],
    venue: 'Urban Soul',
    wages: 350,
    sales: 480,
    others: 0,
    drinks: 19,
    tips: 60,
    st: 'SIGNED',
    pill: 'amber',
  },
  {
    d: [2026, 5, 11],
    venue: 'Mermate',
    wages: 380,
    sales: 620,
    others: 120,
    drinks: 28,
    tips: 65,
    st: 'PAID',
    pill: 'green',
  },
  {
    d: [2026, 5, 14],
    venue: 'Bear Lounge',
    wages: 350,
    sales: 380,
    others: 60,
    drinks: 15,
    tips: 30,
    st: 'SIGNED',
    pill: 'amber',
  },
  {
    d: [2026, 5, 18],
    venue: 'Urban Soul',
    wages: 350,
    sales: 550,
    others: 60,
    drinks: 21,
    tips: 55,
    st: 'SENT',
    pill: 'ink',
  },
  {
    d: [2026, 5, 21],
    venue: 'Mermate',
    wages: 400,
    sales: 710,
    others: 180,
    drinks: 32,
    tips: 80,
    st: 'DISPUTED',
    pill: 'red',
  },
];

export const SEED_PR_COMCARD_IMAGE = '/assets/pr-portfolio/vicky-comcard.png';

export type PrComcard = {
  height: number;
  weight: number;
  age: number;
  /** Pre-rendered photo comcard — when set, shown instead of 3D / generated grid */
  imageUrl?: string;
};

export const COMCARD: PrComcard = {
  height: 153,
  weight: 40,
  age: 24,
  imageUrl: SEED_PR_COMCARD_IMAGE,
};

export const PR_LANGUAGE_OPTIONS = [
  'English',
  'Mandarin',
  'Cantonese',
  'Malay',
  'Japanese',
  'Korean',
  'Thai',
  'Hindi',
  'Tagalog',
  'Vietnamese',
  'Tamil',
  'Hokkien',
] as const;

export const PORTFOLIO_SLOT_COUNT = 8;

/** Demo portfolio photos for Vicky (PR profile → Portfolio gallery) */
export const SEED_PR_PORTFOLIO_PATHS = [
  '/assets/pr-portfolio/vicky-1.png',
  '/assets/pr-portfolio/vicky-2.png',
  '/assets/pr-portfolio/vicky-3.png',
  '/assets/pr-portfolio/vicky-4.png',
] as const;

/** Remap legacy Luna asset filenames saved in localStorage. */
export function migratePrPortfolioAssetPath(
  path: string | null | undefined,
): string | null {
  if (!path) return path ?? null;
  return path.replace(/\/luna-/g, '/vicky-');
}

/** Profile avatar — first portfolio photo for Vicky demo */
export const SEED_PR_AVATAR_IMAGE = SEED_PR_PORTFOLIO_PATHS[0];

export function buildSeedPrPortfolio(): (string | null)[] {
  const slots: (string | null)[] = Array.from(
    { length: PORTFOLIO_SLOT_COUNT },
    () => null,
  );
  for (let i = 0; i < SEED_PR_PORTFOLIO_PATHS.length; i++) {
    slots[i] = SEED_PR_PORTFOLIO_PATHS[i];
  }
  return slots;
}

export interface PrAgency {
  id: string;
  name: string;
  city: string;
  address: string;
  initials: string;
  gradient: string;
  activePrs: number;
  rating: number;
  financeHead: string;
  tagline: string;
}

/** Registered PR agencies on InnocenZ — a PR ties to one for payroll */
export const PR_AGENCIES: PrAgency[] = [
  {
    id: 'atlas',
    name: 'Atlas Agency',
    city: 'Kuala Lumpur',
    address: '18 Jalan Sultan Ismail, Bukit Bintang, 50250 Kuala Lumpur',
    initials: 'A',
    gradient: 'linear-gradient(135deg,#C99B4E,#8a5e22)',
    activePrs: 128,
    rating: 4.9,
    financeHead: 'Sarah Tan',
    tagline: 'Full roster, PV & collections',
  },
  {
    id: 'starline',
    name: 'Starline PR',
    city: 'Petaling Jaya',
    address: '42 Jalan SS15/4, Subang Jaya, 47500 Petaling Jaya',
    initials: 'S',
    gradient: 'linear-gradient(135deg,#5BA8FF,#2d63b8)',
    activePrs: 64,
    rating: 4.7,
    financeHead: 'Daniel Koh',
    tagline: 'Fast payroll turnaround',
  },
  {
    id: 'velvet-roster',
    name: 'Velvet Roster',
    city: 'Bangsar',
    address: '8 Jalan Telawi 3, Bangsar Baru, 59100 Kuala Lumpur',
    initials: 'V',
    gradient: 'linear-gradient(135deg,#E879A8,#9b3d6a)',
    activePrs: 41,
    rating: 4.8,
    financeHead: 'Michelle Tan',
    tagline: 'VIP & lounge specialists',
  },
  {
    id: 'prestige',
    name: 'Prestige Hostess',
    city: 'Kuala Lumpur',
    address: '55 Jalan Ampang, Kuala Lumpur City Centre, 50450 Kuala Lumpur',
    initials: 'P',
    gradient: 'linear-gradient(135deg,#7C6BFF,#4338a8)',
    activePrs: 55,
    rating: 4.6,
    financeHead: 'Amir Hassan',
    tagline: 'Multi-outlet coverage',
  },
  {
    id: 'aurora',
    name: 'Aurora Talent',
    city: 'Mont Kiara',
    address: '2 Jalan Kiara, Mont Kiara, 50480 Kuala Lumpur',
    initials: 'Au',
    gradient: 'linear-gradient(135deg,#34D399,#047857)',
    activePrs: 37,
    rating: 4.7,
    financeHead: 'Grace Wong',
    tagline: 'Bilingual roster support',
  },
  {
    id: 'delta',
    name: 'Delta Agency',
    city: 'Cheras',
    address: '88 Jalan Cheras, Taman Midah, 56000 Kuala Lumpur',
    initials: 'D',
    gradient: 'linear-gradient(135deg,#F472B6,#9d2463)',
    activePrs: 73,
    rating: 4.8,
    financeHead: 'Nadia Rahman',
    tagline: 'Nightlife & event staffing',
  },
];

export const DEFAULT_TIED_AGENCY_ID = 'atlas';

/** Second operating agency (peer to Atlas) — owner login owner@delta-agency.my */
export const DELTA_AGENCY_ID = 'delta';

export function getPrAgencyById(
  id: string | null | undefined,
): PrAgency | undefined {
  if (!id) return undefined;
  return PR_AGENCIES.find((a) => a.id === id);
}
