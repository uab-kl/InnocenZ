import { z } from 'zod';

export const UpsertCommissionConfigSchema = z.object({
  outletId: z.string().uuid('Invalid outlet ID'),
  agencyId: z.string().uuid('Invalid agency ID'),
  itemType: z.string().min(1, 'Item type is required'),
  unitPrice: z.number().min(0, 'Unit price must be non-negative'),
  commissionRate: z.number().min(0).max(1, 'Commission rate must be between 0 and 1'),
});

export const UpdateCommissionConfigSchema = z.object({
  unitPrice: z.number().min(0).optional(),
  commissionRate: z.number().min(0).max(1).optional(),
  status: z.string().optional(),
});

export type UpsertCommissionConfigInput = z.infer<typeof UpsertCommissionConfigSchema>;
export type UpdateCommissionConfigInput = z.infer<typeof UpdateCommissionConfigSchema>;
