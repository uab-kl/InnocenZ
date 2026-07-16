import type { AgencyManagedPR } from '@agency-portal/lib/agency-demo';
import type {
  AgencyCollectionInvoice,
  CollectionLineGroup,
  CollectionLineItem,
} from '@agency-portal/lib/agency-demo';
import { buildReceiptScansFromPaymentVouchers } from '@agency-portal/lib/history-demo-sync';
import { pvRowDateToIso } from '@agency-portal/lib/pr-payment-history';
import type {
  PrPaymentVoucher,
  PrReceiptScan,
} from '@agency-portal/lib/pr-demo';
import {
  DEMO_PV_ISSUED_WEEKS_AGO,
  fmtDateLabelFromIso,
  getPvNetTotal,
  isLegacyReceiptScanIdentity,
  pvPayByDeadlineMsFromIssued,
  formatPvPayByDeadlineShort,
  pvStatusLabel,
  RECEIPT_COMMISSION_RULES,
  type PrProfile,
  type PrPvStatus,
} from '@agency-portal/lib/pr-demo';
import {
  dedupeShiftHistorySlots,
  sortShiftHistoryDesc,
  SHIFT_HISTORY_FALLBACK_PER_DRINK_RM,
  type ShiftHistoryRow,
} from '@agency-portal/lib/shift-history-utils';

const PV_COMMISSION_SCAN_PREFIX = 'rc-pv-';
const PAYROLL_SHIFT_ROW_PREFIX = 'ap-shift-';
const PAYROLL_RECEIPT_WEEKS_AGO = new Set([0, 1]);
const PAYROLL_AGENCY_NAME = 'Atlas Agency';

function agencyPrReceiptCode(pr: AgencyManagedPR): string {
  const digits = pr.id.replace(/\D/g, '').slice(0, 4);
  return `PR-${digits.padStart(4, '0') || '0099'}`;
}

function agencyPrReceiptProfile(pr: AgencyManagedPR): PrProfile {
  return {
    name: pr.name,
    first: pr.icName?.trim() || pr.name,
    ic: pr.ic ?? '',
    mobile: pr.mobile ?? '',
    email: pr.email ?? '',
    bank: '—',
    acc: '—',
    av: '',
    avg: '',
    tier: pr.trainingLevel ?? '—',
    rep: '',
    shifts: String(pr.checkIns ?? 0),
    noshow: String(pr.noShows ?? 0),
    langs: [],
    prog: 0,
    next: '—',
  };
}

function prNameMatchesAgency(scanName: string, pr: AgencyManagedPR): boolean {
  const sn = scanName.trim().toLowerCase();
  const full = pr.name.trim().toLowerCase();
  const first = full.split(/\s+/)[0] ?? '';
  return sn === full || sn === first || full.startsWith(sn);
}

export function receiptBelongsToAgencyPr(
  scan: PrReceiptScan,
  pr: AgencyManagedPR,
): boolean {
  if (scan.prId && pr.id === scan.prId) return true;
  return prNameMatchesAgency(scan.prName, pr);
}

/** Canonical PR name on agency payroll — IC match + Luna → Vicky migration. */
export function resolvePvPrName(
  pv: Pick<PrPaymentVoucher, 'prName' | 'prIc'>,
  agencyPRs: AgencyManagedPR[] = [],
): string {
  if (pv.prIc) {
    const byIc = agencyPRs.find((p) => p.ic === pv.prIc);
    if (byIc?.name) return byIc.name;
  }
  const byName = agencyPRs.find((p) => prNameMatchesAgency(pv.prName, p));
  if (byName?.name) return byName.name;
  if (pv.prName === 'Luna') return 'Vicky';
  return pv.prName;
}

export function pvBelongsToAgencyPr(
  pv: Pick<PrPaymentVoucher, 'prName' | 'prIc'>,
  agencyPRs: AgencyManagedPR[] = [],
): boolean {
  if (pv.prIc && agencyPRs.some((p) => p.ic === pv.prIc)) return true;
  return agencyPRs.some((p) => prNameMatchesAgency(pv.prName, p));
}

export function getAgencyManagedPvs(
  pvs: PrPaymentVoucher[],
  agencyPRs: AgencyManagedPR[] = [],
): PrPaymentVoucher[] {
  return pvs.filter((pv) => pvBelongsToAgencyPr(pv, agencyPRs));
}

export type AgencyToPayRow = {
  prName: string;
  outlet: string;
  prIc?: string;
  totalNet: number;
  pvCount: number;
};

/** Group signed PVs by PR — matches Payroll → To pay → Payment queue. */
export function buildAgencyToPayRows(
  pvs: PrPaymentVoucher[],
  agencyPRs: AgencyManagedPR[] = [],
): AgencyToPayRow[] {
  const byPr = new Map<string, { row: AgencyToPayRow; outlets: Set<string> }>();
  for (const pv of pvs) {
    const prName = resolvePvPrName(pv, agencyPRs);
    const existing = byPr.get(prName);
    if (existing) {
      existing.row.totalNet += getPvNetTotal(pv);
      existing.row.pvCount += 1;
      existing.outlets.add(pv.outlet);
    } else {
      byPr.set(prName, {
        row: {
          prName,
          outlet: pv.outlet,
          prIc: pv.prIc,
          totalNet: getPvNetTotal(pv),
          pvCount: 1,
        },
        outlets: new Set([pv.outlet]),
      });
    }
  }
  return [...byPr.values()]
    .map(({ row, outlets }) => ({
      ...row,
      outlet: outlets.size > 1 ? `Multi-outlet (${outlets.size})` : row.outlet,
    }))
    .sort((a, b) => b.totalNet - a.totalNet);
}

/** Signed PV net total — same figure as Payroll → To pay → Payment queue. */
export function agencyPrToPayTotal(
  pvs: PrPaymentVoucher[] = [],
  agencyPRs: AgencyManagedPR[] = [],
): number {
  return buildAgencyToPayRows(
    pvs.filter((pv) => pv.status === 'SIGNED'),
    agencyPRs,
  ).reduce((sum, row) => sum + row.totalNet, 0);
}

export function agencyPrToPayCount(
  pvs: PrPaymentVoucher[] = [],
  agencyPRs: AgencyManagedPR[] = [],
): number {
  return buildAgencyToPayRows(
    pvs.filter((pv) => pv.status === 'SIGNED'),
    agencyPRs,
  ).length;
}

/** Earliest pay-by Wednesday among signed agency PVs (14 days after issue). */
export function agencyPendingPayoutDeadline(
  pvs: PrPaymentVoucher[] = [],
  agencyPRs: AgencyManagedPR[] = [],
  now = Date.now(),
): {
  payByLabel: string;
  payByMs: number;
  isOverdue: boolean;
  pvCount: number;
} | null {
  const signed = getAgencyManagedPvs(pvs, agencyPRs).filter(
    (pv) => pv.status === 'SIGNED',
  );
  if (!signed.length) return null;

  let payByMs = Infinity;
  let payByLabel = '';
  for (const pv of signed) {
    const ms = pvPayByDeadlineMsFromIssued(pv.issued);
    if (ms > 0 && ms < payByMs) {
      payByMs = ms;
      payByLabel = formatPvPayByDeadlineShort(pv.issued) ?? '';
    }
  }
  if (!Number.isFinite(payByMs) || !payByLabel) return null;

  return {
    payByLabel,
    payByMs,
    isOverdue: payByMs < now,
    pvCount: signed.length,
  };
}

export function resolvePvPrId(
  pv: Pick<PrPaymentVoucher, 'prName' | 'prIc'>,
  agencyPRs: AgencyManagedPR[] = [],
): string | undefined {
  if (pv.prIc) {
    const byIc = agencyPRs.find((p) => p.ic === pv.prIc);
    if (byIc) return byIc.id;
  }
  return agencyPRs.find((p) => prNameMatchesAgency(pv.prName, p))?.id;
}

/** Agency payroll display labels — aligned with History / PV filter chips. */
export const AGENCY_PV_STATUS_LABELS: Record<PrPvStatus, string> = {
  PENDING_REVIEW: 'Pending Agency Review',
  SENT: 'Pending PR Review',
  SIGNED: 'To pay',
  DISPUTED: 'Disputed',
  PAID: 'Paid',
};

export function agencyPvStatusLabel(status: PrPvStatus): string {
  return AGENCY_PV_STATUS_LABELS[status] ?? pvStatusLabel(status);
}

/**
 * Build commission receipt scans for Last Week / Last Last Week demo PVs.
 * Dates follow remapped PV rows so agency Payroll receipts stay in sync with vouchers.
 */
export function syncAgencyPayrollReceiptScans(
  scans: PrReceiptScan[],
  pvs: PrPaymentVoucher[],
  agencyPRs: AgencyManagedPR[],
): PrReceiptScan[] {
  const payrollPvIds = new Set(
    pvs
      .filter((pv) => {
        const weeksAgo = DEMO_PV_ISSUED_WEEKS_AGO[pv.id];
        return weeksAgo != null && PAYROLL_RECEIPT_WEEKS_AGO.has(weeksAgo);
      })
      .map((pv) => pv.id),
  );
  if (payrollPvIds.size === 0) return scans;

  const base = scans.filter(
    (scan) =>
      !(
        scan.pvId &&
        payrollPvIds.has(scan.pvId) &&
        scan.id.startsWith(PV_COMMISSION_SCAN_PREFIX)
      ),
  );

  const generated: PrReceiptScan[] = [];
  for (const pr of agencyPRs) {
    if (pr.detached) continue;
    const prPvs = pvs.filter(
      (pv) =>
        payrollPvIds.has(pv.id) &&
        (pv.prIc === pr.ic || prNameMatchesAgency(pv.prName, pr)),
    );
    if (prPvs.length === 0) continue;
    const profile = agencyPrReceiptProfile(pr);
    for (const scan of buildReceiptScansFromPaymentVouchers(
      prPvs,
      pr.id,
      profile,
    )) {
      generated.push({ ...scan, prCode: agencyPrReceiptCode(pr) });
    }
  }

  const byId = new Map<string, PrReceiptScan>();
  for (const scan of base) byId.set(scan.id, scan);
  for (const scan of generated) byId.set(scan.id, scan);
  return [...byId.values()].sort((a, b) =>
    b.scannedAt.localeCompare(a.scannedAt),
  );
}

type PayrollShiftSlot = {
  prId: string;
  prName: string;
  outlet: string;
  dateIso: string;
  dateDisplay: string;
  totalPayout: number;
  drinksAmt: number;
  tipsAmt: number;
  tablesAmt: number;
  pvId: string;
};

function payrollDemoPvs(pvs: PrPaymentVoucher[]): PrPaymentVoucher[] {
  return pvs.filter((pv) => {
    const weeksAgo = DEMO_PV_ISSUED_WEEKS_AGO[pv.id];
    return weeksAgo != null && PAYROLL_RECEIPT_WEEKS_AGO.has(weeksAgo);
  });
}

function dateInPayrollDemoWeek(
  dateIso: string,
  pvs: PrPaymentVoucher[],
): boolean {
  return payrollDemoPvs(pvs).some(
    (pv) =>
      pv.weekStartIso &&
      pv.weekEndIso &&
      dateIso >= pv.weekStartIso &&
      dateIso <= pv.weekEndIso,
  );
}

function outletSlug(outlet: string): string {
  return outlet.trim().toLowerCase().replace(/\s+/g, '-');
}

function buildShiftHistoryFromPayrollPvs(
  pvs: PrPaymentVoucher[],
  agencyPRs: AgencyManagedPR[],
): ShiftHistoryRow[] {
  const slots = new Map<string, PayrollShiftSlot>();

  for (const pv of payrollDemoPvs(pvs)) {
    const pr = agencyPRs.find(
      (p) =>
        !p.detached && (pv.prIc === p.ic || prNameMatchesAgency(pv.prName, p)),
    );
    if (!pr) continue;

    const prName = resolvePvPrName(pv, agencyPRs);
    const year = pv.weekStartIso
      ? parseInt(pv.weekStartIso.slice(0, 4), 10)
      : parseInt(pv.issued.match(/\d{4}/)?.[0] ?? '2026', 10);

    for (const row of pv.rows) {
      const outlet = row.outlet?.trim();
      if (!outlet || outlet === '\u2014') continue;

      const dateIso = pvRowDateToIso(row, year);
      if (!dateIso) continue;
      if (
        pv.weekStartIso &&
        pv.weekEndIso &&
        (dateIso < pv.weekStartIso || dateIso > pv.weekEndIso)
      ) {
        continue;
      }

      const slotKey = `${pr.id}|${dateIso}|${outlet.toLowerCase()}`;
      const acc =
        slots.get(slotKey) ??
        ({
          prId: pr.id,
          prName,
          outlet,
          dateIso,
          dateDisplay: fmtDateLabelFromIso(dateIso),
          totalPayout: 0,
          drinksAmt: 0,
          tipsAmt: 0,
          tablesAmt: 0,
          pvId: pv.id,
        } satisfies PayrollShiftSlot);

      acc.totalPayout += row.amt;
      const desc = row.desc.toLowerCase();
      if (desc.includes('drink')) acc.drinksAmt += row.amt;
      else if (desc.includes('tip')) acc.tipsAmt += row.amt;
      else if (desc.includes('table')) acc.tablesAmt += row.amt;
      slots.set(slotKey, acc);
    }
  }

  const { drinkPerUnit } = RECEIPT_COMMISSION_RULES;
  return [...slots.values()].map((acc) => {
    const totalDrinks =
      drinkPerUnit > 0
        ? Math.max(0, Math.round(acc.drinksAmt / drinkPerUnit))
        : 0;
    const drinkSalesRm =
      Math.round(totalDrinks * SHIFT_HISTORY_FALLBACK_PER_DRINK_RM * 100) / 100;
    const drinkCommissionRm = Math.round(acc.drinksAmt * 100) / 100;
    const tipCommissionRm = Math.round(acc.tipsAmt * 100) / 100;
    // Table commission retired from History — fold any PV table lines out of payout display parts.
    const totalPayout = Math.round(acc.totalPayout * 100) / 100;
    const wagesRm = Math.max(
      0,
      Math.round((totalPayout - drinkCommissionRm - tipCommissionRm) * 100) /
        100,
    );
    return {
      id: `${PAYROLL_SHIFT_ROW_PREFIX}${acc.pvId}-${acc.dateIso}-${outletSlug(acc.outlet)}`,
      prName: acc.prName,
      prId: acc.prId,
      outlet: acc.outlet,
      agencyName: PAYROLL_AGENCY_NAME,
      dateDisplay: acc.dateDisplay,
      dateIso: acc.dateIso,
      totalPayout,
      totalDrinks,
      drinkSalesRm,
      totalTips: tipCommissionRm,
      totalTables: 0,
      wagesRm,
      otRm: 0,
      drinkCommissionRm,
      tipCommissionRm,
      tableCommissionRm: 0,
      durationHours: 6,
    };
  });
}

/**
 * Replace agency-roster shift rows in Last Week / Last Last Week with PV line items
 * so History totals match agency Payroll vouchers.
 */
export function syncAgencyPayrollShiftHistory(
  rows: ShiftHistoryRow[],
  pvs: PrPaymentVoucher[],
  agencyPRs: AgencyManagedPR[],
): ShiftHistoryRow[] {
  const generated = buildShiftHistoryFromPayrollPvs(pvs, agencyPRs);
  if (generated.length === 0) return rows;

  const rosterPrIds = new Set(
    agencyPRs.filter((p) => !p.detached).map((p) => p.id),
  );
  const filtered = rows.filter((row) => {
    if (row.id.startsWith(PAYROLL_SHIFT_ROW_PREFIX)) return false;
    if (!rosterPrIds.has(row.prId)) return true;
    if (!dateInPayrollDemoWeek(row.dateIso, pvs)) return true;
    return false;
  });

  return dedupeShiftHistorySlots(
    sortShiftHistoryDesc([...filtered, ...generated]),
  );
}

/** Receipt scans belonging to PRs on the agency roster (or linked agency PVs). */
export function getAgencyManagedReceiptScans(
  scans: PrReceiptScan[],
  agencyPRs: AgencyManagedPR[],
  pvs: PrPaymentVoucher[],
): PrReceiptScan[] {
  const agencyPvIds = new Set(
    pvs
      .filter((pv) =>
        agencyPRs.some((pr) => prNameMatchesAgency(pv.prName, pr)),
      )
      .map((pv) => pv.id),
  );

  return scans.filter((scan) => {
    if (isLegacyReceiptScanIdentity(scan)) return false;
    if (scan.prId && agencyPRs.some((pr) => pr.id === scan.prId)) return true;
    if (agencyPRs.some((pr) => prNameMatchesAgency(scan.prName, pr)))
      return true;
    if (scan.pvId && agencyPvIds.has(scan.pvId)) return true;
    return false;
  });
}

export function receiptsForPv(
  scans: PrReceiptScan[],
  pv: PrPaymentVoucher,
): PrReceiptScan[] {
  const ids = new Set(pv.receiptIds ?? []);
  return scans.filter((s) => s.pvId === pv.id || ids.has(s.id));
}

function inferCollectionLineGroup(label: string): CollectionLineGroup {
  const d = label.toLowerCase();
  if (
    d.includes('wage') ||
    d.includes('payroll') ||
    d.includes('overtime') ||
    d.includes(' ot')
  ) {
    return 'payroll';
  }
  if (
    d.includes('drink') ||
    d.includes('tip') ||
    d.includes('table') ||
    d.includes('commission')
  ) {
    return 'commissions';
  }
  return 'fees';
}

function pvRowToCollectionLine(
  row: { desc: string; amt: number },
  pv: PrPaymentVoucher,
): CollectionLineItem {
  return {
    label: row.desc,
    detail: `${pv.prName} · ${pv.id}`,
    amount: row.amt,
    group: inferCollectionLineGroup(row.desc),
  };
}

/** Line items owed — invoice breakdown or derived from linked PV rows */
export function collectionOwedLines(
  invoice: AgencyCollectionInvoice,
  pvs: PrPaymentVoucher[],
): CollectionLineItem[] {
  if (invoice.lines?.length) {
    return invoice.lines
      .filter((l) => l.amount > 0)
      .map((l) => ({
        ...l,
        group: l.group ?? inferCollectionLineGroup(l.label),
      }));
  }
  const linked = invoice.linkedPvIds
    .map((id) => pvs.find((p) => p.id === id))
    .filter((p): p is PrPaymentVoucher => Boolean(p));
  if (linked.length) {
    return linked.flatMap((pv) =>
      pv.rows.map((row) => pvRowToCollectionLine(row, pv)),
    );
  }
  return [
    {
      label: 'Agency payroll & fees',
      detail: invoice.id,
      amount: invoice.amount,
      group: 'fees',
    },
  ];
}

export const COLLECTION_LINE_GROUPS: CollectionLineGroup[] = [
  'payroll',
  'commissions',
  'fees',
];

export const COLLECTION_GROUP_LABELS: Record<CollectionLineGroup, string> = {
  payroll: 'Payroll',
  commissions: 'Commissions',
  fees: 'Fees & platform',
};

export function groupCollectionLines(lines: CollectionLineItem[]) {
  return COLLECTION_LINE_GROUPS.map((group) => {
    const items = lines.filter(
      (l) => (l.group ?? inferCollectionLineGroup(l.label)) === group,
    );
    return {
      group,
      label: COLLECTION_GROUP_LABELS[group],
      lines: items,
      subtotal: items.reduce((s, l) => s + l.amount, 0),
    };
  }).filter((g) => g.lines.length > 0);
}

export function mergeAgencyCollections(
  persisted: AgencyCollectionInvoice[] | undefined,
  seeds: AgencyCollectionInvoice[],
): AgencyCollectionInvoice[] {
  if (!persisted?.length) return seeds;
  const seedById = Object.fromEntries(seeds.map((s) => [s.id, s]));
  const filtered = persisted.filter(
    (row) => row.kind !== 'agency' || seedById[row.id],
  );
  const merged = filtered.map((row) => {
    const seed = seedById[row.id];
    if (!seed) return row;
    const isAgencySubscription =
      seed.kind === 'agency' &&
      seed.lines?.some((l) => l.label.toLowerCase().includes('subscription'));
    if (isAgencySubscription) {
      return { ...seed, ...row, amount: seed.amount, lines: seed.lines };
    }
    return {
      ...seed,
      ...row,
      lines: row.lines?.length ? row.lines : seed.lines,
      linkedPvIds: seed.linkedPvIds?.length
        ? seed.linkedPvIds
        : row.linkedPvIds,
    };
  });
  const ids = new Set(merged.map((m) => m.id));
  return [...merged, ...seeds.filter((s) => !ids.has(s.id))];
}
