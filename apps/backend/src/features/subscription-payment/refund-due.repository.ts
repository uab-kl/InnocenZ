import { and, asc, eq, getTableColumns, like, ne, or, sql, SQL } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import { SubscriptionInvoiceTable } from '@/features/subscription-invoice/subscription-invoice.model.js';
import {
  MemberSubscriptionTable,
  type SubscriberType,
} from '@/features/member-subscription/member-subscription.model.js';
import type { PaymentMethodType } from '@/features/payment-method/payment-method.model.js';
import { AgencyTable } from '@/features/agency/agency.model.js';
import { OutletTable } from '@/features/outlet/outlet.model.js';
import { type SubscriptionPayment, SubscriptionPaymentTable } from './subscription-payment.model.js';

/**
 * MONEY OWED BACK — how it is spelled, found and settled.
 *
 * Split out of `subscription-payment.repository.ts` (30 Sep 2026), which had
 * passed the 800-line limit. `recordAttempt` there still WRITES the marker, but
 * builds every sentence from this file, so the writer and the readers below
 * cannot drift apart.
 */

/**
 * THE TWO "REFUND DUE" MARKERS, and the one place they are spelled.
 *
 * Money that lands where nothing is owed — on a VOIDED bill, or on one already
 * PAID — is recorded by `recordAttempt` but settles nothing, and there is no
 * admin bell to ring (a new `notification_kind` would need a migration). The
 * start of `failure_reason` IS the flag: the writer builds its sentence from
 * these and `listRefundsDue` finds rows by them, so a reworded sentence moves
 * both or neither. No LIKE wildcards (`%`, `_`, `\`) may appear in them.
 */
export const REFUND_DUE_VOIDED_BILL_PREFIX = 'PAID FOR A VOIDED BILL — ';
export const REFUND_DUE_PAID_TWICE_PREFIX = 'PAID TWICE — ';

/** The most rows one refunds-due read returns — OLDEST first, so none waits behind a newer one. */
export const REFUNDS_DUE_LIMIT = 100;

export type RefundDueKind = 'voided' | 'paid_twice';

/** One payment InnocenZ owes back, as the admin's Plan Payment alert lists it. */
export type RefundDue = {
  paymentId: string;
  invoiceId: string;
  invoiceNo: string;
  subscriberType: SubscriberType;
  /** The org's name NOW, joined from agency/outlet — null only if that row is gone. */
  subscriberName: string | null;
  amount: string;
  currency: string;
  methodType: PaymentMethodType;
  gateway: string | null;
  /**
   * Null on every refund-due row written since 30 Sep 2026 — `paid_at` is set
   * only on `succeeded`, and these are stored non-settling. Only an older
   * voided-bill row, stored `succeeded`, carries one.
   */
  paidAt: Date | null;
  reason: RefundDueKind;
};

/** Which refund-due marker a stored reason starts with, if any. */
export function refundDueKind(failureReason: string | null): RefundDueKind | null {
  if (failureReason?.startsWith(REFUND_DUE_VOIDED_BILL_PREFIX)) return 'voided';
  if (failureReason?.startsWith(REFUND_DUE_PAID_TWICE_PREFIX)) return 'paid_twice';
  return null;
}

/** The stored sentence for money that landed on a VOIDED bill. */
export function voidedBillReason(invoiceNo: string): string {
  return `${REFUND_DUE_VOIDED_BILL_PREFIX}money taken for ${invoiceNo}, which was voided; refund due`;
}

/** The stored sentence for money that landed on a bill something else had already PAID. */
export function paidTwiceReason(invoiceNo: string): string {
  return `${REFUND_DUE_PAID_TWICE_PREFIX}money taken but ${invoiceNo} was already paid; refund due`;
}

/**
 * The two markers as a WHERE condition — the list and "Mark refunded" ask the
 * same question, and the auto-charge job asks its negation.
 */
export function refundDueMarked(): SQL {
  return or(
    like(SubscriptionPaymentTable.failureReason, `${REFUND_DUE_VOIDED_BILL_PREFIX}%`),
    like(SubscriptionPaymentTable.failureReason, `${REFUND_DUE_PAID_TWICE_PREFIX}%`),
  ) as SQL;
}

/** `subscription_payment.failure_reason` is varchar(500). */
const FAILURE_REASON_MAX = 500;

/**
 * A GATEWAY's own words for `failure_reason` (a decline message) must never
 * read as a marker: a decline that happened to begin "PAID TWICE — " would land
 * on the refunds-due card, and could be "refunded". Such text is kept, behind a
 * label no marker starts with; every other reason passes through untouched.
 */
export function neutraliseGatewayReason(reason: string | null | undefined): string | null {
  if (reason == null || refundDueKind(reason) === null) return reason ?? null;
  return `Gateway: ${reason}`.slice(0, FAILURE_REASON_MAX);
}

/**
 * How a refund's reference is written into `reference`, AFTER the payment's
 * own: "chk_1a2b3c4d_mg3k2x · Refund: MBB-20260930-0001". See `markRefunded`.
 */
const REFUND_REFERENCE_LABEL = 'Refund: ';
const REFUND_REFERENCE_SEPARATOR = ' · ';
/** `subscription_payment.reference` is varchar(120) — both references must fit in it. */
const REFERENCE_COLUMN_MAX = 120;

export type MarkRefundedResult =
  | { ok: true; payment: SubscriptionPayment; invoiceNo: string }
  | {
      ok: false;
      reason: 'not_found' | 'already_refunded' | 'not_owed_back' | 'no_room' | 'error';
    };

export class RefundDueRepositoryClass {
  /**
   * EVERY PAYMENT INNOCENZ OWES BACK — the rows `recordAttempt` marked
   * refund-due, across every organisation, not yet `refunded`.
   *
   * Found by the markers above rather than by status, because no status says
   * "arrived but owed back": a new refund-due row is written `pending` (outside
   * the one-settlement index), a flagged checkout keeps whatever status it had,
   * and rows written before 30 Sep 2026 on a voided bill read `succeeded`.
   * `refunded` is the only state that means the money went back.
   *
   * The name is the org's CURRENT one, joined through the invoice's subscription
   * to agency/outlet — never `member_subscription.subscriber_name`, which is a
   * snapshot for history.
   *
   * NULL ON FAILURE, not `[]`: this list exists to say money is owed, so "could
   * not look" must never read as "nothing owed".
   */
  async listRefundsDue(limit = REFUNDS_DUE_LIMIT): Promise<RefundDue[] | null> {
    try {
      const rows = await db
        .select({
          paymentId: SubscriptionPaymentTable.id,
          invoiceId: SubscriptionInvoiceTable.id,
          invoiceNo: SubscriptionInvoiceTable.invoiceNo,
          subscriberType: MemberSubscriptionTable.subscriberType,
          agencyName: AgencyTable.name,
          outletName: OutletTable.name,
          amount: SubscriptionPaymentTable.amount,
          currency: SubscriptionPaymentTable.currency,
          methodType: SubscriptionPaymentTable.methodType,
          gateway: SubscriptionPaymentTable.gateway,
          paidAt: SubscriptionPaymentTable.paidAt,
          failureReason: SubscriptionPaymentTable.failureReason,
        })
        .from(SubscriptionPaymentTable)
        .innerJoin(
          SubscriptionInvoiceTable,
          eq(SubscriptionInvoiceTable.id, SubscriptionPaymentTable.subscriptionInvoiceId),
        )
        .innerJoin(
          MemberSubscriptionTable,
          eq(MemberSubscriptionTable.id, SubscriptionInvoiceTable.memberSubscriptionId),
        )
        .leftJoin(
          AgencyTable,
          and(
            eq(MemberSubscriptionTable.subscriberType, 'agency'),
            eq(AgencyTable.id, MemberSubscriptionTable.subscriberId),
          ),
        )
        .leftJoin(
          OutletTable,
          and(
            eq(MemberSubscriptionTable.subscriberType, 'outlet'),
            eq(OutletTable.id, MemberSubscriptionTable.subscriberId),
          ),
        )
        .where(and(ne(SubscriptionPaymentTable.status, 'refunded'), refundDueMarked()))
        .orderBy(asc(SubscriptionPaymentTable.createdAt), asc(SubscriptionPaymentTable.id))
        .limit(limit);

      return rows.flatMap((row) => {
        const reason = refundDueKind(row.failureReason);
        if (!reason) return [];
        return [
          {
            paymentId: row.paymentId,
            invoiceId: row.invoiceId,
            invoiceNo: row.invoiceNo,
            subscriberType: row.subscriberType,
            subscriberName: (row.subscriberType === 'agency' ? row.agencyName : row.outletName) ?? null,
            amount: row.amount,
            currency: row.currency,
            methodType: row.methodType,
            gateway: row.gateway,
            paidAt: row.paidAt,
            reason,
          },
        ];
      });
    } catch (error) {
      logger.error('[RefundDueRepository.listRefundsDue] Error:', error);
      return null;
    }
  }

  /**
   * MARK A REFUND DONE — the admin's "Mark refunded" on the red card.
   *
   * ONE guarded UPDATE is the whole write. It moves the row only while it still
   * carries a refund-due marker and is not yet `refunded`, so a double click, a
   * second tab or a retry after a dropped answer writes nothing the second
   * time. The marker is required because nothing else is money owed back: a
   * payment that SETTLED its bill "refunded" by mistake would leave a paid bill
   * with no settlement behind it. The bill itself is never touched — money on a
   * voided bill never made it `paid`, and a PAID TWICE row sits beside the
   * settlement that did, which stands.
   *
   * WHERE THE REFUND'S REFERENCE GOES. The table has one `reference` column —
   * the payment's own bank/gateway reference, varchar(120) — and no refund
   * column (one would need a migration). So the refund's reference is APPENDED
   * after it, "chk_1a2b3c4d_mg3k2x · Refund: MBB-20260930-0001", never written
   * over it: the first half matches the money coming in, the second the money
   * going back. `failure_reason` keeps its marker sentence, so the row still
   * says WHY it was owed. When both will not fit the column, nothing is written
   * (`no_room`) — neither reference is ever cut short.
   *
   * On a refusal the row is read once more to say WHY. It is read after the
   * write refused, so the reason is the row's state at that moment.
   */
  async markRefunded(
    paymentId: string,
    refundReference: string,
    actor: string,
  ): Promise<MarkRefundedResult> {
    try {
      const alone = `${REFUND_REFERENCE_LABEL}${refundReference}`;
      const appended = `${REFUND_REFERENCE_SEPARATOR}${alone}`;
      const [row] = await db
        .update(SubscriptionPaymentTable)
        .set({
          status: 'refunded',
          reference: sql`CASE WHEN coalesce(btrim(${SubscriptionPaymentTable.reference}), '') = '' THEN ${alone} ELSE ${SubscriptionPaymentTable.reference} || ${appended} END`,
          updatedAt: new Date(),
          updatedBy: actor,
        })
        // Joined for the invoice number the confirmation names — same statement,
        // so the sentence cannot describe a different row than the one written.
        .from(SubscriptionInvoiceTable)
        .where(
          and(
            eq(SubscriptionPaymentTable.id, paymentId),
            eq(SubscriptionInvoiceTable.id, SubscriptionPaymentTable.subscriptionInvoiceId),
            ne(SubscriptionPaymentTable.status, 'refunded'),
            refundDueMarked(),
            // Room for both references, or no write at all. The appended form is
            // the longer one, so this is exact or cautious, never over.
            sql`char_length(coalesce(${SubscriptionPaymentTable.reference}, '')) + ${appended.length} <= ${REFERENCE_COLUMN_MAX}`,
          ),
        )
        .returning({
          ...getTableColumns(SubscriptionPaymentTable),
          invoiceNo: SubscriptionInvoiceTable.invoiceNo,
        });
      if (row) {
        const { invoiceNo, ...payment } = row;
        return { ok: true, payment, invoiceNo };
      }

      const [current] = await db
        .select({
          status: SubscriptionPaymentTable.status,
          failureReason: SubscriptionPaymentTable.failureReason,
        })
        .from(SubscriptionPaymentTable)
        .where(eq(SubscriptionPaymentTable.id, paymentId))
        .limit(1);
      if (!current) return { ok: false, reason: 'not_found' };
      if (current.status === 'refunded') return { ok: false, reason: 'already_refunded' };
      if (!refundDueKind(current.failureReason)) return { ok: false, reason: 'not_owed_back' };
      return { ok: false, reason: 'no_room' };
    } catch (error) {
      logger.error('[RefundDueRepository.markRefunded] Error:', error);
      return { ok: false, reason: 'error' };
    }
  }
}
