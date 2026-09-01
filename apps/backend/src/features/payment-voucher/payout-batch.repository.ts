import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import type { DbTransaction } from '@/types/db-transaction';
import { PaymentVoucherTable } from './payment-voucher.model';
// The repo's money helpers, already used by wage.ts, overtime-line.ts and the
// weekly payout job. Hand-rolling Math.round(Number(x) * 100) beside them is
// how two places end up disagreeing about a half-sen.
import { formatCents, toCents } from './payment-voucher-balance';
import { isBatchTerminal } from './payout-settlement';
import {
  PayoutBatchItemTable,
  PayoutBatchTable,
  type PayoutBatchItemType,
  type PayoutBatchType,
  type PayoutBatchWithItems,
  type PayoutItemStatus,
  type PayoutMethod,
} from './payout-batch.model';

/** A voucher that could go into a run, with the payee facts needed to pay it. */
export type PayoutCandidate = {
  voucherId: string;
  voucherNo: string | null;
  prName: string;
  net: string;
  weekStart: string | null;
  weekEnd: string | null;
  payeeName: string | null;
  payeeIc: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  /** Both bank halves present. Only payable candidates may enter a batch. */
  payable: boolean;
  /** Already sent in an earlier run that has not failed — do not pay twice. */
  alreadyBatched: boolean;
};

/** One line's outcome, as reported by a bank response file or a provider. */
export type PayoutSettlement = {
  itemId: string;
  status: Extract<PayoutItemStatus, 'paid' | 'failed' | 'returned' | 'sent'>;
  bankRef?: string | null;
  providerPayoutId?: string | null;
  failureReason?: string | null;
};

export class PayoutBatchRepositoryClass {
  /**
   * `PO-000001`. MAX of the numeric suffix, never count(*).
   *
   * Copied deliberately from `nextVoucherNo` rather than invented: a count
   * RECYCLES numbers after any delete, and a recycled reference is worse than
   * an ugly one — it appears on a file a bank already processed, so two runs
   * answer to the same name and nothing in a dispute can tell them apart.
   */
  private async nextReference(tx: DbTransaction): Promise<string> {
    /*
     * SERIALISE THE ALLOCATION, or MAX+1 is a race.
     *
     * Found by a staged concurrent double-create: two requests both read
     * max(reference)=PO-000001, both computed PO-000002, and the second died on
     * `payout_batch_reference_unique` as a 500. Read-modify-write on an
     * aggregate has no row to lock, so a transaction-scoped ADVISORY lock is
     * what serialises it; it releases on commit or rollback with no cleanup.
     *
     * This also matters for the voucher guard downstream: while two creates
     * collided here, on the BATCH row, they never reached the item insert, so
     * `payout_batch_item_one_live_per_voucher` could never fire and the real
     * double-pay protection was untested. Ordering the lock first makes the
     * second request proceed to the item insert and be refused there, which is
     * the refusal that actually means something.
     */
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('payout_batch_reference'))`);
    const [row] = await tx
      .select({
        highest: sql<number>`coalesce(max(nullif(regexp_replace(${PayoutBatchTable.reference}, '\\D', '', 'g'), '')::int), 0)`,
      })
      .from(PayoutBatchTable);
    return `PO-${String(Number(row?.highest ?? 0) + 1).padStart(6, '0')}`;
  }

  /**
   * Who can be paid for this week, and who cannot — one row per SIGNED voucher.
   *
   * ⚠️ Unpayable and already-batched vouchers are RETURNED, flagged, never
   * filtered out. The agency has to be able to see that two of their 59 people
   * are missing bank details; a list that silently shrinks to 57 tells them
   * everything is fine, which is the failure this whole lane exists to prevent.
   *
   * `signed` only: paying an unsigned voucher settles a figure the PR never
   * agreed to, the same rule the `paid` guard enforces on the voucher itself.
   */
  async listPayableCandidates(params: {
    agencyId: string;
    weekStart: string;
    weekEnd: string;
  }): Promise<PayoutCandidate[]> {
    try {
      const payee = sql`coalesce(${PaymentVoucherTable.userId}, ${PaymentVoucherTable.prId})`;
      const rows = await db
        .select({
          voucherId: PaymentVoucherTable.id,
          voucherNo: PaymentVoucherTable.voucherNo,
          prName: PaymentVoucherTable.prName,
          net: PaymentVoucherTable.net,
          weekStart: PaymentVoucherTable.weekStart,
          weekEnd: PaymentVoucherTable.weekEnd,
          payeeName: sql<
            string | null
          >`coalesce(nullif(trim(up.full_name), ''), nullif(trim(u.username), ''))`,
          payeeIc: sql<string | null>`up.id_no`,
          bankName: sql<string | null>`up.bank_name`,
          bankAccountNo: sql<string | null>`up.bank_account_no`,
          // "Is this voucher already out in a run that has not failed?" A
          // failed line MUST stay re-batchable — that is how a bounced payment
          // is retried — so 'failed' is excluded from the exists() below.
          // Only the BLOCKING states count (migration 0142). Excluding just
          // 'failed' meant an abandoned draft's 'pending' lines locked those
          // vouchers out of every future run, with no way back — there was no
          // cancel route and nothing called markStatus('cancelled').
          //
          // Read-time only, and deliberately kept alongside the partial unique
          // index rather than replaced by it: this produces a NAMED person in
          // the candidate list, where the index produces a constraint violation.
          alreadyBatched: sql<boolean>`exists (
            select 1 from main.payout_batch_item pbi
             where pbi.voucher_id = ${PaymentVoucherTable.id}
               and pbi.status in ('pending', 'sent', 'paid')
          )`,
        })
        .from(PaymentVoucherTable)
        .leftJoin(sql`main."user" u`, sql`u.id = ${payee}`)
        .leftJoin(sql`main.user_profile up`, sql`up.user_id = ${payee}`)
        .where(
          and(
            eq(PaymentVoucherTable.agencyId, params.agencyId),
            eq(PaymentVoucherTable.status, 'signed'),
            eq(PaymentVoucherTable.weekStart, params.weekStart),
            eq(PaymentVoucherTable.weekEnd, params.weekEnd),
          ),
        );
      return rows.map((r) => ({
        ...r,
        payable: !!r.bankName?.trim() && !!r.bankAccountNo?.trim(),
      }));
    } catch (error) {
      logger.error('[PayoutBatchRepository.listPayableCandidates] Error:', error);
      throw error;
    }
  }

  /**
   * Assemble a run. One transaction: a batch whose items failed to insert would
   * be an empty run the agency could still "export".
   */
  async createBatch(params: {
    agencyId: string;
    weekStart: string | null;
    weekEnd: string | null;
    method: PayoutMethod;
    actor: string;
    note?: string | null;
    items: Array<{
      voucherId: string;
      payeeName: string | null;
      payeeIc: string | null;
      bankName: string | null;
      bankAccountNo: string | null;
      amount: string;
    }>;
  }): Promise<PayoutBatchWithItems> {
    try {
      return await db.transaction(async (tx) => {
        const reference = await this.nextReference(tx as unknown as DbTransaction);
        // Σ in CENTS, then back to a decimal string. Summing '875.00' as floats
        // is how a 59-line run reports a total three sen off its own items.
        // A throw here is CORRECT and is the reason to use the strict helper:
        // refusing to assemble a batch on an unreadable amount beats writing it.
        // We are inside db.transaction, so batch and items roll back together.
        const totalCents = params.items.reduce((sum, i) => sum + toCents(i.amount), 0);
        const [batch] = await tx
          .insert(PayoutBatchTable)
          .values({
            agencyId: params.agencyId,
            reference,
            weekStart: params.weekStart,
            weekEnd: params.weekEnd,
            method: params.method,
            status: 'draft',
            totalAmount: formatCents(totalCents),
            itemCount: params.items.length,
            note: params.note ?? null,
            createdBy: params.actor,
            updatedBy: params.actor,
          })
          .returning();
        const items = params.items.length
          ? await tx
              .insert(PayoutBatchItemTable)
              .values(
                params.items.map((i) => ({
                  batchId: batch.id,
                  voucherId: i.voucherId,
                  payeeName: i.payeeName,
                  payeeIc: i.payeeIc,
                  bankName: i.bankName,
                  bankAccountNo: i.bankAccountNo,
                  amount: i.amount,
                  status: 'pending' as const,
                  createdBy: params.actor,
                  updatedBy: params.actor,
                })),
              )
              .returning()
          : [];
        return { ...batch, items };
      });
    } catch (error) {
      logger.error('[PayoutBatchRepository.createBatch] Error:', error);
      throw error;
    }
  }

  async getById(id: string): Promise<PayoutBatchWithItems | null> {
    try {
      const [batch] = await db
        .select()
        .from(PayoutBatchTable)
        .where(eq(PayoutBatchTable.id, id))
        .limit(1);
      if (!batch) return null;
      const items = await this.listItems(id);
      return { ...batch, items };
    } catch (error) {
      logger.error('[PayoutBatchRepository.getById] Error:', error);
      throw error;
    }
  }

  async listForAgency(agencyId: string, limit = 50): Promise<PayoutBatchType[]> {
    try {
      return await db
        .select()
        .from(PayoutBatchTable)
        .where(eq(PayoutBatchTable.agencyId, agencyId))
        .orderBy(desc(PayoutBatchTable.createdAt))
        .limit(limit);
    } catch (error) {
      logger.error('[PayoutBatchRepository.listForAgency] Error:', error);
      throw error;
    }
  }

  /**
   * Stamp a batch's own lifecycle.
   *
   * `exportedAt` / `submittedAt` are set ONCE via coalesce and never re-stamped:
   * an agency downloading the file a second time has not exported a second
   * time, and the FIRST download is the moment that matters when reconciling
   * against a bank statement.
   */
  async markStatus(
    id: string,
    status: 'exported' | 'submitted' | 'cancelled',
    actor: string,
  ): Promise<PayoutBatchType | null> {
    try {
      const [row] = await db
        .update(PayoutBatchTable)
        .set({
          status,
          ...(status === 'exported'
            ? { exportedAt: sql`coalesce(${PayoutBatchTable.exportedAt}, now())` }
            : {}),
          ...(status === 'submitted'
            ? { submittedAt: sql`coalesce(${PayoutBatchTable.submittedAt}, now())` }
            : {}),
          updatedAt: new Date(),
          updatedBy: actor,
        })
        .where(eq(PayoutBatchTable.id, id))
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('[PayoutBatchRepository.markStatus] Error:', error);
      throw error;
    }
  }

  /**
   * Abandon a draft and RELEASE its vouchers.
   *
   * Items go to 'cancelled', not 'failed': nothing was ever sent, so nothing
   * was rejected, and 'failed' would put a lie in the column a human reads to
   * find out what a bank said. 'cancelled' is outside the blocking set, so the
   * vouchers become available to a new run immediately.
   *
   * Refused once a file has left the building — see the controller. A batch the
   * agency has already uploaded cannot be un-sent by us saying so.
   */
  async cancelBatch(id: string, actor: string): Promise<PayoutBatchType | null> {
    try {
      return await db.transaction(async (tx) => {
        await tx
          .update(PayoutBatchItemTable)
          .set({ status: 'cancelled', updatedAt: new Date(), updatedBy: actor })
          .where(eq(PayoutBatchItemTable.batchId, id));
        const [row] = await tx
          .update(PayoutBatchTable)
          .set({ status: 'cancelled', updatedAt: new Date(), updatedBy: actor })
          .where(eq(PayoutBatchTable.id, id))
          .returning();
        return row ?? null;
      });
    } catch (error) {
      logger.error('[PayoutBatchRepository.cancelBatch] Error:', error);
      throw error;
    }
  }

  /** Mark every still-pending line as sent. Used when a file is handed over. */
  async markItemsSent(batchId: string, actor: string): Promise<number> {
    try {
      const rows = await db
        .update(PayoutBatchItemTable)
        .set({ status: 'sent', updatedAt: new Date(), updatedBy: actor })
        .where(
          and(
            eq(PayoutBatchItemTable.batchId, batchId),
            eq(PayoutBatchItemTable.status, 'pending'),
          ),
        )
        .returning({ id: PayoutBatchItemTable.id });
      return rows.length;
    } catch (error) {
      logger.error('[PayoutBatchRepository.markItemsSent] Error:', error);
      throw error;
    }
  }

  /**
   * Record what the bank (or provider) said, line by line, and write the
   * successes back onto the vouchers.
   *
   * ⚠️ THE VOUCHER GUARD IS RE-STATED HERE, not inherited. The controller's
   * `paid` gate protects `PUT /payment-voucher/:id`; this is a DIFFERENT write
   * path into the same column, and a rule that lives on only one road is not a
   * rule. A voucher is marked paid ONLY from `signed` — a settlement naming a
   * voucher that is pending, disputed or already paid updates the ITEM and
   * leaves the voucher alone.
   *
   * Returns the ids of vouchers that genuinely transitioned, so the caller
   * notifies exactly those PRs and no others.
   */
  async settle(params: {
    batchId: string;
    settlements: PayoutSettlement[];
    actor: string;
  }): Promise<{ paidVoucherIds: string[]; updatedItems: number }> {
    const { batchId, settlements, actor } = params;
    if (settlements.length === 0) return { paidVoucherIds: [], updatedItems: 0 };
    try {
      return await db.transaction(async (tx) => {
        const paidVoucherIds: string[] = [];
        let updatedItems = 0;

        for (const s of settlements) {
          const [item] = await tx
            .update(PayoutBatchItemTable)
            .set({
              status: s.status,
              // ⚠️ ONLY OVERWRITE WHEN A VALUE IS SUPPLIED.
              // These were set unconditionally, so re-posting the same bank
              // response — or a follow-up that omitted the ref — NULLED the one
              // field that reconciles a bank statement. A settlement that says
              // nothing about a reference is not a settlement that says there
              // is none.
              ...(s.bankRef ? { bankRef: s.bankRef } : {}),
              ...(s.providerPayoutId ? { providerPayoutId: s.providerPayoutId } : {}),
              ...(s.failureReason ? { failureReason: s.failureReason } : {}),
              ...(s.status === 'paid' ? { paidAt: new Date() } : {}),
              updatedAt: new Date(),
              updatedBy: actor,
            })
            .where(
              and(
                eq(PayoutBatchItemTable.id, s.itemId),
                eq(PayoutBatchItemTable.batchId, batchId),
              ),
            )
            .returning();
          if (!item) continue;
          updatedItems += 1;

          if (s.status === 'paid') {
            // Guarded UPDATE, not read-then-write: the `status = 'signed'` term
            // is in the WHERE, so a voucher that moved underneath us simply does
            // not match and no row comes back.
            const [voucher] = await tx
              .update(PaymentVoucherTable)
              .set({
                status: 'paid',
                paidAt: new Date(),
                ...(s.bankRef ? { bankRef: s.bankRef } : {}),
                updatedAt: new Date(),
                updatedBy: actor,
              })
              .where(
                and(
                  eq(PaymentVoucherTable.id, item.voucherId),
                  eq(PaymentVoucherTable.status, 'signed'),
                ),
              )
              .returning({ id: PaymentVoucherTable.id });
            if (voucher) paidVoucherIds.push(voucher.id);
          }
        }

        // "Is this run finished?" is now ONE rule, in payout-settlement.ts,
        // covered by tests that need no database. The DB stays the authority on
        // WHAT the statuses are — we read the real rows and hand them to the
        // rule, rather than re-expressing the rule as a SQL count filter that
        // no test can reach.
        const rows = await tx
          .select({ status: PayoutBatchItemTable.status })
          .from(PayoutBatchItemTable)
          .where(eq(PayoutBatchItemTable.batchId, batchId));
        if (isBatchTerminal(rows.map((r) => r.status))) {
          await tx
            .update(PayoutBatchTable)
            .set({
              status: 'settled',
              settledAt: sql`coalesce(${PayoutBatchTable.settledAt}, now())`,
              updatedAt: new Date(),
              updatedBy: actor,
            })
            .where(eq(PayoutBatchTable.id, batchId));
        }

        return { paidVoucherIds, updatedItems };
      });
    } catch (error) {
      logger.error('[PayoutBatchRepository.settle] Error:', error);
      throw error;
    }
  }

  /** The items of a batch, for the CSV writer and the provider request. */
  async listItems(batchId: string): Promise<PayoutBatchItemType[]> {
    try {
      return await db
        .select()
        .from(PayoutBatchItemTable)
        .where(eq(PayoutBatchItemTable.batchId, batchId))
        .orderBy(PayoutBatchItemTable.createdAt);
    } catch (error) {
      logger.error('[PayoutBatchRepository.listItems] Error:', error);
      throw error;
    }
  }

}
