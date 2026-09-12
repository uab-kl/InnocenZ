/**
 * Owner, 12 Sep 2026: "other member also can help to approve the pending shift
 * receipt can help sign the pv, can edit the disputed shift receipt".
 *
 * Asked of the running server, per lane. Invalid bodies / non-existent ids on
 * purpose: 403 = the gate refused, anything else = it let the caller through to
 * the handler. Nothing can be approved, signed or edited by this probe.
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
const NOWHERE = '00000000-0000-4000-8000-000000000000';

const people = await db.execute(sql`
  select distinct on (au.sub_role) au.sub_role, u.email, au.agency_id
  from main.agency_user au join main."user" u on u.id = au.user_id
  where au.status='active' and u.email is not null
    and not exists (select 1 from main.user_role ur join main.role r on r.id=ur.role_id
                    where ur.user_id=u.id and r.role_name='admin')
  order by au.sub_role, u.email`);

const ACTS = [
  // ⚠️ `/receipts/approve-all` is NOT probed. It takes no id, so an invalid body
  //    does not stop it reaching the handler — it returned 200 when tried, and
  //    only happened to be a no-op because no payroll week was named. A gate must
  //    never be probed with a call that could succeed. The two below are safe:
  //    their ids cannot exist, so the handler 400s after the gate has answered.
  { label: 'review one receipt',      method: 'PATCH', path: `/payment-voucher/receipts/${NOWHERE}/review` },
  { label: 'edit a voucher line',     method: 'PATCH', path: `/payment-voucher/receipts/${NOWHERE}/lines/${NOWHERE}` },
];
// Finance is the "other member" the owner means; Director is the oversight lane.
const EXPECT: Record<string, 'allowed' | 'refused'> = {
  owner: 'allowed', guarantor: 'allowed', finance: 'allowed', director: 'refused',
};

let fail = 0;
for (const p of (people.rows ?? people) as any[]) {
  const want = EXPECT[p.sub_role];
  if (!want) continue;
  const marks: string[] = [];
  for (const a of ACTS) {
    const res = await fetch(`${BASE}${a.path}`, {
      method: a.method,
      headers: { Authorization: `Bearer ${jwt.generateAccessToken({ loginMethod: 'email', loginCriteria: p.email } as never)}`,
                 'x-org-id': p.agency_id, 'x-org-kind': 'agency', 'Content-Type': 'application/json' },
      body: JSON.stringify({ __probe: 'invalid on purpose' }),
    });
    const got = res.status === 403 ? 'refused' : 'allowed';
    if (got !== want) fail++;
    marks.push(`${a.label}=${got}(${res.status})`);
  }
  console.log(`${String(p.sub_role).padEnd(10)} want=${want.padEnd(8)} ${marks.join('  ')}`);
}
console.log(fail ? `\n${fail} mismatch(es)` : '\nFinance can do all three; the Director is view-only');
process.exit(fail ? 1 : 0);
