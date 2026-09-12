/**
 * EVERY ROLE, EVERY MAIN READ ENDPOINT — against the RUNNING server.
 *
 * Owner, 12 Sep 2026: "the function and module all works well in all pages? …
 * all other members, other account and role including (outlet, pr agency, pr
 * and admin) (web and application) help me to check also".
 *
 * Static review cannot see a module that throws at runtime. This signs in as
 * one real account per lane and GETs what that lane's pages read.
 *
 * READ-ONLY — every request is a GET. What matters:
 *   5xx  = the module is BROKEN for that role (a bug, always)
 *   403  = refused (correct or not, judged against the owner's rules)
 *   2xx  = served
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

type Who = { label: string; email: string; orgId: string | null; kind: 'agency' | 'outlet' | null };
const who: Who[] = [];

for (const [tbl, fk, kind] of [
  ['outlet_user', 'outlet_id', 'outlet'],
  ['agency_user', 'agency_id', 'agency'],
] as const) {
  const rows = await db.execute(sql`
    select distinct on (m.sub_role) m.sub_role, u.email, m.${sql.raw(fk)} as org_id
    from main.${sql.raw(tbl)} m join main."user" u on u.id = m.user_id
    where m.status = 'active' and u.email is not null
      and not exists (select 1 from main.user_role ur join main.role r on r.id = ur.role_id
                      where ur.user_id = u.id and r.role_name = 'admin')
    order by m.sub_role, u.email
  `);
  for (const r of (rows.rows ?? rows) as any[]) {
    who.push({ label: `${kind}/${r.sub_role}`, email: r.email, orgId: r.org_id, kind });
  }
}
const adminEmail = process.env.DEFAULT_ADMIN_EMAIL ?? 'uab.innocenz@gmail.com';
who.push({ label: 'admin', email: adminEmail, orgId: null, kind: null });
const pr = ((await db.execute(sql`
  select u.email from main.agency_pr ap join main."user" u on u.id = ap.user_id
  where u.email is not null limit 1`)).rows as any[])[0];
if (pr) who.push({ label: 'pr (mobile)', email: pr.email, orgId: null, kind: null });

// What each console's pages actually read.
const ENDPOINTS: Record<string, string[]> = {
  // ⚠️ These must be the paths the PORTALS actually call. A first cut used
  // `/outlet/team-members` (which is requireRole('admin') — the ADMIN
  // cross-venue screen, not an org's own team) and a bare
  // `/payment-voucher/mine` (which does not exist; the PR routes are
  // `/mine/current-week`, `/mine/history`, …). Both produced 403s that looked
  // like findings and were purely the instrument being wrong.
  outlet: ['/auth/me', '/outlet/memberships', '/outlet/:org/members',
           '/shift?page=1&pageSize=5', '/shift-assignment?page=1&pageSize=5', '/rating?page=1&pageSize=5',
           '/payment-method/mine', '/member-subscription/summary', '/subscription-invoice/',
           '/notification?page=1&pageSize=5'],
  agency: ['/auth/me', '/agency/memberships', '/agency/:org/members',
           '/shift?page=1&pageSize=5', '/shift-assignment?page=1&pageSize=5',
           '/payment-voucher?page=1&pageSize=5', '/payment-method/mine',
           '/member-subscription/summary', '/subscription-invoice/', '/notification?page=1&pageSize=5'],
  admin:  ['/auth/me', '/user?page=1&pageSize=5', '/outlet?page=1&pageSize=5', '/agency?page=1&pageSize=5',
           '/outlet/team-members?status=all&page=1&pageSize=5', '/agency/team-members?status=all&page=1&pageSize=5',
           '/subscription', '/notification?page=1&pageSize=5'],
  pr:     ['/auth/me', '/shift-assignment/mine?page=1&pageSize=5',
           '/payment-voucher/mine/current-week', '/payment-voucher/mine/history',
           '/notification?page=1&pageSize=5'],
};



let broken = 0;
const rows: string[] = [];
for (const w of who) {
  const set = w.kind ? ENDPOINTS[w.kind] : w.label === 'admin' ? ENDPOINTS.admin : ENDPOINTS.pr;
  const token = jwtController.generateAccessToken({ loginMethod: 'email', loginCriteria: w.email } as never);
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (w.orgId && w.kind) { headers['x-org-id'] = w.orgId; headers['x-org-kind'] = w.kind; }
  const marks: string[] = [];
  for (const ep of set) {
    let status = 0;
    try {
      const res = await fetch(`${BASE}${ep.replace(':org', w.orgId ?? '')}`, { headers });
      status = res.status;
    } catch { status = -1; }
    const name = ep.split('?')[0];
    if (status >= 500 || status === -1) { broken++; marks.push(`🔴${name}=${status}`); }
    else if (status === 403) marks.push(`403${name}`);
    else if (status >= 400) marks.push(`${status}${name}`);
  }
  rows.push(`${w.label.padEnd(20)} ${marks.length ? marks.join('  ') : 'all 2xx'}`);
}
console.log('ROLE                 NON-2xx RESPONSES (🔴 = 5xx, a broken module)');
for (const r of rows) console.log(r);
console.log(`\n${broken} endpoint(s) returned 5xx across ${who.length} accounts.`);
process.exit(0);
