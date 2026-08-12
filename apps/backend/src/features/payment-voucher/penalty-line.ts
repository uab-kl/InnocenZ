/**
 * The `component='deduction'` voucher line a recorded penalty becomes.
 *
 * Penalties are NEVER auto-deducted. A breach is computed, an agency accepts it
 * (`penalty_charge`) or a PR cancels (`shift_assignment.cancel_fee_rm`), and a
 * line appears here only when someone presses Charge. This module owns the shape
 * of that line so the facts that make it correct sit together, exactly as
 * overtime-line.ts does for the opposite direction of money:
 *
 *  1. The `ref`'s dedupe field ends `-pen`, and `componentFromRef` keys the
 *     'deduction' classification off that marker. Setting `component` directly
 *     would work today and drift the first time another path forgot.
 *  2. `amount` is NEGATIVE. A penalty that lands as a positive line pays the PR
 *     the fine instead of taking it — the sign is the whole difference between
 *     a RM 50 charge and a RM 50 bonus.
 *  3. `lineDate` is the date the breach BELONGS to (the shift's date for a
 *     cancellation, the week's start for a weekly rule), never today. A week's
 *     voucher carrying a line dated outside it is the same fault the overtime
 *     line-date assertion was added to stop.
 *
 * Pure and DB-free so the arithmetic is checkable without a database.
 */

/** Matches `encodeRef` in payment-voucher.controller.ts — see the note there. */
const REF_SEP = '|';

/**
 * The dedupe key a penalty line is identified by.
 *
 * ⚠️ The `-pen` suffix is not cosmetic: `componentFromRef` reads it to classify
 * the line as 'deduction'. Both sources share the suffix and differ only in the
 * id, so a weekly charge and a cancellation fee can never collide.
 */
export function penaltyDedupeRef(chargeId: string): string {
  return `${chargeId}-pen`;
}

export function penaltyLineRef(chargeId: string): string {
  // kind `others` — the coarse PR-facing bucket, same as overtime. The `-pen`
  // dedupe is what promotes it to 'deduction' in the repository.
  return ['others', 'penalty', '0.00', penaltyDedupeRef(chargeId), ''].join(REF_SEP);
}

export type PenaltyLineInput = {
  /** `penalty_charge.id`, or the `shift_assignment.id` of a cancellation fee. */
  chargeId: string;
  /** Human label — "Below minimum shifts", "Cancelled shift". */
  label: string;
  /** The evidence behind it: "1 of 3 shifts this week", "50% of RM 55.00". */
  detail: string;
  /** RM as a positive 2dp string; the sign is applied here, not by the caller. */
  fineRm: string;
  /** yyyy-MM-dd the breach belongs to — never the day it was charged. */
  lineDate: string;
};

export type PenaltyLine = {
  ref: string;
  description: string;
  amount: string;
  lineDate: string;
  quantity: number;
};

export function buildPenaltyLine(input: PenaltyLineInput): {
  line: PenaltyLine;
  amountCents: number;
} {
  const rm = Number(input.fineRm);
  // Guard the sign at the boundary rather than trusting callers: a fine stored
  // as '-50.00' by some future path would otherwise negate to +50 and pay it.
  const magnitude = Number.isFinite(rm) ? Math.abs(rm) : 0;
  const amountCents = Math.round(magnitude * 100);
  return {
    line: {
      ref: penaltyLineRef(input.chargeId),
      description: input.detail ? `${input.label} — ${input.detail}` : input.label,
      amount: (-magnitude).toFixed(2),
      lineDate: input.lineDate,
      quantity: 1,
    },
    amountCents: -amountCents,
  };
}
