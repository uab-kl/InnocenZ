// One mutation must write exactly ONE audit row. It was writing two, because
// platformAuditMiddleware was mounted app-wide AND on the v1 router.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const { JwtControllerClass } = await import('@/features/jwt/jwt.controller');
const jwtController = new JwtControllerClass();
const BASE = `http://localhost:${process.env.BACKEND_PORT ?? 7777}/api/v1`;
const EMAIL = 'emhub@emhub.test';

const before = ((await db.execute(sql`
  select count(*)::int as n from main.audit_logs
  where user_id = (select id from main."user" where email = ${EMAIL})`)).rows as any[])[0].n;

const token = jwtController.generateAccessToken({ loginMethod: 'email', loginCriteria: EMAIL } as never);
const cur = ((await db.execute(sql`select preferred_locale from main."user" where email = ${EMAIL}`)).rows as any[])[0];
const res = await fetch(`${BASE}/auth/me/locale`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ locale: cur?.preferred_locale ?? 'en' }),
});
await new Promise((r) => setTimeout(r, 900));
const after = ((await db.execute(sql`
  select count(*)::int as n from main.audit_logs
  where user_id = (select id from main."user" where email = ${EMAIL})`)).rows as any[])[0].n;

const wrote = after - before;
console.log(`one PATCH (http=${res.status}) wrote ${wrote} audit row(s) — ${wrote === 1 ? 'PASS' : 'FAIL, expected exactly 1'}`);
process.exit(wrote === 1 ? 0 : 1);
