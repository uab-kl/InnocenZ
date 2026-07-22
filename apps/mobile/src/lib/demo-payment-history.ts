/**
 * Payment history — HistPayWeek shape used by History → Payment.
 * Weeks are loaded from payment_voucher (signed/paid) via the API; this seed
 * stays empty so History never invents amounts for weeks with no shifts.
 */

export type HistPayStatus = 'paid' | 'signed';

export type HistPayLine = {
  date: string;
  day: string;
  type: string;
  outlet: string;
  amount: number;
  /** Early withdrawal / deduction lines render red with − */
  debit?: boolean;
};

export type HistPayWeek = {
  id: string;
  ref: string;
  weekLabel: string;
  outlet: string;
  shifts: number;
  issued: string;
  status: HistPayStatus;
  statusMeta: string;
  net: number;
  wages: number;
  commission: number;
  earlyWithdrawal?: number;
  otherDeduction?: number;
  bankRef?: string;
  lines: HistPayLine[];
};

/** @deprecated Demo seed removed — use GET /payment-voucher/mine/history. */
export const PAYMENT_HISTORY_WEEKS: HistPayWeek[] = [];

/** Unique outlets for filter dropdown */
export function paymentHistoryOutlets(weeks: HistPayWeek[] = PAYMENT_HISTORY_WEEKS): string[] {
  const set = new Set<string>();
  for (const w of weeks) {
    if (w.outlet && !w.outlet.startsWith('Multi')) set.add(w.outlet);
    for (const line of w.lines) {
      if (line.outlet && line.outlet !== '—') set.add(line.outlet);
    }
  }
  return Array.from(set).sort();
}
