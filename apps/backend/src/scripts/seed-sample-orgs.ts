import 'dotenv/config';

import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { SubscriptionTable } from '@/features/subscription/subscription.model';
import { MemberSubscriptionTable } from '@/features/member-subscription/member-subscription.model';
import { AgencyOutletTable } from '@/features/agency/agency-outlet.model';
import { AgencyTable } from '@/features/agency/agency.model';
import { OutletUserTable, OutletTable } from '@/features/outlet/outlet.model';
import { UserTable } from '@/features/user/user.model';
import { RoleTable } from '@/features/rbac/role/role.model';
import { UserRoleTable } from '@/features/rbac/user-role/user-role.model';
import { PortalTable } from '@/features/rbac/portal/portal.model';
import { portalRoleNameForSubRole } from '@/features/rbac/portal-role-map';
import { hashPassword } from '@/util/password';
import { logger } from '@/util/logger';

// Demo agencies + outlets so the admin Agency and Outlet list pages show real rows.
// Idempotent: rows are stamped createdBy='seed-sample' and re-running wipes them first.
const ACTOR = 'seed-sample';

// Names + owner contacts mirror the InnocenZ-proto demo data.
const AGENCIES = [
  { name: 'Atlas Agency', agencyCode: 'AGY001', ssmNo: '202301000001', contactName: "Dato' Lim Wei Khoon", contactEmail: 'owner@atlas-agency.my', contactPhone: '+60123456789' },
  { name: 'Delta Agency', agencyCode: 'AGY002', ssmNo: '202301000002', contactName: 'Rajesh Kumar', contactEmail: 'owner@delta-agency.my', contactPhone: '+60167782210' },
  { name: 'Starline PR', agencyCode: 'AGY003', ssmNo: '202301000003', contactName: 'Daniel Koh', contactEmail: 'hello@starline.my', contactPhone: '+60123456703' },
];

type OutletSeed = {
  name: string;
  state: string;
  postcode: string;
  planName: string;
  onboardedBy: string; // agency name
  /** Served from apps/backend/public — e.g. /img/outlets/velvet-23-logo.png */
  logoImage?: string;
  addressLine1?: string;
  addressLine2?: string;
};

// Outlet names come from the InnocenZ-proto demo (Velvet 23 is the flagship).
const OUTLETS: OutletSeed[] = [
  { name: 'Velvet 23', state: 'Kuala Lumpur', postcode: '55100', planName: 'Pro', onboardedBy: 'Atlas Agency', logoImage: '/img/outlets/velvet-23-logo.png', addressLine1: 'Jalan Bukit Bintang', addressLine2: 'Bukit Bintang' },
  { name: 'Onyx KL', state: 'Kuala Lumpur', postcode: '50450', planName: 'Plus', onboardedBy: 'Atlas Agency' },
  { name: 'Urban Soul', state: 'Selangor', postcode: '47800', planName: 'Essential', onboardedBy: 'Delta Agency' },
  { name: 'Mermate', state: 'Kuala Lumpur', postcode: '50250', planName: 'Enterprise', onboardedBy: 'Delta Agency' },
  { name: 'Bear Lounge', state: 'Penang', postcode: '10200', planName: 'Plus', onboardedBy: 'Starline PR' },
];

// Velvet 23 team — mirrors the proto outlet settings page (owner/finance/ops).
const VELVET_TEAM: Array<{
  username: string;
  email: string;
  phoneNum: string;
  subRole: 'owner' | 'finance' | 'operations_head';
}> = [
  { username: 'Chen Wei Jie', email: 'owner@velvet23.my', phoneNum: '+60112345678', subRole: 'owner' },
  { username: 'Michelle Lim', email: 'finance@velvet23.my', phoneNum: '+60112345679', subRole: 'finance' },
  { username: 'Ahmad Razif', email: 'ops@velvet23.my', phoneNum: '+60112345680', subRole: 'operations_head' },
];

// Resolve an outlet plan id by name (plan names like Plus/Enterprise/Scale exist
// for both audiences), disambiguated by the stored audience since migration 0036.
async function outletPlanId(name: string): Promise<string | null> {
  const [row] = await db
    .select({ id: SubscriptionTable.id })
    .from(SubscriptionTable)
    .where(and(eq(SubscriptionTable.name, name), eq(SubscriptionTable.subscriptionType, 'outlet')))
    .limit(1);
  return row?.id ?? null;
}

export async function seedSampleOrgs(): Promise<void> {
  // Outlets reference agencies (set null on delete) — clear outlets first, then agencies.
  await db.delete(OutletTable).where(eq(OutletTable.createdBy, ACTOR));
  await db.delete(AgencyTable).where(eq(AgencyTable.createdBy, ACTOR));

  const agencyIdByName = new Map<string, string>();
  for (const a of AGENCIES) {
    const [row] = await db
      .insert(AgencyTable)
      .values({
        name: a.name,
        agencyCode: a.agencyCode,
        ssmNo: a.ssmNo,
        contactName: a.contactName,
        contactEmail: a.contactEmail,
        contactPhone: a.contactPhone,
        status: 'active',
        createdBy: ACTOR,
        updatedBy: ACTOR,
      })
      .returning({ id: AgencyTable.id });
    if (row) agencyIdByName.set(a.name, row.id);
  }

  const outletIdByName = new Map<string, string>();
  for (const o of OUTLETS) {
    const [row] = await db
      .insert(OutletTable)
      .values({
        name: o.name,
        logoImage: o.logoImage ?? null,
        addressLine1: o.addressLine1 ?? `${Math.floor(Math.random() * 200) + 1}, Jalan Hiburan`,
        addressLine2: o.addressLine2 ?? null,
        postcode: o.postcode,
        state: o.state,
        country: 'Malaysia',
        status: 'active',
        createdBy: ACTOR,
        updatedBy: ACTOR,
      })
      .returning({ id: OutletTable.id });
    if (row) {
      outletIdByName.set(o.name, row.id);
      // A LINK, not `onboarded_by_agency_id` (0123/0124).
      //
      // That column is history now and nothing reads it, so a seeded outlet
      // carrying only it would have no agency at all: Post Job would refuse
      // every attempt and the agency portal would not list the venue. Seeded as
      // `approved` because a seed exists to produce a WORKING fixture — leaving
      // it `pending` would mean every fresh dev database starts with venues that
      // cannot post until somebody clicks Approve.
      const linkedAgencyId = agencyIdByName.get(o.onboardedBy);
      if (linkedAgencyId) {
        await db
          .insert(AgencyOutletTable)
          .values({
            agencyId: linkedAgencyId,
            outletId: row.id,
            approveStatus: 'approved',
            createdBy: ACTOR,
            updatedBy: ACTOR,
          })
          .onConflictDoNothing();
      }
      // The outlet's plan lives on member_subscription, not on the outlet row
      // (outlet.subscription_id was dropped in migration 0034).
      const planId = await outletPlanId(o.planName);
      if (planId) {
        await db
          .insert(MemberSubscriptionTable)
          .values({
            subscriberType: 'outlet',
            subscriberId: row.id,
            subscriberName: o.name,
            subscriptionId: planId,
            planName: o.planName,
            amount: '0',
            billingCycle: 'monthly',
            currency: 'MYR',
            status: 'active',
            startedAt: new Date(),
            createdBy: ACTOR,
            updatedBy: ACTOR,
          })
          .onConflictDoNothing();
      }
    }
  }

  // Velvet 23 team members (owner / finance / ops head) — upsert users by email
  // and rebuild the outlet_member links.
  const velvetId = outletIdByName.get('Velvet 23');
  if (velvetId) {
    const passwordHash = await hashPassword('Password123!');
    for (const member of VELVET_TEAM) {
      const [existing] = await db
        .select({ id: UserTable.id })
        .from(UserTable)
        .where(eq(UserTable.email, member.email))
        .limit(1);

      let userId = existing?.id ?? null;
      if (userId) {
        await db
          .update(UserTable)
          .set({ username: member.username, phoneNum: member.phoneNum, status: 'active', updatedBy: ACTOR, updatedAt: new Date() })
          .where(eq(UserTable.id, userId));
      } else {
        const [created] = await db
          .insert(UserTable)
          .values({
            email: member.email,
            phoneNum: member.phoneNum,
            username: member.username,
            passwordHash,
            status: 'active',
            createdBy: ACTOR,
            updatedBy: ACTOR,
          })
          .returning({ id: UserTable.id });
        userId = created?.id ?? null;
      }
      if (!userId) continue;

      await db
        .delete(OutletUserTable)
        .where(eq(OutletUserTable.userId, userId));
      await db.insert(OutletUserTable).values({
        outletId: velvetId,
        userId,
        status: 'active',
        createdBy: ACTOR,
        updatedBy: ACTOR,
      });

      const roleName = portalRoleNameForSubRole('outlet', member.subRole);
      const [portal] = await db
        .select({ id: PortalTable.id })
        .from(PortalTable)
        .where(eq(PortalTable.code, 'outlet'))
        .limit(1);
      if (portal) {
        const [role] = await db
          .select({ id: RoleTable.id })
          .from(RoleTable)
          .where(and(eq(RoleTable.roleName, roleName), eq(RoleTable.portalId, portal.id)))
          .limit(1);
        if (role) {
          const held = await db
            .select({ id: UserRoleTable.id, roleId: UserRoleTable.roleId, portalId: RoleTable.portalId })
            .from(UserRoleTable)
            .innerJoin(RoleTable, eq(RoleTable.id, UserRoleTable.roleId))
            .where(eq(UserRoleTable.userId, userId));
          for (const row of held) {
            if (row.portalId === portal.id) {
              await db.delete(UserRoleTable).where(eq(UserRoleTable.id, row.id));
            }
          }
          await db.insert(UserRoleTable).values({
            userId,
            roleId: role.id,
            createdBy: ACTOR,
            updatedBy: ACTOR,
          });
        }
      }
    }
  }

  logger.info(
    `[seed-sample-orgs] Done. ${AGENCIES.length} agencies, ${OUTLETS.length} outlets, ${VELVET_TEAM.length} Velvet 23 team members.`,
  );
}

seedSampleOrgs()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('[seed-sample-orgs] Error:', error);
    process.exit(1);
  });
