/**
 * One-shot repair: carry the receipts of days that were approved BEFORE the
 * day-approval carry existed (4 Aug 2026).
 *
 * `reviewDay` / `approveAllDays` now approve the receipts sitting on an approved
 * day, but only when the button is pressed. A day approved yesterday keeps its
 * receipts PENDING forever — the send gate then blocks a week on evidence the
 * agency already signed off, and the PR sees the day drop back to PENDING
 * (`prVisibleDayStatuses` is deliberately pessimistic about exactly this).
 * Re-clicking Approve on every historic day would fix it; this does it once.
 *
 * DRY RUN BY DEFAULT — pass `--write` to apply. The rule is the SAME pure
 * function the endpoints use, never a second copy of it, so the backfill cannot
 * approve something a live click would not have.
 *
 * Skips PR-signed vouchers: reviewing after the PR has signed is refused over
 * HTTP, and a backfill must not do quietly what the API refuses out loud.
 *
 *   pnpm --filter backend exec tsx --tsconfig tsconfig.json \
 *     src/scripts/repair-day-approved-receipts.ts [--write]
 */
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import {
  buildDayReviewView,
  receiptsCarriedByDays,
} from '@/features/payment-voucher/payment-voucher-day-review';
import {
  PaymentVoucherTable,
  PaymentVoucherLineTable,
  PaymentVoucherReceiptTable,
  PaymentVoucherDayReviewTable,
} from '@/features/payment-voucher/payment-voucher.model';

const WRITE = process.argv.includes('--write');
const ACTOR = 'day-review backfill';

async function main() {
  const vouchers = await db.select().from(PaymentVoucherTable);
  console.log(
    `${vouchers.length} voucher(s) · ${WRITE ? 'WRITE MODE' : 'DRY RUN (pass --write to apply)'}\n`,
  );

  let carriedTotal = 0;
  for (const v of vouchers) {
    if (v.prSignedAt) continue;

    const [lines, receipts, reviews] = await Promise.all([
      db
        .select()
        .from(PaymentVoucherLineTable)
        .where(eq(PaymentVoucherLineTable.voucherId, v.id)),
      db
        .select()
        .from(PaymentVoucherReceiptTable)
        .where(eq(PaymentVoucherReceiptTable.voucherId, v.id)),
      db
        .select()
        .from(PaymentVoucherDayReviewTable)
        .where(eq(PaymentVoucherDayReviewTable.voucherId, v.id)),
    ]);

    const view = buildDayReviewView(lines, reviews);
    const approvedDates = new Set(
      view.filter((d) => d.status === 'approved').map((d) => d.date),
    );
    const carried = receiptsCarriedByDays(lines, receipts, approvedDates);
    if (carried.length === 0) continue;

    carriedTotal += carried.length;
    console.log(
      `  ${v.voucherNo ?? v.id} (${v.weekStart} -> ${v.weekEnd})` +
        `\n    approved days : ${[...approvedDates].join(', ')}` +
        `\n    carrying      : ${carried.map((r) => r.receiptNo).join(', ')}`,
    );

    if (WRITE) {
      const now = new Date();
      for (const receipt of carried) {
        await db
          .update(PaymentVoucherReceiptTable)
          .set({
            status: 'approved',
            reviewedAt: now,
            reviewedBy: ACTOR,
            updatedAt: now,
            updatedBy: ACTOR,
          })
          .where(eq(PaymentVoucherReceiptTable.id, receipt.id));
      }
      console.log('    -> approved');
    }
  }

  console.log(
    `\n${carriedTotal} receipt(s) ${WRITE ? 'approved' : 'would be approved'}.` +
      (WRITE ? '' : ' Re-run with --write to apply.'),
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
