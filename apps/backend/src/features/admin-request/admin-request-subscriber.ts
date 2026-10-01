import { Request, Response } from 'express';
import type { AdminRequestRepositoryClass } from './admin-request.repository.js';
import { AdminRequest, AdminRequestType } from './admin-request.model.js';
import type { MemberSubscriptionRepositoryClass } from '@/features/member-subscription/member-subscription.repository.js';
import type { SubscriptionInvoiceRepositoryClass } from '@/features/subscription-invoice/subscription-invoice.repository.js';
import { resolveOrgScope, type OrgScopeDeps } from '@/util/org-scope.js';
import { CreateAdminRequestSchema } from '@/schema/admin-request.schema.js';
import { Error } from '@/error/index.js';
import { paramId } from '@/util/params.js';
import { getActor } from '@/util/actor.js';
import { logger } from '@/util/logger.js';
import { PlanChangeRefusedError } from './plan-change-rules.js';
import { refusalBody } from './admin-request-rules.js';
import type { AdminRequestLedger } from './admin-request-ledger.js';

/**
 * The subscriber's own side of the inbox: filing a request, reading back its
 * own outstanding ones, and taking one back.
 */
export class AdminRequestSubscriberHandlers {
  constructor(
    private readonly repository: AdminRequestRepositoryClass,
    private readonly memberSubscriptionRepository: MemberSubscriptionRepositoryClass,
    private readonly subscriptionInvoiceRepository: SubscriptionInvoiceRepositoryClass,
    private readonly orgScopeDeps: OrgScopeDeps,
    private readonly ledger: AdminRequestLedger,
  ) {}

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
      const refusal = await this.ledger.ledgerRefusal({
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
          await this.ledger.applyPlanChangeToLedger(fields, actor, async (tx) => {
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
}
