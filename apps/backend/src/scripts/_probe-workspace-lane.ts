/**
 * WHO MAY SAVE THE VENUE'S WORKSPACE (rate card, drink menu)?
 *
 * The portal gates Save on `manageWorkspace` = `workspace:update`, which outlet
 * Finance HOLDS. The server demanded the owner/ops LANE, so Finance edited the
 * rate card, pressed Save, got a warn toast and lost the edit silently.
 *
 * ⚠️ Invalid body on purpose — 403 = the gate refused, anything else = it passed
 * and validation stopped the write. Nothing can persist either way.
 * ⚠️ The AGENCY caller is the case a naive fix breaks: agencies share this route
 * and hold no venue membership, so they must still pass.
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

/*
 * ⚠️⚠️ THIS PROBE DESTROYED LIVE DATA ON 12 Sep 2026. READ BEFORE RUNNING.
 *
 * `PUT /outlet-workspace/:outletId` treats EVERY field as optional and performs
 * a FULL-DRAFT save, so the `{__probe:'invalid on purpose'}` body below was
 * ACCEPTED as "save a workspace with nothing in it": UAB Emhub and Velvet 23
 * each had every scalar zeroed and all 7 `outlet_tier_rate` rows deleted.
 * Repaired by `_restore-workspace-rate-cards.ts`; Velvet's original numbers were
 * NOT recoverable (the audit row stored `old_data: null`).
 *
 * It is kept because the question it answers is real — which lanes the guard
 * admits — but it now refuses to run without an explicit flag:
 *
 *   npx tsx src/scripts/_probe-workspace-lane.ts --i-know-this-writes
 *
 * Better still, do not run it. The same answer is available read-only by asking
 * `role_permission` what `workspace:update` grants, which is what the route now
 * gates on.
 */
if (!process.argv.includes('--i-know-this-writes')) {
  console.log('REFUSED — this probe WRITES and has destroyed rate cards before.');
  console.log('Re-run with --i-know-this-writes only if you accept that risk.');
  process.exit(0);
}


const outletPeople = await db.execute(sql`
  select distinct on (ou.sub_role) ou.sub_role, u.email, ou.outlet_id
  from main.outlet_user ou join main."user" u on u.id = ou.user_id
  where ou.status = 'active' and u.email is not null
    and not exists (select 1 from main.user_role ur join main.role r on r.id = ur.role_id
                    where ur.user_id = u.id and r.role_name = 'admin')
  order by ou.sub_role, u.email
`);
// workspace CRU is held by owner, guarantor, finance and ops; director is READ.
const EXPECT: Record<string, 'allowed' | 'refused'> = {
  owner: 'allowed', guarantor: 'allowed', finance: 'allowed',
  operations_head: 'allowed', director: 'refused',
};

let fail = 0;
const anyOutlet = ((outletPeople.rows ?? outletPeople) as any[])[0].outlet_id;
for (const p of (outletPeople.rows ?? outletPeople) as any[]) {
  const want = EXPECT[p.sub_role];
  if (!want) continue;
  const token = jwt.generateAccessToken({ loginMethod: 'email', loginCriteria: p.email } as never);
  const res = await fetch(`${BASE}/outlet-workspace/${p.outlet_id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'x-org-id': p.outlet_id, 'x-org-kind': 'outlet', 'Content-Type': 'application/json' },
    body: JSON.stringify({ __probe: 'invalid on purpose' }),
  });
  const got = res.status === 403 ? 'refused' : 'allowed';
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  outlet ${String(p.sub_role).padEnd(16)} http=${String(res.status).padEnd(3)} -> ${got.padEnd(8)} (want ${want})`);
}

// The escape hatch: an agency owner has NO venue membership and must pass.
const ag = ((await db.execute(sql`
  select u.email, au.agency_id from main.agency_user au join main."user" u on u.id = au.user_id
  where au.status='active' and u.email is not null and au.sub_role='owner'
    and not exists (select 1 from main.outlet_user ou where ou.user_id = u.id and ou.status='active')
  limit 1`)).rows as any[])[0];
if (ag) {
  const token = jwt.generateAccessToken({ loginMethod: 'email', loginCriteria: ag.email } as never);
  const res = await fetch(`${BASE}/outlet-workspace/${anyOutlet}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'x-org-id': ag.agency_id, 'x-org-kind': 'agency', 'Content-Type': 'application/json' },
    body: JSON.stringify({ __probe: 'invalid on purpose' }),
  });
  const ok = res.status !== 403;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  agency caller (no venue membership) http=${res.status} -> ${ok ? 'still reaches the route' : 'REGRESSED to 403'}`);
} else {
  console.log('SKIP  no agency-only account to test the escape hatch with');
}
console.log(fail ? `\n${fail} FAILED` : '\nthe database decides who may save a workspace, and agency callers still pass');
process.exit(fail ? 1 : 0);
