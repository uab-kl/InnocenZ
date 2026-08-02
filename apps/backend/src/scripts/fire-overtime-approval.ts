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
import { paymentVoucherRepository } from '@/composition-root.js';
import {
  PaymentVoucherLineTable,
  PaymentVoucherTable,
} from '@/features/payment-voucher/payment-voucher.model.js';
import { overtimeDedupeRef } from '@/features/payment-voucher/overtime-line.js';
import { weekOfDate } from '@/features/payment-voucher/payment-voucher-week.js';
import { ShiftAssignmentTable } from '@/features/shift-assignment/shift-assignment.model.js';
import { ShiftTable } from '@/features/shift/shift.model.js';

const BASE = process.env.PROBE_API_URL ?? 'http://localhost:7777/api/v1';
const EMAIL = process.env.DEFAULT_ADMIN_EMAIL;
const PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD;
const DRY_RUN = process.argv.includes('--dry-run');
/**
 * Prove the OTHER arm instead: a commission-only assignment has no sealed daily
 * wage, so there is no hourly rate to derive and the approval must refuse rather
 * than write a 0.00 line — "we paid you nothing for those hours" is a different
 * and worse claim than "this cannot be priced".
 *
 * Deliberately NOT restricted to `completed`, unlike the success path. The
 * endpoint's unpriceable 409 is raised before the week lookup and before the
 * claim is taken, and it never consults the assignment's status — so narrowing
 * by status here would only shrink the pool of rows that can demonstrate it.
 */
const WANT_UNPRICED = process.argv.includes('--unpriced');

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
      status: ShiftAssignmentTable.status,
      shiftDate: ShiftTable.shiftDate,
    })
    .from(ShiftAssignmentTable)
    .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
    .where(
      WANT_UNPRICED
        ? isNull(ShiftAssignmentTable.overtimeStatus)
        : and(
            eq(ShiftAssignmentTable.status, 'completed'),
            isNull(ShiftAssignmentTable.overtimeStatus),
          ),
    )
    .orderBy(asc(ShiftTable.shiftDate), asc(ShiftAssignmentTable.id));

  console.log(
    `  ${candidates.length} ${WANT_UNPRICED ? '' : 'completed '}assignment(s) carry no overtime decision.`,
  );

  // Eligible = PRICED (an unpriced one is the 409 arm, not the success arm) AND
  // its week's voucher is a DRAFT. Appending to a sent or signed document is
  // what the send gate exists to prevent, so it must not happen here either.
  let chosen: (typeof candidates)[number] | null = null;
  let voucher: { id: string; voucherNo: string | null; status: string } | null = null;
  /** Non-null only when --unpriced had to borrow a priced row; the value to put back. */
  let borrowedWage: string | null = null;

  // --clear=<assignmentId>: undo one approval completely.
  //
  // Goes through the repository's own `deleteLine`, NOT a raw DELETE, because
  // that method calls `recomputeTotals` — the voucher's subtotal and net were
  // recomputed when the line was added, so removing the row behind their backs
  // would leave a voucher whose stated total no longer matches its own lines.
  // That is the precise shape of the fault this whole audit exists to catch.
  const clearArg = process.argv.find((a) => a.startsWith('--clear='));
  if (clearArg) {
    const assignmentId = clearArg.slice('--clear='.length);
    const dedupe = overtimeDedupeRef(assignmentId);
    const lines = await db
      .select({
        id: PaymentVoucherLineTable.id,
        voucherId: PaymentVoucherLineTable.voucherId,
        ref: PaymentVoucherLineTable.ref,
        amount: PaymentVoucherLineTable.amount,
        lineDate: PaymentVoucherLineTable.lineDate,
      })
      .from(PaymentVoucherLineTable);
    const mine = lines.filter((l) => (l.ref ?? '').includes(dedupe));

    console.log(`\nCLEAR ${assignmentId}`);
    console.log(`  dedupe ref: …${dedupe}`);
    console.log(`  ${mine.length} overtime line(s) found:`);
    for (const l of mine) {
      console.log(`    ${l.id}  voucher ${l.voucherId}  ${l.lineDate}  RM ${l.amount}`);
    }
    if (DRY_RUN) {
      console.log('\n  --dry-run: nothing removed.\n');
      process.exit(0);
    }

    for (const l of mine) {
      const ok = await paymentVoucherRepository.deleteLine(l.id);
      console.log(`  removed line ${l.id} → ${ok} (voucher totals recomputed)`);
    }
    await db
      .update(ShiftAssignmentTable)
      .set({
        overtimeMinutes: null,
        overtimeStatus: null,
        overtimeAmount: null,
        overtimeDecidedAt: null,
        overtimeDecidedBy: null,
      })
      .where(eq(ShiftAssignmentTable.id, assignmentId));
    console.log('  overtime columns cleared on the assignment.');
    console.log('\n  Re-run --report and audit-live-vouchers.ts to confirm.\n');
    process.exit(0);
  }

  // --race: two SIMULTANEOUS decisions on one pending claim. This is the test
  // `claimOvertimeDecision` was written for — a read-then-check is not a lock,
  // so without the `UPDATE … WHERE overtime_status = 'pending'` mutex both
  // requests would pass every precondition and both would act.
  //
  // It decides with REJECT, not approve, on purpose: reject runs through the
  // identical mutex but writes no voucher line, so the race can be proven
  // without putting money on anyone's payslip. The claim is rolled back to NULL
  // afterwards, leaving nothing behind at all.
  if (process.argv.includes('--race')) {
    const target = candidates.find((c) => !!c.payAmount && Number(c.payAmount) > 0);
    if (!target) {
      console.log('\n  No priced candidate free of an overtime decision — cannot stage a race.\n');
      process.exit(2);
    }
    console.log(`\n  RACE on ${target.assignmentId} (shift ${target.shiftDate})`);
    await db
      .update(ShiftAssignmentTable)
      .set({ overtimeMinutes: OVERTIME_MINUTES, overtimeStatus: 'pending' })
      .where(eq(ShiftAssignmentTable.id, target.assignmentId));
    console.log('  staged one PENDING claim, then firing two REJECTs at once…');

    const raceToken = await login();
    const fire = () =>
      fetch(`${BASE}/shift-assignment/${target.assignmentId}/overtime`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${raceToken}` },
        body: JSON.stringify({ decision: 'reject' }),
      }).then(async (r) => ({
        status: r.status,
        message: ((await r.json()) as { message?: string }).message,
      }));

    let outcomes: Array<{ status: number; message?: string }> = [];
    try {
      outcomes = await Promise.all([fire(), fire()]);
    } finally {
      // Unconditional: leave the row exactly as it was found.
      await db
        .update(ShiftAssignmentTable)
        .set({
          overtimeMinutes: null,
          overtimeStatus: null,
          overtimeAmount: null,
          overtimeDecidedAt: null,
          overtimeDecidedBy: null,
        })
        .where(eq(ShiftAssignmentTable.id, target.assignmentId));
      console.log('  claim rolled back to NULL — nothing left behind.');
    }

    for (const o of outcomes) console.log(`    → ${o.status} "${o.message}"`);
    const winners = outcomes.filter((o) => o.status === 200).length;
    const losers = outcomes.filter((o) => o.status === 409).length;
    console.log(
      winners === 1 && losers === 1
        ? '\n  PASS — exactly one decision landed, the other was refused. The transition IS the mutex.\n'
        : `\n  FAIL — expected 1×200 and 1×409, got ${winners}×200 and ${losers}×409.\n`,
    );
    process.exit(winners === 1 && losers === 1 ? 0 : 1);
  }

  if (WANT_UNPRICED) {
    // Prefer a genuinely unpriced row. On this database there is none — every
    // assignment carries a positive wage — so the fallback BORROWS one: blank
    // its wage, fire, and restore it in a `finally` so a crash still puts it
    // back. Least-consequential status first, and `completed` is excluded
    // outright: those rows are what vouchers are built from, and a wage that
    // blinks out mid-generation would be a real payroll fault, not a test.
    const RANK: Record<string, number> = { cancelled: 0, no_show: 1, assigned: 2, confirmed: 3 };
    const natural = candidates.find((c) => !c.payAmount || Number(c.payAmount) <= 0);
    const borrowed = candidates
      .filter((c) => c.status !== 'completed' && RANK[c.status] !== undefined)
      .sort((a, b) => RANK[a.status] - RANK[b.status])[0];
    chosen = natural ?? borrowed ?? null;
    borrowedWage = natural ? null : (chosen?.payAmount ?? null);
    voucher = { id: '(no voucher needed — the 409 precedes the week lookup)', voucherNo: null, status: 'n/a' };
    if (chosen) {
      console.log(
        natural
          ? `  found a genuinely unpriced assignment.`
          : `  no unpriced assignment exists — BORROWING ${chosen.assignmentId} (${chosen.status}, RM ${chosen.payAmount}), wage restored afterwards.`,
      );
    }
  }

  for (const c of WANT_UNPRICED ? [] : candidates) {
    const priced = !!c.payAmount && Number(c.payAmount) > 0;
    if (!priced) continue;
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
  if (borrowedWage !== null) {
    await db
      .update(ShiftAssignmentTable)
      // '0.00', not NULL: the column is NOT NULL, and zero reaches the same
      // guard anyway — `amountCents <= 0` is what the endpoint actually tests,
      // because a commission-only PR's wage is absent in VALUE, not in schema.
      .set({ payAmount: '0.00' })
      .where(eq(ShiftAssignmentTable.id, chosen.assignmentId));
    console.log(`\n  [borrow] wage set to 0.00 (was RM ${borrowedWage}) — restored in a finally block.`);
  }

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

  let res: Response;
  let body: {
    message?: string;
    data?: { voucherId?: string; amount?: string; week?: { weekStart: string } };
  };
  try {
    const token = await login();
    res = await fetch(`${BASE}/shift-assignment/${chosen.assignmentId}/overtime`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ decision: 'approve' }),
    });
    body = (await res.json()) as typeof body;
  } finally {
    // Unconditional: a borrowed wage goes back even if the request threw. An
    // assignment left with no wage is a payroll fault, not a failed test.
    if (borrowedWage !== null) {
      await db
        .update(ShiftAssignmentTable)
        .set({ payAmount: borrowedWage })
        .where(eq(ShiftAssignmentTable.id, chosen.assignmentId));
      console.log(`  [borrow] wage restored to RM ${borrowedWage}.`);
    }
  }

  console.log(`\n  [write 2] PATCH …/overtime → ${res.status}`);
  console.log(`            "${body.message}"`);

  if (res.status !== 200) {
    // The rollback matters more in the --unpriced case than anywhere else: the
    // pending claim this script had to create in order to reach the endpoint
    // would otherwise sit there BLOCKING that PR's week from ever being sent,
    // over a claim that can never be priced and so can never be approved.
    console.log('\n  Rolling the claim back so the week is not left held.');
    await db
      .update(ShiftAssignmentTable)
      .set({ overtimeMinutes: null, overtimeStatus: null })
      .where(eq(ShiftAssignmentTable.id, chosen.assignmentId));
    console.log('  Claim removed. Nothing durable was written.');

    if (WANT_UNPRICED) {
      const ok = res.status === 409 && /cannot be priced/i.test(body.message ?? '');
      console.log(
        ok
          ? '\n  PASS — an unpriceable claim is a 409, not a 0.00 line on someone’s payslip.\n'
          : `\n  FAIL — expected 409 "…cannot be priced", got ${res.status}.\n`,
      );
      process.exit(ok ? 0 : 1);
    }
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
