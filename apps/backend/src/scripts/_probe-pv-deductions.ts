/**
 * READ-ONLY. Are there deduction lines on live vouchers, and are they negative?
 *
 * The agency's PV breakdown files `component='deduction'` into its "Other"
 * bucket and then renders that row only `if (other > 0)` — so a negative
 * deduction is subtracted from the total and never shown. This says whether the
 * data that triggers it exists.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const byComponent = await db.execute(sql`
  select component, count(*) as lines,
         count(*) filter (where amount::numeric < 0) as negative,
         round(sum(amount::numeric), 2) as total_rm
  from main.payment_voucher_line
  group by component order by component
`);
console.log('lines by component:', JSON.stringify(byComponent.rows ?? byComponent, null, 2));

// Vouchers where the "Other" bucket nets out invisible: some 'other'/'deduction'
// money is present but their SUM is <= 0, which is exactly when the row is hidden
// while the total still carries it.
const hidden = await db.execute(sql`
  select v.voucher_no, v.pr_name,
         round(sum(l.amount::numeric) filter (where l.component in ('other','deduction')), 2) as other_bucket,
         count(*) filter (where l.component = 'deduction') as deduction_lines,
         round(sum(l.amount::numeric), 2) as voucher_total
  from main.payment_voucher v
  join main.payment_voucher_line l on l.voucher_id = v.id
  group by v.id, v.voucher_no, v.pr_name
  having count(*) filter (where l.component in ('other','deduction')) > 0
     and coalesce(sum(l.amount::numeric) filter (where l.component in ('other','deduction')), 0) <= 0
  order by other_bucket asc
  limit 10
`);
console.log('vouchers whose Other bucket is money the breakdown hides:',
  JSON.stringify(hidden.rows ?? hidden, null, 2));
process.exit(0);
