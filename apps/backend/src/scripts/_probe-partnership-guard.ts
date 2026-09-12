/**
 * CAN A VIEW-ONLY LANE END A VENUE'S AGENCY PARTNERSHIPS?
 *
 * Found 12 Sep 2026: `PUT /agency-outlet/mine` was `requireRole('outlet')` —
 * any lane on the portal, sub_role never read. `{"agencyIds": []}` from an
 * outlet DIRECTOR flipped every link to `ended`, and with no approved link the
 * venue cannot post a job at all. One request took a venue off the platform.
 *
 * ⚠️ THE BODY IS DELIBERATELY INVALID (`agencyIds` is not an array of ids), so a
 * caller who gets PAST the gate is stopped by validation and no link can change.
 * 403 = the gate refused. The link count is asserted unchanged either way.
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

const before = ((await db.execute(sql`
  select count(*)::int as n from main.agency_outlet where approve_status <> 'ended'`)).rows as any[])[0].n;

const people = await db.execute(sql`
  select distinct on (ou.sub_role) ou.sub_role, u.email, ou.outlet_id
  from main.outlet_user ou join main."user" u on u.id = ou.user_id
  where ou.status = 'active' and u.email is not null
    and not exists (select 1 from main.user_role ur join main.role r on r.id = ur.role_id
                    where ur.user_id = u.id and r.role_name = 'admin')
  order by ou.sub_role, u.email
`);
const EXPECT: Record<string, 'allowed' | 'refused'> = {
  owner: 'allowed', guarantor: 'allowed',
  finance: 'refused', operations_head: 'refused', director: 'refused',
};

let fail = 0;
for (const p of (people.rows ?? people) as any[]) {
  const want = EXPECT[p.sub_role];
  if (!want) continue;
  const token = jwt.generateAccessToken({ loginMethod: 'email', loginCriteria: p.email } as never);
  const res = await fetch(`${BASE}/agency-outlet/mine`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'x-org-id': p.outlet_id, 'x-org-kind': 'outlet', 'Content-Type': 'application/json' },
    body: JSON.stringify({ agencyIds: '__probe-invalid-not-an-array__' }),
  });
  const got = res.status === 403 ? 'refused' : 'allowed';
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  outlet ${String(p.sub_role).padEnd(16)} http=${String(res.status).padEnd(3)} -> ${got.padEnd(8)} (want ${want})`);
}

const after = ((await db.execute(sql`
  select count(*)::int as n from main.agency_outlet where approve_status <> 'ended'`)).rows as any[])[0].n;
console.log(`\nlive partnerships before=${before} after=${after} ${before === after ? '(unchanged — nothing was ended)' : '⚠️ CHANGED'}`);
if (before !== after) fail++;
console.log(fail ? `\n${fail} FAILED` : '\nonly owner and guarantor may decide a partnership');
process.exit(fail ? 1 : 0);
