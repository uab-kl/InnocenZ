/** READ-ONLY. Which outlets actually have floor-sales rows, and how many nights. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const rows = await db.execute(sql`
  select o.id, o.name, count(distinct s.shift_date) as nights
  from main.shift_sale ss
  join main.shift s on s.id = ss.shift_id
  join main.outlet o on o.id = s.outlet_id
  group by o.id, o.name
  order by nights desc
  limit 10
`);
console.log(JSON.stringify(rows.rows ?? rows, null, 2));
process.exit(0);
