/**
 * PR shifts demo data — mirrors InnocenZ-proto (`pr-demo.ts`, `agency-demo.ts`,
 * `pr-features.ts`, `pr-agency-schedule.ts`) for everything the backend does not
 * model yet (agency roster/shifts, payment vouchers, notifications, history).
 * Identity data (name, avatar, agency tie) comes live from the backend.
 */

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;
export const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export type Ymd = [number, number, number];

export function todayYmd(): Ymd {
  const d = new Date();
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
}

export function dayName(y: number, m: number, d: number) {
  return DAY_NAMES[new Date(y, m - 1, d).getDay()];
}

/** e.g. "Sun · 19 Jul 2026" — shift cards */
export function fmtDFriendly(y: number, m: number, d: number) {
  return `${dayName(y, m, d)} · ${String(d).padStart(2, '0')} ${MONTH_NAMES[m - 1]} ${y}`;
}

/** e.g. "Sun 19 Jul" — PR topbar */
export function fmtDTopbar(y: number, m: number, d: number) {
  return `${dayName(y, m, d)} ${String(d).padStart(2, '0')} ${MONTH_NAMES[m - 1]}`;
}

/** 24h clock, e.g. "13:54" — topbar + status bar */
export function fmtClock(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatRM(n: number) {
  return `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ymdToIso(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function isoToYmd(iso: string): Ymd {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m, d];
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = isoToYmd(iso);
  const dt = new Date(y, m - 1, d + days);
  return ymdToIso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

/** This week's day (Sunday-start), e.g. weekday 5 = Friday — roster demo dates */
function thisWeekYmd(weekday: number): Ymd {
  const now = new Date();
  const diff = weekday - now.getDay();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
}

function payrollWeekSundayIso(from = todayYmd()): string {
  const [y, m, d] = from;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - dt.getDay());
  return ymdToIso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

export type DemoShift = {
  id: string;
  outlet: string;
  event: string;
  date: Ymd;
  time: string;
  /** RM — displayed as `${event} · ${formatRM(payout)}` */
  payout: number;
  /** Served by the backend static /img route */
  logoPath: string | null;
  status: 'scheduled' | 'pending' | 'on-duty' | 'complete';
};

/** Tonight — matches proto roster slot rs1 (Vicky @ Velvet 23). */
export const TONIGHT_SHIFT: DemoShift = {
  id: 'shift-velvet-tonight',
  outlet: 'Velvet 23',
  event: 'Private VIP — Hennessy Launch',
  date: todayYmd(),
  time: '22:00 — 04:00',
  payout: 360,
  logoPath: '/img/outlets/velvet-23-logo.png',
  status: 'scheduled',
};

/** Agency schedule — tonight + Friday (proto rs1 + rs6). */
export const UPCOMING_SHIFTS: DemoShift[] = [
  TONIGHT_SHIFT,
  {
    id: 'shift-mermate-fri',
    outlet: 'Mermate',
    event: 'Regular',
    date: thisWeekYmd(5),
    time: '22:00 — 04:00',
    payout: 320,
    logoPath: null,
    status: 'scheduled',
  },
];

export type DemoTodo = {
  id: string;
  title: string;
  subtitle: string;
  actionLabel: string;
};

/** To-do — matches proto SEED_PR_NOTIFICATIONS PV review item. */
export const TODO_ITEMS: DemoTodo[] = [
  {
    id: 'todo-pv-1',
    title: 'Review payment voucher',
    subtitle: `Velvet 23 · PV-2026-0512 · ${formatRM(1630)}`,
    actionLabel: 'Review PV',
  },
];

export type DemoNotification = {
  id: string;
  title: string;
  body: string;
  at: string;
  read: boolean;
};

export const NOTIFICATIONS: DemoNotification[] = [
  {
    id: 'n-pv-1',
    title: 'Payment Voucher ready',
    body: 'PV-2026-0512 · RM1,630 net — Finance Head pre-signed. Review & sign.',
    at: '10 May · 09:20',
    read: false,
  },
];

/* ─── Agency schedule calendar + timetable (proto PrAgencySchedulePanel) ─── */

export type ScheduleDayKind = 'past' | 'open' | 'unavailable' | 'assigned' | 'pending' | 'active';

export type ScheduleDay = {
  dateIso: string;
  kind: ScheduleDayKind;
};

export type TimetableEntry = {
  id: string;
  dateIso: string;
  dateLabel: string;
  outlet: string;
  time: string;
  statusLabel: string;
  statusVariant: 'green' | 'amber' | 'red';
  sourceLabel: string;
  sourceDetail: string;
};

export const CANCELLATION_RULE_SUMMARY = [
  { label: '> 24h before', outcome: 'Free cancel', tone: 'green' as const },
  { label: '12–24h before', outcome: '−25% wages', tone: 'amber' as const },
  { label: '< 12h before', outcome: '−50% wages', tone: 'red' as const },
];

/** Build Sun→+21d schedule window, marking assigned days from UPCOMING_SHIFTS. */
export function buildScheduleDays(
  blockedIsos: string[] = [],
  baselineIso = ymdToIso(...todayYmd()),
): ScheduleDay[] {
  const fromIso = payrollWeekSundayIso();
  const toIso = addDaysIso(baselineIso, 21);
  const assigned = new Map(
    UPCOMING_SHIFTS.map((s) => [ymdToIso(...s.date), s.status] as const),
  );
  const blocked = new Set(blockedIsos);
  const days: ScheduleDay[] = [];
  let cursor = fromIso;
  while (cursor <= toIso) {
    let kind: ScheduleDayKind = 'open';
    if (cursor < baselineIso) kind = 'past';
    else if (blocked.has(cursor)) kind = 'unavailable';
    else if (assigned.has(cursor)) {
      const st = assigned.get(cursor);
      kind = st === 'pending' ? 'pending' : 'assigned';
    }
    days.push({ dateIso: cursor, kind });
    cursor = addDaysIso(cursor, 1);
  }
  return days;
}

export function getUpcomingWeekRange(baselineIso = ymdToIso(...todayYmd())) {
  const fromIso = baselineIso;
  const toIso = addDaysIso(baselineIso, 6);
  return { fromIso, toIso };
}

export function formatUpcomingWeekLabel(fromIso: string, toIso: string) {
  const [fy, fm, fd] = isoToYmd(fromIso);
  const [, tm, td] = isoToYmd(toIso);
  const startMonth = MONTH_NAMES[fm - 1].toUpperCase();
  const endMonth = MONTH_NAMES[tm - 1].toUpperCase();
  if (fm === tm) return `${fd}–${td} ${startMonth} ${fy}`;
  return `${fd} ${startMonth} – ${td} ${endMonth} ${fy}`;
}

export function buildUpcomingWeekTimetable(
  baselineIso = ymdToIso(...todayYmd()),
): TimetableEntry[] {
  const { fromIso, toIso } = getUpcomingWeekRange(baselineIso);
  return UPCOMING_SHIFTS.filter((s) => {
    const iso = ymdToIso(...s.date);
    return iso >= fromIso && iso <= toIso;
  }).map((s) => ({
    id: s.id,
    dateIso: ymdToIso(...s.date),
    dateLabel: fmtDFriendly(...s.date),
    outlet: s.outlet,
    time: s.time,
    statusLabel: s.status === 'pending' ? 'Pending' : 'Scheduled',
    statusVariant: s.status === 'pending' ? ('amber' as const) : ('green' as const),
    sourceLabel: 'Atlas Agency',
    sourceDetail: 'Agency assigned this shift on your roster',
  }));
}

/* ─── Payment vouchers + history ─── */

export type DemoPv = {
  id: string;
  ref: string;
  outlet: string;
  weekLabel: string;
  net: number;
  status: 'awaiting_pr' | 'signed' | 'paid';
  statusLabel: string;
};

export const PAYMENT_VOUCHERS: DemoPv[] = [
  {
    id: 'pv-2026-0512',
    ref: 'PV-2026-0512',
    outlet: 'Velvet 23',
    weekLabel: '10–16 May 2026',
    net: 1630,
    status: 'awaiting_pr',
    statusLabel: 'Awaiting your signature',
  },
  {
    id: 'pv-2026-0505',
    ref: 'PV-2026-0505',
    outlet: 'Velvet 23',
    weekLabel: '3–9 May 2026',
    net: 1480,
    status: 'paid',
    statusLabel: 'Paid',
  },
];

export type DemoHistoryShift = {
  id: string;
  outlet: string;
  dateLabel: string;
  time: string;
  payout: number;
  status: 'complete' | 'cancelled';
};

export const HISTORY_SHIFTS: DemoHistoryShift[] = [
  {
    id: 'hist-1',
    outlet: 'Velvet 23',
    dateLabel: 'Fri · 10 Jul 2026',
    time: '22:00 — 04:00',
    payout: 360,
    status: 'complete',
  },
  {
    id: 'hist-2',
    outlet: 'Mermate',
    dateLabel: 'Wed · 08 Jul 2026',
    time: '22:00 — 03:00',
    payout: 320,
    status: 'complete',
  },
  {
    id: 'hist-3',
    outlet: 'Velvet 23',
    dateLabel: 'Sun · 05 Jul 2026',
    time: '22:00 — 04:00',
    payout: 0,
    status: 'cancelled',
  },
];

/** Prototype geofence reminder copy — shown as info only while GPS is bypassed. */
export const GEOFENCE_METERS = 50;
export const GPS_BYPASS = true;

export const DEFAULT_AGENCY_NAME = 'Atlas Agency';

/** Portfolio + comcard served from backend `/img/pr/portfolio` (copied from proto). */
export const PORTFOLIO_SLOTS = 8;
export const SEED_PORTFOLIO = [
  '/img/pr/portfolio/vicky-1.png',
  '/img/pr/portfolio/vicky-2.png',
  '/img/pr/portfolio/vicky-3.png',
  '/img/pr/portfolio/vicky-4.png',
] as const;
export const SEED_COMCARD = '/img/pr/portfolio/vicky-comcard.png';

export type WeeklyDayPay = {
  day: string;
  date: number;
  wages: number;
  drinks: number | null;
};

/** Last-week payroll grid demo (matches proto Payment screenshot). */
export function buildLastWeekPayGrid(baseline = todayYmd()): WeeklyDayPay[] {
  const [y, m, d] = baseline;
  const sunday = new Date(y, m - 1, d);
  sunday.setDate(sunday.getDate() - sunday.getDay() - 7);
  const drinks = [125, 96, 109, 122, 98, 134, null] as const;
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(sunday);
    dt.setDate(sunday.getDate() + i);
    return {
      day: DAY_NAMES[dt.getDay()].toUpperCase().slice(0, 3),
      date: dt.getDate(),
      wages: 334,
      drinks: drinks[i],
    };
  });
}

export function weekRangeLabel(weeksAgo: number, baseline = todayYmd()): string {
  const [y, m, d] = baseline;
  const sunday = new Date(y, m - 1, d);
  sunday.setDate(sunday.getDate() - sunday.getDay() - weeksAgo * 7);
  const end = new Date(sunday);
  end.setDate(sunday.getDate() + 6);
  const a = `${String(sunday.getDate()).padStart(2, '0')} ${MONTH_NAMES[sunday.getMonth()]}`;
  const b = `${String(end.getDate()).padStart(2, '0')} ${MONTH_NAMES[end.getMonth()]} ${end.getFullYear()}`;
  return `${a} – ${b}`;
}
