/**
 * READ-ONLY. Can a person active at TWO venues read BOTH venues' shifts?
 *
 * `jinkgan48@` is active at two outlets — the first such account on this
 * database, and the 10 Sep note that parked the oldest-membership fallback as
 * "unverifiable by construction" predates them. If a resource-id route resolves
 * the acting org as the OLDEST membership, this account 404s on its own second
 * venue.
 *
 * Only GETs. Nothing is written.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const { JwtControllerClass } = await import('@/features/jwt/jwt.controller');

const EMAIL = 'jinkgan48@gmail.com';
const token = new JwtControllerClass().generateAccessToken({
  loginMethod: 'email',
  loginCriteria: EMAIL,
} as never);

const memberships = (await db.execute(sql`
  select o.id, o.name, ou.sub_role, ou.created_at
  from main.outlet_user ou join main.outlet o on o.id = ou.outlet_id
  join main."user" u on u.id = ou.user_id
  where u.email = ${EMAIL} and ou.status = 'active'
  order by ou.created_at
`)).rows as Array<Record<string, string>>;
console.log(`${EMAIL} is active at:`);
for (const m of memberships) console.log(`  ${m.name}  (${m.sub_role}, joined ${m.created_at})`);

// One shift at each venue, so each membership has something to ask for.
for (const m of memberships) {
  const [shift] = (await db.execute(sql`
    select id, shift_date from main.shift where outlet_id = ${m.id}
    order by shift_date desc limit 1
  `)).rows as Array<Record<string, string>>;
  if (!shift) {
    console.log(`\n${m.name}: no shift to test with`);
    continue;
  }
  const bare = await fetch(`http://localhost:7777/api/v1/shift/${shift.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const scoped = await fetch(`http://localhost:7777/api/v1/shift/${shift.id}`, {
    headers: { Authorization: `Bearer ${token}`, 'x-org-id': m.id },
  });
  console.log(`\n${m.name} (shift ${shift.shift_date})`);
  console.log(`  no x-org-id : ${bare.status}`);
  console.log(`  x-org-id set: ${scoped.status}`);
}
process.exit(0);
