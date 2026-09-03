import type { DbTransaction } from '@/types/db-transaction.js';
import type { MemberSubscriptionRepositoryClass } from '@/features/member-subscription/member-subscription.repository.js';
import type { SubscriptionRepositoryClass } from './subscription.repository.js';

/** A catalog row, typed off the repository so no second import can drift from it. */
type CatalogPlan = NonNullable<
  Awaited<ReturnType<SubscriptionRepositoryClass['getSubscriptionById']>>
>;

export type PlanChoice =
  | { ok: true; plan: CatalogPlan }
  | { ok: false; message: string };

/**
 * Is this catalog id a plan this kind of org may be put on — the ONE place that
 * question is answered.
 *
 * There are three doors onto a plan: web sign-up, an admin creating the org
 * directly, and a seed script. Each used to decide for itself what a usable
 * package was, and two of them decided "anything, including nothing" — which is
 * how orgs came to exist holding no subscription at all. A rule copied per
 * caller drifts silently; this one is imported.
 *
 * `getSubscriptionById` returns null when its own query throws, so a database
 * blip reads as "unavailable" here. That is the right way round at CREATION
 * time: nothing has been written yet, so a refusal costs a retry. It is the
 * opposite of the rule at the posting gate, where an unknown answer must not
 * refuse — there an account already exists and a blip would take it offline.
 */
export async function resolveEnrollablePlan(input: {
  subscriptionRepository: SubscriptionRepositoryClass;
  accountType: 'agency' | 'outlet';
  packageId?: string | null;
}): Promise<PlanChoice> {
  const packageId = input.packageId?.trim();
  if (!packageId) {
    return {
      ok: false,
      message: 'A subscription package is required.',
    };
  }

  const plan = await input.subscriptionRepository.getSubscriptionById(packageId);
  if (!plan || plan.status !== 'active' || (plan.kind ?? 'plan') !== 'plan') {
    return {
      ok: false,
      message: 'That subscription package is not available. Pick another one.',
    };
  }
  if (plan.subscriptionType && plan.subscriptionType !== input.accountType) {
    return {
      ok: false,
      message: `That package is for ${plan.subscriptionType} accounts.`,
    };
  }
  return { ok: true, plan };
}

/**
 * Open the org's first billing row.
 *
 * THROWS when the insert does not land, and that is the point. Every caller
 * runs this inside the same transaction that creates the org, so a failure here
 * rolls the org back rather than committing one that holds no plan. The old
 * behaviour — log a warning and carry on — is precisely what produced venues
 * that existed and could not be billed, and since `ShiftController` now refuses
 * to post for a venue with no plan, such a venue would be born unable to work.
 */
export async function enrolOrgOnPlan(input: {
  memberSubscriptionRepository: MemberSubscriptionRepositoryClass;
  plan: CatalogPlan;
  subscriberType: 'agency' | 'outlet';
  subscriberId: string;
  subscriberName: string;
  actor: string;
  tx?: DbTransaction;
}): Promise<void> {
  const row = await input.memberSubscriptionRepository.create(
    {
      subscriberType: input.subscriberType,
      subscriberId: input.subscriberId,
      subscriberName: input.subscriberName,
      subscriptionId: input.plan.id,
      planName: input.plan.name,
      amount: input.plan.price,
      billingCycle: input.plan.billingCycle,
      status: 'active',
      startedAt: new Date(),
      createdBy: input.actor,
      updatedBy: input.actor,
    },
    input.tx,
  );
  if (!row) {
    throw new Error(
      `Could not enrol ${input.subscriberType} ${input.subscriberId} on plan ${input.plan.id}`,
    );
  }
}
