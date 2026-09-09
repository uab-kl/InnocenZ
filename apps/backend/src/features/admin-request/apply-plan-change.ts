import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import type { MemberSubscriptionRepositoryClass } from '@/features/member-subscription/member-subscription.repository.js';
import type { SubscriptionRepositoryClass } from '@/features/subscription/subscription.repository.js';
import type { SubscriptionInvoiceRepositoryClass } from '@/features/subscription-invoice/subscription-invoice.repository.js';
import type { SubscriberType } from '@/features/member-subscription/member-subscription.model.js';

/**
 * Move a subscriber onto a plan, in the `member_subscription` ledger.
 *
 * EXTRACTED so there is exactly one copy of this write. It lives here rather
 * than in the admin-request controller because a second caller now needs it —
 * the scheduled agency tier job — and the alternative was duplicating a money
 * rule into a cron. Two copies of a rule that closes one billing row and opens
 * another is how they drift, and the drift stays invisible until an agency is
 * billed twice or not at all.
 *
 * The ledger is a history of charges, so a switch is a NEW row: the old active
 * row is CLOSED (`ended_at` stamped, status 'expired') rather than overwritten,
 * which is what lets History still show what the org used to pay.
 *
 * Only the PLAN is closed. An add-on is held alongside a plan and outlives a
 * switch — closing every active line ended a venue's POS integration the moment
 * it moved between tiers, cancelling an arrangement an admin had priced and the
 * venue had not asked to drop.
 *
 * Never throws into the caller: a request that cannot be reflected (no
 * subscriber, unknown plan) is logged and skipped, because refusing here would
 * leave an admin unable to answer the request at all.
 */
export async function applyPlanChangeToLedger(params: {
  memberSubscriptionRepository: MemberSubscriptionRepositoryClass;
  subscriptionRepository: SubscriptionRepositoryClass;
  /**
   * When given, the switch is PRICED: a paid period moved to a dearer plan
   * bills the difference, a cheaper plan credits it. Optional only so a caller
   * that cannot reach the billing ledger still moves the plan.
   */
  subscriptionInvoiceRepository?: SubscriptionInvoiceRepositoryClass;
  record: {
    id: string;
    subscriberType: SubscriberType | null;
    subscriberId: string | null;
    subscriberName: string;
    requestedPlanId: string | null;
    quotedAmount?: string | null;
  };
  actor: string;
}): Promise<void> {
  const { memberSubscriptionRepository, subscriptionRepository, record, actor } = params;
  try {
    if (!record.subscriberId || !record.subscriberType || !record.requestedPlanId) {
      logger.warn(
        `[applyPlanChangeToLedger] plan change ${record.id} not reflected in the ledger: ` +
          `subscriberId=${record.subscriberId} requestedPlanId=${record.requestedPlanId}`,
      );
      return;
    }
    const plan = await subscriptionRepository.getSubscriptionById(record.requestedPlanId);
    if (!plan) {
      logger.warn(
        `[applyPlanChangeToLedger] plan ${record.requestedPlanId} not found; ledger untouched`,
      );
      return;
    }

    const { records: current } = await memberSubscriptionRepository.listPaginated({
      filter: {
        subscriberType: record.subscriberType,
        subscriberId: record.subscriberId,
        status: 'active',
        kind: 'plan',
      },
      page: 1,
      pageSize: 50,
    });
    // What the org was paying before the switch — the highest of the rows
    // being closed, which for a sane ledger is the one row on the plan lane.
    const previous = current.reduce<(typeof current)[number] | null>(
      (best, row) => (!best || Number(row.amount) > Number(best.amount) ? row : best),
      null,
    );
    const endedAt = new Date();
    // The negotiated price wins when one was set; otherwise the plan's.
    const amount = record.quotedAmount ?? plan.price;
    const created = await memberSubscriptionRepository.create({
      subscriberType: record.subscriberType,
      subscriberId: record.subscriberId,
      subscriberName: record.subscriberName,
      subscriptionId: plan.id,
      planName: plan.name,
      amount,
      billingCycle: plan.billingCycle,
      status: 'active',
      startedAt: endedAt,
      /**
       * A SWITCH INHERITS THE LANE'S BILLING ANCHOR — it never re-anchors it.
       *
       * `generateMissing` already takes a lane's calendar from its EARLIEST
       * anchor, so this row's value cannot move a billing day on its own. It is
       * carried across anyway for the case where the earliest row does not
       * survive, and for the one case where the difference is visible: an org
       * still awaiting approval carries NULL, and a plan change made before that
       * approval must leave it unbilled rather than starting the meter on the
       * switch. Omitted entirely when nothing was closed, so `create()` applies
       * its bill-from-now default for a genuine first plan.
       */
      ...(previous ? { billingStartsAt: previous.billingStartsAt } : {}),
      createdBy: actor,
      updatedBy: actor,
    });

    // Price the switch against the period already running. A first plan
    // (nothing closed) has nothing to prorate against.
    if (params.subscriptionInvoiceRepository && previous && created) {
      const outcome = await params.subscriptionInvoiceRepository.prorateLaneSwitch({
        subscriberType: record.subscriberType,
        subscriberId: record.subscriberId,
        newMemberSubscriptionId: created.id,
        fromPlanName: previous.planName,
        toPlanName: plan.name,
        fromAmount: previous.amount,
        toAmount: amount,
        actor,
      });
      logger.info(
        `[applyPlanChangeToLedger] ${record.subscriberName}: ${previous.planName} → ${plan.name}, proration: ${outcome}`,
      );
    }
  } catch (error) {
    logger.error('[applyPlanChangeToLedger] Error:', error);
  }
}
