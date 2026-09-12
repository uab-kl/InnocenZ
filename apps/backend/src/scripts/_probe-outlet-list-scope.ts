/**
 * `GET /outlet` had NO tenant term — any token got every active venue with its
 * address, SSM number, business licence and geo-fence pin.
 *
 * This checks BOTH halves: the leak is closed, AND the agency screens that call
 * it with no scoping parameter still receive the venues they legitimately serve
 * (Roster, auto-assign and roster-slots all call `fetchOutlets({pageSize:500})`).
 * READ-ONLY.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const { JwtControllerClass } = await import('@/features/jwt/jwt.controller');
const jwt = new JwtControllerClass();
const BASE = `http://localhost:${process.env.BACKEND_PORT ?? 7777}/api/v1`;
const tok = (e: string) => jwt.generateAccessToken({ loginMethod: 'email', loginCriteria: e } as never);

const totalActive = ((await db.execute(sql`
  select count(*)::int as n from main.outlet where status = 'active'`)).rows as any[])[0].n;
console.log(`active venues on the platform: ${totalActive}`);

let fail = 0;
const say = (label: string, ok: boolean, detail: string) => {
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} ${detail}`);
};

// --- an OUTLET member sees only their own venues -----------------------------
const om = ((await db.execute(sql`
  select u.email, ou.outlet_id from main.outlet_user ou join main."user" u on u.id = ou.user_id
  where ou.status='active' and u.email is not null
    and not exists (select 1 from main.agency_user au where au.user_id=u.id and au.status='active')
    and not exists (select 1 from main.user_role ur join main.role r on r.id=ur.role_id
                    where ur.user_id=u.id and r.role_name='admin')
  limit 1`)).rows as any[])[0];
if (om) {
  const mine = ((await db.execute(sql`
    select count(distinct outlet_id)::int as n from main.outlet_user
    where user_id=(select id from main."user" where email=${om.email}) and status='active'`)).rows as any[])[0].n;
  const r = await fetch(`${BASE}/outlet?page=1&pageSize=500`, {
    headers: { Authorization: `Bearer ${tok(om.email)}`, 'x-org-id': om.outlet_id, 'x-org-kind': 'outlet' },
  });
  const b = (await r.json()) as any;
  const got = (b.data ?? []).length;
  say('outlet member listing venues', got === mine && got < totalActive, `got ${got}, owns ${mine}, platform has ${totalActive}`);
}

// --- an AGENCY member sees the venues that agency may staff ------------------
// An agency that ACTUALLY has partnerships — one with none correctly returns
// zero, which proves nothing about whether the screens still work.
const am = ((await db.execute(sql`
  select u.email, au.agency_id from main.agency_user au join main."user" u on u.id = au.user_id
  where au.status='active' and u.email is not null
    and not exists (select 1 from main.user_role ur join main.role r on r.id=ur.role_id
                    where ur.user_id=u.id and r.role_name='admin')
    and exists (select 1 from main.agency_outlet ao join main.outlet o on o.id = ao.outlet_id
                where ao.agency_id = au.agency_id and o.status='active')
  limit 1`)).rows as any[])[0];
if (am) {
  const linked = ((await db.execute(sql`
    select count(distinct ao.outlet_id)::int as n from main.agency_outlet ao
    join main.outlet o on o.id = ao.outlet_id
    where ao.agency_id = ${am.agency_id} and o.status='active'`)).rows as any[])[0].n;
  // No scoping parameter — exactly what Roster / auto-assign / roster-slots send.
  const r = await fetch(`${BASE}/outlet?page=1&pageSize=500`, {
    headers: { Authorization: `Bearer ${tok(am.email)}`, 'x-org-id': am.agency_id, 'x-org-kind': 'agency' },
  });
  const b = (await r.json()) as any;
  const got = (b.data ?? []).length;
  say('agency member, NO scoping param (the 3 screens)', got > 0 && got <= linked, `got ${got}, agency is linked to ${linked}, platform has ${totalActive}`);
  say('agency does NOT receive the whole platform', got < totalActive, `${got} < ${totalActive}`);
}

// --- admin still sees everything --------------------------------------------
{
  const r = await fetch(`${BASE}/outlet?page=1&pageSize=500`, {
    headers: { Authorization: `Bearer ${tok(process.env.DEFAULT_ADMIN_EMAIL ?? 'uab.innocenz@gmail.com')}` },
  });
  const b = (await r.json()) as any;
  say('admin still lists every venue', (b.data ?? []).length >= totalActive, `got ${(b.data ?? []).length}`);
}
console.log(fail ? `\n${fail} FAILED` : '\nthe venue list is scoped, and the agency screens still work');
process.exit(fail ? 1 : 0);
