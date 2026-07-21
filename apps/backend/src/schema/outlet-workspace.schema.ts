import { z } from 'zod';
import {
  penaltyRuleTypeValues,
  tierRateKindValues,
} from '@/features/outlet-workspace/outlet-workspace.model.js';

const payClass = z.enum(['basic', 'commissionOnly']);

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
  sortOrder: z.coerce.number().int().default(0),
});

export const PenaltyRuleSchema = z.object({
  ruleType: z.enum(penaltyRuleTypeValues),
  enabled: z.boolean().default(true),
  appliesTo: z.array(payClass).default([]),
  fineRm: z.coerce.number().default(0),
  minShiftsPerWeek: z.coerce.number().int().optional().nullable(),
  maxMcPerMonth: z.coerce.number().int().optional().nullable(),
  finePerExcessRm: z.coerce.number().optional().nullable(),
  maxLatePerWeek: z.coerce.number().int().optional().nullable(),
  graceMinutes: z.coerce.number().int().optional().nullable(),
});

export const UpsertOutletWorkspaceSchema = z.object({
  basePayPerHour: z.coerce.number().default(0),
  drinkPct: z.coerce.number().default(0),
  tipPct: z.coerce.number().default(0),
  otAfterHours: z.coerce.number().default(0),
  perDrinkRm: z.coerce.number().default(0),
  perTableRm: z.coerce.number().default(0),
  happyHourStart: z.string().max(10).default(''),
  happyHourEnd: z.string().max(10).default(''),
  happyHourDrinkDiscountPct: z.coerce.number().int().default(0),
  tierRates: z.array(TierRateSchema).default([]),
  drinkMenu: z.array(DrinkMenuItemSchema).default([]),
  penaltyRules: z.array(PenaltyRuleSchema).default([]),
});

export type UpsertOutletWorkspaceInput = z.infer<
  typeof UpsertOutletWorkspaceSchema
>;
