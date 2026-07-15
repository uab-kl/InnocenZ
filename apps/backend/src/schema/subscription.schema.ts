import { z } from 'zod';
import { billingCycleValues } from '@/features/subscription/subscription.model.js';

export const SubscriptionSchema = z.object({
  name: z.string().min(1).max(255),
  price: z.coerce.number().nonnegative(),
  billingCycle: z.enum(billingCycleValues).default('monthly'),
  status: z.string().default('active'),
  roleIds: z.array(z.uuid()).optional(),
});

export const LimitTypeSchema = z.object({
  code: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  description: z.string().max(255).optional().nullable(),
  configSchema: z.record(z.string(), z.unknown()).optional().nullable(),
  status: z.string().default('active'),
});

export const SubscriptionFeatureSchema = z.object({
  subscriptionId: z.uuid(),
  roleId: z.uuid(),
  limitTypeId: z.uuid(),
});
