/**
 * READ-ONLY. How many organisations have exactly ONE active owner?
 *
 * Those are the accounts that, if disabled by an admin or self-deleted, leave an
 * organisation with nobody who can approve a member, change the payment method
 * or pay a bill — all three are owner-only by the owner's own rules — and so no
 * way back in.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const agencies = await db.execute(sql`
  select a.name, count(*) filter (where au.status = 'active' and au.sub_role = 'owner') as active_owners
  from main.agency a
  left join main.agency_user au on au.agency_id = a.id
  group by a.id, a.name
  order by active_owners asc, a.name
`);
console.log('agencies by active owner count:', JSON.stringify(agencies.rows ?? agencies, null, 2));

const outlets = await db.execute(sql`
  select o.name, count(*) filter (where ou.status = 'active' and ou.sub_role = 'owner') as active_owners
  from main.outlet o
  left join main.outlet_user ou on ou.outlet_id = o.id
  group by o.id, o.name
  order by active_owners asc, o.name
`);
console.log('outlets by active owner count:', JSON.stringify(outlets.rows ?? outlets, null, 2));
process.exit(0);
