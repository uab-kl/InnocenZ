import { and, asc, desc, eq, inArray, notInArray, sql, SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { OutletTable } from '@/features/outlet/outlet.model';
import { PrTable } from '@/features/pr/pr.model';
import { ShiftTable } from '@/features/shift/shift.model';
import { ShiftAssignmentTable } from '@/features/shift-assignment/shift-assignment.model';
import { NON_STAFFING_STATUSES } from '@/features/shift-assignment/shift-assignment.repository';
import {
  OutletSwapFilter,
  OutletSwapRequestInsertType,
  OutletSwapRequestTable,
  OutletSwapRequestType,
} from './outlet-swap.model';

/**
 * A swap plus the context both sides render: who is being moved, and the
 * date/slot/outlet on each end. All of it is FK-joined — never copied onto the
 * swap row — so renaming an outlet or re-timing a shift is reflected everywhere.
 */
export type OutletSwapRequestWithContext = OutletSwapRequestType & {
  prId: string;
  prName: string | null;
  fromShiftDate: string;
  fromSlot: string | null;
  fromOutletId: string;
  fromOutletName: string | null;
  toShiftDate: string;
  toSlot: string | null;
  toEventName: string | null;
  toOutletId: string;
  toOutletName: string | null;
};

/**
 * Why an approval was refused. Every one of these is a state the PR's screen
 * can legitimately be showing when they tap Approve — the roster moves under
 * them — so each is a normal outcome the caller turns into a 409 with a
 * specific message, not an exception.
 */
export type OutletSwapApprovalRejection =
  | 'not_found'
  | 'not_pending'
  | 'destination_full'
  | 'date_mismatch'
  | 'already_assigned';

export type OutletSwapApprovalResult =
  | { ok: true; request: OutletSwapRequestType }
  | { ok: false; reason: OutletSwapApprovalRejection };

/** Same display rule as the roster: nickname when set, else legal name. */
const prDisplayNameSql = sql<string>`coalesce(nullif(trim(${PrTable.nickname}), ''), ${PrTable.name})`;

// A swap has two shifts and two outlets in one row, so each side needs its own
// alias to join twice without the second clobbering the first.
const FromShift = alias(ShiftTable, 'from_shift');
const ToShift = alias(ShiftTable, 'to_shift');
const FromOutlet = alias(OutletTable, 'from_outlet');
const ToOutlet = alias(OutletTable, 'to_outlet');

export class OutletSwapRepositoryClass {
  async create(
    data: Omit<OutletSwapRequestInsertType, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<OutletSwapRequestType> {
    try {
      const [request] = await db.insert(OutletSwapRequestTable).values(data).returning();
      logger.info('[OutletSwapRepository.create] Swap requested:', request.id);
      return request;
    } catch (error) {
      logger.error('[OutletSwapRepository.create] Error:', error);
      throw error;
    }
  }

  async getById(id: string): Promise<OutletSwapRequestType | null> {
    try {
      const [request] = await db
        .select()
        .from(OutletSwapRequestTable)
        .where(eq(OutletSwapRequestTable.id, id))
        .limit(1);
      return request ?? null;
    } catch (error) {
      logger.error('[OutletSwapRepository.getById] Error:', error);
      throw error;
    }
  }

  /**
   * Swaps matching the filter, newest first, with both ends resolved. `prId`
   * lives on the assignment rather than the swap row, so it is both selected and
   * filtered through the inner join — the swap table has no PR column to
   * duplicate.
   */
  async list(filter?: OutletSwapFilter): Promise<OutletSwapRequestWithContext[]> {
    try {
      const conditions: SQL[] = [];
      if (filter?.assignmentId) {
        conditions.push(eq(OutletSwapRequestTable.assignmentId, filter.assignmentId));
      }
      if (filter?.agencyId) conditions.push(eq(OutletSwapRequestTable.agencyId, filter.agencyId));
      if (filter?.prId) conditions.push(eq(ShiftAssignmentTable.prId, filter.prId));
      if (filter?.status) conditions.push(eq(OutletSwapRequestTable.status, filter.status));

      const rows = await db
        .select({
          request: OutletSwapRequestTable,
          prId: ShiftAssignmentTable.prId,
          prName: prDisplayNameSql,
          fromShiftDate: FromShift.shiftDate,
          fromSlot: FromShift.slot,
          fromOutletId: FromShift.outletId,
          fromOutletName: FromOutlet.name,
          toShiftDate: ToShift.shiftDate,
          toSlot: ToShift.slot,
          toEventName: ToShift.eventName,
          toOutletId: ToShift.outletId,
          toOutletName: ToOutlet.name,
        })
        .from(OutletSwapRequestTable)
        .innerJoin(
          ShiftAssignmentTable,
          eq(OutletSwapRequestTable.assignmentId, ShiftAssignmentTable.id),
        )
        .innerJoin(FromShift, eq(OutletSwapRequestTable.fromShiftId, FromShift.id))
        .innerJoin(ToShift, eq(OutletSwapRequestTable.toShiftId, ToShift.id))
        .leftJoin(PrTable, eq(ShiftAssignmentTable.prId, PrTable.id))
        .leftJoin(FromOutlet, eq(FromShift.outletId, FromOutlet.id))
        .leftJoin(ToOutlet, eq(ToShift.outletId, ToOutlet.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(OutletSwapRequestTable.createdAt));

      return rows.map(({ request, ...context }) => ({ ...request, ...context }));
    } catch (error) {
      logger.error('[OutletSwapRepository.list] Error:', error);
      throw error;
    }
  }

  /**
   * Approve a pending swap: move the assignment to the destination shift.
   *
   * The whole point of the transaction is that the capacity check and the move
   * cannot be separated — two PRs approving swaps into the last free slot at the
   * same moment must not both succeed. `SELECT ... FOR UPDATE` on the
   * destination shift serialises them, so the second one re-counts after the
   * first has committed and gets `destination_full`.
   *
   * Capacity is COUNTED from live assignments, not read from `shift.filled`.
   * That column is dead data: nothing outside the seed scripts has ever written
   * it (`grep -rn filled src/`), so trusting it would reject swaps into empty
   * shifts and wave them into full ones. "Live" excludes cancelled / no-show /
   * leave-approved, matching listBackfillSlots' definition of staffed.
   *
   * `agency_id` moves with `shift_id` because shift_assignment denormalises it
   * from the shift; updating only shift_id leaves the row claiming an agency
   * that does not run the shift it now points at, which silently corrupts every
   * agency-scoped query the PV generator and roster depend on.
   */
  async approve(params: {
    id: string;
    prNote?: string | null;
    respondedBy: string;
  }): Promise<OutletSwapApprovalResult> {
    const { id, prNote, respondedBy } = params;
    try {
      return await db.transaction(async (tx): Promise<OutletSwapApprovalResult> => {
        // Lock the request first so a concurrent approve/decline/cancel of the
        // SAME row queues behind us rather than both resolving it.
        const [request] = await tx
          .select()
          .from(OutletSwapRequestTable)
          .where(eq(OutletSwapRequestTable.id, id))
          .limit(1)
          .for('update');
        if (!request) return { ok: false, reason: 'not_found' };
        if (request.status !== 'pending_pr') return { ok: false, reason: 'not_pending' };

        const [assignment] = await tx
          .select()
          .from(ShiftAssignmentTable)
          .where(eq(ShiftAssignmentTable.id, request.assignmentId))
          .limit(1)
          .for('update');
        if (!assignment) return { ok: false, reason: 'not_found' };

        // Lock the destination shift: this is what makes the count below a
        // decision rather than a guess.
        const [toShift] = await tx
          .select()
          .from(ShiftTable)
          .where(eq(ShiftTable.id, request.toShiftId))
          .limit(1)
          .for('update');
        if (!toShift) return { ok: false, reason: 'not_found' };

        // A swap moves a PR between venues on the same night. If the origin has
        // been re-dated since the request was raised, this is no longer the swap
        // the agency proposed or the PR agreed to.
        const [fromShift] = await tx
          .select({ shiftDate: ShiftTable.shiftDate })
          .from(ShiftTable)
          .where(eq(ShiftTable.id, assignment.shiftId))
          .limit(1);
        if (!fromShift || fromShift.shiftDate !== toShift.shiftDate) {
          return { ok: false, reason: 'date_mismatch' };
        }

        const existing = await tx
          .select({
            prId: ShiftAssignmentTable.prId,
            id: ShiftAssignmentTable.id,
          })
          .from(ShiftAssignmentTable)
          .where(
            and(
              eq(ShiftAssignmentTable.shiftId, request.toShiftId),
              notInArray(ShiftAssignmentTable.status, [...NON_STAFFING_STATUSES]),
            ),
          );

        // Already on the destination shift (a duplicate request, or the agency
        // assigned them directly in the meantime). Moving would trip
        // shift_assignment_shift_pr_unique; report it instead of throwing.
        if (existing.some((row) => row.prId === assignment.prId && row.id !== assignment.id)) {
          return { ok: false, reason: 'already_assigned' };
        }

        if (existing.length >= toShift.quantity) {
          return { ok: false, reason: 'destination_full' };
        }

        const now = new Date();
        await tx
          .update(ShiftAssignmentTable)
          .set({
            shiftId: request.toShiftId,
            agencyId: toShift.agencyId,
            updatedAt: now,
            updatedBy: respondedBy,
          })
          .where(eq(ShiftAssignmentTable.id, assignment.id));

        const [approved] = await tx
          .update(OutletSwapRequestTable)
          .set({
            status: 'approved',
            prNote: prNote ?? request.prNote,
            respondedAt: now,
            updatedAt: now,
            updatedBy: respondedBy,
          })
          .where(eq(OutletSwapRequestTable.id, id))
          .returning();

        logger.info(
          `[OutletSwapRepository.approve] Assignment ${assignment.id} moved to shift ${request.toShiftId}`,
        );
        return { ok: true, request: approved };
      });
    } catch (error) {
      logger.error('[OutletSwapRepository.approve] Error:', error);
      throw error;
    }
  }

  /**
   * Close a pending swap without moving anyone: `declined` by the PR,
   * `cancelled` by the agency retracting it. Guarded on the current status so a
   * late tap cannot reopen or overwrite a resolved request; a null return means
   * "no longer pending", which the caller reports rather than treating as
   * success.
   */
  async resolveWithoutMoving(params: {
    id: string;
    status: 'declined' | 'cancelled';
    note?: string | null;
    respondedBy: string;
  }): Promise<OutletSwapRequestType | null> {
    const { id, status, note, respondedBy } = params;
    try {
      const now = new Date();
      const [request] = await db
        .update(OutletSwapRequestTable)
        .set({
          status,
          // The PR's reason for declining; an agency cancellation leaves it be.
          ...(status === 'declined' && note !== undefined ? { prNote: note } : {}),
          respondedAt: now,
          updatedAt: now,
          updatedBy: respondedBy,
        })
        .where(
          and(
            eq(OutletSwapRequestTable.id, id),
            eq(OutletSwapRequestTable.status, 'pending_pr'),
          ),
        )
        .returning();
      return request ?? null;
    } catch (error) {
      logger.error('[OutletSwapRepository.resolveWithoutMoving] Error:', error);
      throw error;
    }
  }

  /**
   * Live headcount for a set of shifts — how many PRs each is actually staffed
   * with right now. Lets the agency's target picker grey out shifts that would
   * fail the capacity check on approval, instead of letting it raise a request
   * that can only ever be rejected.
   */
  async countLiveAssignments(shiftIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (shiftIds.length === 0) return counts;
    try {
      const rows = await db
        .select({
          shiftId: ShiftAssignmentTable.shiftId,
          staffed: sql<number>`count(*)::int`,
        })
        .from(ShiftAssignmentTable)
        .where(
          and(
            inArray(ShiftAssignmentTable.shiftId, [...new Set(shiftIds)]),
            notInArray(ShiftAssignmentTable.status, [...NON_STAFFING_STATUSES]),
          ),
        )
        .groupBy(ShiftAssignmentTable.shiftId);
      for (const row of rows) counts.set(row.shiftId, row.staffed);
      return counts;
    } catch (error) {
      logger.error('[OutletSwapRepository.countLiveAssignments] Error:', error);
      throw error;
    }
  }

  /**
   * Candidate destination shifts for a swap: everything else running that night
   * that the agency could move the PR to, with live headcount so the caller can
   * mark the full ones. Excludes the PR's current shift (a swap must move them)
   * and draft/sealed shifts (not staffable).
   */
  async listSwapTargets(params: {
    agencyId: string;
    shiftDate: string;
    excludeShiftId: string;
  }): Promise<
    Array<{
      shiftId: string;
      shiftDate: string;
      slot: string | null;
      eventName: string | null;
      outletId: string;
      outletName: string | null;
      quantity: number;
      staffedCount: number;
    }>
  > {
    try {
      const shifts = await db
        .select({
          shiftId: ShiftTable.id,
          shiftDate: ShiftTable.shiftDate,
          slot: ShiftTable.slot,
          eventName: ShiftTable.eventName,
          outletId: ShiftTable.outletId,
          outletName: OutletTable.name,
          quantity: ShiftTable.quantity,
        })
        .from(ShiftTable)
        .leftJoin(OutletTable, eq(ShiftTable.outletId, OutletTable.id))
        .where(
          and(
            eq(ShiftTable.agencyId, params.agencyId),
            eq(ShiftTable.shiftDate, params.shiftDate),
            inArray(ShiftTable.status, ['open', 'confirmed']),
          ),
        )
        .orderBy(asc(OutletTable.name));

      const targets = shifts.filter((s) => s.shiftId !== params.excludeShiftId);
      if (targets.length === 0) return [];

      const counts = await this.countLiveAssignments(targets.map((s) => s.shiftId));
      return targets.map((s) => ({ ...s, staffedCount: counts.get(s.shiftId) ?? 0 }));
    } catch (error) {
      logger.error('[OutletSwapRepository.listSwapTargets] Error:', error);
      throw error;
    }
  }
}
