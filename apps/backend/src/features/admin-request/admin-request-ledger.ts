import type { AdminRequestRepositoryClass } from './admin-request.repository.js';
import type { AdminRequest } from './admin-request.model.js';
import type { MemberSubscriptionRepositoryClass } from '@/features/member-subscription/member-subscription.repository.js';
import type { SubscriptionRepositoryClass } from '@/features/subscription/subscription.repository.js';
import type { SubscriptionInvoiceRepositoryClass } from '@/features/subscription-invoice/subscription-invoice.repository.js';
import { logger } from '@/util/logger.js';
import type { DbTransaction } from '@/types/db-transaction.js';
import {
  type AppliedPlanChange,
  type LedgerRequestFacts,
  type PlanChangeRecord,
  applyPlanChangeToLedger,
  ledgerRefusal,
} from './apply-plan-change.js';
import type { PlanChangeRefusal } from './plan-change-rules.js';

/**
 * A resolve's plan SWITCH (Custom renegotiation) was refused or rolled back.
 * Carried out of `applyResolvedPriceToLedger`, whose other steps still log and
 * swallow, so `resolve()` can answer with the truth. `globalThis.Error` because
 * the handler files' `Error` is the response-message enum.
 */
export class SwitchNotAppliedError extends globalThis.Error {
  constructor(readonly cause: unknown) {
    super('The plan switch was not applied');
    this.name = 'SwitchNotAppliedError';
  }
}

/**
 * Everything the admin-request handlers do to — or ask of — the
 * `member_subscription` billing ledger. Shared by the subscriber's filing
 * (admin-request-subscriber.ts) and the admin's actions (admin-request-actions.ts).
 */
export class AdminRequestLedger {
  constructor(
    private readonly repository: AdminRequestRepositoryClass,
    private readonly memberSubscriptionRepository: MemberSubscriptionRepositoryClass,
    private readonly subscriptionRepository: SubscriptionRepositoryClass,
    private readonly subscriptionInvoiceRepository: SubscriptionInvoiceRepositoryClass,
  ) {}

  /**
   * Move a subscriber onto the plan they asked for, in the `member_subscription`
   * ledger that the admin History page reads. Called when an outlet's plan change
   * is APPROVED, when an agency's is recorded as 'direct' (agency switches apply
   * automatically — see create()), and when a Custom renegotiation that names a
   * plan is resolved.
   *
   * The ledger is a history of charges, so a switch is a NEW row: every live
   * plan row is closed (`ended_at` stamped, status 'expired') rather than
   * overwritten, which is what lets History still show what the venue used to
   * pay. (That close was lost in the 3 Sep 2026 merge and is restored in the
   * shared module — see apply-plan-change.ts.)
   *
   * THROWS `PlanChangeRefusedError` when the switch cannot be applied — an
   * organisation that does not exist, a plan for the other audience, an add-on,
   * a retired plan — before anything is written. It used to log and approve
   * anyway, on the reasoning that refusing would leave the admin unable to
   * answer the request; but the admin can DECLINE it, and approving quietly is
   * how an ACTIVE Premier row was opened for an outlet that exists nowhere.
   */
  async applyPlanChangeToLedger(
    record: PlanChangeRecord,
    actor: string,
    inTransaction?: (tx: DbTransaction) => Promise<void>,
  ): Promise<AppliedPlanChange> {
    // The write itself lives in a shared module: the scheduled agency tier job
    // performs the same switch, and a money rule copied into a cron is a rule
    // that will eventually disagree with itself.
    return applyPlanChangeToLedger({
      memberSubscriptionRepository: this.memberSubscriptionRepository,
      subscriptionRepository: this.subscriptionRepository,
      subscriptionInvoiceRepository: this.subscriptionInvoiceRepository,
      record,
      actor,
      inTransaction,
    });
  }

  /** See `ledgerRefusal` (apply-plan-change.ts): may this request's answer reach the ledger? */
  ledgerRefusal(request: LedgerRequestFacts): Promise<PlanChangeRefusal | null> {
    return ledgerRefusal({ subscriptionRepository: this.subscriptionRepository, request });
  }

  /**
   * Turn a resolved negotiation into something that actually bills.
   *
   * - **POS quote** → the venue is now under "Integrate with POS": an ADD-ON
   *   line in the ledger at the agreed price, held ALONGSIDE its plan (its plan
   *   is untouched — POS is not a plan). Re-resolving replaces the venue's
   *   existing add-on line rather than stacking a second one.
   * - **Custom renegotiation** → the agency's own plan row takes the agreed
   *   amount. The Custom tier is priced per agency (its catalog price is 0, a
   *   placeholder), so without this the agency would be billed nothing.
   *
   * A contact/other request prices nothing and is left alone. Failures are
   * logged, never thrown: the admin's decision must not be lost because the
   * ledger write failed.
   */
  async applyResolvedPriceToLedger(record: AdminRequest, actor: string): Promise<void> {
    try {
      if (!record.subscriberId || !record.subscriberType) return;
      const amount = record.quotedAmount;

      if (record.type === 'pos_integration_quote') {
        // A POS request that names a PLAN is the venue asking to come OFF the
        // add-on and go back to plan-only billing. Resolving it ends the add-on
        // rather than starting another one — otherwise "switch back" would add a
        // second charge instead of removing the first.
        const requested = record.requestedPlanId
          ? await this.subscriptionRepository.getSubscriptionById(record.requestedPlanId)
          : null;
        if (requested && requested.kind === 'plan') {
          const { records: live } = await this.memberSubscriptionRepository.listPaginated({
            filter: {
              subscriberType: record.subscriberType,
              subscriberId: record.subscriberId,
              status: 'active',
              kind: 'addon',
            },
            page: 1,
            pageSize: 20,
          });
          const endedAt = new Date();
          for (const row of live) {
            await this.memberSubscriptionRepository.update(row.id, {
              status: 'cancelled',
              endedAt,
              adminRequestId: record.id,
              updatedBy: actor,
            });
          }
          return;
        }

        // Starting the add-on needs an agreed figure; ending it does not, which
        // is why the removal above runs before this check.
        if (!amount) return;
        const addon = await this.subscriptionRepository.findAddonByName('POS Integration');
        if (!addon) {
          logger.warn('[AdminRequestController] POS Integration add-on missing from the catalog');
          return;
        }
        const { records: existing } = await this.memberSubscriptionRepository.listPaginated({
          filter: {
            subscriberType: record.subscriberType,
            subscriberId: record.subscriberId,
            status: 'active',
            kind: 'addon',
          },
          page: 1,
          pageSize: 20,
        });
        const now = new Date();
        for (const row of existing) {
          await this.memberSubscriptionRepository.update(row.id, {
            status: 'expired',
            endedAt: now,
            updatedBy: actor,
          });
        }
        // What this add-on cost before the re-quote — the row being closed on
        // the same product. Absent when the add-on is being taken for the first
        // time, in which case there is nothing to price against.
        const previousAddon = existing.find((row) => row.subscriptionId === addon.id) ?? null;
        const createdAddon = await this.memberSubscriptionRepository.create({
          subscriberType: record.subscriberType,
          subscriberId: record.subscriberId,
          subscriberName: record.subscriberName,
          subscriptionId: addon.id,
          planName: addon.name,
          amount,
          billingCycle: addon.billingCycle,
          status: 'active',
          startedAt: now,
          adminRequestId: record.id,
          createdBy: actor,
          updatedBy: actor,
        });
        // Owner, 28 Aug: add-ons follow the same rule as plans. A re-quote
        // upward mints the difference as an upgrade line on the POS lane's
        // current period; downward, the difference is a credit taken off the
        // next POS period — never the plan's.
        if (previousAddon && createdAddon) {
          const outcome = await this.subscriptionInvoiceRepository.prorateLaneSwitch({
            subscriberType: record.subscriberType,
            subscriberId: record.subscriberId,
            laneSubscriptionId: addon.id,
            newMemberSubscriptionId: createdAddon.id,
            fromPlanName: previousAddon.planName,
            toPlanName: addon.name,
            fromAmount: previousAddon.amount,
            toAmount: amount,
            actor,
          });
          logger.info(
            `[adminRequest] ${record.subscriberName}: ${addon.name} ${previousAddon.amount} → ${amount}, proration: ${outcome}`,
          );
        }
        return;
      }

      if (record.type === 'custom_renegotiation') {
        // Naming a plan makes this a MOVE, not a re-price — the agency joining
        // Custom, re-agreeing its price, or leaving it for an ordinary tier. All
        // three write a new ledger row so the old price stays readable as history,
        // exactly as a POS re-quote does. Re-pricing in place left an agency that
        // asked for Custom still recorded on Growth while billed the Custom figure.
        const requested = record.requestedPlanId
          ? await this.subscriptionRepository.getSubscriptionById(record.requestedPlanId)
          : null;
        if (requested) {
          // Leaving needs no agreed figure (the tier has a list price); joining or
          // re-pricing does, and applyPlanChangeToLedger falls back to the plan's
          // own price when quotedAmount is null.
          //
          // ⚠️ NOT swallowed by the catch below. The switch is the one write this
          // resolve exists for, and since 28 Sep 2026 applyPlanChangeToLedger
          // THROWS on a refusal or a rolled-back write — logging it here would
          // answer "Request resolved" over a switch that never happened.
          try {
            await this.applyPlanChangeToLedger(record, actor);
          } catch (error) {
            throw new SwitchNotAppliedError(error);
          }

          /**
           * A RESET ONTO A NORMAL TIER IS ALSO A PLAN CHANGE, and is filed as one
           * (owner's call, 27 Aug 2026).
           *
           * Two facts, two records, and they belong on different pages: the
           * negotiation ENDING is this `custom_renegotiation` and stays on Plan
           * Request, while the SWITCH it produced belongs on Plan Change, where an
           * admin looks to see what tier an org is on.
           *
           * Without this the switch existed only in `member_subscription`:
           * `applyPlanChangeToLedger` moves the ledger and files nothing, so
           * resolving Atlas's reset moved it to Starter while Plan Change went on
           * showing a 17 Jul switch to Enterprise that had never applied.
           *
           * Only for a NORMAL destination. Resolving ONTO Custom or an add-on is
           * the negotiation itself, already recorded on Plan Request, and filing a
           * second row for it would put the same event on both pages.
           *
           * Fire-and-forget by design: the ledger move above is the money, this is
           * the record of it, and a failed write here must not fail the resolve the
           * admin just performed. It is logged loudly instead.
           */
          const landsOnNormalTier = requested.name !== 'Custom' && requested.kind !== 'addon';
          if (landsOnNormalTier) {
            try {
              await this.repository.create({
                type: 'plan_change',
                subscriberType: record.subscriberType,
                subscriberId: record.subscriberId,
                subscriberName: record.subscriberName,
                currentPlanId: record.currentPlanId,
                requestedPlanId: record.requestedPlanId,
                // 'direct' for the same reason an agency tier move is: it is
                // already applied, there is nothing for anyone to approve.
                status: 'direct',
                message: `Reset from a negotiated price to ${requested.name} — recorded when request ${record.id} was resolved.`,
                createdBy: actor,
                updatedBy: actor,
              });
            } catch (error) {
              logger.error(
                `[AdminRequestController] reset applied for ${record.subscriberName} but the Plan Change record could not be filed:`,
                error,
              );
            }
          }
          return;
        }

        if (!amount) return;
        const { records: active } = await this.memberSubscriptionRepository.listPaginated({
          filter: {
            subscriberType: record.subscriberType,
            subscriberId: record.subscriberId,
            status: 'active',
            kind: 'plan',
          },
          page: 1,
          pageSize: 1,
        });
        const current = active[0];
        if (!current) {
          logger.warn(`[AdminRequestController] ${record.subscriberName} has no active plan to price`);
          return;
        }
        /**
         * Only a CUSTOM row can be re-priced in place. An old quote resolved
         * after the agency has moved back to a banded tier would otherwise stamp
         * the negotiated figure onto that tier — which is exactly what happened:
         * a Custom quote of 100,000 landed on Atlas's Starter row, so a RM 125
         * tier read as RM 100,000. A banded tier's price is the catalog's, not
         * anyone's to negotiate.
         */
        if (current.planName !== 'Custom') {
          logger.warn(
            `[AdminRequestController] ${record.subscriberName} is on ${current.planName}, not Custom — ` +
              `quote ${amount} not applied (a banded tier keeps its list price)`,
          );
          return;
        }
        await this.memberSubscriptionRepository.update(current.id, {
          amount,
          adminRequestId: record.id,
          updatedBy: actor,
        });
      }
    } catch (error) {
      // The Custom switch reports to resolve(); every other ledger step keeps the
      // old contract (logged, never thrown — the decision itself stands).
      if (error instanceof SwitchNotAppliedError) throw error;
      logger.error('[AdminRequestController.applyResolvedPriceToLedger] Error:', error);
    }
  }
}
