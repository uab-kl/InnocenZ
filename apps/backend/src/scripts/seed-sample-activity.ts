import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { RoleTable } from '@/features/rbac/role/role.model';
import { SubscriptionTable } from '@/features/subscription/subscription.model';
import { SubscriptionRoleTable } from '@/features/subscription/subscription-role.model';
import { MemberSubscriptionTable } from '@/features/member-subscription/member-subscription.model';
import { AdminRequestTable } from '@/features/admin-request/admin-request.model';
import { logger } from '@/util/logger';

// Demo data so the admin History + Requests & Quotes pages show real rows.
// Idempotent: every row is stamped createdBy='seed-sample' and re-running wipes
// the previous sample set first.
const ACTOR = 'seed-sample';

type MemberSeed = {
  subscriberType: 'outlet' | 'agency';
  subscriberName: string;
  role: 'outlet' | 'agency';
  planName: string;
  amount: string;
  billingCycle: 'weekly' | 'monthly' | 'annually';
  status: 'active' | 'cancelled' | 'expired' | 'past_due';
  startedAt: string;
  endedAt?: string;
};

type AdminSeed = {
  type: 'pos_integration_quote' | 'plan_change' | 'contact' | 'other';
  subscriberType: 'outlet' | 'agency' | null;
  subscriberName: string;
  role: 'outlet' | 'agency' | null;
  planName: string | null;
  message: string;
  status: 'pending' | 'contacted' | 'resolved';
  quotedAmount?: string;
};

const MEMBER_SEED: MemberSeed[] = [
  { subscriberType: 'outlet', subscriberName: 'Neon Sky Club', role: 'outlet', planName: 'Pro', amount: '2999.00', billingCycle: 'monthly', status: 'active', startedAt: '2026-07-01' },
  { subscriberType: 'outlet', subscriberName: 'Velvet Lounge', role: 'outlet', planName: 'Essential', amount: '999.00', billingCycle: 'monthly', status: 'active', startedAt: '2026-06-15' },
  { subscriberType: 'outlet', subscriberName: 'Aurora Rooftop', role: 'outlet', planName: 'Enterprise', amount: '3999.00', billingCycle: 'monthly', status: 'active', startedAt: '2026-05-20' },
  { subscriberType: 'agency', subscriberName: 'Prime Talent Agency', role: 'agency', planName: 'Growth', amount: '500.00', billingCycle: 'weekly', status: 'active', startedAt: '2026-07-07' },
  { subscriberType: 'agency', subscriberName: 'Starlight Staffing', role: 'agency', planName: 'Starter', amount: '125.00', billingCycle: 'weekly', status: 'active', startedAt: '2026-07-07' },
  { subscriberType: 'agency', subscriberName: 'Elite Crew Co', role: 'agency', planName: 'Enterprise', amount: '1000.00', billingCycle: 'weekly', status: 'cancelled', startedAt: '2026-06-01', endedAt: '2026-06-30' },
];

const ADMIN_SEED: AdminSeed[] = [
  { type: 'pos_integration_quote', subscriberType: 'outlet', subscriberName: 'Neon Sky Club', role: 'outlet', planName: 'Pro', message: 'Need POS integration quote for 3 terminals.', status: 'pending' },
  { type: 'plan_change', subscriberType: 'agency', subscriberName: 'Prime Talent Agency', role: 'agency', planName: 'Growth', message: 'Weekly PV exceeding 150 — need custom pricing.', status: 'pending' },
  { type: 'pos_integration_quote', subscriberType: 'outlet', subscriberName: 'Velvet Lounge', role: 'outlet', planName: 'Essential', message: 'POS sync for a single venue.', status: 'resolved', quotedAmount: '4500.00' },
  { type: 'plan_change', subscriberType: 'agency', subscriberName: 'Elite Crew Co', role: 'agency', planName: 'Enterprise', message: 'Custom weekly terms for 200+ PV.', status: 'resolved', quotedAmount: '2200.00' },
  { type: 'contact', subscriberType: 'outlet', subscriberName: 'Aurora Rooftop', role: null, planName: null, message: 'General enquiry about upgrading later.', status: 'resolved' },
];

async function buildPlanMap(): Promise<Map<string, string>> {
  const rows = await db
    .select({
      id: SubscriptionTable.id,
      name: SubscriptionTable.name,
      roleName: RoleTable.roleName,
    })
    .from(SubscriptionTable)
    .innerJoin(
      SubscriptionRoleTable,
      eq(SubscriptionRoleTable.subscriptionId, SubscriptionTable.id),
    )
    .innerJoin(RoleTable, eq(RoleTable.id, SubscriptionRoleTable.roleId));

  const map = new Map<string, string>();
  for (const row of rows) map.set(`${row.roleName}:${row.name}`, row.id);
  return map;
}

export async function seedSampleActivity(): Promise<void> {
  const plans = await buildPlanMap();
  const planId = (role: string | null, name: string | null) =>
    role && name ? plans.get(`${role}:${name}`) ?? null : null;

  // Wipe previous sample set so re-runs stay clean.
  await db.delete(MemberSubscriptionTable).where(eq(MemberSubscriptionTable.createdBy, ACTOR));
  await db.delete(AdminRequestTable).where(eq(AdminRequestTable.createdBy, ACTOR));

  for (const m of MEMBER_SEED) {
    await db.insert(MemberSubscriptionTable).values({
      subscriberType: m.subscriberType,
      subscriberId: randomUUID(),
      subscriberName: m.subscriberName,
      subscriptionId: planId(m.role, m.planName),
      planName: m.planName,
      amount: m.amount,
      billingCycle: m.billingCycle,
      currency: 'MYR',
      status: m.status,
      startedAt: new Date(m.startedAt),
      endedAt: m.endedAt ? new Date(m.endedAt) : null,
      createdBy: ACTOR,
      updatedBy: ACTOR,
    });
  }

  for (const a of ADMIN_SEED) {
    const resolved = a.status === 'resolved';
    await db.insert(AdminRequestTable).values({
      type: a.type,
      subscriberType: a.subscriberType,
      subscriberId: randomUUID(),
      subscriberName: a.subscriberName,
      currentPlanId: planId(a.role, a.planName),
      message: a.message,
      status: a.status,
      quotedAmount: a.quotedAmount ?? null,
      contactedAt: resolved ? new Date('2026-07-12') : null,
      contactedBy: resolved ? ACTOR : null,
      createdBy: ACTOR,
      updatedBy: ACTOR,
    });
  }

  logger.info(
    `[seed-sample-activity] Done. ${MEMBER_SEED.length} subscriptions, ${ADMIN_SEED.length} requests.`,
  );
}

seedSampleActivity()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('[seed-sample-activity] Error:', error);
    process.exit(1);
  });
