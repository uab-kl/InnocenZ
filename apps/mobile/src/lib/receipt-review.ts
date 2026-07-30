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
 * A line with no receipt behind it (`receiptStatus` null — a wages seal, a bare
 * self-log) is disputable: there is nothing for anybody to approve, and blocking
 * it would mean a wage error could never be raised.
 *
 * `disputable` is preferred over reading `receiptStatus` here because the server
 * computes it, including the wages exemption. The status check is the fallback
 * for a response from an older build that predates the field.
 */
export function cellDisputable(
  week: PrCurrentWeek | null,
  dateIso: string,
  kind: PrReceiptLine['kind'],
): boolean {
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
