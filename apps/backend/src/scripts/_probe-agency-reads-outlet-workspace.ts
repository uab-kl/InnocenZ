/**
 * READ-ONLY. Answers "does the row the agency portal now reads actually hold the
 * rates the outlet saved, and which agency account can read it?"
 *
 * Prints every outlet with its onboarding agency (the directory the new
 * `useAgencyOutletWorkspace` hook resolves a name -> id through), that outlet's
 * saved workspace tier rates, and the agency operator accounts that can log in
 * to see them. Nothing is written.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-agency-reads-outlet-workspace.ts
 */
import '@/env.js'; // FIRST — the pg pool builds from unset credentials otherwise
import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';

async function main() {
  const outlets = await db.execute(sql`
    select o.id, o.name, o.onboarded_by_agency_id, a.name as agency_name, a.agency_code
    from main.outlet o
    left join main.agency a on a.id = o.onboarded_by_agency_id
    order by o.name
  `);
  console.log('OUTLETS:');
  for (const r of outlets.rows) console.log(' ', JSON.stringify(r));

  const ws = await db.execute(sql`
    select o.name as outlet_name, w.outlet_id, w.base_pay_per_hour, w.drink_pct,
           w.tip_pct, w.updated_at
    from main.outlet_workspace w
    join main.outlet o on o.id = w.outlet_id
    order by w.updated_at desc
  `);
  console.log('\nWORKSPACE ROWS:');
  for (const r of ws.rows) console.log(' ', JSON.stringify(r));

  const rates = await db.execute(sql`
    select o.name as outlet_name, t.*
    from main.outlet_tier_rate t
    join main.outlet_workspace w on w.id = t.workspace_id
    join main.outlet o on o.id = w.outlet_id
    where o.name = 'Testing 2'
    order by t.sort_order
  `);
  console.log('\nTIER RATES:');
  for (const r of rates.rows) console.log(' ', JSON.stringify(r));

  const owners = await db.execute(sql`
    select a.name as agency_name, u.email, m.sub_role, m.status
    from main.agency_member m
    join main.agency a on a.id = m.agency_id
    join main."user" u on u.id = m.user_id
    where m.sub_role <> 'pr'
    order by a.name, u.email
  `);
  console.log('\nAGENCY OPERATOR ACCOUNTS:');
  for (const r of owners.rows) console.log(' ', JSON.stringify(r));

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
