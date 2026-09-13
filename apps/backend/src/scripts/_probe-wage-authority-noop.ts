/**
 * READ-ONLY. Would the new wage authority CHANGE any figure that exists?
 *
 * The guard writes `shift_assignment.pay_amount` instead of the number the phone
 * sent, but only when `pay_rule` is set — i.e. only when check-out really sealed
 * it. This replays that rule over every wage line already written and reports
 * where the two would differ. A non-zero count is a behaviour change on live
 * money and would have to be understood before shipping.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const rows = await db.execute(sql`
  select
    count(*)                                                            as wage_lines,
    count(*) filter (where sa.pay_rule is not null)                     as sealed_rows,
    count(*) filter (where sa.pay_rule is null)                         as legacy_rows_left_alone,
    count(*) filter (where sa.pay_rule is not null
                       and sa.pay_amount::numeric > 0
                       and round(sa.pay_amount::numeric, 2) <> round(l.amount::numeric, 2))
                                                                        as would_change
  from main.payment_voucher_line l
  join main.shift_assignment sa
    on sa.id = nullif(split_part(l.ref, '|', 4), '')::uuid
  where split_part(l.ref, '|', 1) = 'wages'
`);
console.log(JSON.stringify(rows.rows ?? rows, null, 2));
process.exit(0);
