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
