import 'dotenv/config';

import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { AgencyTable } from '@/features/agency/agency.model';
import { OutletUserTable, OutletTable } from '@/features/outlet/outlet.model';
import { RoleTable } from '@/features/rbac/role/role.model';
import { UserRoleTable } from '@/features/rbac/user-role/user-role.model';
import { UserTable } from '@/features/user/user.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import { hashPassword } from '@/util/password';
import { logger } from '@/util/logger';

// Creates the "Emhub Testing" outlet plus an owner account that can sign into
// the outlet portal. An outlet-scoped request needs BOTH halves: the `outlet`
// role (route guard) and an outlet_user row (controller scope resolution) —
// either one missing lands the login on /no-access.
//
// Additive and idempotent: the outlet is matched by name and the user by email,
// so a re-run re-syncs rather than duplicating. Nothing else is touched.
const ACTOR = 'seed-outlet-emhub';
const OWNER_PASSWORD = 'Password123!';

// An outlet-posted shift routes its PR request to the onboarding agency, and
// shift.controller rejects the post outright when this is null — so a testing
// outlet is unusable without it. Resolved by agency code rather than a
// hardcoded uuid, which differs per environment.
const ONBOARDING_AGENCY_CODE = 'AGY001'; // Atlas Agency

const OUTLET = {
  name: 'Emhub Testing',
  // "Kompleks Perindustrian EmHub, Persiaran Surian, Seksyen 3, Taman Sains
  // Selangor, Kota Damansara, 47810 Petaling Jaya, Selangor" — the schema has
  // no city column, so the locality rides on address_line_2.
  addressLine1: 'Kompleks Perindustrian EmHub, Persiaran Surian',
  addressLine2: 'Seksyen 3, Taman Sains Selangor, Kota Damansara',
  postcode: '47810',
  state: 'Selangor',
  country: 'Malaysia',
  // Geocoded via OpenStreetMap against a unit inside the EmHub complex
  // (B-05-05), so this is the complex itself rather than a Kota Damansara town
  // guess. The site is ~9.4 acres, so a 50 m fence centred here covers only
  // part of it — widen geoFenceRadius if check-ins fail at the far end.
  lat: '3.1598261',
  lng: '101.5725678',
  geoFenceRadius: 50,
} as const;

const OWNER = {
  email: 'emhub@emhub.test',
  username: 'Emhub Testing Owner',
} as const;

async function outletRoleId(): Promise<string | null> {
  const [row] = await db
    .select({ id: RoleTable.id })
    .from(RoleTable)
    .where(eq(RoleTable.roleName, 'outlet'))
    .limit(1);
  return row?.id ?? null;
}

async function onboardingAgencyId(): Promise<string | null> {
  const [row] = await db
    .select({ id: AgencyTable.id })
    .from(AgencyTable)
    .where(eq(AgencyTable.agencyCode, ONBOARDING_AGENCY_CODE))
    .limit(1);
  return row?.id ?? null;
}

/** Upsert by name so a re-run refreshes the address instead of adding a twin. */
async function upsertOutlet(agencyId: string): Promise<{ id: string; created: boolean } | null> {
  const values = { ...OUTLET, onboardedByAgencyId: agencyId, status: 'active' } as const;

  const [existing] = await db
    .select({ id: OutletTable.id })
    .from(OutletTable)
    .where(eq(OutletTable.name, OUTLET.name))
    .limit(1);

  if (existing) {
    await db
      .update(OutletTable)
      .set({ ...values, updatedBy: ACTOR, updatedAt: new Date() })
      .where(eq(OutletTable.id, existing.id));
    return { id: existing.id, created: false };
  }

  const [created] = await db
    .insert(OutletTable)
    .values({ ...values, createdBy: ACTOR, updatedBy: ACTOR })
    .returning({ id: OutletTable.id });

  return created ? { id: created.id, created: true } : null;
}

/** Upsert by email — never clobbers an unrelated existing account's password. */
async function upsertOwnerUser(passwordHash: string): Promise<{ id: string; created: boolean } | null> {
  const [existing] = await db
    .select({ id: UserTable.id })
    .from(UserTable)
    .where(eq(UserTable.email, OWNER.email))
    .limit(1);

  if (existing) {
    await db
      .update(UserTable)
      .set({ username: OWNER.username, status: 'active', updatedBy: ACTOR, updatedAt: new Date() })
      .where(eq(UserTable.id, existing.id));
    return { id: existing.id, created: false };
  }

  // phone_num is UNIQUE and login is by email, so no number is claimed here.
  const [created] = await db
    .insert(UserTable)
    .values({
      email: OWNER.email,
      username: OWNER.username,
      passwordHash,
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

async function ensureOwnerMembership(userId: string, outletId: string): Promise<void> {
  const [existing] = await db
    .select({ id: OutletUserTable.id })
    .from(OutletUserTable)
    .where(
      and(
        eq(OutletUserTable.userId, userId),
        eq(OutletUserTable.outletId, outletId),
        eq(OutletUserTable.subRole, 'owner'),
      ),
    )
    .limit(1);

  if (existing) {
    // Scope resolution prefers an active membership — make sure it is one.
    await db
      .update(OutletUserTable)
      .set({ status: 'active', updatedBy: ACTOR, updatedAt: new Date() })
      .where(eq(OutletUserTable.id, existing.id));
    return;
  }

  await db.insert(OutletUserTable).values({
    outletId,
    userId,
    subRole: 'owner',
    status: 'active',
    createdBy: ACTOR,
    updatedBy: ACTOR,
  });
}

export async function seedOutletEmhub(): Promise<void> {
  const roleId = await outletRoleId();
  if (!roleId) {
    logger.warn('[seed-outlet-emhub] Outlet role not found — run init-roles/seed-rbac first');
    return;
  }

  const agencyId = await onboardingAgencyId();
  if (!agencyId) {
    logger.warn(
      `[seed-outlet-emhub] No agency with code ${ONBOARDING_AGENCY_CODE} — run seed-sample-orgs first`,
    );
    return;
  }

  const outlet = await upsertOutlet(agencyId);
  if (!outlet) {
    logger.error('[seed-outlet-emhub] Could not upsert the outlet');
    return;
  }

  const user = await upsertOwnerUser(await hashPassword(OWNER_PASSWORD));
  if (!user) {
    logger.error('[seed-outlet-emhub] Could not upsert the owner account');
    return;
  }

  await ensureRole(user.id, roleId);
  await ensureOwnerMembership(user.id, outlet.id);

  logger.info(
    `[seed-outlet-emhub] Done. Outlet ${OUTLET.name} (${outlet.created ? 'created' : 'existing'}) ` +
      `id=${outlet.id}, owner ${OWNER.email} (${user.created ? 'created' : 'existing'}), ` +
      `password: ${OWNER_PASSWORD}`,
  );
}

const isDirectRun = process.argv[1]?.includes('seed-outlet-emhub');
if (isDirectRun) {
  seedOutletEmhub()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error('[seed-outlet-emhub] Error:', error);
      process.exit(1);
    });
}
