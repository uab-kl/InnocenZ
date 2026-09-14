/**
 * READ-ONLY. Every percentage the database stores, and every table that has one.
 *
 * Asked to answer "is there a SERVICE percentage anywhere?" without trusting a
 * grep for a name I guessed. This enumerates the columns instead, so the list is
 * the evidence: if a service rate existed under any spelling it would be in it.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-all-percent-columns.ts
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env'),
});
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

// Anything that could be a rate: named pct/percent/rate/commission.
const cols = await db.execute(sql`
  select table_name, column_name, data_type, numeric_precision, numeric_scale
  from information_schema.columns
  where table_schema = 'main'
    and (column_name ~ '(pct|percent|rate|commission)')
  order by table_name, column_name
`);
console.log('every pct / percent / rate / commission column in schema "main":');
console.table(cols.rows ?? cols);

// The rate card itself, spelled out — the positive control for the list above.
const rateCard = await db.execute(sql`
  select column_name, data_type
  from information_schema.columns
  where table_schema = 'main' and table_name = 'outlet_tier_rate'
  order by ordinal_position
`);
console.log('\noutlet_tier_rate — the whole rate card, column by column:');
console.table(rateCard.rows ?? rateCard);

// Every distinct category actually stored on the menu, with counts.
const cats = await db.execute(sql`
  select category, count(*) as rows from main.outlet_drink_menu group by 1 order by 2 desc
`);
console.log('\ncategories actually present in outlet_drink_menu:');
console.table(cats.rows ?? cats);
process.exit(0);
