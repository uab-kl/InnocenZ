import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/index.js';
import type { DbTransaction } from '@/types/db-transaction.js';
import { AgencyTable } from '@/features/agency/agency.model.js';
import { AgencyPrTable, type AgencyPrApproveStatus } from './pr.model.js';
import { UserTable } from '@/features/user/user.model.js';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model.js';
import {
  AdminRequestTable,
  type AdminRequest,
  type AdminRequestInsertType,
} from '@/features/admin-request/admin-request.model.js';
import { AWAITING_ANSWER } from '@/features/admin-request/admin-request.repository.js';
import { answeredRequestMessage } from '@/features/admin-request/plan-change-rules.js';
import { notifyMany } from '@/features/notification/notify.js';
import { logger } from '@/util/logger.js';
import {
  ALREADY_REQUESTED,
  LIVE_MEMBERSHIP,
  NO_REQUEST_NEEDED,
  NOT_ON_ROSTER,
  NOTHING_TO_DETACH,
  approvedMessage,
  underOneYearRefusal,
  declinedMessage,
  isLiveMembership,
  requestFiledMessage,
  tiedUnderOneYear,
} from './pr-detach-rules.js';

/**
 * A REAL "request detach" (owner, 20 Nov 2026): an agency asking the InnocenZ
 * admin to end the membership of a PR it has had for less than a year.
 *
 * It lives in the admin inbox that already exists — `admin_request`, type
 * `pr_detach` (migration 0171) — with the agency as the subscriber, as for
 * every other request, and the PR as `subject_user_id`, a foreign key to
 * `user` (never a copied name). The admin answers it on Service → PR Detach.
 *
 *  - FILED by `POST /pr/:id/detach-request` (same gate as Detach itself:
 *    `requirePermission('workforce','update')`). The controller resolves the
 *    PR through `resolvePrForCaller` first, so a PR on ANOTHER agency's roster
 *    is a 404 before anything here runs — the cross-agency refusal.
 *  - APPROVED by the admin → that agency's `agency_pr` row becomes `'left'`,
 *    exactly what Detach writes (never a hard delete — see `PrController.remove`)
 *    and the agency is told.
 *  - DECLINED by the admin → the PR stays; the agency is told.
 *
 * The database calls are injected (`PrDetachDeps`) so every refusal is proved
 * against fakes — this project does not probe a write gate with a write.
 */

export type DetachMembership = {
  approveStatus: AgencyPrApproveStatus;
  approvedAt: Date | null;
  createdAt: Date;
};

export type OpenDetachRequest = Pick<
  AdminRequest,
  'id' | 'status' | 'subjectUserId' | 'createdAt' | 'createdBy'
>;

export interface PrDetachDeps {
  transaction<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T>;
  /**
   * The membership, LOCKED for the rest of the transaction. The lock is the
   * duplicate guard: two clicks filing for the same PR queue on this row, so
   * the second one sees the first one's request. (A partial unique index would
   * be the declarative version, and 0171 cannot create one — see its header.)
   */
  /** The membership as it stands, unlocked — for Detach's own year check. */
  readMembership(agencyId: string, userId: string): Promise<DetachMembership | null>;
  lockMembership(
    tx: DbTransaction,
    agencyId: string,
    userId: string,
  ): Promise<DetachMembership | null>;
  findOpenRequest(
    tx: DbTransaction | null,
    agencyId: string,
    userId: string,
  ): Promise<OpenDetachRequest | null>;
  insertRequest(
    tx: DbTransaction,
    data: Omit<AdminRequestInsertType, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<AdminRequest>;
  claimAwaitingAnswer(
    id: string,
    data: Partial<AdminRequestInsertType>,
    tx?: DbTransaction,
  ): Promise<AdminRequest | null>;
  /** Live → 'left' for that one agency. False when it was not live any more. */
  setMembershipLeft(
    tx: DbTransaction,
    agencyId: string,
    userId: string,
    actor: string,
  ): Promise<boolean>;
  agencyName(agencyId: string): Promise<string | null>;
  prName(userId: string): Promise<string | null>;
  /** The agency people to tell — active members, as overtime and cut-loss do. */
  agencyRecipients(agencyId: string): Promise<string[]>;
  notify: typeof notifyMany;
}

export type DetachOutcome =
  | { ok: true; status: 200 | 201; message: string; data: AdminRequest }
  | { ok: false; status: 404 | 409; message: string; data?: unknown };

/** Rolls the answer's transaction back when there is nothing to detach. */
class NothingToDetachError extends Error {}
/** Rolls back when another answer claimed the request first. */
class AlreadyAnsweredError extends Error {}

function isAwaiting(status: string): boolean {
  return (AWAITING_ANSWER as readonly string[]).includes(status);
}

export class PrDetachRequestService {
  constructor(private readonly deps: PrDetachDeps) {}

  /**
   * Detach's own gate (`DELETE /pr/:id`): the refusal sentence when the
   * caller's membership with this PR is live and under a year old, else null.
   * A membership that is not live has nothing left to protect, so it passes —
   * the existing remove then writes 'left' over it exactly as before.
   */
  async directDetachRefusal(agencyId: string, userId: string, now?: Date): Promise<string | null> {
    const membership = await this.deps.readMembership(agencyId, userId);
    if (!membership || !isLiveMembership(membership.approveStatus)) return null;
    return tiedUnderOneYear(membership, now) ? underOneYearRefusal(membership) : null;
  }

  /** The agency files one. `agencyId` is the caller's own, never the body's. */
  async file(input: {
    agencyId: string;
    userId: string;
    actor: string;
    message?: string | null;
    now?: Date;
  }): Promise<DetachOutcome> {
    const { agencyId, userId, actor } = input;
    const [agencyName, prName] = await Promise.all([
      this.deps.agencyName(agencyId),
      this.deps.prName(userId),
    ]);
    if (!agencyName) return { ok: false, status: 404, message: NOT_ON_ROSTER };
    const who = prName ?? 'this PR';

    return this.deps.transaction<DetachOutcome>(async (tx) => {
      const membership = await this.deps.lockMembership(tx, agencyId, userId);
      if (!membership || !isLiveMembership(membership.approveStatus)) {
        return { ok: false, status: 409, message: NOT_ON_ROSTER };
      }
      if (!tiedUnderOneYear(membership, input.now)) {
        return { ok: false, status: 409, message: NO_REQUEST_NEEDED };
      }
      const open = await this.deps.findOpenRequest(tx, agencyId, userId);
      if (open) return { ok: false, status: 409, message: ALREADY_REQUESTED, data: open };

      const note = input.message?.trim();
      const row = await this.deps.insertRequest(tx, {
        type: 'pr_detach',
        status: 'pending',
        subscriberType: 'agency',
        subscriberId: agencyId,
        // The inbox's own column — every request carries the org name it was
        // filed under, so the admin's list reads without a lookup per row.
        subscriberName: agencyName,
        subjectUserId: userId,
        message: note ? note.slice(0, 1000) : null,
        createdBy: actor,
        updatedBy: actor,
      });
      return { ok: true, status: 201, message: requestFiledMessage(who), data: row };
    });
  }

  /** Admin: yes. The membership ends exactly as Detach ends it. */
  async approve(request: AdminRequest, actor: string): Promise<DetachOutcome> {
    if (!isAwaiting(request.status)) {
      return { ok: false, status: 409, message: answeredRequestMessage(request.status) };
    }
    const agencyId = request.subscriberType === 'agency' ? request.subscriberId : null;
    const userId = request.subjectUserId;
    if (!agencyId || !userId) return { ok: false, status: 409, message: NOTHING_TO_DETACH };

    const claimed: { row: AdminRequest | null } = { row: null };
    try {
      await this.deps.transaction(async (tx) => {
        claimed.row = await this.deps.claimAwaitingAnswer(
          request.id,
          { status: 'approved', updatedBy: actor },
          tx,
        );
        if (!claimed.row) throw new AlreadyAnsweredError();
        // Inside the same transaction as the claim: a PR who already left by
        // another path rolls the approval back, so the request stays open for
        // the admin to decline rather than reading "approved" over nothing.
        const moved = await this.deps.setMembershipLeft(tx, agencyId, userId, actor);
        if (!moved) throw new NothingToDetachError();
      });
    } catch (error) {
      if (error instanceof NothingToDetachError) {
        return { ok: false, status: 409, message: NOTHING_TO_DETACH };
      }
      if (error instanceof AlreadyAnsweredError) {
        return { ok: false, status: 409, message: answeredRequestMessage('answered') };
      }
      throw error;
    }
    if (!claimed.row) return { ok: false, status: 409, message: answeredRequestMessage('answered') };

    const [prName, agencyName] = await Promise.all([
      this.deps.prName(userId),
      this.deps.agencyName(agencyId),
    ]);
    const sentence = approvedMessage(prName ?? 'The PR', agencyName ?? request.subscriberName);
    await this.tellAgency(agencyId, {
      title: 'Detach approved',
      body: sentence,
      // `prName` so the portal can word the notice in the reader's language.
      payload: { requestId: request.id, prId: userId, prName, decision: 'approved' },
      actor,
    });
    return { ok: true, status: 200, message: sentence, data: claimed.row };
  }

  /** Admin: no. Nothing about the membership changes. */
  async decline(request: AdminRequest, actor: string): Promise<DetachOutcome> {
    const claimed = await this.deps.claimAwaitingAnswer(request.id, {
      status: 'declined',
      updatedBy: actor,
    });
    if (!claimed) {
      return { ok: false, status: 409, message: answeredRequestMessage(request.status) };
    }
    const agencyId = request.subscriberType === 'agency' ? request.subscriberId : null;
    const userId = request.subjectUserId;
    const prName = userId ? await this.deps.prName(userId) : null;
    const sentence = declinedMessage(prName ?? 'the PR', request.subscriberName);
    if (agencyId) {
      await this.tellAgency(agencyId, {
        title: 'Detach declined',
        body: sentence,
        payload: { requestId: request.id, prId: userId, prName, decision: 'declined' },
        actor,
      });
    }
    return { ok: true, status: 200, message: sentence, data: claimed };
  }

  /** Never fails the answer it reports — `notify` swallows its own faults. */
  private async tellAgency(
    agencyId: string,
    input: { title: string; body: string; payload: Record<string, unknown>; actor: string },
  ): Promise<void> {
    try {
      const recipients = await this.deps.agencyRecipients(agencyId);
      if (recipients.length === 0) return;
      await this.deps.notify(recipients, { kind: 'pr_detach_decided', ...input });
    } catch (error) {
      logger.error('[PrDetachRequestService.tellAgency] Error:', error);
    }
  }
}

/** The agency's own waiting requests — the "detach requested" state per PR. */
export async function listOpenDetachRequests(agencyId: string): Promise<OpenDetachRequest[]> {
  return db
    .select({
      id: AdminRequestTable.id,
      status: AdminRequestTable.status,
      subjectUserId: AdminRequestTable.subjectUserId,
      createdAt: AdminRequestTable.createdAt,
      createdBy: AdminRequestTable.createdBy,
    })
    .from(AdminRequestTable)
    .where(
      and(
        eq(AdminRequestTable.type, 'pr_detach'),
        eq(AdminRequestTable.subscriberType, 'agency'),
        eq(AdminRequestTable.subscriberId, agencyId),
        inArray(AdminRequestTable.status, AWAITING_ANSWER),
      ),
    )
    .orderBy(desc(AdminRequestTable.createdAt));
}

/** The real database behind `PrDetachDeps`. */
export function databaseDetachDeps(
  listActiveMemberUserIds: (agencyId: string) => Promise<string[]>,
): PrDetachDeps {
  return {
    transaction: (fn) => db.transaction(fn),
    async readMembership(agencyId, userId) {
      const [row] = await db
        .select({
          approveStatus: AgencyPrTable.approveStatus,
          approvedAt: AgencyPrTable.approvedAt,
          createdAt: AgencyPrTable.createdAt,
        })
        .from(AgencyPrTable)
        .where(and(eq(AgencyPrTable.agencyId, agencyId), eq(AgencyPrTable.userId, userId)))
        .limit(1);
      return row ?? null;
    },
    async lockMembership(tx, agencyId, userId) {
      const [row] = await tx
        .select({
          approveStatus: AgencyPrTable.approveStatus,
          approvedAt: AgencyPrTable.approvedAt,
          createdAt: AgencyPrTable.createdAt,
        })
        .from(AgencyPrTable)
        .where(and(eq(AgencyPrTable.agencyId, agencyId), eq(AgencyPrTable.userId, userId)))
        .limit(1)
        .for('update');
      return row ?? null;
    },
    async findOpenRequest(tx, agencyId, userId) {
      const [row] = await (tx ?? db)
        .select({
          id: AdminRequestTable.id,
          status: AdminRequestTable.status,
          subjectUserId: AdminRequestTable.subjectUserId,
          createdAt: AdminRequestTable.createdAt,
          createdBy: AdminRequestTable.createdBy,
        })
        .from(AdminRequestTable)
        .where(
          and(
            eq(AdminRequestTable.type, 'pr_detach'),
            eq(AdminRequestTable.subscriberId, agencyId),
            eq(AdminRequestTable.subjectUserId, userId),
            inArray(AdminRequestTable.status, AWAITING_ANSWER),
          ),
        )
        .limit(1);
      return row ?? null;
    },
    async insertRequest(tx, data) {
      const [row] = await tx.insert(AdminRequestTable).values(data).returning();
      return row;
    },
    async claimAwaitingAnswer(id, data, tx) {
      const [row] = await (tx ?? db)
        .update(AdminRequestTable)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(AdminRequestTable.id, id), inArray(AdminRequestTable.status, AWAITING_ANSWER)))
        .returning();
      return row ?? null;
    },
    async setMembershipLeft(tx, agencyId, userId, actor) {
      const moved = await tx
        .update(AgencyPrTable)
        .set({ approveStatus: 'left', rejectReason: null, updatedAt: new Date(), updatedBy: actor })
        .where(
          and(
            eq(AgencyPrTable.agencyId, agencyId),
            eq(AgencyPrTable.userId, userId),
            inArray(AgencyPrTable.approveStatus, [...LIVE_MEMBERSHIP]),
          ),
        )
        .returning({ id: AgencyPrTable.id });
      return moved.length > 0;
    },
    async agencyName(agencyId) {
      const [row] = await db
        .select({ name: AgencyTable.name })
        .from(AgencyTable)
        .where(eq(AgencyTable.id, agencyId))
        .limit(1);
      return row?.name ?? null;
    },
    async prName(userId) {
      const [row] = await db
        .select({ fullName: UserProfileTable.fullName, username: UserTable.username })
        .from(UserTable)
        .leftJoin(UserProfileTable, eq(UserProfileTable.userId, UserTable.id))
        .where(eq(UserTable.id, userId))
        .limit(1);
      return row ? row.fullName?.trim() || row.username || null : null;
    },
    agencyRecipients: listActiveMemberUserIds,
    notify: notifyMany,
  };
}
