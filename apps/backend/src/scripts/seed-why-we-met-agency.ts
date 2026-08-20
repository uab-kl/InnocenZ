import 'dotenv/config';

import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/index';
import { AgencyTable, AgencyUserTable } from '@/features/agency/agency.model';
import { RoleTable } from '@/features/rbac/role/role.model';
import { PortalTable } from '@/features/rbac/portal/portal.model';
import { UserRoleTable } from '@/features/rbac/user-role/user-role.model';
import { UserTable } from '@/features/user/user.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import { hashPassword } from '@/util/password';
import { logger } from '@/util/logger';
import { MemberSubscriptionTable } from '@/features/member-subscription/member-subscription.model';
import { SubscriptionTable } from '@/features/subscription/subscription.model';
import { bandFor } from '@/scheduler/agency-tier.job';

// One-off: the "Why We Met Agency" org with a working portal login.
//
// Follows seed-agency-owners.ts exactly, because a sign-in that actually
// reaches the agency portal needs BOTH halves: the `agency` role (route guard)
// and an active `agency_user` membership (controller scope resolution).
// create-test-agency-user.ts grants only the role, which logs in and then has
// no agency — every scoped endpoint answers 403.
//
// Idempotent: matched by email and agencyCode, safe to re-run. Re-running
// never changes an existing account's password.
const ACTOR = 'seed-why-we-met';
const EMAIL = 'whywemet@agency.com';
const PASSWORD = 'Password123!';
const AGENCY_NAME = 'Why We Met Agency';
const AGENCY_CODE = 'AGY777';

async function run(): Promise<void> {
  // There is NO role literally named 'agency' — roles are portal-scoped, and
  // the guard's requireRole('agency') expands to any role whose portal.code is
  // 'agency'. Real agency owners (Atlas, Delta, Starline) all hold the
  // agency-portal 'Owner' role, so that is the one to grant.
  const [agencyRole] = await db
    .select({ id: RoleTable.id })
    .from(RoleTable)
    .innerJoin(PortalTable, eq(RoleTable.portalId, PortalTable.id))
    .where(and(eq(RoleTable.roleName, 'Owner'), eq(PortalTable.code, 'agency')))
    .limit(1);
  if (!agencyRole) {
    logger.warn('[seed-why-we-met] Agency-portal Owner role not found — run seed-rbac first');
    return;
  }

  // --- the org ---------------------------------------------------------
  let [agency] = await db
    .select({ id: AgencyTable.id, name: AgencyTable.name })
    .from(AgencyTable)
    .where(eq(AgencyTable.agencyCode, AGENCY_CODE))
    .limit(1);

  if (!agency) {
    // status 'active', not the 'pending_review' default — a pending org is
    // what the admin approval queue is for, and this login must work today.
    const [created] = await db
      .insert(AgencyTable)
      .values({
        name: AGENCY_NAME,
        agencyCode: AGENCY_CODE,
        ssmNo: 'SSM-WWM-0001',
        contactName: 'Why We Met Owner',
        contactEmail: EMAIL,
        status: 'active',
        createdBy: ACTOR,
        updatedBy: ACTOR,
      })
      .returning({ id: AgencyTable.id, name: AgencyTable.name });
    agency = created;
    logger.info(`[seed-why-we-met] Agency created: ${AGENCY_NAME} (${AGENCY_CODE})`);
  } else {
    logger.info(`[seed-why-we-met] Agency already exists: ${agency.name} (${AGENCY_CODE})`);
  }
  if (!agency) return;

  // --- the login -------------------------------------------------------
  let [user] = await db
    .select({ id: UserTable.id })
    .from(UserTable)
    .where(eq(UserTable.email, EMAIL))
    .limit(1);

  if (!user) {
    const [created] = await db
      .insert(UserTable)
      .values({
        email: EMAIL,
        username: 'Why We Met Owner',
        passwordHash: await hashPassword(PASSWORD),
        status: 'active',
        createdBy: ACTOR,
        updatedBy: ACTOR,
      })
      .returning({ id: UserTable.id });
    user = created;
    if (user) {
      await db.insert(UserProfileTable).values({
        userId: user.id,
        createdBy: ACTOR,
        updatedBy: ACTOR,
      });
    }
    logger.info(`[seed-why-we-met] User created: ${EMAIL}`);
  } else {
    logger.info(`[seed-why-we-met] User already exists: ${EMAIL} — password NOT changed`);
  }
  if (!user) return;

  // --- role ------------------------------------------------------------
  const [hasRole] = await db
    .select({ id: UserRoleTable.id })
    .from(UserRoleTable)
    .where(and(eq(UserRoleTable.userId, user.id), eq(UserRoleTable.roleId, agencyRole.id)))
    .limit(1);
  if (!hasRole) {
    await db.insert(UserRoleTable).values({
      userId: user.id,
      roleId: agencyRole.id,
      createdBy: ACTOR,
      updatedBy: ACTOR,
    });
    logger.info('[seed-why-we-met] Agency role granted');
  }

  // --- membership (the scope half) --------------------------------------
  const [membership] = await db
    .select({ id: AgencyUserTable.id })
    .from(AgencyUserTable)
    .where(and(eq(AgencyUserTable.userId, user.id), eq(AgencyUserTable.agencyId, agency.id)))
    .limit(1);
  if (membership) {
    await db
      .update(AgencyUserTable)
      .set({ status: 'active', updatedBy: ACTOR, updatedAt: new Date() })
      .where(eq(AgencyUserTable.id, membership.id));
  } else {
    await db.insert(AgencyUserTable).values({
      agencyId: agency.id,
      userId: user.id,
      status: 'active',
      createdBy: ACTOR,
      updatedBy: ACTOR,
    });
    logger.info('[seed-why-we-met] Owner membership created');
  }

  // --- the subscription (the half sign-up would have written) -----------
  /**
   * Without this the seeded agency can log in, roster PRs and issue payment
   * vouchers, and can never be billed for any of it.
   *
   * Enrolment happens in exactly ONE place — `enrollSignupPackage`, when a real
   * agency registers and picks a package — and a seeded org never goes through
   * it. Every other path onto a plan presupposes the row it would update: the
   * weekly tier job selects on `ended_at IS NULL`, so an agency with no rows is
   * invisible to it rather than merely skipped; the portal's auto-tier effect
   * is guarded on a current plan name; and `POST /member-subscription` is
   * admin-only with no caller at all. A seed that stopped at the membership
   * therefore produced an agency that no screen could ever put on a plan.
   *
   * The tier is NOT named here. An agency does not choose its band — the PVs it
   * issued pick it — so the band for a new agency's ZERO vouchers is what
   * sign-up would have landed on, and `bandFor` is the same function the weekly
   * job bands with. Hardcoding a plan name would be a second copy of the rate
   * card, free to drift from the catalog it is meant to mirror.
   */
  const [liveSubscription] = await db
    .select({
      id: MemberSubscriptionTable.id,
      planName: MemberSubscriptionTable.planName,
    })
    .from(MemberSubscriptionTable)
    .where(
      and(
        eq(MemberSubscriptionTable.subscriberType, 'agency'),
        eq(MemberSubscriptionTable.subscriberId, agency.id),
        isNull(MemberSubscriptionTable.endedAt),
      ),
    )
    .limit(1);

  if (liveSubscription) {
    // Idempotent like the rest of this script, and deliberately more careful
    // than the other sections: a second live row would make the org's price
    // ambiguous, and re-pricing one that an admin may have negotiated is not a
    // seed's business.
    logger.info(
      `[seed-why-we-met] Subscription already live: ${liveSubscription.planName} — left alone`,
    );
  } else {
    const plans = await db
      .select({
        id: SubscriptionTable.id,
        name: SubscriptionTable.name,
        price: SubscriptionTable.price,
        billingCycle: SubscriptionTable.billingCycle,
        limitAmount: SubscriptionTable.limitAmount,
      })
      .from(SubscriptionTable)
      .where(
        and(
          eq(SubscriptionTable.subscriptionType, 'agency'),
          eq(SubscriptionTable.kind, 'plan'),
          eq(SubscriptionTable.status, 'active'),
        ),
      )
      .orderBy(asc(SubscriptionTable.price));

    const banded = bandFor(plans, 0);
    const plan = banded ? plans.find((p) => p.id === banded.id) : undefined;
    if (!plan) {
      logger.warn(
        '[seed-why-we-met] No agency plan in the catalog — subscription NOT created; run the subscription seed first',
      );
    } else {
      await db.insert(MemberSubscriptionTable).values({
        subscriberType: 'agency',
        subscriberId: agency.id,
        subscriberName: agency.name,
        subscriptionId: plan.id,
        planName: plan.name,
        amount: plan.price,
        billingCycle: plan.billingCycle,
        status: 'active',
        startedAt: new Date(),
        createdBy: ACTOR,
        updatedBy: ACTOR,
      });
      logger.info(
        `[seed-why-we-met] Subscription created: ${plan.name} (RM ${plan.price} / ${plan.billingCycle})`,
      );
    }
  }

  logger.info(`[seed-why-we-met] Done — login ${EMAIL}`);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('[seed-why-we-met] Error:', error);
    process.exit(1);
  });
