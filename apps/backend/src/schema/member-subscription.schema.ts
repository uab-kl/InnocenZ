import { z } from 'zod';
import { billingCycleValues } from '@/features/subscription/subscription.model.js';
import {
  subscriberTypeValues,
  memberSubscriptionStatusValues,
} from '@/features/member-subscription/member-subscription.model.js';

export const CreateMemberSubscriptionSchema = z.object({
  subscriberType: z.enum(subscriberTypeValues),
  subscriberId: z.uuid(),
  subscriberName: z.string().min(1).max(255),
  subscriptionId: z.uuid().optional().nullable(),
  planName: z.string().min(1).max(255),
  amount: z.coerce.number().nonnegative(),
  billingCycle: z.enum(billingCycleValues).default('monthly'),
  currency: z.string().min(1).max(8).default('MYR'),
  status: z.enum(memberSubscriptionStatusValues).default('active'),
  startedAt: z.coerce.date().optional(),
});

export const UpdateMemberSubscriptionSchema = z.object({
  planName: z.string().min(1).max(255).optional(),
  amount: z.coerce.number().nonnegative().optional(),
  billingCycle: z.enum(billingCycleValues).optional(),
  currency: z.string().min(1).max(8).optional(),
  status: z.enum(memberSubscriptionStatusValues).optional(),
  endedAt: z.coerce.date().optional().nullable(),
});
