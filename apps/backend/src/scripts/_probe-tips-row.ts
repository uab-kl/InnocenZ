/**
 * READ-ONLY. Does every outlet have a Tips row under Service Entitlement?
 * Prints, per outlet: workspace present, menu counts by category, and whether a
 * row named/slugged 'tips' exists.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const rows = await db.execute(sql`
  select o.name as outlet,
         (w.id is not null) as has_workspace,
         count(m.id) filter (where m.category = 'drink')   as drinks,
         count(m.id) filter (where m.category = 'service') as services,
         count(m.id) filter (where m.slug = 'tips' or lower(m.name) = 'tips') as tips_rows,
         max(m.price_rm) filter (where m.slug = 'tips' or lower(m.name) = 'tips') as tips_price,
         max(m.category) filter (where m.slug = 'tips' or lower(m.name) = 'tips') as tips_category
  from main.outlet o
  left join main.outlet_workspace w on w.outlet_id = o.id
  left join main.outlet_drink_menu m on m.outlet_id = o.id
  group by o.name, w.id
  order by o.name
`);
console.table(rows.rows ?? rows);

const slugs = await db.execute(sql`
  select m.slug, lower(m.name) as name, m.category, count(*) as n
  from main.outlet_drink_menu m
  group by 1,2,3 order by n desc, 1
`);
console.log('\nall menu slugs across venues:');
console.table(slugs.rows ?? slugs);
process.exit(0);
