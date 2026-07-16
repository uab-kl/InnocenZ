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
  /** Plan-change only: target tier name (resolved to requestedPlanId on insert). */
  requestedPlanName?: string | null;
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
  // More outlets across the monthly tiers.
  { subscriberType: 'outlet', subscriberName: 'Crimson Terrace', role: 'outlet', planName: 'Plus', amount: '1699.00', billingCycle: 'monthly', status: 'active', startedAt: '2026-06-10' },
  { subscriberType: 'outlet', subscriberName: 'Onyx Speakeasy', role: 'outlet', planName: 'Scale', amount: '6999.00', billingCycle: 'monthly', status: 'active', startedAt: '2026-05-02' },
  { subscriberType: 'outlet', subscriberName: 'Marble Hall', role: 'outlet', planName: 'Premier', amount: '9999.00', billingCycle: 'monthly', status: 'active', startedAt: '2026-04-18' },
  { subscriberType: 'outlet', subscriberName: 'Jade Garden Bar', role: 'outlet', planName: 'Pro', amount: '2999.00', billingCycle: 'monthly', status: 'past_due', startedAt: '2026-06-22' },
  // More agencies across the weekly tiers, incl. the 151+ PV Custom tier.
  { subscriberType: 'agency', subscriberName: 'Summit Staffing', role: 'agency', planName: 'Scale', amount: '1500.00', billingCycle: 'weekly', status: 'active', startedAt: '2026-07-07' },
  { subscriberType: 'agency', subscriberName: 'Horizon Talent', role: 'agency', planName: 'Custom', amount: '2500.00', billingCycle: 'weekly', status: 'active', startedAt: '2026-06-23' },
  { subscriberType: 'agency', subscriberName: 'Pioneer Crew', role: 'agency', planName: 'Scale', amount: '1500.00', billingCycle: 'weekly', status: 'active', startedAt: '2026-07-07' },
  { subscriberType: 'agency', subscriberName: 'Vanguard PR', role: 'agency', planName: 'Growth', amount: '500.00', billingCycle: 'weekly', status: 'active', startedAt: '2026-07-07' },
];

// Demo plan requests — one clear example per role × type × pricing rule.
// Pricing rules (mirrors the admin Plan Request page):
//   • outlet + POS quote          → negotiable; quote set only after Resolve
//   • agency + plan change + Custom → negotiable; quote set only after Resolve
//   • any other plan change       → fixed previous-plan price (pending/contacted show tier price; Resolve stamps it)
//   • contact / other             → no price
// quotedAmount is ONLY set on resolved rows where a price was actually recorded.
const ADMIN_SEED: AdminSeed[] = [
  // — OUTLET · POS quote (negotiable after resolve)
  { type: 'pos_integration_quote', subscriberType: 'outlet', subscriberName: 'Neon Sky Club', role: 'outlet', planName: 'Pro', message: '[Demo] Outlet POS quote — pending, quote after resolve.', status: 'pending' },
  { type: 'pos_integration_quote', subscriberType: 'outlet', subscriberName: 'Crimson Terrace', role: 'outlet', planName: 'Plus', message: '[Demo] Outlet POS quote — contacted, quote after resolve.', status: 'contacted' },
  { type: 'pos_integration_quote', subscriberType: 'outlet', subscriberName: 'Velvet Lounge', role: 'outlet', planName: 'Essential', message: '[Demo] Outlet POS quote — resolved with admin quote.', status: 'resolved', quotedAmount: '4500.00' },

  // — OUTLET · plan change (fixed previous-plan price)
  { type: 'plan_change', subscriberType: 'outlet', subscriberName: 'Onyx Speakeasy', role: 'outlet', planName: 'Scale', requestedPlanName: 'Premier', message: '[Demo] Outlet plan change Scale → Premier — pending.', status: 'pending' },
  { type: 'plan_change', subscriberType: 'outlet', subscriberName: 'Marble Hall', role: 'outlet', planName: 'Premier', requestedPlanName: 'Enterprise', message: '[Demo] Outlet plan change Premier → Enterprise — contacted.', status: 'contacted' },
  { type: 'plan_change', subscriberType: 'outlet', subscriberName: 'Aurora Rooftop', role: 'outlet', planName: 'Enterprise', requestedPlanName: 'Scale', message: '[Demo] Outlet plan change Enterprise → Scale — resolved.', status: 'resolved', quotedAmount: '3999.00' },

  // — OUTLET · contact / other (no price)
  { type: 'contact', subscriberType: 'outlet', subscriberName: 'Jade Garden Bar', role: 'outlet', planName: 'Pro', message: '[Demo] Outlet contact — general enquiry, no quote.', status: 'pending' },
  { type: 'other', subscriberType: 'outlet', subscriberName: 'Obsidian Club', role: null, planName: null, message: '[Demo] Outlet other — bespoke package enquiry, no quote.', status: 'contacted' },

  // — AGENCY · plan change on Custom tier (negotiable after resolve)
  { type: 'plan_change', subscriberType: 'agency', subscriberName: 'Horizon Talent', role: 'agency', planName: 'Custom', requestedPlanName: 'Custom', message: '[Demo] Agency Custom renegotiation — pending.', status: 'pending' },
  { type: 'plan_change', subscriberType: 'agency', subscriberName: 'Pioneer Crew', role: 'agency', planName: 'Custom', requestedPlanName: 'Custom', message: '[Demo] Agency Custom renegotiation — contacted.', status: 'contacted' },
  { type: 'plan_change', subscriberType: 'agency', subscriberName: 'Summit Staffing', role: 'agency', planName: 'Custom', requestedPlanName: 'Custom', message: '[Demo] Agency Custom renegotiation — resolved with quote.', status: 'resolved', quotedAmount: '1800.00' },

  // — AGENCY · plan change on standard tier (fixed previous-plan price)
  { type: 'plan_change', subscriberType: 'agency', subscriberName: 'Prime Talent Agency', role: 'agency', planName: 'Growth', requestedPlanName: 'Enterprise', message: '[Demo] Agency plan change Growth → Enterprise — pending.', status: 'pending' },
  { type: 'plan_change', subscriberType: 'agency', subscriberName: 'Starlight Staffing', role: 'agency', planName: 'Starter', requestedPlanName: 'Growth', message: '[Demo] Agency plan change Starter → Growth — contacted.', status: 'contacted' },
  { type: 'plan_change', subscriberType: 'agency', subscriberName: 'Elite Crew Co', role: 'agency', planName: 'Enterprise', requestedPlanName: 'Scale', message: '[Demo] Agency plan change Enterprise → Scale — resolved.', status: 'resolved', quotedAmount: '1000.00' },

  // — AGENCY · contact / other (no price)
  { type: 'contact', subscriberType: 'agency', subscriberName: 'Vanguard PR', role: 'agency', planName: 'Growth', message: '[Demo] Agency contact — roster question, no quote.', status: 'pending' },
  { type: 'other', subscriberType: 'agency', subscriberName: 'Atlas Agency', role: null, planName: null, message: '[Demo] Agency other — partnership enquiry, no quote.', status: 'resolved' },
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
