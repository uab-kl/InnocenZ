/**
 * READ-ONLY. Is `payment_voucher.deduction` the SAME money as a
 * `component='deduction'` LINE, or a second, independent figure?
 *
 * It matters for the printed voucher: `buildPvTemplateLines` prints every line
 * AND appends a "Deductions" row when `pv.deduct > 0`. If the column mirrors a
 * line, that document shows the fee twice.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const rows = await db.execute(sql`
  select v.voucher_no,
         v.deduction::numeric                                             as deduction_column,
         coalesce(sum(l.amount::numeric) filter (where l.component = 'deduction'), 0) as deduction_lines,
         v.subtotal::numeric as subtotal, v.net::numeric as net,
         round(sum(l.amount::numeric), 2) as sum_of_lines
  from main.payment_voucher v
  left join main.payment_voucher_line l on l.voucher_id = v.id
  group by v.id, v.voucher_no, v.deduction, v.subtotal, v.net
  having v.deduction::numeric <> 0
      or coalesce(sum(l.amount::numeric) filter (where l.component = 'deduction'), 0) <> 0
  order by v.voucher_no
`);
console.log(JSON.stringify(rows.rows ?? rows, null, 2));
process.exit(0);
