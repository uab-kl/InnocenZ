import { z } from 'zod';
import {
  autoDebitWalletProviders,
  cardBrandValues,
  type EwalletProviderCode,
  mandateStatusValues,
  savablePaymentMethodTypes,
} from '@/features/payment-method/payment-method.model.js';

/**
 * What a subscriber may save about how it pays.
 *
 * ⚠️ `last4` is capped at FOUR DIGITS by the schema, not merely by convention.
 * If a client ever posts a full card number here it is rejected at the edge
 * rather than written — the browser derives the brand and the last four and
 * discards the rest, and this is the guard that keeps that true. There is no
 * field for the number or the CVV, and there must never be one.
 *
 * `expYear` is a four-digit year; a two-digit "27" would sort before every real
 * expiry and silently read as already expired.
 *
 * The card fields are OPTIONAL at the field level and REQUIRED for `card` in the
 * refinement below, which is the same shape the database uses (nullable columns
 * plus the `payment_method_card_fields` CHECK). Making them optional outright
 * would let a card be saved with no expiry; requiring them outright would make
 * a bank-transfer arrangement unsaveable.
 */
export const UpsertPaymentMethodSchema = z
  .object({
    /**
     * Only the rails that auto-debit may be SAVED: a card, or a Touch 'n Go
     * eWallet (owner, 15 Sep 2026 — was card / bank direct debit since 2 Sep).
     * One-off FPX and the other wallets are paid by hand on the gateway's page,
     * so saving one would promise a renewal that never happens; this is what
     * stops an older client, or a hand-made request, saving one anyway.
     */
    type: z.enum(savablePaymentMethodTypes).default('card'),
    brand: z.enum(cardBrandValues).default('Card'),
    last4: z
      .string()
      .regex(/^[0-9]{4}$/, 'last4 must be exactly four digits — never send the full card number')
      .optional()
      .nullable(),
    expMonth: z.coerce.number().int().min(1).max(12).optional().nullable(),
    expYear: z.coerce.number().int().min(2000).max(2100).optional().nullable(),
    holderName: z.string().min(1).max(255).optional().nullable(),
    billingEmail: z.email().max(255).optional().nullable(),
    /**
     * Mandate rails only, and NOT trusted from here — a bank approves a direct
     * debit, not the venue asking for one. The controller forces 'pending' for
     * exactly that reason; the field exists so a gateway callback can later move
     * it through the same schema.
     */
    mandateStatus: z.enum(mandateStatusValues).optional().nullable(),
    mandateReference: z.string().trim().min(1).max(120).optional().nullable(),
    /**
     * WHICH BANK to redirect the payer to, by PayNet code.
     *
     * There is deliberately NO field for an account number, here or anywhere:
     * the bank creates the mandate, so the number is data this app cannot use
     * and has no business holding — the same rule that keeps the card PAN out.
     */
    bankCode: z.string().trim().min(1).max(50).optional().nullable(),
    /**
     * WHICH WALLET is linked for auto-debit — required for `ewallet`, and only
     * a wallet the gateway can charge unattended (`autoDebitWalletProviders`,
     * Touch 'n Go today). Ignored on a card.
     */
    walletProvider: z.string().trim().max(50).optional().nullable(),
    autoPay: z.boolean().optional(),
    /**
     * Which venue the instrument belongs to, for an operator who holds more
     * than one. Always checked against the caller's own outlets — never trusted
     * as given.
     */
    outletId: z.uuid().optional(),
  })
  .superRefine((value, ctx) => {
    // Mirrors the `payment_method_wallet_provider` CHECK (a wallet row names its
    // wallet), narrowed to the wallets the gateway can debit unattended — a
    // saved GrabPay would read as auto-pay and never be charged.
    if (value.type === 'ewallet') {
      if (!autoDebitWalletProviders.includes(value.walletProvider as EwalletProviderCode)) {
        ctx.addIssue({
          code: 'custom',
          path: ['walletProvider'],
          message: "Only Touch 'n Go eWallet can be saved for automatic payment",
        });
      }
      return;
    }

    if (value.type !== 'card') return;
    // Mirrors the `payment_method_card_fields` CHECK, so a bad payload is a 400
    // with a readable message rather than a 500 from the constraint.
    for (const field of ['last4', 'expMonth', 'expYear'] as const) {
      if (value[field] === undefined || value[field] === null) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} is required for a card`,
        });
      }
    }
  });

export type UpsertPaymentMethodInput = z.infer<typeof UpsertPaymentMethodSchema>;
