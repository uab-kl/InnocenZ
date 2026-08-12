import { z } from 'zod';
import { subscriptionInvoiceStatusValues } from '@/features/subscription-invoice/subscription-invoice.model.js';

/**
 * The ONLY thing a caller may change about an invoice.
 *
 * Period, amount and subscriber are generated facts, derived from the
 * subscription and the calendar — accepting them here would let a client
 * rewrite what a period cost after the fact, which is the one thing a billing
 * record exists to prevent. `paid_at` is not accepted either: the server stamps
 * it from the status change, so the timestamp and the state cannot disagree.
 */
export const UpdateSubscriptionInvoiceSchema = z.object({
  status: z.enum(subscriptionInvoiceStatusValues),
});
