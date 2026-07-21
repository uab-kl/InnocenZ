import { MainSchema } from '@/db/db.schema';
import {
  boolean,
  integer,
  jsonb,
  numeric,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { OutletTable } from '@/features/outlet/outlet.model.js';

// Pay class a penalty rule applies to (mirrors the frontend PrPayClass union).
export type PayClass = 'basic' | 'commissionOnly';

// A tier-rate row is either a ranked PR tier or the single commission-only default.
export const tierRateKindValues = ['tier', 'commission_only'] as const;
export type TierRateKind = (typeof tierRateKindValues)[number];
export const tierRateKindEnum = MainSchema.enum(
  'outlet_tier_rate_kind',
  tierRateKindValues,
);

export const penaltyRuleTypeValues = [
  'min_shifts_per_week',
  'max_mc_per_month',
  'late_per_week',
] as const;
export type PenaltyRuleType = (typeof penaltyRuleTypeValues)[number];
export const penaltyRuleTypeEnum = MainSchema.enum(
  'outlet_penalty_rule_type',
  penaltyRuleTypeValues,
);

// One operational workspace per outlet: the pay/commission + happy-hour settings
// that drive new shift postings. Nested rate structures live in the child tables
// below (fully normalized). 1:1 with an outlet (outlet_id is unique).
export const OutletWorkspaceTable = MainSchema.table('outlet_workspace', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  outletId: uuid('outlet_id')
    .notNull()
    .unique()
    .references(() => OutletTable.id, { onDelete: 'cascade' }),
  basePayPerHour: numeric('base_pay_per_hour', { precision: 12, scale: 2 })
    .notNull()
    .default('0'),
  drinkPct: numeric('drink_pct', { precision: 6, scale: 2 }).notNull().default('0'),
  tipPct: numeric('tip_pct', { precision: 6, scale: 2 }).notNull().default('0'),
  otAfterHours: numeric('ot_after_hours', { precision: 6, scale: 2 })
    .notNull()
    .default('0'),
  perDrinkRm: numeric('per_drink_rm', { precision: 12, scale: 2 })
    .notNull()
    .default('0'),
  happyHourStart: varchar('happy_hour_start', { length: 10 }).notNull().default(''),
  happyHourEnd: varchar('happy_hour_end', { length: 10 }).notNull().default(''),
  happyHourDrinkDiscountPct: integer('happy_hour_drink_discount_pct')
    .notNull()
    .default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

// Wage + commission per PR training tier (kind='tier', tier set) plus the single
// commission-only default (kind='commission_only', tier null, wage/ot null).
export const OutletTierRateTable = MainSchema.table('outlet_tier_rate', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => OutletWorkspaceTable.id, { onDelete: 'cascade' }),
  kind: tierRateKindEnum('kind').notNull().default('tier'),
  tier: varchar('tier', { length: 50 }),
  wagePerHour: numeric('wage_per_hour', { precision: 12, scale: 2 }),
  drinkPct: numeric('drink_pct', { precision: 6, scale: 2 }).notNull().default('0'),
  happyHourDrinkPct: numeric('happy_hour_drink_pct', { precision: 6, scale: 2 }),
  tipPct: numeric('tip_pct', { precision: 6, scale: 2 }).notNull().default('0'),
  otAfterHours: numeric('ot_after_hours', { precision: 6, scale: 2 }),
  targetSalesRm: numeric('target_sales_rm', { precision: 12, scale: 2 }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull().default('system'),
  updatedBy: varchar('updated_by').notNull().default('system'),
});

// Service-entitlement drink menu (one item per row). `slug` preserves the
// frontend item id (e.g. 'booking-com', used for special handling).
export const OutletDrinkMenuTable = MainSchema.table('outlet_drink_menu', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => OutletWorkspaceTable.id, { onDelete: 'cascade' }),
  slug: varchar('slug', { length: 100 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  priceRm: numeric('price_rm', { precision: 12, scale: 2 }).notNull().default('0'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull().default('system'),
  updatedBy: varchar('updated_by').notNull().default('system'),
});

// Attendance & discipline rules, one row per rule type. Rule-specific columns are
// nullable because each rule type uses a different subset (see the frontend union).
export const OutletPenaltyRuleTable = MainSchema.table('outlet_penalty_rule', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => OutletWorkspaceTable.id, { onDelete: 'cascade' }),
  ruleType: penaltyRuleTypeEnum('rule_type').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  appliesTo: jsonb('applies_to').$type<PayClass[]>().notNull().default([]),
  fineRm: numeric('fine_rm', { precision: 12, scale: 2 }).notNull().default('0'),
  // min_shifts_per_week
  minShiftsPerWeek: integer('min_shifts_per_week'),
  // max_mc_per_month
  maxMcPerMonth: integer('max_mc_per_month'),
  finePerExcessRm: numeric('fine_per_excess_rm', { precision: 12, scale: 2 }),
  // late_per_week
  maxLatePerWeek: integer('max_late_per_week'),
  graceMinutes: integer('grace_minutes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull().default('system'),
  updatedBy: varchar('updated_by').notNull().default('system'),
});

export type OutletWorkspace = typeof OutletWorkspaceTable.$inferSelect;
export type OutletWorkspaceInsertType = typeof OutletWorkspaceTable.$inferInsert;
export type OutletTierRate = typeof OutletTierRateTable.$inferSelect;
export type OutletTierRateInsertType = typeof OutletTierRateTable.$inferInsert;
export type OutletDrinkMenuItem = typeof OutletDrinkMenuTable.$inferSelect;
export type OutletDrinkMenuInsertType = typeof OutletDrinkMenuTable.$inferInsert;
export type OutletPenaltyRule = typeof OutletPenaltyRuleTable.$inferSelect;
export type OutletPenaltyRuleInsertType =
  typeof OutletPenaltyRuleTable.$inferInsert;

// The assembled workspace returned by the API: parent row + its children.
export type OutletWorkspaceAggregate = OutletWorkspace & {
  tierRates: OutletTierRate[];
  drinkMenu: OutletDrinkMenuItem[];
  penaltyRules: OutletPenaltyRule[];
};
