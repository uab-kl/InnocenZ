import 'dotenv/config';

import { and, eq, inArray } from 'drizzle-orm';
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
// Idempotent: upserts by email and rebuilds membership links on every run.
const ACTOR = 'seed-sample';
const PR_ROLE_NAME = 'pr';
const DEMO_PASSWORD = 'Password123!';

type PrSeed = {
  username: string;
  email: string;
  phoneNum: string;
  /** Per-account demo password — falls back to DEMO_PASSWORD. */
  password?: string;
  /** Legal name + ID document captured on the user_profile record. */
  firstName: string;
  lastName: string;
  idType: 'NRIC' | 'Passport' | 'Work permit';
  idNo: string;
  /** Agency codes; first is also written to user_profile.agencyId as primary. */
  agencyCodes: string[];
  /** Optional showcase fields — profile photo, gallery, and comcard details. */
  profileImage?: string;
  portfolioPhotos?: string[];
  gender?: string;
  race?: string;
  nationality?: string;
  dob?: string; // YYYY-MM-DD
  comcardHeightCm?: number;
  comcardWeightKg?: number;
  addressLine1?: string;
  addressLine2?: string;
  postcode?: string;
  state?: string;
  country?: string;
};

const PRS: PrSeed[] = [
  {
    username: 'Nurul Aina',
    email: 'pr.nurul@innocenz.demo',
    phoneNum: '+60123456801',
    firstName: 'Nurul Aina',
    lastName: 'binti Rahman',
    idType: 'NRIC',
    idNo: '920310-14-5521',
    agencyCodes: ['AGY001'],
  },
  {
    username: 'Haziq Iskandar',
    email: 'pr.haziq@innocenz.demo',
    phoneNum: '+60123456802',
    firstName: 'Muhammad Haziq',
    lastName: 'bin Iskandar',
    idType: 'NRIC',
    idNo: '900715-10-6033',
    // Multi-agency sample: Atlas + Delta
    agencyCodes: ['AGY001', 'AGY002'],
  },
  {
    username: 'Mei Ling Tan',
    email: 'pr.meiling@innocenz.demo',
    phoneNum: '+60123456803',
    firstName: 'Tan Mei',
    lastName: 'Ling',
    idType: 'NRIC',
    idNo: '880522-08-5142',
    agencyCodes: ['AGY002'],
  },
  {
    username: 'Arjun Kumar',
    email: 'pr.arjun@innocenz.demo',
    phoneNum: '+60123456804',
    firstName: 'Arjun',
    lastName: 'Kumar a/l Suresh',
    idType: 'NRIC',
    idNo: '950101-14-5389',
    // Multi-agency sample: Delta + Starline
    agencyCodes: ['AGY002', 'AGY003'],
  },
  {
    username: 'Sofia Chong',
    email: 'pr.sofia@innocenz.demo',
    phoneNum: '+60123456805',
    firstName: 'Sofia',
    lastName: 'Chong Wei Xin',
    idType: 'Passport',
    idNo: 'A12345678',
    // Multi-agency sample: Atlas + Starline
    agencyCodes: ['AGY001', 'AGY003'],
  },
  {
    // Full showcase sample — identity mirrors the InnocenZ-proto host profile:
    // nickname Vicky, legal IC name Victoria Tan Mei Lin, IC 950312-14-8821,
    // tied to Atlas Agency + Delta Agency. Comcard: 153cm / 40kg.
    username: 'Vicky',
    email: 'pr.vicky@innocenz.demo',
    // Sign-in ID + password mirror the InnocenZ-proto PR portal demo login
    // (defaultSignInIdentifier "60123456789" / prefilled "password").
    phoneNum: '+60123456789',
    password: 'password',
    firstName: 'Victoria',
    lastName: 'Tan Mei Lin',
    idType: 'NRIC',
    idNo: '950312-14-8821',
    agencyCodes: ['AGY001', 'AGY002'],
    profileImage: '/img/pr/profile/vicky.png',
    portfolioPhotos: [
      '/img/pr/gallery/vicky-1.png',
      '/img/pr/gallery/vicky-2.png',
      '/img/pr/gallery/vicky-3.png',
      '/img/pr/gallery/vicky-4.png',
      '/img/pr/gallery/vicky-comcard.png',
    ],
    gender: 'Female',
    race: 'Chinese',
    nationality: 'Malaysian',
    dob: '1995-03-12', // matches NRIC prefix 950312
    comcardHeightCm: 153,
    comcardWeightKg: 40,
    addressLine1: '12, Jalan Bintang 3',
    addressLine2: 'Bukit Bintang',
    postcode: '55100',
    state: 'Kuala Lumpur',
    country: 'Malaysia',
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

  // Prefer sample agencies, but fall back to any agency matching the demo codes.
  const agencyRows = await db
    .select({
      id: AgencyTable.id,
      agencyCode: AgencyTable.agencyCode,
      createdBy: AgencyTable.createdBy,
    })
    .from(AgencyTable)
    .where(
      inArray(
        AgencyTable.agencyCode,
        Array.from(new Set(PRS.flatMap((pr) => pr.agencyCodes))),
      ),
    );

  const agencyIdByCode = new Map<string, string>();
  for (const row of agencyRows) {
    if (row.createdBy === ACTOR || !agencyIdByCode.has(row.agencyCode)) {
      agencyIdByCode.set(row.agencyCode, row.id);
    }
  }

  if (agencyIdByCode.size === 0) {
    logger.warn(
      '[seed-sample-prs] No sample agencies found — run seed-sample-orgs first. Creating PRs without agency links.',
    );
  }

  const defaultPasswordHash = await hashPassword(DEMO_PASSWORD);
  let membershipCount = 0;
  const seededUserIds: string[] = [];

  for (const pr of PRS) {
    const passwordHash = pr.password
      ? await hashPassword(pr.password)
      : defaultPasswordHash;
    const [existing] = await db
      .select({ id: UserTable.id })
      .from(UserTable)
      .where(eq(UserTable.email, pr.email))
      .limit(1);

    let userId = existing?.id ?? null;

    if (userId) {
      await db
        .update(UserTable)
        .set({
          phoneNum: pr.phoneNum,
          username: pr.username,
          passwordHash,
          profileImage: pr.profileImage ?? DEFAULT_PROFILE_IMAGE,
          status: 'active',
          updatedBy: ACTOR,
          updatedAt: new Date(),
        })
        .where(eq(UserTable.id, userId));
    } else {
      const [created] = await db
        .insert(UserTable)
        .values({
          email: pr.email,
          phoneNum: pr.phoneNum,
          username: pr.username,
          passwordHash,
          profileImage: pr.profileImage ?? DEFAULT_PROFILE_IMAGE,
          status: 'active',
          createdBy: ACTOR,
          updatedBy: ACTOR,
        })
        .returning({ id: UserTable.id });
      userId = created?.id ?? null;
    }

    if (!userId) continue;
    seededUserIds.push(userId);

    const primaryAgencyId = pr.agencyCodes
      .map((code) => agencyIdByCode.get(code))
      .find(Boolean);

    const [existingProfile] = await db
      .select({ id: UserProfileTable.id })
      .from(UserProfileTable)
      .where(eq(UserProfileTable.userId, userId))
      .limit(1);

    const profileValues = {
      firstName: pr.firstName,
      lastName: pr.lastName,
      idType: pr.idType,
      idNo: pr.idNo,
      gender: pr.gender ?? null,
      race: pr.race ?? null,
      nationality: pr.nationality ?? null,
      dob: pr.dob ?? null,
      portfolioPhotos: pr.portfolioPhotos ?? null,
      comcardHeightCm: pr.comcardHeightCm ?? null,
      comcardWeightKg: pr.comcardWeightKg ?? null,
      addressLine1: pr.addressLine1 ?? null,
      addressLine2: pr.addressLine2 ?? null,
      postcode: pr.postcode ?? null,
      state: pr.state ?? null,
      country: pr.country ?? null,
      verificationStatus: 'verified' as const,
      underAgency: Boolean(primaryAgencyId),
      agencyId: primaryAgencyId ?? null,
      updatedBy: ACTOR,
      updatedAt: new Date(),
    };

    if (existingProfile) {
      await db
        .update(UserProfileTable)
        .set(profileValues)
        .where(eq(UserProfileTable.userId, userId));
    } else {
      await db.insert(UserProfileTable).values({
        userId,
        ...profileValues,
        createdBy: ACTOR,
      });
    }

    const [existingRole] = await db
      .select({ id: UserRoleTable.id })
      .from(UserRoleTable)
      .where(
        and(eq(UserRoleTable.userId, userId), eq(UserRoleTable.roleId, prRole.id)),
      )
      .limit(1);

    if (!existingRole) {
      await db.insert(UserRoleTable).values({
        userId,
        roleId: prRole.id,
        createdBy: ACTOR,
        updatedBy: ACTOR,
      });
    }

    // Rebuild this PR's agency links so multi-agency samples stay accurate.
    await db
      .delete(AgencyMemberTable)
      .where(
        and(
          eq(AgencyMemberTable.userId, userId),
          eq(AgencyMemberTable.subRole, 'pr'),
        ),
      );

    for (const code of pr.agencyCodes) {
      const agencyId = agencyIdByCode.get(code);
      if (!agencyId) {
        logger.warn(`[seed-sample-prs] Agency ${code} missing — skip link for ${pr.email}`);
        continue;
      }
      await db.insert(AgencyMemberTable).values({
        agencyId,
        userId,
        subRole: 'pr',
        status: 'active',
        createdBy: ACTOR,
        updatedBy: ACTOR,
      });
      membershipCount += 1;
    }
  }

  logger.info(
    `[seed-sample-prs] Done. ${seededUserIds.length} PR users, ${membershipCount} agency links (password: ${DEMO_PASSWORD}).`,
  );
  logger.info(
    '[seed-sample-prs] Multi-agency demos: Haziq → AGY001+AGY002, Arjun → AGY002+AGY003, Sofia → AGY001+AGY003.',
  );
}

seedSamplePrs()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('[seed-sample-prs] Error:', error);
    process.exit(1);
  });
