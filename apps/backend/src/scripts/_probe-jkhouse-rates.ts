/** READ-ONLY. What "re-tagging Havoc as a drink" would do to a PR's commission at JK House. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const rows = await db.execute(sql`
  select otr.tier, otr.drink_pct, otr.happy_hour_drink_pct, otr.tip_pct
  from main.outlet_tier_rate otr
  join main.outlet o on o.id = otr.outlet_id
  where o.name = 'JK House' order by otr.tier
`);
console.log(JSON.stringify(rows.rows ?? rows, null, 2));
process.exit(0);
