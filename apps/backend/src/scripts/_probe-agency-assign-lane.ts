/**
 * WHO MAY ASSIGN A PR TO A SHIFT — asked of the running server.
 *
 * Owner, 12 Sep 2026: "other agency orgs member can assign member".
 *
 * ⚠️ The body is DELIBERATELY INVALID. This asks only "does the gate let me
 * past?", and a gate must never be probed with a write that would land: a pass
 * stops at the controller's own validation (400), a refusal is 403. Nothing is
 * created either way. (August lesson: a real body once renamed a live venue.)
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

// One active member per agency lane, excluding admins (they bypass lane checks).
const rows = await db.execute(sql`
  select distinct on (au.sub_role) au.sub_role, u.email, au.agency_id
  from main.agency_user au
  join main."user" u on u.id = au.user_id
  where au.status = 'active' and u.email is not null
    and not exists (
      select 1 from main.user_role ur join main.role r on r.id = ur.role_id
      where ur.user_id = u.id and r.role_name = 'admin')
  order by au.sub_role, u.email
`);

// After the 12 Sep change these routes ask `roster:update`, which owner,
// guarantor and (newly) finance hold. Director holds roster READ only.
const EXPECT: Record<string, 'allowed' | 'refused'> = {
  owner: 'allowed', guarantor: 'allowed', finance: 'allowed', director: 'refused',
};

let fail = 0;
for (const r of (rows.rows ?? rows) as any[]) {
  const want = EXPECT[r.sub_role];
  if (!want) continue;
  const token = jwtController.generateAccessToken({ loginMethod: 'email', loginCriteria: r.email } as never);
  const res = await fetch(`${BASE}/shift-assignment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-org-id': r.agency_id,
      'x-org-kind': 'agency',
    },
    body: JSON.stringify({ __probe: 'intentionally invalid — must never create a row' }),
  });
  // 403 = the gate refused. Anything else means it let us through to validation.
  const got = res.status === 403 ? 'refused' : 'allowed';
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  agency ${String(r.sub_role).padEnd(10)} http=${String(res.status).padEnd(3)} -> ${got.padEnd(8)} (want ${want})`);
}

const created = ((await db.execute(sql`
  select count(*)::int as n from main.shift_assignment
  where created_at > now() - interval '2 minutes'`)).rows as any[])[0].n;
console.log(`\nrows created by this probe: ${created} (must be 0)`);
if (created !== 0) fail++;
console.log(fail ? `\n${fail} FAILED` : '\nthe database decides who may roster, and nothing was written');
process.exit(fail ? 1 : 0);
