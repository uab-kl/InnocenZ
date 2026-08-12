import { MainSchema } from '@/db/db.schema';
import { integer, jsonb, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { OutletTable } from '@/features/outlet/outlet.model.js';
import { ShiftAssignmentTable } from '@/features/shift-assignment/shift-assignment.model.js';

// One current outlet→PR rating (upsert keyed by outlet + PR). `prId` is a plain
// varchar, NOT a FK: an outlet's PR list is not backend-enumerable from the outlet
// token (the /pr + /shift routes are agency/admin-only), so the id may be a real
// PR uuid or the frontend's PR identifier. `prName` snapshots the name for display.
export const RatingTable = MainSchema.table(
  'rating',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    outletId: uuid('outlet_id')
      .notNull()
      .references(() => OutletTable.id, { onDelete: 'cascade' }),
    prId: varchar('pr_id', { length: 100 }).notNull(),
    /**
     * The shift this verdict was written about (0120). The row stays unique on
     * (outlet, PR) — one current verdict per PR per venue — and this records
     * WHICH night produced it, which is the only thing that can name the agency
     * that staffed it.
     *
     * Nullable: legacy rows have no honest answer, and `ON DELETE SET NULL`
     * means removing an assignment cannot delete a venue's opinion. A NULL reads
     * as "not attributable" and is therefore invisible to every agency rather
     * than visible to all of them.
     */
    shiftAssignmentId: uuid('shift_assignment_id').references(
      () => ShiftAssignmentTable.id,
      { onDelete: 'set null' },
    ),
    prName: varchar('pr_name', { length: 255 }).notNull().default(''),
    stars: integer('stars').notNull().default(0),
    note: varchar('note', { length: 2000 }).notNull().default(''),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by').notNull(),
    updatedBy: varchar('updated_by').notNull(),
  },
  (t) => [unique('rating_outlet_pr_unique').on(t.outletId, t.prId)],
);

export type Rating = typeof RatingTable.$inferSelect;
export type RatingInsertType = typeof RatingTable.$inferInsert;

export type RatingFilter = {
  outletId?: string;
  prId?: string;
  /**
   * Tenancy scopes, set by the controller from the caller's own memberships —
   * never from the query string. `outletIds` confines a venue operator to the
   * ratings written at its own venues; `prIds` confines an agency to ratings OF
   * ITS OWN PRs (`pr_id` is not a FK, so `pr.agency_id` is the only honest
   * link). An empty array means the caller owns nothing and must match NOTHING.
   */
  outletIds?: string[];
  prIds?: string[];
  /**
   * Confines an agency to the ratings earned on ITS OWN shift: the rating's
   * `shift_assignment_id` must point at an assignment whose `agency_id` is this
   * one.
   *
   * Two weaker rules came before it, and each leaked. Scoping on `prIds` alone
   * ("ratings of my PRs") handed agency A every rating the same person earned
   * through agency B, because a PR holds an `agency_pr` row per agency. Scoping
   * on "A ever supplied this PR to this venue" still gave the rating to BOTH
   * once the same PR worked the same venue through two agencies. Only the
   * assignment behind the verdict names the agency that actually staffed the
   * rated night.
   *
   * A rating with no assignment (legacy rows, `ON DELETE SET NULL`) matches NO
   * agency — unattributable is read as private, not as public.
   */
  agencySuppliedTo?: string;
};
