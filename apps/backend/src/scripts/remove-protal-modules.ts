/**
 * Removes mistaken "Protal" modules (typo for Portal) that were created as
 * RBAC modules. Portals are `main.portal` rows — not modules — so these
 * should not appear in the role C/R/U matrix.
 *
 * Targets (by module_key, case-insensitive):
 *   admin_protal · pr_protal · agency_protal · outlet_protal
 * Also matches any module whose key/name contains "protal".
 *
 * Deletes: role_permission → m_permission → m_module (FK order).
 *
 *   pnpm tsx --tsconfig tsconfig.json src/scripts/remove-protal-modules.ts
 *   pnpm tsx --tsconfig tsconfig.json src/scripts/remove-protal-modules.ts --apply
 */
import { ilike, inArray, or } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { ModuleTable } from '@/features/rbac/module/module.model.js';
import { PermissionTable } from '@/features/rbac/permission/permission.model.js';
import { RolePermissionTable } from '@/features/rbac/role-permission/role-permission.model.js';

const APPLY = process.argv.includes('--apply');

const KNOWN_KEYS = [
  'admin_protal',
  'pr_protal',
  'agency_protal',
  'outlet_protal',
] as const;

async function main() {
  const modules = await db
    .select({
      id: ModuleTable.id,
      moduleName: ModuleTable.moduleName,
      moduleKey: ModuleTable.moduleKey,
      portalId: ModuleTable.portalId,
      status: ModuleTable.status,
    })
    .from(ModuleTable)
    .where(
      or(
        inArray(ModuleTable.moduleKey, [...KNOWN_KEYS]),
        ilike(ModuleTable.moduleKey, '%protal%'),
        ilike(ModuleTable.moduleName, '%protal%'),
      ),
    );

  if (modules.length === 0) {
    console.log('No Protal modules found — nothing to do.');
    process.exit(0);
  }

  const moduleIds = modules.map((m) => m.id);
  const permissions = await db
    .select({
      id: PermissionTable.id,
      moduleId: PermissionTable.moduleId,
      permissionType: PermissionTable.permissionType,
      description: PermissionTable.description,
    })
    .from(PermissionTable)
    .where(inArray(PermissionTable.moduleId, moduleIds));

  const permissionIds = permissions.map((p) => p.id);
  const grants =
    permissionIds.length === 0
      ? []
      : await db
          .select({
            id: RolePermissionTable.id,
            roleId: RolePermissionTable.roleId,
            permissionId: RolePermissionTable.permissionId,
          })
          .from(RolePermissionTable)
          .where(inArray(RolePermissionTable.permissionId, permissionIds));

  console.log(`\nFound ${modules.length} Protal module(s) to remove:\n`);
  for (const m of modules) {
    const perms = permissions.filter((p) => p.moduleId === m.id);
    const grantCount = grants.filter((g) =>
      perms.some((p) => p.id === g.permissionId),
    ).length;
    console.log(
      `  • ${m.moduleName}  key=${m.moduleKey}  id=${m.id.slice(0, 8)}…  perms=${perms.length}  role_grants=${grantCount}`,
    );
  }
  console.log(
    `\nTotals: modules=${modules.length}  permissions=${permissions.length}  role_permission=${grants.length}`,
  );

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to delete.\n');
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    if (permissionIds.length > 0) {
      await tx
        .delete(RolePermissionTable)
        .where(inArray(RolePermissionTable.permissionId, permissionIds));
      await tx
        .delete(PermissionTable)
        .where(inArray(PermissionTable.id, permissionIds));
    }
    await tx.delete(ModuleTable).where(inArray(ModuleTable.id, moduleIds));
  });

  // Sanity: none should remain
  const leftover = await db
    .select({ id: ModuleTable.id })
    .from(ModuleTable)
    .where(
      or(
        inArray(ModuleTable.moduleKey, [...KNOWN_KEYS]),
        ilike(ModuleTable.moduleKey, '%protal%'),
        ilike(ModuleTable.moduleName, '%protal%'),
      ),
    );

  console.log(
    leftover.length === 0
      ? '\nDeleted. No Protal modules remain.\n'
      : `\nWarning: ${leftover.length} row(s) still match — check manually.\n`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
