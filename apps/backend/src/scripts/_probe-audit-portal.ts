// Did migration 0164 actually RUN, or was it only ledgered? (known trap)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env'),
});

const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const col = await db.execute(sql`
  select column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema = 'main' and table_name = 'audit_logs' and column_name = 'portal'
`);
console.log('COLUMN:', JSON.stringify(col.rows ?? col));

const idx = await db.execute(sql`
  select indexname from pg_indexes
  where schemaname = 'main' and tablename = 'audit_logs' and indexname = 'audit_portal_idx'
`);
console.log('INDEX:', JSON.stringify(idx.rows ?? idx));

const ledger = await db.execute(sql`
  select count(*)::int as n from drizzle.__drizzle_migrations
`);
console.log('LEDGER ROWS:', JSON.stringify(ledger.rows ?? ledger));

const byPortal = await db.execute(sql`
  select coalesce(portal, '(null)') as portal, count(*)::int as n
  from main.audit_logs group by 1 order by 2 desc
`);
console.log('BY PORTAL:', JSON.stringify(byPortal.rows ?? byPortal));

const byRole = await db.execute(sql`
  select coalesce(role, '(null)') as role, count(*)::int as n
  from main.audit_logs group by 1 order by 2 desc limit 15
`);
console.log('BY ROLE:', JSON.stringify(byRole.rows ?? byRole));

process.exit(0);
