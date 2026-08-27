/**
 * Does deactivating a role actually take its access away?
 *
 * The admin sheet's Active toggle says "Inactive roles grant no access." Until
 * 27 Aug 2026 that was true of the module permission path and FALSE of every
 * route guard: `getUserPermissions` and `userHasPermission` filtered
 * `role.status`, while `getRolesForUserIds` — the function `requireRole`,
 * `requirePortal`, `requirePermission`, the sub-role guards, `org-scope` and
 * `redact-identity-docs` all actually call — filtered on the user id alone.
 *
 * This probe flips a real role off, asks both lanes what they see, and flips it
 * back. It restores the role in a finally-path and refuses to start against a
 * role that is not currently active, so it cannot strand one off.
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { RoleTable } from '@/features/rbac/role/role.model.js';
import { UserRoleTable } from '@/features/rbac/user-role/user-role.model.js';
// The SAME instance the app's routes use, rather than a hand-built one that
// could be wired differently from the thing under test.
import { authRepository as auth } from '@/composition-root.js';

let restore: { id: string; status: string } | null = null;

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}`, detail === undefined ? '' : detail);
  }
}

async function main() {
  // A role somebody actually holds — otherwise the test proves nothing.
  const [held] = await db
    .select({
      roleId: RoleTable.id,
      roleName: RoleTable.roleName,
      userId: UserRoleTable.userId,
      status: RoleTable.status,
    })
    .from(UserRoleTable)
    .innerJoin(RoleTable, eq(UserRoleTable.roleId, RoleTable.id))
    .where(eq(RoleTable.status, 'active'))
    .limit(1);
  if (!held) throw new Error('no active role is held by anyone; nothing to probe');

  console.log(`\nrole "${held.roleName}" held by user ${held.userId}\n`);
  restore = { id: held.roleId, status: held.status };

  // ── while ACTIVE ─────────────────────────────────────────────────────────
  const before = await auth.getRolesForUserIds([held.userId]);
  check(
    'while ACTIVE the route-guard lane sees the role',
    before.some((r) => r.roleId === held.roleId),
  );

  // ── switch it OFF ────────────────────────────────────────────────────────
  await db
    .update(RoleTable)
    .set({ status: 'inactive', updatedAt: new Date(), updatedBy: 'probe:role-deactivation' })
    .where(eq(RoleTable.id, held.roleId));

  const after = await auth.getRolesForUserIds([held.userId]);
  check(
    'while INACTIVE the route-guard lane no longer sees it',
    !after.some((r) => r.roleId === held.roleId),
    after.map((r) => r.roleName),
  );

  // The sibling lane was always right; prove the two now agree.
  const perms = await auth.getUserPermissions(held.userId);
  const leaked = perms.filter((p) => p.roleId === held.roleId);
  check('the permission lane refuses it too — both lanes agree', leaked.length === 0, leaked.length);

  // ── and back ─────────────────────────────────────────────────────────────
  await db
    .update(RoleTable)
    .set({ status: restore.status, updatedAt: new Date(), updatedBy: 'probe:role-deactivation' })
    .where(eq(RoleTable.id, restore.id));
  const restoredId = restore.id;
  restore = null;

  const restored = await auth.getRolesForUserIds([held.userId]);
  check(
    'reactivating restores access',
    restored.some((r) => r.roleId === restoredId),
  );

  const inactive = await db
    .select({ id: RoleTable.id })
    .from(RoleTable)
    .where(eq(RoleTable.status, 'inactive'));
  check('no role is left inactive by this probe', inactive.length === 0, inactive.length);
}

async function cleanup() {
  if (restore) {
    await db
      .update(RoleTable)
      .set({ status: restore.status, updatedAt: new Date(), updatedBy: 'probe:role-deactivation' })
      .where(eq(RoleTable.id, restore.id));
    console.log(`restored role ${restore.id} to "${restore.status}"`);
  }
}

main()
  .then(async () => {
    await cleanup();
    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch(async (error) => {
    console.error('probe threw:', error);
    await cleanup();
    process.exit(1);
  });
