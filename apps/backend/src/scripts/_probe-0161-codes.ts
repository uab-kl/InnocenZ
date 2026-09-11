/**
 * Did 0161 land? Placeholders on pending rows, real ids untouched elsewhere.
 *
 * Importers/callers: none — standalone probe, run by hand.
 * Affected API: none. READ-ONLY.
 * Owner's instruction: "fix the member code , use the migration 0161".
 *
 *   cd apps/backend && npx tsx --tsconfig tsconfig.json src/scripts/_probe-0161-codes.ts
 */
import 'dotenv/config';

import { sql } from 'drizzle-orm';
import { db } from '@/db/index';

const rows = (r: unknown): Record<string, unknown>[] =>
  ((r as { rows?: Record<string, unknown>[] }).rows ?? (r as Record<string, unknown>[]));

async function main() {
  const all = rows(
    await db.execute(sql`
      select 'agency' as kind, a.name as org, au.status, au.member_code, u.email
        from main.agency_user au
        join main.agency a on a.id = au.agency_id
        join main."user" u on u.id = au.user_id
      union all
      select 'outlet', o.name, ou.status, ou.member_code, u.email
        from main.outlet_user ou
        join main.outlet o on o.id = ou.outlet_id
        join main."user" u on u.id = ou.user_id
      order by 3, 4`),
  );
  const pend = all.filter((r) => r.status !== 'active');
  const live = all.filter((r) => r.status === 'active');
  console.log(`\n=== WAITING rows (${pend.length}) — every one must be INNPND ===`);
  for (const r of pend) {
    const ok = String(r.member_code).startsWith('INNPND') ? 'OK ' : '!! ';
    console.log(` ${ok}${r.kind} | ${r.org} | ${r.member_code} | ${r.email}`);
  }
  const strays = live.filter((r) => String(r.member_code).startsWith('INNPND'));
  console.log(`\n=== ACTIVE rows (${live.length}) — none may be INNPND ===`);
  console.log(strays.length === 0 ? ' OK  no active row holds a placeholder' : ' !! ' + JSON.stringify(strays));

  const def = rows(
    await db.execute(sql`
      select table_name, column_default
        from information_schema.columns
       where table_schema = 'main' and column_name = 'member_code'
       order by table_name`),
  );
  console.log('\n=== column defaults ===');
  for (const d of def) console.log(` ${d.table_name} -> ${d.column_default}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
