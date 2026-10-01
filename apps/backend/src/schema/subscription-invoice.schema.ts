import { z } from 'zod';
import { paymentMethodTypeValues } from '@/features/payment-method/payment-method.model.js';
import { VOID_REASON_MAX, VOID_REASON_MIN } from '@/features/subscription-invoice/invoice-void.js';

/**
 * The ONLY things a caller may change about an invoice.
 *
 * Period, amount and subscriber are generated facts, derived from the
 * subscription and the calendar — accepting them here would let a client
 * rewrite what a period cost after the fact, which is the one thing a billing
 * record exists to prevent. `paid_at` is not accepted either: the server stamps
 * it from the status change, so the timestamp and the state cannot disagree.
 *
 * `methodType` and `reference` describe the PAYMENT, not the invoice, and are
 * written to `subscription_payment` rather than here. They are accepted on this
 * request because marking a period paid is the moment an admin actually knows
 * them — asking for them on a second screen is how `payment_voucher.bank_ref`
 * ends up populated and this one does not.
 */
export const UpdateSubscriptionInvoiceSchema = z.object({
  /**
   * Paid or unpaid only. `void` is NOT set here (29 Sep 2026): it needs a
   * reason and its own guards — no payment in flight, none recorded, no credit
   * tied to it — so it has its own action, `PATCH /:id/void`. Accepting it on
   * this route would have fallen into the "mark unpaid" branch.
   */
  status: z.enum(['unpaid', 'paid']),
  /**
   * How the money arrived. Defaults to a bank transfer, which is what every
   * manual mark-paid has always been — the admin is recording a transfer they
   * have seen on a statement.
   */
  methodType: z.enum(paymentMethodTypeValues).optional(),
  /** The bank/gateway reference, so a settled period can be matched to a statement. */
  reference: z.string().trim().min(1).max(120).optional().nullable(),
});

/**
 * VOID AN UNPAID BILL (owner, 29 Sep 2026: "Add Void"). The reason is required:
 * it is written onto the bill's own `note` ("Voided: …") and into the audit
 * row, and a void nobody can explain later is a charge that silently vanished.
 */
export const VoidSubscriptionInvoiceSchema = z.object({
  reason: z
    .string({ error: 'A reason is required to void a bill — it stays on the bill’s record.' })
    .trim()
    .min(VOID_REASON_MIN, 'A reason is required to void a bill — it stays on the bill’s record.')
    .max(VOID_REASON_MAX, `Keep the reason under ${VOID_REASON_MAX} characters.`),
});
