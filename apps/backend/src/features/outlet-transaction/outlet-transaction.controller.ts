import { Request, Response } from 'express';
import { OutletTransactionRepositoryClass } from './outlet-transaction.repository.js';
import { OutletTransactionFilter, OutletTransactionStatus } from './outlet-transaction.model.js';
import { CreateOutletTransactionSchema } from '@/schema/outlet-transaction.schema.js';
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

export class OutletTransactionControllerClass {
  constructor(private repository: OutletTransactionRepositoryClass) {}

  private buildFilter(req: Request): OutletTransactionFilter {
    return {
      outletId: req.query.outletId as string | undefined,
      status: req.query.status as OutletTransactionStatus | undefined,
      from: parseDate(req.query.from),
      to: parseDate(req.query.to),
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
      logger.error('[OutletTransactionController.list] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  // Transaction volume by period (granularity=day|week|month|year, default month).
  async summary(req: Request, res: Response) {
    try {
      const granularity = parseGranularity(req.query.granularity);
      const rows = await this.repository.volumeByPeriod(granularity, this.buildFilter(req));
      const data = rows.map((row) => ({ period: row.period, volume: Number(row.total), count: row.count }));
      res.status(200).json({
        success: true,
        message: 'OK',
        granularity,
        data,
        totals: { volume: data.reduce((s, p) => s + p.volume, 0), count: data.reduce((s, p) => s + p.count, 0) },
      });
    } catch (error) {
      logger.error('[OutletTransactionController.summary] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const record = await this.repository.getById(paramId(req.params.id));
      if (!record) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'OK', data: record });
    } catch (error) {
      logger.error('[OutletTransactionController.getById] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const parsed = CreateOutletTransactionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const actor = getActor(req);
      const record = await this.repository.create({
        outletId: parsed.data.outletId,
        outletName: parsed.data.outletName,
        amount: parsed.data.amount.toFixed(2),
        currency: parsed.data.currency,
        type: parsed.data.type,
        status: parsed.data.status,
        reference: parsed.data.reference ?? null,
        occurredAt: parsed.data.occurredAt ?? new Date(),
        createdBy: actor,
        updatedBy: actor,
      });
      if (!record) return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      res.status(201).json({ success: true, message: 'Transaction recorded', data: record });
    } catch (error) {
      logger.error('[OutletTransactionController.create] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
