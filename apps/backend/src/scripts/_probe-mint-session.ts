/**
 * READ-ONLY. Print browser/API sessions so a change can be checked against the
 * REAL app for EVERY lane, instead of being reasoned about.
 *
 * Mints the same access token `/auth/login` would issue, from emails read out
 * of the live database. Writes nothing.
 *
 *   npx tsx src/scripts/_probe-mint-session.ts            # every lane, as JSON
 *   npx tsx src/scripts/_probe-mint-session.ts finance    # one agency lane
 *   npx tsx src/scripts/_probe-mint-session.ts admin
 *   npx tsx src/scripts/_probe-mint-session.ts outlet:owner
 *   npx tsx src/scripts/_probe-mint-session.ts pr
 *
 * ⚠️ The token is the only secret printed and it is short-lived. Nothing here
 * prints IC numbers, bank details or signature ink.
 *
 * ⚠️ A lane that comes back MISSING is a fact about the FIXTURES — that no
 * active account holds it — never proof that the lane is unreachable. It is
 * printed on stderr so it cannot be read as a result.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const { JwtControllerClass } = await import('@/features/jwt/jwt.controller');
const jwt = new JwtControllerClass();

type Session = {
  lane: string;
  email: string;
  orgId: string | null;
  orgKind: 'agency' | 'outlet' | null;
  orgName: string | null;
  token: string;
};

const mint = (email: string) =>
  jwt.generateAccessToken({ loginMethod: 'email', loginCriteria: email } as never);

/** Admin accounts are excluded from org lanes, so a lane really is that lane. */
const NOT_ADMIN = sql`not exists (select 1 from main.user_role ur join main.role rr on rr.id = ur.role_id
                                  where ur.user_id = u.id and rr.role_name = 'admin')`;

async function agencyLane(subRole: string): Promise<Session | null> {
  const r = await db.execute(sql`
    select u.email, au.agency_id as org_id, a.name as org_name
    from main.agency_user au
    join main."user" u on u.id = au.user_id
    join main.agency a on a.id = au.agency_id
    where au.sub_role = ${subRole} and au.status = 'active' and u.email is not null and ${NOT_ADMIN}
    limit 1`);
  const row = ((r.rows ?? r) as any[])[0];
  if (!row) return null;
  return { lane: 'agency:' + subRole, email: row.email, orgId: row.org_id, orgKind: 'agency', orgName: row.org_name, token: mint(row.email) };
}

async function outletLane(subRole: string): Promise<Session | null> {
  const r = await db.execute(sql`
    select u.email, ou.outlet_id as org_id, o.name as org_name
    from main.outlet_user ou
    join main."user" u on u.id = ou.user_id
    join main.outlet o on o.id = ou.outlet_id
    where ou.sub_role = ${subRole} and ou.status = 'active' and u.email is not null and ${NOT_ADMIN}
    limit 1`);
  const row = ((r.rows ?? r) as any[])[0];
  if (!row) return null;
  return { lane: 'outlet:' + subRole, email: row.email, orgId: row.org_id, orgKind: 'outlet', orgName: row.org_name, token: mint(row.email) };
}

async function adminLane(): Promise<Session | null> {
  const r = await db.execute(sql`
    select u.email from main."user" u
    join main.user_role ur on ur.user_id = u.id
    join main.role r on r.id = ur.role_id
    where r.role_name = 'admin' and u.email is not null limit 1`);
  const row = ((r.rows ?? r) as any[])[0];
  if (!row) return null;
  return { lane: 'admin', email: row.email, orgId: null, orgKind: null, orgName: null, token: mint(row.email) };
}

/** A PR is a `user` carrying an agency_pr row — there is no `pr` table. */
async function prLane(): Promise<Session | null> {
  const r = await db.execute(sql`
    select u.email, ap.agency_id as org_id, a.name as org_name
    from main.agency_pr ap
    join main."user" u on u.id = ap.user_id
    join main.agency a on a.id = ap.agency_id
    where u.email is not null and ${NOT_ADMIN}
    order by u.email limit 1`);
  const row = ((r.rows ?? r) as any[])[0];
  if (!row) return null;
  return { lane: 'pr', email: row.email, orgId: row.org_id, orgKind: 'agency', orgName: row.org_name, token: mint(row.email) };
}

const AGENCY_LANES = ['owner', 'guarantor', 'finance', 'director'];
const OUTLET_LANES = ['owner', 'guarantor', 'finance', 'director', 'operations_head'];

const want = process.argv[2];
const out: Session[] = [];
const missing: string[] = [];

async function push(label: string, p: Promise<Session | null>) {
  const s = await p;
  if (s) out.push(s);
  else missing.push(label);
}

if (!want) {
  for (const l of AGENCY_LANES) await push('agency:' + l, agencyLane(l));
  for (const l of OUTLET_LANES) await push('outlet:' + l, outletLane(l));
  await push('admin', adminLane());
  await push('pr', prLane());
} else if (want === 'admin') {
  await push('admin', adminLane());
} else if (want === 'pr') {
  await push('pr', prLane());
} else if (want.startsWith('outlet:')) {
  await push(want, outletLane(want.slice('outlet:'.length)));
} else {
  await push('agency:' + want, agencyLane(want.replace(/^agency:/, '')));
}

console.log(JSON.stringify({ sessions: out, missing }));
if (missing.length) {
  console.error('NOTE - no active account for: ' + missing.join(', ') + ' (a fixture gap, NOT a gate)');
}
process.exit(0);
