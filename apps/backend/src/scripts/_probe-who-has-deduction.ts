import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const r = await db.execute(sql`
  select u.email, v.id as voucher_id, v.status, v.week_start::text as wk,
         l.amount::text as deduction, l.description,
         (select sum(amount)::text from main.payment_voucher_line where voucher_id = v.id) as net_sum
  from main.payment_voucher_line l
  join main.payment_voucher v on v.id = l.voucher_id
  join main."user" u on u.id = v.pr_id
  where l.amount < 0`);
for (const x of (r.rows ?? r) as any[]) {
  console.log(`PR=${x.email} week=${x.wk} status=${x.status}`);
  console.log(`  deduction=${x.deduction} (${x.description})  sum of ALL lines=${x.net_sum}`);
}
process.exit(0);
