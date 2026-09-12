// The same outlet-console write WITHOUT `x-org-kind` — which is the code path
// that existed before the fix. If this lands under 'agency', the bug was real.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const { JwtControllerClass } = await import('@/features/jwt/jwt.controller');
const jwtController = new JwtControllerClass();
const BASE = `http://localhost:${process.env.BACKEND_PORT ?? 7777}/api/v1`;

const d = ((await db.execute(sql`
  select u.email, u.preferred_locale, ou.outlet_id, o.name as outlet_name
  from main."user" u
  join main.agency_user au on au.user_id = u.id and au.status = 'active'
  join main.outlet_user ou on ou.user_id = u.id and ou.status = 'active'
  join main.outlet o on o.id = ou.outlet_id
  where u.email is not null
    and not exists (
      select 1 from main.user_role ur
      join main.role r2 on r2.id = ur.role_id
      where ur.user_id = u.id and r2.role_name = 'admin'
    )
  limit 1
`)).rows as any[])[0];

const token = jwtController.generateAccessToken({ loginMethod: 'email', loginCriteria: d.email } as never);
const res = await fetch(`${BASE}/auth/me/locale`, {
  method: 'PATCH',
  // x-org-id names the VENUE. No x-org-kind — the pre-fix client shape.
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-org-id': d.outlet_id },
  body: JSON.stringify({ locale: d.preferred_locale ?? 'en' }),
});
await new Promise((r) => setTimeout(r, 700));
const got = ((await db.execute(sql`select role, portal from main.audit_logs where user_id = (select id from main."user" where email = ${d.email}) order by created_at desc limit 1`)).rows as any[])[0];
console.log(`no x-org-kind, writing about venue "${d.outlet_name}": http=${res.status} role=${got.role} portal=${got.portal}`);
console.log(got.portal === 'agency'
  ? '  -> reproduces the bug: a VENUE action recorded under the Agency tab. The header is what fixes it.'
  : `  -> landed under '${got.portal}'.`);
process.exit(0);
