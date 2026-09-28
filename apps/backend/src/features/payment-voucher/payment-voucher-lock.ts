import type { PaymentVoucherStatus } from './payment-voucher.model';

/**
 * WHAT MAY STILL CHANGE ON A VOUCHER ONCE THE PR HAS COUNTER-SIGNED IT.
 *
 * `PUT /payment-voucher/:id` replaces the whole line set and every header money
 * field, and until 28 Sep 2026 it did so whatever the voucher's state: a SIGNED
 * voucher could have its lines, deduction or net rewritten while it kept the
 * PR's signature and `pr_signed_at`. The PR's counter-signature then vouched
 * for figures they had never seen — and "Mark paid" settled them.
 *
 * Pure functions, so every rule here is unit-tested rather than probed against
 * the shared database ("never probe a write gate with a write").
 */

/** The states in which the PR's counter-signature is on the document. */
const COUNTER_SIGNED: ReadonlySet<PaymentVoucherStatus> = new Set([
  'signed',
  'paid',
]);

/**
 * Body fields a caller may still send to a signed or paid voucher. `status` is
 * judged separately below; `bankRef` is the one legitimate edit to a settled
 * voucher (the reference often arrives after the transfer); `disputeNote` is
 * the reason an override must carry; `expectedUpdatedAt` is a concurrency
 * token, not a column.
 */
const SETTLEMENT_FIELDS: ReadonlySet<string> = new Set([
  'status',
  'bankRef',
  'disputeNote',
  'expectedUpdatedAt',
]);

export type VoucherLockView = {
  status: PaymentVoucherStatus;
  financeHeadSignedAt: Date | null;
};

export type VoucherUpdateRequest = {
  /** Every body key the caller actually sent (undefined values excluded). */
  fields: readonly string[];
  status?: PaymentVoucherStatus;
  disputeNote?: string;
};

export function isCounterSigned(status: PaymentVoucherStatus): boolean {
  return COUNTER_SIGNED.has(status);
}

/**
 * Re-opening a signed or paid voucher for correction — the agency's "Override"
 * (`overrideSignedPv`). It is the ONLY way back to an editable voucher, and it
 * takes both signatures off (see `OVERRIDE_CLEARS`).
 */
export function isOverride(
  existing: PaymentVoucherStatus,
  target: PaymentVoucherStatus | undefined,
): boolean {
  return isCounterSigned(existing) && target === 'pending_review';
}

/**
 * The columns an override blanks. The figures are about to change, so neither
 * attestation may survive onto the new ones: the agency signs again before the
 * send, and the PR counter-signs again after it. Leaving `pr_signed_at` in place
 * would have the corrected voucher print the OLD signing time under the PR's
 * name. `paid_at` / `bank_ref` are deliberately NOT cleared — a transfer that
 * happened is a fact, and erasing it would hide money already sent.
 */
export const OVERRIDE_CLEARS = {
  prSignedAt: null,
  prSignature: null,
  financeHeadSignedAt: null,
  financeHeadSignature: null,
  financeHeadName: null,
  financeHeadRole: null,
} as const;

/**
 * Why this PUT must be refused, or null when it may proceed. Covers the lock
 * only; the send gate and the paid gate's dispute check stay in the controller.
 */
export function voucherUpdateRefusal(
  existing: VoucherLockView,
  request: VoucherUpdateRequest,
): string | null {
  const { status: from } = existing;
  const to = request.status;

  if (isCounterSigned(from)) {
    if (isOverride(from, to)) {
      if (!request.disputeNote?.trim()) {
        return 'Say why the voucher is being re-opened — the reason is recorded with the override.';
      }
      const extra = request.fields.filter((f) => !SETTLEMENT_FIELDS.has(f));
      if (extra.length > 0) {
        return (
          'Re-open the voucher and change it in two steps — the override takes both ' +
          'signatures off first, so the PR signs the corrected figures rather than the old ones.'
        );
      }
      return null;
    }

    const locked = request.fields.filter((f) => !SETTLEMENT_FIELDS.has(f));
    if (locked.length > 0) {
      return (
        `This voucher is ${from} — the PR has counter-signed these figures, so they are locked. ` +
        'Use Override to re-open it first; the PR then signs the corrected voucher again.'
      );
    }

    if (to !== undefined && to !== from && !(from === 'signed' && to === 'paid')) {
      return from === 'paid'
        ? 'A paid voucher is settled — only its bank reference can still be added.'
        : 'A signed voucher can only be recorded as paid, or re-opened with Override.';
    }
  }

  // Recording payment needs BOTH signatures. The PR's is implied by `signed`
  // (checked by the caller before this); the agency's is not, and PV-000002 and
  // PV-000006 were both recorded paid with `finance_head_signed_at` NULL.
  if (to === 'paid' && from !== 'paid' && !existing.financeHeadSignedAt) {
    return (
      'The agency has not signed this voucher — sign it first (Finance sign), then record the ' +
      'payment. A paid voucher must carry both signatures.'
    );
  }

  return null;
}

/** Why an admin delete must be refused, or null when it may proceed. */
export function voucherDeleteRefusal(existing: VoucherLockView): string | null {
  if (isCounterSigned(existing.status)) {
    return (
      `This voucher is ${existing.status} — it is a money record the PR has counter-signed` +
      (existing.status === 'paid' ? ' and the agency has paid' : '') +
      ', so it cannot be deleted.'
    );
  }
  return null;
}

/**
 * Why the agency's own signature must be refused, or null when it may be taken.
 *
 * Normally only at `pending_review`, before the send. The exception is a voucher
 * that left review WITHOUT one — sent before the 3 Aug 2026 gate existed, or by
 * the scheduler before it learned the rule — which could otherwise never be
 * paid now that payment needs both signatures. Adding the missing attestation
 * replaces nothing, so it cannot change a document anyone agreed to. A paid
 * voucher is refused: signing after the money moved would make the record claim
 * an approval that came too late to approve anything.
 */
export function financeSignRefusal(existing: VoucherLockView): string | null {
  if (existing.status === 'pending_review') return null;
  if (existing.status === 'paid') {
    return 'This voucher is already paid — a signature added now would not have approved the transfer.';
  }
  if (!existing.financeHeadSignedAt) return null;
  return 'This voucher has already been sent — the finance signature belongs before it goes to the PR.';
}
