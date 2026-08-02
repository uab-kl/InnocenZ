/**
 * The `component='ot'` voucher line an approved overtime claim becomes.
 *
 * Overtime is NEVER auto-paid. A check-out records the minutes, an agency
 * owner/finance user approves them, and only then does a line appear here. This
 * module owns the shape of that line so the two facts that make it correct live
 * together rather than in a controller:
 *
 *  1. Its `ref` must carry a dedupe field ending `-ot`, because that marker —
 *     not the coarse kind 'others' — is what `componentFromRef` reads to classify
 *     the line as 'ot' in the REPOSITORY. Writing `component` directly would work
 *     today and drift the moment another path forgets to.
 *  2. Its `lineDate` must be the SHIFT's own date, never the approval date. The
 *     repository refuses a line whose ref names an assignment it is not dated
 *     with (`assertLinesAgreeWithShifts`), and that rule exists because a live
 *     voucher once carried overtime dated five days off the shift it was for.
 *
 * Pure and DB-free, so the probe can check the arithmetic without a database.
 */

import { overtimeAmountCents } from './payment-voucher-audit';
import { formatCents } from './payment-voucher-balance';

/** Matches `encodeRef` in payment-voucher.controller.ts — see the note there. */
const REF_SEP = '|';

/**
 * The dedupe key an overtime line is identified by, on the phone and here.
 *
 * ⚠️ The `-ot` suffix is not cosmetic: `componentFromRef` keys the whole 'ot'
 * classification off it. Mobile's CheckInScreen writes the same shape.
 */
export function overtimeDedupeRef(assignmentId: string): string {
  return `${assignmentId}-ot`;
}

/**
 * The packed `ref` for an overtime line: kind `others`, source `checkin`, no
 * gross sale (overtime is not earned against a receipt), dedupe `<id>-ot`.
 */
export function overtimeLineRef(assignmentId: string): string {
  return ['others', 'checkin', '0.00', overtimeDedupeRef(assignmentId), ''].join(REF_SEP);
}

export type OvertimeLineInput = {
  assignmentId: string;
  /** The shift's own `shift_date` (yyyy-MM-dd) — never the approval date. */
  shiftDate: string;
  /** Minutes recorded at check-out, before the clamp. */
  minutes: number;
  /** The tier wage sealed onto the assignment; null for a commission-only PR. */
  payAmount: string | number | null;
  outlet?: string | null;
  actor: string;
};

export type BuiltOvertimeLine = {
  lineDate: string;
  outlet: string | null;
  description: string;
  quantity: number;
  amount: string;
  ref: string;
  createdBy: string;
  updatedBy: string;
};

/**
 * Builds the line, and returns the frozen amount alongside it.
 *
 * The amount is returned separately because the caller must also write it to
 * `shift_assignment.overtime_amount`: that column FREEZES what was approved, so
 * a later change to the tier rate cannot silently restate a decision somebody
 * already made. The two must therefore be the same number, computed once.
 *
 * A zero amount is a legitimate outcome (a commission-only PR has no daily wage
 * to derive an hourly rate from), and the caller — not this builder — decides
 * whether a zero-value line is worth writing.
 */
export function buildOvertimeLine(input: OvertimeLineInput): {
  line: BuiltOvertimeLine;
  amountCents: number;
} {
  const amountCents = overtimeAmountCents(input.payAmount, input.minutes);
  return {
    amountCents,
    line: {
      lineDate: input.shiftDate,
      outlet: input.outlet ?? null,
      // The minutes are named in the description because the amount alone tells
      // a PR reading their voucher nothing about what was approved.
      description: `Overtime ${input.minutes} min`,
      quantity: 1,
      amount: formatCents(amountCents),
      ref: overtimeLineRef(input.assignmentId),
      createdBy: input.actor,
      updatedBy: input.actor,
    },
  };
}
