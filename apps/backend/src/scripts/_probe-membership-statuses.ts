/**
 * Every distinct membership status in the live database, and how many rows.
 *
 * Importers/callers: none — standalone probe, run by hand. READ-ONLY.
 * Owner's instruction: "declined is not deactivate declined is cannot be the
 * user of an orgs, deactivate trigger when there is already a orgs member, but
 * remove by the owner".
 *
 *   cd apps/backend && npx tsx --tsconfig tsconfig.json src/scripts/_probe-membership-statuses.ts
 */
import 'dotenv/config';

import { sql } from 'drizzle-orm';
import { db } from '@/db/index';

const rows = (r: unknown): Record<string, unknown>[] =>
  ((r as { rows?: Record<string, unknown>[] }).rows ?? (r as Record<string, unknown>[]));

async function main() {
  const counts = rows(
    await db.execute(sql`
      select kind, status, count(*)::int as n,
             sum(case when member_code like 'INNPND%' then 1 else 0 end)::int as placeholder
        from (
          select 'agency' as kind, status, member_code from main.agency_user
          union all
          select 'outlet', status, member_code from main.outlet_user
        ) x
       group by kind, status
       order by kind, status`),
  );
  console.log('\n=== membership statuses in the live database ===');
  console.log(' kind   | status   | rows | of which still INNPND (never approved)');
  for (const r of counts) {
    console.log(
      ` ${String(r.kind).padEnd(6)} | ${String(r.status).padEnd(8)} | ${String(r.n).padStart(4)} | ${r.placeholder}`,
    );
  }

  /*
   * The rows migration 0162 would have to reclassify: not active, never
   * approved (so they hold a placeholder id) => they were DECLINED, not
   * removed. Anything else that is inactive was a real member who left.
   */
  const declined = rows(
    await db.execute(sql`
      select 'agency' as kind, a.name as org, u.email, au.status, au.member_code
        from main.agency_user au
        join main.agency a on a.id = au.agency_id
        join main."user" u on u.id = au.user_id
       where au.status <> 'active' and au.status <> 'pending'
         and au.member_code like 'INNPND%'
      union all
      select 'outlet', o.name, u.email, ou.status, ou.member_code
        from main.outlet_user ou
        join main.outlet o on o.id = ou.outlet_id
        join main."user" u on u.id = ou.user_id
       where ou.status <> 'active' and ou.status <> 'pending'
         and ou.member_code like 'INNPND%'`),
  );
  console.log(`\n=== rows that are DECLINED applicants (would become 'rejected'): ${declined.length} ===`);
  for (const r of declined) {
    console.log(` ${r.kind} | ${r.org} | ${r.email} | status=${r.status} | ${r.member_code}`);
  }

  const removed = rows(
    await db.execute(sql`
      select 'agency' as kind, a.name as org, u.email, au.member_code
        from main.agency_user au
        join main.agency a on a.id = au.agency_id
        join main."user" u on u.id = au.user_id
       where au.status = 'inactive' and au.member_code not like 'INNPND%'
      union all
      select 'outlet', o.name, u.email, ou.member_code
        from main.outlet_user ou
        join main.outlet o on o.id = ou.outlet_id
        join main."user" u on u.id = ou.user_id
       where ou.status = 'inactive' and ou.member_code not like 'INNPND%'`),
  );
  console.log(`\n=== rows that are REMOVED members (stay 'inactive'): ${removed.length} ===`);
  for (const r of removed) console.log(` ${r.kind} | ${r.org} | ${r.email} | ${r.member_code}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
