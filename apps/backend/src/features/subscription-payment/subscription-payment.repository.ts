import { and, desc, eq, inArray, SQL } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import { UserTable } from '@/features/user/user.model.js';
import { SubscriptionInvoiceTable } from '@/features/subscription-invoice/subscription-invoice.model.js';
import type { PaymentMethodType } from '@/features/payment-method/payment-method.model.js';
import { AgencyTable } from '@/features/agency/agency.model.js';
import { OutletTable } from '@/features/outlet/outlet.model.js';
import {
  NewSubscriptionPayment,
  SubscriptionPayment,
  SubscriptionPaymentFilter,
  SubscriptionPaymentTable,
} from './subscription-payment.model.js';

/** Only a uuid is a person; `system` and `gateway:curlec` are stamps. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What a caller must say to record an attempt against an invoice.
 *
 * `amount` is NOT taken from here — it is read from the invoice inside the
 * transaction. An attempt that could name its own amount is one a webhook body
 * could name, and the invoice is the only thing that knows what a period cost.
 * That holds for a DECLINE as much as for a settlement: a failed attempt is a
 * record of what was tried, so it carries the sum that was tried.
 */
export type AttemptInput = {
  subscriptionInvoiceId: string;
  methodType: PaymentMethodType;
  paymentMethodId?: string | null;
  gateway?: string | null;
  gatewayPaymentId?: string | null;
  reference?: string | null;
  failureReason?: string | null;
  /** Defaults to `succeeded` — the manual path only ever records money that arrived. */
  outcome?: 'succeeded' | 'failed' | 'pending';
  /** When the money actually arrived. Defaults to now, and ignored unless it succeeded. */
  paidAt?: Date;
  actor: string;
};

export type AttemptResult =
  | { ok: true; payment: SubscriptionPayment; alreadyRecorded: boolean }
  | { ok: false; reason: 'invoice_not_found' | 'error' };

/** Just enough of an organisation to head a panel with: who they are, and their mark. */
export type OrgProfile = { id: string; name: string; logoImage: string | null };

export class SubscriptionPaymentRepositoryClass {
  /**
   * The subscriber's name and logo, read from whichever table actually owns it.
   *
   * `member_subscription` snapshots `subscriber_name` so history survives a
   * rename — that is right for history and wrong for a header, which should
   * show what the org is called NOW. The logo was never snapshotted at all and
   * could only ever come from here.
   */
  async getOrgProfile(
    subscriberType: 'agency' | 'outlet',
    subscriberId: string,
  ): Promise<OrgProfile | null> {
    try {
      const table = subscriberType === 'agency' ? AgencyTable : OutletTable;
      const [row] = await db
        .select({ id: table.id, name: table.name, logoImage: table.logoImage })
        .from(table)
        .where(eq(table.id, subscriberId))
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('[SubscriptionPaymentRepository.getOrgProfile] Error:', error);
      return null;
    }
  }

  /**
   * WHO recorded each attempt, as a name rather than an id.
   *
   * `created_by` holds `req.user.id` — a bare uuid — so the panel was printing
   * "Recorded by: 8c1f…". The alternative of denormalising a name onto
   * `subscription_payment` was refused: one fact lives in one table, and a
   * person who is renamed must not leave a stale name on every row they ever
   * touched. `system` and `gateway:*` are stamps rather than people and are
   * handed back unchanged for the UI to label.
   */
  async resolveActorNames(actors: string[]): Promise<Record<string, string>> {
    const ids = [...new Set(actors)].filter((a) => UUID_RE.test(a));
    if (ids.length === 0) return {};
    try {
      const rows = await db
        // `username` is the display name this table actually carries; a real
        // name lives on user_profile, which is redacted for some callers and is
        // not worth a join to label an audit line.
        .select({ id: UserTable.id, username: UserTable.username })
        .from(UserTable)
        .where(inArray(UserTable.id, ids));
      return Object.fromEntries(rows.map((r) => [r.id, r.username || r.id]));
    } catch (error) {
      logger.error('[SubscriptionPaymentRepository.resolveActorNames] Error:', error);
      return {};
    }
  }

  private buildConditions(filter?: SubscriptionPaymentFilter): SQL | undefined {
    const conditions: SQL[] = [];
    if (filter?.subscriptionInvoiceId) {
      conditions.push(
        eq(SubscriptionPaymentTable.subscriptionInvoiceId, filter.subscriptionInvoiceId),
      );
    }
    if (filter?.status) conditions.push(eq(SubscriptionPaymentTable.status, filter.status));
    if (filter?.gateway) conditions.push(eq(SubscriptionPaymentTable.gateway, filter.gateway));
    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  /** Every attempt against one invoice, newest first — the trail a support call needs. */
  async listFor(subscriptionInvoiceId: string): Promise<SubscriptionPayment[]> {
    try {
      return await db
        .select()
        .from(SubscriptionPaymentTable)
        .where(eq(SubscriptionPaymentTable.subscriptionInvoiceId, subscriptionInvoiceId))
        .orderBy(desc(SubscriptionPaymentTable.createdAt));
    } catch (error) {
      logger.error('[SubscriptionPaymentRepository.listFor] Error:', error);
      return [];
    }
  }

  async list(filter?: SubscriptionPaymentFilter): Promise<SubscriptionPayment[]> {
    try {
      const where = this.buildConditions(filter);
      const query = db.select().from(SubscriptionPaymentTable);
      const rows = where ? await query.where(where) : await query;
      return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      logger.error('[SubscriptionPaymentRepository.list] Error:', error);
      return [];
    }
  }

  /**
   * Look a payment up by the gateway's own id — the idempotency read.
   *
   * A webhook asks this FIRST. Gateways retry until they get a 2xx, so the
   * second and third delivery of the same settlement are normal traffic, not
   * an error condition.
   */
  /**
   * Every invoice a checkout session was opened for. A webhook names the
   * SESSION; this is how it finds the periods behind it.
   */
  async invoiceIdsForGatewayPayment(gateway: string, gatewayPaymentId: string): Promise<string[]> {
    try {
      const rows = await db
        .select({ id: SubscriptionPaymentTable.subscriptionInvoiceId })
        .from(SubscriptionPaymentTable)
        .where(
          and(
            eq(SubscriptionPaymentTable.gateway, gateway),
            eq(SubscriptionPaymentTable.gatewayPaymentId, gatewayPaymentId),
          ),
        );
      return [...new Set(rows.map((row) => row.id))];
    } catch (error) {
      logger.error('[SubscriptionPaymentRepository.invoiceIdsForGatewayPayment] Error:', error);
      return [];
    }
  }

  async findByGatewayPaymentId(
    gateway: string,
    gatewayPaymentId: string,
  ): Promise<SubscriptionPayment | null> {
    try {
      const [row] = await db
        .select()
        .from(SubscriptionPaymentTable)
        .where(
          and(
            eq(SubscriptionPaymentTable.gateway, gateway),
            eq(SubscriptionPaymentTable.gatewayPaymentId, gatewayPaymentId),
          ),
        )
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('[SubscriptionPaymentRepository.findByGatewayPaymentId] Error:', error);
      return null;
    }
  }

  async create(
    data: Omit<NewSubscriptionPayment, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<SubscriptionPayment | null> {
    try {
      const [row] = await db.insert(SubscriptionPaymentTable).values(data).returning();
      return row ?? null;
    } catch (error) {
      logger.error('[SubscriptionPaymentRepository.create] Error:', error);
      return null;
    }
  }

  /**
   * RECORD AN ATTEMPT AGAINST AN INVOICE — and settle the period when it worked.
   *
   * THE single write, called by the admin's "Mark paid" button today and by a
   * gateway webhook the day one is connected. Two copies of "what it means for a
   * period to be paid" is exactly the pair that drifts, and the drift stays
   * invisible until an org is chased for money it already sent.
   *
   * Five properties this has to hold, each load-bearing:
   *
   * 1. IDEMPOTENT on `gatewayPaymentId`. A repeat delivery returns the payment
   *    that already exists, with `alreadyRecorded: true`, and writes nothing.
   *    The unique index is the real guarantee; this read makes the normal case
   *    cheap and the response honest.
   * 2. IDEMPOTENT ON THE INVOICE ITSELF — the half that was missing until
   *    27 Aug 2026. A gateway id can only protect a lane that HAS one, and the
   *    manual "Mark paid" has none, so its call skipped the check above
   *    entirely. Measured on a live RM500 invoice: an admin double-click wrote
   *    a second full settlement and a gateway settling what a human had already
   *    marked wrote a third — three succeeded rows, a ledger reading RM1,500.
   *    A period that is ALREADY settled now returns its existing settlement
   *    instead of adding one. Locked with SELECT … FOR UPDATE rather than a
   *    plain read: under READ COMMITTED two concurrent settles would otherwise
   *    both see 'unpaid' and both proceed, which is precisely the double-click.
   *
   *    An invoice that reads paid with NO succeeded row behind it is allowed
   *    through deliberately: those are periods settled before this table
   *    existed, and recording what paid them adds history rather than money.
   * 3. ATOMIC. The payment row and the invoice's `status`/`paid_at` move in one
   *    transaction, so there is no instant where money is recorded against an
   *    invoice that still reads unpaid — the window a retrying gateway would
   *    otherwise land in.
   * 4. The AMOUNT comes from the invoice, never from the caller — for a decline
   *    as much as for a settlement. A webhook body is attacker-shaped input; the
   *    invoice is the only thing that knows what the period cost.
   * 5. ONLY `succeeded` touches the invoice. A decline and a pending debit are
   *    recorded and change nothing about what is owed, which is the whole reason
   *    this table is separate from the invoice's one status flag — and why the
   *    already-settled guard lets them through: history about a paid period is
   *    still worth keeping.
   */
  async recordAttempt(input: AttemptInput): Promise<AttemptResult> {
    try {
      const outcome = input.outcome ?? 'succeeded';
      const settles = outcome === 'succeeded';
      const paidAt = input.paidAt ?? new Date();

      const settled = await db.transaction(async (tx) => {
        // Read the invoice inside the transaction, so a concurrent settlement
        // cannot change the amount between the read and the write — and LOCK
        // it, so a second settle waits here rather than racing past the
        // already-paid check below with a stale 'unpaid'.
        const [invoice] = await tx
          .select()
          .from(SubscriptionInvoiceTable)
          .where(eq(SubscriptionInvoiceTable.id, input.subscriptionInvoiceId))
          .limit(1)
          .for('update');
        if (!invoice) return null;

        /**
         * ONE GATEWAY PAYMENT ID IS ONE PAYMENT, AND A PAYMENT MOVES.
         *
         * The first version of this read returned any prior row for the id and
         * called it already-recorded, which is right for a retry and wrong for
         * everything else — and FPX is the rail where it matters, because the
         * model's own comment says a mandate debit "sits pending for days".
         * The gateway then delivers `succeeded` for that SAME id, the read
         * matched the pending row, and the invoice was never settled at all:
         * an org that paid stayed marked unpaid and would be chased for it.
         *
         * So a repeat delivery ADVANCES the row it already has. Terminal
         * outcomes stand — a succeeded payment is never walked backwards by a
         * late-arriving `failed`. `voided` is deliberately NOT terminal: an
         * admin took the settlement back by hand, and the gateway re-reporting
         * it is exactly how it should be able to come back.
         */
        if (input.gateway && input.gatewayPaymentId) {
          // Per INVOICE, not per gateway id alone: one checkout session can
          // cover several ticked periods (0146), so the same gateway id
          // legitimately appears on several rows — one per invoice.
          const [prior] = await tx
            .select()
            .from(SubscriptionPaymentTable)
            .where(
              and(
                eq(SubscriptionPaymentTable.gateway, input.gateway),
                eq(SubscriptionPaymentTable.gatewayPaymentId, input.gatewayPaymentId),
                eq(SubscriptionPaymentTable.subscriptionInvoiceId, input.subscriptionInvoiceId),
              ),
            )
            .limit(1);

          if (prior) {
            const terminal = prior.status === 'succeeded' || prior.status === 'refunded';
            if (terminal || prior.status === outcome) {
              return { row: prior, alreadyRecorded: true };
            }
            const [moved] = await tx
              .update(SubscriptionPaymentTable)
              .set({
                status: outcome,
                reference: input.reference ?? prior.reference,
                failureReason: input.failureReason ?? null,
                paidAt: settles ? paidAt : null,
                updatedAt: new Date(),
                updatedBy: input.actor,
              })
              .where(eq(SubscriptionPaymentTable.id, prior.id))
              .returning();

            if (settles) {
              await tx
                .update(SubscriptionInvoiceTable)
                .set({ status: 'paid', paidAt, updatedAt: new Date(), updatedBy: input.actor })
                .where(eq(SubscriptionInvoiceTable.id, invoice.id));
            }
            return { row: moved ?? prior, alreadyRecorded: false };
          }
        }

        // ALREADY SETTLED? Hand back what settled it rather than settling again.
        // Only a settling attempt is stopped: a decline or a pending debit
        // against a paid period is history worth keeping and moves no money.
        if (settles && invoice.status === 'paid') {
          const [prior] = await tx
            .select()
            .from(SubscriptionPaymentTable)
            .where(
              and(
                eq(SubscriptionPaymentTable.subscriptionInvoiceId, invoice.id),
                eq(SubscriptionPaymentTable.status, 'succeeded'),
              ),
            )
            .orderBy(desc(SubscriptionPaymentTable.createdAt))
            .limit(1);
          // A paid invoice with nothing behind it predates this table; let the
          // write through so the period finally gains the record of how it was
          // paid. Nothing is double-counted, because there is nothing to double.
          if (prior) return { row: prior, alreadyRecorded: true };
        }

        const [row] = await tx
          .insert(SubscriptionPaymentTable)
          .values({
            subscriptionInvoiceId: invoice.id,
            paymentMethodId: input.paymentMethodId ?? null,
            methodType: input.methodType,
            gateway: input.gateway ?? null,
            gatewayPaymentId: input.gatewayPaymentId ?? null,
            reference: input.reference ?? null,
            amount: invoice.amount,
            currency: invoice.currency,
            status: outcome,
            failureReason: input.failureReason ?? null,
            // The CHECK constraint requires a timestamp on `succeeded` and the
            // column is meaningless without one anywhere else.
            paidAt: settles ? paidAt : null,
            createdBy: input.actor,
            updatedBy: input.actor,
          })
          .returning();

        if (settles) {
          await tx
            .update(SubscriptionInvoiceTable)
            .set({ status: 'paid', paidAt, updatedAt: new Date(), updatedBy: input.actor })
            .where(eq(SubscriptionInvoiceTable.id, invoice.id));
        }

        return row ? { row, alreadyRecorded: false } : null;
      });

      if (!settled) return { ok: false, reason: 'invoice_not_found' };
      return { ok: true, payment: settled.row, alreadyRecorded: settled.alreadyRecorded };
    } catch (error) {
      logger.error('[SubscriptionPaymentRepository.recordAttempt] Error:', error);
      return { ok: false, reason: 'error' };
    }
  }

  /**
   * TAKE BACK a settlement — the admin's "Mark unpaid".
   *
   * The payment rows are VOIDED, never deleted: the question a support call
   * actually asks is "who said this was paid, and when did they take it back",
   * and a deleted row cannot answer it. `voided` rather than `failed` because
   * nothing declined — the assertion was withdrawn.
   *
   * Only settled rows are touched. A genuine `failed` attempt from a gateway is
   * history and must survive an admin correcting the invoice beside it.
   */
  async voidSettlements(
    subscriptionInvoiceId: string,
    actor: string,
    note = 'Marked unpaid by admin',
  ): Promise<boolean> {
    try {
      await db.transaction(async (tx) => {
        await tx
          .update(SubscriptionPaymentTable)
          .set({
            status: 'voided',
            failureReason: note,
            paidAt: null,
            updatedAt: new Date(),
            updatedBy: actor,
          })
          .where(
            and(
              eq(SubscriptionPaymentTable.subscriptionInvoiceId, subscriptionInvoiceId),
              eq(SubscriptionPaymentTable.status, 'succeeded'),
            ),
          );

        await tx
          .update(SubscriptionInvoiceTable)
          .set({ status: 'unpaid', paidAt: null, updatedAt: new Date(), updatedBy: actor })
          .where(eq(SubscriptionInvoiceTable.id, subscriptionInvoiceId));
      });
      return true;
    } catch (error) {
      logger.error('[SubscriptionPaymentRepository.voidSettlements] Error:', error);
      return false;
    }
  }
}
