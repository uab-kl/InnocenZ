import { z } from 'zod';
import { tierRateKindValues } from '@/features/outlet-workspace/outlet-workspace.model.js';

export const TierRateSchema = z.object({
  kind: z.enum(tierRateKindValues).default('tier'),
  tier: z.string().max(50).optional().nullable(),
  wagePerHour: z.coerce.number().optional().nullable(),
  drinkPct: z.coerce.number().default(0),
  happyHourDrinkPct: z.coerce.number().optional().nullable(),
  tipPct: z.coerce.number().default(0),
  otAfterHours: z.coerce.number().optional().nullable(),
  targetSalesRm: z.coerce.number().optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
});

export const DrinkMenuItemSchema = z.object({
  slug: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  priceRm: z.coerce.number().default(0),
  // 'drink' | 'service' | 'tip' — reuses the existing outlet_drink_menu.category
  // varchar(20) column (no migration needed). 'tip' rows show under the TIPS
  // workspace list and the PR tips scan/self-log.
  category: z.enum(['drink', 'service', 'tip']).default('service'),
  sortOrder: z.coerce.number().int().default(0),
});

export const UpsertOutletWorkspaceSchema = z.object({
  basePayPerHour: z.coerce.number().default(0),
  drinkPct: z.coerce.number().default(0),
  tipPct: z.coerce.number().default(0),
  otAfterHours: z.coerce.number().default(0),
  perDrinkRm: z.coerce.number().default(0),
  happyHourStart: z.string().max(10).default(''),
  happyHourEnd: z.string().max(10).default(''),
  happyHourDrinkDiscountPct: z.coerce.number().int().default(0),
  tierRates: z.array(TierRateSchema).default([]),
  drinkMenu: z.array(DrinkMenuItemSchema).default([]),
});

export type UpsertOutletWorkspaceInput = z.infer<
  typeof UpsertOutletWorkspaceSchema
>;
