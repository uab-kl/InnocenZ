/**
 * END-TO-END: does a real REST mutation now record WHICH PORTAL it came from?
 *
 * Owner, 12 Sep 2026: "fix the audit log tabs". The tabs group by portal, and
 * the column that backs them (migration 0164) is only useful if the live write
 * path fills it — so this drives the running server over HTTP rather than
 * calling the repository, which would prove nothing about the middleware.
 *
 * The mutation is `PATCH /auth/me/locale` set to the value the account ALREADY
 * has: self-scoped, idempotent, and audited like any other write. Tokens are
 * minted with the server's own signer instead of a password, so this needs no
 * credentials.
 *
 *   cd apps/backend && npx tsx --tsconfig tsconfig.json src/scripts/_probe-audit-portal-e2e.ts
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

const CASES = [
  { label: 'outlet owner', email: 'emhub@emhub.test', orgId: '385be5f4-4960-4710-9f3c-1a166de017b6', kind: 'outlet', expect: 'outlet' },
  { label: 'outlet director', email: 'director@emhub.test', orgId: '385be5f4-4960-4710-9f3c-1a166de017b6', kind: 'outlet', expect: 'outlet' },
  { label: 'agency owner', email: 'hello@starline.my', orgId: 'cd50e9f6-8dd5-435e-8bed-4fcf698f9a5d', kind: 'agency', expect: 'agency' },
  { label: 'agency director', email: 'director@atlas-agency.my', orgId: 'c30fcd15-9c72-402f-a110-0d97819a06f5', kind: 'agency', expect: 'agency' },
];

let pass = 0;
let fail = 0;

for (const c of CASES) {
  const before = await db.execute(sql`select count(*)::int as n from main.audit_logs`);
  const beforeN = (before.rows ?? before)[0].n as number;

  // Set the locale to whatever it already is — a write that changes nothing.
  const cur = await db.execute(sql`select preferred_locale from main."user" where email = ${c.email}`);
  const locale = ((cur.rows ?? cur)[0]?.preferred_locale as string) ?? 'en';

  const token = jwtController.generateAccessToken({ loginMethod: 'email', loginCriteria: c.email } as never);
  const res = await fetch(`${BASE}/auth/me/locale`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-org-id': c.orgId,
      'x-org-kind': c.kind,
    },
    body: JSON.stringify({ locale }),
  });

  // The audit row is written after the response; give the server a moment.
  await new Promise((r) => setTimeout(r, 700));

  const row = await db.execute(sql`
    select role, portal, action, entity from main.audit_logs
    order by created_at desc limit 1
  `);
  const after = await db.execute(sql`select count(*)::int as n from main.audit_logs`);
  const afterN = (after.rows ?? after)[0].n as number;
  const got = (row.rows ?? row)[0] as { role: string | null; portal: string | null; action: string; entity: string };

  const wrote = afterN > beforeN;
  const ok = res.status === 200 && wrote && got.portal === c.expect;
  if (ok) pass++; else fail++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${c.label.padEnd(16)} http=${res.status} newRow=${wrote} role=${got.role} portal=${got.portal} (want ${c.expect})`,
  );
}

const byPortal = await db.execute(sql`
  select coalesce(portal,'(null)') as portal, count(*)::int as n
  from main.audit_logs group by 1 order by 2 desc
`);
console.log('\nBY PORTAL NOW:', JSON.stringify(byPortal.rows ?? byPortal));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
