/**
 * Two checks after the "everyone is female, the IC follows" pass:
 *  1. every stored gender reads female, and every NRIC's last digit is even;
 *  2. which lane roles actually HAVE accounts — a role with zero holders cannot
 *     be called complete, it simply was never tested.
 *
 * READ-ONLY.
 *   cd apps/backend && npx tsx --tsconfig tsconfig.json src/scripts/_probe-gender-ic.ts
 */
import 'dotenv/config';

import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { UserTable } from '@/features/user/user.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import { RoleTable } from '@/features/rbac/role/role.model';
import { PortalTable } from '@/features/rbac/portal/portal.model';
import { UserRoleTable } from '@/features/rbac/user-role/user-role.model';
import { dobFromNric } from '@/features/pr-personnel/ic-dob';

async function main() {
  const rows = await db
    .select({
      username: UserTable.username,
      gender: UserProfileTable.gender,
      idNo: UserProfileTable.idNo,
      idType: UserProfileTable.idType,
      dob: UserProfileTable.dob,
    })
    .from(UserTable)
    .leftJoin(UserProfileTable, eq(UserProfileTable.userId, UserTable.id));

  const notFemale = rows.filter((r) => (r.gender ?? '').toLowerCase() !== 'female');
  const oddIc = rows.filter((r) => {
    if (!r.idNo || !dobFromNric(r.idNo)) return false;
    const digits = r.idNo.replace(/\D/g, '');
    return Number(digits[digits.length - 1]) % 2 === 1;
  });
  const icDobClash = rows.filter((r) => {
    const fromIc = r.idNo ? dobFromNric(r.idNo) : null;
    return Boolean(fromIc && r.dob && fromIc !== r.dob);
  });

  console.log(`\naccounts                    : ${rows.length}`);
  console.log(`gender not female           : ${notFemale.length}`);
  for (const r of notFemale) console.log(`   ${r.username} = ${r.gender}`);
  console.log(`NRICs with an ODD last digit: ${oddIc.length}`);
  for (const r of oddIc) console.log(`   ${r.username} = ${r.idNo}`);
  console.log(`IC vs dob column mismatches : ${icDobClash.length}`);
  for (const r of icDobClash) {
    console.log(`   ${r.username}: IC ${r.idNo} -> ${dobFromNric(r.idNo)} vs dob ${r.dob}`);
  }

  // ── who actually holds each lane role ──
  const roles = await db
    .select({ roleName: RoleTable.roleName, portalCode: PortalTable.code, roleId: RoleTable.id })
    .from(RoleTable)
    .leftJoin(PortalTable, eq(PortalTable.id, RoleTable.portalId));

  const holders = await db.select({ roleId: UserRoleTable.roleId }).from(UserRoleTable);
  const count = new Map<string, number>();
  for (const h of holders) count.set(h.roleId, (count.get(h.roleId) ?? 0) + 1);

  console.log('\nseeded roles and how many accounts hold each:');
  for (const r of roles.sort((a, b) =>
    `${a.portalCode}${a.roleName}`.localeCompare(`${b.portalCode}${b.roleName}`),
  )) {
    const n = count.get(r.roleId) ?? 0;
    console.log(
      `   ${n === 0 ? 'EMPTY ' : '      '}${(r.portalCode ?? '-').padEnd(8)} ${r.roleName.padEnd(12)} ${n} account(s)`,
    );
  }
  console.log('');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
