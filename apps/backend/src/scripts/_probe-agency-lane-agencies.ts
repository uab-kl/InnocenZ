/**
 * READ-ONLY. Which AGENCY does each agency lane's fixture account belong to?
 *
 * Asked because `_probe-tips-row-lanes.ts` showed agency:owner refused (403) on
 * a venue its own director could read (200). Two very different explanations:
 * correct scoping (the accounts are at different agencies, only one of which
 * works that venue), or a real hole. This says which, before anything is
 * claimed either way.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-agency-lane-agencies.ts
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env'),
});
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const lanes = await db.execute(sql`
  select distinct on (au.sub_role) au.sub_role, u.email, a.name as agency
  from main.agency_user au
  join main."user" u on u.id = au.user_id
  join main.agency a on a.id = au.agency_id
  where au.status = 'active' and u.email is not null
  order by au.sub_role, u.email
`);
console.log('one fixture account per agency lane:');
console.table(lanes.rows ?? lanes);

// Which agencies actually work Velvet 23 — by the shifts on the books, since
// that is what an agency's read of a venue is scoped by.
const worked = await db.execute(sql`
  select a.name as agency, count(*) as shifts
  from main.shift s
  join main.agency a on a.id = s.agency_id
  join main.outlet o on o.id = s.outlet_id
  where o.name = 'Velvet 23'
  group by a.name order by 2 desc
`);
console.log('\nagencies with shifts at Velvet 23:');
console.table(worked.rows ?? worked);
process.exit(0);
