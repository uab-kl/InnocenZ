/**
 * READ-ONLY. Does the WAGE line a phone posted match the wage the SERVER sealed?
 *
 * `payment_voucher_line.amount` for a wages line is whatever the PR's phone sent
 * as `commission`; `shift_assignment.pay_amount` is what the server itself
 * computed at check-out. The line's `ref` is
 * `kind|source|sales|dedupe|category`, and for a check-out seal `dedupe` is the
 * assignment id — so the two are directly comparable.
 *
 * ⚠️ The same `pay_amount` column is what `collection_invoice.amount` is summed
 * from, i.e. what the VENUE is billed. A disagreement is the venue billed one
 * number while the PR is paid another.
 *
 * Writes nothing.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const rows = await db.execute(sql`
  select
    count(*)                                                        as wage_lines_with_assignment,
    count(*) filter (where round(l.amount, 2) <> round(sa.pay_amount, 2)) as disagreeing,
    coalesce(sum(round(l.amount, 2) - round(sa.pay_amount, 2)), 0)  as net_difference_rm,
    coalesce(max(abs(round(l.amount, 2) - round(sa.pay_amount, 2))), 0) as worst_gap_rm
  from main.payment_voucher_line l
  join main.shift_assignment sa
    on sa.id = nullif(split_part(l.ref, '|', 4), '')::uuid
  where split_part(l.ref, '|', 1) = 'wages'
`);
console.log('wages line vs sealed pay_amount:');
console.log(JSON.stringify(rows.rows ?? rows, null, 2));

const detail = await db.execute(sql`
  select l.id, l.amount as line_amount, sa.pay_amount as sealed, sa.pay_rule, l.line_date
  from main.payment_voucher_line l
  join main.shift_assignment sa
    on sa.id = nullif(split_part(l.ref, '|', 4), '')::uuid
  where split_part(l.ref, '|', 1) = 'wages'
    and round(l.amount, 2) <> round(sa.pay_amount, 2)
  order by abs(round(l.amount, 2) - round(sa.pay_amount, 2)) desc
  limit 10
`);
console.log('worst disagreements (up to 10):');
console.log(JSON.stringify(detail.rows ?? detail, null, 2));
process.exit(0);
