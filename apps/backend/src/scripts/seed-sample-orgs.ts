import 'dotenv/config';

import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { SubscriptionTable } from '@/features/subscription/subscription.model';
import { AgencyTable } from '@/features/agency/agency.model';
import { OutletMemberTable, OutletTable } from '@/features/outlet/outlet.model';
import { UserTable } from '@/features/user/user.model';
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

// Resolve an outlet plan id by name (plan names like Plus/Enterprise/Scale exist for
// both audiences). Outlet plans are the monthly ones — see seed-plans.ts.
async function outletPlanId(name: string): Promise<string | null> {
  const [row] = await db
    .select({ id: SubscriptionTable.id })
    .from(SubscriptionTable)
    .where(and(eq(SubscriptionTable.name, name), eq(SubscriptionTable.billingCycle, 'monthly')))
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
        onboardedByAgencyId: agencyIdByName.get(o.onboardedBy) ?? null,
        subscriptionId: await outletPlanId(o.planName),
        createdBy: ACTOR,
        updatedBy: ACTOR,
      })
      .returning({ id: OutletTable.id });
    if (row) outletIdByName.set(o.name, row.id);
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
        .delete(OutletMemberTable)
        .where(and(eq(OutletMemberTable.userId, userId), eq(OutletMemberTable.subRole, member.subRole)));
      await db.insert(OutletMemberTable).values({
        outletId: velvetId,
        userId,
        subRole: member.subRole,
        status: 'active',
        createdBy: ACTOR,
        updatedBy: ACTOR,
      });
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
