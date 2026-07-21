/** Agency workflows — raise PV, shift history helpers */

import type { AgencyManagedPR } from '@agency-portal/lib/agency-demo';
import { calcShiftPayout, getOutletRule } from '@agency-portal/lib/agency-demo';
import type { FinanceHeadPvStamp } from '@agency-portal/lib/finance-head-stamp';
import {
  fmtDtable,
  dayName,
  formatPvPayByDeadline,
  makeShiftPvId,
  type PrPaymentVoucher,
  type PrPvRow,
} from '@agency-portal/lib/pr-demo';
import type { ShiftHistoryRow } from '@agency-portal/lib/shift-history-utils';

export interface PvOverrideAudit {
  at: string;
  reason: string;
  by: string;
  previousStatus: string;
}

export function shiftHistoryPvRef(row: ShiftHistoryRow): string {
  return `${row.dateIso}-${row.outlet}-${row.prId}`;
}

export function historyRowHasPv(
  row: ShiftHistoryRow,
  pvs: PrPaymentVoucher[],
): boolean {
  const ref = shiftHistoryPvRef(row);
  return pvs.some(
    (p) =>
      p.paidRefs?.includes(ref) ||
      (p.prName === row.prName &&
        p.outlet === row.outlet &&
        p.cycle.includes(row.dateDisplay.split(' ')[0] ?? row.dateIso)),
  );
}

/** Build a PV from a sealed shift history row (agency Raise PV flow). */
export function buildPvFromShiftHistoryRow(
  row: ShiftHistoryRow,
  pr: AgencyManagedPR,
  financeHead: FinanceHeadPvStamp,
): PrPaymentVoucher {
  const [y, m, d] = row.dateIso.split('-').map(Number);
  const dateLabel = fmtDtable(y, m, d);
  const day = dayName(y, m, d);
  const rule = getOutletRule(row.outlet);
  const drinkSales = row.totalDrinks * 15;
  const payout = calcShiftPayout({
    outlet: row.outlet,
    hoursWorked: row.durationHours,
    drinks: row.totalDrinks,
    drinkSales,
    tips: row.totalTips,
    checkOutAfterOt: row.durationHours > rule.otAfterHours,
    prTier: pr.trainingLevel,
  });
  const otHours = Math.max(0, row.durationHours - rule.otAfterHours);
  const rows: PrPvRow[] = [
    {
      i: 1,
      date: dateLabel,
      day,
      outlet: row.outlet,
      desc: 'Shift pay',
      qty: 1,
      amt: payout.shiftPay,
      ref: 'Sealed shift',
    },
  ];
  let idx = 2;
  if (payout.drinkCommission > 0) {
    rows.push({
      i: idx++,
      date: dateLabel,
      day,
      outlet: row.outlet,
      desc: 'Commission – Drinks',
      qty: row.totalDrinks,
      amt: payout.drinkCommission,
      ref: 'Outlet log',
    });
  }
  if (payout.tipCommission > 0) {
    rows.push({
      i: idx++,
      date: dateLabel,
      day,
      outlet: row.outlet,
      desc: 'Commission – Tips',
      qty: 1,
      amt: payout.tipCommission,
      ref: 'Outlet log',
    });
  }
  if (payout.otSupplement > 0) {
    const otAmt = payout.otSupplement;
    rows.push({
      i: idx++,
      date: dateLabel,
      day,
      outlet: row.outlet,
      desc: 'Overtime (OT)',
      qty: Math.round(otHours * 60),
      amt: otAmt,
      ref: `MAX(0, check-out − shift end) · ${otHours.toFixed(1)}h`,
    });
  }
  const subtotal = rows.reduce((s, r) => s + r.amt, 0);
  const issued = row.dateDisplay;
  const pvId = makeShiftPvId([y, m, d], row.outlet) + `-${row.prId}`;
  return {
    id: pvId,
    prName: pr.name,
    prIc: pr.ic,
    outlet: row.outlet,
    cycle: `${dateLabel} shift`,
    issued,
    due: formatPvPayByDeadline(issued) ?? issued,
    rows,
    subtotal,
    deduct: 0,
    net: subtotal,
    status: 'PENDING_REVIEW',
    ...financeHead,
    paidRefs: [shiftHistoryPvRef(row)],
  };
}
