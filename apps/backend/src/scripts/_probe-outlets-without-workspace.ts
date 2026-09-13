/**
 * READ-ONLY. Does any venue lack an `outlet_workspace` row?
 *
 * That is the only case where the web's `DEFAULT_OUTLET_WORKSPACE` renders — a
 * demo fixture named "Velvet 23" carrying RM 40/50/55/65/80 and 0% commission.
 * A fallback indistinguishable from a configured rate card is worse than an
 * empty state: nobody reports it, because nothing looks wrong.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const rows = await db.execute(sql`
  select o.name, o.status,
         (ws.id is not null) as has_workspace,
         coalesce(tier_count.n, 0) as tier_rates
  from main.outlet o
  left join main.outlet_workspace ws on ws.outlet_id = o.id
  left join lateral (
    select count(*) as n from main.outlet_tier_rate t where t.outlet_id = o.id
  ) tier_count on true
  order by has_workspace, o.name
`);
console.log(JSON.stringify(rows.rows ?? rows, null, 2));
process.exit(0);
