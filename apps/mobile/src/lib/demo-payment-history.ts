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
  /**
   * May the PR sign THIS voucher right now?
   *
   * Carried as its own fact because `status` cannot answer it: it collapses
   * `pending_review`, `sent` and `disputed` into one 'pending' badge, and only
   * the middle one is signable. Gating the Sign button on 'pending' therefore
   * offered it on a voucher the agency had not issued yet — directly beneath
   * the line reading "Waiting for your agency to issue".
   *
   * `statusMeta` already knows the difference, but it knows it as English prose.
   * A boolean cannot be broken by rewording a sentence.
   */
  canSign: boolean;
  /**
   * Is this voucher DISPUTED? The second fact `status` cannot answer.
   *
   * Same reasoning as `canSign` directly above, and found the same way: the
   * 'pending' badge folds `pending_review`, `sent` AND `disputed` together, so
   * the PV screen's header pill had no way to tell a disputed voucher from one
   * merely waiting, and painted it amber "Pending your review" — while this
   * row's own `statusMeta` read "Disputed — waiting on your agency" and the
   * Payment screen said disputed too.
   *
   * Amber means WAITING and red means DISPUTED (owner, 23 Aug 2026), so this is
   * a colour rule, not a wording one. Like `canSign`, a boolean rather than a
   * re-read of `statusMeta`: a sentence can be reworded, a flag cannot.
   */
  isDisputed?: boolean;
  statusMeta: string;
  net: number;
  /**
   * The voucher HEADER deduction, kept so `normalizeHistPayWeek` can recompute
   * a net that MATCHES the server instead of overwriting it with the gross.
   * Absent on demo rows, which have no header.
   */
  headerDeduction?: number;
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
