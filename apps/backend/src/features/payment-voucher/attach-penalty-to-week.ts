import type { PaymentVoucherRepositoryClass } from './payment-voucher.repository.js';
import { buildPenaltyLine, penaltyDedupeRef } from './penalty-line.js';

/**
 * Put ONE sealed charge on the voucher for the week it BELONGS to.
 *
 * 🔴 THE POINT OF THIS MODULE. Two callers now do this, and they must do it
 * identically: the agency's manual Charge button (agency-penalty-rule.controller
 * `applyChargesToVouchers`) and the automatic attach when a PR cancels a shift
 * (shift-assignment.controller `cancelMine`, since 0130). Written twice they
 * drift, and the two would disagree about which week a fee lands on or whether
 * a repeat lands twice — so the rule lives here and both callers pass through
 * it. This is the same reasoning as `seal-checkout.ts`, which exists because a
 * self-checkout and a cut-loss release must produce the same money.
 *
 * A LEAF: it imports the repository TYPE and the pure line builder, and nothing
 * else from either controller. That is deliberate — a latent import cycle
 * through a controller took the whole agency portal down once before, and the
 * fix was a leaf module exactly like this one.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
 * It does NOT stamp the charge as collected. The caller does that, AFTER this
 * returns ok, because the stamp and the line live on different aggregates and
 * cannot share a transaction. Stamping first would drain the Finance list while
 * collecting nothing — the exact failure that list exists to expose. Landing a
 * line and failing to stamp is recoverable (the fee stays listed, and the dedupe
 * below stops a second line); stamping and failing to land is not.
 */

export type AttachPenaltyDeps = {
  paymentVoucherRepository: PaymentVoucherRepositoryClass;
};

export type AttachPenaltyInput = {
  /** `penalty_charge.id`, or the `shift_assignment.id` of a cancellation fee. */
  chargeId: string;
  agencyId: string;
  prId: string;
  userId?: string | null;
  prName: string;
  prIc?: string | null;
  outlet?: string | null;
  /** Human label — "Cancelled shift", "Below minimum shifts". */
  label: string;
  /** The evidence: "50% of RM 500.00", "2 of 3 shifts this week". */
  detail: string;
  /** RM, positive 2dp string. The sign is applied by `buildPenaltyLine`. */
  fineRm: string;
  /** yyyy-MM-dd the breach BELONGS to — never the day it was charged. */
  lineDate: string;
  weekStart: string;
  weekEnd: string;
  actor: string;
};

export type AttachPenaltyResult =
  | { ok: true; voucherId: string; alreadyPresent: boolean }
  | { ok: false; reason: string };

export async function attachPenaltyToWeek(
  deps: AttachPenaltyDeps,
  input: AttachPenaltyInput,
): Promise<AttachPenaltyResult> {
  const { paymentVoucherRepository } = deps;

  // The week is the BREACH's own, never today's. A fee for a shift dropped on
  // 5 Aug lands on the 2-8 Aug voucher even if it is settled in September,
  // because a PR reading their payslip has to find the deduction beside the week
  // that caused it — and because the alternative silently moves money between
  // pay periods.
  const result = await paymentVoucherRepository.getOrCreateCurrentWeekDraft({
    prId: input.prId,
    userId: input.userId,
    agencyId: input.agencyId,
    prName: input.prName,
    prIc: input.prIc,
    outlet: input.outlet,
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    actor: input.actor,
  });
  // A signed/sent/paid week cannot take a new deduction. Leaving it uncharged is
  // the honest outcome: the agency has to decide whether to carry it forward,
  // and a silent stamp would hide that decision. This is ALSO the path an
  // automatic attach takes when the PR cancels a shift in an already-closed
  // week — it degrades to exactly the behaviour that shipped before 0130, with
  // the fee sitting on the Finance list.
  if (!result.ok) return { ok: false, reason: result.reason };

  const voucherId = result.voucher.id;
  const { line } = buildPenaltyLine({
    chargeId: input.chargeId,
    label: input.label,
    detail: input.detail,
    fineRm: input.fineRm,
    lineDate: input.lineDate,
  });

  // IDEMPOTENT on the dedupe ref. Two things make this necessary rather than
  // defensive: the automatic attach and the manual Charge button can both reach
  // the same fee, and either can be retried after a partial failure. Read fresh
  // — `result.voucher` may predate a line added moments ago.
  const full = await paymentVoucherRepository.getById(voucherId);
  const dedupe = penaltyDedupeRef(input.chargeId);
  if (full?.lines.some((l) => (l.ref ?? '').includes(dedupe))) {
    return { ok: true, voucherId, alreadyPresent: true };
  }

  await paymentVoucherRepository.addLine(voucherId, line);
  return { ok: true, voucherId, alreadyPresent: false };
}
