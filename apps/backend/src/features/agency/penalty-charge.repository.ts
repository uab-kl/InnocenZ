import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import {
  PenaltyCharge,
  PenaltyChargeInsertType,
  PenaltyChargeTable,
} from '@/features/agency/penalty-charge.model.js';
import { UserTable } from '@/features/user/user.model.js';

export type PenaltyChargeSeed = Omit<
  PenaltyChargeInsertType,
  | 'id'
  | 'agencyId'
  | 'chargedAt'
  | 'chargedVoucherId'
  | 'createdAt'
  | 'updatedAt'
  | 'createdBy'
  | 'updatedBy'
>;

export class PenaltyChargeRepositoryClass {
  /**
   * Record accepted breaches as owed. Idempotent.
   *
   * `onConflictDoNothing` against the (agency, pr, rule, week) unique index is
   * what makes re-sealing safe: pressing the button twice, or two operators
   * pressing it at once, cannot bill the same breach twice. It also means a
   * seal never REVISES an existing charge — an amount the agency already
   * accepted is not silently restated because the rule changed since.
   */
  async seal(
    agencyId: string,
    charges: PenaltyChargeSeed[],
    actor: string,
  ): Promise<number> {
    if (charges.length === 0) return 0;
    try {
      const rows = await db
        .insert(PenaltyChargeTable)
        .values(
          charges.map((c) => ({ ...c, agencyId, createdBy: actor, updatedBy: actor })),
        )
        .onConflictDoNothing()
        .returning({ id: PenaltyChargeTable.id });
      return rows.length;
    } catch (error) {
      logger.error('[PenaltyChargeRepository.seal] Error:', error);
      throw error;
    }
  }

  /** Sealed but unbilled — the weekly half of the Finance list. */
  async listUncharged(agencyId: string) {
    try {
      return await db
        .select({
          chargeId: PenaltyChargeTable.id,
          prId: PenaltyChargeTable.prId,
          prName: UserTable.username,
          ruleType: PenaltyChargeTable.ruleType,
          weekStart: PenaltyChargeTable.weekStart,
          weekEnd: PenaltyChargeTable.weekEnd,
          fineRm: PenaltyChargeTable.fineRm,
          detail: PenaltyChargeTable.detail,
          sealedAt: PenaltyChargeTable.createdAt,
        })
        .from(PenaltyChargeTable)
        // `pr_id` IS the user id — verified against live rows, not assumed.
        // Routing this through `agency_pr` (whose own `id` is the membership
        // row) joins nothing and every name renders blank, which reads as
        // missing data rather than as a wrong join.
        .leftJoin(UserTable, eq(UserTable.id, PenaltyChargeTable.prId))
        .where(
          and(
            eq(PenaltyChargeTable.agencyId, agencyId),
            sql`${PenaltyChargeTable.chargedAt} IS NULL`,
            // A VOIDED charge is decided, so it must stop resurfacing (0151).
            // Without this term the agency's cancellation is undone by the next
            // read: the row returns to the Finance list and is billed anyway.
            sql`${PenaltyChargeTable.voidedAt} IS NULL`,
          ),
        )
        .orderBy(asc(PenaltyChargeTable.weekStart));
    } catch (error) {
      logger.error('[PenaltyChargeRepository.listUncharged] Error:', error);
      throw error;
    }
  }

  /**
   * Mark charges billed. Scoped by `agencyId` as well as by id — the ids come
   * from a client, and a bare id filter would let one agency settle another's
   * debts. Already-charged rows are excluded so a double submit cannot re-stamp
   * a charge onto a second voucher.
   */
  async markCharged(
    agencyId: string,
    chargeIds: string[],
    voucherId: string | null,
    actor: string,
  ): Promise<number> {
    if (chargeIds.length === 0) return 0;
    try {
      const rows = await db
        .update(PenaltyChargeTable)
        .set({
          chargedAt: new Date(),
          chargedVoucherId: voucherId,
          updatedBy: actor,
        })
        .where(
          and(
            eq(PenaltyChargeTable.agencyId, agencyId),
            inArray(PenaltyChargeTable.id, chargeIds),
            sql`${PenaltyChargeTable.chargedAt} IS NULL`,
            // A cancelled charge cannot be billed, however it was submitted.
            // The list already hides voided rows, but the id arrives from a
            // client and a stale screen must not be able to bill one back.
            sql`${PenaltyChargeTable.voidedAt} IS NULL`,
          ),
        )
        .returning({ id: PenaltyChargeTable.id });
      return rows.length;
    } catch (error) {
      logger.error('[PenaltyChargeRepository.markCharged] Error:', error);
      throw error;
    }
  }

  /**
   * THE AGENCY CANCELS ONE RECORDED CHARGE (0151).
   *
   * The other half of automatic sealing. A charge now appears without anyone
   * choosing it, so the agency's decision moved from "shall I record this?" to
   * "shall I keep it?" — and this is that decision, stamped with who and why
   * because it is money coming off a worker's pay.
   *
   * Scoped by `agencyId` as well as by id: the id comes from a client, and a
   * guard that checks the role but not the ORGANISATION is how one agency ends
   * up editing another's rows.
   *
   * REFUSES a charge already billed. Once `chargedAt` is set the money is on a
   * voucher, and clearing the debt here would leave a deduction on that voucher
   * with nothing behind it — the reversal for that case is a credit on a later
   * voucher, not a void here. Same window rule as waiving a cancellation fee.
   *
   * Idempotent: voiding twice is a no-op that still reports success, because a
   * second click on a stale screen should not read as a failure.
   */
  async voidCharge(
    agencyId: string,
    chargeId: string,
    actor: string,
    reason: string | null,
  ): Promise<{ ok: true; alreadyVoided: boolean } | { ok: false; reason: 'not_found' | 'billed' }> {
    try {
      const [existing] = await db
        .select({
          id: PenaltyChargeTable.id,
          chargedAt: PenaltyChargeTable.chargedAt,
          voidedAt: PenaltyChargeTable.voidedAt,
        })
        .from(PenaltyChargeTable)
        .where(
          and(eq(PenaltyChargeTable.agencyId, agencyId), eq(PenaltyChargeTable.id, chargeId)),
        )
        .limit(1);
      if (!existing) return { ok: false, reason: 'not_found' };
      if (existing.chargedAt) return { ok: false, reason: 'billed' };
      if (existing.voidedAt) return { ok: true, alreadyVoided: true };

      await db
        .update(PenaltyChargeTable)
        .set({
          voidedAt: new Date(),
          voidedBy: actor,
          voidReason: reason,
          updatedAt: new Date(),
          updatedBy: actor,
        })
        .where(
          and(
            eq(PenaltyChargeTable.agencyId, agencyId),
            eq(PenaltyChargeTable.id, chargeId),
            sql`${PenaltyChargeTable.chargedAt} IS NULL`,
          ),
        );
      return { ok: true, alreadyVoided: false };
    } catch (error) {
      logger.error('[PenaltyChargeRepository.voidCharge] Error:', error);
      throw error;
    }
  }

  /**
   * One PR's own sealed charges for a week — what the PR app shows them.
   *
   * SEALED only, never live proposals. A proposal is a number the agency has
   * not accepted and may never charge; showing it to the worker as "you have
   * been penalised" would alarm someone about money they will never lose.
   * `chargedAt` rides along so the app can say billed vs owed rather than
   * implying every row has already been taken.
   */
  async listForPrWeek(
    prId: string,
    weekStart: string,
    weekEnd: string,
  ): Promise<PenaltyCharge[]> {
    try {
      return await db
        .select()
        .from(PenaltyChargeTable)
        .where(
          and(
            eq(PenaltyChargeTable.prId, prId),
            gte(PenaltyChargeTable.weekStart, weekStart),
            lte(PenaltyChargeTable.weekStart, weekEnd),
            // A charge the agency CANCELLED must disappear from the worker's own
            // screen too (0151) — for the same reason a proposal is never shown
            // here: telling someone they have been penalised over money that
            // will never be taken alarms them about nothing.
            sql`${PenaltyChargeTable.voidedAt} IS NULL`,
          ),
        )
        .orderBy(asc(PenaltyChargeTable.weekStart));
    } catch (error) {
      logger.error('[PenaltyChargeRepository.listForPrWeek] Error:', error);
      throw error;
    }
  }

  /** Specific charges, scoped to the agency that owns them. */
  async listByIds(agencyId: string, ids: string[]): Promise<PenaltyCharge[]> {
    if (ids.length === 0) return [];
    try {
      return await db
        .select()
        .from(PenaltyChargeTable)
        .where(
          and(
            eq(PenaltyChargeTable.agencyId, agencyId),
            inArray(PenaltyChargeTable.id, ids),
            // Voided charges never reach the voucher builder (0151). `markCharged`
            // already refuses them, but this list is what the DEDUCTION LINE is
            // written from — filtering only at the stamp would put a line on the
            // voucher and then fail to record it as billed, which is the worst of
            // both: money taken, nothing saying so.
            sql`${PenaltyChargeTable.voidedAt} IS NULL`,
          ),
        );
    } catch (error) {
      logger.error('[PenaltyChargeRepository.listByIds] Error:', error);
      throw error;
    }
  }

  /** Charges already sealed for a week — so a re-seal can report what it skipped. */
  async listForWeek(agencyId: string, weekStart: string): Promise<PenaltyCharge[]> {
    try {
      return await db
        .select()
        .from(PenaltyChargeTable)
        .where(
          and(
            eq(PenaltyChargeTable.agencyId, agencyId),
            eq(PenaltyChargeTable.weekStart, weekStart),
          ),
        );
    } catch (error) {
      logger.error('[PenaltyChargeRepository.listForWeek] Error:', error);
      throw error;
    }
  }
}
