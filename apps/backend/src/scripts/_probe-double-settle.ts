/**
 * Can ONE invoice be settled TWICE?
 *
 * The webhook lane is idempotent — `recordAttempt` reads
 * `findByGatewayPaymentId` first, and a unique index on
 * (gateway, gateway_payment_id) is the real guarantee behind it. The MANUAL lane
 * carries neither: an admin's "Mark paid" sends no gateway and no gateway id, so
 * the idempotency read at the top of `recordAttempt` is skipped outright, and
 * `subscription-invoice.controller.update` checks only that the invoice EXISTS,
 * never that it is already paid.
 *
 * This probe settles the same invoice twice down each lane and counts what
 * lands. The invoice's original status and paid_at are captured first and
 * restored at the end, and every attempt row it writes is deleted by id.
 */
import 'dotenv/config';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { SubscriptionInvoiceTable } from '@/features/subscription-invoice/subscription-invoice.model.js';
import { SubscriptionPaymentTable } from '@/features/subscription-payment/subscription-payment.model.js';
import { SubscriptionPaymentRepositoryClass } from '@/features/subscription-payment/subscription-payment.repository.js';

const repo = new SubscriptionPaymentRepositoryClass();
const ACTOR = 'probe:double-settle';
const created: string[] = [];
type InvoiceRow = typeof SubscriptionInvoiceTable.$inferSelect;
let restore: Pick<InvoiceRow, 'id' | 'status' | 'paidAt' | 'updatedBy'> | null = null;

async function main() {
  const [invoice] = await db
    .select()
    .from(SubscriptionInvoiceTable)
    .where(eq(SubscriptionInvoiceTable.status, 'unpaid'))
    .limit(1);
  if (!invoice) throw new Error('no unpaid invoice to probe against');

  // Captured BEFORE anything is written, so the finally-path can put it back.
  restore = {
    id: invoice.id,
    status: invoice.status,
    paidAt: invoice.paidAt,
    updatedBy: invoice.updatedBy,
  };

  console.log(`\ninvoice ${invoice.id}`);
  console.log(`  amount ${invoice.currency} ${invoice.amount}  status ${invoice.status}\n`);

  // ── the MANUAL lane, twice — an admin double-clicking "Mark paid" ─────────
  console.log('MANUAL lane — recordAttempt with no gateway id, called twice:');
  const first = await repo.recordAttempt({
    subscriptionInvoiceId: invoice.id,
    methodType: 'manual_transfer',
    reference: 'PROBE-REF-1',
    actor: ACTOR,
  });
  const second = await repo.recordAttempt({
    subscriptionInvoiceId: invoice.id,
    methodType: 'manual_transfer',
    reference: 'PROBE-REF-2',
    actor: ACTOR,
  });
  if (first.ok) created.push(first.payment.id);
  if (second.ok) created.push(second.payment.id);
  console.log(`  first  ok=${first.ok} alreadyRecorded=${first.ok ? first.alreadyRecorded : '-'}`);
  console.log(`  second ok=${second.ok} alreadyRecorded=${second.ok ? second.alreadyRecorded : '-'}`);

  // ── a gateway settling an invoice a human already settled ────────────────
  console.log('\nMIXED lane — a gateway settles what an admin already marked paid:');
  const viaGateway = await repo.recordAttempt({
    subscriptionInvoiceId: invoice.id,
    methodType: 'card',
    gateway: 'probe-gw',
    gatewayPaymentId: 'probe-pay-001',
    actor: ACTOR,
  });
  if (viaGateway.ok) created.push(viaGateway.payment.id);
  console.log(
    `  ok=${viaGateway.ok} alreadyRecorded=${viaGateway.ok ? viaGateway.alreadyRecorded : '-'}`,
  );

  // ── the same gateway delivery again — the lane that IS protected ──────────
  console.log('\nWEBHOOK lane — the same delivery retried (gateways always retry):');
  const retry = await repo.recordAttempt({
    subscriptionInvoiceId: invoice.id,
    methodType: 'card',
    gateway: 'probe-gw',
    gatewayPaymentId: 'probe-pay-001',
    actor: ACTOR,
  });
  console.log(`  ok=${retry.ok} alreadyRecorded=${retry.ok ? retry.alreadyRecorded : '-'}`);

  // ── an FPX debit that sits pending for days, then succeeds ───────────────
  // The rail this matters most on. The gateway reports `pending` first and
  // `succeeded` for the SAME payment id later; if the second delivery is read
  // as a duplicate, an org that paid stays marked unpaid forever.
  console.log('\nFPX PROGRESSION — pending today, succeeded on the same id later:');
  await repo.voidSettlements(invoice.id, ACTOR, 'probe reset');
  const pending = await repo.recordAttempt({
    subscriptionInvoiceId: invoice.id,
    methodType: 'fpx_mandate',
    gateway: 'probe-gw',
    gatewayPaymentId: 'probe-fpx-002',
    outcome: 'pending',
    actor: ACTOR,
  });
  if (pending.ok) created.push(pending.payment.id);
  console.log(`  pending   ok=${pending.ok} status=${pending.ok ? pending.payment.status : '-'}`);

  const cleared = await repo.recordAttempt({
    subscriptionInvoiceId: invoice.id,
    methodType: 'fpx_mandate',
    gateway: 'probe-gw',
    gatewayPaymentId: 'probe-fpx-002',
    outcome: 'succeeded',
    actor: ACTOR,
  });
  if (cleared.ok) created.push(cleared.payment.id);
  const [afterFpx] = await db
    .select()
    .from(SubscriptionInvoiceTable)
    .where(eq(SubscriptionInvoiceTable.id, invoice.id))
    .limit(1);
  console.log(`  succeeded ok=${cleared.ok} status=${cleared.ok ? cleared.payment.status : '-'}`);
  console.log(
    `  invoice is now "${afterFpx?.status}" ${
      afterFpx?.status === 'paid'
        ? '<<< the debit settled the period'
        : '<<< DEFECT: the org paid and the invoice still reads unpaid'
    }`,
  );
  console.log(
    `  rows for that gateway id: ${
      (
        await db
          .select()
          .from(SubscriptionPaymentTable)
          .where(eq(SubscriptionPaymentTable.gatewayPaymentId, 'probe-fpx-002'))
      ).length
    } (one payment, advanced — not two)`,
  );

  // ── the count that matters ────────────────────────────────────────────────
  const settled = await db
    .select()
    .from(SubscriptionPaymentTable)
    .where(
      and(
        eq(SubscriptionPaymentTable.subscriptionInvoiceId, invoice.id),
        eq(SubscriptionPaymentTable.status, 'succeeded'),
      ),
    );
  const total = settled.reduce((sum, row) => sum + Number(row.amount), 0);
  console.log(`\nSETTLEMENTS NOW ON THIS ONE INVOICE: ${settled.length}`);
  console.log(`  invoice asks for  ${invoice.currency} ${Number(invoice.amount).toFixed(2)}`);
  console.log(`  ledger now says   ${invoice.currency} ${total.toFixed(2)}`);
  console.log(
    settled.length > 1
      ? `\n  >>> DEFECT: one period settled ${settled.length}x — the ledger over-states by ${invoice.currency} ${(total - Number(invoice.amount)).toFixed(2)}\n`
      : '\n  >>> single settlement, as it should be\n',
  );
}

async function cleanup() {
  if (created.length) {
    await db.delete(SubscriptionPaymentTable).where(inArray(SubscriptionPaymentTable.id, created));
    console.log(`cleaned up ${created.length} probe payment row(s)`);
  }
  if (restore) {
    await db
      .update(SubscriptionInvoiceTable)
      .set({
        status: restore.status,
        paidAt: restore.paidAt,
        updatedBy: restore.updatedBy,
        updatedAt: new Date(),
      })
      .where(eq(SubscriptionInvoiceTable.id, restore.id));
    console.log(`restored invoice ${restore.id} to status "${restore.status}"`);
  }
}

main()
  .then(async () => {
    await cleanup();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('probe threw:', error);
    await cleanup();
    process.exit(1);
  });
