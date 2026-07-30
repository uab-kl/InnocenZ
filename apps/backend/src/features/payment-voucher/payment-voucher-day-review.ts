import type { PaymentVoucherDayReviewType, PaymentVoucherLineType } from './payment-voucher.model';

/**
 * Per-day totals for a voucher, in integer CENTS.
 *
 * Cents rather than floats for the same reason the Σ=0 balance check uses them:
 * this figure is what an agency signs off on, and summing "500.00" + "12.35" as
 * floats is how a day drifts a cent away from the voucher it belongs to.
 *
 * Lines with no `lineDate` are week-level (a deduction, an adjustment) and
 * belong to no single day — they are deliberately excluded rather than bucketed
 * into an arbitrary one.
 */
export function dayTotalsCents(lines: PaymentVoucherLineType[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of lines) {
    if (!line.lineDate) continue;
    const cents = Math.round(Number(line.amount ?? 0) * 100);
    if (!Number.isFinite(cents)) continue;
    totals.set(line.lineDate, (totals.get(line.lineDate) ?? 0) + cents);
  }
  return totals;
}

export type DayReviewView = {
  date: string;
  totalCents: number;
  /** 'approved' | 'held' | null — null means nobody has looked at this day. */
  status: PaymentVoucherDayReviewType['status'] | null;
  /**
   * The day changed since it was reviewed.
   *
   * An approval records the total it was given. If the voucher is regenerated
   * and the day now sums to something else, the old decision describes a figure
   * that no longer exists — so it is surfaced as UNREVIEWED-with-a-warning
   * rather than left reading "approved". Without this the agency could attest to
   * RM 300 while the PR is sent RM 420, with the row still saying approved.
   */
  stale: boolean;
  approvedTotalCents: number | null;
  note: string | null;
  bulk: boolean;
  reviewedAt: Date | null;
  reviewedBy: string | null;
};

/**
 * Every day that has money on it, with the agency's decision folded in.
 *
 * Driven by the LINES, not by the review rows: a day that exists only as a
 * review (because the lines were regenerated without it) is not a day the PR is
 * being paid for, and showing it would invite approving something that is not
 * there.
 */
export function buildDayReviewView(
  lines: PaymentVoucherLineType[],
  reviews: PaymentVoucherDayReviewType[],
): DayReviewView[] {
  const totals = dayTotalsCents(lines);
  const byDate = new Map(reviews.map((r) => [r.reviewDate, r]));

  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, totalCents]) => {
      const review = byDate.get(date) ?? null;
      const stale =
        review !== null &&
        review.approvedTotalCents !== null &&
        review.approvedTotalCents !== totalCents;

      return {
        date,
        totalCents,
        status: review && !stale ? review.status : null,
        stale,
        approvedTotalCents: review?.approvedTotalCents ?? null,
        note: review?.note ?? null,
        bulk: review?.bulk ?? false,
        reviewedAt: review?.reviewedAt ?? null,
        reviewedBy: review?.reviewedBy ?? null,
      };
    });
}

/** True when every day carrying money has a live (non-stale) decision. */
export function allDaysReviewed(view: DayReviewView[]): boolean {
  return view.length > 0 && view.every((d) => d.status !== null);
}

export type SendGateResult =
  | { allowed: true }
  | { allowed: false; message: string; heldDays: string[]; unreviewedDays: string[] };

/**
 * May this voucher go to the PR?
 *
 * OWNER DECISION (30 Jul 2026): a HELD day blocks, AND every day carrying money
 * must carry a live decision. The strict form was chosen over warn-only because
 * a review nobody has to satisfy is not a control.
 *
 * A STALE day counts as unreviewed — `buildDayReviewView` has already dropped its
 * status to null — which is the point of storing `approved_total_cents`: a day
 * approved at RM 300 that regenerated to RM 420 must be looked at again before
 * the PR is sent the new figure.
 *
 * A voucher with NO dated lines passes. Week-level lines (a deduction, an
 * adjustment) belong to no day, so there is nothing to approve and blocking it
 * would be an unopenable deadlock rather than a control.
 *
 * Used by BOTH the HTTP send and the Monday payout job. A gate the scheduler
 * walks past every week is not a gate.
 */
export function voucherSendGate(view: DayReviewView[]): SendGateResult {
  if (view.length === 0) return { allowed: true };

  const heldDays = view.filter((d) => d.status === 'held').map((d) => d.date);
  const unreviewedDays = view.filter((d) => d.status === null).map((d) => d.date);
  if (heldDays.length === 0 && unreviewedDays.length === 0) return { allowed: true };

  const parts: string[] = [];
  if (heldDays.length > 0) parts.push(`${heldDays.length} day(s) held: ${heldDays.join(', ')}`);
  if (unreviewedDays.length > 0) {
    parts.push(`${unreviewedDays.length} day(s) not yet reviewed: ${unreviewedDays.join(', ')}`);
  }

  return {
    allowed: false,
    message: `This voucher cannot be sent yet — ${parts.join(' · ')}.`,
    heldDays,
    unreviewedDays,
  };
}
