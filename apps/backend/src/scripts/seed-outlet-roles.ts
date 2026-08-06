import 'dotenv/config';

import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { OutletUserTable, OutletTable } from '@/features/outlet/outlet.model';
import { RoleTable } from '@/features/rbac/role/role.model';
import { UserRoleTable } from '@/features/rbac/user-role/user-role.model';
import { UserTable } from '@/features/user/user.model';
import { logger } from '@/util/logger';

// Grants the `outlet` role to every user who holds an active outlet_member row.
//
// seed-sample-orgs creates outlet staff (owner / finance / operations_head) and
// their outlet_member links but never writes user_role, so those accounts could
// sign in yet had no role. The web login switches on the role to pick a portal,
// so a roleless account falls through to /no-access even though its credentials
// and outlet membership are both valid.
//
// Derived from outlet_member rather than a hardcoded list, so outlet staff added
// later are covered by a re-run. Additive and idempotent: only missing user_role
// rows are inserted, nothing is updated or deleted.
const ACTOR = 'seed-outlet-roles';
const OUTLET_ROLE_NAME = 'outlet';

export async function seedOutletRoles(): Promise<void> {
  const [outletRole] = await db
    .select({ id: RoleTable.id })
    .from(RoleTable)
    .where(eq(RoleTable.roleName, OUTLET_ROLE_NAME))
    .limit(1);

  if (!outletRole) {
    logger.warn('[seed-outlet-roles] Outlet role not found — run init-roles/seed-rbac first');
    return;
  }

  const members = await db
    .select({
      userId: OutletUserTable.userId,
      email: UserTable.email,
      username: UserTable.username,
      outletName: OutletTable.name,
    })
    .from(OutletUserTable)
    .innerJoin(UserTable, eq(UserTable.id, OutletUserTable.userId))
    .innerJoin(OutletTable, eq(OutletTable.id, OutletUserTable.outletId))
    .where(eq(OutletUserTable.status, 'active'));

  if (members.length === 0) {
    logger.warn('[seed-outlet-roles] No active outlet members found — run seed-sample-orgs first');
    return;
  }

  // One user can staff several outlets; the role only needs granting once.
  const seen = new Set<string>();
  let granted = 0;
  let alreadyHad = 0;

  for (const member of members) {
    if (seen.has(member.userId)) continue;
    seen.add(member.userId);

    const [existing] = await db
      .select({ id: UserRoleTable.id })
      .from(UserRoleTable)
      .where(
        and(eq(UserRoleTable.userId, member.userId), eq(UserRoleTable.roleId, outletRole.id)),
      )
      .limit(1);

    if (existing) {
      alreadyHad += 1;
      continue;
    }

    await db.insert(UserRoleTable).values({
      userId: member.userId,
      roleId: outletRole.id,
      createdBy: ACTOR,
      updatedBy: ACTOR,
    });
    granted += 1;
    logger.info(
      `  granted outlet role → ${member.email ?? member.username} (@ ${member.outletName})`,
    );
  }

  logger.info(
    `[seed-outlet-roles] Done. ${granted} granted, ${alreadyHad} already had it, ${seen.size} distinct outlet user(s).`,
  );
}

const isDirectRun = process.argv[1]?.includes('seed-outlet-roles');
if (isDirectRun) {
  seedOutletRoles()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error('[seed-outlet-roles] Error:', error);
      process.exit(1);
    });
}
