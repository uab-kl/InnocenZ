/**
 * Map backend payment_voucher history → History UI shapes.
 * Source of truth is the DB — no demo seed weeks/amounts.
 */
import { formatMessage, type AppTranslations } from '../i18n';
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

/**
 * The RENDER-side twin of `statusMeta` above — call it where the string is
 * drawn, never where it is built.
 *
 * `statusMeta` stays English at BOTH producers on purpose. A week signed on the
 * phone is PERSISTED as this string by `signed-pv.tsx` and then regex-migrated
 * on read by `normalizeHistPayWeek`, so translating it at the source would bake
 * one locale into storage and leave the migration unable to recognise its own
 * rows. This parses the stored English back into its parts and rebuilds the
 * sentence in the active locale instead. An unrecognised string — an older
 * stored wording — falls through unchanged rather than rendering blank.
 *
 * The date/time tail is passed through as it stands: it is the same "5 Aug 2026"
 * form the card already prints beside it for `issued`.
 */
export function localizePayStatusMeta(meta: string, t: AppTranslations): string {
  const trimmed = (meta ?? '').trim();
  if (!trimmed) return trimmed;
  if (trimmed === 'Disputed — waiting on your agency') return t.payHistory.metaDisputed;
  if (trimmed === 'Waiting for your signature') return t.payHistory.metaAwaitingSignature;
  if (trimmed === 'Waiting for your agency to issue') return t.payHistory.metaAwaitingIssue;
  const paid = /^Paid(?:\s+(.+))?$/.exec(trimmed);
  if (paid) {
    return paid[1]
      ? formatMessage(t.payHistory.metaPaidOn, { when: paid[1] })
      : t.payHistory.statusPaid;
  }
  const signed = /^Signed(?:\s+(.+))?$/.exec(trimmed);
  if (signed) {
    return signed[1]
      ? formatMessage(t.payHistory.metaSignedOn, { when: signed[1] })
      : t.payHistory.statusSigned;
  }
  return trimmed;
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

/**
 * Render-side label for the aggregate form of `outletLabel`.
 *
 * The STORED value keeps its `(2)-outlet` shape: it is compared against the
 * outlet filter, and `paymentHistoryOutlets` recognises it by that exact form to
 * keep the aggregate out of the outlet dropdown. A real venue name is a name and
 * passes straight through.
 */
export function localizePayOutlet(outlet: string, t: AppTranslations): string {
  const aggregate = /^\((\d+)\)-outlet$/.exec(outlet ?? '');
  return aggregate
    ? formatMessage(t.payHistory.multiOutlet, { n: aggregate[1]! })
    : outlet;
}

function lineTypeLabel(kind: PrReceiptLine['kind']): string {
  if (kind === 'wages') return 'Daily wages';
  if (kind === 'drinks') return 'Drinks commission';
  if (kind === 'tips') return 'Tips commission';
  return 'Others';
}

/**
 * Render-side label for a stored line `type`.
 *
 * `HistPayLine.type` is DATA once written: `normalizeHistPayWeek` and
 * `historyShiftsFromPayWeek` split wages from commission by testing this string,
 * and a signed week carries it into localStorage. So the stored value stays
 * English and the match here mirrors those same tests.
 */
export function localizePayLineType(type: string, t: AppTranslations): string {
  const kind = (type ?? '').toLowerCase();
  if (kind.includes('wage')) return t.payHistory.lineWages;
  if (kind.includes('drink')) return t.payHistory.lineDrinks;
  if (kind.includes('tip')) return t.payHistory.lineTips;
  if (kind === 'others') return t.payHistory.lineOthers;
  return type;
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
    /*
     * Only a SENT voucher is signable, and only while it is still unsigned.
     *
     * `sent` is the one status meaning the agency has finished with it and
     * handed it over. `pending_review` is still on the agency's desk and
     * `disputed` is waiting on them too — the PR's move on both is to wait.
     * The `prSignedAt` guard covers the gap where a row still reads `sent`
     * but a signature has already landed on it.
     */
    canSign: v.status === 'sent' && !v.prSignedAt,
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
export function historyVoucherToShifts(
  v: PrHistoryVoucher,
  weekId: string,
  /** LAST and with no default — a default would pin English for every caller. */
  t: AppTranslations,
): DemoHistoryShift[] {
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
  // Rendered copy, not data: it fills the History card's TIME slot, exactly
  // where a live week shows `t.schedule.sealedPendingPv`. Nothing compares or
  // stores it — the `payStatus` it is chosen by is the value, and that stays.
  const timeLabel =
    payStatus === 'paid'
      ? t.payHistory.shiftPaidSealed
      : payStatus === 'signed'
        ? t.payHistory.shiftSealedSignedPv
        : t.payHistory.shiftSealedPvUnsigned;
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
        dateLabel: fmtDFriendly(y, m, d, t),
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
