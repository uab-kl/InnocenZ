/**
 * READ-ONLY. Dump one venue's whole workspace — parent scalars, every tier rate
 * and every menu row — so a save can be compared against what was there before.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-workspace-snapshot.ts "Velvet 23"
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env'),
});
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const name = process.argv[2] ?? 'Velvet 23';

const parent = await db.execute(sql`
  select w.base_pay_per_hour, w.drink_pct, w.tip_pct, w.ot_after_hours,
         w.per_drink_rm, w.happy_hour_start, w.happy_hour_end,
         w.happy_hour_drink_discount_pct, w.updated_by, w.updated_at
  from main.outlet_workspace w
  join main.outlet o on o.id = w.outlet_id
  where o.name = ${name}
`);
console.log(`parent (${name}):`, JSON.stringify(parent.rows ?? parent, null, 2));

const tiers = await db.execute(sql`
  select t.kind, t.tier, t.daily_wage, t.drink_pct, t.happy_hour_drink_pct,
         t.tip_pct, t.standard_shift_hours, t.target_sales_rm, t.sort_order
  from main.outlet_tier_rate t
  join main.outlet o on o.id = t.outlet_id
  where o.name = ${name}
  order by t.sort_order
`);
console.table(tiers.rows ?? tiers);

const menu = await db.execute(sql`
  select m.slug, m.name, m.price_rm, m.category, m.sort_order, m.created_by, m.updated_by
  from main.outlet_drink_menu m
  join main.outlet o on o.id = m.outlet_id
  where o.name = ${name}
  order by m.sort_order
`);
console.table(menu.rows ?? menu);
process.exit(0);
