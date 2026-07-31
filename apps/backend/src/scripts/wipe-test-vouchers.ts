/**
 * Deletes payment vouchers and everything hanging off them, so a week can be
 * regenerated from its source records.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/wipe-test-vouchers.ts --pr=<uuid>
 *   ... --voucher=PV-000002        # one voucher, by number or uuid
 *   ... --week-start=2026-07-27    # one payroll week
 *   ... --confirm                  # ACTUALLY DELETE (without this it only reports)
 *
 * ⚠️ THIS IS THE ONLY DESTRUCTIVE SCRIPT IN THIS DIRECTORY, and the database is
 * SHARED with the other developer. Two guards, both deliberate:
 *
 *  1. It is a DRY RUN unless `--confirm` is passed. The dry run prints the exact
 *     rows it would remove, so the decision is made against the real list rather
 *     than against a description of it.
 *  2. It REFUSES to run unscoped. One of --pr / --voucher / --week-start is
 *     required; there is no "wipe everything" flag, because the only reason to
 *     want one is impatience and the cost of getting it wrong is permanent.
 *
 * OWNER DECISION (31 Jul 2026) that this script exists to carry out: the four
 * live vouchers are TEST DATA, not payroll anyone is owed, so the three repair
 * questions (which of the duplicate pair survives, what to do about a `signed`
 * voucher whose wage days never happened, and how to settle two completed-but-
 * unpaid shifts) are answered by deleting and regenerating rather than by
 * reissuing documents. ⚠️ For REAL payroll the answer is different and already
 * decided: VOID + REISSUE with the PR notified — never a silent in-place edit,
 * and never this script.
 *
 * WHY IT DELETES CHILDREN EXPLICITLY INSTEAD OF LEANING ON THE CASCADE
 * -------------------------------------------------------------------
 * All four child tables declare `onDelete: 'cascade'` in payment-voucher.model.ts,
 * and `paymentVoucherRepository.remove()` trusts it ("Lines cascade."). That is a
 * statement in TypeScript about what the database is believed to hold, and this
 * repo has a standing rule that a green model is not proof of a live constraint —
 * `tsc` and `drizzle-kit generate` never open a connection. If a live FK were
 * created without ON DELETE CASCADE, the voucher delete would fail (noisy, fine)
 * or a partially-migrated table would strand orphans. Deleting children first is
 * correct whether or not the cascade is really there.
 *
 * The one thing no cascade can reach: `notification.payload` holds `{ voucherId }`
 * as jsonb, deliberately not a nullable FK column. Left behind, those rows are a
 * PR tapping "your payment voucher is ready" into a 404, so they go too. That is
 * the main reason this is a script and not a loop over the existing `remove()`.
 */
import '@/env.js'; // FIRST — the pg pool builds from unset credentials otherwise
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import {
  PaymentVoucherTable,
  PaymentVoucherLineTable,
  PaymentVoucherReceiptTable,
  PaymentVoucherDisputeTable,
  PaymentVoucherDayReviewTable,
} from '@/features/payment-voucher/payment-voucher.model.js';
import { NotificationTable } from '@/features/notification/notification.model.js';

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const voucherArg = getArg('voucher');
  const prArg = getArg('pr');
  const weekArg = getArg('week-start');
  const confirmed = process.argv.includes('--confirm');

  const filters = [];
  if (voucherArg) {
    // Same convention as audit-live-vouchers.ts: accept the running number every
    // screen shows (PV-000002) or the uuid the logs carry. COMMA-SEPARATED lists
    // are accepted because the real cleanup is "these three, but not that one" —
    // PV-000003 sits in the same week as two of the bad vouchers and belongs to a
    // different PR, and it is clean. Scoping by --week-start would delete it.
    const wanted = voucherArg
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const numbers = wanted.filter((w) => w.toUpperCase().startsWith('PV-')).map((w) => w.toUpperCase());
    const uuids = wanted.filter((w) => !w.toUpperCase().startsWith('PV-'));
    const byNumber = numbers.length ? inArray(PaymentVoucherTable.voucherNo, numbers) : undefined;
    const byId = uuids.length ? inArray(PaymentVoucherTable.id, uuids) : undefined;
    // `or()` returns SQL | undefined; both arms can be absent only if the arg was
    // empty, which the filter above already excludes.
    filters.push(byNumber && byId ? or(byNumber, byId)! : (byNumber ?? byId)!);
  }
  if (prArg) filters.push(eq(PaymentVoucherTable.prId, prArg));
  if (weekArg) filters.push(eq(PaymentVoucherTable.weekStart, weekArg));

  if (filters.length === 0) {
    console.error(
      'Refusing to run unscoped. Pass at least one of --pr=<uuid>, --voucher=<PV-000002|uuid>,\n' +
        '--week-start=YYYY-MM-DD. This database is shared and there is no wipe-everything flag.',
    );
    process.exit(1);
  }

  const vouchers = await db
    .select()
    .from(PaymentVoucherTable)
    .where(and(...filters))
    .orderBy(PaymentVoucherTable.voucherNo);

  if (vouchers.length === 0) {
    console.log('No vouchers matched. Nothing to delete.');
    return;
  }

  const ids = vouchers.map((v) => v.id);

  // The notification match, built once and reused by the count and the delete so
  // the dry run cannot report a different set from the one that gets removed.
  //
  // Written as an explicit IN list rather than `= ANY(${ids})`: drizzle inlines a
  // JS array as separate bind params, so ANY() receives a scalar and Postgres
  // rejects it with 42809 "op ANY/ALL (array) requires array on right side" —
  // which drizzle then buries in `error.cause`. `->>` yields text, so the uuids
  // are compared as text, which is what we want.
  const notificationMatch = sql`${NotificationTable.payload}->>'voucherId' IN (${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )})`;

  // Counted before anything is touched, so the dry run and the real run report
  // the same numbers and the confirmation is made against the true blast radius.
  const [lines, receipts, disputes, dayReviews, notifications] = await Promise.all([
    db.select().from(PaymentVoucherLineTable).where(inArray(PaymentVoucherLineTable.voucherId, ids)),
    db
      .select()
      .from(PaymentVoucherReceiptTable)
      .where(inArray(PaymentVoucherReceiptTable.voucherId, ids)),
    db
      .select()
      .from(PaymentVoucherDisputeTable)
      .where(inArray(PaymentVoucherDisputeTable.voucherId, ids)),
    db
      .select()
      .from(PaymentVoucherDayReviewTable)
      .where(inArray(PaymentVoucherDayReviewTable.voucherId, ids)),
    db
      .select({ id: NotificationTable.id }).from(NotificationTable).where(notificationMatch),
  ]);

  console.log(
    `\n${confirmed ? 'DELETING' : 'DRY RUN — would delete'} ${vouchers.length} voucher(s):\n`,
  );
  for (const v of vouchers) {
    const mine = (rows: { voucherId: string }[]) => rows.filter((r) => r.voucherId === v.id).length;
    console.log(
      `  ${v.voucherNo ?? v.id}  status=${v.status}  week=${v.weekStart}  net=${v.net}\n` +
        // pr_id is printed because the scope IS the safety property here: two
        // vouchers can share a week and belong to different PRs, and one of them
        // may be perfectly correct. Seeing the ids makes a wrong scope obvious.
        `      pr=${v.prId ?? 'NULL'}\n` +
        `      ${mine(lines)} line(s) · ${mine(receipts)} receipt(s) · ` +
        `${mine(disputes)} dispute(s) · ${mine(dayReviews)} day review(s)`,
    );
    // Surfaced per voucher rather than buried in the total: a `sent` or `signed`
    // voucher is a document a PR already holds, and deleting one is a different
    // act from deleting a draft even when the owner has called it test data.
    if (v.status === 'sent' || v.status === 'signed') {
      console.log(`      ⚠️  status is '${v.status}' — a PR has already received this document`);
    }
  }
  console.log(`\n  + ${notifications.length} notification(s) pointing at these vouchers`);

  // --show-lines exists for one reason: these rows are EVIDENCE as well as bad
  // data. The open question on the P0 list is *which write path* attributed wages
  // to a day nobody worked, and `created_by` on the line is the only surviving
  // witness. Deleting the vouchers answers the money question and destroys the
  // forensic one, so the chance to look is offered at exactly the moment it is
  // about to be lost.
  if (process.argv.includes('--show-lines')) {
    console.log('\n--- lines, for the record (created_by names the write path) ---');
    for (const v of vouchers) {
      console.log(`\n  ${v.voucherNo ?? v.id}:`);
      for (const l of lines.filter((l) => l.voucherId === v.id)) {
        console.log(
          `    ${l.lineDate ?? '(no date)'}  ${String(l.component ?? '?').padEnd(10)} ` +
            `${String(l.amount).padStart(9)}  qty=${l.quantity ?? ''}  ` +
            `created_by=${l.createdBy}  ref=${l.ref ?? ''}`,
        );
      }
    }
  }

  if (!confirmed) {
    console.log(
      '\nNothing was changed. Re-run with --confirm to delete, then regenerate the week:\n' +
        '  npx tsx --tsconfig tsconfig.json src/scripts/generate-weekly-pvs.ts ' +
        '--week-start=YYYY-MM-DD --week-end=YYYY-MM-DD\n' +
        'and re-audit with src/scripts/audit-live-vouchers.ts.',
    );
    return;
  }

  // One transaction: a half-deleted voucher — lines gone, header still listed —
  // is worse than either outcome, because every screen would render it as a
  // voucher worth nothing rather than as an error.
  await db.transaction(async (tx) => {
    // Lines BEFORE receipts: payment_voucher_line.receipt_id references
    // payment_voucher_receipt, so the other order fails on the FK.
    await tx.delete(PaymentVoucherLineTable).where(inArray(PaymentVoucherLineTable.voucherId, ids));
    await tx
      .delete(PaymentVoucherReceiptTable)
      .where(inArray(PaymentVoucherReceiptTable.voucherId, ids));
    await tx
      .delete(PaymentVoucherDisputeTable)
      .where(inArray(PaymentVoucherDisputeTable.voucherId, ids));
    await tx
      .delete(PaymentVoucherDayReviewTable)
      .where(inArray(PaymentVoucherDayReviewTable.voucherId, ids));
    await tx.delete(NotificationTable).where(notificationMatch);
    await tx.delete(PaymentVoucherTable).where(inArray(PaymentVoucherTable.id, ids));
  });

  console.log(
    `\nDeleted ${vouchers.length} voucher(s) and their lines, receipts, disputes, day reviews\n` +
      'and notifications. Regenerate the week from its source records:\n' +
      '  npx tsx --tsconfig tsconfig.json src/scripts/generate-weekly-pvs.ts ' +
      '--week-start=YYYY-MM-DD --week-end=YYYY-MM-DD\n' +
      'then re-run src/scripts/audit-live-vouchers.ts — it should report 0 flagged.',
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[wipe-test-vouchers] FAILED:', error);
    process.exit(1);
  });
