import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { ShiftTable } from '@/features/shift/shift.model';
import {
  CutlostRequestAssignmentTable,
  CutlostRequestInsertType,
  CutlostRequestTable,
  CutlostRequestType,
} from './cutlost.model';

/**
 * ONE OPEN CUT-LOSS REQUEST PER SHIFT — held on the server (12 Nov 2026).
 *
 * Only the venue's screen enforced it: `OutletCutLossActions` locks its buttons
 * while a request is pending. A second tab, a double-submit or a direct call
 * could open another request on the same shift while the first was still
 * waiting, and if the agency approved both, both savings figures stood and two
 * `cut_slots` plans cut the shift twice. A check per ASSIGNMENT would not have
 * caught that: a `cut_slots` request names nobody (most requests carry no
 * assignment rows), and an assignment belongs to exactly one shift, so "the
 * shift already has a pending request" covers every named PR as well.
 *
 * ⚠️ PENDING ONLY. Several APPROVED requests on one shift raised one after
 * another — release one PR, later cut a slot — are legitimate and are not
 * refused; the decision on the first is what opens the door to the next.
 *
 * ⚠️ THE CHECK AND THE INSERT SHARE A TRANSACTION, behind a lock on the shift
 * row. Without the lock two submissions could each read "nothing pending"
 * before either wrote. `FOR NO KEY UPDATE` rather than `FOR UPDATE`: it
 * conflicts with itself, which is all the queue needs, but not with the
 * `KEY SHARE` lock a foreign-key insert takes — so seating a PR on this shift
 * meanwhile is not held up. Under READ COMMITTED the second writer's read runs
 * after it gets the lock, so it sees the first writer's committed request.
 *
 * Creates the request and its named assignments atomically, exactly as
 * `CutlostRepository.create` does (a `release_prs` row with no assignment rows
 * would read as a `cut_slots` request).
 */
export type GuardedCutlostCreate =
  | { kind: 'created'; request: CutlostRequestType }
  | { kind: 'pending_on_shift'; pendingRequestId: string }
  | { kind: 'shift_missing' };

export const PENDING_ON_SHIFT_MESSAGE =
  'This shift already has a cut-loss request waiting for the agency’s answer. ' +
  'Nothing was raised — wait for that answer before asking again.';

export async function createCutlostUnlessPending(
  request: CutlostRequestInsertType,
  assignmentIds: readonly string[],
): Promise<GuardedCutlostCreate> {
  return db.transaction(async (tx) => {
    const [shift] = await tx
      .select({ id: ShiftTable.id })
      .from(ShiftTable)
      .where(eq(ShiftTable.id, request.shiftId))
      .for('no key update');
    // Deleted between the controller's read and this one.
    if (!shift) return { kind: 'shift_missing' as const };

    const [open] = await tx
      .select({ id: CutlostRequestTable.id })
      .from(CutlostRequestTable)
      .where(
        and(eq(CutlostRequestTable.shiftId, request.shiftId), eq(CutlostRequestTable.status, 'pending')),
      )
      .limit(1);
    if (open) return { kind: 'pending_on_shift' as const, pendingRequestId: open.id };

    const [row] = await tx.insert(CutlostRequestTable).values(request).returning();
    const named = [...new Set(assignmentIds)];
    if (named.length > 0) {
      await tx.insert(CutlostRequestAssignmentTable).values(
        named.map((assignmentId) => ({
          requestId: row.id,
          assignmentId,
          createdBy: request.createdBy,
          updatedBy: request.updatedBy,
        })),
      );
    }
    return { kind: 'created' as const, request: row };
  });
}
