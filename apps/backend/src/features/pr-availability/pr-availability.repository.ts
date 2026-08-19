import { createHash } from 'node:crypto';
import { and, asc, eq, gte, inArray, lte, notInArray, or, sql, SQL } from 'drizzle-orm';
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

/** Same display rule as the roster: nickname when set, else legal name. */
const prDisplayNameSql = sql<string>`coalesce(nullif(trim(${UserTable.username}), ''), nullif(trim(${UserProfileTable.fullName}), ''), 'PR')`;

/**
 * A day a PR is committed at ANOTHER agency, already carrying every field a real
 * `pr_availability` row carries.
 *
 * Filled HERE rather than in the controller because the two halves of the merge
 * have to be indistinguishable, and a shape assembled at the call site drifts the
 * moment a column is added to the table: the declared half gains it for free from
 * `select()`, the derived half silently does not, and the missing field is a new
 * tell nobody wrote.
 */
export type CommittedElsewhereBlock = {
  id: string;
  userId: string;
  date: string;
  prName: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * A stable, uuid-shaped id for a derived block, hashed from the assignment it
 * stands for.
 *
 * NOT `derived-<user>-<date>`, which this used to be: that prefix announced in
 * plain text exactly what the merge exists to hide, and while it was there no
 * other field mattered. NOT `randomUUID()` either — real ids never move, so an id
 * that changes between two polls of the same window is the same tell one request
 * later.
 *
 * Hashing the ASSIGNMENT id rather than `(userId, date)` is what puts it out of
 * reach: the caller knows the PR and the date and could recompute that pair
 * themselves, but the rival's `shift_assignment.id` is a value they have never
 * been shown. SHA-256 is one-way, so the id does not carry that key back out.
 */
function derivedBlockId(sourceAssignmentId: string): string {
  const digest = createHash('sha256').update(sourceAssignmentId).digest();
  // Stamp the version and variant nibbles `gen_random_uuid()` sets. A digest cut
  // into uuid shape carries a RANDOM version nibble, so fifteen times in sixteen
  // it is not '4' — one character of one field, and the row is identified.
  digest[6] = (digest[6] & 0x0f) | 0x40;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

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
   * Days this agency's PRs are already committed AT ANOTHER AGENCY — the derived
   * half of "the day belongs to the PR" (owner's rule, 18 Aug 2026).
   *
   * Returned in the SAME shape as a self-declared block and merged into the same
   * list, so agency B's picker greys the day out with the wording it already uses.
   * That is the point of the rule: B must not be able to tell "she took the day off"
   * from "she is booked by someone else". Anything that labelled these rows
   * differently — a flag, a reason, a separate endpoint — would turn the picker into
   * a probe for reading a rival's roster one day at a time.
   *
   * DERIVED, never written. Nothing stores these, so they cannot drift out of sync
   * when an assignment is cancelled: the row simply stops being returned.
   *
   * ⚠️ Only OTHER agencies' bookings. An agency's own doubles are its own business,
   * and it can already see them.
   */
  async listCommittedElsewhere(params: {
    agencyId: string;
    // Optional for the same reason the sibling query has them optional: the caller
    // may ask for a PR's whole history rather than a window.
    from?: string;
    to?: string;
    userId?: string;
  }): Promise<CommittedElsewhereBlock[]> {
    try {
      // ⚠️ No backticks in the SQL comments below. A backtick inside this template
      // literal ends the string, and tsc reports it as `',' expected` on the line
      // AFTER the real one, which is a confusing way to lose ten minutes.
      const result = await db.execute(sql`
        select sa.pr_id as "userId",
               s.shift_date::text as date,
               -- The SAME expression the sibling read uses, imported rather than
               -- retyped: a second copy of the nickname-else-legal-name rule would
               -- eventually disagree with the first, and a PR whose two halves
               -- render under different names is separable by name alone.
               ${prDisplayNameSql} as "prName",
               -- Epoch milliseconds, not the timestamp itself. A raw db.execute
               -- hands timestamptz back as a STRING ('2026-08-13 07:06:40.851948+00')
               -- while the sibling's typed select yields a Date that serialises
               -- '2026-08-13T07:06:40.851Z'. Passing the driver's value straight
               -- through would have made the wire FORMAT the giveaway — the exact
               -- bug this method is being repaired for, one layer down.
               (extract(epoch from min(sa.created_at)) * 1000)::bigint as "createdAtMs",
               (extract(epoch from max(sa.updated_at)) * 1000)::bigint as "updatedAtMs",
               -- Seed for the row id, and the only column here the caller must never
               -- see: it is a rival's primary key. It leaves this method hashed.
               min(sa.id::text) as "sourceAssignmentId"
        from main.shift_assignment sa
        join main.shift s on s.id = sa.shift_id
        -- The approve_status predicate is not decoration, it is the scope, and
        -- it must match the sibling read EXACTLY. Without it an agency the PR had
        -- LEFT still read her bookings at the agencies she stayed with: the derived
        -- half was scoped by "was ever on our books", the declared half by "is on
        -- our books", and the wider half is the one that leaks. Live before the fix:
        -- Delta (AGY002) read 15 of Vicky's Atlas days on a membership marked 'left'.
        -- The live enum has five labels — pending, approved, rejected, leave_pending,
        -- left — so anything but an explicit 'approved' lets four of them through.
        join main.agency_pr ap on ap.user_id = sa.pr_id
          and ap.agency_id = ${params.agencyId}
          and ap.approve_status = 'approved'
        left join ${UserTable} on ${UserTable.id} = sa.pr_id
        left join ${UserProfileTable} on ${UserProfileTable.userId} = sa.pr_id
        where sa.agency_id <> ${params.agencyId}
          -- From the CONSTANT, not three literals. The two matched exactly, but a
          -- fourth non-staffing status added to NON_STAFFING_STATUSES would not
          -- have reached this query, tsc would not have objected, and this picker
          -- would have silently disagreed with the block guard 200 lines below --
          -- the same drift this method's own notes warn about elsewhere.
          -- (No backticks in here: they close the enclosing template literal and
          --  the parse error surfaces on an unrelated line far away.)
          and sa.status not in (${sql.join(
            NON_STAFFING_STATUSES.map((status) => sql`${status}`),
            sql`, `,
          )})
          -- Open bounds rather than conditional fragments: an EMPTY drizzle fragment
          -- spliced into a raw query makes the whole call throw, and this method catches
          -- its own errors, so the picker would quietly lose every derived block.
          and s.shift_date >= ${params.from ?? '1000-01-01'}
          and s.shift_date <= ${params.to ?? '9999-12-31'}
          and (${params.userId ?? null}::uuid is null or sa.pr_id = ${params.userId ?? null}::uuid)
        -- GROUP BY, not DISTINCT: two shifts on one day are ONE blocked day, and the
        -- aggregates above need the collapse to be explicit anyway.
        group by sa.pr_id, s.shift_date, ${UserTable.username}, ${UserProfileTable.fullName}
      `);
      // Mapped field by field rather than cast. A blanket `as CommittedElsewhereBlock[]`
      // would assert a shape these rows do not have — the timestamps arrive as bigint
      // strings and the id does not exist yet — and that is precisely how the last bug
      // here survived tsc: the cast agreed with the lie.
      return (result.rows as Record<string, unknown>[]).map((row) => ({
        id: derivedBlockId(String(row.sourceAssignmentId)),
        userId: String(row.userId),
        date: String(row.date),
        prName: String(row.prName),
        // ⚠️ THE SAME INSTANT FOR BOTH, deliberately.
        //
        // A DECLARED block's `updated_at` moves only when the PR re-blocks the
        // day with a different reason — rare. An ASSIGNMENT's moves on check-in,
        // check-out, wage seal and every status change — routine. Passing the
        // assignment's real pair through therefore made `createdAt !== updatedAt`
        // a near-perfect tell for "this is a rival's booking": measured live, 29
        // of 42 derived rows differed while 3 of 3 declared rows matched.
        //
        // Collapsing them removes the signal without lying about the block — a
        // derived block came into being at that instant and has never been
        // edited, which is precisely what a freshly declared row looks like.
        createdAt: new Date(Number(row.createdAtMs)),
        updatedAt: new Date(Number(row.createdAtMs)),
      }));
    } catch (error) {
      logger.error('[PrAvailabilityRepository.listCommittedElsewhere] Error:', error);
      // A derived list that failed must not read as "everyone is free" and invite the
      // double-booking this exists to stop — but it must not break the picker either.
      // The assign-time guard still refuses; failing here costs only the early warning.
      return [];
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
   * ⚠️ `listCommittedElsewhere` must apply the SAME two predicates. This comment
   * sat above that method for a while and described this one, which is roughly
   * how the missing status filter went unnoticed.
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
