// Why does the agency guarantor get 401 on /subscription-invoice? READ-ONLY.
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
  select distinct on (au.sub_role) au.sub_role, u.email, au.agency_id
  from main.agency_user au join main."user" u on u.id = au.user_id
  where au.status='active' and u.email is not null
    and not exists (select 1 from main.user_role ur join main.role r on r.id=ur.role_id
                    where ur.user_id=u.id and r.role_name='admin')
  order by au.sub_role, u.email`);

for (const p of (people.rows ?? people) as any[]) {
  const tok = jwt.generateAccessToken({ loginMethod:'email', loginCriteria:p.email } as never);
  const res = await fetch(`${BASE}/subscription-invoice/`, {
    headers: { Authorization:`Bearer ${tok}`, 'x-org-id':p.agency_id, 'x-org-kind':'agency' },
  });
  let body = '';
  try { body = JSON.stringify(await res.json()).slice(0, 140); } catch { body = '(no json)'; }
  console.log(`${String(p.sub_role).padEnd(12)} ${p.email.padEnd(30)} http=${res.status}  ${body}`);
}
process.exit(0);
