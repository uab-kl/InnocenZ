import {
  decimal,
  integer,
  jsonb,
  numeric,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { AgencyTable } from '@/features/agency/agency.model';
import { ShiftTable } from '@/features/shift/shift.model';
import { PrTable } from '@/features/pr/pr.model';

// Roster lifecycle for a PR on a shift. Mirrors the frontend live-workforce
// states. leave_pending/leave_approved are the PR MC/Leave flow: the PR files a
// request (reason on `notes`), the agency approves (excused, no penalty) or
// rejects (row returns to `assigned`).
export const shiftAssignmentStatusValues = [
  'assigned',
  'confirmed',
  'completed',
  'no_show',
  'cancelled',
  'leave_pending',
  'leave_approved',
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
    // Where the PR physically stood when they stamped attendance. Written only
    // by the PR's own check-in / check-out (never by the agency PUT), and only
    // as a SNAPSHOT at those two moments - this is not continuous tracking.
    // `distance_m` is the server's own recomputed metres from the outlet pin
    // (reached by FK: assignment -> shift -> outlet.lat/lng), never a distance
    // the phone claimed. `accuracy_m` is the device's reported confidence
    // radius, kept for audit. All nullable: rows predating this, and outlets
    // that have not dropped a pin yet, simply carry no fix.
    checkInLat: decimal('check_in_lat', { precision: 10, scale: 8 }),
    checkInLng: decimal('check_in_lng', { precision: 11, scale: 8 }),
    checkInDistanceM: integer('check_in_distance_m'),
    checkInAccuracyM: integer('check_in_accuracy_m'),
    checkOutLat: decimal('check_out_lat', { precision: 10, scale: 8 }),
    checkOutLng: decimal('check_out_lng', { precision: 11, scale: 8 }),
    checkOutDistanceM: integer('check_out_distance_m'),
    checkOutAccuracyM: integer('check_out_accuracy_m'),
    notes: varchar('notes', { length: 500 }),
    // MC / medical-certificate proof for a leave request — the photos the PR
    // uploads with `leave_pending`, reviewed by the agency before it approves.
    // Same array-of-images shape as PaymentVoucherLineTable.proofPhotos, and
    // lives on THIS row (not a new table) because the proof only ever means
    // anything for this one assignment's leave request. Null on every row that
    // never filed leave; survives approve/reject so the decision stays audited.
    leaveProofPhotos: jsonb('leave_proof_photos').$type<string[]>(),
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

/**
 * An assignment plus the shift/PR context a caller would otherwise fetch
 * separately. Outlet callers cannot read `/pr`, so the list endpoint carries the
 * PR name inline; `outletId` / `shiftDate` come from the joined shift.
 */
export type ShiftAssignmentWithContextType = ShiftAssignmentType & {
  prName: string | null;
  outletId: string;
  shiftDate: string;
};

export type ShiftAssignmentFilter = {
  id?: string;
  agencyId?: string;
  shiftId?: string;
  prId?: string;
  status?: ShiftAssignmentStatus;
  /**
   * Pins an outlet caller to the venues it belongs to (matched on the joined
   * shift). An empty array matches nothing — never treat it as "no filter".
   */
  outletIds?: string[];
};

/**
 * Scope + window for the cost side of the outlet sales report. Mirrors the
 * shift-sale report filter (agency OR a set of outlets, over a shift-date range)
 * so the same resolved scope can drive both the revenue and cost aggregates.
 */
export type ShiftAssignmentCostFilter = {
  agencyId?: string;
  outletId?: string;
  /** An empty array matches nothing — never treat it as "no filter". */
  outletIds?: string[];
  fromDate?: string;
  toDate?: string;
};

/**
 * One PR's manpower cost on one day (report costByPrDay row). Kept at
 * (PR × day) granularity — not collapsed to a window total — so the client can
 * slice it to any selected date range and still roll up both per-day P&L and
 * per-PR "top performers" without paging through raw assignment rows.
 */
export type ShiftCostPrDayTotals = {
  prId: string;
  prName: string | null;
  soldOn: string;
  cost: number;
};
