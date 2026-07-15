import 'dotenv/config';

import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { UserTable } from '@/features/user/user.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import { RoleTable } from '@/features/rbac/role/role.model';
import { UserRoleTable } from '@/features/rbac/user-role/user-role.model';
import { AgencyMemberTable, AgencyTable } from '@/features/agency/agency.model';
import { hashPassword } from '@/util/password';
import { DEFAULT_PROFILE_IMAGE } from '@/util/profile-image';
import { logger } from '@/util/logger';

// Demo PR (promoter) users so the admin PR list page shows real accounts.
// Each PR = a user + user_profile + a user_role link to the 'pr' role.
// Linked to sample agencies via agency_member (subRole=pr). A PR can belong
// to more than one agency — membership rows are the source of truth.
// Idempotent: rows are stamped createdBy='seed-sample' and re-running wipes them first.
const ACTOR = 'seed-sample';
const PR_ROLE_NAME = 'pr';
const DEMO_PASSWORD = 'Password123!';

type PrSeed = {
  username: string;
  email: string;
  phoneNum: string;
  /** Agency codes; first is also written to user_profile.agencyId as primary. */
  agencyCodes: string[];
};

const PRS: PrSeed[] = [
  {
    username: 'Nurul Aina',
    email: 'pr.nurul@innocenz.demo',
    phoneNum: '+60123456801',
    agencyCodes: ['AGY001'],
  },
  {
    username: 'Haziq Iskandar',
    email: 'pr.haziq@innocenz.demo',
    phoneNum: '+60123456802',
    agencyCodes: ['AGY001', 'AGY002'],
  },
  {
    username: 'Mei Ling Tan',
    email: 'pr.meiling@innocenz.demo',
    phoneNum: '+60123456803',
    agencyCodes: ['AGY002'],
  },
  {
    username: 'Arjun Kumar',
    email: 'pr.arjun@innocenz.demo',
    phoneNum: '+60123456804',
    agencyCodes: ['AGY002', 'AGY003'],
  },
  {
    username: 'Sofia Chong',
    email: 'pr.sofia@innocenz.demo',
    phoneNum: '+60123456805',
    agencyCodes: ['AGY001', 'AGY003'],
  },
];

export async function seedSamplePrs(): Promise<void> {
  const [prRole] = await db
    .select({ id: RoleTable.id })
    .from(RoleTable)
    .where(eq(RoleTable.roleName, PR_ROLE_NAME))
    .limit(1);

  if (!prRole) {
    logger.warn('[seed-sample-prs] PR role not found — run init-roles first.');
    return;
  }

  const agencyRows = await db
    .select({ id: AgencyTable.id, agencyCode: AgencyTable.agencyCode })
    .from(AgencyTable)
    .where(eq(AgencyTable.createdBy, ACTOR));
  const agencyIdByCode = new Map(agencyRows.map((row) => [row.agencyCode, row.id]));

  if (agencyIdByCode.size === 0) {
    logger.warn(
      '[seed-sample-prs] No sample agencies found — run seed-sample-orgs first. Creating PRs without agency links.',
    );
  }

  // Clear prior sample rows (children first to respect FKs).
  await db.delete(AgencyMemberTable).where(eq(AgencyMemberTable.createdBy, ACTOR));
  await db.delete(UserRoleTable).where(eq(UserRoleTable.createdBy, ACTOR));
  await db.delete(UserProfileTable).where(eq(UserProfileTable.createdBy, ACTOR));
  await db.delete(UserTable).where(eq(UserTable.createdBy, ACTOR));

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  let membershipCount = 0;

  for (const pr of PRS) {
    const [user] = await db
      .insert(UserTable)
      .values({
        email: pr.email,
        phoneNum: pr.phoneNum,
        username: pr.username,
        passwordHash,
        profileImage: DEFAULT_PROFILE_IMAGE,
        status: 'active',
        createdBy: ACTOR,
        updatedBy: ACTOR,
      })
      .returning({ id: UserTable.id });

    if (!user) continue;

    const primaryAgencyId = pr.agencyCodes
      .map((code) => agencyIdByCode.get(code))
      .find(Boolean);

    await db.insert(UserProfileTable).values({
      userId: user.id,
      underAgency: Boolean(primaryAgencyId),
      agencyId: primaryAgencyId ?? null,
      createdBy: ACTOR,
      updatedBy: ACTOR,
    });

    await db.insert(UserRoleTable).values({
      userId: user.id,
      roleId: prRole.id,
      createdBy: ACTOR,
      updatedBy: ACTOR,
    });

    for (const code of pr.agencyCodes) {
      const agencyId = agencyIdByCode.get(code);
      if (!agencyId) {
        logger.warn(`[seed-sample-prs] Agency ${code} missing — skip link for ${pr.email}`);
        continue;
      }
      await db.insert(AgencyMemberTable).values({
        agencyId,
        userId: user.id,
        subRole: 'pr',
        status: 'active',
        createdBy: ACTOR,
        updatedBy: ACTOR,
      });
      membershipCount += 1;
    }
  }

  logger.info(
    `[seed-sample-prs] Done. ${PRS.length} PR users, ${membershipCount} agency links (password: ${DEMO_PASSWORD}).`,
  );
}

seedSamplePrs()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('[seed-sample-prs] Error:', error);
    process.exit(1);
  });
