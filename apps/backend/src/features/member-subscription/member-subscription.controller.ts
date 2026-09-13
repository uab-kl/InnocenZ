import { Request, Response } from 'express';
import { MemberSubscriptionRepositoryClass } from './member-subscription.repository.js';
import { MemberSubscriptionFilter, SubscriberType, MemberSubscriptionStatus } from './member-subscription.model.js';
import {
  CreateMemberSubscriptionSchema,
  UpdateMemberSubscriptionSchema,
} from '@/schema/member-subscription.schema.js';
import { Error } from '@/error/index.js';
import { paramId } from '@/util/params.js';
import { getActor } from '@/util/actor.js';
import { logger } from '@/util/logger.js';
import { parseGranularity } from '@/util/period.js';
import { resolveOrgScope, type OrgScopeDeps } from '@/util/org-scope.js';
import { LIVE_MEMBER_SUBSCRIPTION_STATUSES } from './member-subscription.model.js';
import { wouldLeaveOrgPlanless } from '@/features/subscription/plan-limit.js';

/** Does this status still mean the org is ON the lane? */
function isLiveStatus(status: string): boolean {
  const live: readonly string[] = LIVE_MEMBER_SUBSCRIPTION_STATUSES;
  return live.includes(status);
}

/**
 * The refusal for closing an org's LAST plan, or null when it may proceed.
 *
 * The creation doors all require a plan now — sign-up, admin create, the tier
 * switch — but nothing guarded the other end, and cancelling is the everyday
 * action that breaks the rule. An outlet left with no plan cannot post at all;
 * an agency left with no plan is invisible to the Sunday tier rule, which reads
 * FROM this table, so it can never be re-priced.
 *
 * REFUSES ON UNKNOWN, unlike the posting gate. There, an unanswerable question
 * must not take a working venue offline. Here it must not wave through a
 * cancellation nobody can undo — a retry is the cheaper mistake.
 */
async function lastPlanRefusal(memberSubscriptionId: string): Promise<{
  status: number;
  body: { success: boolean; message: string; data: null };
} | null> {
  const verdict = await wouldLeaveOrgPlanless(memberSubscriptionId);
  if (verdict === 'no') return null;
  if (verdict === 'unknown') {
    return {
      status: 503,
      body: {
        success: false,
        message:
          "Could not check whether this is the organisation's last plan. Nothing was changed — try again.",
        data: null,
      },
    };
  }
  return {
    status: 409,
    body: {
      success: false,
      message:
        "This is the organisation's only active plan. Move it onto another plan instead of ending it: an outlet with no plan cannot post shifts, and an agency with no plan cannot be priced or billed.",
      data: null,
    },
  };
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

type PeriodRevenuePoint = {
  period: string;
  outletRevenue: number;
  agencyRevenue: number;
  totalRevenue: number;
  outletCount: number;
  agencyCount: number;
};

export class MemberSubscriptionControllerClass {
  constructor(
    private repository: MemberSubscriptionRepositoryClass,
    private orgScopeDeps: OrgScopeDeps,
  ) {}

  /**
   * Narrows the client's filter to the caller's own subscription.
   *
   * This router had NO gate and NO scoping: any signed-in account could page
   * every member's billing history, and a PR could cancel one. An agency now
   * sees only its own row, an outlet only its own, and admin sees everything.
   *
   * Returns null when the caller belongs to no org — the caller must 403 on it
   * rather than fall through to an unfiltered query.
   */
  private async scopedFilter(
    req: Request,
  ): Promise<MemberSubscriptionFilter | null> {
    const filter = this.buildFilter(req);
    const scope = await resolveOrgScope(req, this.orgScopeDeps);
    if (scope.isAdmin) return filter;

    // Server-derived, and it OVERWRITES whatever the client asked for — the
    // whole point is that these two fields stop being caller-controlled.
    if (scope.agencyId) {
      return { ...filter, subscriberType: 'agency', subscriberId: scope.agencyId };
    }
    // An operator of several venues holds one subscription per venue; the
    // filter takes a single id, so this reads the first. Multi-venue operators
    // need a subscriberIds filter — noted rather than guessed at.
    const outletId = scope.outletIds[0];
    if (outletId) {
      return { ...filter, subscriberType: 'outlet', subscriberId: outletId };
    }
    return null;
  }

  private buildFilter(req: Request): MemberSubscriptionFilter {
    const datesRaw = req.query.dates;
    const dates =
      typeof datesRaw === 'string'
        ? datesRaw
            .split(',')
            .map((value) => value.trim())
            .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
        : undefined;

    return {
      subscriberType: req.query.subscriberType as SubscriberType | undefined,
      subscriberId: req.query.subscriberId as string | undefined,
      subscriptionId: req.query.subscriptionId as string | undefined,
      status: req.query.status as MemberSubscriptionStatus | undefined,
      from: parseDate(req.query.from),
      to: parseDate(req.query.to),
      dates: dates && dates.length > 0 ? dates : undefined,
      search:
        typeof req.query.search === 'string' && req.query.search.trim().length > 0
          ? req.query.search.trim()
          : undefined,
      // ?latestPerSubscriber=true → the plan each subscriber is on now, one row
      // each, instead of every plan it has ever held.
      latestPerSubscriber: req.query.latestPerSubscriber === 'true',
    };
  }

  async list(req: Request, res: Response) {
    try {
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 10);
      const filter = await this.scopedFilter(req);
      if (!filter) {
        return res.status(403).json({
          success: false,
          message: 'No organization associated with this account',
          data: null,
        });
      }
      const { records, totalCount } = await this.repository.listPaginated({
        filter,
        page,
        pageSize,
      });
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      res.status(200).json({
        success: true,
        message: 'OK',
        data: records,
        pagination: { page, pageSize, totalCount, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
      });
    } catch (error) {
      logger.error('[MemberSubscriptionController.list] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  // Subscription revenue by period (granularity=day|week|month|year, default month),
  // pivoted into outlet vs agency, oldest -> newest.
  async summary(req: Request, res: Response) {
    try {
      const granularity = parseGranularity(req.query.granularity);
      const filter = await this.scopedFilter(req);
      if (!filter) {
        return res.status(403).json({
          success: false,
          message: 'No organization associated with this account',
          data: null,
        });
      }
      const rows = await this.repository.revenueByPeriod(granularity, filter);
      const byPeriod = new Map<string, PeriodRevenuePoint>();
      for (const row of rows) {
        const point =
          byPeriod.get(row.period) ??
          { period: row.period, outletRevenue: 0, agencyRevenue: 0, totalRevenue: 0, outletCount: 0, agencyCount: 0 };
        const amount = Number(row.total);
        if (row.subscriberType === 'outlet') {
          point.outletRevenue += amount;
          point.outletCount += row.count;
        } else {
          point.agencyRevenue += amount;
          point.agencyCount += row.count;
        }
        point.totalRevenue = point.outletRevenue + point.agencyRevenue;
        byPeriod.set(row.period, point);
      }
      const data = [...byPeriod.values()];
      res.status(200).json({
        success: true,
        message: 'OK',
        granularity,
        data,
        totals: {
          outletRevenue: data.reduce((s, p) => s + p.outletRevenue, 0),
          agencyRevenue: data.reduce((s, p) => s + p.agencyRevenue, 0),
          totalRevenue: data.reduce((s, p) => s + p.totalRevenue, 0),
        },
      });
    } catch (error) {
      logger.error('[MemberSubscriptionController.summary] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const record = await this.repository.getById(paramId(req.params.id));
      if (!record) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      // Someone else's subscription is a 404, not a 403 — the response must not
      // confirm the id exists.
      const scope = await resolveOrgScope(req, this.orgScopeDeps);
      const ownsIt =
        scope.isAdmin ||
        (record.subscriberType === 'agency' && record.subscriberId === scope.agencyId) ||
        (record.subscriberType === 'outlet' && scope.outletIds.includes(record.subscriberId));
      if (!ownsIt) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      res.status(200).json({ success: true, message: 'OK', data: record });
    } catch (error) {
      logger.error('[MemberSubscriptionController.getById] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const parsed = CreateMemberSubscriptionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const actor = getActor(req);
      const record = await this.repository.create({
        subscriberType: parsed.data.subscriberType,
        subscriberId: parsed.data.subscriberId,
        subscriberName: parsed.data.subscriberName,
        subscriptionId: parsed.data.subscriptionId ?? null,
        planName: parsed.data.planName,
        amount: parsed.data.amount.toFixed(2),
        billingCycle: parsed.data.billingCycle,
        currency: parsed.data.currency,
        status: parsed.data.status,
        startedAt: parsed.data.startedAt ?? new Date(),
        createdBy: actor,
        updatedBy: actor,
      });
      if (!record) return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      res.status(201).json({ success: true, message: 'Subscription record created', data: record });
    } catch (error) {
      logger.error('[MemberSubscriptionController.create] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const parsed = UpdateMemberSubscriptionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const id = paramId(req.params.id);
      const payload: Parameters<MemberSubscriptionRepositoryClass['update']>[1] = { updatedBy: getActor(req) };
      if (parsed.data.planName !== undefined) payload.planName = parsed.data.planName;
      if (parsed.data.amount !== undefined) payload.amount = parsed.data.amount.toFixed(2);
      if (parsed.data.billingCycle !== undefined) payload.billingCycle = parsed.data.billingCycle;
      if (parsed.data.currency !== undefined) payload.currency = parsed.data.currency;
      if (parsed.data.status !== undefined) payload.status = parsed.data.status;
      if (parsed.data.endedAt !== undefined) payload.endedAt = parsed.data.endedAt;
      /*
       * The billing anchor. See the schema for what moving it does and does not
       * touch — in short, it re-dates the periods this lane has NOT yet opened
       * and leaves every invoice already raised alone.
       */
      if (parsed.data.billingStartsAt !== undefined)
        payload.billingStartsAt = parsed.data.billingStartsAt;

      /**
       * An edit can close a lane just as thoroughly as `cancel` does — by
       * stamping `endedAt`, or by moving `status` to a dead value — and this is
       * the endpoint that does it one field at a time. Guarded only when the
       * payload actually closes something: setting `endedAt` back to null
       * REOPENS a lane, which is the opposite of the danger.
       */
      const closesLane =
        (payload.endedAt !== undefined && payload.endedAt !== null) ||
        (payload.status !== undefined && !isLiveStatus(payload.status));
      if (closesLane) {
        const refusal = await lastPlanRefusal(id);
        if (refusal) return res.status(refusal.status).json(refusal.body);
      }

      const record = await this.repository.update(id, payload);
      if (!record) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Subscription record updated', data: record });
    } catch (error) {
      logger.error('[MemberSubscriptionController.update] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async cancel(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const refusal = await lastPlanRefusal(id);
      if (refusal) return res.status(refusal.status).json(refusal.body);

      const record = await this.repository.update(id, {
        status: 'cancelled',
        endedAt: new Date(),
        updatedBy: getActor(req),
      });
      if (!record) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Subscription cancelled', data: record });
    } catch (error) {
      logger.error('[MemberSubscriptionController.cancel] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
