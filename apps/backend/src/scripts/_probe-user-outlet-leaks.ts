/**
 * The two reads tightened on 13 Sep: GET /user (+ /:id) and GET /outlet/:id.
 * Both were role-gated with no tenant term. READ-ONLY — every request a GET.
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
const tok = (e: string) => jwt.generateAccessToken({ loginMethod:'email', loginCriteria:e } as never);
let fail = 0;
const say = (l: string, ok: boolean, d: string) => { if(!ok) fail++; console.log(`${ok?'PASS':'FAIL'}  ${l.padEnd(54)} ${d}`); };

const admin = process.env.DEFAULT_ADMIN_EMAIL ?? 'uab.innocenz@gmail.com';
const ag = ((await db.execute(sql`
  select u.email, au.agency_id from main.agency_user au join main."user" u on u.id=au.user_id
  where au.status='active' and u.email is not null
    and not exists (select 1 from main.user_role ur join main.role r on r.id=ur.role_id
                    where ur.user_id=u.id and r.role_name='admin') limit 1`)).rows as any[])[0];
const ou = ((await db.execute(sql`
  select u.email, ou.outlet_id, u.id as user_id from main.outlet_user ou join main."user" u on u.id=ou.user_id
  where ou.status='active' and u.email is not null
    and not exists (select 1 from main.user_role ur join main.role r on r.id=ur.role_id
                    where ur.user_id=u.id and r.role_name='admin') limit 1`)).rows as any[])[0];
const otherOutlet = ((await db.execute(sql`
  select id, name from main.outlet where id <> ${ou.outlet_id} and status='active' limit 1`)).rows as any[])[0];

// --- GET /user ---------------------------------------------------------------
for (const [who, email] of [['agency', ag.email], ['outlet', ou.email]] as const) {
  const r = await fetch(`${BASE}/user?pageSize=500`, { headers: { Authorization:`Bearer ${tok(email)}` } });
  say(`${who} listing every account`, r.status === 403, `http=${r.status} (want 403)`);
}
{
  const r = await fetch(`${BASE}/user?pageSize=5`, { headers: { Authorization:`Bearer ${tok(admin)}` } });
  say('admin still lists accounts', r.status === 200, `http=${r.status}`);
}
// A member reading their OWN record must still work (canReadUser exempts self).
{
  const r = await fetch(`${BASE}/user/${ou.user_id}`, { headers: { Authorization:`Bearer ${tok(ou.email)}` } });
  say('a member reading their OWN record', r.status === 200, `http=${r.status}`);
}

// --- GET /outlet/:id ---------------------------------------------------------
{
  const r = await fetch(`${BASE}/outlet/${otherOutlet.id}`, {
    headers: { Authorization:`Bearer ${tok(ou.email)}`, 'x-org-id':ou.outlet_id, 'x-org-kind':'outlet' } });
  say(`outlet member reading a RIVAL venue`, r.status === 403, `http=${r.status} (want 403)`);
}
{
  const r = await fetch(`${BASE}/outlet/${ou.outlet_id}`, {
    headers: { Authorization:`Bearer ${tok(ou.email)}`, 'x-org-id':ou.outlet_id, 'x-org-kind':'outlet' } });
  say('outlet member reading their OWN venue', r.status === 200, `http=${r.status}`);
}
{
  const r = await fetch(`${BASE}/outlet/${otherOutlet.id}`, { headers: { Authorization:`Bearer ${tok(admin)}` } });
  say('admin reading any venue', r.status === 200, `http=${r.status}`);
}
console.log(fail ? `\n${fail} FAILED` : '\nboth reads are scoped, and nothing legitimate is refused');
process.exit(fail ? 1 : 0);
