/**
 * Re-files voucher lines where a bar SERVICE was logged into the overtime bucket.
 *
 *   pnpm tsx --tsconfig tsconfig.json src/scripts/refile-service-lines.ts
 *   (add --apply to write; without it the script only reports)
 *
 * Until 4 Aug 2026 the PR app classified only `category: 'tip'` — plus one
 * hardcoded id — as tips, so every other service an outlet configured fell into
 * `others`, which shows as **OT** and is filed as component `other`: the same
 * bucket as genuine overtime. Havoc (Service Entitlement, RM 1,000) logged as
 * "OT · RM 2,000.00".
 *
 * The rows carry their own evidence, which is what makes this safe to automate:
 *
 *   ref = "others|manual|2000.00|ORD1111:2|service"
 *          ^ kind says overtime            ^ category says service
 *
 * Only that exact contradiction is touched — packed kind `others` while the
 * row's OWN category segment reads `service` or `tip`. A genuine overtime line
 * carries no such category and is never matched.
 *
 * ⚠️ MONEY IS NOT TOUCHED. `quantity`, `amount` (the commission) and the sales
 * figure packed into the ref all stay exactly as they are; this changes which
 * bucket the line is reported under, nothing else. Both fields must move
 * together because `lineKind()` lets a packed ref outrank the `component` column.
 */
import '@/env.js';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { PaymentVoucherLineTable } from '@/features/payment-voucher/payment-voucher.model.js';

const ACTOR = 'refile-service-lines';
const APPLY = process.argv.includes('--apply');

/** ref layout: kind|source|sales|receiptRef|category */
function refileRef(ref: string | null): string | null {
  if (!ref) return null;
  const parts = ref.split('|');
  if (parts.length < 5) return null;
  const kind = parts[0];
  const category = parts[4];
  if (kind !== 'others') return null;
  if (category !== 'service' && category !== 'tip') return null;
  parts[0] = 'tips';
  return parts.join('|');
}

async function main() {
  const rows = await db
    .select()
    .from(PaymentVoucherLineTable)
    .where(sql`${PaymentVoucherLineTable.ref} like 'others|%'`);

  const targets = rows
    .map((row) => ({ row, nextRef: refileRef(row.ref) }))
    .filter((x): x is { row: (typeof rows)[number]; nextRef: string } => x.nextRef !== null);

  console.log(`\nLines where a service was filed into the OT bucket (${targets.length}):`);
  for (const { row, nextRef } of targets) {
    console.log(
      `  ${row.lineDate} ${String(row.description).padEnd(20)} qty=${row.quantity} commission RM${row.amount}`,
    );
    console.log(`      ref       ${row.ref}`);
    console.log(`      →         ${nextRef}`);
    console.log(`      component ${row.component} → tip_commission   (money unchanged)`);
  }

  if (targets.length === 0) {
    console.log('  none — nothing to re-file.');
    process.exit(0);
  }
  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply.');
    process.exit(0);
  }

  for (const { row, nextRef } of targets) {
    await db
      .update(PaymentVoucherLineTable)
      .set({
        ref: nextRef,
        component: 'tip_commission',
        updatedAt: new Date(),
        updatedBy: ACTOR,
      })
      .where(eq(PaymentVoucherLineTable.id, row.id));
  }
  console.log(`\nAPPLIED: ${targets.length} line(s) re-filed from OT to tips. No amount changed.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
