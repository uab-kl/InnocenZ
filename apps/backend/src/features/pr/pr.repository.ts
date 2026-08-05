import { and, asc, eq, exists, ilike, inArray, or, sql, SQL } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { ShiftTable } from '@/features/shift/shift.model';
import { ShiftAssignmentTable } from '@/features/shift-assignment/shift-assignment.model';
import { UserTable } from '@/features/user/user.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import {
  AgencyPrTable,
  type AgencyPrApproveStatus,
  type AgencyPrType,
  PrInsertType,
  PrType,
  PrFilter,
  PrProfile,
  PrStatus,
  PrWithProfileType,
  type PrTier,
} from './pr.model';

// `main.pr` is gone. Everything below builds the SYNTHETIC row from `user` +
// `user_profile` (identity) + `agency_pr` (agency, tier, approval) — never
// duplicated, always joined by `userId`. `id === userId` on every result.

// Comcard / identity columns exposed alongside each synthetic PR row. They
// live on the linked user account — the same source the admin PR screen
// reads, which keeps both screens showing one truth.
const profileColumns = {
  profileImage: UserTable.profileImage,
  gender: UserProfileTable.gender,
  race: UserProfileTable.race,
  dob: UserProfileTable.dob,
  nationality: UserProfileTable.nationality,
  portfolioPhotos: UserProfileTable.portfolioPhotos,
  comcardImage: UserProfileTable.comcardImage,
  comcardHeightCm: UserProfileTable.comcardHeightCm,
  comcardWeightKg: UserProfileTable.comcardWeightKg,
  comcardBustCm: UserProfileTable.comcardBustCm,
  comcardWaistCm: UserProfileTable.comcardWaistCm,
  comcardHipCm: UserProfileTable.comcardHipCm,
};

/** Collapses an all-null left-join result (no profile row yet) to `null`. */
function toProfile(row: PrProfile): PrProfile | null {
  const hasValue = Object.values(row).some((value) => value !== null && value !== undefined);
  return hasValue ? row : null;
}

/** `agency_pr.approve_status` → the old `pr.status` vocabulary. There is no
 * more `suspended` state to map to — nothing ever wrote it to a bridge row
 * that lived independently of a membership, so a caller filtering on it now
 * legitimately matches nothing. */
function statusFromApproval(approveStatus?: AgencyPrApproveStatus): PrStatus {
  if (approveStatus === 'approved') return 'active';
  if (approveStatus === 'rejected') return 'inactive';
  return 'pending';
}

/**
 * Assembles one synthetic `PrType` (+ profile) from the pieces FK-joined off
 * `userId`. `membership` is the account's PRIMARY `agency_pr` row (or `null`
 * for an account with none yet) — name/nickname always come from the
 * account, tier/status/rejectReason always come from the membership, per the
 * one-fact-one-table rule. `id` is always `userId`.
 */
function composePr(params: {
  userId: string;
  membership: AgencyPrType | null;
  username: string;
  phoneNum: string | null;
  email: string | null;
  fullName: string | null;
  idNo: string | null;
  accountCreatedAt: Date;
  accountUpdatedAt: Date;
  accountCreatedBy: string;
  accountUpdatedBy: string;
  profile: PrProfile | null;
}): PrWithProfileType {
  const { membership, userId } = params;
  const name = params.fullName?.trim() || params.username || 'PR';
  return {
    id: userId,
    agencyId: membership?.agencyId ?? '',
    userId,
    name,
    nickname: params.username || null,
    tier: membership?.tier ?? 'tier_1',
    status: statusFromApproval(membership?.approveStatus),
    rejectReason: membership?.rejectReason ?? null,
    phone: params.phoneNum,
    email: params.email,
    icNo: params.idNo,
    createdAt: membership?.createdAt ?? params.accountCreatedAt,
    updatedAt: membership?.updatedAt ?? params.accountUpdatedAt,
    createdBy: membership?.createdBy ?? params.accountCreatedBy,
    updatedBy: membership?.updatedBy ?? params.accountUpdatedBy,
    profile: params.profile,
  };
}

/**
 * Builds the synthetic PR for one user account. `null` ONLY when the user
 * itself does not exist — an account with zero `agency_pr` rows still
 * resolves (agencyId `''`, status `pending`), because `id === userId` holds
 * for every account, not just ones already on a roster.
 *
 * When an account holds more than one `agency_pr` row (multiple agencies),
 * the OLDEST wins — same "originating agency" tie-break the old `pr` bridge
 * used for a user with drifted duplicate `pr` rows, tie-broken by id so the
 * order is total.
 */
async function buildSyntheticPr(userId: string): Promise<PrWithProfileType | null> {
  const [account] = await db
    .select({
      username: UserTable.username,
      phoneNum: UserTable.phoneNum,
      email: UserTable.email,
      createdAt: UserTable.createdAt,
      updatedAt: UserTable.updatedAt,
      createdBy: UserTable.createdBy,
      updatedBy: UserTable.updatedBy,
      fullName: UserProfileTable.fullName,
      idNo: UserProfileTable.idNo,
      ...profileColumns,
    })
    .from(UserTable)
    .leftJoin(UserProfileTable, eq(UserProfileTable.userId, UserTable.id))
    .where(eq(UserTable.id, userId))
    .limit(1);
  if (!account) return null;

  const memberships = await db
    .select()
    .from(AgencyPrTable)
    .where(eq(AgencyPrTable.userId, userId))
    .orderBy(asc(AgencyPrTable.createdAt), asc(AgencyPrTable.id));
  const primary = memberships[0] ?? null;

  const profile = toProfile({
    profileImage: account.profileImage,
    gender: account.gender,
    race: account.race,
    dob: account.dob,
    nationality: account.nationality,
    portfolioPhotos: account.portfolioPhotos,
    comcardImage: account.comcardImage,
    comcardHeightCm: account.comcardHeightCm,
    comcardWeightKg: account.comcardWeightKg,
    comcardBustCm: account.comcardBustCm,
    comcardWaistCm: account.comcardWaistCm,
    comcardHipCm: account.comcardHipCm,
  });

  return composePr({
    userId,
    membership: primary,
    username: account.username,
    phoneNum: account.phoneNum,
    email: account.email,
    fullName: account.fullName,
    idNo: account.idNo,
    accountCreatedAt: account.createdAt,
    accountUpdatedAt: account.updatedAt,
    accountCreatedBy: account.createdBy,
    accountUpdatedBy: account.updatedBy,
    profile,
  });
}

export class PrRepositoryClass {
  /**
   * `main.pr` is dropped — there is nothing left to INSERT. A PR is a user
   * account; establish (or refresh) the agency link with `ensureOpsBridge`.
   */
  async create(
    _data: Omit<PrInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    _tx?: DbTransaction,
  ): Promise<PrType> {
    throw new Error(
      '[PrRepository.create] main.pr is retired — a PR is a user account now; ' +
        'call ensureOpsBridge to create/refresh its agency_pr membership instead.',
    );
  }

  /**
   * The synthetic PR linked to a user account — how a signed-in PR resolves
   * its own `pr.id` server-side (`id === userId`, so this is really just an
   * existence + enrichment check on `user`). `null` only if the account
   * itself is gone.
   */
  async getByUserId(userId: string): Promise<PrType | null> {
    try {
      return await buildSyntheticPr(userId);
    } catch (error) {
      logger.error('[PrRepository.getByUserId] Error:', error);
      return null;
    }
  }

  /**
   * Temporary ops bridge name, permanent ops behaviour: callers still ask to
   * "bridge" a PR before scheduling one, so this still exists — it just no
   * longer inserts into `pr`. It upserts the `agency_pr` membership
   * (approved, with the given tier) and patches whatever identity fields the
   * caller passed onto `user` / `user_profile`. `nickname` is deliberately
   * NOT written anywhere: nickname is now always `user.username`, and that is
   * the account's login handle — only the account-settings flow may rename
   * it, never a roster bridge.
   */
  async ensureOpsBridge(input: {
    userId: string;
    agencyId: string;
    actor: string;
    tier?: PrTier;
    name?: string;
    nickname?: string | null;
    phone?: string | null;
    email?: string | null;
    icNo?: string | null;
  }): Promise<PrType> {
    try {
      await db
        .insert(AgencyPrTable)
        .values({
          agencyId: input.agencyId,
          userId: input.userId,
          approveStatus: 'approved',
          tier: input.tier ?? 'tier_1',
          createdBy: input.actor,
          updatedBy: input.actor,
        })
        .onConflictDoUpdate({
          target: [AgencyPrTable.agencyId, AgencyPrTable.userId],
          set: {
            approveStatus: 'approved',
            ...(input.tier ? { tier: input.tier } : {}),
            rejectReason: null,
            updatedAt: new Date(),
            updatedBy: input.actor,
          },
        });

      if (input.name !== undefined || input.icNo !== undefined) {
        await db
          .update(UserProfileTable)
          .set({
            ...(input.name ? { fullName: input.name } : {}),
            ...(input.icNo !== undefined ? { idNo: input.icNo } : {}),
            updatedAt: new Date(),
            updatedBy: input.actor,
          })
          .where(eq(UserProfileTable.userId, input.userId));
      }
      if (input.phone !== undefined || input.email !== undefined) {
        await db
          .update(UserTable)
          .set({
            ...(input.phone !== undefined ? { phoneNum: input.phone } : {}),
            ...(input.email !== undefined ? { email: input.email } : {}),
            updatedAt: new Date(),
            updatedBy: input.actor,
          })
          .where(eq(UserTable.id, input.userId));
      }

      const pr = await this.getByUserId(input.userId);
      if (!pr) {
        throw new Error(`user ${input.userId} not found — cannot bridge a PR that has no account`);
      }
      return pr;
    } catch (error) {
      logger.error('[PrRepository.ensureOpsBridge] Error:', error);
      throw error;
    }
  }

  /**
   * Just the user ids of an agency's PRs. Enough to scope a query that keys
   * on a PR id without paging the whole roster through `listPaginated`.
   * Every membership regardless of approval — matches the old table's
   * behaviour, which never filtered `listIdsByAgency` on `pr.status` either.
   * Fails closed: an error yields an empty list, which callers must treat as
   * "matches nothing" rather than "no filter".
   */
  async listIdsByAgency(agencyId: string): Promise<string[]> {
    try {
      const rows = await db
        .select({ userId: AgencyPrTable.userId })
        .from(AgencyPrTable)
        .where(eq(AgencyPrTable.agencyId, agencyId));
      return rows.map((row) => row.userId);
    } catch (error) {
      logger.error('[PrRepository.listIdsByAgency] Error:', error);
      return [];
    }
  }

  /**
   * `id` is `userId` — writes route to `agency_pr` (tier / approval /
   * rejectReason) and `user` / `user_profile` (identity). Most callers have
   * already written the identity half directly before reaching here; this
   * re-applies the same fields, which is idempotent, and is what actually
   * commits `agencyId`/`tier`/`status`/`rejectReason` for a caller that has
   * not.
   */
  async update(
    id: string,
    data: Partial<PrInsertType>,
    tx?: DbTransaction,
  ): Promise<PrType | null> {
    try {
      const dbClient = tx ?? db;
      const current = await this.getByUserId(id);
      if (!current) return null;

      const agencyId = data.agencyId ?? current.agencyId;
      const actor = data.updatedBy ?? current.updatedBy;

      if (agencyId && (data.tier !== undefined || data.status !== undefined || data.rejectReason !== undefined)) {
        const approveStatus =
          data.status === 'active'
            ? ('approved' as const)
            : data.status === 'inactive'
              ? ('rejected' as const)
              : data.status === 'pending'
                ? ('pending' as const)
                : undefined;
        await dbClient
          .update(AgencyPrTable)
          .set({
            ...(data.tier ? { tier: data.tier } : {}),
            ...(approveStatus ? { approveStatus } : {}),
            ...(data.rejectReason !== undefined ? { rejectReason: data.rejectReason } : {}),
            updatedAt: new Date(),
            updatedBy: actor,
          })
          .where(and(eq(AgencyPrTable.agencyId, agencyId), eq(AgencyPrTable.userId, id)));
      }

      if (data.name !== undefined || data.icNo !== undefined) {
        await dbClient
          .update(UserProfileTable)
          .set({
            ...(data.name !== undefined ? { fullName: data.name } : {}),
            ...(data.icNo !== undefined ? { idNo: data.icNo } : {}),
            updatedAt: new Date(),
            updatedBy: actor,
          })
          .where(eq(UserProfileTable.userId, id));
      }

      if (data.phone !== undefined || data.email !== undefined) {
        await dbClient
          .update(UserTable)
          .set({
            ...(data.phone !== undefined ? { phoneNum: data.phone } : {}),
            ...(data.email !== undefined ? { email: data.email } : {}),
            updatedAt: new Date(),
            updatedBy: actor,
          })
          .where(eq(UserTable.id, id));
      }

      // Empty result below => row not found (a genuine null); a real DB error
      // from any of the writes above re-throws through the catch.
      return await this.getByUserId(id);
    } catch (error) {
      logger.error('[PrRepository.update] Error:', error);
      throw error;
    }
  }

  /** `id` is `userId` — this is the same lookup as `getByUserId`, kept as its
   * own method because callers want the folded-in comcard profile. */
  async getById(id: string): Promise<PrWithProfileType | null> {
    try {
      return await buildSyntheticPr(id);
    } catch (error) {
      logger.error('[PrRepository.getById] Error:', error);
      throw error;
    }
  }

  async listPaginated(params: {
    filter?: PrFilter;
    page: number;
    pageSize: number;
  }): Promise<{ prs: PrWithProfileType[]; totalCount: number }> {
    try {
      const { filter, page, pageSize } = params;
      const conditions: SQL[] = [];
      // `id` is `userId` post-cutover.
      if (filter?.id) conditions.push(eq(AgencyPrTable.userId, filter.id));
      if (filter?.agencyId) conditions.push(eq(AgencyPrTable.agencyId, filter.agencyId));
      if (filter?.tier) conditions.push(eq(AgencyPrTable.tier, filter.tier));
      if (filter?.name) {
        const term = `%${filter.name}%`;
        conditions.push(or(ilike(UserProfileTable.fullName, term), ilike(UserTable.username, term))!);
      }
      if (filter?.status) {
        // 'suspended' has no backing state anymore (see statusFromApproval) —
        // a filter asking for it now legitimately matches nothing.
        const approveStatus: AgencyPrApproveStatus | null =
          filter.status === 'active'
            ? 'approved'
            : filter.status === 'inactive'
              ? 'rejected'
              : filter.status === 'pending'
                ? 'pending'
                : null;
        if (approveStatus === null) return { prs: [], totalCount: 0 };
        conditions.push(eq(AgencyPrTable.approveStatus, approveStatus));
      }
      // Outlet callers only see PRs actually rostered at one of their venues.
      // An empty array must match nothing, not everything — guard before the join.
      if (filter?.assignedToOutletIds) {
        if (filter.assignedToOutletIds.length === 0) return { prs: [], totalCount: 0 };
        conditions.push(
          exists(
            db
              .select({ one: sql`1` })
              .from(ShiftAssignmentTable)
              .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
              .where(
                and(
                  // `pr_id` equals `user_id` for every row post-cutover (0089);
                  // the nullable `user_id` column is not guaranteed backfilled
                  // on rows that predate the dual-write, so this is the
                  // reliable key to join a membership's `userId` against.
                  eq(ShiftAssignmentTable.prId, AgencyPrTable.userId),
                  inArray(ShiftTable.outletId, filter.assignedToOutletIds),
                ),
              ),
          ),
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countRow] = await db
        .select({ value: sql<number>`count(*)::int` as SQL<number> })
        .from(AgencyPrTable)
        .innerJoin(UserTable, eq(UserTable.id, AgencyPrTable.userId))
        .leftJoin(UserProfileTable, eq(UserProfileTable.userId, AgencyPrTable.userId))
        .where(whereClause);
      const totalCount = Number(countRow?.value ?? 0);

      const rows = await db
        .select({
          membership: AgencyPrTable,
          username: UserTable.username,
          phoneNum: UserTable.phoneNum,
          email: UserTable.email,
          fullName: UserProfileTable.fullName,
          idNo: UserProfileTable.idNo,
          ...profileColumns,
        })
        .from(AgencyPrTable)
        .innerJoin(UserTable, eq(UserTable.id, AgencyPrTable.userId))
        .leftJoin(UserProfileTable, eq(UserProfileTable.userId, AgencyPrTable.userId))
        .where(whereClause)
        .orderBy(AgencyPrTable.createdAt)
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const prs = rows.map((row) =>
        composePr({
          userId: row.membership.userId,
          membership: row.membership,
          username: row.username,
          phoneNum: row.phoneNum,
          email: row.email,
          fullName: row.fullName,
          idNo: row.idNo,
          accountCreatedAt: row.membership.createdAt,
          accountUpdatedAt: row.membership.updatedAt,
          accountCreatedBy: row.membership.createdBy,
          accountUpdatedBy: row.membership.updatedBy,
          profile: toProfile({
            profileImage: row.profileImage,
            gender: row.gender,
            race: row.race,
            dob: row.dob,
            nationality: row.nationality,
            portfolioPhotos: row.portfolioPhotos,
            comcardImage: row.comcardImage,
            comcardHeightCm: row.comcardHeightCm,
            comcardWeightKg: row.comcardWeightKg,
            comcardBustCm: row.comcardBustCm,
            comcardWaistCm: row.comcardWaistCm,
            comcardHipCm: row.comcardHipCm,
          }),
        }),
      );
      return { prs, totalCount };
    } catch (error) {
      logger.error('[PrRepository.listPaginated] Error:', error);
      throw error;
    }
  }

  /**
   * Soft-remove: there is no `pr` row to delete anymore, so "removing" a PR
   * means rejecting its agency membership — the account itself, and its
   * history on `shift_assignment` / `payment_voucher`, is untouched.
   */
  async remove(id: string): Promise<boolean> {
    try {
      const current = await this.getByUserId(id);
      if (!current?.agencyId) return false;
      const [row] = await db
        .update(AgencyPrTable)
        .set({ approveStatus: 'rejected', updatedAt: new Date(), updatedBy: 'system' })
        .where(and(eq(AgencyPrTable.agencyId, current.agencyId), eq(AgencyPrTable.userId, id)))
        .returning({ id: AgencyPrTable.id });
      // No row => no membership to reject; a real DB error re-throws below.
      return !!row;
    } catch (error) {
      logger.error('[PrRepository.remove] Error:', error);
      throw error;
    }
  }
}
