import { z } from 'zod';

// Floor-sales amounts arrive as non-negative numbers; the controller sums them
// into total_sales_rm and formats every money value to fixed(2) for the
// numeric(12,2) columns. outletId / agencyId / soldOn are NOT accepted from the
// client — they are derived from the referenced shift, so they cannot be forged.
export const CreateShiftSaleSchema = z
  .object({
    shiftId: z.string().uuid('Invalid shift ID'),
    /** Preferred ops key — resolved to a temporary pr bridge until Phase C. */
    userId: z.string().uuid('Invalid user ID').optional(),
    /** @deprecated Prefer userId. Kept for dual-write. */
    prId: z.string().uuid('Invalid PR ID').optional(),
    drinkUnits: z.number().int().nonnegative().optional(),
    drinkSalesRm: z.number().nonnegative().optional(),
    tipUnits: z.number().int().nonnegative().optional(),
    tipSalesRm: z.number().nonnegative().optional(),
  })
  .refine((v) => Boolean(v.userId || v.prId), {
    message: 'userId or prId is required',
    path: ['userId'],
  });

export type CreateShiftSaleInput = z.infer<typeof CreateShiftSaleSchema>;
