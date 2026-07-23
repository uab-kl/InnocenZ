import { date, integer, numeric, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { AgencyTable } from '@/features/agency/agency.model';
import { OutletTable } from '@/features/outlet/outlet.model';
import { tierRateKindEnum } from '@/features/outlet-workspace/outlet-workspace.model';

// Mirrors the frontend ShiftRequest.status lifecycle (agency-portal store).
export const shiftStatusValues = ['draft', 'open', 'confirmed', 'sealed'] as const;
export type ShiftStatus = (typeof shiftStatusValues)[number];
export const shiftStatusEnum = MainSchema.enum('shift_status', shiftStatusValues);

// Mirrors the frontend ShiftEventKind.
export const shiftEventKindValues = ['normal', 'special'] as const;
export type ShiftEventKind = (typeof shiftEventKindValues)[number];
export const shiftEventKindEnum = MainSchema.enum('shift_event_kind', shiftEventKindValues);

/**
 * A shift (job) an outlet needs staffed on a given date, managed by an agency.
 * This is the core persisted shape of the frontend `ShiftRequest`; PR assignments
 * (the demo's `prs[]`) and outlet-side live-sales reconciliation are follow-ups.
 */
export const ShiftTable = MainSchema.table('shift', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  agencyId: uuid('agency_id')
    .notNull()
    .references(() => AgencyTable.id, { onDelete: 'cascade' }),
  outletId: uuid('outlet_id')
    .notNull()
    .references(() => OutletTable.id, { onDelete: 'cascade' }),
  shiftDate: date('shift_date', { mode: 'string' }).notNull(),
  slot: varchar('slot', { length: 100 }),
  eventName: varchar('event_name', { length: 255 }),
  eventKind: shiftEventKindEnum('event_kind').notNull().default('normal'),
  languages: varchar('languages', { length: 255 }),
  quantity: integer('quantity').notNull().default(0),
  filled: integer('filled').notNull().default(0),
  preferredRating: integer('preferred_rating'),
  payPerHour: numeric('pay_per_hour', { precision: 12, scale: 2 }).notNull().default('0'),
  estimatedCost: numeric('estimated_cost', { precision: 12, scale: 2 }).notNull().default('0'),
  liveSales: numeric('live_sales', { precision: 12, scale: 2 }).notNull().default('0'),
  status: shiftStatusEnum('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type ShiftType = typeof ShiftTable.$inferSelect;
export type ShiftInsertType = typeof ShiftTable.$inferInsert;

/**
 * Per-shift pay-tier override. When an outlet posts a shift it may override its
 * workspace rate card for that shift (the Post Job composer's pay-tier rows):
 * one row per requested PR tier, carrying the wage/commission/target that shift
 * pays plus the requested headcount (`pr_count`). Mirrors `outlet_tier_rate`
 * (the workspace default) so the earnings resolver reads either source with the
 * same shape; it prefers this row and falls back to the workspace default when a
 * field is null or no row exists. Reuses the shared `outlet_tier_rate_kind` enum
 * — no new type. A shift has many tier rows, so this is a child table (there is
 * no existing table that models per-shift, per-tier rates).
 */
export const ShiftPayTierTable = MainSchema.table('shift_pay_tier', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  shiftId: uuid('shift_id')
    .notNull()
    .references(() => ShiftTable.id, { onDelete: 'cascade' }),
  kind: tierRateKindEnum('kind').notNull().default('tier'),
  tier: varchar('tier', { length: 50 }),
  // Mirrors outlet_tier_rate: DB columns are `daily_wage` / `standard_shift_hours`
  // (a per-shift override of the workspace default). TS names kept as
  // wagePerHour/otAfterHours so the shared resolver shape and wire contract hold.
  wagePerHour: numeric('daily_wage', { precision: 12, scale: 2 }),
  drinkPct: numeric('drink_pct', { precision: 6, scale: 2 }).notNull().default('0'),
  happyHourDrinkPct: numeric('happy_hour_drink_pct', { precision: 6, scale: 2 }),
  tipPct: numeric('tip_pct', { precision: 6, scale: 2 }).notNull().default('0'),
  otAfterHours: numeric('standard_shift_hours', { precision: 6, scale: 2 }),
  targetSalesRm: numeric('target_sales_rm', { precision: 12, scale: 2 }),
  prCount: integer('pr_count').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull().default('system'),
  updatedBy: varchar('updated_by').notNull().default('system'),
});

export type ShiftPayTier = typeof ShiftPayTierTable.$inferSelect;
export type ShiftPayTierInsertType = typeof ShiftPayTierTable.$inferInsert;

export type ShiftFilter = {
  id?: string;
  agencyId?: string;
  outletId?: string;
  /** Restrict to a set of outlets — used to scope an outlet caller to its own venues. */
  outletIds?: string[];
  status?: ShiftStatus;
  eventKind?: ShiftEventKind;
  fromDate?: string;
  toDate?: string;
};
