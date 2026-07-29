import { z } from 'zod';
import { prTierValues, prStatusValues } from '@/features/pr/pr.model';

export const CreatePrSchema = z.object({
  // Optional here: for agency callers it is derived from their own agency and
  // any client-supplied value is ignored. Admin callers must supply it (enforced
  // in the controller).
  agencyId: z.string().uuid('Invalid agency ID').optional(),
  userId: z.string().uuid('Invalid user ID').optional(),
  name: z.string().min(1, 'Name is required').max(255, 'Name is too long'),
  nickname: z.string().max(100, 'Nickname is too long').optional(),
  tier: z.enum(prTierValues).optional(),
  phone: z.string().max(50, 'Phone is too long').optional(),
  email: z.string().email('Invalid email').max(255, 'Email is too long').optional(),
  icNo: z.string().max(100, 'IC number is too long').optional(),
});

export const UpdatePrSchema = CreatePrSchema.partial().extend({
  status: z.enum(prStatusValues).optional(),
  /**
   * Why a sign-up was declined — sent alongside `status: 'inactive'`. The
   * controller clears it when the PR is accepted, so callers never have to.
   */
  rejectReason: z.string().max(500, 'Reason is too long').optional(),
});

export type CreatePrInput = z.infer<typeof CreatePrSchema>;
export type UpdatePrInput = z.infer<typeof UpdatePrSchema>;
