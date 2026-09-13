/**
 * READ-ONLY. Was the rate card EDITED after the over-ceiling lines were written?
 *
 * The innocent explanation for a line above today's ceiling is that the card
 * moved underneath it — the line is historical, the percentage is current. This
 * separates that from tampering, and it has to be settled before a write-time
 * ceiling can be trusted.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const cards = await db.execute(sql`
  select o.name as outlet, otr.tier, otr.drink_pct, otr.happy_hour_drink_pct, otr.tip_pct,
         otr.created_at, otr.updated_at
  from main.outlet_tier_rate otr
  join main.outlet o on o.id = otr.outlet_id
  order by otr.updated_at desc nulls last
  limit 12
`);
console.log('outlet_tier_rate, most recently touched first:');
console.log(JSON.stringify(cards.rows ?? cards, null, 2));

const lines = await db.execute(sql`
  select min(l.created_at) as earliest_line, max(l.created_at) as latest_line, count(*) as n
  from main.payment_voucher_line l
  where split_part(l.ref, '|', 1) in ('drinks','tips')
`);
console.log('commission lines were written between:');
console.log(JSON.stringify(lines.rows ?? lines, null, 2));
process.exit(0);
