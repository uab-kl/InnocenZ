import { and, eq, gte, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { AgencyTable } from '@/features/agency/agency.model';
import {
  PaymentVoucherDisputeTable,
  PaymentVoucherTable,
} from '@/features/payment-voucher/payment-voucher.model';
import { ShiftAssignmentTable } from '@/features/shift-assignment/shift-assignment.model';
import { ShiftTable } from '@/features/shift/shift.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import {
  AgencyPrTable,
  type AgencyPrApproveStatus,
  type AgencyPrType,
  type PrStatus,
  type PrTier,
} from '@/features/pr-personnel/pr.model';
import { UserTable } from '@/features/user/user.model';
// Leaf — the single age rule, shared with every other read path.
import { derivedAge } from '@/features/pr-personnel/ic-dob';
import { logger } from '@/util/logger';

/**
 * PR-account ↔ agency membership (`agency_pr`), keyed by `user_id` (migration
 * 0085). `main.pr` is gone (0089): identity is read straight off `user` /
 * `user_profile` here — never through a `pr` row, which no longer exists.
 */

/** One agency a PR account belongs to. */
export type PrAgencyLink = {
  /** Always equal to `userId` post-cutover — kept on the shape for callers. */
  prId: string | null;
  userId: string;
  agencyId: string;
  agencyName: string;
  agencyCode: string;
  approveStatus: AgencyPrApproveStatus;
  /**
   * THIS agency's grading of the PR (`agency_pr.tier`), e.g. 'tier_3'.
   *
   * Per-membership, not global: a PR can be tier_3 at one agency and tier_1 at
   * another, and both are true. It is carried here because the PR's own phone
   * profile printed a hardcoded "TIER V" — a tier that exists nowhere in the
   * database — beside a Manage-PR card reading tier_3 off this very row.
   * Null only when the agency has not graded them yet.
   */
  tier: string | null;
};

/** A PR on an agency's membership list, with account fields folded in. */
export type AgencyPrEnriched = {
  /** Membership row id — use for approve/reject (not the retired pr.id). */
  id: string;
  /** Always equal to `userId` post-cutover — so `rosterRowFromMembership` can
   * still key off it (kept name for callers, but there is no more `pr` row
   * behind it). */
  prId: string | null;
  /** No backing state anymore — `main.pr.status` (incl. `suspended`) is gone
   * with the table. Always `null`; kept on the shape for callers. */
  prStatus: PrStatus | null;
  agencyId: string;
  userId: string;
  name: string;
  nickname: string | null;
  approveStatus: AgencyPrApproveStatus;
  tier: PrTier;
  rejectReason: string | null;
  username: string | null;
  email: string | null;
  phoneNum: string | null;
  idNo: string | null;
  /**
   * Whole years, DERIVED from `idNo` (falling back to `dob`) — the same leaf
   * every other read path uses, so the Approvals screen and the comcard beside
   * it cannot disagree. Never stored, never settable.
   */
  age: number | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  profileImage: string | null;
  gender: string | null;
  race: string | null;
  /** Spoken languages the PR set on their own profile — `user_profile.languages`. */
  languages: string[] | null;
  /** ISO date or drizzle date string. */
  dob: string | Date | null;
  nationality: string | null;
  portfolioPhotos: (string | null)[] | null;
  /**
   * IC scans the PR uploaded at sign-up. Returned so the agency's Approvals
   * screen can actually verify identity — it read "Missing" for every PR
   * because these were never selected, not because no scan existed.
   *
   * These are `IDENTITY_DOC_FIELDS`: only ever send them from a route that is
   * role-gated AND scoped to the agency in `:id` (see agency.routes.ts).
   */
  idPhotoFront: string | null;
  idPhotoBack: string | null;
  comcardImage: string | null;
  comcardHeightCm: number | null;
  comcardWeightKg: number | null;
  comcardBustCm: number | null;
  comcardWaistCm: number | null;
  comcardHipCm: number | null;
  /** Agency-side roster grading (0089) — null when unset. */
  place: string | null;
  yearsExp: number | null;
  kpiTier: string | null;
  payClass: string | null;
};

export class AgencyPrRepository {
  /**
   * Of `userIds`, the ones that are APPROVED members of `agencyId` — the
   * subset an agency is allowed to address.
   *
   * The agency id comes from the route param the scope guard already checked,
   * and the user ids come from the request body, so this is the only thing
   * standing between "PRs I manage" and any user id the caller cares to type.
   * A bare role check cannot do it: every agency owner passes `requireRole`,
   * for every agency.
   *
   * Returns the intersection rather than a boolean so the caller can name how
   * many were rejected instead of silently addressing the survivors — a
   * broadcast that quietly drops recipients looks identical to one that worked.
   *
   * `pending` and `rejected` links are excluded on purpose: an applicant the
   * agency has not accepted is not theirs to message.
   */
  async listApprovedUserIdsIn(agencyId: string, userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];

    try {
      const rows = await db
        .select({ userId: AgencyPrTable.userId })
        .from(AgencyPrTable)
        .where(
          and(
            eq(AgencyPrTable.agencyId, agencyId),
            inArray(AgencyPrTable.userId, [...new Set(userIds)]),
            eq(AgencyPrTable.approveStatus, 'approved'),
          ),
        );
      return rows.map((row) => row.userId);
    } catch (error) {
      logger.error('[AgencyPrRepository.listApprovedUserIdsIn] Error:', error);
      // Empty on failure, never the input: a thrown query must not degrade into
      // "everyone passed the membership check".
      return [];
    }
  }

  /**
   * Every agency each of these user accounts is under.
   *
   * ⚠️ `agencyId` NARROWS THIS TO ONE AGENCY, and every non-admin caller must
   * pass it. Unfiltered, this returns each PR's FULL roster membership — the name
   * and code of every agency they work for, plus each agency's own private `tier`
   * grading of them. Handed to an agency, that is a rival's identity attached to a
   * shared PR, and a rival's pay grade for her.
   *
   * It also undoes the cross-agency anonymity the rest of the system rests on: the
   * roster grid deliberately says only WHEN a shared PR is unavailable, and an
   * unfiltered read here supplies the short list of WHO. The portal refuses to
   * render a foreign tier anywhere else — see the note in `agency-outlet-shifts.ts`
   * — so leaving this open contradicts a rule the codebase enforces everywhere.
   *
   * The PR's own `/mine/agencies*` routes call it unfiltered, correctly: those
   * memberships are hers, and she may see all of them. Admin likewise, for the
   * user-management screens. Nobody else.
   */
  async listLinksByUserIds(
    userIds: string[],
    options: { agencyId?: string } = {},
  ): Promise<PrAgencyLink[]> {
    if (userIds.length === 0) return [];

    try {
      const conditions = [inArray(AgencyPrTable.userId, userIds)];
      if (options.agencyId) {
        conditions.push(eq(AgencyPrTable.agencyId, options.agencyId));
      }
      const rows = await db
        .select({
          userId: AgencyPrTable.userId,
          agencyId: AgencyPrTable.agencyId,
          agencyName: AgencyTable.name,
          agencyCode: AgencyTable.agencyCode,
          memberCodePrefix: AgencyTable.memberCodePrefix,
          // A PR keeps seeing an agency she belongs to after it is switched
          // off — that is her history. She must be told it IS switched off,
          // rather than left to wonder why nothing comes from it any more.
          agencyStatus: AgencyTable.status,
          approveStatus: AgencyPrTable.approveStatus,
          tier: AgencyPrTable.tier,
        })
        .from(AgencyPrTable)
        .innerJoin(AgencyTable, eq(AgencyTable.id, AgencyPrTable.agencyId))
        .where(and(...conditions))
        .orderBy(AgencyTable.name);

      // `agency_pr` is unique on (agencyId, userId) — one row per link
      // already, no drifted-duplicate `pr` rows to collapse anymore.
      return rows.map((row) => ({ ...row, prId: row.userId }));
    } catch (error) {
      logger.error('[AgencyPrRepository.listLinksByUserIds] Error:', error);
      return [];
    }
  }

  /** This agency's linked PR accounts, optionally narrowed by approval / search. */
  async listByAgency(
    agencyId: string,
    options: { approveStatus?: AgencyPrApproveStatus; search?: string } = {},
  ): Promise<AgencyPrEnriched[]> {
    try {
      const conditions = [eq(AgencyPrTable.agencyId, agencyId)];
      if (options.approveStatus) {
        conditions.push(eq(AgencyPrTable.approveStatus, options.approveStatus));
      }
      if (options.search?.trim()) {
        const term = `%${options.search.trim()}%`;
        conditions.push(
          or(
            ilike(UserTable.username, term),
            ilike(UserTable.email, term),
            ilike(UserTable.phoneNum, term),
            ilike(UserProfileTable.fullName, term),
          )!,
        );
      }

      const rows = await db
        .select({
          id: AgencyPrTable.id,
          agencyId: AgencyPrTable.agencyId,
          userId: AgencyPrTable.userId,
          name: sql<string>`coalesce(nullif(trim(${UserProfileTable.fullName}), ''), ${UserTable.username}, 'PR')`,
          nickname: sql<string | null>`nullif(trim(${UserTable.username}), '')`,
          approveStatus: AgencyPrTable.approveStatus,
          tier: AgencyPrTable.tier,
          rejectReason: AgencyPrTable.rejectReason,
          username: UserTable.username,
          email: UserTable.email,
          phoneNum: UserTable.phoneNum,
          idNo: UserProfileTable.idNo,
          createdAt: AgencyPrTable.createdAt,
          updatedAt: AgencyPrTable.updatedAt,
          createdBy: AgencyPrTable.createdBy,
          updatedBy: AgencyPrTable.updatedBy,
          profileImage: UserTable.profileImage,
          gender: UserProfileTable.gender,
          race: UserProfileTable.race,
          // The join is already here — omitting this column was the reason an
          // agency saw no languages for a PR who had set them in her own portal.
          languages: UserProfileTable.languages,
          dob: UserProfileTable.dob,
          nationality: UserProfileTable.nationality,
          portfolioPhotos: UserProfileTable.portfolioPhotos,
          // Same join, same omission as `languages` above: the agency was
          // approving PRs against an IC panel that said "Missing" while the
          // scans sat in R2. Safe to send only because this route is now
          // role-gated and agency-scoped.
          idPhotoFront: UserProfileTable.idPhotoFront,
          idPhotoBack: UserProfileTable.idPhotoBack,
          comcardImage: UserProfileTable.comcardImage,
          comcardHeightCm: UserProfileTable.comcardHeightCm,
          comcardWeightKg: UserProfileTable.comcardWeightKg,
          comcardBustCm: UserProfileTable.comcardBustCm,
          comcardWaistCm: UserProfileTable.comcardWaistCm,
          comcardHipCm: UserProfileTable.comcardHipCm,
          place: AgencyPrTable.place,
          yearsExp: AgencyPrTable.yearsExp,
          kpiTier: AgencyPrTable.kpiTier,
          payClass: AgencyPrTable.payClass,
        })
        .from(AgencyPrTable)
        .innerJoin(UserTable, eq(UserTable.id, AgencyPrTable.userId))
        .leftJoin(UserProfileTable, eq(UserProfileTable.userId, AgencyPrTable.userId))
        .where(and(...conditions))
        .orderBy(UserTable.username);

      // `agency_pr` is unique on (agencyId, userId) — one row per user
      // already, no drifted-duplicate `pr` rows to collapse anymore. `prId`
      // is `userId` restated; `prStatus` has no backing state (see the type).
      // `...derivedAge(...)` overwrites `dob` with the IC's date and adds `age`.
      // This endpoint used to ship the RAW stored dob and no age at all, which
      // left the Approvals screen deriving its own — the one place in the agency
      // portal that still printed a different number from the comcard next to it.
      return rows.map((row) => ({
        ...row,
        ...derivedAge({ idNo: row.idNo, dob: row.dob }),
        prId: row.userId,
        prStatus: null,
      }));
    } catch (error) {
      logger.error('[AgencyPrRepository.listByAgency] Error:', error);
      return [];
    }
  }

  /** Narrows the given ids to the ones that are real agencies. */
  async filterExistingAgencyIds(agencyIds: string[]): Promise<string[]> {
    if (agencyIds.length === 0) return [];
    try {
      const rows = await db
        .select({ id: AgencyTable.id })
        .from(AgencyTable)
        .where(inArray(AgencyTable.id, agencyIds));
      return rows.map((row) => row.id);
    } catch (error) {
      logger.error('[AgencyPrRepository.filterExistingAgencyIds] Error:', error);
      return [];
    }
  }

  /** The roster-profile columns an agency grades its own PR on (0089).
   * `userId` is the PR account id (`id === userId` post-cutover — there is no
   * `pr` row / `pr_id` column on agency_pr anymore). */
  async upsertRosterProfile(
    agencyId: string,
    userId: string,
    patch: {
      place?: string;
      yearsExp?: number;
      kpiTier?: string;
      payClass?: string;
    },
    actor: string,
  ): Promise<void> {
    if (Object.keys(patch).length === 0) return;
    try {
      await db
        .insert(AgencyPrTable)
        .values({
          agencyId,
          userId,
          approveStatus: 'pending',
          ...patch,
          createdBy: actor,
          updatedBy: actor,
        })
        .onConflictDoUpdate({
          target: [AgencyPrTable.agencyId, AgencyPrTable.userId],
          // Only the supplied keys — never spread the whole row, or an omitted
          // field would be nulled out. approve_status is deliberately absent:
          // grading a PR must not silently approve or unapprove their join.
          set: { ...patch, updatedAt: new Date(), updatedBy: actor },
        });
    } catch (error) {
      logger.error('[AgencyPrRepository.upsertRosterProfile] Error:', error);
      throw error;
    }
  }

  /** Every agency_pr row for one user account. */
  async listByUser(userId: string): Promise<AgencyPrType[]> {
    try {
      return await db.select().from(AgencyPrTable).where(eq(AgencyPrTable.userId, userId));
    } catch (error) {
      logger.error('[AgencyPrRepository.listByUser] Error:', error);
      return [];
    }
  }

  /** @deprecated Use listByUser — `prId` is `userId` post-cutover, kept as an alias while callers migrate. */
  async listByPr(prId: string): Promise<AgencyPrType[]> {
    return this.listByUser(prId);
  }

  /**
   * Everything still unsettled between one PR and one agency — the reasons a
   * departure request must be refused, as plain-word sentences the phone shows
   * VERBATIM. Empty array = clear to leave.
   *
   * Three classes, per the owner's rule ("only everything relating pr and
   * agency is resolved then only can untick this agency"):
   *   1. Vouchers not fully PAID — 'paid' is the only terminal status; sent
   *      and even signed money is still owed.
   *   2. Open disputes (outcome NULL) on that agency's vouchers.
   *   3. Upcoming or unfinished shifts with this agency — shift_date today or
   *      later, or checked-in without checked-out, in an active staffing
   *      status. Cancelled / excused / completed rows do not block.
   *
   * Payee is matched on BOTH user_id and the legacy pr_id: they are equal
   * post-0089, but old rows may carry only one, and a gate scoped to a single
   * column would let a money-owed PR leave through the other.
   */
  async listLeaveBlockers(
    agencyId: string,
    userId: string,
    opts: { named?: boolean } = {},
  ): Promise<string[]> {
    const blockers: string[] = [];
    try {
      const payee = or(
        eq(PaymentVoucherTable.userId, userId),
        eq(PaymentVoucherTable.prId, userId),
      );

      const unpaid = await db
        .select({ voucherNo: PaymentVoucherTable.voucherNo, status: PaymentVoucherTable.status })
        .from(PaymentVoucherTable)
        .where(and(eq(PaymentVoucherTable.agencyId, agencyId), payee, ne(PaymentVoucherTable.status, 'paid')));
      if (unpaid.length > 0) {
        const count = `${unpaid.length} unpaid payment voucher${unpaid.length === 1 ? '' : 's'}`;
        // Named for the AGENCY only. The PR sees the count alone: they cannot
        // settle a voucher, and the papers are already listed on their Payment
        // screen, so numbers in a refusal were noise. The agency has to go and
        // pay these exact ones.
        const named = opts.named
          ? unpaid
              .slice(0, 3)
              .map((v) => v.voucherNo ?? 'unnumbered')
              .join(', ')
          : '';
        blockers.push(
          named
            ? `${count} (${named}${unpaid.length > 3 ? ', …' : ''})`
            : count,
        );
      }

      const [openDisputes] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(PaymentVoucherDisputeTable)
        .innerJoin(PaymentVoucherTable, eq(PaymentVoucherDisputeTable.voucherId, PaymentVoucherTable.id))
        .where(
          and(eq(PaymentVoucherTable.agencyId, agencyId), payee, isNull(PaymentVoucherDisputeTable.outcome)),
        );
      if ((openDisputes?.count ?? 0) > 0) {
        blockers.push(
          `${openDisputes.count} open dispute${openDisputes.count === 1 ? '' : 's'}`,
        );
      }

      // "Today" in the outlets' own timezone. UTC would roll the date back
      // before 8am MYT and misjudge tonight's shift.
      const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
      const [activeShifts] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .where(
          and(
            eq(ShiftAssignmentTable.agencyId, agencyId),
            or(
              eq(ShiftAssignmentTable.userId, userId),
              eq(ShiftAssignmentTable.prId, userId),
            ),
            inArray(ShiftAssignmentTable.status, ['assigned', 'confirmed', 'leave_pending']),
            or(
              gte(ShiftTable.shiftDate, todayIso),
              and(
                sql`${ShiftAssignmentTable.checkInAt} IS NOT NULL`,
                isNull(ShiftAssignmentTable.checkOutAt),
              ),
            ),
          ),
        );
      if ((activeShifts?.count ?? 0) > 0) {
        blockers.push(
          `${activeShifts.count} upcoming or unfinished shift${activeShifts.count === 1 ? '' : 's'}`,
        );
      }

      return blockers;
    } catch (error) {
      logger.error('[AgencyPrRepository.listLeaveBlockers] Error:', error);
      // Fail CLOSED: an unreadable ledger blocks the departure rather than
      // waving it through.
      return ['the settlement check could not be completed — try again'];
    }
  }

  /**
   * Point this user's agency links at exactly `agencyIds`.
   * New links are `pending` — agency must approve.
   *
   * ⚠️ THE DELETE IS SCOPED. This used to hard-delete every unpicked row —
   * APPROVED MEMBERSHIPS INCLUDED — which was a live escape hatch around the
   * settlement gate: unticking an agency on the phone walked out on unpaid
   * vouchers with zero checks. Now:
   *   - 'pending' / 'rejected' unpicked -> deleted (withdrawing a join
   *     request, or clearing a refusal — nothing is owed either way).
   *   - 'approved' / 'leave_pending' unpicked -> RETAINED. Leaving goes
   *     through requestAgencyLeave and the agency's approval, never through
   *     this replace-set save (the controller 409s first with the words; this
   *     is the belt to that braces).
   *   - 'left' unpicked -> RETAINED (history the approvals page reads).
   *   - 'left' / 'rejected' RE-picked -> flipped back to 'pending' (the
   *     unique (agency_id,user_id) key makes re-join an UPDATE, not an
   *     insert; the old code silently skipped these, so re-joining an agency
   *     you once left was a no-op that looked like a bug).
   */
  async syncLinksForUser(userId: string, agencyIds: string[], actor: string): Promise<void> {
    const wanted = [...new Set(agencyIds)];
    try {
      await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(AgencyPrTable)
          .where(eq(AgencyPrTable.userId, userId));

        const stale = existing
          .filter(
            (row) =>
              !wanted.includes(row.agencyId) &&
              (row.approveStatus === 'pending' || row.approveStatus === 'rejected'),
          )
          .map((row) => row.id);
        if (stale.length > 0) {
          await tx.delete(AgencyPrTable).where(inArray(AgencyPrTable.id, stale));
        }

        const rejoin = existing
          .filter(
            (row) =>
              wanted.includes(row.agencyId) &&
              (row.approveStatus === 'left' || row.approveStatus === 'rejected'),
          )
          .map((row) => row.id);
        if (rejoin.length > 0) {
          await tx
            .update(AgencyPrTable)
            .set({
              approveStatus: 'pending',
              rejectReason: null,
              updatedAt: new Date(),
              updatedBy: actor,
            })
            .where(inArray(AgencyPrTable.id, rejoin));
        }

        const known = new Set(existing.map((row) => row.agencyId));
        const added = wanted.filter((agencyId) => !known.has(agencyId));
        if (added.length > 0) {
          await tx.insert(AgencyPrTable).values(
            added.map((agencyId) => ({
              agencyId,
              userId,
              approveStatus: 'pending' as const,
              createdBy: actor,
              updatedBy: actor,
            })),
          );
        }
      });
    } catch (error) {
      logger.error('[AgencyPrRepository.syncLinksForUser] Error:', error);
      throw error;
    }
  }

  /** @deprecated Use syncLinksForUser — `prId` is `userId` post-cutover. */
  async syncLinksForPr(prId: string, agencyIds: string[], actor: string): Promise<void> {
    return this.syncLinksForUser(prId, agencyIds, actor);
  }

  /** Insert one pending (or approved) membership if missing. */
  async ensureLink(
    userId: string,
    agencyId: string,
    actor: string,
    approveStatus: AgencyPrApproveStatus = 'pending',
  ): Promise<void> {
    try {
      await db
        .insert(AgencyPrTable)
        .values({
          agencyId,
          userId,
          approveStatus,
          createdBy: actor,
          updatedBy: actor,
        })
        .onConflictDoNothing();
    } catch (error) {
      logger.error('[AgencyPrRepository.ensureLink] Error:', error);
      throw error;
    }
  }

  /** Insert or refresh membership (owner invite / approve path). */
  async upsertLink(
    userId: string,
    agencyId: string,
    actor: string,
    data: { approveStatus: AgencyPrApproveStatus; tier?: PrTier },
  ): Promise<AgencyPrType> {
    try {
      const [row] = await db
        .insert(AgencyPrTable)
        .values({
          agencyId,
          userId,
          approveStatus: data.approveStatus,
          tier: data.tier ?? 'tier_1',
          createdBy: actor,
          updatedBy: actor,
        })
        .onConflictDoUpdate({
          target: [AgencyPrTable.agencyId, AgencyPrTable.userId],
          set: {
            // Never stomp a pending DEPARTURE. An owner re-inviting a PR whose
            // leave request is open would otherwise flip leave_pending back to
            // 'approved' — silently cancelling a request the PR filed and the
            // approvals queue is showing. The departure is decided on the
            // approvals page, not by an invite racing it.
            approveStatus: sql`CASE WHEN ${AgencyPrTable.approveStatus} = 'leave_pending' THEN ${AgencyPrTable.approveStatus} ELSE ${data.approveStatus}::main.agency_pr_approve_status END`,
            ...(data.tier ? { tier: data.tier } : {}),
            rejectReason: data.approveStatus === 'approved' ? null : undefined,
            updatedAt: new Date(),
            updatedBy: actor,
          },
        })
        .returning();
      return row;
    } catch (error) {
      logger.error('[AgencyPrRepository.upsertLink] Error:', error);
      throw error;
    }
  }

  async updateMembership(
    agencyId: string,
    userId: string,
    data: { tier?: PrTier; approveStatus?: AgencyPrApproveStatus; rejectReason?: string | null },
    actor: string,
  ): Promise<AgencyPrType | null> {
    try {
      const [row] = await db
        .update(AgencyPrTable)
        .set({
          ...(data.tier ? { tier: data.tier } : {}),
          ...(data.approveStatus ? { approveStatus: data.approveStatus } : {}),
          ...(data.rejectReason !== undefined ? { rejectReason: data.rejectReason } : {}),
          updatedAt: new Date(),
          updatedBy: actor,
        })
        .where(and(eq(AgencyPrTable.agencyId, agencyId), eq(AgencyPrTable.userId, userId)))
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('[AgencyPrRepository.updateMembership] Error:', error);
      return null;
    }
  }

  /**
   * `removeLink` WAS HERE AND IS DELETED (10 Sep 2026). It hard-`DELETE`d the
   * `agency_pr` row, and it had ZERO callers — but it was named like the
   * obvious way to take a PR off a roster, which is exactly the danger.
   *
   * Removing a PR is `setApproveStatus(..., 'left')`. The row must SURVIVE:
   * the approvals page reads it to draw the Approved chip, a later re-join
   * relies on flipping the existing row back to `pending` (that is what the
   * unique key is for — a delete turns the re-join into an insert that
   * collides with it), and the record of who worked where is history the
   * platform is not entitled to erase.
   *
   * ⚠️ The money never depended on this row — `payment_voucher` carries its
   * own `agency_id` and no read joins `agency_pr` — so deleting it would not
   * have hidden a debt. It would have destroyed the explanation for one.
   */

  /**
   * Approvals screen — accept / decline a membership OR departure request.
   *
   * An explicitly-passed `rejectReason` is honoured for ANY status: a refused
   * departure returns the row to 'approved' carrying '[Leave rejected] …',
   * and the old "null it unless rejected" rule would have erased that note in
   * the same write that was meant to record it. Omit the param and the old
   * behaviour holds exactly.
   */
  async setApproveStatus(
    agencyId: string,
    userId: string,
    approveStatus: AgencyPrApproveStatus,
    actor: string,
    rejectReason?: string | null,
  ): Promise<AgencyPrType | null> {
    try {
      const [row] = await db
        .update(AgencyPrTable)
        .set({
          approveStatus,
          rejectReason:
            rejectReason !== undefined ? (rejectReason?.trim() || null) : null,
          updatedAt: new Date(),
          updatedBy: actor,
        })
        .where(and(eq(AgencyPrTable.agencyId, agencyId), eq(AgencyPrTable.userId, userId)))
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('[AgencyPrRepository.setApproveStatus] Error:', error);
      return null;
    }
  }
}
