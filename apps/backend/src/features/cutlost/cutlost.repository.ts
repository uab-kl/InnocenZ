import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { ShiftTable } from '@/features/shift/shift.model';
import { OutletTable } from '@/features/outlet/outlet.model';
import { ShiftAssignmentTable } from '@/features/shift-assignment/shift-assignment.model';
import { UserTable } from '@/features/user/user.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import {
  CutlostRequestAssignmentTable,
  CutlostRequestInsertType,
  CutlostRequestStatus,
  CutlostRequestTable,
  CutlostRequestType,
  CutlostRequestWithContext,
} from './cutlost.model';

/**
 * A PR's display name: preferred nickname when set, otherwise legal name — the
 * same rule the roster uses. `main.pr` is gone (0095), so the nickname is
 * `user.username` and the legal name is `user_profile.full_name`.
 */
const prDisplayNameSql = sql<string>`coalesce(nullif(trim(${UserTable.username}), ''), nullif(trim(${UserProfileTable.fullName}), ''), 'PR')`;

/** `shift_assignment.user_id` when set, else the legacy `pr_id` (equal post-0089). */
const assigneeUserId = sql`coalesce(${ShiftAssignmentTable.userId}, ${ShiftAssignmentTable.prId})`;

export class CutlostRepositoryClass {
  /**
   * Creates the request and its named assignments in ONE transaction.
   *
   * Atomic on purpose: a `release_prs` row with no assignment rows behind it is
   * indistinguishable from a `cut_slots` request, so a half-written pair would
   * silently become a different kind of request than the outlet submitted.
   */
  async create(
    request: CutlostRequestInsertType,
    assignmentIds: string[],
  ): Promise<CutlostRequestType> {
    try {
      return await db.transaction(async (tx) => {
        const [row] = await tx.insert(CutlostRequestTable).values(request).returning();
        if (assignmentIds.length > 0) {
          await tx.insert(CutlostRequestAssignmentTable).values(
            [...new Set(assignmentIds)].map((assignmentId) => ({
              requestId: row.id,
              assignmentId,
              createdBy: request.createdBy,
              updatedBy: request.updatedBy,
            })),
          );
        }
        return row;
      });
    } catch (error) {
      logger.error('[CutlostRepository.create] Error:', error);
      throw error;
    }
  }

  /** The assignment ids one request names. */
  async listAssignmentIds(requestId: string): Promise<string[]> {
    try {
      const rows = await db
        .select({ assignmentId: CutlostRequestAssignmentTable.assignmentId })
        .from(CutlostRequestAssignmentTable)
        .where(eq(CutlostRequestAssignmentTable.requestId, requestId));
      return rows.map((r) => r.assignmentId);
    } catch (error) {
      logger.error('[CutlostRepository.listAssignmentIds] Error:', error);
      throw error;
    }
  }

  async getById(id: string): Promise<CutlostRequestWithContext | null> {
    const rows = await this.listWithContext({ id });
    return rows[0] ?? null;
  }

  /**
   * Requests with the venue/shift/PR context every screen needs, resolved by FK.
   *
   * `agencyId` and `outletId` are joined from `shift` rather than stored, and
   * that join is also what SCOPES the query: an agency sees requests raised
   * against its own shifts, an outlet sees the ones raised at its own venues.
   */
  async listWithContext(filter: {
    id?: string;
    agencyId?: string;
    outletIds?: string[];
    shiftId?: string;
    status?: CutlostRequestStatus;
  }): Promise<CutlostRequestWithContext[]> {
    try {
      const where = [
        filter.id ? eq(CutlostRequestTable.id, filter.id) : undefined,
        filter.agencyId ? eq(ShiftTable.agencyId, filter.agencyId) : undefined,
        // An empty array matches NOTHING — never treat it as "no filter", or an
        // outlet member with no venues would read every venue's requests.
        filter.outletIds ? inArray(ShiftTable.outletId, filter.outletIds) : undefined,
        filter.shiftId ? eq(CutlostRequestTable.shiftId, filter.shiftId) : undefined,
        filter.status ? eq(CutlostRequestTable.status, filter.status) : undefined,
      ].filter(Boolean);

      const rows = await db
        .select({
          request: CutlostRequestTable,
          outletId: ShiftTable.outletId,
          outletName: OutletTable.name,
          agencyId: ShiftTable.agencyId,
          shiftDate: ShiftTable.shiftDate,
          slot: ShiftTable.slot,
          eventName: ShiftTable.eventName,
        })
        .from(CutlostRequestTable)
        .innerJoin(ShiftTable, eq(CutlostRequestTable.shiftId, ShiftTable.id))
        .leftJoin(OutletTable, eq(ShiftTable.outletId, OutletTable.id))
        .where(where.length > 0 ? and(...where) : undefined)
        .orderBy(desc(CutlostRequestTable.createdAt));

      if (rows.length === 0) return [];

      // The named assignments for every request in ONE round trip, then folded
      // back on: doing it per row would be a query per entry on the agency's
      // worklist, which is the screen most likely to hold a long list.
      const named = await db
        .select({
          requestId: CutlostRequestAssignmentTable.requestId,
          assignmentId: ShiftAssignmentTable.id,
          prId: ShiftAssignmentTable.prId,
          prName: prDisplayNameSql,
          payAmount: ShiftAssignmentTable.payAmount,
          status: ShiftAssignmentTable.status,
        })
        .from(CutlostRequestAssignmentTable)
        .innerJoin(
          ShiftAssignmentTable,
          eq(ShiftAssignmentTable.id, CutlostRequestAssignmentTable.assignmentId),
        )
        .leftJoin(UserTable, eq(UserTable.id, assigneeUserId))
        .leftJoin(UserProfileTable, eq(UserProfileTable.userId, assigneeUserId))
        .where(
          inArray(
            CutlostRequestAssignmentTable.requestId,
            rows.map((r) => r.request.id),
          ),
        );

      const byRequest = new Map<string, CutlostRequestWithContext['releasedAssignments']>();
      for (const n of named) {
        const list = byRequest.get(n.requestId) ?? [];
        list.push({
          assignmentId: n.assignmentId,
          prId: n.prId,
          prName: n.prName,
          payAmount: n.payAmount,
          status: n.status,
        });
        byRequest.set(n.requestId, list);
      }

      return rows.map((r) => ({
        ...r.request,
        outletId: r.outletId,
        outletName: r.outletName,
        agencyId: r.agencyId,
        shiftDate: r.shiftDate,
        slot: r.slot,
        eventName: r.eventName,
        releasedAssignments: byRequest.get(r.request.id) ?? [],
      }));
    } catch (error) {
      logger.error('[CutlostRepository.listWithContext] Error:', error);
      throw error;
    }
  }

  /**
   * Moves a request out of `pending`, and ONLY out of pending.
   *
   * The status test lives in the UPDATE's own WHERE clause, not in a read before
   * it: two agency users clicking Approve at the same moment can both read
   * `pending`, and only a conditional write makes the second one lose. Returns
   * null when it did, so the caller answers 409 instead of releasing the same
   * PRs twice. Same mutex shape as `claimOvertimeDecision`.
   */
  async claimDecision(params: {
    id: string;
    status: Extract<CutlostRequestStatus, 'approved' | 'rejected'>;
    declineReason?: string | null;
    actor: string;
  }): Promise<CutlostRequestType | null> {
    try {
      const [row] = await db
        .update(CutlostRequestTable)
        .set({
          status: params.status,
          declineReason: params.declineReason ?? null,
          decidedAt: new Date(),
          decidedBy: params.actor,
          updatedAt: new Date(),
          updatedBy: params.actor,
        })
        .where(
          and(eq(CutlostRequestTable.id, params.id), eq(CutlostRequestTable.status, 'pending')),
        )
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('[CutlostRepository.claimDecision] Error:', error);
      throw error;
    }
  }
}
