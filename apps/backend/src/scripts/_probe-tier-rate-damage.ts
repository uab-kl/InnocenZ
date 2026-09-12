import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const t = await db.execute(sql`select table_name from information_schema.tables where table_schema='main' and table_name like '%tier%'`);
console.log('tier tables:', JSON.stringify((t.rows ?? t).map((x:any)=>x.table_name)));
const r = await db.execute(sql`
  select o.name, count(*)::int as rows,
         max(tr.updated_at) as last_update,
         bool_or(tr.updated_at > now() - interval '40 minutes') as touched
  from main.outlet_tier_rate tr join main.outlet o on o.id = tr.outlet_id
  group by o.name order by touched desc nulls last, o.name
`);
for (const x of (r.rows ?? r) as any[]) {
  console.log(`${String(x.name).padEnd(26)} rows=${String(x.rows).padEnd(4)} touchedByProbe=${x.touched} last=${x.last_update}`);
}
process.exit(0);
