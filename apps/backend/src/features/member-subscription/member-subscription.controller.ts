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
  constructor(private repository: MemberSubscriptionRepositoryClass) {}

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
    };
  }

  async list(req: Request, res: Response) {
    try {
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 10);
      const { records, totalCount } = await this.repository.listPaginated({
        filter: this.buildFilter(req),
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
      const rows = await this.repository.revenueByPeriod(granularity, this.buildFilter(req));
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
      const record = await this.repository.update(paramId(req.params.id), {
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
