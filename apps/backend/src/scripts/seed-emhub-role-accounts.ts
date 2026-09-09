import 'dotenv/config';
import { nextOrgMemberCode } from '@/util/member-code';

import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { OutletTable, OutletUserTable } from '@/features/outlet/outlet.model';
import { PortalTable } from '@/features/rbac/portal/portal.model';
import { RoleTable } from '@/features/rbac/role/role.model';
import { UserRoleTable } from '@/features/rbac/user-role/user-role.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import { UserTable } from '@/features/user/user.model';
import { portalRoleName } from '@/types/rbac-constant';
import { logger } from '@/util/logger';
import { hashPassword } from '@/util/password';

/**
 * Two test logins for the Emhub outlet's new roles:
 *
 * - **Director** — view only. Reads every outlet screen and changes nothing
 *   about the venue; the one thing it may edit is its own login and security.
 * - **Guarantor** — level with the Owner. The stand-in for an owner who is
 *   unavailable, so it holds the owner's grants exactly.
 *
 * Both hang off the OWNER'S outlet. The agency-onboarding path that would
 * otherwise create outlet staff does not exist yet, so the owner's own
 * membership is what says which venue these accounts belong to — the outlet is
 * resolved through `emhub@emhub.test` rather than from a name typed twice.
 *
 *   pnpm tsx --tsconfig tsconfig.json src/scripts/seed-emhub-role-accounts.ts
 *
 * Run `init-roles` + `seed-rbac` first: this grants the SEEDED portal roles
 * (`Director` / `Guarantor` under the outlet portal) and refuses rather than
 * inventing a role row — a role with no permission grants signs in to an empty
 * portal, which reads as a broken app instead of an unseeded database.
 *
 * Idempotent, and deliberately incapable of damage on a re-run: users are
 * matched by email, and an EXISTING account keeps its password. It is never
 * reset here, so the script stays safe against a database where someone has
 * already changed it — or where the address turns out to belong to a real
 * person.
 */
const ACTOR = 'seed-emhub-role-accounts';
const PASSWORD = 'Password123!';

/** The account whose outlet these two join. Never modified by this script. */
const OWNER_EMAIL = 'emhub@emhub.test';

/** Fallback only, for a database where the owner has no membership yet. */
const OUTLET_NAME = 'Emhub Testing';

const ACCOUNTS = [
  {
    email: 'director@emhub.test',
    username: 'Emhub Testing Director',
    roleName: portalRoleName.DIRECTOR,
  },
  {
    email: 'guarantor@emhub.test',
    username: 'Emhub Testing Guarantor',
    roleName: portalRoleName.GUARANTOR,
  },
] as const;

/** A seeded portal role, by name, under the outlet portal specifically. */
async function outletRoleIdByName(roleName: string): Promise<string | null> {
  const [portal] = await db
    .select({ id: PortalTable.id })
    .from(PortalTable)
    .where(eq(PortalTable.code, 'outlet'))
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
 * The outlet these accounts join — the one the OWNER is a member of.
 *
 * Read from the owner's membership rather than from a name, so the two accounts
 * cannot land on a different venue from the person they answer to, which a
 * renamed or duplicated outlet would otherwise allow silently.
 */
async function resolveOutletId(): Promise<{ id: string; via: string } | null> {
  const [ownerMembership] = await db
    .select({ outletId: OutletUserTable.outletId })
    .from(OutletUserTable)
    .innerJoin(UserTable, eq(UserTable.id, OutletUserTable.userId))
    .where(and(eq(UserTable.email, OWNER_EMAIL), eq(OutletUserTable.status, 'active')))
    .limit(1);
  if (ownerMembership) return { id: ownerMembership.outletId, via: `owner ${OWNER_EMAIL}` };

  const [byName] = await db
    .select({ id: OutletTable.id })
    .from(OutletTable)
    .where(eq(OutletTable.name, OUTLET_NAME))
    .limit(1);
  return byName ? { id: byName.id, via: `name "${OUTLET_NAME}"` } : null;
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
    // Name and status only. The password stays whatever it already is — see the
    // file comment: this script must not be able to take an account over.
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
 * Membership is TENANCY — which venue this person belongs to. How much they may
 * do there comes from `user_role` → `role`, never from this row.
 */
async function ensureMembership(userId: string, outletId: string): Promise<void> {
  const [existing] = await db
    .select({ id: OutletUserTable.id })
    .from(OutletUserTable)
    .where(and(eq(OutletUserTable.userId, userId), eq(OutletUserTable.outletId, outletId)))
    .limit(1);

  if (existing) {
    // Scope resolution ignores anything but an active row — make sure it is one.
    await db
      .update(OutletUserTable)
      .set({ status: 'active', updatedBy: ACTOR, updatedAt: new Date() })
      .where(eq(OutletUserTable.id, existing.id));
    return;
  }

  await db.insert(OutletUserTable).values({
    outletId,
    userId,
    status: 'active',
    memberCode: await nextOrgMemberCode('outlet', outletId),
    createdBy: ACTOR,
    updatedBy: ACTOR,
  });
}

export async function seedEmhubRoleAccounts(): Promise<void> {
  const outlet = await resolveOutletId();
  if (!outlet) {
    logger.warn(
      `[${ACTOR}] No outlet found for ${OWNER_EMAIL} or named "${OUTLET_NAME}" — ` +
        'run seed-outlet-emhub first. Nothing was created.',
    );
    return;
  }

  const passwordHash = await hashPassword(PASSWORD);

  for (const account of ACCOUNTS) {
    const roleId = await outletRoleIdByName(account.roleName);
    if (!roleId) {
      logger.warn(
        `[${ACTOR}] Role "${account.roleName}" is not seeded under the outlet portal — ` +
          `run init-roles + seed-rbac. Skipped ${account.email}.`,
      );
      continue;
    }

    const user = await upsertUser(account.email, account.username, passwordHash);
    await ensureRole(user.id, roleId);
    await ensureMembership(user.id, outlet.id);

    logger.info(
      `[${ACTOR}] ${account.email} → ${account.roleName} @ outlet ${outlet.id} ` +
        `(${user.created ? `created, password: ${PASSWORD}` : 'existing account, password unchanged'})`,
    );
  }

  logger.info(`[${ACTOR}] Done. Outlet resolved via ${outlet.via}.`);
}

const isDirectRun = process.argv[1]?.includes('seed-emhub-role-accounts');
if (isDirectRun) {
  seedEmhubRoleAccounts()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error(`[${ACTOR}] Error:`, error);
      process.exit(1);
    });
}
