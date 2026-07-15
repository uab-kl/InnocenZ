import 'dotenv/config';

import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { RoleTable } from '@/features/rbac/role/role.model';
import { SubscriptionTable } from '@/features/subscription/subscription.model';
import { SubscriptionRoleTable } from '@/features/subscription/subscription-role.model';
import { AgencyTable } from '@/features/agency/agency.model';
import { OutletTable } from '@/features/outlet/outlet.model';
import { logger } from '@/util/logger';

// Demo agencies + outlets so the admin Agency and Outlet list pages show real rows.
// Idempotent: rows are stamped createdBy='seed-sample' and re-running wipes them first.
const ACTOR = 'seed-sample';

const AGENCIES = [
  { name: 'Prime Talent Agency', agencyCode: 'AGY001', ssmNo: '202301000001', contactName: 'Aisyah Rahman', contactEmail: 'ops@primetalent.my', contactPhone: '+60123456701' },
  { name: 'Starlight Staffing', agencyCode: 'AGY002', ssmNo: '202301000002', contactName: 'Daniel Lim', contactEmail: 'hello@starlight.my', contactPhone: '+60123456702' },
  { name: 'Elite Crew Co', agencyCode: 'AGY003', ssmNo: '202301000003', contactName: 'Farah Nadia', contactEmail: 'admin@elitecrew.my', contactPhone: '+60123456703' },
];

type OutletSeed = {
  name: string;
  state: string;
  postcode: string;
  planName: string;
  onboardedBy: string; // agency name
};

const OUTLETS: OutletSeed[] = [
  { name: 'Neon Sky Club', state: 'Kuala Lumpur', postcode: '50450', planName: 'Pro', onboardedBy: 'Prime Talent Agency' },
  { name: 'Velvet Lounge', state: 'Selangor', postcode: '47800', planName: 'Essential', onboardedBy: 'Starlight Staffing' },
  { name: 'Aurora Rooftop', state: 'Kuala Lumpur', postcode: '50250', planName: 'Enterprise', onboardedBy: 'Prime Talent Agency' },
  { name: 'Skyline Bar', state: 'Penang', postcode: '10200', planName: 'Plus', onboardedBy: 'Elite Crew Co' },
];

// Resolve an OUTLET-role plan id by name (plan names like Plus/Enterprise/Scale
// exist for both roles, so we must filter on the outlet role).
async function outletPlanId(name: string): Promise<string | null> {
  const [row] = await db
    .select({ id: SubscriptionTable.id })
    .from(SubscriptionTable)
    .innerJoin(SubscriptionRoleTable, eq(SubscriptionRoleTable.subscriptionId, SubscriptionTable.id))
    .innerJoin(RoleTable, eq(RoleTable.id, SubscriptionRoleTable.roleId))
    .where(and(eq(SubscriptionTable.name, name), eq(RoleTable.roleName, 'outlet')))
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

  for (const o of OUTLETS) {
    await db.insert(OutletTable).values({
      name: o.name,
      addressLine1: `${Math.floor(Math.random() * 200) + 1}, Jalan Hiburan`,
      postcode: o.postcode,
      state: o.state,
      country: 'Malaysia',
      status: 'active',
      onboardedByAgencyId: agencyIdByName.get(o.onboardedBy) ?? null,
      subscriptionId: await outletPlanId(o.planName),
      createdBy: ACTOR,
      updatedBy: ACTOR,
    });
  }

  logger.info(
    `[seed-sample-orgs] Done. ${AGENCIES.length} agencies, ${OUTLETS.length} outlets.`,
  );
}

seedSampleOrgs()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('[seed-sample-orgs] Error:', error);
    process.exit(1);
  });
