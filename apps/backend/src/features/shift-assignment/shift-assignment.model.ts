import { numeric, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { AgencyTable } from '@/features/agency/agency.model';
import { ShiftTable } from '@/features/shift/shift.model';
import { PrTable } from '@/features/pr/pr.model';

// Roster lifecycle for a PR on a shift. Mirrors the frontend live-workforce states.
export const shiftAssignmentStatusValues = [
  'assigned',
  'confirmed',
  'completed',
  'no_show',
  'cancelled',
] as const;
export type ShiftAssignmentStatus = (typeof shiftAssignmentStatusValues)[number];
export const shiftAssignmentStatusEnum = MainSchema.enum(
  'shift_assignment_status',
  shiftAssignmentStatusValues,
);

/**
 * Assigns a PR to a shift — the many-to-many link a shift needs (quantity > 1
 * means several PRs staff one shift). `payAmount` is what this PR earns for the
 * shift; the weekly PV job groups completed assignments by PR and rolls them
 * into voucher lines. `agencyId` is denormalized from the shift for scoping.
 */
export const ShiftAssignmentTable = MainSchema.table(
  'shift_assignment',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => AgencyTable.id, { onDelete: 'cascade' }),
    shiftId: uuid('shift_id')
      .notNull()
      .references(() => ShiftTable.id, { onDelete: 'cascade' }),
    prId: uuid('pr_id')
      .notNull()
      .references(() => PrTable.id, { onDelete: 'cascade' }),
    status: shiftAssignmentStatusEnum('status').notNull().default('assigned'),
    payAmount: numeric('pay_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    checkInAt: timestamp('check_in_at', { withTimezone: true }),
    checkOutAt: timestamp('check_out_at', { withTimezone: true }),
    notes: varchar('notes', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by').notNull(),
    updatedBy: varchar('updated_by').notNull(),
  },
  (table) => ({
    // A PR can only be assigned to a given shift once.
    uniqShiftPr: unique('shift_assignment_shift_pr_unique').on(table.shiftId, table.prId),
  }),
);

export type ShiftAssignmentType = typeof ShiftAssignmentTable.$inferSelect;
export type ShiftAssignmentInsertType = typeof ShiftAssignmentTable.$inferInsert;

export type ShiftAssignmentFilter = {
  id?: string;
  agencyId?: string;
  shiftId?: string;
  prId?: string;
  status?: ShiftAssignmentStatus;
};
