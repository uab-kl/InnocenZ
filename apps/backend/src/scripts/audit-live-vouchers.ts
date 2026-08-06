/**
 * Audits the LIVE vouchers against the records they were built from.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/audit-live-vouchers.ts
 *   ... --voucher=PV-000002        # one voucher, by number or uuid
 *   ... --pr=<uuid>                # every voucher for one PR
 *   ... --week-start=2026-07-27    # one payroll week
 *
 * ⚠️ STRICTLY READ-ONLY. `db.select()` only — no insert, no update, no delete,
 * no transaction. The database is SHARED with the other developer and a
 * careless write there is permanent, so this is safe to run at any time.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE GENERATOR'S OWN CALL
 * -------------------------------------------------------
 * `PaymentVoucherGenerator` runs `auditVoucher` too, but it can only pass the
 * assignments it already holds — the COMPLETED ones. That is enough for the
 * date, overtime and duplicate arms, and structurally blind to the worst fault
 * on PV-000002: 700.00 of wages dated 28 Jul, a day whose assignment is
 * `assigned` with no stamps at all. An unworked day is invisible to a query
 * that only selects worked ones.
 *
 * So this script loads EVERY assignment for the PR in the voucher's week
 * regardless of status, which is the shape `auditVoucher` was written for. It
 * is the difference between "found by hand once, in an afternoon" and a check
 * anyone can re-run in ten seconds.
 */
import '@/env.js'; // FIRST — the pg pool builds from unset credentials otherwise
import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/db/index.js';
import {
  PaymentVoucherTable,
  PaymentVoucherLineTable,
  PaymentVoucherReceiptTable,
} from '@/features/payment-voucher/payment-voucher.model.js';
import { ShiftAssignmentTable } from '@/features/shift-assignment/shift-assignment.model.js';
import { ShiftTable } from '@/features/shift/shift.model.js';
import { auditVoucher } from '@/features/payment-voucher/payment-voucher-audit.js';
import { checkVoucherBalance } from '@/features/payment-voucher/payment-voucher-balance.js';

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const voucherArg = getArg('voucher');
  const prArg = getArg('pr');
  const weekArg = getArg('week-start');

  const filters = [];
  if (voucherArg) {
    // Accept either the running number (PV-000002) or the raw uuid: the number
    // is what every screen and export shows, the uuid is what the logs carry,
    // and asking the reader to convert between them is a needless step.
    filters.push(
      voucherArg.toUpperCase().startsWith('PV-')
        ? eq(PaymentVoucherTable.voucherNo, voucherArg.toUpperCase())
        : eq(PaymentVoucherTable.id, voucherArg),
    );
  }
  if (prArg) filters.push(eq(PaymentVoucherTable.prId, prArg));
  if (weekArg) filters.push(eq(PaymentVoucherTable.weekStart, weekArg));

  const vouchers = await db
    .select()
    .from(PaymentVoucherTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(PaymentVoucherTable.voucherNo);

  if (vouchers.length === 0) {
    console.log('No vouchers matched. Nothing audited.');
    return;
  }

  console.log(`\nAuditing ${vouchers.length} voucher(s) against their source records.\n`);

  let flagged = 0;
  const totals = new Map<string, number>();

  for (const voucher of vouchers) {
    const label = `${voucher.voucherNo ?? voucher.id} (${voucher.status}, week ${voucher.weekStart})`;

    // `pr_id`, `week_start` and `week_end` are all NULLABLE on payment_voucher.
    // Reported rather than cast away: a voucher with no week cannot be checked
    // against a week, and a voucher with no PR has no assignments to check
    // against at all — both are findings in their own right, and silently
    // skipping them would let the summary say "all reconcile" when one was
    // never looked at.
    if (!voucher.prId || !voucher.weekStart || !voucher.weekEnd) {
      const missing = [
        !voucher.prId ? 'pr_id' : null,
        !voucher.weekStart ? 'week_start' : null,
        !voucher.weekEnd ? 'week_end' : null,
      ].filter(Boolean);
      console.log(`FLAG  ${label}`);
      console.log(`        cannot be audited — ${missing.join(', ')} is NULL on the voucher row\n`);
      flagged++;
      continue;
    }
    const { prId, weekStart, weekEnd } = voucher;

    const lines = await db
      .select()
      .from(PaymentVoucherLineTable)
      .where(eq(PaymentVoucherLineTable.voucherId, voucher.id))
      .orderBy(PaymentVoucherLineTable.sortOrder);

    const receipts = await db
      .select()
      .from(PaymentVoucherReceiptTable)
      .where(eq(PaymentVoucherReceiptTable.voucherId, voucher.id));

    // EVERY assignment in the week, any status — see the header. The join to
    // `shift` carries shift_date; shift_assignment has no date of its own.
    const assignmentRows = await db
      .select({
        id: ShiftAssignmentTable.id,
        status: ShiftAssignmentTable.status,
        payAmount: ShiftAssignmentTable.payAmount,
        checkInAt: ShiftAssignmentTable.checkInAt,
        checkOutAt: ShiftAssignmentTable.checkOutAt,
        // Load-bearing, not extra detail: check-out CLAMPS check_out_at to the
        // scheduled end, so the stamps of a shift that genuinely ran late
        // describe one that finished on time. Without these two columns the
        // overtime budget derives to 0 and every APPROVED overtime line reads as
        // money the stamps cannot justify. See maxOvertimeCents.
        overtimeMinutes: ShiftAssignmentTable.overtimeMinutes,
        overtimeStatus: ShiftAssignmentTable.overtimeStatus,
        // Migration 0097, load-bearing for the same reason as the two above.
        // `pay_amount` may now be pro-rated, so overtime prices off
        // `day_rate_amount`; `scheduled_minutes` is the divisor for both pay and
        // the overtime rate; and `overtime_amount` FREEZES what was approved, so
        // a decided claim is answered from that decision rather than re-derived
        // at today's divisor — which would flag every past approval on a shift
        // that was not exactly six hours.
        dayRateAmount: ShiftAssignmentTable.dayRateAmount,
        scheduledMinutes: ShiftAssignmentTable.scheduledMinutes,
        overtimeAmount: ShiftAssignmentTable.overtimeAmount,
        shiftDate: ShiftTable.shiftDate,
      })
      .from(ShiftAssignmentTable)
      .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
      .where(
        and(
          eq(ShiftAssignmentTable.prId, prId),
          gte(ShiftTable.shiftDate, weekStart),
          lte(ShiftTable.shiftDate, weekEnd),
        ),
      )
      .orderBy(ShiftTable.shiftDate);

    // Any OTHER voucher for the same PR and week — the duplicate-payment check,
    // and the reason this does not stop at the one voucher that was asked for.
    const siblings = (
      await db
        .select({
          id: PaymentVoucherTable.id,
          voucherNo: PaymentVoucherTable.voucherNo,
          status: PaymentVoucherTable.status,
        })
        .from(PaymentVoucherTable)
        .where(
          and(
            eq(PaymentVoucherTable.prId, prId),
            eq(PaymentVoucherTable.weekStart, weekStart),
          ),
        )
    ).filter((s) => s.id !== voucher.id);

    const report = auditVoucher({
      voucher: { id: voucher.id, voucherNo: voucher.voucherNo, weekStart, weekEnd },
      lines,
      sources: { assignments: assignmentRows, receipts, siblingVouchers: siblings },
    });

    // The arithmetic check runs alongside it. The two answer different questions
    // and a voucher can fail either independently; seeing both at once is the
    // whole point of a review pass.
    const balance = checkVoucherBalance(voucher, lines);

    const worked = assignmentRows.filter((a) => a.status === 'completed').length;
    console.log(`${report.ok && balance.balanced ? 'OK  ' : 'FLAG'}  ${label}`);
    console.log(
      `        net ${voucher.net} · ${lines.length} line(s) · ${receipts.length} receipt(s) · ` +
        `${assignmentRows.length} assignment(s) that week, ${worked} completed`,
    );

    if (!balance.balanced) {
      for (const problem of balance.problems) console.log(`        [balance] ${problem}`);
    }
    for (const finding of report.findings) {
      console.log(`        [${finding.code}] ${finding.message}`);
      totals.set(finding.code, (totals.get(finding.code) ?? 0) + 1);
    }
    if (report.ok && balance.balanced) {
      console.log('        agrees with its source records');
    } else {
      flagged++;
    }
    console.log('');
  }

  console.log('---');
  if (flagged === 0) {
    console.log(`All ${vouchers.length} voucher(s) reconcile against their source records.`);
  } else {
    console.log(`${flagged} of ${vouchers.length} voucher(s) DO NOT reconcile. By kind:`);
    for (const [code, n] of [...totals].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(3)}  ${code}`);
    }
    console.log(
      '\nNothing was changed — this script only reads. Repairing a live voucher is a\n' +
        'separate, deliberate act, and for a `sent` or `signed` one it is an owner decision.',
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[audit-live-vouchers] FAILED:', error);
    process.exit(1);
  });
