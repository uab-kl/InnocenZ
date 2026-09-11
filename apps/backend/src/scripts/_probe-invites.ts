/** Outstanding org-member invites. READ-ONLY. */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '@/db/index';
const rows = (r: unknown): Record<string, unknown>[] =>
  ((r as { rows?: Record<string, unknown>[] }).rows ?? (r as Record<string, unknown>[]));
async function main() {
  const t = rows(await db.execute(sql`
    select table_name from information_schema.tables
     where table_schema = 'main' and table_name like '%invite%'`));
  console.log('invite tables:', t.map((x) => x.table_name).join(', ') || '(none)');
  for (const x of t) {
    const r = rows(await db.execute(sql`
      select * from main.${sql.identifier(String(x.table_name))}
       order by created_at desc limit 5`));
    console.log(`\n=== ${x.table_name}: ${r.length} recent ===`);
    for (const row of r) console.log(' ', JSON.stringify(row));
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
