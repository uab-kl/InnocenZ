/**
 * Velvet 23 demo week — single source for Reports + History (slides with live payroll week).
 */

import {
  addDaysToIso,
  getLiveTodayIso,
  getPayrollWeekSundayIso,
} from '@agency-portal/lib/demo-clock';
import { fmtDateLabelFromIso, fmtDtable } from '@agency-portal/lib/pr-demo';
import {
  sealShiftHistoryAmounts,
  sealedAmountsToHistoryFields,
} from '@agency-portal/lib/shift-history-amounts';
import type { ShiftHistoryRow } from '@agency-portal/lib/shift-history-utils';

export const VELVET_OUTLET_NAME = 'Velvet 23';
export const VELVET_AGENCY = 'Atlas Agency';

interface VelvetPrNight {
  prId: string;
  prName: string;
  payout: number;
  drinks: number;
  tips: number;
  tables?: number;
  durationHours: number;
}

interface VelvetNightShift {
  dateIso: string;
  dateDisplay: string;
  day: string;
  sales: number;
  prs: VelvetPrNight[];
}

/** Current demo week — drives Reports dashboard (2–8 Jun 2026). */
export const VELVET_WEEKLY_NIGHTS: VelvetNightShift[] = [
  {
    dateIso: '2026-06-02',
    dateDisplay: '2 Jun 2026',
    day: 'M',
    sales: 3_200,
    prs: [
      {
        prId: 'p1',
        prName: 'Vicky',
        payout: 480,
        drinks: 20,
        tips: 26,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-alice',
        prName: 'Alice',
        payout: 480,
        drinks: 18,
        tips: 22,
        durationHours: 8,
      },
    ],
  },
  {
    dateIso: '2026-06-03',
    dateDisplay: '3 Jun 2026',
    day: 'T',
    sales: 2_750,
    prs: [
      {
        prId: 'pr-comcard-charlotte',
        prName: 'Charlotte',
        payout: 480,
        drinks: 17,
        tips: 20,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-angie',
        prName: 'Angie',
        payout: 480,
        drinks: 15,
        tips: 18,
        durationHours: 8,
      },
    ],
  },
  {
    dateIso: '2026-06-04',
    dateDisplay: '4 Jun 2026',
    day: 'W',
    sales: 4_600,
    prs: [
      {
        prId: 'p1',
        prName: 'Vicky',
        payout: 480,
        drinks: 26,
        tips: 32,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-alice',
        prName: 'Alice',
        payout: 480,
        drinks: 24,
        tips: 28,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-charlotte',
        prName: 'Charlotte',
        payout: 480,
        drinks: 22,
        tips: 26,
        durationHours: 8,
      },
    ],
  },
  {
    dateIso: '2026-06-05',
    dateDisplay: '5 Jun 2026',
    day: 'T',
    sales: 5_350,
    prs: [
      {
        prId: 'p1',
        prName: 'Vicky',
        payout: 480,
        drinks: 30,
        tips: 36,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-alice',
        prName: 'Alice',
        payout: 480,
        drinks: 28,
        tips: 34,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-moon',
        prName: 'Moon',
        payout: 480,
        drinks: 24,
        tips: 30,
        durationHours: 8,
      },
    ],
  },
  {
    dateIso: '2026-06-06',
    dateDisplay: '6 Jun 2026',
    day: 'F',
    sales: 11_800,
    prs: [
      {
        prId: 'p1',
        prName: 'Vicky',
        payout: 480,
        drinks: 44,
        tips: 52,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-alice',
        prName: 'Alice',
        payout: 480,
        drinks: 40,
        tips: 48,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-charlotte',
        prName: 'Charlotte',
        payout: 480,
        drinks: 38,
        tips: 44,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-angie',
        prName: 'Angie',
        payout: 480,
        drinks: 34,
        tips: 40,
        durationHours: 8,
      },
    ],
  },
  {
    dateIso: '2026-06-07',
    dateDisplay: '7 Jun 2026',
    day: 'S',
    sales: 14_100,
    prs: [
      {
        prId: 'p1',
        prName: 'Vicky',
        payout: 540,
        drinks: 50,
        tips: 58,
        durationHours: 9,
      },
      {
        prId: 'pr-comcard-alice',
        prName: 'Alice',
        payout: 540,
        drinks: 46,
        tips: 54,
        durationHours: 9,
      },
      {
        prId: 'pr-comcard-charlotte',
        prName: 'Charlotte',
        payout: 540,
        drinks: 44,
        tips: 50,
        durationHours: 9,
      },
      {
        prId: 'pr-comcard-victoria',
        prName: 'Victoria',
        payout: 540,
        drinks: 40,
        tips: 46,
        durationHours: 9,
      },
    ],
  },
  {
    dateIso: '2026-06-08',
    dateDisplay: '8 Jun 2026',
    day: 'S',
    sales: 7_600,
    prs: [
      {
        prId: 'p1',
        prName: 'Vicky',
        payout: 480,
        drinks: 32,
        tips: 38,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-alice',
        prName: 'Alice',
        payout: 480,
        drinks: 30,
        tips: 36,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-charlotte',
        prName: 'Charlotte',
        payout: 480,
        drinks: 26,
        tips: 32,
        durationHours: 8,
      },
    ],
  },
];

/** Prior week — History only (26 May – 1 Jun 2026). */
export const VELVET_PRIOR_WEEK_NIGHTS: VelvetNightShift[] = [
  {
    dateIso: '2026-05-26',
    dateDisplay: '26 May 2026',
    day: 'M',
    sales: 2_850,
    prs: [
      {
        prId: 'p1',
        prName: 'Vicky',
        payout: 450,
        drinks: 16,
        tips: 22,
        durationHours: 7.5,
      },
      {
        prId: 'pr-comcard-angie',
        prName: 'Angie',
        payout: 450,
        drinks: 14,
        tips: 18,
        durationHours: 7.5,
      },
    ],
  },
  {
    dateIso: '2026-05-27',
    dateDisplay: '27 May 2026',
    day: 'T',
    sales: 2_400,
    prs: [
      {
        prId: 'pr-comcard-alice',
        prName: 'Alice',
        payout: 450,
        drinks: 13,
        tips: 16,
        durationHours: 7.5,
      },
      {
        prId: 'pr-comcard-moon',
        prName: 'Moon',
        payout: 450,
        drinks: 12,
        tips: 15,
        durationHours: 7.5,
      },
    ],
  },
  {
    dateIso: '2026-05-28',
    dateDisplay: '28 May 2026',
    day: 'W',
    sales: 3_900,
    prs: [
      {
        prId: 'p1',
        prName: 'Vicky',
        payout: 450,
        drinks: 22,
        tips: 28,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-charlotte',
        prName: 'Charlotte',
        payout: 450,
        drinks: 19,
        tips: 24,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-victoria',
        prName: 'Victoria',
        payout: 450,
        drinks: 17,
        tips: 20,
        durationHours: 8,
      },
    ],
  },
  {
    dateIso: '2026-05-29',
    dateDisplay: '29 May 2026',
    day: 'T',
    sales: 4_750,
    prs: [
      {
        prId: 'pr-comcard-alice',
        prName: 'Alice',
        payout: 450,
        drinks: 24,
        tips: 30,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-charlotte',
        prName: 'Charlotte',
        payout: 450,
        drinks: 21,
        tips: 26,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-angie',
        prName: 'Angie',
        payout: 450,
        drinks: 18,
        tips: 22,
        durationHours: 8,
      },
    ],
  },
  {
    dateIso: '2026-05-30',
    dateDisplay: '30 May 2026',
    day: 'F',
    sales: 10_200,
    prs: [
      {
        prId: 'p1',
        prName: 'Vicky',
        payout: 480,
        drinks: 38,
        tips: 46,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-alice',
        prName: 'Alice',
        payout: 480,
        drinks: 34,
        tips: 42,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-charlotte',
        prName: 'Charlotte',
        payout: 480,
        drinks: 32,
        tips: 38,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-moon',
        prName: 'Moon',
        payout: 480,
        drinks: 28,
        tips: 34,
        durationHours: 8,
      },
    ],
  },
  {
    dateIso: '2026-05-31',
    dateDisplay: '31 May 2026',
    day: 'S',
    sales: 12_400,
    prs: [
      {
        prId: 'p1',
        prName: 'Vicky',
        payout: 520,
        drinks: 44,
        tips: 52,
        durationHours: 8.5,
      },
      {
        prId: 'pr-comcard-alice',
        prName: 'Alice',
        payout: 520,
        drinks: 40,
        tips: 48,
        durationHours: 8.5,
      },
      {
        prId: 'pr-comcard-victoria',
        prName: 'Victoria',
        payout: 520,
        drinks: 36,
        tips: 42,
        durationHours: 8.5,
      },
      {
        prId: 'pr-comcard-angie',
        prName: 'Angie',
        payout: 520,
        drinks: 32,
        tips: 38,
        durationHours: 8.5,
      },
    ],
  },
  {
    dateIso: '2026-06-01',
    dateDisplay: '1 Jun 2026',
    day: 'S',
    sales: 6_800,
    prs: [
      {
        prId: 'pr-comcard-alice',
        prName: 'Alice',
        payout: 450,
        drinks: 26,
        tips: 32,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-charlotte',
        prName: 'Charlotte',
        payout: 450,
        drinks: 24,
        tips: 28,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-moon',
        prName: 'Moon',
        payout: 450,
        drinks: 20,
        tips: 24,
        durationHours: 8,
      },
    ],
  },
];

/** Two weeks back — lighter mid-month week (19–25 May 2026). */
export const VELVET_OLDER_WEEK_NIGHTS: VelvetNightShift[] = [
  {
    dateIso: '2026-05-19',
    dateDisplay: '19 May 2026',
    day: 'M',
    sales: 2_100,
    prs: [
      {
        prId: 'pr-comcard-charlotte',
        prName: 'Charlotte',
        payout: 420,
        drinks: 11,
        tips: 14,
        durationHours: 7,
      },
      {
        prId: 'pr-comcard-angie',
        prName: 'Angie',
        payout: 420,
        drinks: 10,
        tips: 12,
        durationHours: 7,
      },
    ],
  },
  {
    dateIso: '2026-05-20',
    dateDisplay: '20 May 2026',
    day: 'T',
    sales: 1_950,
    prs: [
      {
        prId: 'p1',
        prName: 'Vicky',
        payout: 420,
        drinks: 10,
        tips: 12,
        durationHours: 7,
      },
      {
        prId: 'pr-comcard-alice',
        prName: 'Alice',
        payout: 420,
        drinks: 9,
        tips: 11,
        durationHours: 7,
      },
    ],
  },
  {
    dateIso: '2026-05-21',
    dateDisplay: '21 May 2026',
    day: 'W',
    sales: 3_400,
    prs: [
      {
        prId: 'p1',
        prName: 'Vicky',
        payout: 420,
        drinks: 18,
        tips: 22,
        durationHours: 7.5,
      },
      {
        prId: 'pr-comcard-alice',
        prName: 'Alice',
        payout: 420,
        drinks: 16,
        tips: 20,
        durationHours: 7.5,
      },
      {
        prId: 'pr-comcard-moon',
        prName: 'Moon',
        payout: 420,
        drinks: 14,
        tips: 18,
        durationHours: 7.5,
      },
    ],
  },
  {
    dateIso: '2026-05-22',
    dateDisplay: '22 May 2026',
    day: 'T',
    sales: 4_100,
    prs: [
      {
        prId: 'pr-comcard-alice',
        prName: 'Alice',
        payout: 450,
        drinks: 20,
        tips: 24,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-charlotte',
        prName: 'Charlotte',
        payout: 450,
        drinks: 18,
        tips: 22,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-victoria',
        prName: 'Victoria',
        payout: 450,
        drinks: 15,
        tips: 18,
        durationHours: 8,
      },
    ],
  },
  {
    dateIso: '2026-05-23',
    dateDisplay: '23 May 2026',
    day: 'F',
    sales: 9_600,
    prs: [
      {
        prId: 'p1',
        prName: 'Vicky',
        payout: 480,
        drinks: 34,
        tips: 40,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-alice',
        prName: 'Alice',
        payout: 480,
        drinks: 30,
        tips: 36,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-charlotte',
        prName: 'Charlotte',
        payout: 480,
        drinks: 28,
        tips: 32,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-angie',
        prName: 'Angie',
        payout: 480,
        drinks: 24,
        tips: 28,
        durationHours: 8,
      },
    ],
  },
  {
    dateIso: '2026-05-24',
    dateDisplay: '24 May 2026',
    day: 'S',
    sales: 11_200,
    prs: [
      {
        prId: 'p1',
        prName: 'Vicky',
        payout: 500,
        drinks: 40,
        tips: 46,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-charlotte',
        prName: 'Charlotte',
        payout: 500,
        drinks: 36,
        tips: 42,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-victoria',
        prName: 'Victoria',
        payout: 500,
        drinks: 32,
        tips: 38,
        durationHours: 8,
      },
      {
        prId: 'pr-comcard-moon',
        prName: 'Moon',
        payout: 500,
        drinks: 28,
        tips: 34,
        durationHours: 8,
      },
    ],
  },
  {
    dateIso: '2026-05-25',
    dateDisplay: '25 May 2026',
    day: 'S',
    sales: 5_900,
    prs: [
      {
        prId: 'pr-comcard-alice',
        prName: 'Alice',
        payout: 420,
        drinks: 22,
        tips: 26,
        durationHours: 7.5,
      },
      {
        prId: 'pr-comcard-angie',
        prName: 'Angie',
        payout: 420,
        drinks: 18,
        tips: 22,
        durationHours: 7.5,
      },
      {
        prId: 'pr-comcard-moon',
        prName: 'Moon',
        payout: 420,
        drinks: 16,
        tips: 20,
        durationHours: 7.5,
      },
    ],
  },
];

function demoTablesForShift(
  night: VelvetNightShift,
  pr: VelvetPrNight,
): number {
  if (pr.tables != null) return pr.tables;
  const weekend = night.day === 'F' || night.day === 'S';
  if (night.sales >= 10_000) return pr.drinks >= 38 ? 3 : 2;
  if (night.sales >= 5_000 || weekend) return pr.drinks >= 24 ? 2 : 1;
  if (pr.drinks >= 16) return 1;
  return 0;
}

function nightsToShiftHistory(
  nights: VelvetNightShift[],
  weekSundayIso: string,
): ShiftHistoryRow[] {
  const todayIso = getLiveTodayIso();
  return nights.flatMap((night, index) => {
    const dateIso = addDaysToIso(weekSundayIso, index);
    if (dateIso > todayIso) return [];
    return night.prs.map((pr) => {
      const totalTables = demoTablesForShift(night, pr);
      const sealed = sealShiftHistoryAmounts({
        outlet: VELVET_OUTLET_NAME,
        drinkUnits: pr.drinks,
        tipSalesRm: pr.tips,
        tableUnits: totalTables,
        hoursWorked: pr.durationHours,
      });
      return {
        id: `vh-${dateIso}-${pr.prId}`,
        prName: pr.prName,
        prId: pr.prId,
        outlet: VELVET_OUTLET_NAME,
        agencyName: VELVET_AGENCY,
        dateDisplay: fmtDateLabelFromIso(dateIso),
        dateIso,
        ...sealedAmountsToHistoryFields(sealed),
        durationHours: pr.durationHours,
      };
    });
  });
}

export interface OutletWeeklyDaySales {
  day: string;
  dateIso: string;
  dateDisplay: string;
  sales: number;
  manpowerCost: number;
  shifts: number;
}

export interface OutletWeeklyReport {
  weekLabel: string;
  days: OutletWeeklyDaySales[];
  totalSales: number;
  totalCost: number;
  margin: number;
  shifts: number;
  avgTicket: number;
  wowGrowthPct: number;
  topPrs: { prId: string; name: string; earned: number }[];
}

/**
 * All Velvet outlet seed weeks for History + Reports.
 * To add a new week: implement `buildVelvetWeek2ShiftHistory()` and spread it here.
 * The store uses `mergeShiftHistory` so older rows are never removed on append.
 */
/** All Velvet history seed rows — prior weeks only (current week = live checkouts). */
export function buildAllVelvetSeedShiftHistory(): ShiftHistoryRow[] {
  const currentSun = getPayrollWeekSundayIso();
  return [
    ...nightsToShiftHistory(
      VELVET_PRIOR_WEEK_NIGHTS,
      addDaysToIso(currentSun, -7),
    ),
    ...nightsToShiftHistory(
      VELVET_OLDER_WEEK_NIGHTS,
      addDaysToIso(currentSun, -14),
    ),
  ];
}

export function buildVelvetWeekShiftHistory(): ShiftHistoryRow[] {
  return nightsToShiftHistory(VELVET_WEEKLY_NIGHTS, getPayrollWeekSundayIso());
}

/** Demo payroll weeks slide with the live Sun–Sat calendar (same as History / payroll). */
const VELVET_REPORT_WEEK_NIGHTS = [
  VELVET_WEEKLY_NIGHTS,
  VELVET_PRIOR_WEEK_NIGHTS,
  VELVET_OLDER_WEEK_NIGHTS,
] as const;

export function liveReportWeekSundayIso(
  weeksAgo = 0,
  fromIso = getLiveTodayIso(),
): string {
  return addDaysToIso(getPayrollWeekSundayIso(fromIso), -7 * weeksAgo);
}

export function getVelvetReportWeekOptions(
  fromIso = getLiveTodayIso(),
): OutletReportWeekOption[] {
  return VELVET_REPORT_WEEK_NIGHTS.map((nights, weeksAgo) =>
    makeReportWeekOption(liveReportWeekSundayIso(weeksAgo, fromIso), nights),
  );
}

/** @deprecated use getVelvetReportWeekOptions() — weeks follow live calendar */
export const VELVET_REPORT_WEEK_OPTIONS: OutletReportWeekOption[] =
  getVelvetReportWeekOptions();

const NIGHTCLUB_DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

function nightclubDayLetter(dateIso: string): string {
  const dow = new Date(`${dateIso}T12:00:00`).getDay();
  return NIGHTCLUB_DAY_LETTERS[dow] ?? 'M';
}

/** Sun–Sat label for a payroll week (e.g. "31 May – 6 Jun 2026"). */
export function payrollWeekRangeLabel(weekSundayIso: string): string {
  const endIso = addDaysToIso(weekSundayIso, 6);
  const [sy, sm, sd] = weekSundayIso.split('-').map(Number);
  const [ey, em, ed] = endIso.split('-').map(Number);
  const year = sy;
  if (sm === em) {
    return `${sd}–${fmtDtable(ey, em, ed)} ${year}`;
  }
  return `${fmtDtable(sy, sm, sd)} – ${fmtDtable(ey, em, ed)} ${year}`;
}

/**
 * Map seed nights onto Sun–Sat slots (index 0 = Sunday) — matches History shift rows.
 * Seed dateIso values are legacy; display dates follow payroll week boundaries.
 */
export function mapNightsToPayrollWeek(
  weekSundayIso: string,
  nights: VelvetNightShift[],
): VelvetNightShift[] {
  return nights.map((night, index) => {
    const dateIso = addDaysToIso(weekSundayIso, index);
    return {
      ...night,
      dateIso,
      dateDisplay: fmtDateLabelFromIso(dateIso),
      day: nightclubDayLetter(dateIso),
    };
  });
}

function makeReportWeekOption(
  weekSundayIso: string,
  nights: VelvetNightShift[],
): OutletReportWeekOption {
  return {
    weekSundayIso,
    weekEndIso: addDaysToIso(weekSundayIso, 6),
    label: payrollWeekRangeLabel(weekSundayIso),
    nights,
  };
}

export interface OutletReportWeekOption {
  weekSundayIso: string;
  weekEndIso: string;
  label: string;
  nights: VelvetNightShift[];
}

export const ALL_VELVET_NIGHTS: VelvetNightShift[] = [
  ...VELVET_OLDER_WEEK_NIGHTS,
  ...VELVET_PRIOR_WEEK_NIGHTS,
  ...VELVET_WEEKLY_NIGHTS,
].sort((a, b) => a.dateIso.localeCompare(b.dateIso));

export function velvetReportDateBounds(): { minIso: string; maxIso: string } {
  return {
    minIso: liveReportWeekSundayIso(2),
    maxIso: addDaysToIso(getPayrollWeekSundayIso(), 6),
  };
}

function nightsInRange(startIso: string, endIso: string): VelvetNightShift[] {
  return mappedVelvetReportNights().filter(
    (n) => n.dateIso >= startIso && n.dateIso <= endIso,
  );
}

/** Payroll-calendar nights for all demo report weeks (Sun–Sat mapped). */
export function mappedVelvetReportNights(): VelvetNightShift[] {
  return getVelvetReportWeekOptions().flatMap((week) =>
    mapNightsToPayrollWeek(week.weekSundayIso, week.nights),
  );
}

/** Future nights are not sealed yet — keep the week grid but zero earnings. */
function sealNightsThroughToday(
  nights: VelvetNightShift[],
  todayIso = getLiveTodayIso(),
): VelvetNightShift[] {
  return nights.map((night) =>
    night.dateIso > todayIso ? { ...night, sales: 0, prs: [] } : night,
  );
}

function buildReportFromNights(
  nights: VelvetNightShift[],
  periodLabel: string,
  priorNights: VelvetNightShift[] = [],
): OutletWeeklyReport {
  const sealed = sealNightsThroughToday(nights);
  const days: OutletWeeklyDaySales[] = sealed.map((night) => ({
    day: night.day,
    dateIso: night.dateIso,
    dateDisplay: night.dateDisplay,
    sales: night.sales,
    manpowerCost: night.prs.reduce((a, pr) => a + pr.payout, 0),
    shifts: 1,
  }));

  const totalSales = days.reduce((a, d) => a + d.sales, 0);
  const totalCost = days.reduce((a, d) => a + d.manpowerCost, 0);
  const margin = totalSales - totalCost;

  const prEarned = new Map<string, { name: string; earned: number }>();
  for (const night of sealed) {
    for (const pr of night.prs) {
      const earned = sealShiftHistoryAmounts({
        outlet: VELVET_OUTLET_NAME,
        drinkUnits: pr.drinks,
        tipSalesRm: pr.tips,
        tableUnits: demoTablesForShift(night, pr),
        hoursWorked: pr.durationHours,
      }).totalPayout;
      const cur = prEarned.get(pr.prId) ?? { name: pr.prName, earned: 0 };
      prEarned.set(pr.prId, { name: pr.prName, earned: cur.earned + earned });
    }
  }

  const topPrs = [...prEarned.entries()]
    .map(([prId, p]) => ({ prId, name: p.name, earned: p.earned }))
    .sort((a, b) => b.earned - a.earned)
    .slice(0, 5);

  const priorSales = priorNights.reduce((a, n) => a + n.sales, 0);
  const priorCost = priorNights.reduce(
    (a, n) => a + n.prs.reduce((s, pr) => s + pr.payout, 0),
    0,
  );
  const priorMargin = priorSales - priorCost;
  const wowGrowthPct =
    priorMargin > 0
      ? Math.round(((margin - priorMargin) / priorMargin) * 100)
      : margin > 0
        ? 100
        : 0;

  const drinkUnits = sealed.reduce(
    (a, n) => a + n.prs.reduce((s, pr) => s + pr.drinks, 0),
    0,
  );
  const sealedShiftNights = sealed.filter(
    (n) => n.prs.length > 0 || n.sales > 0,
  );

  return {
    weekLabel: periodLabel,
    days,
    totalSales,
    totalCost,
    margin,
    shifts: sealedShiftNights.length,
    avgTicket: drinkUnits > 0 ? Math.round(totalSales / drinkUnits) : 0,
    wowGrowthPct,
    topPrs,
  };
}

export function getOutletReportForWeek(
  outletName: string,
  weekSundayIso: string,
): OutletWeeklyReport | null {
  if (outletName !== VELVET_OUTLET_NAME) return null;
  const options = getVelvetReportWeekOptions();
  const idx = options.findIndex((w) => w.weekSundayIso === weekSundayIso);
  const week = options[idx];
  if (!week) return null;
  const mapped = mapNightsToPayrollWeek(week.weekSundayIso, week.nights);
  const priorWeek = idx >= 0 ? options[idx + 1] : undefined;
  const priorMapped = priorWeek
    ? mapNightsToPayrollWeek(priorWeek.weekSundayIso, priorWeek.nights)
    : [];
  return buildReportFromNights(
    mapped,
    payrollWeekRangeLabel(week.weekSundayIso),
    priorMapped,
  );
}

export function getOutletReportForDateRange(
  outletName: string,
  startIso: string,
  endIso: string,
): OutletWeeklyReport | null {
  if (outletName !== VELVET_OUTLET_NAME) return null;
  const nights = nightsInRange(startIso, endIso);
  if (nights.length === 0) return null;

  const spanDays =
    Math.round(
      (new Date(`${endIso}T12:00:00`).getTime() -
        new Date(`${startIso}T12:00:00`).getTime()) /
        86400000,
    ) + 1;
  const priorEnd = addDaysToIso(startIso, -1);
  const priorStart = addDaysToIso(startIso, -spanDays);
  const priorNights = nightsInRange(priorStart, priorEnd);

  const startLabel = nights[0]!.dateDisplay.replace(/ \d{4}$/, '');
  const endLabel = nights[nights.length - 1]!.dateDisplay;
  const periodLabel =
    startIso === endIso
      ? nights[0]!.dateDisplay
      : `${startLabel} – ${endLabel}`;

  return buildReportFromNights(nights, periodLabel, priorNights);
}

export function getOutletReportForDates(
  outletName: string,
  dateIsos: string[],
): OutletWeeklyReport | null {
  if (outletName !== VELVET_OUTLET_NAME || dateIsos.length === 0) return null;
  const sorted = [...dateIsos].sort();
  const isoSet = new Set(sorted);
  const nights = mappedVelvetReportNights()
    .filter((n) => isoSet.has(n.dateIso))
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  if (nights.length === 0) return null;

  const startIso = sorted[0]!;
  const endIso = sorted[sorted.length - 1]!;
  const spanDays =
    Math.round(
      (new Date(`${endIso}T12:00:00`).getTime() -
        new Date(`${startIso}T12:00:00`).getTime()) /
        86400000,
    ) + 1;
  const priorEnd = addDaysToIso(startIso, -1);
  const priorStart = addDaysToIso(startIso, -spanDays);
  const priorNights = nightsInRange(priorStart, priorEnd);

  const periodLabel =
    sorted.length === 1
      ? nights[0]!.dateDisplay
      : `${nights[0]!.dateDisplay.replace(/ \d{4}$/, '')} – ${nights[nights.length - 1]!.dateDisplay.replace(/^.* /, '')} · ${sorted.length} nights`;

  return buildReportFromNights(nights, periodLabel, priorNights);
}

export function getOutletWeeklyReport(
  outletName: string,
): OutletWeeklyReport | null {
  const current = getVelvetReportWeekOptions()[0];
  if (!current) return null;
  return getOutletReportForWeek(outletName, current.weekSundayIso);
}
