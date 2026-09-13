/**
 * READ-ONLY. Exercise the last-owner guard against every real account.
 *
 * Calls the guard function directly — no HTTP, no write — and prints who it
 * would refuse. The correlated NOT EXISTS in it is the part worth proving:
 * a wrong alias there would silently return nothing and the guard would pass
 * everybody, which reads exactly like "no problem found".
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const { orgsLosingTheirLastOwner } = await import('@/features/user/sole-owner-guard');

const owners = await db.execute(sql`
  select distinct u.id, u.email
  from main."user" u
  where exists (select 1 from main.agency_user au where au.user_id = u.id and au.sub_role = 'owner' and au.status = 'active')
     or exists (select 1 from main.outlet_user ou where ou.user_id = u.id and ou.sub_role = 'owner' and ou.status = 'active')
  order by u.email
`);

let guarded = 0;
for (const r of (owners.rows ?? owners) as Array<Record<string, string>>) {
  const orgs = await orgsLosingTheirLastOwner(r.id!);
  if (orgs.length > 0) guarded += 1;
  console.log(`${r.email} -> ${orgs.length ? 'REFUSED: ' + orgs.join(', ') : 'allowed'}`);
}

// A non-owner must come back clean. A guard that refuses everybody is as broken
// as one that refuses nobody, and only this direction proves it.
const nonOwner = await db.execute(sql`
  select u.id, u.email from main."user" u
  where not exists (select 1 from main.agency_user au where au.user_id = u.id and au.sub_role = 'owner')
    and not exists (select 1 from main.outlet_user ou where ou.user_id = u.id and ou.sub_role = 'owner')
  limit 3
`);
for (const r of (nonOwner.rows ?? nonOwner) as Array<Record<string, string>>) {
  const orgs = await orgsLosingTheirLastOwner(r.id!);
  console.log(`[non-owner] ${r.email} -> ${orgs.length ? 'REFUSED (WRONG): ' + orgs.join(', ') : 'allowed (correct)'}`);
}
console.log(`\n${guarded} of ${(owners.rows ?? owners).length} owner accounts would now be refused.`);
process.exit(0);
