import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const r = await db.execute(sql`
  select v.status, count(*)::int as n, min(a.name) as an, min(v.week_start::text) as wk
  from main.payment_voucher v left join main.agency a on a.id = v.agency_id
  group by v.status order by 2 desc`);
for (const x of (r.rows ?? r) as any[]) console.log(`${String(x.status).padEnd(12)} n=${String(x.n).padEnd(4)} e.g. ${x.an} week ${x.wk}`);
process.exit(0);
