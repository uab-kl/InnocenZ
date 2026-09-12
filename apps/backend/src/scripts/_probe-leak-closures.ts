/**
 * The three reads tightened on 12 Sep, asked of the running server.
 *
 * READ-ONLY — every request is a GET.
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

const tok = (email: string) => jwt.generateAccessToken({ loginMethod: 'email', loginCriteria: email } as never);
let fail = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(58)} got=${got} want=${want}`);
};

// --- 1. GET /agency/:id must refuse a non-member ------------------------------
const outletOnly = ((await db.execute(sql`
  select u.email, ou.outlet_id from main.outlet_user ou join main."user" u on u.id = ou.user_id
  where ou.status='active' and u.email is not null
    and not exists (select 1 from main.agency_user au where au.user_id=u.id and au.status='active')
    and not exists (select 1 from main.user_role ur join main.role r on r.id=ur.role_id
                    where ur.user_id=u.id and r.role_name='admin')
  limit 1`)).rows as any[])[0];
const someAgency = ((await db.execute(sql`select id, name from main.agency limit 1`)).rows as any[])[0];
if (outletOnly && someAgency) {
  const r = await fetch(`${BASE}/agency/${someAgency.id}`, {
    headers: { Authorization: `Bearer ${tok(outletOnly.email)}`, 'x-org-id': outletOnly.outlet_id, 'x-org-kind': 'outlet' },
  });
  check(`outlet-only account reading a rival agency record`, r.status, 403);
}
// ...and must still serve that agency's OWN member.
const agencyOwn = ((await db.execute(sql`
  select u.email, au.agency_id from main.agency_user au join main."user" u on u.id = au.user_id
  where au.status='active' and u.email is not null limit 1`)).rows as any[])[0];
if (agencyOwn) {
  const r = await fetch(`${BASE}/agency/${agencyOwn.agency_id}`, {
    headers: { Authorization: `Bearer ${tok(agencyOwn.email)}`, 'x-org-id': agencyOwn.agency_id, 'x-org-kind': 'agency' },
  });
  check(`agency member reading their OWN agency`, r.status, 200);
}

// --- 2. GET /special-service/summary is admin-only ---------------------------
const pr = ((await db.execute(sql`
  select u.email from main.agency_pr ap join main."user" u on u.id = ap.user_id
  where u.email is not null limit 1`)).rows as any[])[0];
if (pr) {
  const r = await fetch(`${BASE}/special-service/summary`, { headers: { Authorization: `Bearer ${tok(pr.email)}` } });
  check(`PR reading platform-wide special-service counts`, r.status, 403);
}
const admin = process.env.DEFAULT_ADMIN_EMAIL ?? 'uab.innocenz@gmail.com';
{
  const r = await fetch(`${BASE}/special-service/summary`, { headers: { Authorization: `Bearer ${tok(admin)}` } });
  check(`admin reading special-service counts`, r.status, 200);
}

// --- 3. GET /pr from the OUTLET console must not answer with the agency roster
const dual = ((await db.execute(sql`
  select u.email, ou.outlet_id, au.agency_id
  from main."user" u
  join main.agency_user au on au.user_id=u.id and au.status='active'
  join main.outlet_user ou on ou.user_id=u.id and ou.status='active'
  where u.email is not null
    and not exists (select 1 from main.user_role ur join main.role r on r.id=ur.role_id
                    where ur.user_id=u.id and r.role_name='admin')
  limit 1`)).rows as any[])[0];
if (dual) {
  const asOutlet = await fetch(`${BASE}/pr?page=1&pageSize=5`, {
    headers: { Authorization: `Bearer ${tok(dual.email)}`, 'x-org-id': dual.outlet_id, 'x-org-kind': 'outlet' },
  });
  const asAgency = await fetch(`${BASE}/pr?page=1&pageSize=5`, {
    headers: { Authorization: `Bearer ${tok(dual.email)}`, 'x-org-id': dual.agency_id, 'x-org-kind': 'agency' },
  });
  const o = (await asOutlet.json()) as any;
  const a = (await asAgency.json()) as any;
  const oIds = JSON.stringify((o.data ?? []).map((x: any) => x.id).sort());
  const aIds = JSON.stringify((a.data ?? []).map((x: any) => x.id).sort());
  console.log(`      dual account ${dual.email}`);
  console.log(`      outlet console -> ${(o.data ?? []).length} PRs | agency console -> ${(a.data ?? []).length} PRs`);
  check(`the two consoles no longer return the SAME roster`, oIds === aIds, false);
} else {
  console.log('SKIP  no non-admin dual-membership account');
}
console.log(fail ? `\n${fail} FAILED` : '\nall three reads are scoped correctly');
process.exit(fail ? 1 : 0);
