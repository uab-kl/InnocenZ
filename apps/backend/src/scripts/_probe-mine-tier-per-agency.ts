/**
 * Does `/shift-assignment/mine` now price each shift at ITS OWN agency's tier?
 *
 * pr.alice is on 4 rosters: Atlas = tier_2 (her OLDEST membership) and three
 * others at tier_1. Before the fix every row carried tier_2, because the
 * controller resolved one tier from `getByUserId(userId)` with no agency.
 * READ-ONLY.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const { JwtControllerClass } = await import('@/features/jwt/jwt.controller');
const jwt = new JwtControllerClass();
const BASE = `http://localhost:${process.env.BACKEND_PORT ?? 7777}/api/v1`;
const EMAIL = 'pr.alice@innocenz.demo';

const truth = new Map<string, string>();
for (const x of ((await db.execute(sql`
  select ap.agency_id, ap.tier::text as tier from main.agency_pr ap
  join main."user" u on u.id = ap.user_id where u.email = ${EMAIL}`)).rows as any[])) {
  truth.set(x.agency_id, x.tier);
}

const res = await fetch(`${BASE}/shift-assignment/mine?page=1&pageSize=50`, {
  headers: { Authorization: `Bearer ${jwt.generateAccessToken({ loginMethod: 'email', loginCriteria: EMAIL } as never)}` },
});
const body = (await res.json()) as any;
const rows: any[] = body?.data ?? [];
console.log(`http=${res.status}  assignments=${rows.length}`);
if (!rows.length) { console.log('no assignments to judge — cannot verify on this data'); process.exit(0); }

let fail = 0;
const seen = new Map<string, Set<string>>();
for (const a of rows) {
  const want = a.agencyId ? truth.get(a.agencyId) : undefined;
  if (!want) continue;
  if (!seen.has(want)) seen.set(want, new Set());
  seen.get(want)!.add(String(a.tier));
  if (String(a.tier) !== want) fail++;
}
for (const [want, got] of seen) {
  const ok = got.size === 1 && got.has(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  rows whose agency is ${want.padEnd(8)} carry tier ${JSON.stringify([...got])}`);
}
console.log(fail ? `\n${fail} row(s) priced at the wrong agency's tier` : '\nevery row is priced at its OWN agency tier');
process.exit(fail ? 1 : 0);
