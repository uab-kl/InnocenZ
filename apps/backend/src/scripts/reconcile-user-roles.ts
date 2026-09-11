/**
 * MAKE `user_role` AGREE WITH THE MEMBERSHIP LANES.
 *
 * Owner, 12 Sep 2026: "yes fix all", on four accounts whose role rows
 * contradicted the job they actually hold.
 *
 * ⚠️ WHY THE TWO DRIFT. Authority belongs to the MEMBERSHIP lane — the server
 * reads `agency_user.sub_role` / `outlet_user.sub_role` and maps it through
 * `portalRoleNameForSubRole`. A `user_role` row is the DOOR: it says which
 * console the account may open at all. Changing somebody's lane updates the
 * membership and leaves the old role row behind, and nothing has ever swept
 * them up. Four had accumulated:
 *
 *   finance@velvet23.my   role outlet/Owner      lane finance
 *   ops@velvet23.my       role outlet/Owner      lane operations_head
 *   jinkgan48@gmail.com   role outlet/Ops Head   lane finance (x3 venues)
 *   outlet@gmail.com      role outlet/Finance    lane owner
 *
 * While `/auth/me` built permissions from those rows, the first two were handed
 * `settings:update` and the portals offered them the Edit button, the Pay
 * button and the payment method. That is fixed at the source — `/auth/me` now
 * reads the lanes — so these rows grant nothing today. They are still WRONG,
 * and the next feature that reads a role row would inherit the same lie.
 *
 * ⚠️ REPLACE, NEVER JUST DELETE. `finance@velvet23.my`'s only outlet role row
 * IS the wrong one; deleting it would lock them out of the venue they staff. So
 * the correct role is granted BEFORE anything is removed, the set is re-read,
 * and a portal is never left with zero rows.
 *
 * Dry run by default — it prints the plan and writes nothing:
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/reconcile-user-roles.ts
 *   npx tsx --tsconfig tsconfig.json src/scripts/reconcile-user-roles.ts --apply
 *
 * Safe to re-run: it is a reconciliation, not a migration, and it is the answer
 * to "this will drift again" — because it will.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import {
  agencyMemberRepository,
  outletMemberRepository,
  userRoleRepository,
} from '@/composition-root.js';
import { PortalTable } from '@/features/rbac/portal/portal.model.js';
import { RoleTable } from '@/features/rbac/role/role.model.js';
import { UserRoleTable } from '@/features/rbac/user-role/user-role.model.js';
import { UserTable } from '@/features/user/user.model.js';
import { portalRoleNameForSubRole } from '@/features/rbac/portal-role-map.js';

const APPLY = process.argv.includes('--apply');
const ACTOR = 'script:reconcile-user-roles';

type Org = 'agency' | 'outlet';

async function main() {
  const users = await db
    .select({ id: UserTable.id, email: UserTable.email })
    .from(UserTable);

  // Every role that exists, by (portal, name) — so a grant can find its id.
  const roles = await db
    .select({
      id: RoleTable.id,
      roleName: RoleTable.roleName,
      portalCode: PortalTable.code,
    })
    .from(RoleTable)
    .leftJoin(PortalTable, eq(RoleTable.portalId, PortalTable.id))
    .where(eq(RoleTable.status, 'active'));
  const roleId = (portal: string, name: string) =>
    roles.find((r) => r.portalCode === portal && r.roleName === name)?.id ?? null;

  let checked = 0;
  const planned: string[] = [];

  for (const user of users) {
    const [agencies, outlets] = await Promise.all([
      agencyMemberRepository.listByUser(user.id),
      outletMemberRepository.listByUser(user.id),
    ]);

    for (const org of ['agency', 'outlet'] as Org[]) {
      const lanes = (
        org === 'agency'
          ? agencies.filter((m) => m.status === 'active').map((m) => m.subRole)
          : outlets.filter((m) => m.status === 'active').map((m) => m.subRole)
      ).filter((l): l is string => Boolean(l));

      /*
       * No active membership on this portal — nothing to reconcile. Removing a
       * role row here would be a DIFFERENT decision (it revokes console access
       * from somebody who may be mid-invite or newly removed), so this script
       * stays out of it deliberately.
       */
      if (lanes.length === 0) continue;
      checked += 1;

      // One row per DISTINCT lane: two venues on the same lane need one role.
      const wanted = [
        ...new Set(lanes.map((l) => portalRoleNameForSubRole(org, l))),
      ];

      const held = await db
        .select({ roleId: RoleTable.id, roleName: RoleTable.roleName })
        .from(UserRoleTable)
        .innerJoin(RoleTable, eq(UserRoleTable.roleId, RoleTable.id))
        .innerJoin(PortalTable, eq(RoleTable.portalId, PortalTable.id))
        .where(
          and(eq(UserRoleTable.userId, user.id), eq(PortalTable.code, org)),
        );

      const heldNames = held.map((h) => h.roleName);
      const missing = wanted.filter((w) => !heldNames.includes(w));
      const extra = held.filter((h) => !wanted.includes(h.roleName));
      if (missing.length === 0 && extra.length === 0) continue;

      planned.push(
        `${user.email} [${org}] lanes=[${[...new Set(lanes)].join(', ')}] ` +
          `holds=[${heldNames.join(', ') || '-'}] ` +
          `grant=[${missing.join(', ') || '-'}] ` +
          `revoke=[${extra.map((e) => e.roleName).join(', ') || '-'}]`,
      );

      if (!APPLY) continue;

      /*
       * GRANT FIRST. The wrong row is sometimes the ONLY row, and removing it
       * before the right one exists would leave the account unable to open a
       * console it legitimately staffs — for however long this loop takes, and
       * permanently if the grant then failed.
       */
      for (const name of missing) {
        const id = roleId(org, name);
        if (!id) {
          console.warn(
            `  ! no ${org} role named "${name}" - skipped for ${user.email}`,
          );
          continue;
        }
        await userRoleRepository.assignRoleToUser({
          userId: user.id,
          roleId: id,
          createdBy: ACTOR,
          updatedBy: ACTOR,
        });
      }

      // Re-read, so nothing is removed on the strength of a stale snapshot.
      const after = await db
        .select({ roleName: RoleTable.roleName })
        .from(UserRoleTable)
        .innerJoin(RoleTable, eq(UserRoleTable.roleId, RoleTable.id))
        .innerJoin(PortalTable, eq(RoleTable.portalId, PortalTable.id))
        .where(
          and(eq(UserRoleTable.userId, user.id), eq(PortalTable.code, org)),
        );
      if (after.filter((a) => wanted.includes(a.roleName)).length === 0) {
        console.warn(
          `  ! ${user.email} [${org}] would be left with no role - nothing removed`,
        );
        continue;
      }
      for (const row of extra) {
        await userRoleRepository.removeRoleFromUser(user.id, row.roleId);
      }
    }
  }

  console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN - nothing written'}`);
  console.log(`portals checked: ${checked}   drifted: ${planned.length}`);
  for (const line of planned) console.log('  - ' + line);
  if (!APPLY && planned.length) console.log('\nre-run with --apply to write.');
  process.exit(0);
}

void main();
