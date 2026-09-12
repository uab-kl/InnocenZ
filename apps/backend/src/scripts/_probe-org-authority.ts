/**
 * THE OWNER'S RULE, ASKED OF THE TABLE THAT DECIDES IT.
 *
 * Owner, 12 Sep 2026: "the owner of orgs can do billing and change decision for
 * the organisation right, then other member just view only cannot make changes
 * for the organisation, other member still can assign pr, other outlet member
 * can post job".
 *
 * `role_permission` is the authority (standing rule). This prints the full grant
 * matrix per portal so the claim can be checked rather than believed.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const r = await db.execute(sql`
  select po.code as portal, r.role_name as role, m.module_key as module, p.permission_type as verb
  from main.role_permission rp
  join main.role r         on r.id = rp.role_id
  join main.m_permission p on p.id = rp.permission_id
  join main.m_module m     on m.id = p.module_id
  join main.portal po      on po.id = m.portal_id
  where po.code in ('outlet','agency')
  order by po.code, r.role_name, m.module_key, p.permission_type
`);

const byPortal: Record<string, Record<string, Record<string, string[]>>> = {};
for (const row of (r.rows ?? r) as any[]) {
  byPortal[row.portal] ??= {};
  byPortal[row.portal][row.role] ??= {};
  byPortal[row.portal][row.role][row.module] ??= [];
  byPortal[row.portal][row.role][row.module].push(row.verb[0].toUpperCase());
}

// The modules that decide ORGANISATION-level change, vs day-to-day operations.
const ORG_LEVEL = ['settings', 'billing'];
const OPERATIONAL = ['booking', 'roster', 'workforce', 'approvals', 'sales', 'workspace'];

for (const portal of ['outlet', 'agency']) {
  console.log(`\n===== ${portal.toUpperCase()} =====`);
  const roles = Object.keys(byPortal[portal] ?? {}).sort();
  const mods = [...new Set(Object.values(byPortal[portal] ?? {}).flatMap((m) => Object.keys(m)))].sort();
  console.log('role'.padEnd(12) + mods.map((m) => m.slice(0, 9).padEnd(10)).join(''));
  for (const role of roles) {
    console.log(role.padEnd(12) + mods.map((m) => (byPortal[portal][role][m] ?? ['-']).join('').padEnd(10)).join(''));
  }
  console.log('\n  -- ORG-LEVEL CHANGE (who may alter the organisation itself) --');
  for (const role of roles) {
    const writes = ORG_LEVEL.filter((m) => (byPortal[portal][role][m] ?? []).some((v) => v === 'U' || v === 'C'));
    console.log(`  ${role.padEnd(12)} ${writes.length ? 'CAN CHANGE: ' + writes.join(', ') : 'view only'}`);
  }
  console.log('  -- OPERATIONAL WRITES (day-to-day work) --');
  for (const role of roles) {
    const writes = OPERATIONAL.filter((m) => (byPortal[portal][role][m] ?? []).some((v) => v === 'U' || v === 'C'));
    console.log(`  ${role.padEnd(12)} ${writes.join(', ') || '(none)'}`);
  }
}
process.exit(0);
