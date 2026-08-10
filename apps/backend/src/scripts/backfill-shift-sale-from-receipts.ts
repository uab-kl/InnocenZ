/**
 * Backfills the outlet floor-sales mirror from receipts already logged.
 *
 * shift_sale had no writer until now, so every receipt a PR scanned before this
 * shipped left the outlet's revenue at RM 0.00. This walks every (shift, PR)
 * pair that has a receipt-backed line and runs the SAME recompute the live
 * write paths call — no second implementation to drift.
 *
 * Idempotent: the recompute derives each pair's whole total from its lines and
 * upserts on (shift_id, pr_id), so running this twice changes nothing. Safe to
 * re-run after correcting receipts.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/backfill-shift-sale-from-receipts.ts
 */
import '@/env.js';
import { db } from '@/db/index.js';
import { sql } from 'drizzle-orm';
import {
  listReceiptBackedShiftPrs,
  recomputeShiftSale,
} from '@/features/shift-sale/shift-sale-from-receipts.js';

const ACTOR = 'backfill:shift-sale-from-receipts';

async function main(): Promise<void> {
  const keys = await listReceiptBackedShiftPrs();
  console.log(`(shift, PR) pairs with receipt-backed lines: ${keys.length}`);

  let ok = 0;
  let failed = 0;
  for (const key of keys) {
    const done = await recomputeShiftSale(key, ACTOR);
    if (done) ok++;
    else {
      failed++;
      console.warn(`  FAILED shift=${key.shiftId} pr=${key.prId}`);
    }
  }
  console.log(`recomputed: ${ok} ok, ${failed} failed`);

  // Report what actually landed, per outlet — a count is not proof the numbers
  // are right, so print the money.
  const rows = await db.execute(sql`
    select o.name as outlet,
           count(*)::int as sale_rows,
           sum(ss.drink_sales_rm)::float8 as drinks,
           sum(ss.tip_sales_rm)::float8 as tips,
           sum(ss.service_sales_rm)::float8 as services,
           sum(ss.total_sales_rm)::float8 as total
    from main.shift_sale ss
    join main.outlet o on o.id = ss.outlet_id
    group by o.name order by o.name
  `);
  console.log('\nshift_sale after backfill:');
  console.table(rows.rows);

  // The invariant every writer must hold: total = drink + tip + service. The
  // Reports headline reads total_sales_rm while the Floor Sales card sums the
  // three buckets, so a mismatch shows as two different numbers on one screen.
  const drift = await db.execute(sql`
    select count(*)::int as mismatched
    from main.shift_sale
    where total_sales_rm <> (drink_sales_rm + tip_sales_rm + service_sales_rm)
  `);
  console.log('rows where total <> drink+tip+service (must be 0):', drift.rows);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
