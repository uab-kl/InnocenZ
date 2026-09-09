/**
 * What every ACCOUNT — PR, admin, and every agency/outlet lane role — is still
 * missing on its person record.
 *
 * READ-ONLY. Run before and after any backfill.
 *   cd apps/backend && npx tsx --tsconfig tsconfig.json src/scripts/_probe-account-parity.ts
 *
 * Two things this deliberately does NOT do:
 *  - It does not treat every null column as a gap. `gender` and `race` sit on
 *    user_profile and render on the admin PR sheet, but the sign-up wizard never
 *    asks for either, so counting them would report a hole no PR can fill.
 *  - It does not judge a lane role against the PR field set. An invited Finance
 *    user has no comcard and no portfolio; scoring them against a promoter's
 *    wizard would bury the fields that DO matter for them under noise.
 */
import 'dotenv/config';

import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { UserTable } from '@/features/user/user.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import { RoleTable } from '@/features/rbac/role/role.model';
import { PortalTable } from '@/features/rbac/portal/portal.model';
import { UserRoleTable } from '@/features/rbac/user-role/user-role.model';
import { AgencyPrTable } from '@/features/pr-personnel/pr.model';
import { dobFromNric, ageFromDob } from '@/features/pr-personnel/ic-dob';

/** Person fields the PR mobile wizard captures, by step (screens/sign-up/types.ts). */
const PR_STEPS: Array<[string, string[]]> = [
  [
    'Step 1 Persona',
    [
      'username',
      'fullName',
      'phoneNum',
      'email',
      'nationality',
      'idType',
      'idNo',
      'dob',
      'comcardHeightCm',
      'comcardWeightKg',
      'comcardBustCm',
      'comcardWaistCm',
      'comcardHipCm',
      'languages',
    ],
  ],
  ['Step 2 Address', ['addressLine1', 'city', 'postcode', 'state', 'country']],
  ['Step 3 Agency', ['agencyMembership']],
  ['Step 4 ID photos', ['idPhotoFront', 'idPhotoBack']],
  ['Step 5 Photos', ['profileImage', 'portfolioPhotos']],
];

/**
 * Person fields a WEB account (owner or invited lane role) is expected to hold.
 * Identity only — no comcard, no portfolio, no agency membership.
 */
const WEB_FIELDS: Array<[string, string[]]> = [
  ['Account', ['username', 'email', 'phoneNum']],
  ['Identity', ['fullName', 'idType', 'idNo', 'dob', 'nationality']],
  ['Address', ['addressLine1', 'city', 'postcode', 'state', 'country']],
  ['Signing', ['signatureInk']],
];

const PR_FIELDS = PR_STEPS.flatMap(([, f]) => f);
const WEB_FIELD_LIST = WEB_FIELDS.flatMap(([, f]) => f);

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

async function main() {
  const rows = await db
    .select({
      id: UserTable.id,
      username: UserTable.username,
      email: UserTable.email,
      phoneNum: UserTable.phoneNum,
      profileImage: UserTable.profileImage,
      status: UserTable.status,
      profileId: UserProfileTable.id,
      fullName: UserProfileTable.fullName,
      nationality: UserProfileTable.nationality,
      gender: UserProfileTable.gender,
      race: UserProfileTable.race,
      idType: UserProfileTable.idType,
      idNo: UserProfileTable.idNo,
      dob: UserProfileTable.dob,
      languages: UserProfileTable.languages,
      portfolioPhotos: UserProfileTable.portfolioPhotos,
      comcardHeightCm: UserProfileTable.comcardHeightCm,
      comcardWeightKg: UserProfileTable.comcardWeightKg,
      comcardBustCm: UserProfileTable.comcardBustCm,
      comcardWaistCm: UserProfileTable.comcardWaistCm,
      comcardHipCm: UserProfileTable.comcardHipCm,
      addressLine1: UserProfileTable.addressLine1,
      addressLine2: UserProfileTable.addressLine2,
      city: UserProfileTable.city,
      postcode: UserProfileTable.postcode,
      state: UserProfileTable.state,
      country: UserProfileTable.country,
      idPhotoFront: UserProfileTable.idPhotoFront,
      idPhotoBack: UserProfileTable.idPhotoBack,
      bankName: UserProfileTable.bankName,
      bankAccountNo: UserProfileTable.bankAccountNo,
      signatureInk: UserProfileTable.signatureInk,
      verificationStatus: UserProfileTable.verificationStatus,
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
    const label = r.portalCode ? `${r.portalCode}:${r.roleName}` : r.roleName;
    const list = rolesByUser.get(r.userId) ?? [];
    if (!list.includes(label)) list.push(label);
    rolesByUser.set(r.userId, list);
  }

  const memberships = await db.select({ userId: AgencyPrTable.userId }).from(AgencyPrTable);
  const hasAgency = new Set(memberships.map((m) => m.userId));

  type Row = (typeof rows)[number];
  const value = (row: Row, field: string): unknown => {
    if (field === 'agencyMembership') return hasAgency.has(row.id) ? 'yes' : null;
    return (row as unknown as Record<string, unknown>)[field];
  };

  const buckets = new Map<
    string,
    Array<{ row: Row; roles: string[]; missing: string[]; ic: string }>
  >();
  const tally = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const roles = rolesByUser.get(row.id) ?? ['(no role)'];
    const isPr = roles.includes('pr');
    const isAdminOnly = roles.length === 1 && roles[0] === 'admin';
    const bucket = isPr ? 'PR (mobile sign-up)' : isAdminOnly ? 'Admin' : 'Web portal account';
    const fields = isPr ? PR_FIELDS : WEB_FIELD_LIST;

    const missing = fields.filter((f) => isBlank(value(row, f)));
    const t = tally.get(bucket) ?? new Map<string, number>();
    for (const f of missing) t.set(f, (t.get(f) ?? 0) + 1);
    tally.set(bucket, t);

    // The age rule: an NRIC's first six digits ARE the birth date, so a stored
    // dob that disagrees is a real inconsistency, not a formatting nit.
    const fromIc = dobFromNric(row.idNo);
    let ic: string;
    if (!row.idNo) ic = 'NO ID NUMBER';
    else if (row.idType && row.idType !== 'NRIC') ic = `${row.idType} ${row.idNo} (carries no date)`;
    else if (!fromIc) ic = `UNPARSEABLE as NRIC: "${row.idNo}"`;
    else if (row.dob && row.dob !== fromIc) ic = `CONFLICT - IC ${fromIc} vs dob ${row.dob}`;
    else ic = `ok ${fromIc} -> age ${ageFromDob(fromIc)}${row.dob ? '' : ' (dob column empty)'}`;

    const list = buckets.get(bucket) ?? [];
    list.push({ row, roles, missing, ic });
    buckets.set(bucket, list);
  }

  console.log(`\n================ ACCOUNT PARITY - ${rows.length} accounts ================`);

  for (const [bucket, list] of buckets) {
    const fieldGroups = bucket.startsWith('PR') ? PR_STEPS : WEB_FIELDS;
    const complete = list.filter((e) => e.missing.length === 0).length;
    console.log(`\n\n########## ${bucket} - ${list.length} accounts ##########`);
    console.log(`  complete: ${complete}    incomplete: ${list.length - complete}`);
    console.log('\n  --- missing-field tally ---');
    const t = tally.get(bucket) ?? new Map<string, number>();
    for (const [group, fields] of fieldGroups) {
      console.log(`   ${group}`);
      for (const f of fields) {
        const n = t.get(f) ?? 0;
        console.log(`     ${n === 0 ? '  ok' : 'MISS'} ${f.padEnd(18)} ${n}/${list.length}`);
      }
    }
    console.log('\n  --- per account ---');
    list.sort((a, b) => b.missing.length - a.missing.length);
    for (const e of list) {
      console.log(
        `\n   ${e.row.username ?? '(no username)'}  [${e.roles.join(', ')}]  ${e.row.status}` +
          `\n     id      ${e.row.id}` +
          `\n     name    ${e.row.fullName ?? '-'}` +
          `\n     email   ${e.row.email ?? '-'}   phone ${e.row.phoneNum ?? '-'}` +
          `\n     profile ${e.row.profileId ? 'user_profile row present' : 'NO user_profile ROW'}` +
          `\n     ic      ${e.ic}` +
          `\n     missing ${e.missing.length ? `(${e.missing.length}) ${e.missing.join(', ')}` : 'nothing'}`,
      );
    }
  }
  console.log('');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
