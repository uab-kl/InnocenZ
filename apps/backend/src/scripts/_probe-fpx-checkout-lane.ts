// The actual FPX spend. Invalid body on purpose: 403 = gate refused,
// anything else = gate passed and the controller rejected the payload.
// No checkout can be created from this.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const { JwtControllerClass } = await import('@/features/jwt/jwt.controller');
const jwtController = new JwtControllerClass();
const BASE = `http://localhost:${process.env.BACKEND_PORT ?? 7777}/api/v1`;

const people = await db.execute(sql`
  select distinct on (ou.sub_role) ou.sub_role, u.email, ou.outlet_id as org_id
  from main.outlet_user ou join main."user" u on u.id = ou.user_id
  where ou.status = 'active' and u.email is not null
    and not exists (select 1 from main.user_role ur join main.role r on r.id = ur.role_id
                    where ur.user_id = u.id and r.role_name = 'admin')
  order by ou.sub_role, u.email
`);
const EXPECT: Record<string, 'allowed' | 'refused'> = {
  owner: 'allowed', guarantor: 'refused', finance: 'refused',
  operations_head: 'refused', director: 'refused',
};
let fail = 0;
for (const p of (people.rows ?? people) as any[]) {
  const want = EXPECT[p.sub_role];
  if (!want) continue;
  const token = jwtController.generateAccessToken({ loginMethod: 'email', loginCriteria: p.email } as never);
  const res = await fetch(`${BASE}/subscription-payment/checkout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'x-org-id': p.org_id, 'x-org-kind': 'outlet', 'Content-Type': 'application/json' },
    body: JSON.stringify({ __probe: 'invalid on purpose — must never start a real checkout' }),
  });
  const got = res.status === 403 ? 'refused' : 'allowed';
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(p.sub_role).padEnd(16)} FPX checkout http=${String(res.status).padEnd(3)} -> ${got.padEnd(8)} (want ${want})`);
}
console.log(fail ? `\n${fail} FAILED` : '\nonly the owner can start an FPX checkout');
process.exit(fail ? 1 : 0);
