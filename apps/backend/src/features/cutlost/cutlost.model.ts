import { integer, jsonb, numeric, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { ShiftTable } from '@/features/shift/shift.model';
import { ShiftAssignmentTable } from '@/features/shift-assignment/shift-assignment.model';

/**
 * What an outlet is asking to cut (migration 0098).
 *
 * `release_prs` sends named PRs home early; `cut_slots` drops unfilled slots and
 * touches nobody; `best_effort` is the recommender's mixed plan. The three share
 * one table because they share a lifecycle — requested by an outlet, decided by
 * an agency — and differ only in which fields they populate.
 */
export const cutlostRequestKindValues = ['release_prs', 'cut_slots', 'best_effort'] as const;
export type CutlostRequestKind = (typeof cutlostRequestKindValues)[number];

export const cutlostRequestStatusValues = ['pending', 'approved', 'rejected'] as const;
export type CutlostRequestStatus = (typeof cutlostRequestStatusValues)[number];

/**
 * One outlet's request to spend less on one shift.
 *
 * Plain varchars rather than PG enums, matching `overtime_status`: the values are
 * owned by the unions above, and an enum would need a migration every time the
 * product adds a kind.
 *
 * ⚠️ Nothing reachable by FK is stored here. Outlet, agency, PR names, the
 * shift's date and slot all come from `shift` and its joins; the web UI's
 * `outletName`, `shiftLabel` and `releasedPrNames` render from those, never from
 * a copy on this row. One fact, one table.
 */
export const CutlostRequestTable = MainSchema.table('cutlost_request', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  shiftId: uuid('shift_id')
    .notNull()
    .references(() => ShiftTable.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 20 }).$type<CutlostRequestKind>().notNull(),
  status: varchar('status', { length: 20 })
    .$type<CutlostRequestStatus>()
    .notNull()
    .default('pending'),
  /**
   * Unfilled slots taken off the plan. NULL on a pure `release_prs` request,
   * which is NOT the same as 0 — that means a `best_effort` plan which cut no
   * slots and only released people.
   */
  slotsCut: integer('slots_cut'),
  /**
   * What the OUTLET was shown when it asked, frozen at that moment.
   *
   * Never recompute this for the agency's screen. The rate card can move between
   * the request and the decision, and the two parties would then be looking at
   * different numbers for the same approval — the same rule that makes
   * `overtime_amount` and `approved_total_cents` frozen columns.
   */
  estimatedSavings: numeric('estimated_savings', { precision: 12, scale: 2 })
    .notNull()
    .default('0'),
  /** The recommender's reasons as shown to the outlet (`best_effort` only). */
  rationale: jsonb('rationale').$type<string[]>(),
  declineReason: varchar('decline_reason', { length: 500 }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decidedBy: varchar('decided_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

/**
 * The assignments a release names.
 *
 * FK to the ASSIGNMENT, not to the user: the thing being closed is one PR on one
 * shift, and a PR can hold several assignments — including two on one night at
 * different venues. Keying on the user would leave the release ambiguous about
 * which shift it actually ends.
 */
export const CutlostRequestAssignmentTable = MainSchema.table(
  'cutlost_request_assignment',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => CutlostRequestTable.id, { onDelete: 'cascade' }),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => ShiftAssignmentTable.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by').notNull(),
    updatedBy: varchar('updated_by').notNull(),
  },
  (table) => ({
    uniqRequestAssignment: unique('cutlost_request_assignment_unique').on(
      table.requestId,
      table.assignmentId,
    ),
  }),
);

export type CutlostRequestType = typeof CutlostRequestTable.$inferSelect;
export type CutlostRequestInsertType = typeof CutlostRequestTable.$inferInsert;

/**
 * A request plus the context every screen needs, resolved by FK rather than
 * stored: the venue and event it is about, and the PRs a release would send
 * home. Mirrors the web prototype's `PendingCutlostRequest` so the existing UI
 * renders it without a second shape to maintain.
 */
export type CutlostRequestWithContext = CutlostRequestType & {
  outletId: string;
  outletName: string | null;
  agencyId: string;
  shiftDate: string;
  slot: string | null;
  eventName: string | null;
  releasedAssignments: Array<{
    assignmentId: string;
    prId: string;
    prName: string | null;
    /** What the release sealed. Null until the row is actually closed. */
    payAmount: string | null;
    status: string;
  }>;
};
