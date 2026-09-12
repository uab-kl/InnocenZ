/**
 * Does a PR's action record portal='pr'? The tab was empty, and empty can mean
 * "correct but unused" or "silently unclassified" — those need telling apart.
 *
 * A PR has no agency_user/outlet_user membership (they live on agency_pr), so
 * resolution falls through to the legacy-name branch in `getUserRoleNameById`.
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

const pr = await db.execute(sql`
  select u.email, u.preferred_locale
  from main.agency_pr ap
  join main."user" u on u.id = ap.user_id
  where u.email is not null
  limit 1
`);
const row = (pr.rows ?? pr)[0] as { email: string; preferred_locale: string | null } | undefined;
if (!row) { console.log('no PR account found'); process.exit(0); }

const token = jwtController.generateAccessToken({ loginMethod: 'email', loginCriteria: row.email } as never);
const res = await fetch(`${BASE}/auth/me/locale`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ locale: row.preferred_locale ?? 'en' }),
});
await new Promise((r) => setTimeout(r, 700));
const last = await db.execute(sql`select role, portal, action, entity from main.audit_logs order by created_at desc limit 1`);
const got = (last.rows ?? last)[0] as { role: string | null; portal: string | null };
const ok = res.status === 200 && got.portal === 'pr';
console.log(`${ok ? 'PASS' : 'FAIL'}  PR action  http=${res.status} role=${got.role} portal=${got.portal} (want pr)`);
process.exit(ok ? 0 : 1);
