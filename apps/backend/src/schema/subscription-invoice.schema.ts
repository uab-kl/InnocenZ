import { z } from 'zod';
import { subscriptionInvoiceStatusValues } from '@/features/subscription-invoice/subscription-invoice.model.js';
import { paymentMethodTypeValues } from '@/features/payment-method/payment-method.model.js';

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
  status: z.enum(subscriptionInvoiceStatusValues),
  /**
   * How the money arrived. Defaults to a bank transfer, which is what every
   * manual mark-paid has always been — the admin is recording a transfer they
   * have seen on a statement.
   */
  methodType: z.enum(paymentMethodTypeValues).optional(),
  /** The bank/gateway reference, so a settled period can be matched to a statement. */
  reference: z.string().trim().min(1).max(120).optional().nullable(),
});
