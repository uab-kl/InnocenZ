import type { SubscriptionInvoiceStatus } from './subscription-invoice.model.js';
import { joinNotes } from './pro-rata.js';

/**
 * VOIDING A BILL RAISED IN ERROR (owner, 29 Sep 2026: "Add Void").
 *
 * Until migration 0169 a subscription invoice was `unpaid` or `paid`, so the
 * only way to take back a wrong charge was to DELETE the row — which lost the
 * record of what was once charged and freed the period's (member_subscription,
 * period_start) slot for the nightly job to mint again. A void keeps the row,
 * keeps the slot taken, and stops it counting as owed.
 *
 * ONLY A BILL NOTHING HAS TOUCHED. A void rewrites nothing about money, so it
 * is refused wherever money — or a promise of money — already rests on the
 * bill. Read against `subscription_payment` and `subscription_credit`:
 *  - `paid`                         → it was paid; that is a refund, not a void;
 *  - an attempt `initiated`/`pending` → a card or FPX debit is still in flight,
 *                                     and it could settle after the void;
 *  - an attempt `succeeded`/`refunded` → money moved against it at some point;
 *  - a credit applied to it, or minted from it (a mid-period switch to a
 *    cheaper plan) → voiding it would leave that credit balancing nothing.
 * A `failed` or `voided` attempt is history, not money — it does not block.
 *
 * Pure, so every refusal is pinned by a unit test rather than probed with a
 * write. The repository reads the facts under a row lock and asks this.
 */

/** The prefix of the sentence a void leaves on the bill's `note`. */
export const VOID_NOTE_PREFIX = 'Voided: ';
export const VOID_REASON_MIN = 3;
export const VOID_REASON_MAX = 200;

/** The payment-attempt states (`subscription_payment.status`) this rule reads. */
export type AttemptStatus = 'initiated' | 'pending' | 'succeeded' | 'failed' | 'refunded' | 'voided';

export type VoidFacts = {
  invoiceNo: string;
  status: SubscriptionInvoiceStatus;
  /** numeric(12,2) as stored — the credit taken off this bill when it was minted. */
  creditApplied: string;
  /** Every attempt ever recorded against the bill. */
  attempts: readonly AttemptStatus[];
  /** `subscription_credit` rows whose source OR target is this bill. */
  creditRefs: number;
};

export type VoidRefusal = { status: 409; message: string };

const NOTHING_CHANGED = 'Nothing was changed.';

/** Why this bill cannot be voided, or null when it may be. */
export function voidRefusal(facts: VoidFacts): VoidRefusal | null {
  const refuse = (message: string): VoidRefusal => ({ status: 409, message: `${message} ${NOTHING_CHANGED}` });
  const bill = facts.invoiceNo;

  if (facts.status === 'void') return refuse(`${bill} is already void.`);
  if (facts.status === 'paid') {
    return refuse(`${bill} is paid — only an unpaid bill can be voided. A payment taken in error is refunded, not voided.`);
  }
  if (facts.attempts.some((a) => a === 'initiated' || a === 'pending')) {
    return refuse(`A payment for ${bill} is still in progress — let it finish or fail before voiding the bill.`);
  }
  if (facts.attempts.some((a) => a === 'succeeded' || a === 'refunded')) {
    return refuse(`Money has been recorded against ${bill}, so it cannot be voided.`);
  }
  const creditTaken = Math.round(Number(facts.creditApplied) * 100);
  if ((Number.isFinite(creditTaken) && creditTaken > 0) || facts.creditRefs > 0) {
    return refuse(`A plan-switch credit is tied to ${bill}, so voiding it would leave that credit balancing nothing.`);
  }
  return null;
}

/**
 * The bill's `note` once voided: whatever it said before — a pro-rata sentence,
 * a credit's reason — then "Voided: <reason>". `joinNotes` keeps the first
 * sentence whole and clips to the column, so the UPDATE can never fail on length.
 */
export function voidNote(existing: string | null | undefined, reason: string): string {
  return joinNotes(existing, `${VOID_NOTE_PREFIX}${reason.trim()}`) ?? `${VOID_NOTE_PREFIX}${reason.trim()}`;
}

/** What the admin is told when the void lands — the server's own sentence, shown verbatim. */
export function voidedMessage(invoiceNo: string): string {
  return `${invoiceNo} voided — it no longer counts as owed, and the reason is kept on its record.`;
}
