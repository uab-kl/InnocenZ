import { z } from 'zod';
import {
  billingCycleValues,
  subscriptionTypeValues,
} from '@/features/subscription/subscription.model.js';

export const SubscriptionSchema = z.object({
  name: z.string().min(1).max(255),
  price: z.coerce.number().nonnegative(),
  billingCycle: z.enum(billingCycleValues).default('monthly'),
  /** Who the plan is sold to. No longer inferred from billingCycle. */
  subscriptionType: z.enum(subscriptionTypeValues),
  status: z.string().default('active'),
  coverage: z.string().max(100).optional().nullable(),
});

/**
 * PATCH shape — `billingCycle` and `status` re-declared WITHOUT their
 * create-time defaults.
 *
 * `.partial()` makes a key optional but leaves a default underneath it intact,
 * so editing only a plan's PRICE also sent `billingCycle: 'monthly'` and
 * `status: 'active'`: a yearly plan quietly became monthly, and a retired plan
 * came back on sale. The controller's `!== undefined` guards could not catch it
 * — the value was no longer undefined by the time they ran. See the note on
 * `UpdateOutletSchema`.
 */
export const UpdateSubscriptionSchema = SubscriptionSchema.partial().extend({
  billingCycle: z.enum(billingCycleValues).optional(),
  status: z.string().optional(),
});
