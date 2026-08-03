import { z } from 'zod';
import { cardBrandValues } from '@/features/payment-method/payment-method.model.js';

/**
 * What a subscriber may save about its card.
 *
 * ⚠️ `last4` is capped at FOUR DIGITS by the schema, not merely by convention.
 * If a client ever posts a full card number here it is rejected at the edge
 * rather than written — the browser derives the brand and the last four and
 * discards the rest, and this is the guard that keeps that true.
 *
 * `expYear` is a four-digit year; a two-digit "27" would sort before every real
 * expiry and silently read as already expired.
 */
export const UpsertPaymentMethodSchema = z.object({
  brand: z.enum(cardBrandValues).default('Card'),
  last4: z
    .string()
    .regex(/^[0-9]{4}$/, 'last4 must be exactly four digits — never send the full card number'),
  expMonth: z.coerce.number().int().min(1).max(12),
  expYear: z.coerce.number().int().min(2000).max(2100),
  holderName: z.string().min(1).max(255).optional().nullable(),
  billingEmail: z.email().max(255).optional().nullable(),
  autoPay: z.boolean().optional(),
  /**
   * Which venue the card belongs to, for an operator who holds more than one.
   * Always checked against the caller's own outlets — never trusted as given.
   */
  outletId: z.uuid().optional(),
});

export type UpsertPaymentMethodInput = z.infer<typeof UpsertPaymentMethodSchema>;
