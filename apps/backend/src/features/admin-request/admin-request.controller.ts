import { Request, Response } from 'express';
import { AdminRequestRepositoryClass } from './admin-request.repository.js';
import { AdminRequest, AdminRequestFilter, AdminRequestType, AdminRequestStatus } from './admin-request.model.js';
import { MemberSubscriptionRepositoryClass } from '@/features/member-subscription/member-subscription.repository.js';
import { SubscriptionRepositoryClass } from '@/features/subscription/subscription.repository.js';
import { SubscriptionInvoiceRepositoryClass } from '@/features/subscription-invoice/subscription-invoice.repository.js';
import { resolveOrgScope, type OrgScopeDeps } from '@/util/org-scope.js';
import {
  CreateAdminRequestSchema,
  ResolveAdminRequestSchema,
  UpdateAdminRequestSchema,
} from '@/schema/admin-request.schema.js';
import { Error } from '@/error/index.js';
import { paramId } from '@/util/params.js';
import { getActor } from '@/util/actor.js';
import { logger } from '@/util/logger.js';
import type { DbTransaction } from '@/types/db-transaction.js';
import {
  type AppliedPlanChange,
  type LedgerRequestFacts,
  type PlanChangeRecord,
  applyPlanChangeToLedger,
  ledgerRefusal,
} from './apply-plan-change.js';
import {
  type PlanChangeRefusal,
  PlanChangeRefusedError,
  RequestNotPendingError,
  notPendingMessage,
} from './plan-change-rules.js';
import { parseDatesQuery } from '@/util/filter-date-format.js';

/** A refusal answered with the rule's own status and sentence. */
function refusalBody(refusal: Pick<PlanChangeRefusal, 'message'>) {
  return { success: false, message: refusal.message, data: null };
}

/**
 * A resolve's plan SWITCH (Custom renegotiation) was refused or rolled back.
 * Carried out of `applyResolvedPriceToLedger`, whose other steps still log and
 * swallow, so `resolve()` can answer with the truth. `globalThis.Error` because
 * this file's `Error` is the response-message enum.
 */
class SwitchNotAppliedError extends globalThis.Error {
  constructor(readonly cause: unknown) {
    super('The plan switch was not applied');
    this.name = 'SwitchNotAppliedError';
  }
}

export class AdminRequestControllerClass {
  constructor(
    private repository: AdminRequestRepositoryClass,
    private memberSubscriptionRepository: MemberSubscriptionRepositoryClass,
    private subscriptionRepository: SubscriptionRepositoryClass,
    /** The billing ledger — the owner's unpaid→no-switch rule reads it. */
    private subscriptionInvoiceRepository: SubscriptionInvoiceRepositoryClass,
    private orgScopeDeps: OrgScopeDeps,
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
  private async applyPlanChangeToLedger(
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
  private ledgerRefusal(request: LedgerRequestFacts): Promise<PlanChangeRefusal | null> {
    return ledgerRefusal({ subscriptionRepository: this.subscriptionRepository, request });
  }

  async list(req: Request, res: Response) {
    try {
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 10);
      // ?type= accepts one value or a comma-separated whitelist
      // (e.g. pos_integration_quote,custom_renegotiation for the Plan Request inbox).
      const rawType = req.query.type as string | undefined;
      const filter: AdminRequestFilter = {
        type: rawType?.includes(',')
          ? (rawType.split(',') as AdminRequestType[])
          : (rawType as AdminRequestType | undefined),
        excludeType: req.query.excludeType as AdminRequestType | undefined,
        status: req.query.status as AdminRequestStatus | undefined,
        subscriberType: req.query.subscriberType as 'outlet' | 'agency' | undefined,
        dates: parseDatesQuery(req.query.dates),
        // ?latestPerSubscriber=true → one row per venue/agency, the newest.
        latestPerSubscriber: req.query.latestPerSubscriber === 'true',
        search:
          typeof req.query.search === 'string' && req.query.search.trim().length > 0
            ? req.query.search.trim()
            : undefined,
        // ?negotiated=only → Plan Request (POS / Custom, either direction);
        // ?negotiated=exclude → Plan Change (ordinary plan-to-plan switches).
        negotiated:
          req.query.negotiated === 'only'
            ? 'only'
            : req.query.negotiated === 'exclude'
              ? 'exclude'
              : undefined,
      };
      const { records: rawRecords, totalCount } = await this.repository.listPaginated({
        filter,
        page,
        pageSize,
      });
      const records = await this.withLivePlan(
        await this.withPreviousNegotiatedPrice(await this.withLiveFromPlan(rawRecords)),
      );
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      res.status(200).json({
        success: true,
        message: 'OK',
        data: records,
        pagination: { page, pageSize, totalCount, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
      });
    } catch (error) {
      logger.error('[AdminRequestController.list] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  // Pending-request count for the admin notification bell / sidebar badges.
  // Optional ?type= / ?excludeType= narrow the count (e.g. plan_change only).
  async pendingCount(req: Request, res: Response) {
    try {
      const count = await this.repository.countPending({
        type: req.query.type as AdminRequestType | undefined,
        excludeType: req.query.excludeType as AdminRequestType | undefined,
      });
      res.status(200).json({ success: true, message: 'OK', data: { pending: count } });
    } catch (error) {
      logger.error('[AdminRequestController.pendingCount] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const record = await this.repository.getById(paramId(req.params.id));
      if (!record) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      const [enriched] = await this.withLivePlan(
        await this.withPreviousNegotiatedPrice(await this.withLiveFromPlan([record])),
      );
      res.status(200).json({ success: true, message: 'OK', data: enriched ?? record });
    } catch (error) {
      logger.error('[AdminRequestController.getById] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const parsed = CreateAdminRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const actor = getActor(req);

      /**
       * ⚠️ THE SUBSCRIBER IN THE BODY MUST BE ONE OF THE CALLER'S OWN.
       *
       * `requirePermission('settings','update')` proves this person owns SOME
       * organisation. It says nothing about WHICH, and `subscriberId` arrived
       * from the body unchecked — so any outlet owner could name a rival venue
       * and switch its subscription plan, or read back its unpaid period count
       * and total from the 409 below. Two holes, one missing question.
       *
       * Asked with `resolveOrgScope`, the same resolver the `/mine` reads on
       * this controller already use, so the answer cannot disagree with them.
       * An admin is exempt: they act on organisations rather than within one.
       *
       * A 404, never a 403 — confirming that a named id exists is the leak.
       */
      if (parsed.data.subscriberId && parsed.data.subscriberType) {
        const scope = await resolveOrgScope(req, this.orgScopeDeps);
        if (!scope.isAdmin) {
          const mine =
            parsed.data.subscriberType === 'agency'
              ? scope.agencyId === parsed.data.subscriberId
              : scope.outletIds.includes(parsed.data.subscriberId);
          if (!mine) {
            logger.warn(
              `[AdminRequestController.create] ${actor} named ${parsed.data.subscriberType} ${parsed.data.subscriberId}, which is not theirs`,
            );
            return res
              .status(404)
              .json({ success: false, message: Error.NOT_FOUND, data: null });
          }
        }
      }

      // ⚠️ THE ORGANISATION MUST EXIST — admins included. The check above
      // exempts an admin from OWNERSHIP, and nothing asked whether the id is a
      // real outlet/agency at all; see ledgerRefusal. A plan switch is also
      // checked against its plan here, so it is refused when filed rather than
      // waiting in the queue for an approval the ledger will refuse.
      const refusal = await this.ledgerRefusal({
        type: parsed.data.type,
        subscriberType: parsed.data.subscriberType ?? null,
        subscriberId: parsed.data.subscriberId ?? null,
        requestedPlanId: parsed.data.requestedPlanId ?? null,
      });
      if (refusal) return res.status(refusal.status).json(refusalBody(refusal));

      // Every request records the plan the subscriber was on when it was raised,
      // whatever its type: the admin drawer's "BEFORE · FROM PLAN" is otherwise
      // empty for POS quotes and contact requests, which tells the admin nothing
      // about who they are negotiating with. Only filled when the client did not
      // send one — the client knows its own from-plan for a switch.
      let currentPlanId = parsed.data.currentPlanId ?? null;
      if (!currentPlanId && parsed.data.subscriberId && parsed.data.subscriberType) {
        const { records } = await this.memberSubscriptionRepository.listPaginated({
          filter: {
            subscriberType: parsed.data.subscriberType,
            subscriberId: parsed.data.subscriberId,
            status: 'active',
            // The PLAN, never an add-on: a venue holding POS has two active
            // lines and the add-on is the newer one, so without this the
            // request recorded "from plan: POS Integration, RM 0".
            kind: 'plan',
          },
          page: 1,
          pageSize: 1,
        });
        currentPlanId = records[0]?.subscriptionId ?? null;
      }

      // A switch to the plan the subscriber is ALREADY on is not a decision for
      // the admin to make — it would sit in the queue as Pending forever while
      // the venue's own screen shows the plan as current, which reads as the two
      // screens disagreeing. Refuse it with the reason instead of filing it.
      if (
        parsed.data.type === 'plan_change' &&
        parsed.data.subscriberId &&
        parsed.data.subscriberType &&
        parsed.data.requestedPlanId
      ) {
        const { records: active } = await this.memberSubscriptionRepository.listPaginated({
          filter: {
            subscriberType: parsed.data.subscriberType,
            subscriberId: parsed.data.subscriberId,
            status: 'active',
            // The plan, for the same reason as above: a venue holding POS has
            // two active lines and the add-on is the newer one, so this read
            // compared the requested plan against "POS Integration" and let a
            // switch to the venue's own current plan through.
            kind: 'plan',
          },
          page: 1,
          pageSize: 1,
        });
        if (active[0]?.subscriptionId === parsed.data.requestedPlanId) {
          return res.status(400).json({
            success: false,
            message: `Already on ${active[0].planName} — no switch needed`,
            data: null,
          });
        }
      }

      /**
       * THE OWNER'S RULE (29 Aug 2026): unpaid → no switch.
       *
       * A venue that switched plans while owing is exactly how Emhub came to
       * carry an unpaid Enterprise period while accruing on Scale — the ledger
       * held two prices for one org and every screen downstream had to explain
       * it. So an OUTLET's plan change is refused while any billing period is
       * unpaid, with the figure in the refusal so the venue knows what settles
       * it.
       *
       * Deliberately narrow:
       *  - OUTLETS ONLY. An agency's tier is moved by the Sunday job from PV
       *    volume — work its PRs have already done — and gating that would
       *    bill the agency at the wrong tier for delivered work.
       *  - FILING is gated, never approval: an admin approving a request that
       *    is already queued stays the override for "paid by bank transfer,
       *    not yet marked".
       *  - FAILS OPEN. The repository answers zero rows on a read error, and a
       *    gate must not refuse on a number it does not have. There is no
       *    due-date column (owner's call, same day), so "any unpaid period" is
       *    the whole test — which also means a venue is blocked the day after
       *    a new period opens, until an admin marks it. Stated to the owner;
       *    accepted.
       */
      if (
        parsed.data.type === 'plan_change' &&
        parsed.data.subscriberType === 'outlet' &&
        parsed.data.subscriberId
      ) {
        const { records: owing, totalCount: owingCount } =
          await this.subscriptionInvoiceRepository.listPaginated({
            filter: {
              subscriberType: 'outlet',
              subscriberId: parsed.data.subscriberId,
              status: 'unpaid',
            },
            page: 1,
            pageSize: 100,
          });
        if (owingCount > 0) {
          // Integer cents — numeric(12,2) arrives as strings, and float
          // addition is how 3999 + 200 reads 4198.999… in a refusal about money.
          const cents = owing.reduce(
            (sum, invoice) => sum + Math.round(Number(invoice.amount) * 100),
            0,
          );
          const total = (cents / 100).toLocaleString('en-MY', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          return res.status(409).json({
            success: false,
            message:
              `This venue has ${owingCount} unpaid billing period${owingCount === 1 ? '' : 's'} ` +
              `totalling RM ${total} — settle them with InnocenZ before switching plans`,
            data: null,
          });
        }
      }

      // Agency plan changes are applied automatically (by PR count) and only
      // logged here as 'direct'; outlet plan changes wait for admin approval.
      const isDirect =
        parsed.data.type === 'plan_change' && parsed.data.subscriberType === 'agency';
      const fields = {
        type: parsed.data.type,
        subscriberType: parsed.data.subscriberType ?? null,
        subscriberId: parsed.data.subscriberId ?? null,
        subscriberName: parsed.data.subscriberName,
        contactName: parsed.data.contactName ?? null,
        contactEmail: parsed.data.contactEmail ?? null,
        contactPhone: parsed.data.contactPhone ?? null,
        currentPlanId,
        requestedPlanId: parsed.data.requestedPlanId ?? null,
        message: parsed.data.message ?? null,
        status: isDirect ? ('direct' as const) : ('pending' as const),
        createdBy: actor,
        updatedBy: actor,
      };

      if (isDirect) {
        /**
         * An agency switch needs no approval, so it takes effect straight away —
         * and the 'direct' record is FILED INSIDE the switch's own transaction.
         * Filed first and applied after, a switch the ledger then refused (or
         * failed to write) left a 'direct' row on the admin's Plan Change page
         * announcing a move that never happened — the same shape as the 17 Jul
         * "switch to Enterprise" that never reached the ledger.
         */
        const filed: { record: AdminRequest | null } = { record: null };
        try {
          await this.applyPlanChangeToLedger(fields, actor, async (tx) => {
            filed.record = await this.repository.create(fields, tx);
            if (!filed.record) {
              throw new globalThis.Error('[AdminRequestController.create] could not file the plan change');
            }
          });
        } catch (error) {
          if (error instanceof PlanChangeRefusedError) {
            return res.status(error.status).json(refusalBody(error));
          }
          logger.error('[AdminRequestController.create] direct switch failed:', error);
          return res.status(500).json({
            success: false,
            message: 'The plan could not be switched. Nothing was changed — try again.',
            data: null,
          });
        }
        return res.status(201).json({ success: true, message: 'Request submitted', data: filed.record });
      }

      // An outlet's switch, and every other request, waits for an admin.
      const record = await this.repository.create(fields);
      if (!record) return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      res.status(201).json({ success: true, message: 'Request submitted', data: record });
    } catch (error) {
      logger.error('[AdminRequestController.create] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
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
  private async applyResolvedPriceToLedger(record: AdminRequest, actor: string): Promise<void> {
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

  /**
   * Re-point "from plan" at what the subscriber is on TODAY, for requests still
   * awaiting an answer.
   *
   * `current_plan_id` is stamped when the request is raised, which is right for
   * history but goes stale while the request waits: a venue that raised a POS
   * quote on Pro and has since moved to Scale was still shown as Pro, so the
   * admin would negotiate against the wrong plan and price. Answered requests
   * keep their stamp — that IS what they were decided against.
   */
  /**
   * Attach the negotiated price the subscriber is on TODAY.
   *
   * The two negotiated arrangements behave identically — the outlet's POS add-on
   * and the agency's Custom tier are both quoted, re-quoted and dropped — so both
   * carry the figure a re-quote replaces or a cancellation ends. "Negotiate
   * again" against nothing tells the admin nothing.
   *
   * They sit in DIFFERENT ledger lines: POS is an add-on held beside the plan,
   * Custom IS the plan. Hence the kind split. A price of zero is the catalog
   * placeholder, not a figure anyone agreed, so it counts as no previous price —
   * as does a first-time request.
   */
  private static negotiatedKindFor(type: AdminRequestType): 'addon' | 'plan' | null {
    if (type === 'pos_integration_quote') return 'addon';
    if (type === 'custom_renegotiation') return 'plan';
    return null;
  }

  private async withPreviousNegotiatedPrice(records: AdminRequest[]): Promise<AdminRequest[]> {
    const negotiated = records.filter(
      (row) =>
        AdminRequestControllerClass.negotiatedKindFor(row.type) && row.subscriberId && row.subscriberType,
    );
    if (negotiated.length === 0) return records;
    try {
      const priceByKey = new Map<string, string | null>();
      for (const row of negotiated) {
        const kind = AdminRequestControllerClass.negotiatedKindFor(row.type);
        if (!kind || !row.subscriberId || !row.subscriberType) continue;
        const key = `${row.subscriberId}:${kind}`;
        if (priceByKey.has(key)) continue;
        const { records: live } = await this.memberSubscriptionRepository.listPaginated({
          filter: {
            subscriberType: row.subscriberType,
            subscriberId: row.subscriberId,
            status: 'active',
            kind,
          },
          page: 1,
          pageSize: 1,
        });
        const current = live[0];
        // An agency's plan line only holds a NEGOTIATED price while that plan is
        // Custom. One still on Growth has a list price, and calling that a
        // "previous negotiated price" would invent a negotiation that never happened.
        const onNegotiatedLine = kind === 'addon' || current?.planName === 'Custom';
        const amount = onNegotiatedLine ? (current?.amount ?? null) : null;
        priceByKey.set(key, amount && Number(amount) > 0 ? amount : null);
      }
      return records.map((row) => {
        const kind = AdminRequestControllerClass.negotiatedKindFor(row.type);
        if (!kind || !row.subscriberId) return row;
        return {
          ...row,
          previousNegotiatedAmount: priceByKey.get(`${row.subscriberId}:${kind}`) ?? null,
        };
      });
    } catch (error) {
      logger.error('[AdminRequestController.withPreviousNegotiatedPrice] Error:', error);
      return records;
    }
  }

  /**
   * What the subscriber is on TODAY, carried BESIDE the row's own stamp.
   *
   * ⚠️ Deliberately a NEW pair of fields rather than a re-point of
   * `currentPlanId`. `withLiveFromPlan` below rewrites that stamp for PENDING
   * rows only, and its reasoning is load-bearing: an answered row's stamp IS
   * what it was decided against, so overwriting it would rewrite the record of
   * a decision rather than report the present.
   *
   * This exists because the Plan Change page shows ONE ROW PER SUBSCRIBER and
   * presents it as the latest. For an org that has ever touched Custom, every
   * later move files as `custom_renegotiation` and lands on Plan REQUEST
   * instead — so the newest row on Plan Change can be arbitrarily stale, with
   * nothing on the page saying so. Measured on Atlas Agency: 14 requests, 13 of
   * them routed to Plan Request, and the ONE that reached Plan Change was a
   * 17 Jul switch to Enterprise that never reached the ledger at all — still
   * presented as that agency's current position six weeks later, while it was
   * actually on Starter at RM 125.
   *
   * One lookup per SUBSCRIBER, not per row: the queue routinely carries several
   * requests for one org and they all resolve to the same live plan.
   *
   * Never throws — a failed lookup returns the records untouched, because a
   * missing "currently on" line is a smaller fault than an empty admin queue.
   */
  private async withLivePlan(records: AdminRequest[]): Promise<AdminRequest[]> {
    const scoped = records.filter((row) => row.subscriberId && row.subscriberType);
    if (scoped.length === 0) return records;
    try {
      const liveBySubscriber = new Map<string, { name: string; amount: string } | null>();
      for (const row of scoped) {
        if (!row.subscriberId || !row.subscriberType) continue;
        if (liveBySubscriber.has(row.subscriberId)) continue;
        const { records: active } = await this.memberSubscriptionRepository.listPaginated({
          filter: {
            subscriberType: row.subscriberType,
            subscriberId: row.subscriberId,
            status: 'active',
            // The PLAN, never the add-on beside it — the same reason
            // `withLiveFromPlan` pins this: a venue holding POS has an add-on
            // line newer than its plan, and "currently on POS Integration,
            // RM 0" is not an answer to what it pays for its tier.
            kind: 'plan',
          },
          page: 1,
          pageSize: 1,
        });
        const current = active[0];
        liveBySubscriber.set(
          row.subscriberId,
          current ? { name: current.planName, amount: current.amount } : null,
        );
      }
      return records.map((row) => {
        if (!row.subscriberId) return row;
        const live = liveBySubscriber.get(row.subscriberId);
        if (!live) return row;
        return { ...row, livePlanName: live.name, livePlanAmount: live.amount };
      });
    } catch (error) {
      logger.error('[AdminRequestController.withLivePlan] Error:', error);
      return records;
    }
  }

  private async withLiveFromPlan(records: AdminRequest[]): Promise<AdminRequest[]> {
    const pending = records.filter((row) => row.status === 'pending' && row.subscriberId);
    if (pending.length === 0) return records;
    try {
      const livePlanBySubscriber = new Map<string, string | null>();
      for (const row of pending) {
        if (!row.subscriberId || !row.subscriberType || livePlanBySubscriber.has(row.subscriberId)) {
          continue;
        }
        const { records: active } = await this.memberSubscriptionRepository.listPaginated({
          filter: {
            subscriberType: row.subscriberType,
            subscriberId: row.subscriberId,
            status: 'active',
            // "From plan" means the PLAN. A venue holding POS has an add-on line
            // newer than its plan, so without this the admin drawer showed a
            // pending request as coming from "POS Integration, RM 0".
            kind: 'plan',
          },
          page: 1,
          pageSize: 1,
        });
        livePlanBySubscriber.set(row.subscriberId, active[0]?.subscriptionId ?? null);
      }
      return records.map((row) => {
        if (row.status !== 'pending' || !row.subscriberId) return row;
        const live = livePlanBySubscriber.get(row.subscriberId);
        return live ? { ...row, currentPlanId: live } : row;
      });
    } catch (error) {
      // A failed lookup must not blank the queue — fall back to the stamp.
      logger.error('[AdminRequestController.withLiveFromPlan] Error:', error);
      return records;
    }
  }

  /**
   * The caller's own OUTSTANDING plan change, or null.
   *
   * Without this a venue could not tell that it had already asked: the "awaiting
   * admin" state lived only in React, so a refresh forgot it and the venue filed
   * the same switch again — three rows for one decision in the admin queue.
   *
   * Scoped server-side from the session (`resolveOrgScope`), never from a query
   * parameter, so one venue cannot read another's. Admins get null: this is the
   * subscriber's own view, and they have the full queue.
   */
  async myLatestPlanChange(req: Request, res: Response) {
    return this.myLatestPending(req, res, 'plan_change');
  }

  /**
   * The caller's own outstanding POS-integration quote, or null. Same reason as
   * the plan change: the "Request sent" state was React-only, so a refresh made
   * the venue think nothing had been sent and it asked again.
   */
  async myLatestPosQuote(req: Request, res: Response) {
    return this.myLatestPending(req, res, 'pos_integration_quote');
  }

  /**
   * The caller's own outstanding Custom price request, or null — the agency's
   * counterpart to the POS quote above. Joining Custom, re-agreeing its price
   * and leaving it are all filed as this type, so one read covers all three and
   * the agency's screen keeps saying "waiting for admin" across a refresh.
   */
  async myLatestCustomQuote(req: Request, res: Response) {
    return this.myLatestPending(req, res, 'custom_renegotiation');
  }

  private async myLatestPending(req: Request, res: Response, type: AdminRequestType) {
    try {
      const scope = await resolveOrgScope(req, this.orgScopeDeps);
      const subscriberIds = scope.agencyId ? [scope.agencyId] : scope.outletIds;
      if (scope.isAdmin || subscriberIds.length === 0) {
        return res.status(200).json({ success: true, message: 'OK', data: null });
      }
      const record = await this.repository.latestPendingByType(subscriberIds, type);
      res.status(200).json({ success: true, message: 'OK', data: record });
    } catch (error) {
      logger.error('[AdminRequestController.myLatestPending] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * The subscriber takes its own request back.
   *
   * The one action on this inbox that is NOT the admin's. A venue that asked for
   * a POS quote, or asked to come off POS, previously had no way to change its
   * mind: the request sat in the queue until a human answered something nobody
   * wanted any more.
   *
   * OWNERSHIP IS RE-DERIVED, never taken from the request. The id in the path is
   * checked against the caller's OWN organisations — otherwise one venue could
   * cancel another's negotiation by guessing a uuid, and the admin would see a
   * withdrawal the real subscriber never made.
   *
   * ONLY AN UNANSWERED REQUEST. `pending` and `contacted` may be withdrawn;
   * `resolved`, `approved`, `declined` and `direct` are decisions that have
   * already moved the billing ledger, and letting a subscriber retract one would
   * let it walk back a price the admin had applied. A wrong answer is the
   * admin's to correct, not the payer's to erase.
   *
   * A NON-EXISTENT id and SOMEBODY ELSE'S id answer the same 404, so the reply
   * never confirms a request exists — the shape subscription-invoice uses.
   */
  async withdrawMine(req: Request, res: Response) {
    try {
      const scope = await resolveOrgScope(req, this.orgScopeDeps);
      const subscriberIds = scope.agencyId ? [scope.agencyId] : scope.outletIds;
      if (subscriberIds.length === 0) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const id = paramId(req.params.id);
      const existing = await this.repository.getById(id);
      if (!existing || !existing.subscriberId || !subscriberIds.includes(existing.subscriberId)) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      if (existing.status !== 'pending' && existing.status !== 'contacted') {
        return res.status(409).json({
          success: false,
          message: `This request has already been answered (${existing.status}) and can no longer be withdrawn`,
          data: null,
        });
      }

      const record = await this.repository.update(id, {
        status: 'withdrawn',
        updatedBy: getActor(req),
      });
      if (!record) {
        return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      }
      res.status(200).json({ success: true, message: 'Request withdrawn', data: record });
    } catch (error) {
      logger.error('[AdminRequestController.withdrawMine] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async markContacted(req: Request, res: Response) {
    try {
      const actor = getActor(req);
      const record = await this.repository.update(paramId(req.params.id), {
        status: 'contacted',
        contactedAt: new Date(),
        contactedBy: actor,
        updatedBy: actor,
      });
      if (!record) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Marked as contacted', data: record });
    } catch (error) {
      logger.error('[AdminRequestController.markContacted] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** Edit who / role / type on an inbox row. */
  async update(req: Request, res: Response) {
    try {
      const parsed = UpdateAdminRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const existing = await this.repository.getById(paramId(req.params.id));
      if (!existing) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      const payload: Parameters<AdminRequestRepositoryClass['update']>[1] = {
        updatedBy: getActor(req),
      };
      if (parsed.data.type !== undefined) payload.type = parsed.data.type;
      if (parsed.data.subscriberType !== undefined) {
        payload.subscriberType = parsed.data.subscriberType;
      }
      if (parsed.data.subscriberName !== undefined) {
        payload.subscriberName = parsed.data.subscriberName;
      }
      if (parsed.data.message !== undefined) payload.message = parsed.data.message;
      if (parsed.data.remarks !== undefined) payload.remarks = parsed.data.remarks;
      if (parsed.data.quotedAmount !== undefined) {
        payload.quotedAmount =
          parsed.data.quotedAmount === null
            ? null
            : parsed.data.quotedAmount.toFixed(2);
      }

      /**
       * RE-TYPING A REQUEST IS RE-FILING IT. The subscriber id cannot be edited,
       * but its TYPE can — so switching "outlet" to "agency" points the same id
       * at the other table, where it most likely names nobody, and turning a
       * contact request into a plan change makes it approvable. Both are checked
       * as create() checks a new request. Only when one of them actually
       * changes: an admin annotating an old request must not be blocked by it.
       */
      const nextType = payload.type ?? existing.type;
      const nextSubscriberType =
        payload.subscriberType !== undefined ? payload.subscriberType : existing.subscriberType;
      if (nextType !== existing.type || nextSubscriberType !== existing.subscriberType) {
        const refusal = await this.ledgerRefusal({
          type: nextType,
          subscriberType: nextSubscriberType,
          subscriberId: existing.subscriberId,
          requestedPlanId: existing.requestedPlanId,
        });
        if (refusal) return res.status(refusal.status).json(refusalBody(refusal));
      }

      const record = await this.repository.update(existing.id, payload);
      if (!record) {
        return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      }
      res.status(200).json({ success: true, message: 'Request updated', data: record });
    } catch (error) {
      logger.error('[AdminRequestController.update] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  // Resolve a request, optionally recording the negotiated/quoted price.
  async resolve(req: Request, res: Response) {
    try {
      const parsed = ResolveAdminRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const actor = getActor(req);
      const existing = await this.repository.getById(paramId(req.params.id));
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      // Resolving a POS quote or a Custom renegotiation WRITES the ledger (see
      // applyResolvedPriceToLedger), so it is checked before it is recorded: an
      // add-on line or a Custom switch for an organisation that does not exist
      // is refused here, not logged afterwards behind a "Request resolved".
      // A plan_change is approved, not resolved — resolving one moves nothing —
      // and neither does a request naming no organisation, which the ledger
      // step skips outright.
      if (existing.type !== 'plan_change' && existing.subscriberType && existing.subscriberId) {
        const refusal = await this.ledgerRefusal(existing);
        if (refusal) return res.status(refusal.status).json(refusalBody(refusal));
      }

      const payload: Parameters<AdminRequestRepositoryClass['update']>[1] = {
        status: 'resolved',
        updatedBy: actor,
      };
      if (parsed.data.quotedAmount !== undefined) payload.quotedAmount = parsed.data.quotedAmount.toFixed(2);

      const record = await this.repository.update(existing.id, payload);
      if (!record) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      // Resolving is where a negotiated price becomes real — until now the
      // figure lived only on this row, so nothing billed it and the subscriber
      // never saw it.
      try {
        await this.applyResolvedPriceToLedger(record, actor);
      } catch (error) {
        if (!(error instanceof SwitchNotAppliedError)) throw error;
        // The switch was refused or rolled back AFTER the request was marked
        // resolved: put the request back as it was, so it is still open and the
        // admin is told the truth instead of "Request resolved".
        await this.repository.update(existing.id, {
          status: existing.status,
          ...(parsed.data.quotedAmount !== undefined ? { quotedAmount: existing.quotedAmount } : {}),
          updatedBy: actor,
        });
        if (error.cause instanceof PlanChangeRefusedError) {
          return res.status(error.cause.status).json(refusalBody(error.cause));
        }
        logger.error('[AdminRequestController.resolve] switch failed:', error.cause);
        return res.status(500).json({
          success: false,
          message:
            'The plan switch could not be applied to billing. Nothing was changed — the request is still open, so try again.',
          data: null,
        });
      }
      res.status(200).json({ success: true, message: 'Request resolved', data: record });
    } catch (error) {
      logger.error('[AdminRequestController.resolve] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Approve an outlet plan change. The price follows the to-plan from now on —
   * the frontend passes the to-plan price as quotedAmount so it is stamped here.
   *
   * ⚠️ ONLY A PENDING REQUEST, CLAIMED ATOMICALLY. This checked the type and
   * nothing else, so an approved, declined, withdrawn or 'direct' plan change
   * could be approved again — and each approval applied the switch to the
   * ledger again. Now:
   *  - a request that is plainly not pending is answered 409 with the reason;
   *  - the switch is validated BEFORE anything is written, so a ghost
   *    organisation or a wrong plan is refused while the request is still
   *    pending, for the admin to decline;
   *  - the move out of `pending` is one `UPDATE … WHERE status = 'pending'`,
   *    run INSIDE the switch's transaction, so a double-click (or two admins)
   *    applies it once, and a switch that fails leaves the request pending
   *    rather than "approved" with nothing behind it.
   */
  async approve(req: Request, res: Response) {
    try {
      const parsed = ResolveAdminRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const existing = await this.repository.getById(paramId(req.params.id));
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      if (existing.type !== 'plan_change') {
        return res.status(400).json({ success: false, message: 'Only plan changes can be approved', data: null });
      }
      // The early answer for a stale screen. The claim below is what actually
      // guarantees it — this read cannot, on its own, stop a double-click.
      if (existing.status !== 'pending') {
        return res
          .status(409)
          .json({ success: false, message: notPendingMessage(existing.status), data: null });
      }

      const actor = getActor(req);
      const payload: Parameters<AdminRequestRepositoryClass['update']>[1] = {
        status: 'approved',
        updatedBy: actor,
      };
      if (parsed.data.quotedAmount !== undefined) payload.quotedAmount = parsed.data.quotedAmount.toFixed(2);

      // Approval is what makes the switch real: reflect it in the billing ledger
      // so the admin History page and the subscriber's own screen agree.
      const claimed: { record: AdminRequest | null } = { record: null };
      let applied: AppliedPlanChange;
      try {
        applied = await this.applyPlanChangeToLedger(
          { ...existing, quotedAmount: payload.quotedAmount ?? existing.quotedAmount },
          actor,
          async (tx) => {
            claimed.record = await this.repository.claimPending(existing.id, payload, tx);
            if (!claimed.record) throw new RequestNotPendingError();
          },
        );
      } catch (error) {
        if (error instanceof PlanChangeRefusedError) {
          return res.status(error.status).json(refusalBody(error));
        }
        if (error instanceof RequestNotPendingError) {
          // Answered between the read above and the claim — name the state it
          // is in now, so the admin knows what happened instead of retrying.
          const now = await this.repository.getById(existing.id);
          if (!now) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
          return res
            .status(409)
            .json({ success: false, message: notPendingMessage(now.status), data: null });
        }
        logger.error('[AdminRequestController.approve] switch failed:', error);
        return res.status(500).json({
          success: false,
          message:
            'The plan change could not be applied to billing. Nothing was changed — the request is still pending, so try again.',
          data: null,
        });
      }
      res.status(200).json({
        success: true,
        message: `Plan change approved — ${existing.subscriberName} is now on ${applied.opened.planName}.`,
        data: claimed.record,
      });
    } catch (error) {
      logger.error('[AdminRequestController.approve] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Say NO to a request, without touching the ledger — the subscriber keeps
   * exactly what it has today.
   *
   * Two things are refused here and they read the same to the admin:
   * - an outlet plan change → the venue stays on its from-plan;
   * - a negotiated request (POS quote, Custom renegotiation, or either one's
   *   cancellation) → the add-on / Custom price stands, unchanged.
   *
   * The second case had no answer at all: a POS or Custom request could only be
   * RESOLVED, so an admin who did not agree to it had nothing to click and the
   * row sat Pending forever — while the subscriber's own screen kept saying
   * "waiting for admin". Declining clears that on both sides, because the
   * subscriber's "waiting" state reads pending rows only.
   *
   * A contact/other request is not a decision, so it stays out.
   */
  private static readonly DECLINABLE: readonly AdminRequestType[] = [
    'plan_change',
    'pos_integration_quote',
    'custom_renegotiation',
  ];

  async decline(req: Request, res: Response) {
    try {
      const existing = await this.repository.getById(paramId(req.params.id));
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      if (!AdminRequestControllerClass.DECLINABLE.includes(existing.type)) {
        return res.status(400).json({
          success: false,
          message: 'Only plan changes and negotiated requests can be declined',
          data: null,
        });
      }
      // Declining an answered request would rewrite a decision already acted on:
      // a resolved quote is billing, an approved switch has moved the ledger, and
      // a 'direct' row was applied the moment it was filed. Cancelling any of
      // them would change the badge and nothing else — the ledger would still say
      // otherwise, which is worse than refusing.
      if (existing.status === 'resolved' || existing.status === 'approved' || existing.status === 'direct') {
        return res.status(400).json({
          success: false,
          message:
            existing.status === 'direct'
              ? 'This was applied on the spot — file the reverse change instead of cancelling it'
              : `This request is already ${existing.status} — it cannot be cancelled`,
          data: null,
        });
      }
      const record = await this.repository.update(existing.id, {
        status: 'declined',
        updatedBy: getActor(req),
      });
      if (!record) return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      res.status(200).json({
        success: true,
        message:
          existing.type === 'plan_change'
            ? 'Plan change declined'
            : 'Request cancelled — nothing was changed',
        data: record,
      });
    } catch (error) {
      logger.error('[AdminRequestController.decline] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  // Successfully negotiated prices aggregated by role (outlet vs agency).
  async negotiatedSummary(_req: Request, res: Response) {
    try {
      const rows = await this.repository.negotiatedByRole();
      const byRole = { outlet: { count: 0, total: 0 }, agency: { count: 0, total: 0 } };
      for (const row of rows) {
        if (row.subscriberType === 'outlet' || row.subscriberType === 'agency') {
          byRole[row.subscriberType] = { count: row.count, total: Number(row.total) };
        }
      }
      const data = rows.map((row) => ({
        subscriberType: row.subscriberType,
        count: row.count,
        total: Number(row.total),
        average: Number(row.average),
      }));
      res.status(200).json({
        success: true,
        message: 'OK',
        data,
        byRole,
        totals: {
          count: byRole.outlet.count + byRole.agency.count,
          total: byRole.outlet.total + byRole.agency.total,
        },
      });
    } catch (error) {
      logger.error('[AdminRequestController.negotiatedSummary] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
