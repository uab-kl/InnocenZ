/**
 * READ-ONLY. Dumps `PV-000005` and `PV-000006` with their lines and receipts.
 *
 * Why this exists: re-anchoring `PV-000005` from 2026-08-03 to 2026-08-02 was
 * refused by `payment_voucher_one_per_pr_week` — the same PR already holds a
 * voucher on 2026-08-02. Before proposing any repair, the two rows need to be
 * looked at side by side to establish whether they are a DOUBLE BILL (same money
 * twice, one must die) or a SPLIT WEEK (one week's money on two rows, which
 * merge rather than delete).
 *
 * Writes nothing. Deleting or merging a live voucher is the owner's call.
 */
import '@/env.js'; // FIRST — the pg pool builds from unset credentials otherwise
import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';

const iso = (v: unknown): string => (v === null || v === undefined ? '—' : String(v).slice(0, 10));

async function main() {
  const vouchers = await db.execute(sql`
    select id, voucher_no, pr_id, pr_name, status, week_start, week_end,
           issued_date, due_date, subtotal, deduction, net
      from main.payment_voucher
     where voucher_no in ('PV-000005', 'PV-000006')
     order by voucher_no
  `);

  for (const v of vouchers.rows as unknown as Record<string, unknown>[]) {
    console.log(`\n=== ${v.voucher_no} =====================================`);
    console.log(`  id        ${v.id}`);
    console.log(`  pr        ${v.pr_name}  (pr_id ${v.pr_id})`);
    console.log(`  status    ${v.status}`);
    console.log(`  week      ${iso(v.week_start)} .. ${iso(v.week_end)}`);
    console.log(`  issued    ${iso(v.issued_date)}   due ${iso(v.due_date)}`);
    console.log(`  subtotal  ${v.subtotal}   deduction ${v.deduction}   NET ${v.net}`);

    const lines = await db.execute(sql`
      select id, line_date, outlet, description, quantity, amount, ref, component,
             receipt_id,
             case when jsonb_typeof(proof_photos) = 'array'
                  then jsonb_array_length(proof_photos) else 0 end as photos
        from main.payment_voucher_line
       where voucher_id = ${v.id as string}
       order by line_date, description
    `);
    console.log(`  --- ${lines.rows.length} line(s) ---`);
    for (const l of lines.rows as unknown as Record<string, unknown>[]) {
      console.log(
        `    ${iso(l.line_date)}  ${String(l.component ?? '?').padEnd(7)} ` +
          `RM ${String(l.amount).padStart(9)}  ${l.description}`,
      );
      console.log(
        `        ref=${l.ref ?? '—'}  receipt_id=${l.receipt_id ?? '—'}  photos=${l.photos}`,
      );
    }

    const receipts = await db.execute(sql`
      select * from main.payment_voucher_receipt
       where voucher_id = ${v.id as string}
    `);
    console.log(`  --- ${receipts.rows.length} receipt(s) ---`);
    for (const r of receipts.rows as unknown as Record<string, unknown>[]) {
      const shown = Object.entries(r)
        .filter(([, val]) => val !== null && val !== undefined)
        .map(([k, val]) => `${k}=${String(val).slice(0, 40)}`)
        .join('  ');
      console.log(`    ${shown}`);
    }
  }

  console.log('\nNothing was changed — this script only reads.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
