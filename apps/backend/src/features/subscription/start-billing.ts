import { logger } from '@/util/logger.js';
import type { MemberSubscriptionRepositoryClass } from '@/features/member-subscription/member-subscription.repository.js';
import type { SubscriptionInvoiceRepositoryClass } from '@/features/subscription-invoice/subscription-invoice.repository.js';
import { announceOpenedInvoices } from '@/features/subscription-invoice/announce-opened.js';

export type BillingStart = {
  /** How many subscription lanes had their meter started by this call. */
  started: number;
  /** How many billing periods were opened as a result. */
  opened: number;
};

/**
 * START THE METER — what admin approval does to the billing ledger.
 *
 * Owner's call, 9 Sep 2026: an organisation is billed from the day it is
 * APPROVED, not the day it signs up. A self-registered org is created
 * `pending_review` and the portal confines it to Settings/Profile until an admin
 * lets it in, so the old rule opened a RM 999 monthly period on the day a venue
 * gained access to an address form — and kept that day as its billing anchor for
 * the life of the account. `enrolOrgOnPlan` now leaves `billing_starts_at` NULL
 * and this is the one place that fills it in.
 *
 * SHARED BY BOTH APPROVE HANDLERS, and it exists as a module for that reason
 * alone: outlets and agencies are approved by two different controllers, and a
 * money rule copied into two of them is a money rule that will drift. It is a
 * LEAF — repositories arrive as arguments, exactly as `enrolOrgOnPlan` takes
 * them — so neither controller closes an import cycle to reach it.
 *
 * ── IT OPENS THE FIRST PERIOD ITSELF ─────────────────────────────────────────
 * Rather than waiting for the 03:00 KL job. The daily job is what keeps the
 * ledger growing, but between an approval at 09:00 and the next tick there would
 * be up to 27 hours in which the org is accruing a period no invoice exists for
 * — the admin's Plan Payment page would show nothing to mark paid, and the org
 * would be told nothing. `generateMissing` is idempotent and scoped here to the
 * ids just stamped, so the nightly pass re-reads them and writes nothing.
 *
 * ── IT NEVER THROWS ──────────────────────────────────────────────────────────
 * Approval is already committed by the time this runs, and an approval that
 * succeeded must be reported as having succeeded even if the billing bookkeeping
 * failed. The cost of failing quietly here is one missing period that the very
 * next nightly run heals by itself; the cost of throwing is an admin told the
 * approval failed when the org is, in fact, approved.
 */
export async function startBillingOnApproval(input: {
  memberSubscriptionRepository: MemberSubscriptionRepositoryClass;
  subscriptionInvoiceRepository: SubscriptionInvoiceRepositoryClass;
  subscriberType: 'agency' | 'outlet';
  subscriberId: string;
  actor: string;
}): Promise<BillingStart> {
  const none: BillingStart = { started: 0, opened: 0 };
  try {
    /**
     * Only lanes still WAITING for an anchor are stamped — the repository's
     * `billing_starts_at IS NULL` guard. `/approve` is also the reactivation
     * path for a suspended org, whose lanes are already anchored, and
     * re-anchoring those would move a paying customer's billing day every time
     * it was suspended and restored.
     */
    const ids = await input.memberSubscriptionRepository.startBilling({
      subscriberType: input.subscriberType,
      subscriberId: input.subscriberId,
      at: new Date(),
      actor: input.actor,
    });
    /**
     * `null` IS THE ONE FAILURE THAT DOES NOT HEAL, and it is why this is not
     * `if (!ids?.length)`.
     *
     * Everything else here is self-correcting: if the stamp landed and the
     * period could not be opened, the lane is anchored and the 03:00 job opens
     * every missing period the next morning. But if the STAMP failed the lane
     * has no anchor at all, and a lane with no anchor is exactly what that job
     * skips — tonight and every night after, in silence, while the org is live
     * and working. Logged at error, and caught again each morning by the
     * reconciliation in the invoice job.
     */
    if (ids === null) {
      logger.error(
        `[start-billing] ${input.subscriberType} ${input.subscriberId} was APPROVED but its ` +
          'billing anchor could not be written — it will not be invoiced until this is repaired. ' +
          'The nightly job cannot fix this: an unanchored lane is skipped by design.',
      );
      return none;
    }
    // Nothing to stamp: already billing. The ordinary outcome of re-approving a
    // suspended org, and correctly a no-op.
    if (ids.length === 0) return none;

    const result = await input.subscriptionInvoiceRepository.generateMissing({
      actor: input.actor,
      memberSubscriptionIds: ids,
    });

    // Told through the SAME announcer the nightly job and the admin's "Refresh
    // periods" button use, or which door opened the period would decide whether
    // the payer heard about it.
    await announceOpenedInvoices(result.opened);

    logger.info(
      `[start-billing] ${input.subscriberType} ${input.subscriberId} approved — ` +
        `billing started on ${ids.length} lane(s), ${result.created} period(s) opened`,
    );
    return { started: ids.length, opened: result.created };
  } catch (error) {
    logger.error('[start-billing.startBillingOnApproval] Error:', error);
    return none;
  }
}
