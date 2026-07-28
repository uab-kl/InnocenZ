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
  /** Full outlet address (from the shift's outlet FK) — where the PR works. */
  address?: string | null;
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

export type DemoNotification = {
  id: string;
  title: string;
  body: string;
  at: string;
  read: boolean;
};

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
  /** Full outlet address (from the shift's outlet FK) — where the PR works. */
  address?: string | null;
  time: string;
  statusLabel: string;
  statusVariant: 'green' | 'amber' | 'red';
  sourceLabel: string;
  sourceDetail: string;
  /** False once checked in / completed — Cancel is only for upcoming booked shifts. */
  canCancel: boolean;
  /** MC/Leave request allowed — same window as Cancel, minus an already-pending request. */
  canLeave: boolean;
};

export const CANCELLATION_RULE_SUMMARY = [
  { label: '> 24h before', outcome: 'Free cancel', tone: 'green' as const },
  { label: '12–24h before', outcome: '−25% wages', tone: 'amber' as const },
  { label: '< 12h before', outcome: '−50% wages', tone: 'red' as const },
];

/**
 * Scheduled end of a shift as a Date, from its date + "HH:MM - HH:MM" slot.
 * Crosses midnight when the end reads earlier than the start ("22:00 - 04:00"
 * ends the next morning). Null when the free-text slot has no two clock times.
 */
export function shiftEndDate(shiftDateIso: string, slot: string | null): Date | null {
  const matches = slot?.match(/(\d{1,2}):(\d{2})/g);
  if (!matches || matches.length < 2) return null;
  const [sh, sm] = matches[0].split(':').map(Number);
  const [eh, em] = matches[1].split(':').map(Number);
  const [y, m, d] = isoToYmd(shiftDateIso);
  const end = new Date(y, m - 1, d, eh, em);
  if (eh * 60 + em <= sh * 60 + sm) end.setDate(end.getDate() + 1);
  return end;
}

/** Attendance label for timetable cards — stamps win over assignment.status. */
export function timetableStatusFromStamps(input: {
  checkInAt?: string | null;
  checkOutAt?: string | null;
  status?: string | null;
}): Pick<TimetableEntry, 'statusLabel' | 'statusVariant' | 'canCancel' | 'canLeave'> {
  if (input.checkOutAt || input.status === 'completed') {
    return { statusLabel: 'Complete', statusVariant: 'green', canCancel: false, canLeave: false };
  }
  if (input.checkInAt) {
    return { statusLabel: 'On duty', statusVariant: 'amber', canCancel: false, canLeave: false };
  }
  // MC/Leave awaiting the agency's decision — both actions pause until it lands.
  if (input.status === 'leave_pending') {
    return { statusLabel: 'Leave pending', statusVariant: 'amber', canCancel: false, canLeave: false };
  }
  // Excused shift (agency approved the MC/leave). Normally filtered out of the
  // schedule upstream; if shown, it is terminal — no further actions.
  if (input.status === 'leave_approved') {
    return { statusLabel: 'Leave approved', statusVariant: 'green', canCancel: false, canLeave: false };
  }
  if (input.status === 'assigned' || input.status === 'pending') {
    return { statusLabel: 'Pending', statusVariant: 'amber', canCancel: true, canLeave: true };
  }
  return { statusLabel: 'Scheduled', statusVariant: 'green', canCancel: true, canLeave: true };
}

type ScheduleShiftLike = {
  id: string;
  dateIso: string;
  outlet: string;
  address?: string | null;
  time: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  status?: string | null;
  agencyName?: string | null;
};

/** Build Sun→+21d schedule window from real assignments (fallback: demo UPCOMING_SHIFTS). */
export function buildScheduleDays(
  blockedIsos: string[] = [],
  baselineIso = ymdToIso(...todayYmd()),
  shifts?: ScheduleShiftLike[],
): ScheduleDay[] {
  const fromIso = payrollWeekSundayIso();
  const toIso = addDaysIso(baselineIso, 21);
  const source =
    shifts ??
    UPCOMING_SHIFTS.map((s) => ({
      id: s.id,
      dateIso: ymdToIso(...s.date),
      outlet: s.outlet,
      time: s.time,
      status: s.status === 'pending' ? 'assigned' : 'confirmed',
      checkInAt: s.status === 'on-duty' || s.status === 'complete' ? '1' : null,
      checkOutAt: s.status === 'complete' ? '1' : null,
    }));
  const byDate = new Map<string, ScheduleShiftLike[]>();
  for (const s of source) {
    const list = byDate.get(s.dateIso) ?? [];
    list.push(s);
    byDate.set(s.dateIso, list);
  }
  const blocked = new Set(blockedIsos);
  const days: ScheduleDay[] = [];
  let cursor = fromIso;
  while (cursor <= toIso) {
    let kind: ScheduleDayKind = 'open';
    if (cursor < baselineIso) kind = 'past';
    else if (blocked.has(cursor)) kind = 'unavailable';
    else if (byDate.has(cursor)) {
      const rows = byDate.get(cursor)!;
      if (rows.some((r) => r.checkInAt && !r.checkOutAt)) kind = 'active';
      else if (rows.some((r) => r.checkOutAt || r.status === 'completed')) kind = 'assigned';
      // leave_pending days stay amber — still booked until the agency decides.
      else if (
        rows.some(
          (r) =>
            r.status === 'assigned' || r.status === 'pending' || r.status === 'leave_pending',
        )
      )
        kind = 'pending';
      else kind = 'assigned';
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
  shifts?: ScheduleShiftLike[],
): TimetableEntry[] {
  const { fromIso, toIso } = getUpcomingWeekRange(baselineIso);
  const source =
    shifts ??
    UPCOMING_SHIFTS.map((s) => ({
      id: s.id,
      dateIso: ymdToIso(...s.date),
      outlet: s.outlet,
      time: s.time,
      status: s.status === 'pending' ? 'assigned' : 'confirmed',
      checkInAt: s.status === 'on-duty' || s.status === 'complete' ? '1' : null,
      checkOutAt: s.status === 'complete' ? '1' : null,
      agencyName: 'Atlas Agency',
    }));
  return source
    .filter((s) => s.dateIso >= fromIso && s.dateIso <= toIso)
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso) || a.time.localeCompare(b.time))
    .map((s) => {
      const [y, m, d] = isoToYmd(s.dateIso);
      const stamp = timetableStatusFromStamps(s);
      return {
        id: s.id,
        dateIso: s.dateIso,
        dateLabel: fmtDFriendly(y, m, d),
        outlet: s.outlet,
        address: s.address ?? null,
        time: s.time,
        ...stamp,
        sourceLabel: s.agencyName?.trim() || 'Agency',
        sourceDetail: 'Agency assigned this shift on your roster',
      };
    });
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

/** Placeholder — real awaiting PV is built from last-week grid via `getLastWeekAwaitingPv`. */
export const PAYMENT_VOUCHERS: DemoPv[] = [
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
  /** YYYY-MM-DD for filters */
  dateIso: string;
  time: string;
  payout: number;
  wages: number;
  drinks: number;
  tips: number;
  others: number;
  status: 'sealed' | 'signed' | 'cancelled' | 'current';
  weekId: string;
};

export type DemoHistoryWeek = {
  id: string;
  /** e.g. CURRENT WEEK · 19–25 Jul 2026 */
  title: string;
  kind: 'current' | 'payroll';
  weekLabel: string;
  pvRef?: string;
};

export const HISTORY_WEEKS: DemoHistoryWeek[] = [
  {
    id: 'week-current',
    title: 'CURRENT WEEK · 19–25 Jul 2026',
    kind: 'current',
    weekLabel: '19–25 Jul 2026',
    pvRef: 'PV pending Sunday',
  },
  {
    id: 'week-2026-07-12',
    title: 'PAYROLL WEEK · 12–18 Jul 2026',
    kind: 'payroll',
    weekLabel: '12–18 Jul 2026',
    pvRef: 'PV-2026-0719',
  },
  {
    id: 'week-2026-07-05',
    title: 'PAYROLL WEEK · 05–11 Jul 2026',
    kind: 'payroll',
    weekLabel: '05–11 Jul 2026',
    pvRef: 'PV-2026-0604-L',
  },
];

export const HISTORY_SHIFTS: DemoHistoryShift[] = [
  {
    id: 'hist-0712-1',
    outlet: 'Urban Soul',
    dateLabel: 'Sat · 18 Jul 2026',
    dateIso: '2026-07-18',
    time: '9:00 pm – 3:00 am',
    payout: 530,
    wages: 350,
    drinks: 120,
    tips: 45,
    others: 15,
    status: 'signed',
    weekId: 'week-2026-07-12',
  },
  {
    id: 'hist-0712-2',
    outlet: 'Velvet 23',
    dateLabel: 'Fri · 17 Jul 2026',
    dateIso: '2026-07-17',
    time: '10:00 pm – 4:00 am',
    payout: 498,
    wages: 350,
    drinks: 98,
    tips: 40,
    others: 10,
    status: 'signed',
    weekId: 'week-2026-07-12',
  },
  {
    id: 'hist-0712-3',
    outlet: 'Bear Lounge',
    dateLabel: 'Thu · 16 Jul 2026',
    dateIso: '2026-07-16',
    time: '9:00 pm – 3:00 am',
    payout: 512,
    wages: 350,
    drinks: 110,
    tips: 52,
    others: 0,
    status: 'signed',
    weekId: 'week-2026-07-12',
  },
  {
    id: 'hist-0712-4',
    outlet: 'Mermate',
    dateLabel: 'Wed · 15 Jul 2026',
    dateIso: '2026-07-15',
    time: '10:00 pm – 3:00 am',
    payout: 486,
    wages: 350,
    drinks: 96,
    tips: 40,
    others: 0,
    status: 'signed',
    weekId: 'week-2026-07-12',
  },
  {
    id: 'hist-0712-5',
    outlet: 'Velvet 23',
    dateLabel: 'Tue · 14 Jul 2026',
    dateIso: '2026-07-14',
    time: '10:00 pm – 4:00 am',
    payout: 505,
    wages: 365,
    drinks: 100,
    tips: 40,
    others: 0,
    status: 'signed',
    weekId: 'week-2026-07-12',
  },
  {
    id: 'hist-0712-6',
    outlet: 'Urban Soul',
    dateLabel: 'Sun · 12 Jul 2026',
    dateIso: '2026-07-12',
    time: '9:00 pm – 2:00 am',
    payout: 473,
    wages: 350,
    drinks: 88,
    tips: 35,
    others: 0,
    status: 'signed',
    weekId: 'week-2026-07-12',
  },
  {
    id: 'hist-1',
    outlet: 'Velvet 23',
    dateLabel: 'Fri · 10 Jul 2026',
    dateIso: '2026-07-10',
    time: '22:00 — 04:00',
    payout: 360,
    wages: 252,
    drinks: 72,
    tips: 36,
    others: 0,
    status: 'sealed',
    weekId: 'week-2026-07-05',
  },
  {
    id: 'hist-2',
    outlet: 'Mermate',
    dateLabel: 'Wed · 08 Jul 2026',
    dateIso: '2026-07-08',
    time: '22:00 — 03:00',
    payout: 320,
    wages: 224,
    drinks: 64,
    tips: 32,
    others: 0,
    status: 'sealed',
    weekId: 'week-2026-07-05',
  },
  {
    id: 'hist-3',
    outlet: 'Velvet 23',
    dateLabel: 'Sun · 05 Jul 2026',
    dateIso: '2026-07-05',
    time: '22:00 — 04:00',
    payout: 0,
    wages: 0,
    drinks: 0,
    tips: 0,
    others: 0,
    status: 'cancelled',
    weekId: 'week-2026-07-05',
  },
];

export function historyShiftOutlets(shifts = HISTORY_SHIFTS): string[] {
  return Array.from(new Set(shifts.map((s) => s.outlet))).sort();
}

function fmtTimeFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

export function fmtShiftTimeRange(checkedInAt: string, checkedOutAt: string): string {
  return `${fmtTimeFromIso(checkedInAt)} – ${fmtTimeFromIso(checkedOutAt)}`;
}

/** Map sealed check-out (Payment → This week) into History shift cards. */
export function weekPayRecordToHistoryShift(
  rec: WeekPayRecord,
  timeRange: string,
): DemoHistoryShift {
  const [y, m, d] = isoToYmd(rec.dateIso);
  const payout = roundRm(rec.wages + rec.drinks + rec.tips + rec.others);
  return {
    id: `live-${rec.dateIso}`,
    outlet: rec.outlet,
    dateLabel: fmtDFriendly(y, m, d),
    dateIso: rec.dateIso,
    time: timeRange,
    payout,
    wages: rec.wages,
    drinks: rec.drinks,
    tips: rec.tips,
    others: rec.others,
    status: 'current',
    weekId: 'week-current',
  };
}

function roundRm(n: number) {
  return Math.round(n * 100) / 100;
}

type SessionTimes = {
  closedShift: {
    checkedInAt: string;
    checkedOutAt: string;
  } | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
};

function timeRangeForRecord(rec: WeekPayRecord, session: SessionTimes | undefined): string {
  const matchClosed =
    session?.closedShift &&
    isoDateFromTimestamp(session.closedShift.checkedInAt) === rec.dateIso;
  if (matchClosed && session.closedShift) {
    return fmtShiftTimeRange(
      session.closedShift.checkedInAt,
      session.closedShift.checkedOutAt,
    );
  }
  if (
    session?.checkedInAt &&
    session.checkedOutAt &&
    isoDateFromTimestamp(session.checkedInAt) === rec.dateIso
  ) {
    return fmtShiftTimeRange(session.checkedInAt, session.checkedOutAt);
  }
  return 'Shift sealed · pending PV';
}

/**
 * Current payroll week comes from live check-outs (`weekRecords`);
 * older weeks stay on static demo history.
 */
export function mergeHistoryShiftsWithWeekPay(
  base: DemoHistoryShift[],
  records: WeekPayRecord[],
  session?: SessionTimes,
): DemoHistoryShift[] {
  const archived = base.filter((s) => s.weekId !== 'week-current');
  const live = records.map((rec) =>
    weekPayRecordToHistoryShift(rec, timeRangeForRecord(rec, session)),
  );
  return [...live, ...archived].sort((a, b) => b.dateIso.localeCompare(a.dateIso));
}

/**
 * Geofence copy shown on the Check-In screen. The number is display-only — the
 * REAL radius lives on `outlet.geo_fence_radius` and is enforced by the backend,
 * which recomputes the distance from the outlet's own pin. Never treat this
 * constant as the rule.
 *
 * GPS_BYPASS is now false: the app really reads the phone's position at
 * check-in. It stays as a constant only because the screen copy branches on it.
 * Do not set it back to true — the server blocks regardless, so bypassing here
 * would just turn a clear "you are 137 m away" into a generic failure.
 */
export const GEOFENCE_METERS = 50;
export const GPS_BYPASS = false;

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
export const SEED_PROFILE_IMAGE = '/img/pr/profile/vicky.png';

export type WeeklyDayPay = {
  day: string;
  date: number;
  dateIso: string;
  wages: number;
  drinks: number | null;
  tips: number | null;
  others: number | null;
  status: 'verified' | 'pending' | 'empty';
};

/** One sealed check-out day — feeds Payment → This week until PV issues Sunday. */
export type WeekPayRecord = {
  dateIso: string;
  outlet: string;
  wages: number;
  drinks: number;
  tips: number;
  others: number;
};

function emptyWeekSkeleton(weeksAgo: number, baseline = todayYmd()): WeeklyDayPay[] {
  const [y, m, d] = baseline;
  const sunday = new Date(y, m - 1, d);
  sunday.setDate(sunday.getDate() - sunday.getDay() - weeksAgo * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(sunday);
    dt.setDate(sunday.getDate() + i);
    return {
      day: DAY_NAMES[dt.getDay()].toUpperCase().slice(0, 3),
      date: dt.getDate(),
      dateIso: ymdToIso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()),
      wages: 0,
      drinks: null,
      tips: null,
      others: null,
      status: 'empty' as const,
    };
  });
}

/** Last-week payroll grid demo (matches proto Payment screenshot). */
export function buildLastWeekPayGrid(baseline = todayYmd()): WeeklyDayPay[] {
  const skeleton = emptyWeekSkeleton(1, baseline);
  const drinks = [125, 96, 109, 122, 98, 134, null] as const;
  const tips = [40, 35, 50, 28, 45, 55, null] as const;
  const others = [0, 15, 0, 0, 20, 0, null] as const;
  return skeleton.map((day, i) => {
    const hasShift = drinks[i] != null;
    return {
      ...day,
      wages: hasShift ? 334 : 0,
      drinks: drinks[i],
      tips: tips[i],
      others: others[i],
      status: hasShift ? 'verified' : 'empty',
    };
  });
}

/**
 * This-week grid from sealed check-outs only (matches proto: no seed rows
 * until PV issues next Sunday).
 */
export function buildThisWeekPayGrid(
  records: WeekPayRecord[],
  baseline = todayYmd(),
): WeeklyDayPay[] {
  const skeleton = emptyWeekSkeleton(0, baseline);
  const byIso = new Map(records.map((r) => [r.dateIso, r]));
  return skeleton.map((day) => {
    const rec = byIso.get(day.dateIso);
    if (!rec) return day;
    return {
      ...day,
      wages: rec.wages,
      drinks: rec.drinks,
      tips: rec.tips,
      others: rec.others,
      status: 'pending',
    };
  });
}

export function weekPayGridTotal(grid: WeeklyDayPay[]): number {
  return grid.reduce((sum, d) => {
    return (
      sum +
      d.wages +
      (d.drinks ?? 0) +
      (d.tips ?? 0) +
      (d.others ?? 0)
    );
  }, 0);
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

/** Next Sunday after the payroll week closes — PV issue day copy. */
export function weekPvIssueDayLabel(weeksAgo = 0, baseline = todayYmd()): string {
  const [y, m, d] = baseline;
  const sunday = new Date(y, m - 1, d);
  sunday.setDate(sunday.getDate() - sunday.getDay() - weeksAgo * 7);
  const issue = new Date(sunday);
  issue.setDate(sunday.getDate() + 7);
  return `${issue.getDate()} ${MONTH_NAMES[issue.getMonth()]}`;
}

function weekPvIssueDate(weeksAgo: number, baseline = todayYmd()): Date {
  const [y, m, d] = baseline;
  const sunday = new Date(y, m - 1, d);
  sunday.setDate(sunday.getDate() - sunday.getDay() - weeksAgo * 7);
  const issue = new Date(sunday);
  issue.setDate(sunday.getDate() + 7);
  return issue;
}

/**
 * Awaiting PR signature PV for last payroll week — same dates + net as Payment
 * → Last week grid (so History after sign matches Payment).
 */
export function getLastWeekAwaitingPv(baseline = todayYmd()): DemoPv {
  const grid = buildLastWeekPayGrid(baseline);
  const net = weekPayGridTotal(grid);
  const weekLabel = weekRangeLabel(1, baseline);
  const issue = weekPvIssueDate(1, baseline);
  const y = issue.getFullYear();
  const mm = String(issue.getMonth() + 1).padStart(2, '0');
  const dd = String(issue.getDate()).padStart(2, '0');
  const stamp = `${y}${mm}${dd}`;
  return {
    id: `pv-${stamp}`,
    ref: `PV-${stamp}`,
    outlet: 'Velvet 23',
    weekLabel,
    net,
    status: 'awaiting_pr',
    statusLabel: 'Awaiting your signature',
  };
}

/** All demo PVs including the live last-week awaiting voucher. */
export function allPaymentVouchers(baseline = todayYmd()): DemoPv[] {
  return [getLastWeekAwaitingPv(baseline), ...PAYMENT_VOUCHERS];
}

/** To-do — filled from real last-week PV via `useAwaitingLastWeekPv` (not demo). */
export const TODO_ITEMS: DemoTodo[] = [];

/** Notifications — PV-ready items come from `useAwaitingLastWeekPv` when a real PV exists. */
export const NOTIFICATIONS: DemoNotification[] = [];

export function isoDateFromTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return ymdToIso(...todayYmd());
  return ymdToIso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Upsert a sealed day into the week-pay list (one row per calendar day). */
export function upsertWeekPayRecord(
  records: WeekPayRecord[],
  next: WeekPayRecord,
): WeekPayRecord[] {
  const rest = records.filter((r) => r.dateIso !== next.dateIso);
  return [...rest, next].sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}
