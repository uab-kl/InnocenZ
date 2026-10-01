import { Request, Response } from 'express';
import type { AdminRequestRepositoryClass } from './admin-request.repository.js';
import { AdminRequest, AdminRequestFilter, AdminRequestType, AdminRequestStatus } from './admin-request.model.js';
import type { MemberSubscriptionRepositoryClass } from '@/features/member-subscription/member-subscription.repository.js';
import { Error } from '@/error/index.js';
import { paramId } from '@/util/params.js';
import { logger } from '@/util/logger.js';
import { parseDatesQuery } from '@/util/filter-date-format.js';

/**
 * The admin's queue — the inbox list, its pending badge, one row, and the
 * negotiated-price summary — plus the live ledger facts `list` and `getById`
 * attach to each row. Read-only.
 */
export class AdminRequestQueueHandlers {
  constructor(
    private readonly repository: AdminRequestRepositoryClass,
    private readonly memberSubscriptionRepository: MemberSubscriptionRepositoryClass,
  ) {}

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
        AdminRequestQueueHandlers.negotiatedKindFor(row.type) && row.subscriberId && row.subscriberType,
    );
    if (negotiated.length === 0) return records;
    try {
      const priceByKey = new Map<string, string | null>();
      for (const row of negotiated) {
        const kind = AdminRequestQueueHandlers.negotiatedKindFor(row.type);
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
        const kind = AdminRequestQueueHandlers.negotiatedKindFor(row.type);
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
}
