import { date, integer, numeric, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { AgencyTable } from '@/features/agency/agency.model';
import { OutletTable } from '@/features/outlet/outlet.model';
import { UserTable } from '@/features/user/user.model';
import { tierRateKindEnum } from '@/features/outlet-workspace/outlet-workspace.model';

// Mirrors the frontend ShiftRequest.status lifecycle (agency-portal store).
export const shiftStatusValues = ['draft', 'open', 'confirmed', 'sealed'] as const;
export type ShiftStatus = (typeof shiftStatusValues)[number];
export const shiftStatusEnum = MainSchema.enum('shift_status', shiftStatusValues);

/**
 * Shift statuses that may take a PR.
 *
 * A `draft` was never published — the outlet is still editing it, and seating
 * someone notifies a PR, reserves their evening and prices a wage against a shift
 * the venue has not agreed to yet. A `sealed` shift is closed for payroll, so a
 * row added after the fact is money nobody has budgeted.
 *
 * ⚠️ Until this existed the assign lanes tested NO shift status at all, so both
 * were accepted, and the two clients had each invented their own answer: the
 * auto-assign planner allowed `open`/`confirmed`, the manual assign dialog allowed
 * everything except `sealed`. **The API was looser than either of them.** That is
 * the wrong direction for a disagreement — a client can only be wrong about what
 * it OFFERS, while the server is what actually happens — so the rule lives here
 * and the clients mirror it.
 */
export const ASSIGNABLE_SHIFT_STATUSES = ['open', 'confirmed'] as const satisfies ReadonlyArray<ShiftStatus>;

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
  /**
   * ⚠️ THE ORIGINATING AGENCY ONLY — not "the agency of this shift" (0124).
   *
   * Since an outlet can post one shift to several agencies at once, the set of
   * agencies staffing a shift lives in `shift_agency`. This column holds the
   * first agency the outlet addressed, which is still a true fact and is what
   * keeps the column NOT NULL without a `string | null` ripple through every
   * consumer.
   *
   * NEVER SCOPE BY THIS. Filtering `agency_id = $me` hides the shift from every
   * invited agency except the first, and the symptom — "the other agency just
   * doesn't see it" — comes with no error anywhere. Use `shift_agency`.
   */
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
  /**
   * Which event template this shift was posted from (0128), or null for a
   * blank post. Plain uuid here — the FK (SET NULL on template delete) lives
   * in the DDL, because `shift_template.model.ts` imports this file's enum
   * and a `.references()` back at it would be a module cycle.
   */
  templateId: uuid('template_id'),
  languages: varchar('languages', { length: 255 }),
  /**
   * What the venue asked people to WEAR (0132) — free text with five
   * suggestions, not a controlled vocabulary, because the composer's "Other"
   * exists so the list does not bound it.
   *
   * Same 60 as `shift_template.dress_code`: a template's dress code is this
   * same fact one step earlier, and the composer copies it straight across, so
   * two widths for one value would make a template that saves fine into a shift
   * that will not post. NULL means "none was given", which is a different fact
   * from "no particular dress code" — the screens print nothing for it.
   */
  dressCode: varchar('dress_code', { length: 60 }),
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
 * Which agencies a shift was posted to (migration 0124).
 *
 * THE authoritative answer to "who may staff this shift" — `shift.agency_id` is
 * only the first agency addressed. Shared fulfilment means several rows here
 * for one shift, and each invited agency may send PRs until the headcount is
 * met; who actually supplied each PR is `shift_assignment.agency_id`.
 *
 * A child table rather than an array column so it can be joined, indexed and
 * FK-constrained — and so an agency losing its invitation is a DELETE, not a
 * read-modify-write of a list.
 */
export const ShiftAgencyTable = MainSchema.table('shift_agency', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  shiftId: uuid('shift_id')
    .notNull()
    .references(() => ShiftTable.id, { onDelete: 'cascade' }),
  agencyId: uuid('agency_id')
    .notNull()
    .references(() => AgencyTable.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull().default('system'),
  updatedBy: varchar('updated_by').notNull().default('system'),
});

export type ShiftAgencyType = typeof ShiftAgencyTable.$inferSelect;

/**
 * A named-PR REQUEST from the venue — a want, not a booking (0131).
 *
 * The Post Job picker has let an outlet hand-pick faces since it shipped, and
 * the client dropped the picks on the floor: "named PR ids have no backend
 * column". This is the column. The agency stays the only party that can turn
 * a want into a seat, so "booked" is NOT stored here — it is derived from a
 * `shift_assignment` row existing for the same (shift, person). One fact,
 * one place.
 *
 * `agencyId` records WHICH agency the ask is addressed to, and is what scopes
 * the agency read: each agency sees only the requests addressed to it, never a
 * rival's. One venue pick fans out to EVERY invited agency holding that PR
 * (0150), so a person legitimately has SEVERAL rows on one shift.
 *
 * ⚠️ THE KEY IS THE THREE COLUMNS, and it is declared here on purpose. 0131
 * created the table with UNIQUE (shift_id, user_id) and the model declared no
 * key at all — so reading the model said "several agencies are fine" while the
 * database rejected the second one. The insert is `onConflictDoNothing`, so it
 * was discarded in silence and the shift kept one arbitrary agency. A key that
 * lives only in the database is a key nobody reviewing this file can see.
 *
 * `userId`, not prId: there is no `pr` table — a PR is a `user` row (0089).
 */
export const ShiftPrRequestTable = MainSchema.table(
  'shift_pr_request',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    shiftId: uuid('shift_id')
      .notNull()
      .references(() => ShiftTable.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => UserTable.id, { onDelete: 'cascade' }),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => AgencyTable.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by').notNull().default('system'),
    updatedBy: varchar('updated_by').notNull().default('system'),
  },
  (table) => [
    unique('shift_pr_request_shift_user_agency_unique').on(
      table.shiftId,
      table.userId,
      table.agencyId,
    ),
  ],
);

export type ShiftPrRequestType = typeof ShiftPrRequestTable.$inferSelect;

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
