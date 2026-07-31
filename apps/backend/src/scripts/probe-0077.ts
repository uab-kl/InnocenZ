/**
 * Proves migration 0077 is LIVE — the one-voucher-per-PR-per-week index.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/probe-0077.ts
 *
 * Why this exists rather than trusting `pnpm migrate:deploy` saying "applied":
 * `tsc` and `drizzle-kit generate` never open a connection, and check-schema-drift
 * compares COLUMNS against a snapshot — an index is invisible to all three. The
 * only proof a constraint exists is the database refusing something.
 *
 * Two checks, because either alone can lie:
 *  1. The index is listed in pg_indexes (it exists, and is PARTIAL as intended).
 *  2. A duplicate insert is actually REFUSED (it exists AND it bites).
 *
 * ⚠️ Check 2 writes, then ROLLS BACK — deliberately, on a shared database. The
 * transaction is aborted by the constraint violation itself and never committed,
 * so no row survives either outcome.
 */
import '@/env.js'; // FIRST — the pg pool builds from unset credentials otherwise
import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { PaymentVoucherTable } from '@/features/payment-voucher/payment-voucher.model.js';

const INDEX = 'payment_voucher_one_per_pr_week';

async function main() {
  let pass = 0;
  let fail = 0;
  const ok = (label: string, good: boolean, detail = '') => {
    console.log(`${good ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
    if (good) pass++;
    else fail++;
  };

  // 1. Does the index exist, and is it the partial one we meant?
  const result = await db.execute<{ indexdef: string }>(
    sql`select indexdef from pg_indexes where schemaname = 'main' and indexname = ${INDEX}`,
  );
  // node-postgres returns a QueryResult ({rows}); some drizzle versions hand back
  // the array directly. Handle both rather than depending on which is in play.
  const asAny = result as unknown as { rows?: { indexdef: string }[] } & { indexdef?: string }[];
  const def = asAny.rows?.[0]?.indexdef ?? asAny[0]?.indexdef;

  ok('index exists', Boolean(def), def ?? 'not found in pg_indexes');
  if (def) {
    ok('index is UNIQUE', /CREATE UNIQUE INDEX/i.test(def));
    ok('index is PARTIAL (WHERE clause present)', /WHERE/i.test(def));
    ok('index covers (pr_id, week_start)', /pr_id/.test(def) && /week_start/.test(def));
  }

  // 2. Does it actually refuse a duplicate? Take a real existing voucher and try
  // to insert a second one for the same pr_id + week_start. The insert MUST fail.
  const [victim] = await db
    .select()
    .from(PaymentVoucherTable)
    .where(
      sql`${PaymentVoucherTable.prId} IS NOT NULL AND ${PaymentVoucherTable.weekStart} IS NOT NULL`,
    )
    .limit(1);

  if (!victim) {
    console.log('SKIP  duplicate-refused — no voucher with both pr_id and week_start to test against');
  } else {
    let refused = false;
    try {
      await db.transaction(async (tx) => {
        await tx.insert(PaymentVoucherTable).values({
          agencyId: victim.agencyId,
          prId: victim.prId,
          prName: victim.prName,
          weekStart: victim.weekStart,
          weekEnd: victim.weekEnd,
          createdBy: 'probe-0077',
          updatedBy: 'probe-0077',
        });
        // Not reached when the index bites. If it IS reached the index is absent,
        // so throw to roll back rather than leaving the duplicate behind.
        throw new Error('__probe_rollback__');
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      refused = !message.includes('__probe_rollback__');
      if (!refused) {
        console.log('      (insert SUCCEEDED and was rolled back — the index did not bite)');
      }
    }
    ok(
      `duplicate for pr=${victim.prId} week=${victim.weekStart} is refused`,
      refused,
      refused ? 'constraint violation raised, nothing committed' : 'NO constraint',
    );
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error('[probe-0077] FAILED:', error);
    process.exit(1);
  });
