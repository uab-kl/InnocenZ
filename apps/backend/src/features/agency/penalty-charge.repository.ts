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
