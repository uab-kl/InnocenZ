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
import { UserTable } from '@/features/user/user.model';

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

/**
 * The agency's decision on overtime worked past the scheduled end (0077).
 *
 * A plain varchar rather than a PG enum, and NULL rather than a default: NULL
 * means "no overtime on this shift", which is the overwhelming majority of rows,
 * and a defaulted enum would turn every ordinary shift into a pending decision
 * somebody has to clear.
 */
export const overtimeStatusValues = ['pending', 'approved', 'rejected'] as const;
export type OvertimeStatus = (typeof overtimeStatusValues)[number];
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
    /**
     * Legacy payee key. After 0089 this equals `user_id` (no FK — `main.pr` dropped).
     * Prefer `userId` in new code.
     */
    prId: uuid('pr_id').notNull(),
    /** Preferred ops key (0087/0089) — equals pr_id after remap. */
    userId: uuid('user_id').references(() => UserTable.id, { onDelete: 'set null' }),
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
    /**
     * Overtime, and the agency's decision on it (migration 0077).
     *
     * ⚠️ `overtimeMinutes` is recorded AT CHECK-OUT, not derived later, because
     * check-out CLAMPS `checkOutAt` to the shift's scheduled end — so by the time
     * anyone reviews it, the stamps can no longer say how long the PR actually
     * stayed. The clamp is deliberate (wages seal to the shift window); this is
     * the evidence it would otherwise destroy.
     *
     * NULL status = no overtime on this shift, which is most rows. Overtime is
     * NEVER auto-paid: it becomes money only when an agency owner/finance user
     * approves it, at which point a `component='ot'` voucher line is written.
     *
     * `overtimeAmount` freezes what was APPROVED. Never recompute it from the
     * current rate — that would silently restate a decision someone already made,
     * the same rule as `payment_voucher_day_review.approved_total_cents`.
     */
    overtimeMinutes: integer('overtime_minutes'),
    overtimeStatus: varchar('overtime_status', { length: 20 }).$type<OvertimeStatus>(),
    overtimeAmount: numeric('overtime_amount', { precision: 12, scale: 2 }),
    overtimeDecidedAt: timestamp('overtime_decided_at', { withTimezone: true }),
    overtimeDecidedBy: varchar('overtime_decided_by'),
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
