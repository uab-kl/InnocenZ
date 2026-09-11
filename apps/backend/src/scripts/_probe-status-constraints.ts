/** Does anything in the DB refuse a new membership status value? READ-ONLY. */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '@/db/index';
const rows = (r: unknown): Record<string, unknown>[] =>
  ((r as { rows?: Record<string, unknown>[] }).rows ?? (r as Record<string, unknown>[]));
async function main() {
  const c = rows(await db.execute(sql`
    select conname, pg_get_constraintdef(oid) as def
      from pg_constraint
     where conrelid in ('main.agency_user'::regclass, 'main.outlet_user'::regclass)
       and contype = 'c'`));
  console.log(`CHECK constraints on the membership tables: ${c.length}`);
  for (const r of c) console.log(`  ${r.conname} => ${r.def}`);
  const t = rows(await db.execute(sql`
    select table_name, data_type, character_maximum_length as len
      from information_schema.columns
     where table_schema = 'main' and column_name = 'status'
       and table_name in ('agency_user', 'outlet_user')`));
  for (const r of t) console.log(`  column ${r.table_name}.status = ${r.data_type}(${r.len})`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
