import { timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { AgencyTable } from '@/features/agency/agency.model';
import { ShiftTable } from '@/features/shift/shift.model';
import { ShiftAssignmentTable } from '@/features/shift-assignment/shift-assignment.model';

// An outlet swap is a request, not a move: the agency proposes that a rostered
// PR works a different outlet's shift on the same night, and nothing changes
// until the PR approves. `pending_pr` is the only live state; the other three
// are terminal.
export const outletSwapStatusValues = [
  'pending_pr',
  'approved',
  'declined',
  'cancelled',
] as const;
export type OutletSwapStatus = (typeof outletSwapStatusValues)[number];
export const outletSwapStatusEnum = MainSchema.enum(
  'outlet_swap_status',
  outletSwapStatusValues,
);

/**
 * A pending or resolved outlet swap for one shift assignment.
 *
 * Points at the destination **shift**, not just an outlet: approving repoints
 * `shift_assignment.shift_id` (and `agency_id`, which is denormalized from the
 * shift) at `to_shift_id`, so the target has to be a concrete shift row.
 *
 * `from_shift_id` is kept even though it is derivable at request time, because
 * the assignment moves on approval and the original shift would otherwise be
 * unrecoverable from the record.
 */
export const OutletSwapRequestTable = MainSchema.table('outlet_swap_request', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  assignmentId: uuid('assignment_id')
    .notNull()
    .references(() => ShiftAssignmentTable.id, { onDelete: 'cascade' }),
  fromShiftId: uuid('from_shift_id')
    .notNull()
    .references(() => ShiftTable.id, { onDelete: 'cascade' }),
  toShiftId: uuid('to_shift_id')
    .notNull()
    .references(() => ShiftTable.id, { onDelete: 'cascade' }),
  // Who raised it. Scoping column, mirroring shift_assignment.agency_id.
  agencyId: uuid('agency_id')
    .notNull()
    .references(() => AgencyTable.id, { onDelete: 'cascade' }),
  agencyNote: varchar('agency_note', { length: 500 }),
  prNote: varchar('pr_note', { length: 500 }),
  status: outletSwapStatusEnum('status').notNull().default('pending_pr'),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type OutletSwapRequestType = typeof OutletSwapRequestTable.$inferSelect;
export type OutletSwapRequestInsertType = typeof OutletSwapRequestTable.$inferInsert;

export type OutletSwapFilter = {
  assignmentId?: string;
  agencyId?: string;
  prId?: string;
  status?: OutletSwapStatus;
};
