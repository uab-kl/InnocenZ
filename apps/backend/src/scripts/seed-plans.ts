import 'dotenv/config';

import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { RoleTable } from '@/features/rbac/role/role.model';
import { SubscriptionTable, BillingCycle } from '@/features/subscription/subscription.model';
import { SubscriptionRoleTable } from '@/features/subscription/subscription-role.model';
import { logger } from '@/util/logger';

const ACTOR = 'system';

type RoleName = 'outlet' | 'agency';
type PlanSeed = {
  name: string;
  price: string;
  billingCycle: BillingCycle;
  role: RoleName;
  coverage: string;
};

// Full plan catalog taken from the InnocenZ prototype subscription screens.
// Outlet = monthly fixed tiers (RM/month); Agency = weekly usage-based tiers (RM/week).
// Agency "Custom" is the 151+ PV/week "Renegotiate Price" tier — price stays 0 and the
// actual figure is captured per deal in admin_request.quoted_amount.
const PLANS: PlanSeed[] = [
  // Outlet — monthly (PRs/day capacity)
  { name: 'Essential', price: '999.00', billingCycle: 'monthly', role: 'outlet', coverage: '5 PRs/day' },
  { name: 'Plus', price: '1699.00', billingCycle: 'monthly', role: 'outlet', coverage: '6–10 PRs/day' },
  { name: 'Pro', price: '2999.00', billingCycle: 'monthly', role: 'outlet', coverage: '11–25 PRs/day' },
  { name: 'Enterprise', price: '3999.00', billingCycle: 'monthly', role: 'outlet', coverage: '26–50 PRs/day' },
  { name: 'Scale', price: '6999.00', billingCycle: 'monthly', role: 'outlet', coverage: '51–100 PRs/day' },
  { name: 'Premier', price: '9999.00', billingCycle: 'monthly', role: 'outlet', coverage: '101+ PRs/day' },
  // Agency — weekly (PV/week volume)
  { name: 'Starter', price: '125.00', billingCycle: 'weekly', role: 'agency', coverage: '5 PV/week' },
  { name: 'Plus', price: '250.00', billingCycle: 'weekly', role: 'agency', coverage: '6–10 PV/week' },
  { name: 'Growth', price: '500.00', billingCycle: 'weekly', role: 'agency', coverage: '11–25 PV/week' },
  { name: 'Enterprise', price: '1000.00', billingCycle: 'weekly', role: 'agency', coverage: '26–75 PV/week' },
  { name: 'Scale', price: '1500.00', billingCycle: 'weekly', role: 'agency', coverage: '76–150 PV/week' },
  { name: 'Custom', price: '0.00', billingCycle: 'weekly', role: 'agency', coverage: '151+ PV/week' },
];

async function getRoleId(roleName: RoleName): Promise<string | null> {
  const [row] = await db
    .select({ id: RoleTable.id })
    .from(RoleTable)
    .where(eq(RoleTable.roleName, roleName))
    .limit(1);
  return row?.id ?? null;
}

// Find a plan by name that is already linked to the given role.
async function findPlanIdByNameAndRole(name: string, roleId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: SubscriptionTable.id })
    .from(SubscriptionTable)
    .innerJoin(SubscriptionRoleTable, eq(SubscriptionRoleTable.subscriptionId, SubscriptionTable.id))
    .where(and(eq(SubscriptionTable.name, name), eq(SubscriptionRoleTable.roleId, roleId)))
    .limit(1);
  return row?.id ?? null;
}

export async function seedPlans(): Promise<void> {
  let inserted = 0;
  let updated = 0;

  for (const plan of PLANS) {
    const roleId = await getRoleId(plan.role);
    if (!roleId) {
      logger.warn(`[seed-plans] Role "${plan.role}" not found; skipping ${plan.name}. Run init-roles first.`);
      continue;
    }

    const existingId = await findPlanIdByNameAndRole(plan.name, roleId);
    if (existingId) {
      await db
        .update(SubscriptionTable)
        .set({
          price: plan.price,
          billingCycle: plan.billingCycle,
          coverage: plan.coverage,
          status: 'active',
          updatedBy: ACTOR,
          updatedAt: new Date(),
        })
        .where(eq(SubscriptionTable.id, existingId));
      updated += 1;
      logger.info(`[seed-plans] Updated ${plan.role}/${plan.name} -> RM${plan.price}/${plan.billingCycle}`);
      continue;
    }

    const [created] = await db
      .insert(SubscriptionTable)
      .values({
        name: plan.name,
        price: plan.price,
        billingCycle: plan.billingCycle,
        coverage: plan.coverage,
        status: 'active',
        createdBy: ACTOR,
        updatedBy: ACTOR,
      })
      .returning({ id: SubscriptionTable.id });

    if (!created) {
      logger.warn(`[seed-plans] Failed to insert ${plan.role}/${plan.name}`);
      continue;
    }

    await db.insert(SubscriptionRoleTable).values({
      subscriptionId: created.id,
      roleId,
      createdBy: ACTOR,
      updatedBy: ACTOR,
    });
    inserted += 1;
    logger.info(`[seed-plans] Created ${plan.role}/${plan.name} -> RM${plan.price}/${plan.billingCycle}`);
  }

  logger.info(`[seed-plans] Done. Inserted ${inserted}, updated ${updated}, total ${PLANS.length}.`);
}

seedPlans()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('[seed-plans] Error:', error);
    process.exit(1);
  });
