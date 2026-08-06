/**
 * Removes mistaken specialized portal roles (agency_owner, outlet_owner, …).
 * Org lanes live on user_role → role (Owner / Finance / Ops Head per portal).
 *
 * For each user holding a specialized role:
 *   - ensure they also have agency or outlet Owner (legacy remap)
 *   - drop the specialized user_role row
 * Then delete role_permission + role for those names.
 *
 *   pnpm tsx --tsconfig tsconfig.json src/scripts/remove-specialized-portal-roles.ts
 *   pnpm tsx --tsconfig tsconfig.json src/scripts/remove-specialized-portal-roles.ts --apply
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { RoleTable } from '@/features/rbac/role/role.model.js';
import { RolePermissionTable } from '@/features/rbac/role-permission/role-permission.model.js';
import { UserRoleTable } from '@/features/rbac/user-role/user-role.model.js';
import {
  LEGACY_SPECIALIZED_ROLE_NAMES,
  portalRoleName,
} from '@/types/rbac-constant.js';

const APPLY = process.argv.includes('--apply');
const ACTOR = 'remove-specialized-portal-roles';

const TARGET_PORTAL: Record<string, string> = {
  agency_owner: portalRoleName.AGENCY,
  agency_finance: portalRoleName.AGENCY,
  outlet_owner: portalRoleName.OUTLET,
  outlet_finance: portalRoleName.OUTLET,
  outlet_ops: portalRoleName.OUTLET,
};

async function roleByName(name: string) {
  const [row] = await db
    .select({ id: RoleTable.id, roleName: RoleTable.roleName })
    .from(RoleTable)
    .where(eq(RoleTable.roleName, name))
    .limit(1);
  return row ?? null;
}

async function main() {
  const specialized = await db
    .select({ id: RoleTable.id, roleName: RoleTable.roleName })
    .from(RoleTable)
    .where(inArray(RoleTable.roleName, [...LEGACY_SPECIALIZED_ROLE_NAMES]));

  if (specialized.length === 0) {
    console.log('No specialized portal roles found — nothing to do.');
    process.exit(0);
  }

  const portalRoleIds = new Map<string, string>();
  for (const name of [portalRoleName.AGENCY, portalRoleName.OUTLET]) {
    const row = await roleByName(name);
    if (!row) throw new Error(`Missing canonical role "${name}" — run init-roles first`);
    portalRoleIds.set(name, row.id);
  }

  console.log(`\nFound ${specialized.length} specialized role(s):\n`);
  for (const r of specialized) {
    console.log(`  • ${r.roleName}  (${r.id.slice(0, 8)}…)`);
  }

  const specializedIds = specialized.map((r) => r.id);
  const grants = await db
    .select({
      id: UserRoleTable.id,
      userId: UserRoleTable.userId,
      roleId: UserRoleTable.roleId,
    })
    .from(UserRoleTable)
    .where(inArray(UserRoleTable.roleId, specializedIds));

  console.log(`\nuser_role rows to remap/drop: ${grants.length}`);

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to delete.\n');
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    for (const g of grants) {
      const role = specialized.find((r) => r.id === g.roleId);
      if (!role) continue;
      const portalName = TARGET_PORTAL[role.roleName];
      const portalRoleId = portalRoleIds.get(portalName);
      if (!portalRoleId) continue;

      const [already] = await tx
        .select({ id: UserRoleTable.id })
        .from(UserRoleTable)
        .where(
          and(
            eq(UserRoleTable.userId, g.userId),
            eq(UserRoleTable.roleId, portalRoleId),
          ),
        )
        .limit(1);

      if (!already) {
        await tx.insert(UserRoleTable).values({
          userId: g.userId,
          roleId: portalRoleId,
          createdBy: ACTOR,
          updatedBy: ACTOR,
        });
      }

      await tx.delete(UserRoleTable).where(eq(UserRoleTable.id, g.id));
    }

    await tx
      .delete(RolePermissionTable)
      .where(inArray(RolePermissionTable.roleId, specializedIds));

    await tx.delete(RoleTable).where(inArray(RoleTable.id, specializedIds));
  });

  const leftover = await db
    .select({ roleName: RoleTable.roleName })
    .from(RoleTable)
    .where(inArray(RoleTable.roleName, [...LEGACY_SPECIALIZED_ROLE_NAMES]));

  console.log(
    leftover.length === 0
      ? '\nDeleted specialized roles. Canonical roles: admin, agency, outlet, pr.\n'
      : `\nWarning: still present: ${leftover.map((r) => r.roleName).join(', ')}\n`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
