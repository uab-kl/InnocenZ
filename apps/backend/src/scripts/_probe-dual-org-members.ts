/**
 * READ-ONLY. Does ANY account hold two ACTIVE memberships of the same org kind?
 *
 * This is the fact that decides whether the six oldest-agency-fallback routes
 * are fixable: with no such account, neither the defect nor a fix for it can be
 * exercised, and a change would be unverifiable by construction. Re-checked
 * rather than taken from the 10 Sep note.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const agencies = await db.execute(sql`
  select u.email, count(*) as active_agencies
  from main.agency_user au join main."user" u on u.id = au.user_id
  where au.status = 'active'
  group by u.id, u.email having count(*) > 1 order by count(*) desc
`);
console.log('accounts active at 2+ AGENCIES:', JSON.stringify(agencies.rows ?? agencies, null, 2));

const outlets = await db.execute(sql`
  select u.email, count(*) as active_outlets
  from main.outlet_user ou join main."user" u on u.id = ou.user_id
  where ou.status = 'active'
  group by u.id, u.email having count(*) > 1 order by count(*) desc
`);
console.log('accounts active at 2+ OUTLETS:', JSON.stringify(outlets.rows ?? outlets, null, 2));

// PRs on two agency rosters — a different table, and the one that HAS had
// multi-membership before (the cross-agency voucher work).
const prs = await db.execute(sql`
  select u.email, count(*) as agencies
  from main.agency_pr ap join main."user" u on u.id = ap.user_id
  where ap.approve_status = 'approved'
  group by u.id, u.email having count(*) > 1 order by count(*) desc
`);
console.log('PRs approved at 2+ agencies:', JSON.stringify(prs.rows ?? prs, null, 2));
process.exit(0);
