// Is special_service a live feature or dead scaffolding? READ-ONLY.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const t = await db.execute(sql`select table_name from information_schema.tables where table_schema='main' and table_name like '%special%'`);
console.log('tables:', JSON.stringify((t.rows ?? t).map((x:any)=>x.table_name)));
const r = await db.execute(sql`
  select status, count(*)::int as n, max(created_at)::text as newest
  from main.special_service group by status order by 2 desc`);
const rows = (r.rows ?? r) as any[];
console.log('rows:', rows.length ? JSON.stringify(rows) : 'NONE — table is empty');
const total = ((await db.execute(sql`select count(*)::int as n from main.special_service`)).rows as any[])[0].n;
console.log('total special_service rows:', total);
process.exit(0);
