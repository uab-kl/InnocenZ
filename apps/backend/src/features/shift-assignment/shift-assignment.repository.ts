import { and, asc, eq, gte, inArray, lte, notInArray, or, sql, SQL } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { ShiftTable, ShiftPayTierTable } from '@/features/shift/shift.model';
import { AgencyTable } from '@/features/agency/agency.model';
import { OutletTable } from '@/features/outlet/outlet.model';
import { AgencyPrTable } from '@/features/pr-personnel/pr.model';
import { UserTable } from '@/features/user/user.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import { DEFAULT_GEOFENCE_RADIUS_M } from './check-in-geofence';
import {
  OutletDrinkMenuTable,
  OutletTierRateTable,
  OutletWorkspaceTable,
} from '@/features/outlet-workspace/outlet-workspace.model';
import {
  ShiftAssignmentTable,
  ShiftAssignmentInsertType,
  ShiftAssignmentType,
  ShiftAssignmentWithContextType,
  ShiftAssignmentFilter,
  ShiftAssignmentCostFilter,
  ShiftCostPrDayTotals,
  ShiftAssignmentStatus,
} from './shift-assignment.model';

/**
 * Statuses that do not count as staffing cost — cancelled, no-show and
 * leave-approved PRs are not paid (an approved MC/leave excuses the shift).
 * Mirrors mobile `pickActive` (active-shift.tsx) and the canonical
 * `shiftAssignmentStatusValues` in shift-assignment.model.ts.
 */
export const NON_STAFFING_STATUSES = ['cancelled', 'no_show', 'leave_approved'] as const satisfies ReadonlyArray<ShiftAssignmentStatus>;

/**
 * A PR's display name: preferred nickname when set, otherwise legal name.
 * Shared by the assignment-list and cost queries so both show the same label.
 * (Restored after a merge dropped the definition while keeping its usages.)
 *
 * `main.pr` is gone — nickname is `user.username`, legal name is
 * `user_profile.full_name`. Works regardless of HOW `user`/`user_profile` got
 * joined into the query (see `assigneeUserId` below), since it only reaches
 * for those two tables' columns.
 */
const prDisplayNameSql = sql<string>`coalesce(nullif(trim(${UserTable.username}), ''), nullif(trim(${UserProfileTable.fullName}), ''), 'PR')`;

/**
 * `pr_id` equals `user_id` for every row post-cutover (0089) — the old FK to
 * `main.pr` is gone along with the table. `user_id` is still preferred when
 * present (it is the newer, intentionally-set column); `pr_id` is the
 * fallback for any row that predates the dual-write backfill.
 */
const assigneeUserId = sql`coalesce(${ShiftAssignmentTable.userId}, ${ShiftAssignmentTable.prId})`;

/**
 * The rate card resolved for one PR tier at one outlet. Numeric columns stay as
 * their raw string form (matching Drizzle's numeric select), so the mobile app
 * parses them the same way it already parses `payPerHour`/`payAmount`. Any field
 * is null when the outlet left it unset (e.g. commission-only has no wage/OT).
 */
export type ResolvedTierRate = {
  wagePerHour: string | null;
  drinkPct: string; // normal-hour drink commission %
  happyHourDrinkPct: string | null; // happy-hour drink commission %
  tipPct: string;
  otAfterHours: string | null;
  targetSalesRm: string | null;
  happyHourStart: string; // 'HH:MM' or '' when no window set
  happyHourEnd: string;
};

/**
 * A per-shift rate override — the same rate fields as a workspace tier rate but
 * without the happy-hour window (a shift override never moves the window; it
 * always comes from the outlet workspace). Any field null means "not overridden
 * — fall back to the workspace default".
 */
export type ShiftTierOverride = Omit<
  ResolvedTierRate,
  'happyHourStart' | 'happyHourEnd'
>;

/**
 * One drink the PR can self-log at an outlet. `id` carries the menu slug (the
 * mobile app keys quantities on it); `priceRm` stays a numeric string, parsed
 * client-side like the other money fields. Sourced from `outlet_drink_menu`.
 */
export type ResolvedDrinkItem = {
  id: string;
  name: string;
  priceRm: string;
  /**
   * Catalog section from outlet_drink_menu.category: 'drink' | 'service' |
   * 'tip'. Drives which PR scan/self-log list (Drinks vs Tips/Service) the
   * item appears under on the phone.
   */
  category: string;
};

/**
 * One released-but-unfilled slot on an upcoming shift: the cancelled /
 * leave-approved assignment plus enough FK-joined shift/outlet context for the
 * agency to backfill it. `staffedCount` counts the shift's remaining staffing
 * assignments (statuses outside NON_STAFFING_STATUSES).
 */
export type BackfillSlot = {
  assignmentId: string;
  prId: string;
  prName: string;
  status: ShiftAssignmentStatus;
  notes: string | null;
  shiftId: string;
  shiftDate: string;
  slot: string | null;
  eventName: string | null;
  outletId: string;
  outletName: string | null;
  quantity: number;
  staffedCount: number;
};

/** One ranked replacement option for a released slot. */
export type ReplacementCandidate = {
  prId: string;
  userId: string | null;
  prName: string;
  tier: string;
  /** Completed shifts this PR has worked at the slot's outlet. */
  timesAtOutlet: number;
};

/**
 * The shift behind one attendance row — what a caller needs to say WHICH shift
 * a figure came from: the venue, what the night was called, whether it was a
 * special event, its window, and the two stamps.
 *
 * ⚠️ `checkOutAt` is CLAMPED to the shift's scheduled end when the PR taps out
 * (see the check-out path in this file). It is therefore "shift end", NOT the
 * moment the PR actually left — printing it as "checked out at" states a time
 * that never happened on every overtime shift. The real overrun survives only
 * in `overtimeMinutes`, which is why it travels beside it.
 *
 * `shiftDate` is a DATE column: the driver hands it back as local midnight, so
 * a 6 Aug shift serialises as `2026-08-05T16:00:00Z` in UTC+8. Anything
 * comparing it as an instant lands a day early.
 */
export type AssignmentShiftFacts = {
  id: string;
  /** The owning PR — callers MUST re-check this against the PR they asked for. */
  prId: string;
  shiftDate: string;
  /** Free text, nullable, e.g. "18:00 - 19:00". Print verbatim; never parse. */
  slot: string | null;
  eventName: string | null;
  /** 'normal' | 'special' — never null (DB default). */
  eventKind: string;
  outletName: string | null;
  checkInAt: Date | null;
  /** Shift END, clamped — see the warning above. */
  checkOutAt: Date | null;
  overtimeMinutes: number | null;
};

export class ShiftAssignmentRepositoryClass {
  async create(
    data: Omit<ShiftAssignmentInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<ShiftAssignmentType> {
    try {
      const dbClient = tx ?? db;
      const [assignment] = await dbClient.insert(ShiftAssignmentTable).values(data).returning();
      logger.info('[ShiftAssignmentRepository.create] Assignment created:', assignment.id);
      return assignment;
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.create] Error:', error);
      throw error;
    }
  }

  async update(
    id: string,
    data: Partial<ShiftAssignmentInsertType>,
    tx?: DbTransaction,
  ): Promise<ShiftAssignmentType | null> {
    try {
      const dbClient = tx ?? db;
      const [assignment] = await dbClient
        .update(ShiftAssignmentTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(ShiftAssignmentTable.id, id))
        .returning();
      // Empty result => row not found (a genuine null); a real DB error re-throws below.
      return assignment ?? null;
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.update] Error:', error);
      throw error;
    }
  }

  async getById(id: string): Promise<ShiftAssignmentType | null> {
    try {
      const [assignment] = await db
        .select()
        .from(ShiftAssignmentTable)
        .where(eq(ShiftAssignmentTable.id, id))
        .limit(1);
      return assignment ?? null;
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.getById] Error:', error);
      throw error;
    }
  }

  async listByShift(shiftId: string): Promise<ShiftAssignmentType[]> {
    try {
      return await db
        .select()
        .from(ShiftAssignmentTable)
        .where(eq(ShiftAssignmentTable.shiftId, shiftId))
        .orderBy(ShiftAssignmentTable.createdAt);
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.listByShift] Error:', error);
      throw error;
    }
  }

  /**
   * Every assignment has a shift (FK, not null), so the inner join is lossless.
   * It is what lets an outlet caller be scoped by venue, and it carries the
   * shift/PR context the outlet portal cannot fetch on its own (no `/pr` access).
   */
  async listPaginated(params: {
    filter?: ShiftAssignmentFilter;
    page: number;
    pageSize: number;
  }): Promise<{ assignments: ShiftAssignmentWithContextType[]; totalCount: number }> {
    try {
      const { filter, page, pageSize } = params;
      const conditions: SQL[] = [];
      if (filter?.id) conditions.push(eq(ShiftAssignmentTable.id, filter.id));
      if (filter?.agencyId) conditions.push(eq(ShiftAssignmentTable.agencyId, filter.agencyId));
      if (filter?.shiftId) conditions.push(eq(ShiftAssignmentTable.shiftId, filter.shiftId));
      if (filter?.prId) conditions.push(eq(ShiftAssignmentTable.prId, filter.prId));
      if (filter?.status) conditions.push(eq(ShiftAssignmentTable.status, filter.status));
      if (filter?.leaveStatuses) {
        if (filter.leaveStatuses.length === 0) return { assignments: [], totalCount: 0 };
        conditions.push(inArray(ShiftAssignmentTable.leaveStatus, filter.leaveStatuses));
      }
      // An empty array must match nothing, not everything — guard before inArray.
      if (filter?.outletIds) {
        if (filter.outletIds.length === 0) return { assignments: [], totalCount: 0 };
        conditions.push(inArray(ShiftTable.outletId, filter.outletIds));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countRow] = await db
        .select({ value: sql<number>`count(*)::int` as SQL<number> })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .where(whereClause);
      const totalCount = Number(countRow?.value ?? 0);

      const rows = await db
        .select({
          assignment: ShiftAssignmentTable,
          prName: prDisplayNameSql,
          outletId: ShiftTable.outletId,
          outletName: OutletTable.name,
          // Joined through the assignment's own agency FK — an OUTLET caller is
          // barred from GET /agency (it must not enumerate agencies), so without
          // this it can only ever show the literal "Agency" for whoever staffed
          // its own night. Reading the name here leaks nothing extra: the outlet
          // already knows this agency worked for it.
          agencyName: AgencyTable.name,
          shiftDate: ShiftTable.shiftDate,
        })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .leftJoin(OutletTable, eq(OutletTable.id, ShiftTable.outletId))
        .leftJoin(AgencyTable, eq(AgencyTable.id, ShiftAssignmentTable.agencyId))
        .leftJoin(UserTable, eq(UserTable.id, assigneeUserId))
        .leftJoin(UserProfileTable, eq(UserProfileTable.userId, assigneeUserId))
        .where(whereClause)
        .orderBy(ShiftAssignmentTable.createdAt)
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const assignments = rows.map((row) => ({
        ...row.assignment,
        prName: row.prName,
        outletId: row.outletId,
        outletName: row.outletName,
        agencyName: row.agencyName,
        shiftDate: row.shiftDate,
      }));

      return { assignments, totalCount };
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.listPaginated] Error:', error);
      throw error;
    }
  }

  /**
   * Every shift assignment for one PR, with the shift + outlet context the PR
   * app renders (date, slot/time, event, pay). Outlet name is joined from the
   * FK, never copied onto the row. Chronological by shift date.
   */
  async listForPr(prId: string): Promise<
    Array<
      ShiftAssignmentType & {
        shiftDate: string;
        slot: string | null;
        eventName: string | null;
        /**
         * `shift.event_kind` — 'normal' | 'special'. Carried alongside the name
         * because the PR's Today list can hold three shifts at the SAME outlet
         * on the same day, and the venue alone cannot tell them apart. Not null
         * in the database (defaults to 'normal').
         */
        eventKind: string;
        payPerHour: string;
        outletId: string;
        outletName: string | null;
        /** `outlet.logo_image` — the COMPANY logo, not the owner's account avatar. */
        outletLogo: string | null;
        outletAddress: string | null;
        /** Venue pin off the outlet FK — null until the outlet drops its pin. */
        outletLat: number | null;
        outletLng: number | null;
        outletGeoFenceRadiusM: number;
      }
    >
  > {
    return this.listMineAssignments({ prId });
  }

  /**
   * PR mobile `/mine` — prefer `user_id` (0087), fall back to legacy `pr_id`.
   */
  async listForUser(userId: string): Promise<
    Array<
      ShiftAssignmentType & {
        shiftDate: string;
        slot: string | null;
        eventName: string | null;
        /**
         * `shift.event_kind` — 'normal' | 'special'. Carried alongside the name
         * because the PR's Today list can hold three shifts at the SAME outlet
         * on the same day, and the venue alone cannot tell them apart. Not null
         * in the database (defaults to 'normal').
         */
        eventKind: string;
        payPerHour: string;
        outletId: string;
        outletName: string | null;
        /** `outlet.logo_image` — the COMPANY logo, not the owner's account avatar. */
        outletLogo: string | null;
        outletAddress: string | null;
        outletLat: number | null;
        outletLng: number | null;
        outletGeoFenceRadiusM: number;
      }
    >
  > {
    return this.listMineAssignments({ userId });
  }

  private async listMineAssignments(filter: { prId?: string; userId?: string }): Promise<
    Array<
      ShiftAssignmentType & {
        shiftDate: string;
        slot: string | null;
        eventName: string | null;
        /**
         * `shift.event_kind` — 'normal' | 'special'. Carried alongside the name
         * because the PR's Today list can hold three shifts at the SAME outlet
         * on the same day, and the venue alone cannot tell them apart. Not null
         * in the database (defaults to 'normal').
         */
        eventKind: string;
        payPerHour: string;
        outletId: string;
        outletName: string | null;
        /** `outlet.logo_image` — the COMPANY logo, not the owner's account avatar. */
        outletLogo: string | null;
        outletAddress: string | null;
        outletLat: number | null;
        outletLng: number | null;
        outletGeoFenceRadiusM: number;
      }
    >
  > {
    try {
      // `pr_id` equals `user_id` for every row post-cutover (0089) — matching
      // it directly replaces the old join through `main.pr.user_id`.
      const ownership = filter.userId
        ? or(
            eq(ShiftAssignmentTable.userId, filter.userId),
            eq(ShiftAssignmentTable.prId, filter.userId),
          )
        : filter.prId
          ? eq(ShiftAssignmentTable.prId, filter.prId)
          : sql`false`;

      const rows = await db
        .select({
          assignment: ShiftAssignmentTable,
          shiftDate: ShiftTable.shiftDate,
          slot: ShiftTable.slot,
          eventName: ShiftTable.eventName,
          eventKind: ShiftTable.eventKind,
          payPerHour: ShiftTable.payPerHour,
          outletId: ShiftTable.outletId,
          outletName: OutletTable.name,
          /*
           * The venue's COMPANY logo — `outlet.logo_image`, not the owner's
           * personal account avatar, which lives on `user.profile_image` and is
           * a different picture of a different thing.
           *
           * Same FK path as the address: read through the join, never copied
           * onto the assignment. The join was already here and every other
           * outlet column was being taken; this one simply was not, so the PR
           * app had nothing to draw and fell back to the first letter of the
           * venue name on every shift card it has ever shown.
           */
          outletLogo: OutletTable.logoImage,
          // Address parts read straight off the FK-joined outlet — never copied
          // onto the assignment. Composed into one display line below.
          outletAddressLine1: OutletTable.addressLine1,
          outletAddressLine2: OutletTable.addressLine2,
          outletCity: OutletTable.city,
          outletPostcode: OutletTable.postcode,
          outletState: OutletTable.state,
          // The venue pin, same FK path as getOutletGeoFenceForAssignment.
          outletLat: OutletTable.lat,
          outletLng: OutletTable.lng,
          outletGeoFenceRadius: OutletTable.geoFenceRadius,
        })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .leftJoin(OutletTable, eq(ShiftTable.outletId, OutletTable.id))
        .where(ownership)
        .orderBy(ShiftTable.shiftDate);
      return rows.map((row) => {
        // "50000 Petaling Jaya, Selangor" — city/postcode + state as one piece.
        const cityLine = [row.outletPostcode, row.outletCity, row.outletState]
          .map((s) => s?.trim())
          .filter(Boolean)
          .join(' ');
        const outletAddress =
          [row.outletAddressLine1, row.outletAddressLine2, cityLine]
            .map((s) => s?.trim())
            .filter(Boolean)
            .join(', ') || null;
        return {
          ...row.assignment,
          shiftDate: row.shiftDate,
          slot: row.slot,
          eventName: row.eventName,
          eventKind: row.eventKind,
          payPerHour: row.payPerHour,
          outletId: row.outletId,
          outletName: row.outletName,
          outletLogo: row.outletLogo,
          outletAddress,
          outletLat: row.outletLat === null ? null : Number(row.outletLat),
          outletLng: row.outletLng === null ? null : Number(row.outletLng),
          outletGeoFenceRadiusM: row.outletGeoFenceRadius ?? DEFAULT_GEOFENCE_RADIUS_M,
        };
      });
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.listForPr] Error:', error);
      throw error;
    }
  }

  /**
   * The attendance stamps behind a specific set of assignments, for ONE PR.
   *
   * Feeds the Payment page's evidence sheet: a voucher line names the shift it
   * came from by id, and the stamps are read back through that FK rather than
   * copied onto the line. `slot` / `eventName` / `outletName` come off the shift
   * and outlet FKs exactly as `listForPr` takes them — one fact, one table.
   *
   * ⚠️ `prId` in the WHERE is a SECURITY boundary, not an optimisation. The ids
   * originate from `payment_voucher_receipt.shift_assignment_id`, which is
   * written from client input at receipt-creation time and is not validated
   * against the PR there. Filtering on the id list alone would let a stale or
   * crafted id surface another PR's shift times; scoped like this it resolves to
   * nothing instead. Never rewrite this as a bare `inArray(ids)`.
   *
   * An empty id list returns [] without touching the database — the common case
   * for a week where nothing has been logged yet.
   */
  // (type declared at module scope — see AssignmentShiftFacts below the class)
  async listByIdsForPr(prId: string, ids: string[]): Promise<AssignmentShiftFacts[]> {
    return this.listByIdsForPrs([prId], ids);
  }

  /**
   * The same lookup for SEVERAL PRs at once — the agency's dispute queue spans
   * up to 200 disputes belonging to many different PRs, and one query beats one
   * per PR.
   *
   * ⚠️ The security boundary documented above is UNCHANGED and must stay so.
   * This is `inArray(prId, prIds)`, never the forbidden bare `inArray(ids)`: an
   * id the caller did not earn still resolves to nothing. Callers must ALSO
   * pair each returned row back to the PR they asked it for — `prId` is on the
   * row for exactly that, so an assignment can never be attached to a dispute
   * belonging to someone else. It fails closed: a mismatch yields no shift and
   * the card says "not linked", rather than showing another PR's stamps.
   */
  async listByIdsForPrs(prIds: string[], ids: string[]): Promise<AssignmentShiftFacts[]> {
    if (ids.length === 0 || prIds.length === 0) return [];
    try {
      const rows = await db
        .select({
          id: ShiftAssignmentTable.id,
          prId: ShiftAssignmentTable.prId,
          checkInAt: ShiftAssignmentTable.checkInAt,
          checkOutAt: ShiftAssignmentTable.checkOutAt,
          overtimeMinutes: ShiftAssignmentTable.overtimeMinutes,
          shiftDate: ShiftTable.shiftDate,
          slot: ShiftTable.slot,
          eventName: ShiftTable.eventName,
          // The one column this query lacked. `listForPr` in this same file
          // already selects it. NOT NULL, defaults to 'normal', so once the
          // shift row is reached the event TYPE always has a value.
          eventKind: ShiftTable.eventKind,
          outletName: OutletTable.name,
        })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .leftJoin(OutletTable, eq(ShiftTable.outletId, OutletTable.id))
        .where(and(inArray(ShiftAssignmentTable.id, ids), inArray(ShiftAssignmentTable.prId, prIds)))
        .orderBy(ShiftAssignmentTable.checkInAt);
      return rows.map((row) => ({
        id: row.id,
        prId: row.prId,
        shiftDate: row.shiftDate,
        slot: row.slot,
        eventName: row.eventName,
        eventKind: row.eventKind,
        outletName: row.outletName,
        checkInAt: row.checkInAt,
        checkOutAt: row.checkOutAt,
        overtimeMinutes: row.overtimeMinutes ?? null,
      }));
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.listByIdsForPrs] Error:', error);
      throw error;
    }
  }

  /**
   * The outlet map pin that fences one assignment, reached purely by FK:
   * shift_assignment -> shift.outlet_id -> outlet.lat/lng/geo_fence_radius.
   * Nothing about the outlet is copied onto the assignment — the pin can be
   * moved on the outlet row and every future check-in follows it immediately.
   * Returns null when the assignment (or its shift/outlet) is gone; returns a
   * row with lat/lng = null when the outlet has not dropped its pin yet, which
   * the caller treats as "not fenceable" rather than "reject".
   */
  async getOutletGeoFenceForAssignment(assignmentId: string): Promise<{
    outletId: string;
    lat: number | null;
    lng: number | null;
    radiusM: number;
  } | null> {
    try {
      const [row] = await db
        .select({
          outletId: OutletTable.id,
          lat: OutletTable.lat,
          lng: OutletTable.lng,
          radiusM: OutletTable.geoFenceRadius,
        })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .innerJoin(OutletTable, eq(ShiftTable.outletId, OutletTable.id))
        .where(eq(ShiftAssignmentTable.id, assignmentId))
        .limit(1);
      if (!row) return null;
      return {
        outletId: row.outletId,
        lat: row.lat === null ? null : Number(row.lat),
        lng: row.lng === null ? null : Number(row.lng),
        radiusM: row.radiusM ?? DEFAULT_GEOFENCE_RADIUS_M,
      };
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.getOutletGeoFenceForAssignment] Error:', error);
      throw error;
    }
  }

  /**
   * WHICH OUTLET one assignment was worked at, by the same FK chain as the
   * geo-fence above: shift_assignment -> shift.outlet_id -> outlet.id/name.
   *
   * The sibling of `getOutletGeoFenceForAssignment` for callers that must NAME
   * the outlet rather than fence it — the PV review has to say whose price list
   * an item was checked against, and reusing the geo-fence row for that would
   * tie a money refusal to whether the outlet has dropped its map pin. Null when
   * the assignment (or its shift/outlet) is gone.
   */
  async getOutletForAssignment(
    assignmentId: string,
  ): Promise<{ outletId: string; outletName: string } | null> {
    try {
      const [row] = await db
        .select({ outletId: OutletTable.id, outletName: OutletTable.name })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .innerJoin(OutletTable, eq(ShiftTable.outletId, OutletTable.id))
        .where(eq(ShiftAssignmentTable.id, assignmentId))
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.getOutletForAssignment] Error:', error);
      throw error;
    }
  }

  /**
   * Upcoming shift slots that lost their PR (cancelled or approved MC/leave)
   * and are still short-staffed — the agency's backfill worklist. Staffing is
   * recounted per shift so a slot drops off as soon as a replacement is
   * assigned. Shift/outlet/PR context is FK-joined, never copied.
   */
  async listBackfillSlots(params: {
    fromDate: string;
    agencyId?: string;
  }): Promise<BackfillSlot[]> {
    try {
      const conditions: SQL[] = [
        inArray(ShiftAssignmentTable.status, ['cancelled', 'leave_approved']),
        gte(ShiftTable.shiftDate, params.fromDate),
      ];
      if (params.agencyId) {
        conditions.push(eq(ShiftAssignmentTable.agencyId, params.agencyId));
      }
      const released = await db
        .select({
          assignmentId: ShiftAssignmentTable.id,
          prId: ShiftAssignmentTable.prId,
          prName: prDisplayNameSql,
          status: ShiftAssignmentTable.status,
          notes: ShiftAssignmentTable.notes,
          shiftId: ShiftTable.id,
          shiftDate: ShiftTable.shiftDate,
          slot: ShiftTable.slot,
          eventName: ShiftTable.eventName,
          outletId: ShiftTable.outletId,
          outletName: OutletTable.name,
          quantity: ShiftTable.quantity,
        })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        // No more FK to `main.pr` guaranteeing a match — left join and let
        // prDisplayNameSql's own 'PR' fallback cover a miss.
        .leftJoin(UserTable, eq(UserTable.id, assigneeUserId))
        .leftJoin(UserProfileTable, eq(UserProfileTable.userId, assigneeUserId))
        .leftJoin(OutletTable, eq(ShiftTable.outletId, OutletTable.id))
        .where(and(...conditions))
        .orderBy(asc(ShiftTable.shiftDate));
      if (released.length === 0) return [];

      const shiftIds = [...new Set(released.map((r) => r.shiftId))];
      const staffedRows = await db
        .select({
          shiftId: ShiftAssignmentTable.shiftId,
          staffed: sql<number>`count(*)::int`,
        })
        .from(ShiftAssignmentTable)
        .where(
          and(
            inArray(ShiftAssignmentTable.shiftId, shiftIds),
            notInArray(ShiftAssignmentTable.status, [...NON_STAFFING_STATUSES]),
          ),
        )
        .groupBy(ShiftAssignmentTable.shiftId);
      const staffedByShift = new Map(staffedRows.map((r) => [r.shiftId, r.staffed]));

      return released
        .map((r) => ({ ...r, staffedCount: staffedByShift.get(r.shiftId) ?? 0 }))
        .filter((r) => r.staffedCount < r.quantity);
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.listBackfillSlots] Error:', error);
      throw error;
    }
  }

  /**
   * Ranked replacement PRs for a released slot: the agency's active PRs with no
   * staffing assignment on that date (an existing booking — including a pending
   * leave — makes a PR busy). "Nearest" without geodata = the released PR's
   * tier first (rate parity with what Post Job budgeted), then how often the
   * candidate has completed shifts at this outlet, then name.
   */
  async listReplacementCandidates(params: {
    agencyId: string;
    shiftDate: string;
    outletId: string;
    excludePrIds: string[];
    preferTier?: string;
  }): Promise<ReplacementCandidate[]> {
    try {
      const busyRows = await db
        .select({ prId: ShiftAssignmentTable.prId })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .where(
          and(
            eq(ShiftTable.shiftDate, params.shiftDate),
            notInArray(ShiftAssignmentTable.status, [...NON_STAFFING_STATUSES]),
          ),
        );
      const unavailable = new Set([
        ...busyRows.map((r) => r.prId),
        ...params.excludePrIds,
      ]);

      // `main.pr` is gone — an agency's active PRs are its approved
      // `agency_pr` members now, with identity joined off `user`/`user_profile`.
      const prs = await db
        .select({
          prId: AgencyPrTable.userId,
          userId: AgencyPrTable.userId,
          prName: prDisplayNameSql,
          tier: AgencyPrTable.tier,
        })
        .from(AgencyPrTable)
        .innerJoin(UserTable, eq(UserTable.id, AgencyPrTable.userId))
        .leftJoin(UserProfileTable, eq(UserProfileTable.userId, AgencyPrTable.userId))
        .where(and(eq(AgencyPrTable.agencyId, params.agencyId), eq(AgencyPrTable.approveStatus, 'approved')))
        .orderBy(asc(prDisplayNameSql));
      const free = prs.filter((p) => !unavailable.has(p.prId));
      if (free.length === 0) return [];

      // Venue familiarity: completed shifts this candidate worked at the outlet.
      const experienceRows = await db
        .select({
          prId: ShiftAssignmentTable.prId,
          times: sql<number>`count(*)::int`,
        })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .where(
          and(
            eq(ShiftTable.outletId, params.outletId),
            eq(ShiftAssignmentTable.status, 'completed'),
            inArray(ShiftAssignmentTable.prId, free.map((p) => p.prId)),
          ),
        )
        .groupBy(ShiftAssignmentTable.prId);
      const timesByPr = new Map(experienceRows.map((r) => [r.prId, r.times]));

      return free
        .map((p) => ({
          prId: p.prId,
          userId: p.userId,
          prName: p.prName,
          tier: p.tier,
          timesAtOutlet: timesByPr.get(p.prId) ?? 0,
        }))
        .sort(
          (a, b) =>
            Number(b.tier === params.preferTier) - Number(a.tier === params.preferTier) ||
            b.timesAtOutlet - a.timesAtOutlet ||
            a.prName.localeCompare(b.prName),
        );
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.listReplacementCandidates] Error:', error);
      throw error;
    }
  }

  /**
   * Resolve the pay/commission rate card, per outlet, for one PR tier. Joins the
   * outlet's workspace to its tier-rate row: a ranked tier matches on the label
   * (`Tier I`..`Servant`); commission-only matches the single `kind` row (no
   * label). The happy-hour window comes from the workspace parent. Outlets with
   * no workspace, or no matching tier row, simply don't appear in the map — the
   * caller treats a miss as "rate not configured". Rates are read via FK join,
   * never duplicated onto the assignment.
   */
  async resolveTierRatesForOutlets(params: {
    outletIds: string[];
    tierLabel: string | null;
    commissionOnly: boolean;
  }): Promise<Map<string, ResolvedTierRate>> {
    const result = new Map<string, ResolvedTierRate>();
    const { outletIds, tierLabel, commissionOnly } = params;
    // Nothing to resolve: no outlets, or a ranked tier with no label to match.
    if (outletIds.length === 0) return result;
    if (!commissionOnly && !tierLabel) return result;
    try {
      const uniqueOutletIds = [...new Set(outletIds)];
      const tierMatch = commissionOnly
        ? eq(OutletTierRateTable.kind, 'commission_only')
        : and(
            eq(OutletTierRateTable.kind, 'tier'),
            eq(OutletTierRateTable.tier, tierLabel!),
          );
      const rows = await db
        .select({
          outletId: OutletWorkspaceTable.outletId,
          happyHourStart: OutletWorkspaceTable.happyHourStart,
          happyHourEnd: OutletWorkspaceTable.happyHourEnd,
          wagePerHour: OutletTierRateTable.wagePerHour,
          drinkPct: OutletTierRateTable.drinkPct,
          happyHourDrinkPct: OutletTierRateTable.happyHourDrinkPct,
          tipPct: OutletTierRateTable.tipPct,
          otAfterHours: OutletTierRateTable.otAfterHours,
          targetSalesRm: OutletTierRateTable.targetSalesRm,
        })
        .from(OutletWorkspaceTable)
        .innerJoin(
          OutletTierRateTable,
          and(eq(OutletTierRateTable.workspaceId, OutletWorkspaceTable.id), tierMatch),
        )
        .where(inArray(OutletWorkspaceTable.outletId, uniqueOutletIds));
      for (const row of rows) {
        result.set(row.outletId, {
          wagePerHour: row.wagePerHour,
          drinkPct: row.drinkPct,
          happyHourDrinkPct: row.happyHourDrinkPct,
          tipPct: row.tipPct,
          otAfterHours: row.otAfterHours,
          targetSalesRm: row.targetSalesRm,
          happyHourStart: row.happyHourStart,
          happyHourEnd: row.happyHourEnd,
        });
      }
      return result;
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.resolveTierRatesForOutlets] Error:', error);
      throw error;
    }
  }

  /**
   * Resolve the per-shift pay-tier OVERRIDE, per shift, for one PR tier. Same
   * tier-matching as the workspace resolver but keyed on `shift_pay_tier` rows an
   * outlet set at post time. A shift with no override row for the tier simply
   * doesn't appear — the caller then uses the outlet workspace default.
   */
  async resolveShiftTierOverrides(params: {
    shiftIds: string[];
    tierLabel: string | null;
    commissionOnly: boolean;
  }): Promise<Map<string, ShiftTierOverride>> {
    const result = new Map<string, ShiftTierOverride>();
    const { shiftIds, tierLabel, commissionOnly } = params;
    if (shiftIds.length === 0) return result;
    if (!commissionOnly && !tierLabel) return result;
    try {
      const uniqueShiftIds = [...new Set(shiftIds)];
      const tierMatch = commissionOnly
        ? eq(ShiftPayTierTable.kind, 'commission_only')
        : and(
            eq(ShiftPayTierTable.kind, 'tier'),
            eq(ShiftPayTierTable.tier, tierLabel!),
          );
      const rows = await db
        .select({
          shiftId: ShiftPayTierTable.shiftId,
          wagePerHour: ShiftPayTierTable.wagePerHour,
          drinkPct: ShiftPayTierTable.drinkPct,
          happyHourDrinkPct: ShiftPayTierTable.happyHourDrinkPct,
          tipPct: ShiftPayTierTable.tipPct,
          otAfterHours: ShiftPayTierTable.otAfterHours,
          targetSalesRm: ShiftPayTierTable.targetSalesRm,
        })
        .from(ShiftPayTierTable)
        .where(and(inArray(ShiftPayTierTable.shiftId, uniqueShiftIds), tierMatch));
      for (const row of rows) {
        result.set(row.shiftId, {
          wagePerHour: row.wagePerHour,
          drinkPct: row.drinkPct,
          happyHourDrinkPct: row.happyHourDrinkPct,
          tipPct: row.tipPct,
          otAfterHours: row.otAfterHours,
          targetSalesRm: row.targetSalesRm,
        });
      }
      return result;
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.resolveShiftTierOverrides] Error:', error);
      throw error;
    }
  }

  /**
   * Resolve the drink menu, per outlet, from each outlet's workspace. Joins the
   * outlet's workspace to its `outlet_drink_menu` rows (FK), ordered by the
   * outlet's own sort order. Outlets with no workspace, or an empty menu, simply
   * don't appear in the map — the caller renders no menu for them. The menu is
   * read via FK join, never duplicated onto the assignment.
   */
  async resolveDrinkMenusForOutlets(
    outletIds: string[],
  ): Promise<Map<string, ResolvedDrinkItem[]>> {
    const result = new Map<string, ResolvedDrinkItem[]>();
    if (outletIds.length === 0) return result;
    try {
      const uniqueOutletIds = [...new Set(outletIds)];
      const rows = await db
        .select({
          outletId: OutletWorkspaceTable.outletId,
          slug: OutletDrinkMenuTable.slug,
          name: OutletDrinkMenuTable.name,
          priceRm: OutletDrinkMenuTable.priceRm,
          category: OutletDrinkMenuTable.category,
        })
        .from(OutletWorkspaceTable)
        .innerJoin(
          OutletDrinkMenuTable,
          eq(OutletDrinkMenuTable.workspaceId, OutletWorkspaceTable.id),
        )
        .where(inArray(OutletWorkspaceTable.outletId, uniqueOutletIds))
        .orderBy(asc(OutletDrinkMenuTable.sortOrder));
      for (const row of rows) {
        const list = result.get(row.outletId) ?? [];
        list.push({
          id: row.slug,
          name: row.name,
          priceRm: row.priceRm,
          category: row.category,
        });
        result.set(row.outletId, list);
      }
      return result;
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.resolveDrinkMenusForOutlets] Error:', error);
      throw error;
    }
  }

  /**
   * Completed assignments for an agency whose shift falls in [fromDate, toDate],
   * joined to the shift for its date/outlet/pay context. This is the query the
   * weekly PV-generation job groups by PR to build voucher lines.
   */
  async listCompletedForAgencyWeek(params: {
    agencyId: string;
    fromDate: string;
    toDate: string;
  }): Promise<
    Array<{
      assignment: ShiftAssignmentType;
      shiftDate: string;
      outletId: string;
      outletName: string | null;
      slot: string | null;
      eventName: string | null;
    }>
  > {
    try {
      const { agencyId, fromDate, toDate } = params;
      const rows = await db
        .select({
          assignment: ShiftAssignmentTable,
          shiftDate: ShiftTable.shiftDate,
          outletId: ShiftTable.outletId,
          outletName: OutletTable.name,
          slot: ShiftTable.slot,
          eventName: ShiftTable.eventName,
        })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .leftJoin(OutletTable, eq(ShiftTable.outletId, OutletTable.id))
        .where(
          and(
            eq(ShiftAssignmentTable.agencyId, agencyId),
            eq(ShiftAssignmentTable.status, 'completed'),
            gte(ShiftTable.shiftDate, fromDate),
            lte(ShiftTable.shiftDate, toDate),
          ),
        )
        .orderBy(ShiftTable.shiftDate);
      return rows;
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.listCompletedForAgencyWeek] Error:', error);
      throw error;
    }
  }

  /**
   * Overtime still awaiting an agency decision, for one PR's week.
   *
   * Exists to serve the send gate. The owner's rule (31 Jul 2026) is that
   * overtime is paid on the voucher of the week it was WORKED — "together with
   * the week PV it originates from" — which only holds if the decision is made
   * before that week goes out. So a pending row here blocks the send, the same
   * way a held day and an unreviewed receipt already do, and approving overtime
   * onto a voucher the PR already holds is prevented rather than handled.
   *
   * Keyed on the PR and the week rather than on the voucher, because the link
   * between a voucher and its shifts is the line `ref` — and a shift whose
   * overtime was never approved has no line to be referenced by. The rows that
   * matter most are exactly the ones a voucher-join would miss.
   */
  async listPendingOvertimeForPrWeek(params: {
    prId: string;
    fromDate: string;
    toDate: string;
  }): Promise<Array<{ assignmentId: string; shiftDate: string; overtimeMinutes: number | null }>> {
    try {
      const { prId, fromDate, toDate } = params;
      return await db
        .select({
          assignmentId: ShiftAssignmentTable.id,
          shiftDate: ShiftTable.shiftDate,
          overtimeMinutes: ShiftAssignmentTable.overtimeMinutes,
        })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .where(
          and(
            eq(ShiftAssignmentTable.prId, prId),
            eq(ShiftAssignmentTable.overtimeStatus, 'pending'),
            gte(ShiftTable.shiftDate, fromDate),
            lte(ShiftTable.shiftDate, toDate),
          ),
        )
        .orderBy(ShiftTable.shiftDate);
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.listPendingOvertimeForPrWeek] Error:', error);
      throw error;
    }
  }

  /**
   * Atomically CLAIMS the pending overtime decision on one assignment.
   *
   * ⚠️ This exists because the obvious shape — read the row, see 'pending',
   * write the voucher line, then stamp the decision — pays twice on a double
   * click. Both requests read 'pending', both find no existing line, both
   * insert one. A read-then-write check is not a lock, and the thing being
   * guarded here is money leaving the business.
   *
   * The `WHERE overtime_status = 'pending'` makes the transition itself the
   * mutex: exactly one caller can move the row out of 'pending', and the loser
   * gets null and answers 409. The decision is therefore stamped BEFORE the line
   * is written, and the caller compensates with `revertOvertimeDecision` if the
   * write then fails — an approval that left no line is recoverable, a line paid
   * twice is not.
   */
  async claimOvertimeDecision(params: {
    assignmentId: string;
    status: 'approved' | 'rejected';
    amount: string;
    actor: string;
  }): Promise<ShiftAssignmentType | null> {
    try {
      const [row] = await db
        .update(ShiftAssignmentTable)
        .set({
          overtimeStatus: params.status,
          overtimeAmount: params.amount,
          overtimeDecidedAt: new Date(),
          overtimeDecidedBy: params.actor,
          updatedAt: new Date(),
          updatedBy: params.actor,
        })
        .where(
          and(
            eq(ShiftAssignmentTable.id, params.assignmentId),
            eq(ShiftAssignmentTable.overtimeStatus, 'pending'),
          ),
        )
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.claimOvertimeDecision] Error:', error);
      throw error;
    }
  }

  /**
   * Puts a claimed decision back to 'pending' after the voucher write failed.
   *
   * The compensating half of `claimOvertimeDecision`. Without it a failed line
   * write would leave the claim marked approved with nothing on the voucher —
   * unpaid overtime that no longer appears on anyone's worklist, and which the
   * send gate would happily let the week close over.
   *
   * Deliberately unconditional on the current status: it only ever runs on a row
   * this request just claimed, and refusing to undo because the row moved again
   * would strand exactly the case it exists for.
   */
  async revertOvertimeDecision(assignmentId: string, actor: string): Promise<void> {
    try {
      await db
        .update(ShiftAssignmentTable)
        .set({
          overtimeStatus: 'pending',
          overtimeAmount: null,
          overtimeDecidedAt: null,
          overtimeDecidedBy: null,
          updatedAt: new Date(),
          updatedBy: actor,
        })
        .where(eq(ShiftAssignmentTable.id, assignmentId));
    } catch (error) {
      // Logged, never rethrown: this runs inside a failure path, and replacing
      // the original error with this one hides why the approval failed.
      logger.error('[ShiftAssignmentRepository.revertOvertimeDecision] Error:', error);
    }
  }

  /**
   * Everything the overtime decision needs about one assignment, in one read.
   *
   * The approval has to place a voucher line on the week the shift was WORKED,
   * so it needs the shift's own `shift_date` — the assignment has no date of its
   * own — and the outlet name the line is labelled with. Fetched together rather
   * than as three round trips because they are one fact: which shift this claim
   * is for.
   */
  async getOvertimeContext(assignmentId: string): Promise<{
    assignment: ShiftAssignmentType;
    shiftDate: string;
    slot: string | null;
    outletName: string | null;
  } | null> {
    try {
      const [row] = await db
        .select({
          assignment: ShiftAssignmentTable,
          shiftDate: ShiftTable.shiftDate,
          slot: ShiftTable.slot,
          outletName: OutletTable.name,
        })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .leftJoin(OutletTable, eq(ShiftTable.outletId, OutletTable.id))
        .where(eq(ShiftAssignmentTable.id, assignmentId))
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.getOvertimeContext] Error:', error);
      throw error;
    }
  }

  /**
   * Every overtime claim awaiting a decision across one agency — the worklist
   * behind the agency's overtime screen.
   *
   * Distinct from `listPendingOvertimeForPrWeek`, which answers the send gate's
   * narrow question about ONE PR's week. This one answers "what is waiting on
   * us", and carries the PR name and the sealed daily wage so the screen can
   * price each claim without a second call per row.
   *
   * Oldest first: a claim that has been waiting since last Tuesday is the one
   * blocking a week from being sent, and it should not be buried under today's.
   */
  async listPendingOvertimeForAgency(agencyId: string): Promise<
    Array<{
      assignmentId: string;
      prId: string;
      prName: string | null;
      shiftId: string;
      shiftDate: string;
      slot: string | null;
      outletName: string | null;
      overtimeMinutes: number | null;
      payAmount: string | null;
      /** The FULL day rate — what overtime is priced on. See `overtimeBasisAmount`. */
      dayRateAmount: string | null;
      /** The shift's window — the divisor for both pay and the overtime rate. */
      scheduledMinutes: number | null;
    }>
  > {
    try {
      return await db
        .select({
          assignmentId: ShiftAssignmentTable.id,
          prId: ShiftAssignmentTable.prId,
          // Nickname-or-name, the same display rule the roster uses.
          prName: prDisplayNameSql,
          shiftId: ShiftAssignmentTable.shiftId,
          shiftDate: ShiftTable.shiftDate,
          slot: ShiftTable.slot,
          outletName: OutletTable.name,
          overtimeMinutes: ShiftAssignmentTable.overtimeMinutes,
          payAmount: ShiftAssignmentTable.payAmount,
          dayRateAmount: ShiftAssignmentTable.dayRateAmount,
          scheduledMinutes: ShiftAssignmentTable.scheduledMinutes,
        })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .leftJoin(OutletTable, eq(ShiftTable.outletId, OutletTable.id))
        .leftJoin(UserTable, eq(UserTable.id, assigneeUserId))
        .leftJoin(UserProfileTable, eq(UserProfileTable.userId, assigneeUserId))
        .where(
          and(
            eq(ShiftAssignmentTable.agencyId, agencyId),
            eq(ShiftAssignmentTable.overtimeStatus, 'pending'),
          ),
        )
        .orderBy(ShiftTable.shiftDate);
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.listPendingOvertimeForAgency] Error:', error);
      throw error;
    }
  }

  /**
   * Attendance position fixes for one agency on one shift date, joined to the
   * shift for its slot and to the outlet for its pin.
   *
   * These are SNAPSHOTS, not tracking. `shift_assignment` stores a position only
   * at check-in and at check-out (see the column comments on the model), and no
   * table anywhere records a position between them, so the newest thing this can
   * report about a PR on duty is where they stood when they stamped. Anything
   * built on it must say so rather than imply a current location.
   *
   * `distance_m` is the server's own recomputed metres from the outlet pin, so it
   * is the trustworthy number — prefer it over recomputing from the returned
   * coordinates, which would silently disagree if the venue pin has moved since.
   *
   * Rows with no check-in are included on purpose: "rostered but not stamped yet"
   * is a real state the caller needs distinguished from "stamped, no fix
   * recorded". Both arrive as nulls in different columns, never as a guess.
   * Excludes NON_STAFFING_STATUSES, since a cancelled or excused PR is not due at
   * the venue at all.
   */
  async listAttendanceFixesForAgencyDate(params: {
    agencyId: string;
    shiftDate: string;
  }): Promise<
    Array<{
      assignmentId: string;
      prId: string;
      prName: string;
      status: ShiftAssignmentStatus;
      shiftDate: string;
      slot: string | null;
      outletId: string;
      outletName: string | null;
      outletLat: string | null;
      outletLng: string | null;
      outletGeoFenceRadius: number | null;
      checkInAt: Date | null;
      checkInLat: string | null;
      checkInLng: string | null;
      checkInDistanceM: number | null;
      checkInAccuracyM: number | null;
      checkOutAt: Date | null;
      checkOutLat: string | null;
      checkOutLng: string | null;
      checkOutDistanceM: number | null;
      checkOutAccuracyM: number | null;
    }>
  > {
    try {
      const { agencyId, shiftDate } = params;
      const rows = await db
        .select({
          assignmentId: ShiftAssignmentTable.id,
          prId: ShiftAssignmentTable.prId,
          prName: prDisplayNameSql,
          status: ShiftAssignmentTable.status,
          shiftDate: ShiftTable.shiftDate,
          slot: ShiftTable.slot,
          outletId: ShiftTable.outletId,
          outletName: OutletTable.name,
          outletLat: OutletTable.lat,
          outletLng: OutletTable.lng,
          outletGeoFenceRadius: OutletTable.geoFenceRadius,
          checkInAt: ShiftAssignmentTable.checkInAt,
          checkInLat: ShiftAssignmentTable.checkInLat,
          checkInLng: ShiftAssignmentTable.checkInLng,
          checkInDistanceM: ShiftAssignmentTable.checkInDistanceM,
          checkInAccuracyM: ShiftAssignmentTable.checkInAccuracyM,
          checkOutAt: ShiftAssignmentTable.checkOutAt,
          checkOutLat: ShiftAssignmentTable.checkOutLat,
          checkOutLng: ShiftAssignmentTable.checkOutLng,
          checkOutDistanceM: ShiftAssignmentTable.checkOutDistanceM,
          checkOutAccuracyM: ShiftAssignmentTable.checkOutAccuracyM,
        })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        // No more FK to `main.pr` guaranteeing a match — left join.
        .leftJoin(UserTable, eq(UserTable.id, assigneeUserId))
        .leftJoin(UserProfileTable, eq(UserProfileTable.userId, assigneeUserId))
        .leftJoin(OutletTable, eq(ShiftTable.outletId, OutletTable.id))
        .where(
          and(
            eq(ShiftAssignmentTable.agencyId, agencyId),
            eq(ShiftTable.shiftDate, shiftDate),
            notInArray(ShiftAssignmentTable.status, [...NON_STAFFING_STATUSES]),
          ),
        )
        .orderBy(asc(OutletTable.name), asc(prDisplayNameSql));
      return rows;
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.listAttendanceFixesForAgencyDate] Error:', error);
      throw error;
    }
  }

  /** Distinct agency IDs that have any completed assignment in [fromDate, toDate]. */
  async listAgencyIdsWithCompletedInRange(fromDate: string, toDate: string): Promise<string[]> {
    try {
      const rows = await db
        .selectDistinct({ agencyId: ShiftAssignmentTable.agencyId })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .where(
          and(
            eq(ShiftAssignmentTable.status, 'completed'),
            gte(ShiftTable.shiftDate, fromDate),
            lte(ShiftTable.shiftDate, toDate),
          ),
        );
      return rows.map((r) => r.agencyId);
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.listAgencyIdsWithCompletedInRange] Error:', error);
      throw error;
    }
  }

  /**
   * Shared WHERE for the report cost aggregates: exclude non-staffing statuses,
   * then pin to the caller's org (agency or a set of venues, via the joined
   * shift) and the shift-date window. Empty `outletIds` is guarded by the caller.
   */
  private buildCostConditions(filter?: ShiftAssignmentCostFilter): SQL | undefined {
    const conditions: SQL[] = [
      notInArray(ShiftAssignmentTable.status, [...NON_STAFFING_STATUSES]),
    ];
    if (filter?.agencyId) conditions.push(eq(ShiftAssignmentTable.agencyId, filter.agencyId));
    if (filter?.outletId) conditions.push(eq(ShiftTable.outletId, filter.outletId));
    if (filter?.outletIds) conditions.push(inArray(ShiftTable.outletId, filter.outletIds));
    if (filter?.fromDate) conditions.push(gte(ShiftTable.shiftDate, filter.fromDate));
    if (filter?.toDate) conditions.push(lte(ShiftTable.shiftDate, filter.toDate));
    return and(...conditions);
  }

  /**
   * Manpower cost grouped by (PR, shift date) — the cost side of the report.
   * Aggregating server-side removes the old client-side 100-row assignment cap
   * that under-counted cost (and so overstated margin); the (PR × day) grain
   * lets the client slice any date range and roll up both P&L and top-PRs.
   */
  async reportCostByPrDay(filter?: ShiftAssignmentCostFilter): Promise<ShiftCostPrDayTotals[]> {
    try {
      if (filter?.outletIds && filter.outletIds.length === 0) return [];
      const rows = await db
        .select({
          prId: ShiftAssignmentTable.prId,
          prName: prDisplayNameSql,
          soldOn: ShiftTable.shiftDate,
          cost: sql<number>`coalesce(sum(${ShiftAssignmentTable.payAmount}), 0)::float8`,
        })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .leftJoin(UserTable, eq(UserTable.id, assigneeUserId))
        .leftJoin(UserProfileTable, eq(UserProfileTable.userId, assigneeUserId))
        .where(this.buildCostConditions(filter))
        .groupBy(
          ShiftAssignmentTable.prId,
          UserTable.username,
          UserProfileTable.fullName,
          ShiftTable.shiftDate,
        )
        .orderBy(asc(ShiftTable.shiftDate));
      return rows.map((r) => ({
        prId: r.prId,
        prName: r.prName,
        soldOn: r.soldOn,
        cost: Number(r.cost),
      }));
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.reportCostByPrDay] Error:', error);
      return [];
    }
  }

  async remove(id: string): Promise<boolean> {
    try {
      const [row] = await db
        .delete(ShiftAssignmentTable)
        .where(eq(ShiftAssignmentTable.id, id))
        .returning({ id: ShiftAssignmentTable.id });
      // No row => not found; a real DB error re-throws below.
      return !!row;
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.remove] Error:', error);
      throw error;
    }
  }

  /**
   * What a PR actually did, for penalty evaluation. Read-only.
   *
   * Three counts from deliberately different windows, because the rules use
   * different ones: shifts and lates are per WEEK, MC is per calendar MONTH.
   *
   * Lateness is the fiddly part. `slot` is text like "22:00 - 04:00" and
   * `check_in_at` is timestamptz, so the shift's start has to be rebuilt as a
   * real instant before the two can be compared — hence the explicit
   * `AT TIME ZONE 'Asia/Kuala_Lumpur'`. Comparing a naive date+time against a
   * UTC timestamp is exactly the mistake that once made an 04:01Z check-in look
   * like 4am when it was really noon.
   *
   * A shift with no parseable slot cannot be judged late, so it is skipped
   * rather than counted either way — an unknown is not a breach.
   */
  async attendanceWindow(input: {
    prId: string;
    weekStart: string;
    weekEnd: string;
    graceMinutes: number;
  }): Promise<{ shiftsThisWeek: number; lateThisWeek: number; mcThisMonth: number }> {
    try {
      const { prId, weekStart, weekEnd, graceMinutes } = input;
      const result = await db.execute(sql`
        with wk as (
          select sa.status, sa.check_in_at, s.shift_date, s.slot
          from main.shift_assignment sa
          join main.shift s on s.id = sa.shift_id
          where sa.pr_id = ${prId}
            and s.shift_date between ${weekStart} and ${weekEnd}
        ),
        mth as (
          select 1
          from main.shift_assignment sa
          join main.shift s on s.id = sa.shift_id
          where sa.pr_id = ${prId}
            and sa.status = 'leave_approved'
            and date_trunc('month', s.shift_date::date)
                = date_trunc('month', ${weekStart}::date)
        )
        select
          (select count(*)::int from wk where status = 'completed') as shifts_this_week,
          (select count(*)::int from wk
             where status = 'completed'
               and check_in_at is not null
               and slot ~ '^[0-9]{1,2}:[0-9]{2}'
               and check_in_at >
                   ((shift_date::date + split_part(slot, ' - ', 1)::time)
                      at time zone 'Asia/Kuala_Lumpur')
                   + make_interval(mins => ${graceMinutes})
          ) as late_this_week,
          (select count(*)::int from mth) as mc_this_month
      `);

      const rows = (Array.isArray(result)
        ? result
        : ((result as { rows?: unknown[] })?.rows ?? [])) as Array<{
        shifts_this_week: number;
        late_this_week: number;
        mc_this_month: number;
      }>;
      const row = rows[0];

      return {
        shiftsThisWeek: row?.shifts_this_week ?? 0,
        lateThisWeek: row?.late_this_week ?? 0,
        mcThisMonth: row?.mc_this_month ?? 0,
      };
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.attendanceWindow] Error:', error);
      throw error;
    }
  }
}
