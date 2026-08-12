import { and, desc, eq, exists, inArray, sql, SQL } from 'drizzle-orm';

import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import { ShiftAssignmentTable } from '@/features/shift-assignment/shift-assignment.model.js';
import { ShiftTable } from '@/features/shift/shift.model.js';
import {
  Rating,
  RatingFilter,
  RatingInsertType,
  RatingTable,
} from './rating.model.js';

/** Any RFC-4122 uuid shape — enough to keep a demo id out of a uuid column. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * "This agency staffed the shift this rating is about" — the assignment the
 * verdict itself points at (0120), correlated against the outer `rating` row.
 *
 * Deliberately NOT "this agency ever supplied this PR to this venue": that
 * looser question gives the rating to both agencies as soon as the same PR works
 * the same venue through two of them, which is the leak this exists to close.
 *
 * A rating with a NULL `shift_assignment_id` matches nothing, so an
 * unattributable verdict is private rather than shared — the safe direction.
 */
function ratedOnAgencyShift(agencyId: string) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(ShiftAssignmentTable)
      .where(
        and(
          eq(ShiftAssignmentTable.id, RatingTable.shiftAssignmentId),
          eq(ShiftAssignmentTable.agencyId, agencyId),
        ),
      ),
  );
}

/**
 * The assignment a verdict is about when the caller did not name one: the LATEST
 * shift that PR actually worked at that venue.
 *
 * The rating prompt fires straight after a shift is sealed, so the most recent
 * night at that venue is the night being rated. This is a fallback, not the
 * rule — an explicit `shiftAssignmentId` from the client always wins — and it
 * exists so a verdict written by the current (shift-less) rate UI is still
 * attributable instead of silently invisible to every agency.
 *
 * `shift_assignment.pr_id` is uuid while `rating.pr_id` is varchar(100), so the
 * comparison is done in TypeScript-supplied string form against a cast column.
 */
export async function latestAssignmentFor(
  prId: string,
  outletId: string,
): Promise<string | null> {
  try {
    const [row] = await db
      .select({ id: ShiftAssignmentTable.id })
      .from(ShiftAssignmentTable)
      .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
      .where(
        and(
          eq(ShiftTable.outletId, outletId),
          sql`${ShiftAssignmentTable.prId}::text = ${prId}`,
        ),
      )
      .orderBy(desc(ShiftTable.shiftDate), desc(ShiftAssignmentTable.createdAt))
      .limit(1);
    return row?.id ?? null;
  } catch (error) {
    logger.error('[RatingRepository.latestAssignmentFor] Error:', error);
    return null;
  }
}

export class RatingRepositoryClass {
  private buildConditions(filter?: RatingFilter): SQL | undefined {
    const conditions: SQL[] = [];
    if (filter?.outletId) conditions.push(eq(RatingTable.outletId, filter.outletId));
    if (filter?.prId) conditions.push(eq(RatingTable.prId, filter.prId));
    // Tenancy scopes AND with the caller's own query params, so a supplied
    // outletId can only ever narrow the caller's scope, never escape it.
    if (filter?.outletIds) conditions.push(inArray(RatingTable.outletId, filter.outletIds));
    if (filter?.prIds) conditions.push(inArray(RatingTable.prId, filter.prIds));
    if (filter?.agencySuppliedTo) conditions.push(ratedOnAgencyShift(filter.agencySuppliedTo));
    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  /**
   * The agency that staffed the shift this rating is about — the only one with
   * a legitimate interest in it, and the only one that can see it.
   *
   * Read off the assignment the rating itself points at, so the warning goes to
   * exactly the agency the read scope will let read the rating. Used instead of
   * the PR's own `agencyId`, which is the OLDEST membership and so names the
   * wrong agency for anyone on two rosters: a bad night sold by agency B would
   * page agency A about a shift A never staffed.
   *
   * `null` when the rating carries no assignment — nobody may read it, so nobody
   * is told about it.
   */
  /**
   * Whether this assignment really is this PR working this venue.
   *
   * The gate on a client-supplied `shiftAssignmentId`. `POST /rating` already
   * proves the caller owns the outlet, but not that the shift it names is one of
   * its own for this PR — without this a venue could attribute its verdict to
   * another agency's night and hand that agency a score it never earned, or
   * bury a bad one under an agency that will never look.
   */
  async assignmentBelongsTo(
    shiftAssignmentId: string,
    prId: string,
    outletId: string,
  ): Promise<boolean> {
    try {
      const [row] = await db
        .select({ id: ShiftAssignmentTable.id })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .where(
          and(
            eq(ShiftAssignmentTable.id, shiftAssignmentId),
            eq(ShiftTable.outletId, outletId),
            sql`${ShiftAssignmentTable.prId}::text = ${prId}`,
          ),
        )
        .limit(1);
      return !!row;
    } catch (error) {
      logger.error('[RatingRepository.assignmentBelongsTo] Error:', error);
      // Fail CLOSED: an unverifiable claim must not be stored as attribution.
      return false;
    }
  }

  /**
   * The assignment for one PR on one shift — how a client that knows the SHIFT
   * it just sealed names the night without having to know assignment ids.
   *
   * `outletId` is part of the lookup, not an afterthought: the caller proves it
   * owns the outlet, so pinning the shift to that outlet stops a venue naming
   * someone else's shift. Returns `null` when the triple does not resolve, and
   * the caller then falls back rather than failing the whole rating — the id is
   * a hint from a demo-seeded store, not a claim worth a 400.
   */
  async assignmentForShiftAndPr(
    shiftId: string,
    prId: string,
    outletId: string,
  ): Promise<string | null> {
    // Shape-checked BEFORE the query. Postgres raises 22P02 on a non-uuid, and
    // the demo-seeded store can hand us one on every rating in a session — so
    // letting it reach the database would bury the log in stack traces for what
    // is simply "no such shift".
    if (!UUID_PATTERN.test(shiftId)) return null;
    try {
      const [row] = await db
        .select({ id: ShiftAssignmentTable.id })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .where(
          and(
            eq(ShiftAssignmentTable.shiftId, shiftId),
            eq(ShiftTable.outletId, outletId),
            sql`${ShiftAssignmentTable.prId}::text = ${prId}`,
          ),
        )
        .limit(1);
      return row?.id ?? null;
    } catch (error) {
      logger.error('[RatingRepository.assignmentForShiftAndPr] Error:', error);
      return null;
    }
  }

  async agencyForRatedShift(shiftAssignmentId: string | null): Promise<string | null> {
    if (!shiftAssignmentId) return null;
    try {
      const [row] = await db
        .select({ agencyId: ShiftAssignmentTable.agencyId })
        .from(ShiftAssignmentTable)
        .where(eq(ShiftAssignmentTable.id, shiftAssignmentId))
        .limit(1);
      return row?.agencyId ?? null;
    } catch (error) {
      logger.error('[RatingRepository.agencyForRatedShift] Error:', error);
      return null;
    }
  }

  async list(filter?: RatingFilter): Promise<Rating[]> {
    // A caller scoped to zero outlets (or an agency with zero PRs) owns nothing.
    // That must match nothing, not everything — never let an empty array reach
    // buildConditions, where it would simply be dropped.
    if (filter?.outletIds?.length === 0 || filter?.prIds?.length === 0) return [];
    try {
      return await db
        .select()
        .from(RatingTable)
        .where(this.buildConditions(filter))
        .orderBy(desc(RatingTable.updatedAt));
    } catch (error) {
      logger.error('[RatingRepository.list] Error:', error);
      return [];
    }
  }

  // Create-or-update the outlet's current rating for a PR (unique on outlet + PR).
  async upsert(
    data: Omit<RatingInsertType, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>,
    actor: string,
  ): Promise<Rating | null> {
    try {
      const [row] = await db
        .insert(RatingTable)
        .values({ ...data, createdBy: actor, updatedBy: actor })
        .onConflictDoUpdate({
          target: [RatingTable.outletId, RatingTable.prId],
          set: {
            prName: data.prName,
            stars: data.stars,
            note: data.note,
            tags: data.tags,
            // Re-rating moves the verdict to the night it was just written
            // about, so attribution follows it. Omitting this would leave a
            // fresh rating pointing at an old shift — and therefore readable by
            // the agency that staffed THAT one instead of this one.
            shiftAssignmentId: data.shiftAssignmentId ?? null,
            updatedBy: actor,
            updatedAt: new Date(),
          },
        })
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('[RatingRepository.upsert] Error:', error);
      return null;
    }
  }
}
