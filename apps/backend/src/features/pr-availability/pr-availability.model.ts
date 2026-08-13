import { date, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { UserTable } from '@/features/user/user.model';

/**
 * One day a PR has declared themselves NOT available to work.
 *
 * Keyed on the PERSON (`user_id`), deliberately not on the `agency_pr`
 * membership. "I cannot work on the 15th" is a fact about someone's life, not
 * about one roster — a PR who is on two agencies' books is unavailable to both,
 * and storing it per membership would let the same day disagree with itself.
 * That is database rule 3 (one fact, one table) applied to a fact that happens
 * to be read by several agencies.
 *
 * The row's EXISTENCE is the block; there is no `available` boolean to get out
 * of sync. Reopening a day deletes the row.
 *
 * ⚠️ This carries no `agency_id`, so it is not self-scoping. Every agency-facing
 * read has to reach the roster through `agency_pr` — see
 * `PrAvailabilityRepository.listForAgency`, which is the only agency read path
 * and joins the membership rather than trusting a caller-supplied PR id.
 */
export const PrAvailabilityTable = MainSchema.table(
  'pr_availability',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => UserTable.id, { onDelete: 'cascade' }),
    /**
     * `mode: 'string'` to match `shift.shift_date` exactly. Both sides of every
     * comparison in the assign guard are then plain `YYYY-MM-DD` strings, so a
     * blocked day is decided by calendar date and never by a server-timezone
     * instant — the trap that once sealed a full shift at RM0.00.
     */
    unavailableDate: date('unavailable_date', { mode: 'string' }).notNull(),
    /** Optional, PR-supplied. Shown to the agency; never required to block. */
    reason: varchar('reason', { length: 200 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by').notNull(),
    updatedBy: varchar('updated_by').notNull(),
  },
  (table) => [
    // Blocking an already-blocked day is a double-tap, not a second block. The
    // constraint is what lets the write be an idempotent upsert instead of a
    // read-then-insert race.
    unique('pr_availability_user_id_date_unique').on(table.userId, table.unavailableDate),
  ],
);

export type PrAvailabilityType = typeof PrAvailabilityTable.$inferSelect;
export type PrAvailabilityInsertType = typeof PrAvailabilityTable.$inferInsert;

/** A blocked day plus the person it belongs to, for the agency's roster read. */
export type PrAvailabilityWithPrType = PrAvailabilityType & {
  prName: string | null;
};
