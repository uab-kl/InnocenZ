import { z } from 'zod'

export const billingCycleValues = ['weekly', 'monthly', 'annually'] as const

export const SubscriptionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  price: z.coerce.number().nonnegative('Price must be 0 or more'),
  billingCycle: z.enum(billingCycleValues).default('monthly'),
  status: z.enum(['active', 'inactive']).default('active'),
  roleIds: z.array(z.string().uuid()).default([]),
})

export type CreateSubscriptionInput = z.infer<typeof SubscriptionSchema>
export type UpdateSubscriptionInput = Partial<CreateSubscriptionInput>

export const LimitTypeSchema = z.object({
  code: z.string().min(1, 'Code is required').max(255),
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().max(255).optional().nullable(),
  configSchema: z.record(z.string(), z.unknown()).optional().nullable(),
  status: z.enum(['active', 'inactive']).default('active'),
})

export type CreateLimitTypeInput = z.infer<typeof LimitTypeSchema>
export type UpdateLimitTypeInput = Partial<CreateLimitTypeInput>

export const SubscriptionFeatureSchema = z.object({
  subscriptionId: z.string().uuid('Subscription is required'),
  roleId: z.string().uuid('Role is required'),
  limitTypeId: z.string().uuid('Limit type is required'),
})

export type CreateSubscriptionFeatureInput = z.infer<typeof SubscriptionFeatureSchema>
export type UpdateSubscriptionFeatureInput = Partial<CreateSubscriptionFeatureInput>
