import { and, asc, eq, gte, inArray, isNull, lte, notInArray, or, sql, SQL } from 'drizzle-orm';
import { slotMinutes } from '@/util/slot-window';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { AgencyPrTable } from '@/features/pr-personnel/pr.model';
import { UserTable } from '@/features/user/user.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import { ShiftTable } from '@/features/shift/shift.model';
import { ShiftAssignmentTable } from '@/features/shift-assignment/shift-assignment.model';
import { NON_STAFFING_STATUSES } from '@/features/shift-assignment/shift-assignment.repository';
import {
  PrAvailabilityTable,
  PrAvailabilityType,
  PrAvailabilityWithPrType,
} from './pr-availability.model';

/**
 * A committed window reduced to bare clock times.
 *
 * ⚠️ THIS IS A PRIVACY BOUNDARY, not formatting. `shift.slot` is FREE TEXT —
 * `z.string().max(100)` with no format constraint (shift.schema.ts) — written by
 * the posting side and shown to a RIVAL agency by the endpoint below, whose own
 * documentation promises "times only". A venue that types
 * "Velvet VIP Launch 15:00-04:00" into that field would otherwise hand its
 * client straight to a competitor, defeating by content an anonymity the SQL
 * enforces perfectly: the query selects three columns and never joins `outlet`
 * or `agency` at all. The owner's rule is explicit — the busy message may not
 * mention which agency the PR is working for.
 *
 * `slotMinutes` is the SAME parser the clash guard and the pay window already
 * share, so a slot that can block resolves here identically and no third reading
 * of a slot string enters the codebase. Anything it cannot read becomes null,
 * which the client already renders as "busy, time unknown" — the honest answer
 * for a label-only slot like "Late night" that no guard can act on anyway.
 */
function canonicalWindow(slot: string | null): string | null {
  const window = slotMinutes(slot);
  if (!window) return null;
  const hhmm = (minutes: number): string => {
    const wrapped = ((minutes % 1440) + 1440) % 1440;
    const h = String(Math.floor(wrapped / 60)).padStart(2, '0');
    const m = String(wrapped % 60).padStart(2, '0');
    return `${h}:${m}`;
  };
  return `${hhmm(window.start)} - ${hhmm(window.end)}`;
}

/** Same display rule as the roster: nickname when set, else legal name. */
const prDisplayNameSql = sql<string>`coalesce(nullif(trim(${UserTable.username}), ''), nullif(trim(${UserProfileTable.fullName}), ''), 'PR')`;

export class PrAvailabilityRepositoryClass {
  /**
   * The days this one person has blocked, optionally inside a window.
   *
   * Used by the PR's own screen. Not agency-scoped on purpose — it is the
   * caller's own data, and the controller derives `userId` from the token
   * rather than the query string.
   */
  async listForUser(params: {
    userId: string;
    from?: string;
    to?: string;
  }): Promise<PrAvailabilityType[]> {
    try {
      const conditions: SQL[] = [eq(PrAvailabilityTable.userId, params.userId)];
      if (params.from) conditions.push(gte(PrAvailabilityTable.unavailableDate, params.from));
      if (params.to) conditions.push(lte(PrAvailabilityTable.unavailableDate, params.to));
      return await db
        .select()
        .from(PrAvailabilityTable)
        .where(and(...conditions))
        .orderBy(asc(PrAvailabilityTable.unavailableDate));
    } catch (error) {
      logger.error('[PrAvailabilityRepository.listForUser] Error:', error);
      throw error;
    }
  }

  /**
   * Blocked days across ONE agency's roster.
   *
   * The agency scope is enforced by the INNER JOIN on `agency_pr`, not by a
   * filter the caller supplies: an agency may only see the availability of PRs
   * whose membership it actually holds, and `pr_availability` carries no
   * `agency_id` of its own to check. `approve_status = 'approved'` keeps
   * applicants out — a pending membership is not roster staff, so their private
   * calendar is not this agency's to read.
   *
   * ⚠️ Both predicates — the `agency_pr` join AND `approve_status = 'approved'` —
   * ARE the scope, not decoration. A sibling read once carried the join without
   * the status filter, so it was scoped by "was ever on our books" rather than
   * "is on our books", and an agency a PR had LEFT could still read her calendar.
   * Any future query over this table must apply the pair.
   */
  async listForAgency(params: {
    agencyId: string;
    from?: string;
    to?: string;
    userId?: string;
  }): Promise<PrAvailabilityWithPrType[]> {
    try {
      const conditions: SQL[] = [
        eq(AgencyPrTable.agencyId, params.agencyId),
        eq(AgencyPrTable.approveStatus, 'approved'),
      ];
      if (params.from) conditions.push(gte(PrAvailabilityTable.unavailableDate, params.from));
      if (params.to) conditions.push(lte(PrAvailabilityTable.unavailableDate, params.to));
      if (params.userId) conditions.push(eq(PrAvailabilityTable.userId, params.userId));

      const rows = await db
        .select({ row: PrAvailabilityTable, prName: prDisplayNameSql })
        .from(PrAvailabilityTable)
        .innerJoin(AgencyPrTable, eq(AgencyPrTable.userId, PrAvailabilityTable.userId))
        .leftJoin(UserTable, eq(UserTable.id, PrAvailabilityTable.userId))
        .leftJoin(UserProfileTable, eq(UserProfileTable.userId, PrAvailabilityTable.userId))
        .where(and(...conditions))
        .orderBy(asc(PrAvailabilityTable.unavailableDate));

      return rows.map(({ row, prName }) => ({ ...row, prName }));
    } catch (error) {
      logger.error('[PrAvailabilityRepository.listForAgency] Error:', error);
      throw error;
    }
  }

  /**
   * Block a day. Idempotent: re-blocking an already-blocked day updates the
   * reason rather than raising a unique violation, so a double-tap on a phone
   * with a slow connection is not an error the PR has to understand.
   */
  /**
   * WHEN this agency's PRs are already working for SOMEONE ELSE — times only.
   *
   * The preview half of the cross-agency rule. That rule is now the other shift's
   * own WINDOW plus the travel between venues, so a day is no longer the unit of
   * anything: a PR booked 15:00–04:00 elsewhere is genuinely free that morning.
   * The roster grid needs the windows to show that, and the assign sheet's refusal
   * becomes a reminder of something already on screen rather than the first the
   * agency hears of it.
   *
   * ⚠️ WHAT THIS DELIBERATELY DOES NOT RETURN: the agency, the outlet, the shift
   * id, the event, the pay. Only `userId`, `date` and `slot`. An agency is
   * entitled to know WHEN its own roster member cannot be booked — it has to be,
   * or it cannot roster around it — and to nothing else. Naming the venue would
   * hand over a rival's client; naming the agency would hand over the rival.
   *
   * The residual disclosure is the WINDOW, and it is the honest price of the
   * feature: an agency could already infer it by trying times until the refusal
   * changed. Showing it plainly is better than making them probe for it.
   *
   * Scope is the same pair as `listForAgency` — the `agency_pr` join AND
   * `approve_status = 'approved'` — so an agency only sees its own approved
   * roster, and one it a PR has LEFT sees nothing.
   */
  async listCommittedWindows(params: {
    /** One agency (the agency lane) — or many, for the outlet lane below. */
    agencyId?: string;
    agencyIds?: string[];
    from?: string;
    to?: string;
    userId?: string;
  }): Promise<{ userId: string; date: string; slot: string | null }[]> {
    try {
      // The PERSON, whichever column the assignment row happens to carry them in.
      // `pr_id` IS the user id post-0089 and `user_id` is preferred when set, so a
      // row predating the dual-write backfill is reachable only through the other
      // column — exactly the pair `hasLiveAssignmentOn` already matches a few
      // methods below. Keying on one of them is how a real commitment goes
      // unwarned, and the agency never learns the warning was missing.
      const isThisPerson = or(
        eq(AgencyPrTable.userId, ShiftAssignmentTable.prId),
        eq(AgencyPrTable.userId, ShiftAssignmentTable.userId),
      ) as SQL;

      // The outlet lane asks across EVERY approved agency at once; the agency
      // lane keeps its single id. Neither -> nothing, never everything.
      const laneAgencyIds = params.agencyIds?.length
        ? params.agencyIds
        : params.agencyId
          ? [params.agencyId]
          : null;
      if (!laneAgencyIds) return [];
      const conditions: SQL[] = [
        inArray(AgencyPrTable.agencyId, laneAgencyIds),
        eq(AgencyPrTable.approveStatus, 'approved'),
        // SOMEONE ELSE'S booking — agency lane only. An agency's own doubles
        // are its own business and it can already see them on this very grid.
        // The OUTLET lane keeps every booking: a venue must learn the PR is
        // taken even when the very agency it links to booked her elsewhere.
        ...(params.agencyId && !params.agencyIds?.length
          ? [sql`${ShiftAssignmentTable.agencyId} <> ${params.agencyId}`]
          : []),
        // EXACTLY the rows the assign guard refuses on, and no others. That guard
        // skips `completed` AND anything with `check_out_at` set
        // (shift-assignment.controller.ts), so carrying those here made the assign
        // sheet grey a card — and drop it from `selectable` — for a PR who had
        // finished her earlier shift and clocked out, someone the server would
        // have accepted without complaint. A preview that refuses MORE than the
        // thing it previews is worse than no preview at all: it reads as a rule,
        // so nobody reports it and the booking is simply lost.
        notInArray(ShiftAssignmentTable.status, [...NON_STAFFING_STATUSES, 'completed']),
        isNull(ShiftAssignmentTable.checkOutAt),
      ];
      if (params.from) conditions.push(gte(ShiftTable.shiftDate, params.from));
      if (params.to) conditions.push(lte(ShiftTable.shiftDate, params.to));
      if (params.userId) {
        conditions.push(
          or(
            eq(ShiftAssignmentTable.prId, params.userId),
            eq(ShiftAssignmentTable.userId, params.userId),
          ) as SQL,
        );
      }

      const rows = await db
        .select({
          // `agency_pr.user_id` is the canonical person and the id the roster grid
          // keys its map on. The assignment's own columns are how we FIND the row,
          // never what we report — one of them may be the legacy spelling.
          userId: AgencyPrTable.userId,
          date: ShiftTable.shiftDate,
          slot: ShiftTable.slot,
        })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftTable.id, ShiftAssignmentTable.shiftId))
        .innerJoin(AgencyPrTable, isThisPerson)
        .where(and(...conditions))
        .orderBy(asc(ShiftTable.shiftDate), asc(ShiftTable.slot));

      return rows.map((r) => ({
        userId: r.userId,
        date: r.date,
        slot: canonicalWindow(r.slot),
      }));
    } catch (error) {
      logger.error('[PrAvailabilityRepository.listCommittedWindows] Error:', error);
      // Empty, never partial. This is advice; the assign guard still refuses. A
      // half-list would grey some windows and silently miss others, which is worse
      // than showing none — the agency would trust it.
      return [];
    }
  }

  async block(params: {
    userId: string;
    unavailableDate: string;
    reason?: string | null;
    actor: string;
  }): Promise<PrAvailabilityType> {
    try {
      const [row] = await db
        .insert(PrAvailabilityTable)
        .values({
          userId: params.userId,
          unavailableDate: params.unavailableDate,
          reason: params.reason ?? null,
          createdBy: params.actor,
          updatedBy: params.actor,
        })
        .onConflictDoUpdate({
          target: [PrAvailabilityTable.userId, PrAvailabilityTable.unavailableDate],
          set: {
            reason: params.reason ?? null,
            updatedAt: new Date(),
            updatedBy: params.actor,
          },
        })
        .returning();
      return row;
    } catch (error) {
      logger.error('[PrAvailabilityRepository.block] Error:', error);
      throw error;
    }
  }

  /** Reopen a day. Returns false when it was not blocked to begin with. */
  async unblock(params: { userId: string; unavailableDate: string }): Promise<boolean> {
    try {
      const deleted = await db
        .delete(PrAvailabilityTable)
        .where(
          and(
            eq(PrAvailabilityTable.userId, params.userId),
            eq(PrAvailabilityTable.unavailableDate, params.unavailableDate),
          ),
        )
        .returning({ id: PrAvailabilityTable.id });
      return deleted.length > 0;
    } catch (error) {
      logger.error('[PrAvailabilityRepository.unblock] Error:', error);
      throw error;
    }
  }

  /**
   * Is this one person blocked on this one date?
   *
   * Takes an optional transaction client so the assign guard can run it inside
   * the same lock that already holds the destination shift — the check and the
   * insert have to be one atomic unit, or a PR can block a day in the instant
   * between them and still end up rostered on it.
   */
  async isBlocked(
    params: { userId: string; shiftDate: string },
    tx?: DbTransaction,
  ): Promise<boolean> {
    const client = tx ?? db;
    try {
      const [row] = await client
        .select({ id: PrAvailabilityTable.id })
        .from(PrAvailabilityTable)
        .where(
          and(
            eq(PrAvailabilityTable.userId, params.userId),
            eq(PrAvailabilityTable.unavailableDate, params.shiftDate),
          ),
        )
        .limit(1);
      return row != null;
    } catch (error) {
      logger.error('[PrAvailabilityRepository.isBlocked] Error:', error);
      throw error;
    }
  }

  /**
   * Does this PR already have a shift they are working on that date?
   *
   * A day they are rostered on cannot be declared unavailable — the way out of
   * a booked shift is to cancel it or request leave, both of which have
   * consequences (a cancellation fee, an agency decision) that silently
   * blocking the day would let them skip. The phone already greys those days
   * out; this is the rule behind it rather than a second copy of it.
   *
   * Reads `shift_assignment` from the availability side deliberately: the
   * question is "may this day be blocked", which is an availability question.
   * `NON_STAFFING_STATUSES` is imported from its owner so cancelled / no-show /
   * leave-approved keep meaning the same thing here as everywhere else — a
   * cancelled shift leaves the day genuinely free to block.
   */
  async hasLiveAssignmentOn(params: { userId: string; date: string }): Promise<boolean> {
    try {
      const [row] = await db
        .select({ id: ShiftAssignmentTable.id })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .where(
          and(
            eq(ShiftTable.shiftDate, params.date),
            notInArray(ShiftAssignmentTable.status, [...NON_STAFFING_STATUSES]),
            // `pr_id` IS the user id post-0089; `user_id` is preferred when set.
            // Matching either keeps rows that predate the dual-write backfill.
            or(
              eq(ShiftAssignmentTable.userId, params.userId),
              eq(ShiftAssignmentTable.prId, params.userId),
            ),
          ),
        )
        .limit(1);
      return row != null;
    } catch (error) {
      logger.error('[PrAvailabilityRepository.hasLiveAssignmentOn] Error:', error);
      throw error;
    }
  }

  /**
   * Which of `userIds` are blocked on `shiftDate` — ONE query for the whole
   * list, for the candidate pickers that screen a roster at a time. Doing it
   * per-PR would put a query inside a loop on the roster's hottest read path.
   */
  async blockedUserIdsOn(params: {
    userIds: string[];
    shiftDate: string;
  }): Promise<Set<string>> {
    const blocked = new Set<string>();
    const userIds = [...new Set(params.userIds)];
    if (userIds.length === 0) return blocked;
    try {
      const rows = await db
        .select({ userId: PrAvailabilityTable.userId })
        .from(PrAvailabilityTable)
        .where(
          and(
            inArray(PrAvailabilityTable.userId, userIds),
            eq(PrAvailabilityTable.unavailableDate, params.shiftDate),
          ),
        );
      for (const row of rows) blocked.add(row.userId);
      return blocked;
    } catch (error) {
      logger.error('[PrAvailabilityRepository.blockedUserIdsOn] Error:', error);
      throw error;
    }
  }

  /**
   * Blocked days for a set of people across a DATE RANGE, keyed by user id.
   *
   * The multi-day form of `blockedUserIdsOn`, for the agency's week grid and for
   * auto-assign, which plans several dates in one pass and would otherwise fire
   * one query per day per PR.
   */
  async blockedDatesFor(params: {
    userIds: string[];
    from: string;
    to: string;
  }): Promise<Map<string, Set<string>>> {
    const byUser = new Map<string, Set<string>>();
    const userIds = [...new Set(params.userIds)];
    if (userIds.length === 0) return byUser;
    try {
      const rows = await db
        .select({
          userId: PrAvailabilityTable.userId,
          unavailableDate: PrAvailabilityTable.unavailableDate,
        })
        .from(PrAvailabilityTable)
        .where(
          and(
            inArray(PrAvailabilityTable.userId, userIds),
            gte(PrAvailabilityTable.unavailableDate, params.from),
            lte(PrAvailabilityTable.unavailableDate, params.to),
          ),
        );
      for (const row of rows) {
        const set = byUser.get(row.userId) ?? new Set<string>();
        set.add(row.unavailableDate);
        byUser.set(row.userId, set);
      }
      return byUser;
    } catch (error) {
      logger.error('[PrAvailabilityRepository.blockedDatesFor] Error:', error);
      throw error;
    }
  }
}
