import type {
  PaymentVoucherDayReviewType,
  PaymentVoucherLineType,
  PaymentVoucherReceiptStatus,
} from './payment-voucher.model';

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

/** Just enough of a receipt to decide whether a day's approval carries it. */
export type ReceiptDayRow = {
  id: string;
  receiptNo: string;
  status: PaymentVoucherReceiptStatus;
};

/**
 * The PENDING receipts an approved day already attests to.
 *
 * OWNER DECISION (4 Aug 2026): approving a day approves the receipts sitting on
 * it. The two reviews were never independent — a day's `approved_total_cents` IS
 * the sum of its lines, and those lines are the receipts' lines, so an agency
 * that approved RM 3008.20 for Tue has already stated the receipt behind it is
 * right. Leaving those receipts pending meant the send gate blocked a voucher on
 * evidence the same person had just signed off one panel above.
 *
 * A receipt is carried only when EVERY day it touches is approved. A receipt
 * spanning Mon and Tue is not attested by approving Mon alone — half its money
 * would still sit in a day nobody has looked at.
 *
 * A receipt with NO dated lines is never carried, and that is the point rather
 * than an omission: `dayTotalsCents` skips undated lines, so its money is in no
 * day's total and no day's approval can have covered it. It stays for the
 * receipts panel, where somebody looks at the photo.
 *
 * Held and cleared days are simply absent from `approvedDates` — this returns
 * what an approval CARRIES, never what a withdrawal should take back. Dropping a
 * receipt back to pending stays a deliberate act in the receipts panel.
 *
 * `justApprovedDates` IS WHAT MAKES THAT LAST SENTENCE TRUE. Without it the
 * sweep was a standing re-assertion rather than a transition: the agency
 * approves Sat (carrying RCP-000007), opens the receipts panel, sees the wrong
 * outlet on the photo and withdraws the approval — and then the NEXT day-review
 * call of any kind, even an approve-all that approves zero days, re-ran the full
 * sweep and flipped RCP-000007 back to approved, stamped with the name of the
 * person who had just rejected it. The withdrawal vanished and the send gate
 * opened on evidence the agency had explicitly refused.
 *
 * So a receipt must be TOUCHED by this call — at least one of its dates newly
 * decided — and only then is the all-days-approved test applied. The spanning
 * case still works: a Mon+Tue receipt with Mon approved yesterday carries when
 * Tue is approved today, because Tue is newly approved and both days are in
 * `approvedDates`.
 *
 * Defaults to `approvedDates` so a deliberate full re-sweep (the one-shot
 * backfill) keeps working by passing three arguments.
 */
export function receiptsCarriedByDays(
  lines: PaymentVoucherLineType[],
  receipts: ReceiptDayRow[],
  approvedDates: Set<string>,
  justApprovedDates: Set<string> = approvedDates,
): ReceiptDayRow[] {
  const datesByReceipt = new Map<string, Set<string>>();
  for (const line of lines) {
    if (!line.receiptId || !line.lineDate) continue;
    const dates = datesByReceipt.get(line.receiptId) ?? new Set<string>();
    dates.add(line.lineDate);
    datesByReceipt.set(line.receiptId, dates);
  }

  return receipts.filter((receipt) => {
    if (receipt.status !== 'pending') return false;
    const dates = datesByReceipt.get(receipt.id);
    if (!dates || dates.size === 0) return false;
    // Touched by THIS decision, not merely sitting under an old one.
    if (![...dates].some((date) => justApprovedDates.has(date))) return false;
    return [...dates].every((date) => approvedDates.has(date));
  });
}

/**
 * The day statuses the PR is shown — an approval they can actually rely on.
 *
 * A day reads APPROVED to the PR only when its day review is approved AND no
 * PENDING receipt has a line on it. The two can disagree, and when they do the
 * phone must take the pessimistic one: `receiptsCarriedByDays` deliberately
 * holds back a receipt straddling an unapproved day, and a day approved before
 * the carry existed never swept at all — in both cases the day review says
 * "approved" over money whose evidence nobody has accepted.
 *
 * That matters beyond cosmetics. APPROVED is what tells the PR the figure has
 * stopped being their own claim and become the agency's statement, which is the
 * precondition for disputing it. Showing it early points them at a dispute the
 * server will refuse, naming a receipt they cannot see.
 *
 * HELD is passed through untouched. A held day is a decision, and a pending
 * receipt on it does not make the refusal any less real.
 */
export function prVisibleDayStatuses(
  view: DayReviewView[],
  lines: PaymentVoucherLineType[],
  receipts: ReceiptDayRow[],
): { date: string; status: DayReviewView['status'] }[] {
  const pendingIds = new Set(
    receipts.filter((r) => r.status === 'pending').map((r) => r.id),
  );
  const daysWithPendingEvidence = new Set<string>();
  for (const line of lines) {
    if (!line.receiptId || !line.lineDate) continue;
    if (pendingIds.has(line.receiptId)) daysWithPendingEvidence.add(line.lineDate);
  }

  const out = view.map((d) => ({
    date: d.date,
    status:
      d.status === 'approved' && daysWithPendingEvidence.has(d.date) ? null : d.status,
  }));

  /*
   * DAYS APPROVE THEMSELVES FROM THEIR RECEIPTS now that the day-review
   * panel is gone (owner's call, 23 Aug 2026): a day whose receipt-backed
   * lines are all settled (approved or verified) reads APPROVED on the
   * phone with no day_review row behind it — the Receipts section is the
   * review. A day carrying any pending receipt stays absent, which the
   * phone already renders as not-yet-reviewed. Historic day_review rows
   * (mapped above) win over the derivation: an explicit decision, held
   * ones included, outranks an inference.
   */
  const decided = new Set(out.map((d) => d.date));
  const receiptDays = new Set<string>();
  for (const line of lines) {
    if (!line.receiptId || !line.lineDate) continue;
    receiptDays.add(line.lineDate);
  }
  for (const date of receiptDays) {
    if (decided.has(date) || daysWithPendingEvidence.has(date)) continue;
    out.push({ date, status: 'approved' });
  }
  return out;
}

export type SendGateResult =
  | { allowed: true }
  | {
      allowed: false;
      message: string;
      heldDays: string[];
      unreviewedDays: string[];
      /** Receipt numbers (RCP-000123) still waiting on the agency's review. */
      pendingReceipts: string[];
      /**
       * Set ONLY when the refusal is "this week has not finished yet", carrying
       * the day it finishes. Optional so every existing consumer of this shape
       * keeps compiling; a caller that ignores it still gets the right message.
       */
      weekEndsOn?: string;
      /**
       * Shift dates whose overtime the agency has not decided yet. Optional for
       * the same reason as `weekEndsOn` — no existing consumer breaks.
       */
      pendingOvertime?: string[];
    };

/** Just enough of an assignment for the gate: when it was, and how much is claimed. */
export type PendingOvertimeRow = {
  shiftDate: string;
  overtimeMinutes: number | null;
};

/** Just enough of a receipt for the gate — its number, and where it sits. */
export type ReceiptGateRow = {
  receiptNo: string;
  status: PaymentVoucherReceiptStatus;
};

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
 * OWNER DECISION #2 (30 Jul 2026): a PENDING RECEIPT also blocks, routed through
 * here rather than checked separately at the send. One refusal path cannot
 * disagree with itself; two can. The consequence is what makes the PR side
 * coherent — by the time a PR reads a *sent* voucher, every receipt on it has
 * been approved, which is why approval is the precondition for disputing
 * receipt-backed money.
 *
 * Note the asymmetry with days: a day carries no state until someone acts, so
 * silence blocks. A receipt is born in a state, and only `manual` self-logs are
 * born pending — a scan does not wait on anybody.
 *
 * THIRD RULE (31 Jul 2026): a week that has not FINISHED cannot be sent. This
 * one is not about review at all — it is about arithmetic. Closing a week early
 * declares a total for days that have not happened, and the rest of that week's
 * earnings then have nowhere to go: the duplicate-week guard correctly refuses a
 * second voucher, so a Thursday drink logged after a Wednesday send is simply
 * lost. That is not hypothetical — a mid-week send is exactly how the live
 * `PV-000002` / `PV-000004` pair came to exist, and every other fix in this area
 * addressed the *consequence* rather than the act.
 *
 * It is checked FIRST and returns alone, because it is a different kind of
 * refusal: listing unreviewed days beside it would be noise, since of course
 * nothing has been reviewed on a week still being worked.
 *
 * A voucher with no `weekEnd` passes, for the same reason a voucher with no
 * dated lines does — there is no window to be inside or outside of, and
 * blocking on a missing value would be a deadlock rather than a control.
 *
 * `today` is injected rather than read here so the rule stays pure and the probe
 * can walk a voucher across its own week-end without waiting a day. Callers pass
 * `klToday()`; see its docstring for why a UTC date would break the Monday job.
 *
 * FOURTH RULE (31 Jul 2026): undecided OVERTIME blocks the send, and this one is
 * a direct consequence of the owner's payout decision rather than a safety net.
 * The rule is that overtime is paid on the voucher of the week it was WORKED —
 * "together with the week PV it originates from" — and that only holds if the
 * agency decides before the week goes out. Blocking here means the awkward case,
 * approving overtime onto a document the PR already holds, is PREVENTED rather
 * than handled: there is no reopen path to design because the week cannot close
 * with a claim outstanding.
 *
 * ⚠️ It is checked in BOTH early returns above, not only in the message. An
 * unapproved overtime claim writes no voucher line, so a voucher can carry one
 * while having no dated lines and no receipts whatsoever — the shortcut
 * `view.length === 0 && pendingReceipts.length === 0` would have waved through
 * exactly the case this rule exists for.
 *
 * Used by BOTH the HTTP send and the Monday payout job. A gate the scheduler
 * walks past every week is not a gate.
 */
export function voucherSendGate(
  view: DayReviewView[],
  receipts: ReceiptGateRow[] = [],
  week?: { weekEnd: string | null; today: string },
  pendingOvertimeRows: PendingOvertimeRow[] = [],
): SendGateResult {
  if (week?.weekEnd && week.weekEnd >= week.today) {
    return {
      allowed: false,
      message:
        `This voucher cannot be sent yet — its week does not finish until ${week.weekEnd}. ` +
        'Sending a week early declares a total for days that have not happened, and anything ' +
        'earned in the rest of the week can no longer be added to it.',
      heldDays: [],
      unreviewedDays: [],
      pendingReceipts: [],
      // Empty like its three siblings, not omitted: this branch returns alone,
      // and a caller reading `pendingOvertime` to render "decide these claims"
      // must be told there is nothing to decide YET rather than `undefined`.
      pendingOvertime: [],
      weekEndsOn: week.weekEnd,
    };
  }

  const pendingReceipts = receipts.filter((r) => r.status === 'pending').map((r) => r.receiptNo);
  // Overtime the agency has not decided. Both early returns below have to know
  // about it: a voucher can carry pending overtime while having no dated lines
  // and no receipts at all — an unapproved OT claim writes no line, which is
  // precisely why the shift it belongs to may be invisible here otherwise.
  const pendingOvertime = pendingOvertimeRows.map((r) => r.shiftDate);
  if (view.length === 0 && pendingReceipts.length === 0 && pendingOvertime.length === 0) {
    return { allowed: true };
  }

  /*
   * THE DAY-REVIEW TERMS ARE GONE (owner's call, 23 Aug 2026: "all verified
   * no more need review in the pv remove it, do the approve action in the
   * payroll agency receipt section"). The receipt statuses ARE the review:
   * a voucher sends once no receipt is pending and no overtime is
   * undecided. Un-reviewed days no longer block, and a legacy held row
   * cannot either — with the panel removed there is no control left to
   * clear one, so honouring it would brick the voucher it sits on. The
   * result shape keeps both fields so no caller breaks; they are simply
   * always empty now.
   */
  const heldDays: string[] = [];
  const unreviewedDays: string[] = [];
  if (pendingReceipts.length === 0 && pendingOvertime.length === 0) {
    return { allowed: true };
  }

  const parts: string[] = [];
  if (pendingReceipts.length > 0) {
    parts.push(
      `${pendingReceipts.length} receipt(s) not yet reviewed: ${pendingReceipts.join(', ')}`,
    );
  }
  if (pendingOvertime.length > 0) {
    parts.push(
      `${pendingOvertime.length} overtime claim(s) not yet decided: ${pendingOvertime.join(', ')}`,
    );
  }

  return {
    allowed: false,
    message: `This voucher cannot be sent yet — ${parts.join(' · ')}.`,
    heldDays,
    unreviewedDays,
    pendingReceipts,
    pendingOvertime,
  };
}
