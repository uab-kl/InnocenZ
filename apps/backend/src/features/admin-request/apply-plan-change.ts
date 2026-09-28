import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import type { DbTransaction } from '@/types/db-transaction.js';
import type { MemberSubscriptionRepositoryClass } from '@/features/member-subscription/member-subscription.repository.js';
import type { SubscriptionRepositoryClass } from '@/features/subscription/subscription.repository.js';
import type { SubscriptionInvoiceRepositoryClass } from '@/features/subscription-invoice/subscription-invoice.repository.js';
import type {
  MemberSubscription,
  SubscriberType,
} from '@/features/member-subscription/member-subscription.model.js';
import type { Subscription } from '@/features/subscription/subscription.model.js';
import { lockLivePlanRows, subscriberOrgExists } from '@/features/subscription/plan-limit.js';
import type { AdminRequestType } from './admin-request.model.js';
import {
  type PlanChangeRefusal,
  PlanChangeRefusedError,
  checkPlanChange,
  requestTouchesLedger,
  subscriberNotFoundRefusal,
} from './plan-change-rules.js';

/** The fields of a request (or a job's decision) that a switch reads. */
export type PlanChangeRecord = {
  /** For log lines only — a switch filed inside `inTransaction` has no id yet. */
  id?: string;
  subscriberType: SubscriberType | null;
  subscriberId: string | null;
  subscriberName: string;
  requestedPlanId: string | null;
  quotedAmount?: string | null;
};

export type AppliedPlanChange = {
  /** The plan row the switch opened. */
  opened: MemberSubscription;
  /** How many live plan rows it closed — 1 for a sane ledger, 0 for a first plan. */
  closed: number;
  proration: 'upgrade_invoiced' | 'repriced' | 'credited' | 'none';
};

/**
 * May this switch reach the ledger at all? Reads the facts and hands them to
 * `checkPlanChange` (plan-change-rules.ts), which holds every rule.
 *
 * THROWS `PlanChangeRefusedError` on a refusal, and lets a failed read throw as
 * itself — "could not tell" is never allowed to read as "fine". Exported so a
 * door that FILES a switch can refuse it up front instead of filing something
 * the ledger will never accept.
 *
 * ⚠️ `getSubscriptionById` answers null on a read error as well as on a missing
 * row, so a database blip here surfaces as "not in the catalog". It still
 * refuses, which is the direction that matters.
 */
export async function validatePlanChange(params: {
  subscriptionRepository: SubscriptionRepositoryClass;
  record: Pick<PlanChangeRecord, 'subscriberType' | 'subscriberId' | 'requestedPlanId'>;
}): Promise<{ plan: Subscription; subscriberType: SubscriberType; subscriberId: string }> {
  const { record } = params;
  const plan = record.requestedPlanId
    ? await params.subscriptionRepository.getSubscriptionById(record.requestedPlanId)
    : null;
  const subscriberExists =
    record.subscriberType && record.subscriberId
      ? await subscriberOrgExists({
          subscriberType: record.subscriberType,
          subscriberId: record.subscriberId,
        })
      : false;
  const verdict = checkPlanChange({
    subscriberType: record.subscriberType,
    subscriberId: record.subscriberId,
    requestedPlanId: record.requestedPlanId,
    subscriberExists,
    plan,
  });
  if (!verdict.ok) throw new PlanChangeRefusedError(verdict.refusal);
  return verdict;
}

/** The fields of an admin_request that decide whether its answer may reach the ledger. */
export type LedgerRequestFacts = {
  type: AdminRequestType;
  subscriberType: SubscriberType | null;
  subscriberId: string | null;
  requestedPlanId: string | null;
};

/**
 * The refusal for a REQUEST whose answer would write the billing ledger but
 * whose facts the ledger would never accept — or null when it may proceed.
 *
 * Asked where a request is FILED, RE-TYPED or RESOLVED, not only where a switch
 * is applied, so a request the ledger will refuse never sits in the queue
 * looking approvable. `admin_request.subscriber_id` has no foreign key (it
 * points at one of two tables), and an admin is exempt from the ownership check
 * on create, so without this an admin could file — and later approve — a plan
 * for an organisation id that exists nowhere.
 *
 * - A plan SWITCH (a plan change, or a Custom renegotiation that names the plan
 *   to land on) gets the full rule — see `checkPlanChange`.
 * - Any other ledger-writing request (a POS quote, a Custom re-price) needs only
 *   its organisation to exist.
 * - A contact / other request bills nothing and is left alone.
 *
 * A failed read THROWS: the caller's 500 is honest, a guess either way is not.
 */
export async function ledgerRefusal(params: {
  subscriptionRepository: SubscriptionRepositoryClass;
  request: LedgerRequestFacts;
}): Promise<PlanChangeRefusal | null> {
  const { request } = params;
  const isSwitch =
    request.type === 'plan_change' ||
    (request.type === 'custom_renegotiation' && Boolean(request.requestedPlanId));
  if (isSwitch) {
    try {
      await validatePlanChange({ subscriptionRepository: params.subscriptionRepository, record: request });
      return null;
    } catch (error) {
      if (error instanceof PlanChangeRefusedError) {
        return { code: error.code, status: error.status, message: error.message };
      }
      throw error;
    }
  }
  if (!requestTouchesLedger(request.type) || !request.subscriberType || !request.subscriberId) {
    return null;
  }
  const exists = await subscriberOrgExists({
    subscriberType: request.subscriberType,
    subscriberId: request.subscriberId,
  });
  return exists ? null : subscriberNotFoundRefusal(request.subscriberType);
}

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
 * The ledger is a history of charges, so a switch is a NEW row: every live
 * PLAN row the org holds is CLOSED (`ended_at` stamped, status 'expired')
 * rather than overwritten, which is what lets History still show what the org
 * used to pay.
 *
 * ⚠️ THAT CLOSE WAS LOST ONCE. The 3 Sep 2026 merge (b3b577f3) resolved this
 * file by keeping one side's proration and NEITHER side's close — the loop and
 * the transaction below (02fceb8b) both went — so from then on every switch
 * would have opened a plan row and left the old one live beside it: two live
 * plans, a tier job that iterates both, and a last-plan guard that reads the
 * stale one as cover. It is restored here, re-read under lock.
 *
 * Only the PLAN is closed. An add-on is held alongside a plan and outlives a
 * switch — closing every active line ended a venue's POS integration the moment
 * it moved between tiers, cancelling an arrangement an admin had priced and the
 * venue had not asked to drop.
 *
 * ONE TRANSACTION for closing the old rows and opening the new one. As two
 * separate writes, a failure between them left the subscriber with every plan
 * row closed and none open — unbillable, invisible to the tier rule (which
 * reads FROM this table) and refused by the posting gate. This runs unattended
 * for every agency whose band moves at the Sunday 03:30 tier job, so "a failure
 * between the two writes" is weekly exposure across the estate. Atomic: either
 * the org moves onto the new plan, or it stays on the old one.
 *
 * `inTransaction` runs FIRST inside that same transaction — the caller's own
 * write that must stand or fall with the switch (approve's claim on a pending
 * request, the Plan Change record a 'direct' switch files). Throwing from it
 * rolls the whole switch back.
 *
 * ⚠️ IT REFUSES, IT NO LONGER LOGS AND CARRIES ON. A switch that fails
 * `validatePlanChange` throws `PlanChangeRefusedError` before anything is
 * written, and a failed write throws after the rollback. It used to log and
 * return, reasoning that refusing would leave an admin unable to answer the
 * request at all — but the admin can DECLINE it, and the quiet path is exactly
 * how an ACTIVE Premier row came to be opened for an outlet that does not exist
 * (request 000ec2b4, 28 Sep 2026). Each caller now answers in its own terms: the
 * HTTP doors reply 409/422 with the sentence, the tier job logs and skips.
 *
 * Proration runs AFTER the commit, on purpose: it inserts invoice lines that
 * reference the new row, from its own connection, and doing that while this
 * transaction still held the row uncommitted would wait on itself.
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
  record: PlanChangeRecord;
  actor: string;
  inTransaction?: (tx: DbTransaction) => Promise<void>;
}): Promise<AppliedPlanChange> {
  const { memberSubscriptionRepository, record, actor } = params;
  const { plan, subscriberType, subscriberId } = await validatePlanChange({
    subscriptionRepository: params.subscriptionRepository,
    record,
  });

  // The negotiated price wins when one was set; otherwise the plan's.
  const amount = record.quotedAmount ?? plan.price;
  const switchedAt = new Date();

  const { opened, previous, closed } = await db.transaction(async (tx) => {
    await params.inTransaction?.(tx);

    // Read INSIDE the transaction and under the lane lock, never before it: a
    // list taken earlier cannot see a row another switch opened in between,
    // and would leave that row live beside this one.
    const current = await lockLivePlanRows(tx, { subscriberType, subscriberId });
    // What the org was paying before the switch — the highest of the rows
    // being closed, which for a sane ledger is the one row on the plan lane.
    const before = current.reduce<MemberSubscription | null>(
      (best, row) => (!best || Number(row.amount) > Number(best.amount) ? row : best),
      null,
    );

    for (const row of current) {
      const ended = await memberSubscriptionRepository.update(
        row.id,
        { status: 'expired', endedAt: switchedAt, updatedBy: actor },
        tx,
      );
      // The repository swallows its own errors into null. Returning normally
      // here would COMMIT a half-done switch, so a null is thrown instead —
      // which is what makes the rollback happen.
      if (!ended) {
        throw new Error(`[applyPlanChangeToLedger] could not close plan row ${row.id}`);
      }
    }

    const created = await memberSubscriptionRepository.create(
      {
        subscriberType,
        subscriberId,
        subscriberName: record.subscriberName,
        subscriptionId: plan.id,
        planName: plan.name,
        amount,
        billingCycle: plan.billingCycle,
        status: 'active',
        startedAt: switchedAt,
        /**
         * A SWITCH INHERITS THE LANE'S BILLING ANCHOR — it never re-anchors it.
         *
         * `generateMissing` already takes a lane's calendar from its EARLIEST
         * anchor, so this row's value cannot move a billing day on its own. It
         * is carried across anyway for the case where the earliest row does not
         * survive, and for the one case where the difference is visible: an org
         * still awaiting approval carries NULL, and a plan change made before
         * that approval must leave it unbilled rather than starting the meter on
         * the switch. Omitted entirely when nothing was closed, so `create()`
         * applies its bill-from-now default for a genuine first plan.
         */
        ...(before ? { billingStartsAt: before.billingStartsAt } : {}),
        createdBy: actor,
        updatedBy: actor,
      },
      tx,
    );
    if (!created) {
      throw new Error(
        `[applyPlanChangeToLedger] could not open the new plan row for ${subscriberType} ${subscriberId}`,
      );
    }
    return { opened: created, previous: before, closed: current.length };
  });

  logger.info(
    `[applyPlanChangeToLedger] ${record.subscriberName}: ${previous?.planName ?? 'no plan'} → ${plan.name} ` +
      `(${closed} live plan row(s) closed${record.id ? `, request ${record.id}` : ''})`,
  );

  // Price the switch against the period already running. A first plan
  // (nothing closed) has nothing to prorate against.
  let proration: AppliedPlanChange['proration'] = 'none';
  if (params.subscriptionInvoiceRepository && previous) {
    proration = await params.subscriptionInvoiceRepository.prorateLaneSwitch({
      subscriberType,
      subscriberId,
      newMemberSubscriptionId: opened.id,
      fromPlanName: previous.planName,
      toPlanName: plan.name,
      fromAmount: previous.amount,
      toAmount: amount,
      actor,
    });
    logger.info(
      `[applyPlanChangeToLedger] ${record.subscriberName}: ${previous.planName} → ${plan.name}, proration: ${proration}`,
    );
  }
  return { opened, closed, proration };
}
