/**
 * Fires a SUCCESSFUL overtime approval end to end, on the live database.
 *
 * ⚠️ THIS ONE WRITES. Everything else here named `probe-*` refuses to. Run it
 * only when the owner has asked for it, which they did on 2 Aug 2026.
 *
 * It writes twice, because a successful approval cannot be reached otherwise:
 *   1. a PENDING overtime claim on one chosen assignment (what a late check-out
 *      would have recorded), and
 *   2. the approval itself over HTTP, which stamps the decision and inserts one
 *      `payment_voucher_line` carrying real money.
 *
 * Damage is bounded on purpose:
 *   - only an assignment whose week's voucher is `pending_review` is eligible,
 *     so no `sent`/`signed` document a PR has already seen can be appended to;
 *   - only ONE assignment is touched, chosen deterministically (oldest first);
 *   - it refuses if the chosen row already carries any overtime decision;
 *   - a failed approval rolls the claim back, so a half-done run cannot leave a
 *     week silently held;
 *   - it prints exact cleanup SQL, because there is no un-approve endpoint.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/fire-overtime-approval.ts
 *   ... --dry-run     # pick and report the target, write nothing
 */
import '@/env.js'; // FIRST — the pg pool builds from unset credentials otherwise
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { PaymentVoucherTable } from '@/features/payment-voucher/payment-voucher.model.js';
import { weekOfDate } from '@/features/payment-voucher/payment-voucher-week.js';
import { ShiftAssignmentTable } from '@/features/shift-assignment/shift-assignment.model.js';
import { ShiftTable } from '@/features/shift/shift.model.js';

const BASE = process.env.PROBE_API_URL ?? 'http://localhost:7777/api/v1';
const EMAIL = process.env.DEFAULT_ADMIN_EMAIL;
const PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD;
const DRY_RUN = process.argv.includes('--dry-run');

/** A plausible one-hour overrun — not a figure anyone would mistake for real payroll. */
const OVERTIME_MINUTES = 60;

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = (await res.json()) as { data?: { accessToken?: string }; message?: string };
  const token = body.data?.accessToken;
  if (!token) throw new Error(`Login failed (${res.status}): ${body.message}`);
  return token;
}

async function main() {
  if (!EMAIL || !PASSWORD) throw new Error('DEFAULT_ADMIN_EMAIL / DEFAULT_ADMIN_PASSWORD not set');

  // --report: read-only inventory of every overtime decision on the database.
  // Added after a re-run of this script picked a DIFFERENT target and approved a
  // second claim — because it filters on `overtime_status IS NULL`, so the row
  // it just decided is no longer eligible. That is idempotent in the sense that
  // it never double-pays ONE claim, and misleading in the sense that "run it
  // again" does not mean "repeat what you just did". Knowing what exists has to
  // be one command, not an inference.
  if (process.argv.includes('--report')) {
    const decided = await db
      .select({
        assignmentId: ShiftAssignmentTable.id,
        shiftDate: ShiftTable.shiftDate,
        minutes: ShiftAssignmentTable.overtimeMinutes,
        status: ShiftAssignmentTable.overtimeStatus,
        amount: ShiftAssignmentTable.overtimeAmount,
        decidedAt: ShiftAssignmentTable.overtimeDecidedAt,
        decidedBy: ShiftAssignmentTable.overtimeDecidedBy,
      })
      .from(ShiftAssignmentTable)
      .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
      .orderBy(asc(ShiftAssignmentTable.overtimeDecidedAt));
    const withDecision = decided.filter((d) => d.status !== null);
    console.log(`\nOVERTIME DECISIONS ON THE LIVE DATABASE — ${withDecision.length}\n`);
    for (const d of withDecision) {
      console.log(
        `  ${d.status?.padEnd(9)} ${d.assignmentId}  shift ${d.shiftDate}  ` +
          `${d.minutes}min  RM ${d.amount}  by ${d.decidedBy ?? '—'}  at ${d.decidedAt ?? '—'}`,
      );
    }
    // --retry re-sends APPROVE at an already-approved claim. This is the real
    // double-click test and it writes nothing: the guard is
    // `UPDATE … WHERE overtime_status = 'pending'`, so the second request must
    // fail to claim the row and be refused rather than adding a second line.
    if (process.argv.includes('--retry') && withDecision[0]) {
      const target = withDecision[0].assignmentId;
      const token = await login();
      const res = await fetch(`${BASE}/shift-assignment/${target}/overtime`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ decision: 'approve' }),
      });
      const body = (await res.json()) as { message?: string };
      console.log(`  RETRY approve on the already-approved ${target}`);
      console.log(`    → ${res.status} "${body.message}"`);
      console.log(
        res.status === 409
          ? '    PASS — refused, so a double-click cannot pay twice.\n'
          : '    FAIL — this should have been a 409.\n',
      );
    }
    process.exit(0);
  }

  console.log(`\nFIRE A SUCCESSFUL OVERTIME APPROVAL — ${DRY_RUN ? 'DRY RUN' : 'LIVE, WRITES'}\n`);

  // Completed, and carrying no overtime decision of any kind. Oldest first so a
  // re-run is deterministic rather than picking a different victim.
  const candidates = await db
    .select({
      assignmentId: ShiftAssignmentTable.id,
      prId: ShiftAssignmentTable.prId,
      agencyId: ShiftAssignmentTable.agencyId,
      payAmount: ShiftAssignmentTable.payAmount,
      shiftDate: ShiftTable.shiftDate,
    })
    .from(ShiftAssignmentTable)
    .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
    .where(
      and(
        eq(ShiftAssignmentTable.status, 'completed'),
        isNull(ShiftAssignmentTable.overtimeStatus),
      ),
    )
    .orderBy(asc(ShiftTable.shiftDate), asc(ShiftAssignmentTable.id));

  console.log(`  ${candidates.length} completed assignment(s) carry no overtime decision.`);

  // Eligible = PRICED (an unpriced one is the 409 arm, not the success arm) AND
  // its week's voucher is a DRAFT. Appending to a sent or signed document is
  // what the send gate exists to prevent, so it must not happen here either.
  let chosen: (typeof candidates)[number] | null = null;
  let voucher: { id: string; voucherNo: string | null; status: string } | null = null;

  for (const c of candidates) {
    if (!c.payAmount || Number(c.payAmount) <= 0) continue;
    const week = weekOfDate(c.shiftDate);
    if (!week) continue;
    const [v] = await db
      .select({
        id: PaymentVoucherTable.id,
        voucherNo: PaymentVoucherTable.voucherNo,
        status: PaymentVoucherTable.status,
      })
      .from(PaymentVoucherTable)
      .where(
        and(
          eq(PaymentVoucherTable.prId, c.prId),
          eq(PaymentVoucherTable.weekStart, week.weekStart),
        ),
      );
    if (!v || v.status !== 'pending_review') continue;
    chosen = c;
    voucher = v;
    break;
  }

  if (!chosen || !voucher) {
    console.log('\n  NO ELIGIBLE TARGET.');
    console.log('  A successful approval needs a completed, PRICED assignment whose week');
    console.log('  voucher is still `pending_review`. Every candidate failed one of those,');
    console.log('  which means the live data cannot demonstrate this path without either');
    console.log('  un-sending a voucher or inventing a shift — both worse than not proving it.');
    process.exit(2);
  }

  const week = weekOfDate(chosen.shiftDate);
  console.log(`\n  TARGET assignment ${chosen.assignmentId}`);
  console.log(`    shift date   ${chosen.shiftDate}  (week ${week?.weekStart} → ${week?.weekEnd})`);
  console.log(`    daily wage   RM ${chosen.payAmount}`);
  console.log(`    voucher      ${voucher.voucherNo ?? voucher.id} (${voucher.status})`);
  console.log(`    will record  ${OVERTIME_MINUTES} minutes of overtime, then APPROVE it`);

  if (DRY_RUN) {
    console.log('\n  --dry-run: nothing written.\n');
    process.exit(0);
  }

  // Guarded on `overtime_status IS NULL` so a concurrent run or a re-run cannot
  // overwrite a decision somebody else made in between.
  const claimed = await db
    .update(ShiftAssignmentTable)
    .set({ overtimeMinutes: OVERTIME_MINUTES, overtimeStatus: 'pending' })
    .where(
      and(
        eq(ShiftAssignmentTable.id, chosen.assignmentId),
        isNull(ShiftAssignmentTable.overtimeStatus),
      ),
    )
    .returning({ id: ShiftAssignmentTable.id });
  if (claimed.length === 0) throw new Error('The row gained an overtime decision underneath us.');
  console.log(`\n  [write 1] recorded a PENDING claim of ${OVERTIME_MINUTES} minutes.`);

  const token = await login();
  const res = await fetch(`${BASE}/shift-assignment/${chosen.assignmentId}/overtime`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ decision: 'approve' }),
  });
  const body = (await res.json()) as {
    message?: string;
    data?: { voucherId?: string; amount?: string; week?: { weekStart: string } };
  };

  console.log(`\n  [write 2] PATCH …/overtime → ${res.status}`);
  console.log(`            "${body.message}"`);

  if (res.status !== 200) {
    console.log('\n  The approval did NOT succeed. Rolling the claim back so the week is not held.');
    await db
      .update(ShiftAssignmentTable)
      .set({ overtimeMinutes: null, overtimeStatus: null })
      .where(eq(ShiftAssignmentTable.id, chosen.assignmentId));
    console.log('  Claim removed. Nothing durable was written.\n');
    process.exit(1);
  }

  console.log(`\n  APPROVED — RM ${body.data?.amount} onto voucher ${body.data?.voucherId}`);
  console.log(`  on the week of ${body.data?.week?.weekStart} (the week the shift was WORKED).`);

  console.log('\n  CLEANUP — there is no un-approve endpoint, so if these rows are unwanted:');
  console.log(
    `    DELETE FROM main.payment_voucher_line WHERE ref LIKE '%${chosen.assignmentId}-ot';`,
  );
  console.log(
    `    UPDATE main.shift_assignment SET overtime_minutes = NULL, overtime_status = NULL,\n` +
      `      overtime_amount = NULL, overtime_decided_at = NULL, overtime_decided_by = NULL\n` +
      `      WHERE id = '${chosen.assignmentId}';`,
  );
  console.log('    -- then re-run audit-live-vouchers.ts to confirm the totals settle.\n');
  process.exit(0);
}

void main().catch((e) => {
  console.error('\n  ERROR:', e instanceof Error ? e.message : e);
  process.exit(1);
});
