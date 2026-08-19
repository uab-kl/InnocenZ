import { and, asc, desc, eq, inArray, notInArray, sql, SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { OutletTable } from '@/features/outlet/outlet.model';
import { UserTable } from '@/features/user/user.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import { ShiftAgencyTable, ShiftTable, ShiftPayTierTable } from '@/features/shift/shift.model';
import { AgencyPrTable } from '@/features/pr-personnel/pr.model';
import { ShiftAssignmentTable } from '@/features/shift-assignment/shift-assignment.model';
import { NON_STAFFING_STATUSES } from '@/features/shift-assignment/shift-assignment.repository';
// The tier-mix rule itself lives in a LEAF module shared with
// `ShiftAssignmentRepository.create`, so a swap and a direct assign cannot
// drift into two different definitions of "does this PR fit".
import {
  bucketForPrTier,
  seatFor,
  totalDemand,
} from '@/features/shift-assignment/tier-demand';
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
  // Distinct from `destination_full` on purpose: the shift has a free seat,
  // just not one for THIS PR's tier. The two need different words — "come back
  // later, someone may drop out" is wrong advice when the shift will never want
  // another Tier III no matter who cancels.
  | 'destination_tier_full'
  | 'date_mismatch'
  | 'already_assigned';

export type OutletSwapApprovalResult =
  | { ok: true; request: OutletSwapRequestType }
  | { ok: false; reason: OutletSwapApprovalRejection };

/**
 * Same display rule as the roster: nickname when set, else legal name.
 * `main.pr` is gone — nickname is `user.username`, legal name is
 * `user_profile.full_name`.
 */
const prDisplayNameSql = sql<string>`coalesce(nullif(trim(${UserTable.username}), ''), nullif(trim(${UserProfileTable.fullName}), ''), 'PR')`;

/**
 * `pr_id` equals `user_id` for every `shift_assignment` row post-cutover
 * (0089) — the old FK to `main.pr` is gone along with the table. `user_id`
 * is preferred when present; `pr_id` is the fallback for rows that predate
 * the dual-write backfill.
 */
const assigneeUserId = sql`coalesce(${ShiftAssignmentTable.userId}, ${ShiftAssignmentTable.prId})`;

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
        .leftJoin(UserTable, eq(UserTable.id, assigneeUserId))
        .leftJoin(UserProfileTable, eq(UserProfileTable.userId, assigneeUserId))
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
   * Capacity is TWO gates, not one: total headcount (`destination_full`) and
   * then the per-tier mix the shift asked for (`destination_tier_full`), the
   * latter delegated to the same `tier-demand` leaf module that
   * `ShiftAssignmentRepository.create` uses. Without the second gate a swap can
   * write a roster that `POST /shift-assignment` would have refused — a third
   * Tier III on a shift that asked for two, plus a Tier I seat nobody can ever
   * fill.
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

        // Total headcount fits — now the MIX. Headcount alone is not the rule:
        // a shift asking Tier III x2 + Tier I x2 at quantity 4 with 3 staffed
        // has a free seat, but not a THIRD Tier III one, and letting a swap
        // take it strands the Tier I seat forever. `POST /shift-assignment`
        // refuses that exact row, so approving it here would let the swap lane
        // write a state the assign lane calls illegal.
        //
        // Both reads stay inside the transaction that already holds
        // `FOR UPDATE` on the destination shift, so a concurrent assign to the
        // last Tier I seat cannot slip between the count and the decision.
        const demand = await tx
          .select({
            kind: ShiftPayTierTable.kind,
            tier: ShiftPayTierTable.tier,
            prCount: ShiftPayTierTable.prCount,
          })
          .from(ShiftPayTierTable)
          .where(eq(ShiftPayTierTable.shiftId, request.toShiftId));

        // `totalDemand === 0` means the shift never declared a mix at all — no
        // `shift_pay_tier` rows, or rows that all ask for zero. Such a shift is
        // UNCAPPED per tier: every seat is unnamed, so only `quantity` binds
        // and that is the check just above. Skipping here is exactly what keeps
        // the pre-composer shifts (posted before the tier composer existed, and
        // therefore carrying no demand rows) swappable without a backfill —
        // treating "no mix declared" as "zero seats for every tier" would
        // refuse every swap into them.
        if (totalDemand(demand) > 0) {
          // The tiers of the PRs currently staffing the destination. Read as
          // its own query rather than folded into `existing` above: that
          // query's ROW COUNT *is* the headcount check, and any join that could
          // multiply a row would silently inflate it.
          //
          // ⚠️ Joined on `agency_pr.user_id`, NOT `agency_pr.id`. After
          // migration 0089 `shift_assignment.pr_id` IS the user id (the column
          // kept its old name), so joining on `.id` matches nothing: every
          // staffed seat resolves to a null tier, lands in the "unnamed"
          // bucket, and on a shift whose demand sums to `quantity` that refuses
          // every swap.
          //
          // ⚠️ The agency predicate is part of the JOIN KEY, not tidiness. One
          // person holds one `agency_pr` row PER AGENCY (see the
          // `agency_pr_agency_id_user_id_unique` constraint — unique on the
          // PAIR, not on user alone), so joining on user_id alone matches every
          // membership that person holds and counts ONE assignment several
          // times. A single dual-agency PR then reads as "3/2 Tier I" and the
          // swap is refused a seat that is genuinely free. With the agency in
          // the key the join yields at most one row per assignment.
          const staffedRows = await tx
            .select({ tier: AgencyPrTable.tier })
            .from(ShiftAssignmentTable)
            .leftJoin(
              AgencyPrTable,
              and(
                eq(ShiftAssignmentTable.prId, AgencyPrTable.userId),
                eq(AgencyPrTable.agencyId, ShiftAssignmentTable.agencyId),
              ),
            )
            .where(
              and(
                eq(ShiftAssignmentTable.shiftId, request.toShiftId),
                notInArray(ShiftAssignmentTable.status, [...NON_STAFFING_STATUSES]),
              ),
            );

          // The mover's grade under the agency that runs the DESTINATION —
          // the same agency the assignment's `agency_id` is about to become,
          // a few lines below. Same reason as the join key: a PR in two
          // agencies has two tiers, and the other agency's grade would test
          // the wrong bucket.
          const [incoming] = await tx
            .select({ tier: AgencyPrTable.tier })
            .from(AgencyPrTable)
            .where(
              and(
                eq(AgencyPrTable.userId, assignment.userId ?? assignment.prId),
                // The SUPPLIER's grade for this PR, not the destination shift's
                // anchor. A person holds an `agency_pr` row per agency and the
                // tiers differ — Alice is tier_1 at Why We Met and tier_2 at
                // Atlas — so reading the anchor graded the PR under an agency
                // with no part in this booking.
                //
                // It must also match what the CREATE pre-check grades on, or the
                // two disagree and the PR taps accept only to be told the
                // destination tier is full — the refusal that pre-check exists
                // to deliver before anyone is asked.
                eq(AgencyPrTable.agencyId, assignment.agencyId),
              ),
            )
            .limit(1);

          const verdict = seatFor({
            demand,
            quantity: toShift.quantity,
            staffedBuckets: staffedRows.map((r) => bucketForPrTier(r.tier)),
            incomingBucket: bucketForPrTier(incoming?.tier),
          });
          if (!verdict.ok) {
            return { ok: false, reason: 'destination_tier_full' };
          }
        }

        const now = new Date();
        await tx
          .update(ShiftAssignmentTable)
          .set({
            shiftId: request.toShiftId,
            // ⚠️ `agencyId` IS NOT REWRITTEN. Moving a PR to another shift does
            // not change who supplied them.
            //
            // This used to set `toShift.agencyId` — the destination's ANCHOR —
            // and was harmless only because the create gate happened to
            // guarantee anchor === caller === supplier. The moment that gate
            // correctly widened to `shift_agency` (a shared shift can be
            // swapped into by any invited agency), this line became a live
            // corruption: a Why We Met swap into an Atlas-anchored shift would
            // flip the assignment's supplier to Atlas on the PR's approval.
            //
            // 0124 is explicit about the split — `shift_agency` is the
            // INVITATION, `shift_assignment.agency_id` is the DELIVERY — and the
            // delivery is exactly what payroll, floor sales and commission are
            // computed from. Widening a gate can make a dormant write reachable;
            // this is that write.
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
   * Which of `shiftIds` have no seat left for `prId`'s TIER, keyed by shift id.
   *
   * The picker has to offer only what approval will accept, and headcount alone
   * is not that test: a shift asking Tier III ×2 + Tier I ×2 at quantity 4 with
   * 3 staffed is headcount-free and still refuses a 3rd Tier III, so the agency
   * could raise a request that could only ever be refused.
   *
   * Three batched queries for the whole list, never one per shift. A shift that
   * declared no mix (`totalDemand === 0`) is uncapped and never blocked — that
   * is every pre-composer shift, and capping them would strand the roster.
   */
  private async tierBlockedShiftIds(params: {
    shiftIds: string[];
    prId: string;
    agencyId: string;
  }): Promise<Set<string>> {
    const blocked = new Set<string>();
    const shiftIds = [...new Set(params.shiftIds)];
    if (shiftIds.length === 0) return blocked;

    const [demandRows, staffedRows, incoming] = await Promise.all([
      db
        .select({
          shiftId: ShiftPayTierTable.shiftId,
          kind: ShiftPayTierTable.kind,
          tier: ShiftPayTierTable.tier,
          prCount: ShiftPayTierTable.prCount,
        })
        .from(ShiftPayTierTable)
        .where(inArray(ShiftPayTierTable.shiftId, shiftIds)),
      // ⚠️ The agency predicate is part of the JOIN KEY, not a filter: one person
      // holds an `agency_pr` row per agency, so joining on `user_id` alone
      // resolves every membership they hold and counts one seat several times.
      // And it joins `user_id`, never `.id` — `shift_assignment.pr_id` IS the
      // user id after 0089, so `.id` matches nothing and every staffed seat
      // would fall into the "unnamed" bucket.
      db
        .select({
          shiftId: ShiftAssignmentTable.shiftId,
          tier: AgencyPrTable.tier,
        })
        .from(ShiftAssignmentTable)
        .leftJoin(
          AgencyPrTable,
          and(
            eq(ShiftAssignmentTable.prId, AgencyPrTable.userId),
            eq(AgencyPrTable.agencyId, ShiftAssignmentTable.agencyId),
          ),
        )
        .where(
          and(
            inArray(ShiftAssignmentTable.shiftId, shiftIds),
            notInArray(ShiftAssignmentTable.status, [...NON_STAFFING_STATUSES]),
          ),
        ),
      db
        .select({ tier: AgencyPrTable.tier })
        .from(AgencyPrTable)
        .where(
          and(
            eq(AgencyPrTable.userId, params.prId),
            eq(AgencyPrTable.agencyId, params.agencyId),
          ),
        )
        .limit(1),
    ]);

    const demandByShift = new Map<string, typeof demandRows>();
    for (const row of demandRows) {
      demandByShift.set(row.shiftId, [...(demandByShift.get(row.shiftId) ?? []), row]);
    }
    const staffedByShift = new Map<string, (string | null)[]>();
    for (const row of staffedRows) {
      staffedByShift.set(row.shiftId, [
        ...(staffedByShift.get(row.shiftId) ?? []),
        bucketForPrTier(row.tier),
      ]);
    }
    const incomingBucket = bucketForPrTier(incoming[0]?.tier);

    for (const shiftId of shiftIds) {
      const demand = demandByShift.get(shiftId) ?? [];
      if (totalDemand(demand) === 0) continue;
      const verdict = seatFor({
        demand,
        // `quantity` only feeds the unnamed-leftover arm, and the caller screens
        // on headcount separately. Passing the asked total keeps this out of the
        // shift table for a number it does not otherwise need.
        quantity: totalDemand(demand),
        staffedBuckets: staffedByShift.get(shiftId) ?? [],
        incomingBucket,
      });
      if (!verdict.ok) blocked.add(shiftId);
    }
    return blocked;
  }

  /**
   * Candidate destination shifts for a swap: everything else running that night
   * that the agency could move the PR to, with live headcount AND whether the
   * PR's tier still fits, so the caller can mark the ones approval would refuse.
   * Excludes the PR's current shift (a swap must move them) and draft/sealed
   * shifts (not staffable).
   */
  async listSwapTargets(params: {
    agencyId: string;
    shiftDate: string;
    excludeShiftId: string;
    /** The PR being moved — needed to answer the tier half of "does this fit". */
    prId: string;
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
      /** True when the shift has room, but not for THIS PR's tier. */
      tierBlocked: boolean;
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
            // Via `shift_agency` (0124): an agency may reassign an early-released
            // PR into any shift it was INVITED to, not only ones it originated.
            inArray(
              ShiftTable.id,
              db
                .select({ shiftId: ShiftAgencyTable.shiftId })
                .from(ShiftAgencyTable)
                .where(eq(ShiftAgencyTable.agencyId, params.agencyId)),
            ),
            eq(ShiftTable.shiftDate, params.shiftDate),
            inArray(ShiftTable.status, ['open', 'confirmed']),
          ),
        )
        .orderBy(asc(OutletTable.name));

      const targets = shifts.filter((s) => s.shiftId !== params.excludeShiftId);
      if (targets.length === 0) return [];

      const shiftIds = targets.map((s) => s.shiftId);
      const [counts, tierBlocked] = await Promise.all([
        this.countLiveAssignments(shiftIds),
        this.tierBlockedShiftIds({
          shiftIds,
          prId: params.prId,
          agencyId: params.agencyId,
        }),
      ]);
      return targets.map((s) => ({
        ...s,
        staffedCount: counts.get(s.shiftId) ?? 0,
        tierBlocked: tierBlocked.has(s.shiftId),
      }));
    } catch (error) {
      logger.error('[OutletSwapRepository.listSwapTargets] Error:', error);
      throw error;
    }
  }
}
