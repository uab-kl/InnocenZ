/**
 * The PR's side of the receipt lifecycle: PENDING -> APPROVED -> VERIFIED.
 *
 * Two sections read this, and they need opposite things from it. THIS WEEK is
 * where the PR watches the agency work through what they logged, so it wants a
 * count. LAST WEEK is where they contest a figure, and a dispute is only allowed
 * once the agency has stated one — so it wants a per-cell answer.
 *
 * Everything here is ADVISORY. The server refuses a premature dispute with a 409
 * naming the receipt; this only decides whether to offer the control, so that
 * the PR is told why instead of being handed an action that fails.
 */
import type { PrCurrentWeek, PrReceiptLine } from './api';

/** Lines with a receipt behind them, split by where that receipt sits. */
export type ReceiptReviewCounts = {
  /** Logged, and nobody has checked it yet. */
  waiting: number;
  /** The agency has accepted it — and only now may it be disputed. */
  approved: number;
  /** Closed: the week rolled over, or a dispute against it was resolved. */
  verified: number;
};

export function receiptReviewCounts(week: PrCurrentWeek | null): ReceiptReviewCounts {
  const counts: ReceiptReviewCounts = { waiting: 0, approved: 0, verified: 0 };
  for (const line of week?.lines ?? []) {
    if (line.receiptStatus === 'pending') counts.waiting += 1;
    else if (line.receiptStatus === 'approved') counts.approved += 1;
    else if (line.receiptStatus === 'verified') counts.verified += 1;
  }
  return counts;
}

/** One short sentence for the This-week header, or null when there is nothing to say. */
export function receiptReviewCaption(week: PrCurrentWeek | null): string | null {
  const { waiting, approved, verified } = receiptReviewCounts(week);
  const settled = approved + verified;
  if (waiting === 0 && settled === 0) return null;
  if (waiting === 0) {
    return `${settled} ${settled === 1 ? 'entry' : 'entries'} approved by your agency`;
  }
  if (settled === 0) {
    return `${waiting} ${waiting === 1 ? 'entry is' : 'entries are'} waiting on your agency`;
  }
  return `${settled} approved · ${waiting} still waiting on your agency`;
}

/**
 * May the PR contest this day + income row yet?
 *
 * ONLY DRINKS AND TIPS (owner's decision, 4 Aug 2026). Daily wages and Others
 * (overtime, deductions) are never disputable — they are derived from the
 * check-in/check-out stamps and the shift rate, so the route to fixing one is
 * the attendance record, not a claim against the total. Checked FIRST, before
 * the line lookup, so a day with no lines still refuses rather than falling
 * through to the permissive default below.
 *
 * For drinks and tips, approval stays the precondition: a receipt the agency has
 * not reviewed is still the PR's own claim, with no stated figure to argue with.
 *
 * `disputable` is preferred over reading `receiptStatus` because the server
 * computes it from the same rule it enforces. The status check is the fallback
 * for a response from an older build that predates the field.
 */
const DISPUTABLE_KINDS: PrReceiptLine['kind'][] = ['drinks', 'tips'];

/**
 * Can this KIND of money ever be contested, whatever the day or the receipt?
 *
 * Wages and OT never can: they are DERIVED from the attendance stamps and the
 * shift rate, so the fix for a wrong one is the shift record, not an argument
 * about the total. The server refuses them outright (`DISPUTABLE_KINDS` in
 * payment-voucher-component.ts), so any control offering it is a button that
 * cannot work.
 *
 * Split out from `cellDisputable` because a UI often needs the answer BEFORE it
 * has a day or a week — deciding whether to render a dispute action at all.
 * Do not re-inline the array at a call site; one client-side copy of a
 * server-enforced rule is already one more than ideal.
 */
export function kindDisputable(kind: PrReceiptLine['kind']): boolean {
  return DISPUTABLE_KINDS.includes(kind);
}

export function cellDisputable(
  week: PrCurrentWeek | null,
  dateIso: string,
  kind: PrReceiptLine['kind'],
): boolean {
  if (!DISPUTABLE_KINDS.includes(kind)) return false;
  const lines = (week?.lines ?? []).filter(
    (line) => line.lineDate === dateIso && line.kind === kind,
  );
  if (lines.length === 0) return true;
  return lines.every((line) =>
    line.disputable !== undefined ? line.disputable : line.receiptStatus !== 'pending',
  );
}

/**
 * True once the agency has reviewed the line — at which point it stops being the
 * PR's to edit or delete. Used to hide those controls rather than let the server
 * refuse them: the buttons were the only thing saying the row was still theirs.
 */
export function isReceiptLocked(line: PrReceiptLine): boolean {
  return line.receiptStatus === 'approved' || line.receiptStatus === 'verified';
}
