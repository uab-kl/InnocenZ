import { Request, Response } from 'express';
import { AdminRequestRepositoryClass } from './admin-request.repository.js';
import { AdminRequest, AdminRequestFilter, AdminRequestType, AdminRequestStatus } from './admin-request.model.js';
import { MemberSubscriptionRepositoryClass } from '@/features/member-subscription/member-subscription.repository.js';
import { SubscriptionRepositoryClass } from '@/features/subscription/subscription.repository.js';
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
import { parseDatesQuery } from '@/util/filter-date-format.js';

export class AdminRequestControllerClass {
  constructor(
    private repository: AdminRequestRepositoryClass,
    private memberSubscriptionRepository: MemberSubscriptionRepositoryClass,
    private subscriptionRepository: SubscriptionRepositoryClass,
    private orgScopeDeps: OrgScopeDeps,
  ) {}

  /**
   * Move a subscriber onto the plan they asked for, in the `member_subscription`
   * ledger that the admin History page reads. Called when an outlet's plan change
   * is APPROVED, and when an agency's is recorded as 'direct' (agency switches
   * apply automatically — see create()).
   *
   * The ledger is a history of charges, so a switch is a NEW row: the old active
   * row is closed (`ended_at` stamped, status 'expired') rather than overwritten,
   * which is what lets History still show what the venue used to pay.
   *
   * Never throws into the caller: a request that cannot be reflected (no
   * subscriber id, unknown plan) is still approved, and the mismatch is logged —
   * refusing the approval would leave the admin unable to answer the request at
   * all.
   */
  private async applyPlanChangeToLedger(record: AdminRequest, actor: string): Promise<void> {
    try {
      if (!record.subscriberId || !record.subscriberType || !record.requestedPlanId) {
        logger.warn(
          `[AdminRequestController] plan change ${record.id} not reflected in the ledger: ` +
            `subscriberId=${record.subscriberId} requestedPlanId=${record.requestedPlanId}`,
        );
        return;
      }
      const plan = await this.subscriptionRepository.getSubscriptionById(record.requestedPlanId);
      if (!plan) {
        logger.warn(`[AdminRequestController] plan ${record.requestedPlanId} not found; ledger untouched`);
        return;
      }

      // Close whatever this subscriber is on today.
      const { records: current } = await this.memberSubscriptionRepository.listPaginated({
        filter: {
          subscriberType: record.subscriberType,
          subscriberId: record.subscriberId,
          status: 'active',
        },
        page: 1,
        pageSize: 50,
      });
      const endedAt = new Date();
      for (const row of current) {
        await this.memberSubscriptionRepository.update(row.id, {
          status: 'expired',
          endedAt,
          updatedBy: actor,
        });
      }

      // The negotiated price wins when the admin set one; otherwise the plan's.
      const amount = record.quotedAmount ?? plan.price;
      await this.memberSubscriptionRepository.create({
        subscriberType: record.subscriberType,
        subscriberId: record.subscriberId,
        subscriberName: record.subscriberName,
        subscriptionId: plan.id,
        planName: plan.name,
        amount,
        billingCycle: plan.billingCycle,
        status: 'active',
        startedAt: endedAt,
        createdBy: actor,
        updatedBy: actor,
      });
    } catch (error) {
      logger.error('[AdminRequestController.applyPlanChangeToLedger] Error:', error);
    }
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
      const records = await this.withPreviousAddonPrice(await this.withLiveFromPlan(rawRecords));
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
      const [enriched] = await this.withPreviousAddonPrice(await this.withLiveFromPlan([record]));
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

      const record = await this.repository.create({
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
        // Agency plan changes are applied automatically (by PR count) and only
        // logged here as 'direct'; outlet plan changes wait for admin approval.
        status:
          parsed.data.type === 'plan_change' && parsed.data.subscriberType === 'agency'
            ? 'direct'
            : 'pending',
        createdBy: actor,
        updatedBy: actor,
      });
      if (!record) return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      // An agency switch needs no approval ('direct'), so it takes effect in the
      // ledger straight away. An outlet's waits for approve().
      if (record.type === 'plan_change' && record.status === 'direct') {
        await this.applyPlanChangeToLedger(record, actor);
      }
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
        await this.memberSubscriptionRepository.create({
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
        return;
      }

      if (record.type === 'custom_renegotiation') {
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
        await this.memberSubscriptionRepository.update(current.id, {
          amount,
          adminRequestId: record.id,
          updatedBy: actor,
        });
      }
    } catch (error) {
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
   * Attach the add-on price the subscriber is on TODAY, for POS requests.
   *
   * A re-quote or a cancellation is only meaningful next to the figure it
   * replaces or ends — "negotiate again" against nothing tells the admin
   * nothing. It is null for a first-time request, which has no previous price.
   */
  private async withPreviousAddonPrice(records: AdminRequest[]): Promise<AdminRequest[]> {
    const posRows = records.filter(
      (row) => row.type === 'pos_integration_quote' && row.subscriberId && row.subscriberType,
    );
    if (posRows.length === 0) return records;
    try {
      const priceBySubscriber = new Map<string, string | null>();
      for (const row of posRows) {
        if (!row.subscriberId || !row.subscriberType || priceBySubscriber.has(row.subscriberId)) {
          continue;
        }
        const { records: addons } = await this.memberSubscriptionRepository.listPaginated({
          filter: {
            subscriberType: row.subscriberType,
            subscriberId: row.subscriberId,
            status: 'active',
            kind: 'addon',
          },
          page: 1,
          pageSize: 1,
        });
        priceBySubscriber.set(row.subscriberId, addons[0]?.amount ?? null);
      }
      return records.map((row) =>
        row.type === 'pos_integration_quote' && row.subscriberId
          ? { ...row, previousAddonAmount: priceBySubscriber.get(row.subscriberId) ?? null }
          : row,
      );
    } catch (error) {
      logger.error('[AdminRequestController.withPreviousAddonPrice] Error:', error);
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
      const payload: Parameters<AdminRequestRepositoryClass['update']>[1] = {
        status: 'resolved',
        updatedBy: actor,
      };
      if (parsed.data.quotedAmount !== undefined) payload.quotedAmount = parsed.data.quotedAmount.toFixed(2);

      const record = await this.repository.update(paramId(req.params.id), payload);
      if (!record) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      // Resolving is where a negotiated price becomes real — until now the
      // figure lived only on this row, so nothing billed it and the subscriber
      // never saw it.
      await this.applyResolvedPriceToLedger(record, actor);
      res.status(200).json({ success: true, message: 'Request resolved', data: record });
    } catch (error) {
      logger.error('[AdminRequestController.resolve] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  // Approve an outlet plan change. The price follows the to-plan from now on —
  // the frontend passes the to-plan price as quotedAmount so it is stamped here.
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
      const payload: Parameters<AdminRequestRepositoryClass['update']>[1] = {
        status: 'approved',
        updatedBy: getActor(req),
      };
      if (parsed.data.quotedAmount !== undefined) payload.quotedAmount = parsed.data.quotedAmount.toFixed(2);

      const record = await this.repository.update(existing.id, payload);
      if (!record) return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      // Approval is what makes the switch real: reflect it in the billing ledger
      // so the admin History page and the subscriber's own screen agree.
      await this.applyPlanChangeToLedger(record, getActor(req));
      res.status(200).json({ success: true, message: 'Plan change approved', data: record });
    } catch (error) {
      logger.error('[AdminRequestController.approve] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  // Decline an outlet plan change — the subscriber stays on the from-plan.
  async decline(req: Request, res: Response) {
    try {
      const existing = await this.repository.getById(paramId(req.params.id));
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      if (existing.type !== 'plan_change') {
        return res.status(400).json({ success: false, message: 'Only plan changes can be declined', data: null });
      }
      const record = await this.repository.update(existing.id, {
        status: 'declined',
        updatedBy: getActor(req),
      });
      if (!record) return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      res.status(200).json({ success: true, message: 'Plan change declined', data: record });
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
