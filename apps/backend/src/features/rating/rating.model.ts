import { MainSchema } from '@/db/db.schema';
import { integer, jsonb, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { OutletTable } from '@/features/outlet/outlet.model.js';

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
};
