/**
 * The agency's id->name map must cover venues whose partnership ENDED (so the
 * Roster week grid never prints a raw UUID), while still never returning the
 * whole platform. READ-ONLY.
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

const totalActive = ((await db.execute(sql`select count(*)::int as n from main.outlet where status='active'`)).rows as any[])[0].n;

// An agency that has at least one ENDED partnership, if one exists.
const am = ((await db.execute(sql`
  select u.email, au.agency_id,
    (select count(distinct ao.outlet_id)::int from main.agency_outlet ao
       join main.outlet o on o.id=ao.outlet_id
      where ao.agency_id=au.agency_id and o.status='active') as ever_linked,
    (select count(distinct ao.outlet_id)::int from main.agency_outlet ao
       join main.outlet o on o.id=ao.outlet_id
      where ao.agency_id=au.agency_id and o.status='active' and ao.approve_status='ended') as ended
  from main.agency_user au join main."user" u on u.id=au.user_id
  where au.status='active' and u.email is not null
    and not exists (select 1 from main.user_role ur join main.role r on r.id=ur.role_id
                    where ur.user_id=u.id and r.role_name='admin')
  order by ended desc, ever_linked desc limit 1`)).rows as any[])[0];

const tok = jwt.generateAccessToken({ loginMethod:'email', loginCriteria: am.email } as never);
const h = { Authorization:`Bearer ${tok}`, 'x-org-id': am.agency_id, 'x-org-kind':'agency' };

// No scoping param — exactly what Roster / auto-assign / roster-slots send.
const nameMap = await (await fetch(`${BASE}/outlet?page=1&pageSize=500`, { headers: h })).json() as any;
// The explicit "which may I staff" ask.
const staffable = await (await fetch(`${BASE}/outlet?page=1&pageSize=500&linkedToAgencyId=${am.agency_id}`, { headers: h })).json() as any;

const gotMap = (nameMap.data ?? []).length;
const gotStaff = (staffable.data ?? []).length;
let fail = 0;
const say = (l: string, ok: boolean, d: string) => { if(!ok) fail++; console.log(`${ok?'PASS':'FAIL'}  ${l.padEnd(50)} ${d}`); };

console.log(`agency ${am.email} — ever linked ${am.ever_linked}, of which ended ${am.ended}; platform has ${totalActive}`);
say('name map covers every venue ever linked', gotMap === am.ever_linked, `got ${gotMap}, expected ${am.ever_linked}`);
say('name map is NOT the whole platform', gotMap < totalActive || am.ever_linked === totalActive, `${gotMap} vs ${totalActive}`);
say('explicit linkedToAgencyId stays narrow', gotStaff <= gotMap, `staffable ${gotStaff} <= map ${gotMap}`);

// And another agency's id must not widen anything.
const other = ((await db.execute(sql`select id from main.agency where id <> ${am.agency_id} limit 1`)).rows as any[])[0];
if (other) {
  const spoof = await (await fetch(`${BASE}/outlet?page=1&pageSize=500&linkedToAgencyId=${other.id}`, { headers: h })).json() as any;
  say('a spoofed agency id is ignored, not honoured', (spoof.data ?? []).length === gotMap, `got ${(spoof.data ?? []).length}, own map ${gotMap}`);
}
console.log(fail ? `\n${fail} FAILED` : '\nnames resolve for ended partnerships, and nothing leaked');
process.exit(fail ? 1 : 0);
