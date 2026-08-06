/**
 * Diagnose + fix portal role for a user email (default junyu8522@gmail.com).
 *   pnpm tsx --tsconfig tsconfig.json src/scripts/fix-user-portal-role.ts
 *   pnpm tsx --tsconfig tsconfig.json src/scripts/fix-user-portal-role.ts --apply
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { UserTable } from '@/features/user/user.model.js';
import { RoleTable } from '@/features/rbac/role/role.model.js';
import { UserRoleTable } from '@/features/rbac/user-role/user-role.model.js';
import { AgencyUserTable, AgencyTable } from '@/features/agency/agency.model.js';
import { OutletUserTable, OutletTable } from '@/features/outlet/outlet.model.js';
import { PortalTable } from '@/features/rbac/portal/portal.model.js';

const APPLY = process.argv.includes('--apply');
const emailArg = process.argv.find((a) => a.includes('@'));
const EMAIL = (emailArg ?? 'junyu8522@gmail.com').trim().toLowerCase();
const ACTOR = 'fix-user-portal-role';

async function main() {
  const [user] = await db
    .select({
      id: UserTable.id,
      email: UserTable.email,
      username: UserTable.username,
      status: UserTable.status,
    })
    .from(UserTable)
    .where(sql`lower(${UserTable.email}) = ${EMAIL}`)
    .limit(1);

  if (!user) {
    console.log(`No user with email ${EMAIL}`);
    process.exit(1);
  }

  console.log('\nUSER', user);

  const roles = await db
    .select({
      userRoleId: UserRoleTable.id,
      roleId: RoleTable.id,
      roleName: RoleTable.roleName,
      portalId: RoleTable.portalId,
      portalCode: PortalTable.code,
    })
    .from(UserRoleTable)
    .innerJoin(RoleTable, eq(UserRoleTable.roleId, RoleTable.id))
    .leftJoin(PortalTable, eq(RoleTable.portalId, PortalTable.id))
    .where(eq(UserRoleTable.userId, user.id));

  console.log('\nROLES', roles.length ? roles : '(none)');

  const agencyMem = await db
    .select({
      id: AgencyUserTable.id,
      status: AgencyUserTable.status,
      agencyName: AgencyTable.name,
      agencyStatus: AgencyTable.status,
    })
    .from(AgencyUserTable)
    .innerJoin(AgencyTable, eq(AgencyUserTable.agencyId, AgencyTable.id))
    .where(eq(AgencyUserTable.userId, user.id));

  console.log('\nAGENCY MEMBERSHIP', agencyMem.length ? agencyMem : '(none)');

  const outletMem = await db
    .select({
      id: OutletUserTable.id,
      status: OutletUserTable.status,
      outletName: OutletTable.name,
      outletStatus: OutletTable.status,
    })
    .from(OutletUserTable)
    .innerJoin(OutletTable, eq(OutletUserTable.outletId, OutletTable.id))
    .where(eq(OutletUserTable.userId, user.id));

  console.log('\nOUTLET MEMBERSHIP', outletMem.length ? outletMem : '(none)');

  const needAgency = agencyMem.some((m) => m.status === 'active');
  const needOutlet = outletMem.some((m) => m.status === 'active');
  const hasAgency = roles.some(
    (r) => r.portalCode === 'agency' || r.roleName === 'agency' || r.roleName === 'Owner',
  );
  const hasOutlet = roles.some(
    (r) => r.portalCode === 'outlet' || r.roleName === 'outlet' || r.roleName === 'Owner',
  );
  const hasAdmin = roles.some((r) => r.roleName === 'admin');

  const toGrant: Array<{ roleName: string; portal: 'agency' | 'outlet' }> = [];
  if (needAgency && !roles.some((r) => r.portalCode === 'agency')) {
    toGrant.push({ roleName: 'Owner', portal: 'agency' });
  }
  if (needOutlet && !roles.some((r) => r.portalCode === 'outlet')) {
    toGrant.push({ roleName: 'Owner', portal: 'outlet' });
  }
  if (!needAgency && !needOutlet && !hasAdmin && roles.length === 0) {
    console.log(
      '\nNo org membership and no roles — cannot infer portal. Assign manually in admin.',
    );
  }

  console.log('\nPLAN', {
    needAgency,
    needOutlet,
    hasAgency,
    hasOutlet,
    hasAdmin,
    toGrant,
  });

  if (!APPLY || toGrant.length === 0) {
    if (!APPLY && toGrant.length > 0) {
      console.log(
        '\nDry run. Re-run with --apply to grant:',
        toGrant.map((g) => `${g.roleName}@${g.portal}`).join(', '),
      );
    } else if (toGrant.length === 0 && (hasAgency || hasOutlet || hasAdmin)) {
      console.log('\nUser already has a portal role — check frontend redirect / session.');
    }
    process.exit(0);
  }

  for (const g of toGrant) {
    const [portal] = await db
      .select({ id: PortalTable.id })
      .from(PortalTable)
      .where(eq(PortalTable.code, g.portal))
      .limit(1);
    if (!portal) throw new Error(`Missing portal ${g.portal}`);
    const [role] = await db
      .select({ id: RoleTable.id })
      .from(RoleTable)
      .where(and(eq(RoleTable.roleName, g.roleName), eq(RoleTable.portalId, portal.id)))
      .limit(1);
    if (!role) throw new Error(`Missing role ${g.roleName}@${g.portal}`);
    const [existing] = await db
      .select({ id: UserRoleTable.id })
      .from(UserRoleTable)
      .where(
        and(eq(UserRoleTable.userId, user.id), eq(UserRoleTable.roleId, role.id)),
      )
      .limit(1);
    if (existing) continue;
    await db.insert(UserRoleTable).values({
      userId: user.id,
      roleId: role.id,
      createdBy: ACTOR,
      updatedBy: ACTOR,
    });
    console.log(`Granted role: ${g.roleName}@${g.portal}`);
  }

  console.log('\nDone. Sign out and sign in again.\n');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
