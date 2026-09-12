// Who may write a shift template now that the route asks booking:create?
// Invalid body on purpose — 403 = gate refused; anything else = gate passed.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const { JwtControllerClass } = await import('@/features/jwt/jwt.controller');
const jwt = new JwtControllerClass();
const BASE = `http://localhost:${process.env.BACKEND_PORT ?? 7777}/api/v1`;
const people = await db.execute(sql`
  select distinct on (ou.sub_role) ou.sub_role, u.email, ou.outlet_id
  from main.outlet_user ou join main."user" u on u.id = ou.user_id
  where ou.status='active' and u.email is not null
    and not exists (select 1 from main.user_role ur join main.role r on r.id=ur.role_id
                    where ur.user_id=u.id and r.role_name='admin')
  order by ou.sub_role, u.email`);
// booking:create is held by owner, guarantor, finance, ops; director is READ.
const EXPECT: Record<string,'allowed'|'refused'> = {
  owner:'allowed', guarantor:'allowed', finance:'allowed', operations_head:'allowed', director:'refused' };
let fail=0;
for (const p of (people.rows ?? people) as any[]) {
  const want = EXPECT[p.sub_role]; if (!want) continue;
  const res = await fetch(`${BASE}/shift-template`, {
    method:'POST',
    headers:{ Authorization:`Bearer ${jwt.generateAccessToken({loginMethod:'email',loginCriteria:p.email} as never)}`,
              'x-org-id':p.outlet_id,'x-org-kind':'outlet','Content-Type':'application/json' },
    body: JSON.stringify({ __probe:'invalid on purpose' }) });
  const got = res.status===403?'refused':'allowed';
  const ok = got===want; if(!ok) fail++;
  console.log(`${ok?'PASS':'FAIL'}  outlet ${String(p.sub_role).padEnd(16)} http=${String(res.status).padEnd(3)} -> ${got.padEnd(8)} (want ${want})`);
}
const made = ((await db.execute(sql`select count(*)::int as n from main.shift_template where created_at > now() - interval '2 minutes'`)).rows as any[])[0].n;
console.log(`\ntemplates created by this probe: ${made} (must be 0)`);
if (made!==0) fail++;
console.log(fail?`\n${fail} FAILED`:'\nshift templates follow the database, and nothing was written');
process.exit(fail?1:0);
