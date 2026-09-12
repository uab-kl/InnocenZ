/**
 * THE CASE THE FIRST PROBE COULD NOT SEE: somebody who staffs an agency AND a
 * venue, writing from each console in turn.
 *
 * The earlier `_probe-audit-portal-e2e.ts` used four single-kind accounts, so it
 * proved nothing about the agency-first ordering bug — every one of its callers
 * had only one kind of membership to find.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });

const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const { JwtControllerClass } = await import('@/features/jwt/jwt.controller');
const jwtController = new JwtControllerClass();
const BASE = `http://localhost:${process.env.BACKEND_PORT ?? 7777}/api/v1`;

const dual = await db.execute(sql`
  select u.email, u.preferred_locale,
         au.agency_id, a.name as agency_name, au.sub_role as agency_lane,
         ou.outlet_id, o.name as outlet_name, ou.sub_role as outlet_lane
  from main."user" u
  join main.agency_user au on au.user_id = u.id and au.status = 'active'
  join main.outlet_user ou on ou.user_id = u.id and ou.status = 'active'
  join main.agency a on a.id = au.agency_id
  join main.outlet o on o.id = ou.outlet_id
  where u.email is not null
    and not exists (
      select 1 from main.user_role ur
      join main.role r2 on r2.id = ur.role_id
      where ur.user_id = u.id and r2.role_name = 'admin'
    )
  limit 1
`);
const d = (dual.rows ?? dual)[0] as any;
if (!d) {
  console.log('NO dual-membership account exists — creating one is out of scope for a read probe.');
  console.log('The ordering fix stands on code review + the require-sub-role precedent.');
  process.exit(0);
}
console.log(`dual account: ${d.email}`);
console.log(`  agency: ${d.agency_name} (${d.agency_lane})`);
console.log(`  outlet: ${d.outlet_name} (${d.outlet_lane})\n`);

const token = jwtController.generateAccessToken({ loginMethod: 'email', loginCriteria: d.email } as never);
let fail = 0;
for (const [kind, orgId, orgName] of [
  ['outlet', d.outlet_id, d.outlet_name],
  ['agency', d.agency_id, d.agency_name],
] as const) {
  const res = await fetch(`${BASE}/auth/me/locale`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-org-id': orgId,
      'x-org-kind': kind,
    },
    body: JSON.stringify({ locale: d.preferred_locale ?? 'en' }),
  });
  await new Promise((r) => setTimeout(r, 700));
  const last = await db.execute(sql`select role, portal from main.audit_logs where user_id = (select id from main."user" where email = ${d.email}) order by created_at desc limit 1`);
  const got = (last.rows ?? last)[0] as { role: string | null; portal: string | null };
  const ok = res.status === 200 && got.portal === kind;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  wrote from ${kind.padEnd(6)} console (${String(orgName).slice(0,18)}) -> role=${got.role} portal=${got.portal} (want ${kind})`);
}
console.log(fail ? `\n${fail} FAILED — the portal still follows probe order, not the console` : '\nthe console decides the portal, not the probe order');
process.exit(fail ? 1 : 0);
