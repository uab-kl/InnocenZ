/**
 * READ-ONLY. Finds the accounts needed to fire the new refusals live.
 *
 * A refusal writes nothing, so every guard added by the outlet-workspace scope
 * fix and the pr-links self-read fix can be proven against the shared DB for
 * free. This only reports WHICH accounts to sign in as; it changes nothing.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-guard-fixtures.ts
 */
import '@/env.js'; // FIRST — the pg pool builds from unset credentials otherwise
import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';

async function main() {
  const prs = await db.execute(sql`
    select u.id, u.email, u.phone_num, count(ap.id) as agency_links
    from main."user" u
    join main.agency_pr ap on ap.user_id = u.id
    group by u.id, u.email, u.phone_num
    having count(ap.id) >= 1
    order by count(ap.id) desc
    limit 5
  `);
  console.log(
    'PRs WITH agency_pr LINKS (fix 3 — a self-read must return these):',
  );
  for (const r of prs.rows) console.log(' ', JSON.stringify(r));

  const outletMembers = await db.execute(sql`
    select u.id as user_id, u.email, ou.outlet_id, o.name as outlet_name, ou.status
    from main.outlet_user ou
    join main."user" u on u.id = ou.user_id
    join main.outlet o on o.id = ou.outlet_id
    where ou.status = 'active'
    order by o.name
    limit 8
  `);
  console.log(
    '\nACTIVE OUTLET MEMBERS (fix 2 — each may touch ONLY their own outlet):',
  );
  for (const r of outletMembers.rows) console.log(' ', JSON.stringify(r));

  const workspaces = await db.execute(sql`
    select o.id, o.name from main.outlet_workspace w
    join main.outlet o on o.id = w.outlet_id order by o.name
  `);
  console.log(
    '\nOUTLETS WITH A WORKSPACE (targets for the cross-venue attempt):',
  );
  for (const r of workspaces.rows) console.log(' ', JSON.stringify(r));

  const agencyMembers = await db.execute(sql`
    select u.id as user_id, u.email, au.agency_id, a.name as agency_name, au.status
    from main.agency_user au
    join main."user" u on u.id = au.user_id
    join main.agency a on a.id = au.agency_id
    order by au.status, a.name
    limit 8
  `);
  console.log(
    '\nAGENCY MEMBERS (any status <> active — fix 1 must now refuse those):',
  );
  for (const r of agencyMembers.rows) console.log(' ', JSON.stringify(r));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
