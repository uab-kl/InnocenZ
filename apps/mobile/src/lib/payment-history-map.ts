/**
 * Map backend payment_voucher history → History UI shapes.
 * Source of truth is the DB — no demo seed weeks/amounts.
 */
import type { PrHistoryVoucher, PrReceiptLine } from './api';
import type { HistPayLine, HistPayStatus, HistPayWeek } from './demo-payment-history';
import {
  DAY_NAMES,
  MONTH_NAMES,
  fmtDFriendly,
  isoToYmd,
  type DemoHistoryShift,
  type DemoHistoryWeek,
} from './demo-shifts';

const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));

function asIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  // Handles both "YYYY-MM-DD" and ISO timestamps from drivers.
  const m = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return m?.[1] ?? null;
}

function formatRangeLabel(weekStart: string | null, weekEnd: string | null): string {
  const start = asIsoDate(weekStart);
  const end = asIsoDate(weekEnd);
  if (!start || !end) return 'Payroll week';
  const [, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const left = `${String(sd).padStart(2, '0')} ${MONTH_SHORT[sm - 1]}`;
  const right = `${String(ed).padStart(2, '0')} ${MONTH_SHORT[em - 1]} ${ey}`;
  return `${left} – ${right}`;
}

/**
 * The voucher's number.
 *
 * `voucherNo` is the stored one (migration 0075) and is what the paper voucher
 * prints. The week-derived form below is a FALLBACK for rows that predate the
 * column — it was the only behaviour until 30 Jul 2026, and it gave every PR's
 * voucher for a week the same number.
 */
function pvRefForWeek(
  weekEnd: string | null,
  voucherId: string,
  voucherNo?: string | null,
): string {
  if (voucherNo) return voucherNo;
  const end = asIsoDate(weekEnd);
  if (!end) return `PV-${voucherId.slice(0, 8).toUpperCase()}`;
  const [y, m, d] = end.split('-');
  return `PV-${y}-${m}${d}`;
}

function issuedLabel(v: PrHistoryVoucher): string {
  const iso = asIsoDate(v.issuedDate) ?? asIsoDate(v.prSignedAt) ?? asIsoDate(v.paidAt);
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTH_SHORT[m - 1]} ${y}`;
}

/**
 * The PR-facing badge for a voucher, from its REAL status.
 *
 * Never infers a signature. `signed` is reported only when the voucher actually
 * says so — a `pending_review`, `sent` or `disputed` week is 'pending', because
 * signing is the action the PR still has to take and a screen that has already
 * ticked it off removes the reason to look.
 */
function payStatus(v: PrHistoryVoucher): HistPayStatus {
  if (v.status === 'paid') return 'paid';
  if (v.status === 'signed' || v.prSignedAt) return 'signed';
  return 'pending';
}

/** The line under the badge — what actually happened, and whose move it is. */
function statusMeta(v: PrHistoryVoucher): string {
  if (v.status === 'paid') {
    const when = asIsoDate(v.paidAt);
    return when ? `Paid ${issuedLabel({ ...v, issuedDate: when })}` : 'Paid';
  }
  if (payStatus(v) === 'signed') {
    const when = asIsoDate(v.prSignedAt);
    return when ? `Signed ${issuedLabel({ ...v, issuedDate: when })}` : 'Signed';
  }
  // Two different waits, and the PR can only act on one of them.
  if (v.status === 'disputed') return 'Disputed — waiting on your agency';
  if (v.status === 'sent') return 'Waiting for your signature';
  return 'Waiting for your agency to issue';
}

/** Short aggregate label — "(2)-outlet" instead of the long "Multi-outlet (2)". */
function outletLabel(v: PrHistoryVoucher): string {
  if (v.outlet) return v.outlet;
  const names = [
    ...new Set(v.lines.map((l) => l.outlet?.trim()).filter(Boolean) as string[]),
  ];
  if (names.length === 1) return names[0]!;
  if (names.length > 1) return `(${names.length})-outlet`;
  return 'Outlet';
}

function lineTypeLabel(kind: PrReceiptLine['kind']): string {
  if (kind === 'wages') return 'Daily wages';
  if (kind === 'drinks') return 'Drinks commission';
  if (kind === 'tips') return 'Tips commission';
  return 'Others';
}

function toHistPayLines(lines: PrReceiptLine[]): HistPayLine[] {
  return lines
    .filter((l) => l.lineDate && l.commission > 0)
    .map((l) => {
      const iso = asIsoDate(l.lineDate)!;
      const [y, m, d] = isoToYmd(iso);
      return {
        date: `${String(d).padStart(2, '0')} ${MONTH_SHORT[m - 1]}`,
        day: DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()],
        type: lineTypeLabel(l.kind),
        outlet: l.outlet ?? 'Outlet',
        amount: l.commission,
      };
    });
}

/** Unique shift-days from wage/drink/tip/other lines (one per calendar day). */
function countShifts(lines: PrReceiptLine[]): number {
  const keys = new Set<string>();
  for (const l of lines) {
    const iso = asIsoDate(l.lineDate);
    if (!iso || l.commission <= 0) continue;
    keys.add(iso);
  }
  return keys.size;
}

export function historyVoucherToPayWeek(v: PrHistoryVoucher): HistPayWeek {
  const lines = toHistPayLines(v.lines);
  const wages = Number(v.wages) || lines.filter((l) => /wage/i.test(l.type)).reduce((s, l) => s + l.amount, 0);
  const net = Number(v.net) || lines.reduce((s, l) => s + l.amount, 0);
  const commission = Math.round((net - wages) * 100) / 100;
  const status = payStatus(v);
  return {
    id: v.voucherId,
    ref: pvRefForWeek(v.weekEnd, v.voucherId, v.voucherNo),
    weekLabel: formatRangeLabel(v.weekStart, v.weekEnd),
    // Carried through so a two-voucher week is separable on the history list —
    // the week label and the venue are identical on both rows.
    agencyName: v.agencyName ?? null,
    outlet: outletLabel(v),
    shifts: countShifts(v.lines) || Math.max(1, new Set(lines.map((l) => l.date)).size),
    issued: issuedLabel(v),
    status,
    statusMeta: statusMeta(v),
    net: Math.round(net * 100) / 100,
    wages: Math.round(wages * 100) / 100,
    commission: Math.max(0, commission),
    bankRef: v.bankRef ?? undefined,
    lines,
  };
}

export function historyVoucherToHistoryWeek(v: PrHistoryVoucher): DemoHistoryWeek {
  const range = formatRangeLabel(v.weekStart, v.weekEnd);
  return {
    /*
     * ⚠️ KEYED ON THE VOUCHER, NOT THE WEEK.
     *
     * This was `week-${weekStart}`. A PR on two rosters gets one voucher PER
     * AGENCY for the same week, so both rows collapsed onto one id — duplicate
     * React keys, and the expand/collapse state (which is keyed on this) toggled
     * BOTH cards at once. The week still LABELS the card; the id has to be able
     * to tell two vouchers apart.
     */
    id: `week-${asIsoDate(v.weekStart) ?? 'na'}-${v.voucherId}`,
    // The agency leads the title when we know it: two cards for one week are
    // otherwise identical down to the venue, with only the PV number differing.
    title: v.agencyName
      ? `PAYROLL WEEK · ${range} · ${v.agencyName}`
      : `PAYROLL WEEK · ${range}`,
    kind: 'payroll',
    weekLabel: range,
    pvRef: pvRefForWeek(v.weekEnd, v.voucherId, v.voucherNo),
  };
}

/** One History → Shifts card per calendar day from voucher lines (matches Payment). */
export function historyVoucherToShifts(v: PrHistoryVoucher, weekId: string): DemoHistoryShift[] {
  const byDate = new Map<
    string,
    {
      outlets: Set<string>;
      wagesOutlet: string | null;
      wages: number;
      drinks: number;
      tips: number;
      others: number;
    }
  >();
  for (const l of v.lines) {
    const dateIso = asIsoDate(l.lineDate);
    if (!dateIso || l.commission <= 0) continue;
    const outlet = l.outlet?.trim() || 'Outlet';
    const rec =
      byDate.get(dateIso) ??
      { outlets: new Set(), wagesOutlet: null, wages: 0, drinks: 0, tips: 0, others: 0 };
    rec.outlets.add(outlet);
    if (l.kind === 'wages') {
      rec.wages += l.commission;
      if (!rec.wagesOutlet) rec.wagesOutlet = outlet;
    } else if (l.kind === 'drinks') rec.drinks += l.commission;
    else if (l.kind === 'tips') rec.tips += l.commission;
    else rec.others += l.commission;
    byDate.set(dateIso, rec);
  }

  // 'sealed' is a statement about the SHIFT — check-out fixed its money — and is
  // true whether or not the voucher has been signed. Only a genuinely signed
  // voucher gets 'signed', so the Shifts filter cannot claim a signature the PR
  // never gave; the caption below says which of the two sealed cases it is.
  const payStatus = historyVoucherToPayWeek(v).status;
  const status: DemoHistoryShift['status'] = payStatus === 'signed' ? 'signed' : 'sealed';
  const timeLabel =
    payStatus === 'paid'
      ? 'Paid · sealed'
      : payStatus === 'signed'
        ? 'Sealed · signed PV'
        : 'Sealed · PV not signed yet';
  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateIso, b]) => {
      const [y, m, d] = isoToYmd(dateIso);
      const names = [...b.outlets];
      const outlet =
        b.wagesOutlet ??
        (names.length === 1 ? names[0]! : names.length > 1 ? names.join(' · ') : 'Outlet');
      const payout = Math.round((b.wages + b.drinks + b.tips + b.others) * 100) / 100;
      return {
        id: `pv-${v.voucherId}-${dateIso}`,
        outlet,
        dateLabel: fmtDFriendly(y, m, d),
        dateIso,
        time: timeLabel,
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

export function currentWeekHistoryMeta(weekStart: string, weekEnd: string): DemoHistoryWeek {
  const range = formatRangeLabel(weekStart, weekEnd);
  return {
    id: 'week-current',
    title: `CURRENT WEEK · ${range}`,
    kind: 'current',
    weekLabel: range,
    pvRef: 'PV pending Sunday',
  };
}
