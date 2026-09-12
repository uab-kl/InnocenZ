import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const r = await db.execute(sql`
  select o.name, w.base_pay_per_hour, w.drink_pct, w.tip_pct, w.ot_after_hours,
         w.per_drink_rm, w.happy_hour_start, w.happy_hour_end, w.happy_hour_drink_discount_pct,
         (w.updated_at > now() - interval '30 minutes') as touched
  from main.outlet_workspace w join main.outlet o on o.id = w.outlet_id
  order by touched desc, o.name
`);
console.log('venue                      touched  base   drink%  tip%   otAfter perDrink hhStart hhEnd hhDisc');
for (const x of (r.rows ?? r) as any[]) {
  console.log(
    String(x.name).slice(0,24).padEnd(26) +
    String(x.touched).padEnd(9) +
    String(x.base_pay_per_hour).padEnd(7) +
    String(x.drink_pct).padEnd(8) +
    String(x.tip_pct).padEnd(7) +
    String(x.ot_after_hours).padEnd(8) +
    String(x.per_drink_rm).padEnd(9) +
    String(x.happy_hour_start||'""').padEnd(8) +
    String(x.happy_hour_end||'""').padEnd(6) +
    String(x.happy_hour_drink_discount_pct)
  );
}
process.exit(0);
