import 'dotenv/config';
import { nextOrgMemberCode } from '@/util/member-code';

import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { AgencyTable, AgencyUserTable } from '@/features/agency/agency.model';
import { PortalTable } from '@/features/rbac/portal/portal.model';
import { RoleTable } from '@/features/rbac/role/role.model';
import { UserRoleTable } from '@/features/rbac/user-role/user-role.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import { UserTable } from '@/features/user/user.model';
import { portalRoleName } from '@/types/rbac-constant';
import { logger } from '@/util/logger';
import { hashPassword } from '@/util/password';

/**
 * Two test logins for the Atlas agency's new roles — the agency counterpart of
 * `seed-emhub-role-accounts.ts`:
 *
 * - **Director** — view only. Reads every agency screen, including the payroll
 *   it exists to oversee, and cannot raise, sign or override a voucher. Its one
 *   editable surface is its own login and security.
 * - **Guarantor** — level with the Agency Owner. The stand-in for an owner who
 *   is unavailable, which on this portal means it can pay PRs.
 *
 * Both hang off the OWNER'S agency. The onboarding path that would otherwise
 * create agency staff does not exist yet, so the owner's own membership is what
 * says which organisation these accounts belong to — the agency is resolved
 * through `owner@atlas-agency.my` rather than from a code typed twice.
 *
 *   pnpm tsx --tsconfig tsconfig.json src/scripts/seed-atlas-agency-role-accounts.ts
 *
 * Run `init-roles` + `seed-rbac` first: this grants the SEEDED portal roles
 * (`Director` / `Guarantor` under the AGENCY portal — distinct rows from the
 * outlet pair of the same name) and refuses rather than inventing a role row,
 * because a role with no grants signs in to an empty portal and reads as a
 * broken app instead of an unseeded database.
 *
 * Idempotent and deliberately incapable of damage on a re-run: users are matched
 * by email and an EXISTING account keeps its password. It is never reset here.
 */
const ACTOR = 'seed-atlas-agency-role-accounts';
const PASSWORD = 'Password123!';

/** The account whose agency these two join. Never modified by this script. */
const OWNER_EMAIL = 'owner@atlas-agency.my';

/** Fallback only, for a database where the owner has no membership yet. */
const AGENCY_CODE = 'AGY001';

const ACCOUNTS = [
  {
    email: 'director@atlas-agency.my',
    username: 'Atlas Agency Director',
    roleName: portalRoleName.DIRECTOR,
  },
  {
    email: 'guarantor@atlas-agency.my',
    username: 'Atlas Agency Guarantor',
    roleName: portalRoleName.GUARANTOR,
  },
] as const;

/** A seeded portal role, by name, under the AGENCY portal specifically. */
async function agencyRoleIdByName(roleName: string): Promise<string | null> {
  const [portal] = await db
    .select({ id: PortalTable.id })
    .from(PortalTable)
    .where(eq(PortalTable.code, 'agency'))
    .limit(1);
  if (!portal) return null;

  const [role] = await db
    .select({ id: RoleTable.id })
    .from(RoleTable)
    .where(and(eq(RoleTable.roleName, roleName), eq(RoleTable.portalId, portal.id)))
    .limit(1);
  return role?.id ?? null;
}

/**
 * The agency these accounts join — the one the OWNER is a member of.
 *
 * Read from the owner's membership rather than a code, so the two accounts
 * cannot land on a different organisation from the person they answer to.
 */
async function resolveAgencyId(): Promise<{ id: string; via: string } | null> {
  const [ownerMembership] = await db
    .select({ agencyId: AgencyUserTable.agencyId })
    .from(AgencyUserTable)
    .innerJoin(UserTable, eq(UserTable.id, AgencyUserTable.userId))
    .where(and(eq(UserTable.email, OWNER_EMAIL), eq(AgencyUserTable.status, 'active')))
    .limit(1);
  if (ownerMembership) return { id: ownerMembership.agencyId, via: `owner ${OWNER_EMAIL}` };

  const [byCode] = await db
    .select({ id: AgencyTable.id })
    .from(AgencyTable)
    .where(eq(AgencyTable.agencyCode, AGENCY_CODE))
    .limit(1);
  return byCode ? { id: byCode.id, via: `agency code ${AGENCY_CODE}` } : null;
}

async function upsertUser(
  email: string,
  username: string,
  passwordHash: string,
): Promise<{ id: string; created: boolean }> {
  const [existing] = await db
    .select({ id: UserTable.id })
    .from(UserTable)
    .where(eq(UserTable.email, email))
    .limit(1);

  if (existing) {
    // Name and status only — the password stays whatever it already is, so this
    // script can never take an account over.
    await db
      .update(UserTable)
      .set({ username, status: 'active', updatedBy: ACTOR, updatedAt: new Date() })
      .where(eq(UserTable.id, existing.id));
    return { id: existing.id, created: false };
  }

  // phone_num is UNIQUE and these accounts sign in by email, so none is claimed.
  const [created] = await db
    .insert(UserTable)
    .values({
      email,
      username,
      passwordHash,
      status: 'active',
      createdBy: ACTOR,
      updatedBy: ACTOR,
    })
    .returning({ id: UserTable.id });
  if (!created) throw new Error(`could not create ${email}`);

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

/**
 * Membership is TENANCY — which organisation this person belongs to. How much
 * they may do there comes from `user_role` → `role`, never from this row.
 */
async function ensureMembership(userId: string, agencyId: string): Promise<void> {
  const [existing] = await db
    .select({ id: AgencyUserTable.id })
    .from(AgencyUserTable)
    .where(and(eq(AgencyUserTable.userId, userId), eq(AgencyUserTable.agencyId, agencyId)))
    .limit(1);

  if (existing) {
    // Scope resolution ignores anything but an active row — make sure it is one.
    await db
      .update(AgencyUserTable)
      .set({ status: 'active', updatedBy: ACTOR, updatedAt: new Date() })
      .where(eq(AgencyUserTable.id, existing.id));
    return;
  }

  await db.insert(AgencyUserTable).values({
    agencyId,
    userId,
    status: 'active',
    memberCode: await nextOrgMemberCode('agency', agencyId),
    createdBy: ACTOR,
    updatedBy: ACTOR,
  });
}

export async function seedAtlasAgencyRoleAccounts(): Promise<void> {
  const agency = await resolveAgencyId();
  if (!agency) {
    logger.warn(
      `[${ACTOR}] No agency found for ${OWNER_EMAIL} or with code ${AGENCY_CODE} — ` +
        'run seed-sample-orgs first. Nothing was created.',
    );
    return;
  }

  const passwordHash = await hashPassword(PASSWORD);

  for (const account of ACCOUNTS) {
    const roleId = await agencyRoleIdByName(account.roleName);
    if (!roleId) {
      logger.warn(
        `[${ACTOR}] Role "${account.roleName}" is not seeded under the agency portal — ` +
          `run init-roles + seed-rbac. Skipped ${account.email}.`,
      );
      continue;
    }

    const user = await upsertUser(account.email, account.username, passwordHash);
    await ensureRole(user.id, roleId);
    await ensureMembership(user.id, agency.id);

    logger.info(
      `[${ACTOR}] ${account.email} → ${account.roleName} @ agency ${agency.id} ` +
        `(${user.created ? `created, password: ${PASSWORD}` : 'existing account, password unchanged'})`,
    );
  }

  logger.info(`[${ACTOR}] Done. Agency resolved via ${agency.via}.`);
}

const isDirectRun = process.argv[1]?.includes('seed-atlas-agency-role-accounts');
if (isDirectRun) {
  seedAtlasAgencyRoleAccounts()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error(`[${ACTOR}] Error:`, error);
      process.exit(1);
    });
}
