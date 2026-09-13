/**
 * READ-ONLY. Why is a DRINK sitting in the tips bucket?
 *
 * Two possible causes and they need opposite fixes:
 *   CODE — the item is tagged `drink` in the menu and the app still buckets it
 *          as tips;
 *   DATA — the venue tagged it under Service Entitlement, so every rule in the
 *          chain is behaving correctly on a wrong input.
 *
 * Prints the menu row, and every voucher line whose description matches, with
 * the component the server actually filed it under.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const menu = await db.execute(sql`
  select o.name as outlet, m.name, m.category, m.price_rm, m.slug
  from main.outlet_drink_menu m
  join main.outlet o on o.id = m.outlet_id
  where m.name ilike '%havoc%'
`);
console.log('menu rows named Havoc:', JSON.stringify(menu.rows ?? menu, null, 2));

const lines = await db.execute(sql`
  select l.description, l.quantity, l.amount, l.component,
         split_part(l.ref, '|', 1) as ref_kind,
         split_part(l.ref, '|', 5) as ref_category,
         r.receipt_no
  from main.payment_voucher_line l
  left join main.payment_voucher_receipt r on r.id = l.receipt_id
  where l.description ilike '%havoc%'
  order by r.receipt_no
`);
console.log('voucher lines named Havoc:', JSON.stringify(lines.rows ?? lines, null, 2));

// How the whole catalogue is tagged — one wrong row or a pattern?
const cats = await db.execute(sql`
  select category, count(*) as items, string_agg(name, ', ' order by name) as names
  from main.outlet_drink_menu group by category order by category
`);
console.log('catalogue by category:', JSON.stringify(cats.rows ?? cats, null, 2));
process.exit(0);
