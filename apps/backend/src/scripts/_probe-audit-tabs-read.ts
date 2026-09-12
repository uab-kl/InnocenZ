/**
 * THE TABS, AS THE ADMIN PAGE ASKS THEM.
 *
 * Owner, 12 Sep 2026: "fix the audit log tabs". The defect was that the tab was
 * applied in the BROWSER to a page the server had already cut, so the rows and
 * the footer described different sets — "1 row" under "1-10 of 2752". This
 * drives the same GraphQL query the page sends and checks the two agree.
 *
 *   cd apps/backend && npx tsx --tsconfig tsconfig.json src/scripts/_probe-audit-tabs-read.ts
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });

const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const { JwtControllerClass } = await import('@/features/jwt/jwt.controller');
const jwtController = new JwtControllerClass();

const GQL = `http://localhost:${process.env.BACKEND_PORT ?? 7777}/graphql`;
const ADMIN = process.env.DEFAULT_ADMIN_EMAIL ?? 'uab.innocenz@gmail.com';
const token = jwtController.generateAccessToken({ loginMethod: 'email', loginCriteria: ADMIN } as never);

const QUERY = `
  query AuditLogs($filter: AuditLogFilterInput, $pageSize: Int, $pageNumber: Int) {
    auditLogs(filter: $filter, pageSize: $pageSize, pageNumber: $pageNumber) {
      query { auditLogId role portal }
      pagination { count totalCount currentPage totalPages }
    }
  }
`;

async function tab(portal: string) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query: QUERY, variables: { filter: { portal }, pageSize: 10, pageNumber: 1 } }),
  });
  const body = (await res.json()) as any;
  if (body.errors) return { error: JSON.stringify(body.errors[0]?.message) };
  const d = body.data.auditLogs;
  return {
    rows: d.query.length,
    totalCount: d.pagination.totalCount,
    portalsSeen: [...new Set(d.query.map((r: any) => r.portal ?? '(null)'))],
  };
}

// What the database itself says each tab should hold.
const truth = await db.execute(sql`
  select
    count(*) filter (where portal = 'admin')::int  as admin,
    count(*) filter (where portal = 'pr')::int     as pr,
    count(*) filter (where portal = 'outlet')::int as outlet,
    count(*) filter (where portal = 'agency')::int as agency,
    count(*) filter (where portal is null or portal not in ('admin','pr','outlet','agency'))::int as others,
    count(*)::int as total
  from main.audit_logs
`);
const t = (truth.rows ?? truth)[0] as Record<string, number>;
console.log('DB truth:', JSON.stringify(t));

let fail = 0;
for (const key of ['admin', 'pr', 'outlet', 'agency', 'others'] as const) {
  const r: any = await tab(key);
  if (r.error) {
    console.log(`FAIL  ${key.padEnd(7)} ${r.error}`);
    fail++;
    continue;
  }
  const expect = t[key];
  // The footer must describe the SAME set as the rows: totalCount matches the
  // database, and every row on the page really belongs to this tab.
  const countOk = r.totalCount === expect;
  const purityOk =
    key === 'others'
      ? r.portalsSeen.every((p: string) => !['admin', 'pr', 'outlet', 'agency'].includes(p))
      : r.portalsSeen.every((p: string) => p === key);
  const ok = countOk && purityOk;
  if (!ok) fail++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${key.padEnd(7)} rows=${r.rows} totalCount=${r.totalCount} (db says ${expect}) portalsOnPage=${JSON.stringify(r.portalsSeen)}`,
  );
}

const sum = t.admin + t.pr + t.outlet + t.agency + t.others;
console.log(`\ntabs sum to ${sum}, table holds ${t.total} — ${sum === t.total ? 'no row is lost or double-counted' : 'MISMATCH'}`);
if (sum !== t.total) fail++;
console.log(fail ? `\n${fail} FAILED` : '\nall tabs agree with the database');
process.exit(fail ? 1 : 0);
