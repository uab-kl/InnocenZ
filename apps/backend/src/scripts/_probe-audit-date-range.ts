// From = To = today must return today's rows, not zero.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const { JwtControllerClass } = await import('@/features/jwt/jwt.controller');
const jwt = new JwtControllerClass();
const GQL = `http://localhost:${process.env.BACKEND_PORT ?? 7777}/graphql`;
const token = jwt.generateAccessToken({ loginMethod: 'email', loginCriteria: process.env.DEFAULT_ADMIN_EMAIL ?? 'uab.innocenz@gmail.com' } as never);

const today = ((await db.execute(sql`select to_char(now() at time zone 'utc','YYYY-MM-DD') as d`)).rows as any[])[0].d;
const truth = ((await db.execute(sql`
  select count(*)::int as n from main.audit_logs
  where created_at >= ${today}::date and created_at < (${today}::date + interval '1 day')`)).rows as any[])[0].n;

const q = `query($f: AuditLogFilterInput){ auditLogs(filter:$f, pageSize:1, pageNumber:1){ pagination { totalCount } } }`;
const res = await fetch(GQL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ query: q, variables: { f: { dateFrom: today, dateTo: today } } }),
});
const body: any = await res.json();
const got = body?.data?.auditLogs?.pagination?.totalCount;
console.log(`From=To=${today}: API says ${got}, database says ${truth} — ${got === truth ? 'PASS' : 'FAIL'}`);
process.exit(got === truth ? 0 : 1);
