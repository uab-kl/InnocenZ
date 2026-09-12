/**
 * READ-ONLY. Print a browser session for one lane so a UI change can be checked
 * against the REAL app instead of being reasoned about.
 *
 * Mints the same access token `/auth/login` would issue, from an email read out
 * of the database. Writes nothing.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const { JwtControllerClass } = await import('@/features/jwt/jwt.controller');
const jwt = new JwtControllerClass();

const want = process.argv[2] ?? 'admin';

if (want === 'admin') {
  const r = await db.execute(sql`
    select u.email from main."user" u
    join main.user_role ur on ur.user_id = u.id
    join main.role r on r.id = ur.role_id
    where r.role_name = 'admin' and u.email is not null limit 1`);
  const row = ((r.rows ?? r) as any[])[0];
  if (!row) { console.log('SKIP — no admin account with an email.'); process.exit(2); }
  console.log(JSON.stringify({ email: row.email, orgId: null, orgKind: null,
    token: jwt.generateAccessToken({ loginMethod: 'email', loginCriteria: row.email } as never) }));
} else {
  const r = await db.execute(sql`
    select au.sub_role, u.email, au.agency_id as org_id
    from main.agency_user au join main."user" u on u.id = au.user_id
    where au.sub_role = ${want} and au.status='active' and u.email is not null
      and not exists (select 1 from main.user_role ur join main.role rr on rr.id=ur.role_id
                      where ur.user_id=u.id and rr.role_name='admin')
    limit 1`);
  const row = ((r.rows ?? r) as any[])[0];
  if (!row) { console.log(`SKIP — no active agency ${want}.`); process.exit(2); }
  console.log(JSON.stringify({ email: row.email, orgId: row.org_id, orgKind: 'agency',
    token: jwt.generateAccessToken({ loginMethod: 'email', loginCriteria: row.email } as never) }));
}
process.exit(0);
