/**
 * DOES THE DATABASE STILL MATCH WHAT `seed-rbac.ts` INTENDS?
 *
 * Owner, 12 Sep 2026: "yes fix all" — this was the gap left open after the RBAC
 * work: `pnpm rbac:check` proves **web == database**, and nothing proved
 * **database == intent**.
 *
 * ⚠️ WHY THE GAP MATTERS. `seed-rbac.ts` only ever ADDS: `applyRoleGrants`
 * inserts with `onConflictDoNothing` and never deletes. So a grant removed from
 * that file survives on every already-seeded database, silently, for ever — and
 * those rows are what the server actually enforces. That is precisely how outlet
 * Finance came to hold 19 grants while the file described 7, which is what made
 * the portals claim Finance was view-only while Post Job sat in their sidebar.
 *
 *   pnpm rbac:seed-check
 *
 * EXTRA rows fail: the database allows something nobody wrote down, and only a
 * hand-written DELETE can take it back. MISSING rows fail too, but they are the
 * benign direction — a `pnpm migrate:deploy` seeds them.
 *
 * Read-only. It never writes, because the fix for an extra row is a decision
 * (is the file wrong, or the data?) and that belongs to a person.
 */
import 'dotenv/config';

import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { ModuleTable } from '@/features/rbac/module/module.model';
import { PermissionTable } from '@/features/rbac/permission/permission.model';
import { PortalTable } from '@/features/rbac/portal/portal.model';
import { RolePermissionTable } from '@/features/rbac/role-permission/role-permission.model';
import { RoleTable } from '@/features/rbac/role/role.model';
import { ROLE_GRANTS } from './seed-rbac';

async function main() {
  // What the file says: role -> the set of `module_key:permission_type` it grants.
  const intended = new Map<string, Set<string>>();
  for (const entry of ROLE_GRANTS) {
    if (entry.grant === '*') continue; // admin holds everything — nothing to diff.
    if (!entry.portal) continue;
    const key = `${entry.portal}/${entry.roleName}`;
    const want = intended.get(key) ?? new Set<string>();
    for (const [moduleKey, types] of entry.grant) {
      for (const type of types) want.add(`${moduleKey}:${type}`);
    }
    intended.set(key, want);
  }

  // What the database holds, for the same roles.
  const rows = await db
    .select({
      portalCode: PortalTable.code,
      roleName: RoleTable.roleName,
      moduleKey: ModuleTable.moduleKey,
      permissionType: PermissionTable.permissionType,
    })
    .from(RolePermissionTable)
    .innerJoin(RoleTable, eq(RolePermissionTable.roleId, RoleTable.id))
    .innerJoin(PortalTable, eq(RoleTable.portalId, PortalTable.id))
    .innerJoin(
      PermissionTable,
      eq(RolePermissionTable.permissionId, PermissionTable.id),
    )
    .innerJoin(ModuleTable, eq(PermissionTable.moduleId, ModuleTable.id));

  const live = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.portalCode === 'admin') continue;
    const key = `${r.portalCode}/${r.roleName}`;
    const have = live.get(key) ?? new Set<string>();
    have.add(`${r.moduleKey}:${r.permissionType}`);
    live.set(key, have);
  }

  let problems = 0;
  for (const [role, want] of [...intended].sort()) {
    const have = live.get(role) ?? new Set<string>();
    const extra = [...have].filter((g) => !want.has(g)).sort();
    const missing = [...want].filter((g) => !have.has(g)).sort();
    if (extra.length === 0 && missing.length === 0) {
      console.log(`  ok    ${role.padEnd(22)} ${want.size} grants`);
      continue;
    }
    problems += 1;
    console.log(`  DRIFT ${role}`);
    if (extra.length) {
      console.log(
        `        database allows, file does not say: ${extra.join(', ')}`,
      );
      console.log(
        '        ^ the seeder CANNOT remove these - a DELETE is the only way back',
      );
    }
    if (missing.length) {
      console.log(
        `        file says, database lacks: ${missing.join(', ')}  (run pnpm migrate:deploy)`,
      );
    }
  }

  if (problems === 0) {
    console.log('\n[rbac-seed] the database matches seed-rbac.ts.');
    process.exit(0);
  }
  console.error(`\n[rbac-seed] ${problems} role(s) drifted from seed-rbac.ts.`);
  process.exit(1);
}

void main();
