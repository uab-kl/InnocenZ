import { z } from 'zod';
import { billingCycleValues } from '@/features/subscription/subscription.model.js';

export const SubscriptionSchema = z.object({
  name: z.string().min(1).max(255),
  price: z.coerce.number().nonnegative(),
  billingCycle: z.enum(billingCycleValues).default('monthly'),
  status: z.string().default('active'),
  coverage: z.string().max(100).optional().nullable(),
});
