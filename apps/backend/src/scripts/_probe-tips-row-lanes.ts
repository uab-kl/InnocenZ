/**
 * READ-ONLY. Does the seeded Tips row reach EVERY lane, not just the owner?
 *
 * Mints a session per lane exactly as `_probe-mint-session.ts` does, then GETs
 * the venue's workspace over HTTP and reports what that lane can see: whether a
 * tips row came back, and which category it carries. A lane that is refused is
 * reported as its status code — a 403 is an answer, not a failure of this probe.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-tips-row-lanes.ts
 *
 * Writes nothing. Needs the backend running on 7777.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env'),
});
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const { JwtControllerClass } = await import('@/features/jwt/jwt.controller');
const jwt = new JwtControllerClass();

const API = 'http://localhost:7777/api/v1';

/** Admin accounts are excluded from org lanes, so a lane really is that lane. */
const NOT_ADMIN = sql`not exists (
  select 1 from main.user_role ur join main.role rr on rr.id = ur.role_id
  where ur.user_id = u.id and rr.role_name = 'admin')`;

/**
 * Each OUTLET lane is asked about ITS OWN venue. Pointing them all at one venue
 * would collect refusals that say nothing about the tips row — an outlet
 * finance head is correctly refused another venue's workspace, and that 403
 * would be a fact about scoping, not about this change.
 */
const outletLanes = (
  await db.execute(sql`
    select distinct on (ou.sub_role)
           'outlet:' || ou.sub_role as lane, u.email, o.id as outlet_id, o.name as venue
    from main.outlet_user ou
    join main."user" u on u.id = ou.user_id
    join main.outlet o on o.id = ou.outlet_id
    where ou.status = 'active' and u.email is not null and ${NOT_ADMIN}
    order by ou.sub_role, o.name
  `)
).rows as { lane: string; email: string; outlet_id: string; venue: string }[];

// Agency and admin lanes read SOMEBODY ELSE'S venue — one fixed venue is right
// for them, because that is the cross-org read being tested.
const [shared] = (
  await db.execute(sql`
    select o.id, o.name from main.outlet o where o.name = 'Velvet 23' limit 1
  `)
).rows as { id: string; name: string }[];

const agencyLanes = (
  await db.execute(sql`
    select distinct on (au.sub_role) 'agency:' || au.sub_role as lane, u.email
    from main.agency_user au
    join main."user" u on u.id = au.user_id
    where au.status = 'active' and u.email is not null and ${NOT_ADMIN}
    order by au.sub_role, u.email
  `)
).rows as { lane: string; email: string }[];

const admin = (
  await db.execute(sql`
    select u.email from main."user" u
    join main.user_role ur on ur.user_id = u.id
    join main.role r on r.id = ur.role_id
    where r.role_name = 'admin' and u.email is not null limit 1
  `)
).rows as { email: string }[];

const lanes = [
  ...outletLanes,
  ...agencyLanes.map((a) => ({ ...a, outlet_id: shared!.id, venue: shared!.name })),
  ...admin.map((a) => ({
    lane: 'admin',
    email: a.email,
    outlet_id: shared!.id,
    venue: shared!.name,
  })),
];

if (lanes.length === 0) throw new Error('no lanes found — the QUERY is wrong, not the data');

const out: Record<string, unknown>[] = [];

for (const { lane, email, outlet_id, venue } of lanes) {
  const token = jwt.generateAccessToken({
    loginMethod: 'email',
    loginCriteria: email,
  } as never);
  const res = await fetch(`${API}/outlet-workspace/${outlet_id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json().catch(() => null)) as {
    data?: { drinkMenu?: { slug: string; name: string; category: string }[] };
  } | null;
  const menu = body?.data?.drinkMenu ?? [];
  const tips = menu.find(
    (m) =>
      m.slug === 'tips' || m.category === 'tip' || m.name.toLowerCase() === 'tips',
  );
  out.push({
    lane,
    venue,
    status: res.status,
    menuRows: menu.length,
    tipsRow: tips ? tips.name : '—',
    category: tips?.category ?? '—',
  });
}

console.table(out);
process.exit(0);
