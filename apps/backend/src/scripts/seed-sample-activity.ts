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
  type: 'pos_integration_quote' | 'custom_renegotiation' | 'plan_change' | 'contact' | 'other';
  subscriberType: 'outlet' | 'agency' | null;
  subscriberName: string;
  role: 'outlet' | 'agency' | null;
  planName: string | null;
  /** Plan-change only: target tier name (resolved to requestedPlanId on insert). */
  requestedPlanName?: string | null;
  message: string;
  status: 'pending' | 'contacted' | 'resolved' | 'declined' | 'direct' | 'approved';
  quotedAmount?: string;
};

const MEMBER_SEED: MemberSeed[] = [
  { subscriberType: 'outlet', subscriberName: 'Neon Sky Club', role: 'outlet', planName: 'Pro', amount: '2999.00', billingCycle: 'monthly', status: 'active', startedAt: '2026-07-01' },
  { subscriberType: 'outlet', subscriberName: 'Velvet Lounge', role: 'outlet', planName: 'Essential', amount: '999.00', billingCycle: 'monthly', status: 'active', startedAt: '2026-06-15' },
  { subscriberType: 'outlet', subscriberName: 'Aurora Rooftop', role: 'outlet', planName: 'Enterprise', amount: '3999.00', billingCycle: 'monthly', status: 'active', startedAt: '2026-05-20' },
  { subscriberType: 'agency', subscriberName: 'Prime Talent Agency', role: 'agency', planName: 'Growth', amount: '500.00', billingCycle: 'weekly', status: 'active', startedAt: '2026-07-07' },
  { subscriberType: 'agency', subscriberName: 'Starlight Staffing', role: 'agency', planName: 'Starter', amount: '125.00', billingCycle: 'weekly', status: 'active', startedAt: '2026-07-07' },
  { subscriberType: 'agency', subscriberName: 'Elite Crew Co', role: 'agency', planName: 'Enterprise', amount: '1000.00', billingCycle: 'weekly', status: 'cancelled', startedAt: '2026-06-01', endedAt: '2026-06-30' },
  // More outlets across the monthly tiers.
  { subscriberType: 'outlet', subscriberName: 'Crimson Terrace', role: 'outlet', planName: 'Plus', amount: '1699.00', billingCycle: 'monthly', status: 'active', startedAt: '2026-06-10' },
  { subscriberType: 'outlet', subscriberName: 'Onyx Speakeasy', role: 'outlet', planName: 'Scale', amount: '6999.00', billingCycle: 'monthly', status: 'active', startedAt: '2026-05-02' },
  { subscriberType: 'outlet', subscriberName: 'Marble Hall', role: 'outlet', planName: 'Premier', amount: '9999.00', billingCycle: 'monthly', status: 'active', startedAt: '2026-04-18' },
  { subscriberType: 'outlet', subscriberName: 'Jade Garden Bar', role: 'outlet', planName: 'Pro', amount: '2999.00', billingCycle: 'monthly', status: 'past_due', startedAt: '2026-06-22' },
  // More agencies across the weekly tiers, including agencies requesting Custom.
  { subscriberType: 'agency', subscriberName: 'Summit Staffing', role: 'agency', planName: 'Scale', amount: '1500.00', billingCycle: 'weekly', status: 'active', startedAt: '2026-07-07' },
  { subscriberType: 'agency', subscriberName: 'Horizon Talent', role: 'agency', planName: 'Growth', amount: '500.00', billingCycle: 'weekly', status: 'active', startedAt: '2026-06-23' },
  { subscriberType: 'agency', subscriberName: 'Pioneer Crew', role: 'agency', planName: 'Enterprise', amount: '1000.00', billingCycle: 'weekly', status: 'active', startedAt: '2026-07-07' },
  { subscriberType: 'agency', subscriberName: 'Vanguard PR', role: 'agency', planName: 'Growth', amount: '500.00', billingCycle: 'weekly', status: 'active', startedAt: '2026-07-07' },
];

// Demo plan requests — clear examples for the Plan Request and Plan Change inboxes.
// Pricing mirrors the admin pages: POS and Custom requests are negotiable, outlet
// plan changes need approval, and agency plan changes are direct PR-count logs.
// quotedAmount is only set after a price has been finalised.
const ADMIN_SEED: AdminSeed[] = [
  // — OUTLET · POS quote (negotiable after resolve)
  { type: 'pos_integration_quote', subscriberType: 'outlet', subscriberName: 'Neon Sky Club', role: 'outlet', planName: 'Pro', message: '[Demo] Outlet POS quote — pending, quote after resolve.', status: 'pending' },
  { type: 'pos_integration_quote', subscriberType: 'outlet', subscriberName: 'Crimson Terrace', role: 'outlet', planName: 'Plus', message: '[Demo] Outlet POS quote — contacted, quote after resolve.', status: 'contacted' },
  { type: 'pos_integration_quote', subscriberType: 'outlet', subscriberName: 'Velvet Lounge', role: 'outlet', planName: 'Essential', message: '[Demo] Outlet POS quote — resolved with admin quote.', status: 'resolved', quotedAmount: '4500.00' },

  // — OUTLET · plan change (needs admin approval; price rides the from-plan until
  //   approved, then follows the to-plan — quotedAmount stamped on approve)
  { type: 'plan_change', subscriberType: 'outlet', subscriberName: 'Onyx Speakeasy', role: 'outlet', planName: 'Scale', requestedPlanName: 'Premier', message: '[Demo] Outlet plan change Scale → Premier — pending admin approval.', status: 'pending' },
  { type: 'plan_change', subscriberType: 'outlet', subscriberName: 'Marble Hall', role: 'outlet', planName: 'Premier', requestedPlanName: 'Enterprise', message: '[Demo] Outlet plan change Premier → Enterprise — declined by admin.', status: 'declined' },
  { type: 'plan_change', subscriberType: 'outlet', subscriberName: 'Aurora Rooftop', role: 'outlet', planName: 'Enterprise', requestedPlanName: 'Scale', message: '[Demo] Outlet plan change Enterprise → Scale — approved; price follows the to-plan.', status: 'approved', quotedAmount: '6999.00' },

  // — AGENCY · Custom renegotiation ("Renegotiate Price" on the 151+ PV tier;
  //   negotiable — the estimate is set/changed before Resolve)
  { type: 'custom_renegotiation', subscriberType: 'agency', subscriberName: 'Horizon Talent', role: 'agency', planName: 'Growth', message: '[Demo] Agency Growth → Custom renegotiation — pending, estimate before resolve.', status: 'pending' },
  { type: 'custom_renegotiation', subscriberType: 'agency', subscriberName: 'Pioneer Crew', role: 'agency', planName: 'Enterprise', message: '[Demo] Agency Enterprise → Custom renegotiation — contacted, estimate before resolve.', status: 'contacted' },
  { type: 'custom_renegotiation', subscriberType: 'agency', subscriberName: 'Summit Staffing', role: 'agency', planName: 'Scale', message: '[Demo] Agency Scale → Custom renegotiation — resolved with negotiated price.', status: 'resolved', quotedAmount: '1800.00' },

  // — AGENCY · plan change (direct — switched automatically by PR count; no
  //   admin approval, price follows the to-plan on the Plan page)
  { type: 'plan_change', subscriberType: 'agency', subscriberName: 'Prime Talent Agency', role: 'agency', planName: 'Growth', requestedPlanName: 'Enterprise', message: '[Demo] Agency plan change Growth → Enterprise — direct (PR count).', status: 'direct' },
  { type: 'plan_change', subscriberType: 'agency', subscriberName: 'Starlight Staffing', role: 'agency', planName: 'Starter', requestedPlanName: 'Growth', message: '[Demo] Agency plan change Starter → Growth — direct (PR count).', status: 'direct' },
  { type: 'plan_change', subscriberType: 'agency', subscriberName: 'Elite Crew Co', role: 'agency', planName: 'Enterprise', requestedPlanName: 'Scale', message: '[Demo] Agency plan change Enterprise → Scale — direct (PR count).', status: 'direct' },
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
    const touched = a.status === 'contacted' || a.status === 'resolved';
    await db.insert(AdminRequestTable).values({
      type: a.type,
      subscriberType: a.subscriberType,
      subscriberId: randomUUID(),
      subscriberName: a.subscriberName,
      currentPlanId: planId(a.role, a.planName),
      requestedPlanId: planId(a.role, a.requestedPlanName ?? null),
      message: a.message,
      status: a.status,
      quotedAmount: a.quotedAmount ?? null,
      contactedAt: touched ? new Date('2026-07-12') : null,
      contactedBy: touched ? ACTOR : null,
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
