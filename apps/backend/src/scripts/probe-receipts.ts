/**
 * READ-ONLY. Prints what actually lives in `payment_voucher_receipt` and what
 * the agency Receipts tab would fetch for it, so a "0 receipts" screen can be
 * told apart from an empty table.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/probe-receipts.ts
 */
import '@/env.js'; // FIRST — the pg pool builds from unset credentials otherwise
import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';

async function main() {
  const counts = await db.execute(sql`
    select
      (select count(*) from main.payment_voucher_receipt) as receipts,
      (select count(*) from main.payment_voucher_line where receipt_id is not null) as receipt_lines,
      (select count(*) from main.payment_voucher_line) as all_lines,
      (select count(*) from main.payment_voucher) as vouchers
  `);
  console.log('TOTALS:', counts.rows[0]);

  const receipts = await db.execute(sql`
    select r.receipt_no, r.order_no, r.source, r.status, r.receipt_date, r.receipt_time,
           r.created_at, r.note,
           jsonb_array_length(coalesce(r.proof_photos, '[]'::jsonb)) as photos,
           v.id as voucher_id, v.voucher_no, v.status as voucher_status,
           v.week_start, v.week_end, v.agency_id, p.name as pr_name,
           (select count(*) from main.payment_voucher_line l where l.receipt_id = r.id) as lines,
           (select coalesce(sum(l.amount), 0) from main.payment_voucher_line l where l.receipt_id = r.id) as total
      from main.payment_voucher_receipt r
      join main.payment_voucher v on v.id = r.voucher_id
      left join main.pr p on p.id = v.pr_id
     order by r.created_at desc
     limit 50
  `);
  console.log(`\nRECEIPTS (${receipts.rows.length}):`);
  for (const r of receipts.rows) console.log(JSON.stringify(r));

  const byAgency = await db.execute(sql`
    select v.agency_id, a.name as agency_name, count(*) as receipts,
           min(r.created_at) as oldest, max(r.created_at) as newest
      from main.payment_voucher_receipt r
      join main.payment_voucher v on v.id = r.voucher_id
      left join main.agency a on a.id = v.agency_id
     group by v.agency_id, a.name
  `);
  console.log('\nBY AGENCY:');
  for (const r of byAgency.rows) console.log(JSON.stringify(r));

  // Lines that came from a receipt but whose receipt row is gone, plus the
  // reverse: commission-looking lines that never got a receipt at all.
  const orphans = await db.execute(sql`
    select l.component, count(*) as n, coalesce(sum(l.amount), 0) as total
      from main.payment_voucher_line l
     where l.receipt_id is null
     group by l.component
  `);
  console.log('\nLINES WITH NO RECEIPT, BY COMPONENT:');
  for (const r of orphans.rows) console.log(JSON.stringify(r));

  // What `/payment-voucher/mine/history` would and would not return: it filters
  // to signed+paid, so a week still under review is invisible to History.
  const vouchers = await db.execute(sql`
    select v.voucher_no, v.status, v.week_start, v.week_end, v.net,
           v.pr_signed_at, v.paid_at, p.name as pr_name,
           (select count(*) from main.payment_voucher_line l where l.voucher_id = v.id) as lines
      from main.payment_voucher v
      left join main.pr p on p.id = v.pr_id
     order by v.week_start desc
  `);
  console.log('\nVOUCHERS:');
  for (const r of vouchers.rows) console.log(JSON.stringify(r));

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
