/**
 * Keep History → Shifts aligned with History → Payment (same PV / week totals).
 */
import type { HistPayWeek } from './demo-payment-history';
import {
  HISTORY_WEEKS,
  fmtDFriendly,
  isoToYmd,
  mergeHistoryShiftsWithWeekPay,
  weekRangeLabel,
  ymdToIso,
  type DemoHistoryShift,
  type DemoHistoryWeek,
  type WeekPayRecord,
} from './demo-shifts';

const PV_MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

type SessionTimes = {
  closedShift: { checkedInAt: string; checkedOutAt: string } | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
};

function yearFromWeekLabel(weekLabel: string): number {
  const m = weekLabel.match(/\d{4}/);
  return m ? parseInt(m[0], 10) : 2026;
}

function lineDateToIso(lineDate: string, year: number): string {
  const m = lineDate.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})/);
  if (!m) return '';
  const month = PV_MONTHS[m[2]!.slice(0, 3).toLowerCase()];
  if (!month) return '';
  return ymdToIso(year, month, parseInt(m[1]!, 10));
}

function normalizeLabel(label: string): string {
  return label
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function weekLabelsMatch(a: string, b: string): boolean {
  const na = normalizeLabel(a);
  const nb = normalizeLabel(b);
  if (na === nb) return true;
  const digits = (s: string) => s.replace(/\D/g, '');
  return digits(na) === digits(nb) && digits(na).length >= 6;
}

function refDigits(ref: string): string {
  return ref.replace(/[^0-9a-z]/gi, '').toLowerCase();
}

export function matchPayWeekForHistoryWeek(
  hw: DemoHistoryWeek,
  payWeeks: HistPayWeek[],
): HistPayWeek | undefined {
  if (hw.kind === 'current') return undefined;

  if (hw.pvRef && hw.pvRef !== 'PV pending Sunday') {
    const want = refDigits(hw.pvRef);
    const byRef = payWeeks.find((pw) => {
      const got = refDigits(pw.ref);
      return got === want || got.includes(want) || want.includes(got);
    });
    if (byRef) return byRef;
  }

  const weeksAgo = historyWeekWeeksAgo(hw);
  if (weeksAgo != null) {
    const target = weekRangeLabel(weeksAgo);
    const byRange = payWeeks.find((pw) => weekLabelsMatch(pw.weekLabel, target));
    if (byRange) return byRange;
  }

  return payWeeks.find((pw) => weekLabelsMatch(pw.weekLabel, hw.weekLabel));
}

function historyWeekWeeksAgo(hw: DemoHistoryWeek): number | null {
  const idx = HISTORY_WEEKS.findIndex((w) => w.id === hw.id);
  if (idx < 0) return null;
  if (hw.kind === 'current') return 0;
  return idx - 1;
}

export function historyShiftsFromPayWeek(
  week: HistPayWeek,
  weekId: string,
): DemoHistoryShift[] {
  const year = yearFromWeekLabel(week.weekLabel);
  const status: DemoHistoryShift['status'] =
    week.status === 'paid' ? 'sealed' : 'signed';

  const byDate = new Map<
    string,
    { outlet: string; wages: number; drinks: number; tips: number; others: number }
  >();

  for (const line of week.lines) {
    if (line.debit) continue;
    const dateIso = lineDateToIso(line.date, year);
    if (!dateIso) continue;
    const bucket = byDate.get(dateIso) ?? {
      outlet: line.outlet,
      wages: 0,
      drinks: 0,
      tips: 0,
      others: 0,
    };
    const t = line.type.toLowerCase();
    if (t.includes('wage')) bucket.wages += line.amount;
    else if (t.includes('drink')) bucket.drinks += line.amount;
    else if (t.includes('tip')) bucket.tips += line.amount;
    else bucket.others += line.amount;
    byDate.set(dateIso, bucket);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateIso, b]) => {
      const [y, m, d] = isoToYmd(dateIso);
      const payout = Math.round((b.wages + b.drinks + b.tips + b.others) * 100) / 100;
      return {
        id: `pv-${week.id}-${dateIso}`,
        outlet: b.outlet,
        dateLabel: fmtDFriendly(y, m, d),
        dateIso,
        time: 'Per PV week breakdown',
        payout,
        wages: b.wages,
        drinks: b.drinks,
        tips: b.tips,
        others: b.others,
        status,
        weekId,
      };
    });
}

/** Current week from check-out; payroll weeks from signed/paid PVs when available. */
export function mergeHistoryShiftsWithPaymentWeeks(
  base: DemoHistoryShift[],
  records: WeekPayRecord[],
  session: SessionTimes | undefined,
  payWeeks: HistPayWeek[],
): DemoHistoryShift[] {
  let merged = mergeHistoryShiftsWithWeekPay(base, records, session);

  const replaceIds = new Set<string>();
  const pvShifts: DemoHistoryShift[] = [];

  for (const hw of HISTORY_WEEKS) {
    if (hw.kind === 'current') continue;
    const pw = matchPayWeekForHistoryWeek(hw, payWeeks);
    if (!pw) continue;
    replaceIds.add(hw.id);
    pvShifts.push(...historyShiftsFromPayWeek(normalizeHistPayWeek(pw), hw.id));
  }

  merged = merged.filter((s) => !replaceIds.has(s.weekId));
  merged = [...merged, ...pvShifts];
  return merged.sort((a, b) => b.dateIso.localeCompare(a.dateIso));
}

export function payWeekTotalsForHistoryWeek(
  hw: DemoHistoryWeek,
  payWeeks: HistPayWeek[],
): { net: number; wages: number; shifts: number } | null {
  const pw = matchPayWeekForHistoryWeek(hw, payWeeks);
  if (!pw) return null;
  const normalized = normalizeHistPayWeek(pw);
  return { net: normalized.net, wages: normalized.wages, shifts: normalized.shifts };
}

/** Recompute net / wages / commission from line items (fixes stale localStorage PVs). */
export function normalizeHistPayWeek(w: HistPayWeek): HistPayWeek {
  let wages = 0;
  let commission = 0;
  let debits = 0;
  for (const line of w.lines) {
    if (line.debit) {
      debits += line.amount;
      continue;
    }
    const t = line.type.toLowerCase();
    if (t.includes('wage')) wages += line.amount;
    else commission += line.amount;
  }
  const net = Math.round((wages + commission - debits) * 100) / 100;
  wages = Math.round(wages * 100) / 100;
  commission = Math.round(commission * 100) / 100;
  // Migrate labels signed under the old copy (stored PVs keep their strings).
  const outlet = (w.outlet ?? '').replace(/^Multi-outlet \((\d+)\)$/, '($1)-outlet');
  const statusMeta = (w.statusMeta ?? '')
    .replace(/ · Awaiting bank transfer$/, '')
    .replace(/^(Signed \d{1,2} \w{3} \d{4} · \d{2}:\d{2}).*$/, '$1');
  if (
    Math.abs(net - w.net) > 0.02 ||
    Math.abs(wages - w.wages) > 0.02 ||
    Math.abs(commission - w.commission) > 0.02 ||
    outlet !== w.outlet ||
    statusMeta !== w.statusMeta
  ) {
    return { ...w, net, wages, commission, outlet, statusMeta };
  }
  return w;
}
