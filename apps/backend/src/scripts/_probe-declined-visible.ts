/**
 * DECLINED REQUESTS, on the admin's Member screen.
 *
 * Owner, 12 Sep 2026: "fix ... declined requests too". The screen's job is to
 * show "which user is status decline by who which orgs", but its two fetchers
 * asked for `status: "all"` only — and the repository drops rejected rows
 * unless `includeRejected` is passed, an opt-in added for the AGENCY'S OWN team
 * list, where a turned-down applicant must not appear.
 *
 *   cd apps/backend && npx tsx --tsconfig tsconfig.json src/scripts/_probe-declined-visible.ts
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
const ADMIN = process.env.DEFAULT_ADMIN_EMAIL ?? 'uab.innocenz@gmail.com';
const token = jwtController.generateAccessToken({ loginMethod: 'email', loginCriteria: ADMIN } as never);

async function counts(pathname: string, includeRejected: boolean) {
  const qs = `?status=all&page=1&pageSize=200${includeRejected ? '&includeRejected=true' : ''}`;
  const res = await fetch(`${BASE}${pathname}${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as { data?: { status?: string }[] };
  const tally: Record<string, number> = {};
  for (const r of body.data ?? []) tally[r.status ?? '(none)'] = (tally[r.status ?? '(none)'] ?? 0) + 1;
  return { http: res.status, total: (body.data ?? []).length, tally };
}

let fail = 0;
for (const [label, pathname, table, fk] of [
  ['agency', '/agency/team-members', 'agency_user', 'agency_id'],
  ['outlet', '/outlet/team-members', 'outlet_user', 'outlet_id'],
] as const) {
  const dbRejected = await db.execute(sql`
    select count(*)::int as n from main.${sql.raw(table)} where status = 'rejected'
  `);
  const expected = ((dbRejected.rows ?? dbRejected)[0] as { n: number }).n;

  const without = await counts(pathname, false);
  const withIt = await counts(pathname, true);

  const hiddenBefore = (without.tally.rejected ?? 0) === 0;
  const shownNow = (withIt.tally.rejected ?? 0) > 0 || expected === 0;
  const ok = without.http === 200 && withIt.http === 200 && hiddenBefore && shownNow;
  if (!ok) fail++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(7)} db has ${expected} rejected | without=${without.total} ${JSON.stringify(without.tally)} | with=${withIt.total} ${JSON.stringify(withIt.tally)}`,
  );
}
console.log(fail ? `\n${fail} FAILED` : '\ndeclined rows are hidden by default and shown when asked');
process.exit(fail ? 1 : 0);
