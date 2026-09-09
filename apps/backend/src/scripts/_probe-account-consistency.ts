/**
 * The single question this answers: is EVERY account complete, and do the name,
 * the gender, the IC's parity digit and the age all agree?
 *
 * READ-ONLY. It re-derives everything from the row rather than trusting the last
 * run's console output — a script reporting on its own writes is not evidence.
 * `_probe-account-parity.ts` checks PRESENCE; this one checks AGREEMENT.
 *
 *   cd apps/backend && npx tsx --tsconfig tsconfig.json src/scripts/_probe-account-consistency.ts
 */
import 'dotenv/config';

import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { UserTable } from '@/features/user/user.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import { RoleTable } from '@/features/rbac/role/role.model';
import { PortalTable } from '@/features/rbac/portal/portal.model';
import { UserRoleTable } from '@/features/rbac/user-role/user-role.model';
import { dobFromNric, ageFromDob } from '@/features/pr-personnel/ic-dob';

const TODAY = new Date('2026-09-08T00:00:00Z');

/**
 * Explicit patronymics only — `binti`/`a/p` and `bin`/`a/l` are the one part of
 * a name that STATES a gender rather than hinting at one. Given-name lists are
 * deliberately not consulted here: this is a check, and a check built from the
 * same guesswork as the writer would only ever confirm the writer.
 */
function nameSaysGender(name: string): 'male' | 'female' | null {
  const n = ` ${name.toLowerCase().replace(/[^a-z/ ]/g, ' ').replace(/\s+/g, ' ')} `;
  if (/ (binti|bt|a\/p) /.test(n)) return 'female';
  if (/ (bin|a\/l) /.test(n)) return 'male';
  return null;
}

async function main() {
  const rows = await db
    .select({
      id: UserTable.id,
      username: UserTable.username,
      email: UserTable.email,
      phoneNum: UserTable.phoneNum,
      fullName: UserProfileTable.fullName,
      gender: UserProfileTable.gender,
      idType: UserProfileTable.idType,
      idNo: UserProfileTable.idNo,
      dob: UserProfileTable.dob,
      idPhotoFront: UserProfileTable.idPhotoFront,
      bankAccountNo: UserProfileTable.bankAccountNo,
      addressLine1: UserProfileTable.addressLine1,
    })
    .from(UserTable)
    .leftJoin(UserProfileTable, eq(UserProfileTable.userId, UserTable.id));

  const roleRows = await db
    .select({
      userId: UserRoleTable.userId,
      roleName: RoleTable.roleName,
      portalCode: PortalTable.code,
    })
    .from(UserRoleTable)
    .innerJoin(RoleTable, eq(RoleTable.id, UserRoleTable.roleId))
    .leftJoin(PortalTable, eq(PortalTable.id, RoleTable.portalId));
  const rolesByUser = new Map<string, string[]>();
  for (const r of roleRows) {
    const list = rolesByUser.get(r.userId) ?? [];
    list.push(r.portalCode ? `${r.portalCode}:${r.roleName}` : r.roleName);
    rolesByUser.set(r.userId, list);
  }

  const problems: string[] = [];
  const seenIc = new Map<string, string>();
  const seenPhone = new Map<string, string>();
  const seenBank = new Map<string, string>();
  let prs = 0;
  let web = 0;

  for (const row of rows) {
    const who = `${row.username ?? '(no username)'}`;
    const roles = rolesByUser.get(row.id) ?? [];
    if (roles.includes('pr')) prs += 1;
    else web += 1;

    // 1. credentials — the identifiers somebody actually signs in with
    if (!row.email?.trim() && !row.phoneNum?.trim()) {
      problems.push(`${who}: no email AND no phone`);
    }

    // 2. the record is filled
    for (const [label, value] of [
      ['legal name', row.fullName],
      ['IC number', row.idNo],
      ['date of birth', row.dob],
      ['address', row.addressLine1],
      ['bank account', row.bankAccountNo],
      ['gender', row.gender],
    ] as const) {
      if (!String(value ?? '').trim()) problems.push(`${who}: missing ${label}`);
    }
    if (!row.idPhotoFront?.trim()) problems.push(`${who}: no IC photo (front)`);

    // 3. the IC agrees with the age
    const fromIc = dobFromNric(row.idNo, TODAY);
    if (row.idType === 'NRIC' && !fromIc) {
      problems.push(`${who}: IC "${row.idNo}" is not a valid NRIC`);
    }
    if (fromIc && row.dob && fromIc !== row.dob) {
      problems.push(`${who}: IC says ${fromIc} but dob column says ${row.dob}`);
    }
    if (fromIc && ageFromDob(fromIc, TODAY) === null) {
      problems.push(`${who}: IC yields no age`);
    }

    // 4. the IC agrees with the gender
    if (fromIc && row.idNo) {
      const digits = row.idNo.replace(/\D/g, '');
      const icGender = Number(digits[digits.length - 1]) % 2 === 1 ? 'male' : 'female';
      if (icGender !== (row.gender ?? '').toLowerCase()) {
        problems.push(`${who}: gender ${row.gender} but IC digit says ${icGender}`);
      }
    }

    // 5. the name does not contradict the gender
    const said = nameSaysGender(row.fullName ?? '');
    if (said && said !== (row.gender ?? '').toLowerCase()) {
      problems.push(`${who}: name "${row.fullName}" says ${said} but gender is ${row.gender}`);
    }

    // 6. nothing shared that must be unique
    for (const [label, value, seen] of [
      ['IC', row.idNo?.replace(/\D/g, ''), seenIc],
      ['phone', row.phoneNum?.replace(/\D/g, ''), seenPhone],
      ['bank account', row.bankAccountNo?.trim(), seenBank],
    ] as const) {
      if (!value) continue;
      const prior = seen.get(value);
      if (prior) problems.push(`${who}: duplicate ${label} shared with ${prior}`);
      else seen.set(value, who);
    }
  }

  console.log(`\naccounts checked : ${rows.length}  (${prs} PR, ${web} web/admin)`);
  console.log(`problems found   : ${problems.length}`);
  for (const p of problems) console.log(`   ! ${p}`);
  if (problems.length === 0) {
    console.log('\nEvery account has sign-in identifiers and a complete record;');
    console.log('IC <-> age and IC <-> gender agree on all of them; no duplicates.');
  }
  console.log('');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
