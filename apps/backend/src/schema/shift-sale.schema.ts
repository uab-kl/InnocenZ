import { z } from 'zod';

// Floor-sales amounts arrive as non-negative numbers; the controller sums them
// into total_sales_rm and formats every money value to fixed(2) for the
// numeric(12,2) columns. outletId / agencyId / soldOn are NOT accepted from the
// client — they are derived from the referenced shift, so they cannot be forged.

/**
 * numeric(12,2)'s largest value. Past it the INSERT failed as a raw database
 * error (a 500) instead of a 400 that says why (security review, 29 Sep 2026).
 * The TOTAL is capped too: the controller writes drinks + tips into one column.
 */
export const SALES_CEILING_RM = 9_999_999_999.99;
/** No shift sells a million of anything; the `integer` unit columns overflow far later. */
export const SALES_UNITS_CEILING = 1_000_000;
/** The refusal when drinks + tips + services would not fit the one total column. */
export const SALES_TOTAL_TOO_LARGE = 'The sales total is too large';

export const CreateShiftSaleSchema = z
  .object({
    shiftId: z.string().uuid('Invalid shift ID'),
    /** Preferred ops key — resolved to a temporary pr bridge until Phase C. */
    userId: z.string().uuid('Invalid user ID').optional(),
    /** @deprecated Prefer userId. Kept for dual-write. */
    prId: z.string().uuid('Invalid PR ID').optional(),
    drinkUnits: z.number().int().nonnegative().max(SALES_UNITS_CEILING).optional(),
    drinkSalesRm: z.number().nonnegative().max(SALES_CEILING_RM).optional(),
    tipUnits: z.number().int().nonnegative().max(SALES_UNITS_CEILING).optional(),
    tipSalesRm: z.number().nonnegative().max(SALES_CEILING_RM).optional(),
    /**
     * Services (owner, 29 Sep 2026: "Count services too"). Optional: omitted,
     * the row keeps the services it already holds — a receipt's service sales
     * are never wiped by a log that only edits drinks.
     */
    serviceUnits: z.number().int().nonnegative().max(SALES_UNITS_CEILING).optional(),
    serviceSalesRm: z.number().nonnegative().max(SALES_CEILING_RM).optional(),
  })
  .refine((v) => Boolean(v.userId || v.prId), {
    message: 'userId or prId is required',
    path: ['userId'],
  })
  .refine(
    (v) => (v.drinkSalesRm ?? 0) + (v.tipSalesRm ?? 0) + (v.serviceSalesRm ?? 0) <= SALES_CEILING_RM,
    { message: SALES_TOTAL_TOO_LARGE, path: ['drinkSalesRm'] },
  );

export type CreateShiftSaleInput = z.infer<typeof CreateShiftSaleSchema>;
