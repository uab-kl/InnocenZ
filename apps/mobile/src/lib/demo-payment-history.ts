/**
 * Payment history — HistPayWeek shape used by History → Payment.
 * Weeks are loaded from payment_voucher (signed/paid) via the API; this seed
 * stays empty so History never invents amounts for weeks with no shifts.
 */

/**
 * What the PR's History badge says about a past week's voucher.
 *
 * `pending` exists because History used to be fed only signed and paid vouchers,
 * so a two-value union was safe. Once every CLOSED week started appearing
 * (3 Aug 2026) that binary began labelling `pending_review` weeks "Signed" —
 * asserting a signature the PR had never given, on the one screen they visit to
 * check exactly that. A week still awaiting the agency, or awaiting the PR's own
 * signature, has to say so.
 */
export type HistPayStatus = 'paid' | 'signed' | 'pending';

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
  /**
   * WHO PAID IT. A PR on two rosters gets one voucher per agency for the same
   * week, and those two rows carry the same week label and often the same venue —
   * so this is the only field telling them apart at a glance. Optional: demo rows
   * and a not-yet-restarted backend have none.
   */
  agencyName?: string | null;
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
    if (w.outlet && !w.outlet.startsWith('Multi') && !/^\(\d+\)-outlet$/.test(w.outlet))
      set.add(w.outlet);
    for (const line of w.lines) {
      if (line.outlet && line.outlet !== '—') set.add(line.outlet);
    }
  }
  return Array.from(set).sort();
}
