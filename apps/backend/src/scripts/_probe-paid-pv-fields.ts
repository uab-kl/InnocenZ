/**
 * READ-ONLY. Do PAID vouchers carry the fields the History card fails to show?
 *
 * The History page prints a raw uuid where Payroll prints `PV-000009`. Two very
 * different causes: the card reads the wrong field, or the row genuinely has no
 * `voucher_no`. This says which, and whether the week columns are there to
 * print alongside it.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-paid-pv-fields.ts
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env'),
});
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const cols = await db.execute(sql`
  select column_name from information_schema.columns
  where table_schema = 'main' and table_name = 'payment_voucher'
  order by ordinal_position
`);
console.log(
  'payment_voucher columns:',
  (cols.rows as { column_name: string }[]).map((c) => c.column_name).join(', '),
);

// The voucher shown in the report, plus every PAID one for context.
const rows = await db.execute(sql`
  select v.voucher_no, v.status, v.week_start, v.week_end,
         v.issued_date, v.due_date, v.paid_at, v.cycle
  from main.payment_voucher v
  -- Compared as TEXT: the enum's own spelling is not 'PAID' (the web maps it),
  -- and guessing a label is how a filter silently returns nothing.
  where lower(v.status::text) = 'paid'
     or v.id = '7bf3962e-591e-452f-b781-edbe1cbe6ef0'
  order by v.status::text, v.voucher_no nulls first
  limit 30
`);
console.log('\nPAID vouchers (and the one from the report):');
console.table(rows.rows ?? rows);

const counts = await db.execute(sql`
  select v.status,
         count(*) as rows,
         count(v.voucher_no) as with_voucher_no,
         count(v.week_start) as with_week,
         count(v.due_date) as with_due_date
  from main.payment_voucher v
  group by v.status order by 1
`);
console.log('\nby status — how many carry a voucher_no, a week and a due date:');
console.table(counts.rows ?? counts);
process.exit(0);
