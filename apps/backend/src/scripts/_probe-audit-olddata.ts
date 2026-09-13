/** READ-ONLY. Which audited entities actually record what they changed FROM? */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const rows = await db.execute(sql`
  select entity,
         count(*) filter (where action like 'UPDATE%')                         as updates,
         count(*) filter (where action like 'UPDATE%' and old_data is not null) as with_old,
         count(*) filter (where action like 'UPDATE%' and old_data is null)     as without_old
  from main.audit_logs
  where action like 'UPDATE%'
  group by entity order by count(*) desc limit 20
`);
console.log(JSON.stringify(rows.rows ?? rows, null, 2));
process.exit(0);
