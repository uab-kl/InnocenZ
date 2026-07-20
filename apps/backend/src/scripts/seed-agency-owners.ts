import 'dotenv/config';

import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { AgencyMemberTable, AgencyTable } from '@/features/agency/agency.model';
import { RoleTable } from '@/features/rbac/role/role.model';
import { UserRoleTable } from '@/features/rbac/user-role/user-role.model';
import { UserTable } from '@/features/user/user.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import { hashPassword } from '@/util/password';
import { logger } from '@/util/logger';

// Gives every agency org an operator account that can actually sign in to the
// agency portal. An agency-scoped request needs BOTH halves: the `agency` role
// (route guard) and an agency_member row (controller scope resolution). Until
// this ran, no user in the DB had both.
//
// Additive and idempotent: agencies are matched by agencyCode and never
// rewritten, so existing agency ids — and the PR memberships hanging off them —
// are left untouched. Re-running only re-syncs the owner accounts.
const ACTOR = 'seed-agency-owners';
const OWNER_PASSWORD = 'Password123!';

// Each owner reuses its agency's own contactEmail/contactName so the login
// matches what the admin Agency page already displays for that org.
const AGENCY_CODES = ['AGY001', 'AGY002', 'AGY003'] as const;

async function agencyRoleId(): Promise<string | null> {
  const [row] = await db
    .select({ id: RoleTable.id })
    .from(RoleTable)
    .where(eq(RoleTable.roleName, 'agency'))
    .limit(1);
  return row?.id ?? null;
}

/**
 * `user.phone_num` is UNIQUE and the agency contact numbers overlap with numbers
 * already seeded on other users, so a contact phone is only claimed when it is
 * genuinely free. Login is by email, so dropping it costs nothing.
 */
async function claimablePhone(
  phone: string | null,
  selfUserId: string | null,
): Promise<string | null> {
  if (!phone) return null;
  const [holder] = await db
    .select({ id: UserTable.id })
    .from(UserTable)
    .where(eq(UserTable.phoneNum, phone))
    .limit(1);
  if (!holder) return phone;
  return holder.id === selfUserId ? phone : null;
}

/** Upsert by email — never clobbers an unrelated existing account's password. */
async function upsertOwnerUser(params: {
  email: string;
  username: string;
  phoneNum: string | null;
  passwordHash: string;
}): Promise<{ id: string; created: boolean } | null> {
  const [existing] = await db
    .select({ id: UserTable.id })
    .from(UserTable)
    .where(eq(UserTable.email, params.email))
    .limit(1);

  if (existing) {
    await db
      .update(UserTable)
      .set({
        username: params.username,
        phoneNum: await claimablePhone(params.phoneNum, existing.id),
        status: 'active',
        updatedBy: ACTOR,
        updatedAt: new Date(),
      })
      .where(eq(UserTable.id, existing.id));
    return { id: existing.id, created: false };
  }

  const [created] = await db
    .insert(UserTable)
    .values({
      email: params.email,
      username: params.username,
      phoneNum: await claimablePhone(params.phoneNum, null),
      passwordHash: params.passwordHash,
      status: 'active',
      createdBy: ACTOR,
      updatedBy: ACTOR,
    })
    .returning({ id: UserTable.id });

  if (!created) return null;

  await db.insert(UserProfileTable).values({
    userId: created.id,
    createdBy: ACTOR,
    updatedBy: ACTOR,
  });

  return { id: created.id, created: true };
}

async function ensureRole(userId: string, roleId: string): Promise<void> {
  const [existing] = await db
    .select({ id: UserRoleTable.id })
    .from(UserRoleTable)
    .where(and(eq(UserRoleTable.userId, userId), eq(UserRoleTable.roleId, roleId)))
    .limit(1);
  if (existing) return;

  await db.insert(UserRoleTable).values({
    userId,
    roleId,
    createdBy: ACTOR,
    updatedBy: ACTOR,
  });
}

async function ensureOwnerMembership(userId: string, agencyId: string): Promise<void> {
  const [existing] = await db
    .select({ id: AgencyMemberTable.id })
    .from(AgencyMemberTable)
    .where(
      and(
        eq(AgencyMemberTable.userId, userId),
        eq(AgencyMemberTable.agencyId, agencyId),
        eq(AgencyMemberTable.subRole, 'owner'),
      ),
    )
    .limit(1);

  if (existing) {
    // Scope resolution prefers an active membership — make sure it is one.
    await db
      .update(AgencyMemberTable)
      .set({ status: 'active', updatedBy: ACTOR, updatedAt: new Date() })
      .where(eq(AgencyMemberTable.id, existing.id));
    return;
  }

  await db.insert(AgencyMemberTable).values({
    agencyId,
    userId,
    subRole: 'owner',
    status: 'active',
    createdBy: ACTOR,
    updatedBy: ACTOR,
  });
}

export async function seedAgencyOwners(): Promise<void> {
  const roleId = await agencyRoleId();
  if (!roleId) {
    logger.warn('[seed-agency-owners] Agency role not found — run init-roles/seed-rbac first');
    return;
  }

  const passwordHash = await hashPassword(OWNER_PASSWORD);
  const summary: string[] = [];

  for (const agencyCode of AGENCY_CODES) {
    const [agency] = await db
      .select({
        id: AgencyTable.id,
        name: AgencyTable.name,
        contactEmail: AgencyTable.contactEmail,
        contactName: AgencyTable.contactName,
        contactPhone: AgencyTable.contactPhone,
      })
      .from(AgencyTable)
      .where(eq(AgencyTable.agencyCode, agencyCode))
      .limit(1);

    if (!agency) {
      logger.warn(`[seed-agency-owners] No agency with code ${agencyCode} — skipped`);
      continue;
    }
    if (!agency.contactEmail) {
      logger.warn(`[seed-agency-owners] ${agency.name} has no contactEmail — skipped`);
      continue;
    }

    const user = await upsertOwnerUser({
      email: agency.contactEmail,
      username: agency.contactName ?? `${agency.name} Owner`,
      phoneNum: agency.contactPhone ?? null,
      passwordHash,
    });
    if (!user) {
      logger.warn(`[seed-agency-owners] Could not upsert owner for ${agency.name}`);
      continue;
    }

    await ensureRole(user.id, roleId);
    await ensureOwnerMembership(user.id, agency.id);

    summary.push(`${agency.name} → ${agency.contactEmail} (${user.created ? 'created' : 'existing'})`);
  }

  logger.info(
    `[seed-agency-owners] Done. ${summary.length} agency owner(s) ready (password: ${OWNER_PASSWORD}).`,
  );
  for (const line of summary) logger.info(`  ${line}`);
}

const isDirectRun = process.argv[1]?.includes('seed-agency-owners');
if (isDirectRun) {
  seedAgencyOwners()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error('[seed-agency-owners] Error:', error);
      process.exit(1);
    });
}
