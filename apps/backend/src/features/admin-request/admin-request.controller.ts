import { Request, Response } from 'express';
import { AdminRequestRepositoryClass } from './admin-request.repository.js';
import { AdminRequestFilter, AdminRequestType, AdminRequestStatus } from './admin-request.model.js';
import {
  CreateAdminRequestSchema,
  ResolveAdminRequestSchema,
  UpdateAdminRequestSchema,
} from '@/schema/admin-request.schema.js';
import { Error } from '@/error/index.js';
import { paramId } from '@/util/params.js';
import { getActor } from '@/util/actor.js';
import { logger } from '@/util/logger.js';

export class AdminRequestControllerClass {
  constructor(private repository: AdminRequestRepositoryClass) {}

  async list(req: Request, res: Response) {
    try {
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 10);
      const filter: AdminRequestFilter = {
        type: req.query.type as AdminRequestType | undefined,
        status: req.query.status as AdminRequestStatus | undefined,
        subscriberType: req.query.subscriberType as 'outlet' | 'agency' | undefined,
      };
      const { records, totalCount } = await this.repository.listPaginated({ filter, page, pageSize });
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

  // Pending-request count for the admin notification bell.
  async pendingCount(_req: Request, res: Response) {
    try {
      const count = await this.repository.countPending();
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
      res.status(200).json({ success: true, message: 'OK', data: record });
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
      const record = await this.repository.create({
        type: parsed.data.type,
        subscriberType: parsed.data.subscriberType ?? null,
        subscriberId: parsed.data.subscriberId ?? null,
        subscriberName: parsed.data.subscriberName,
        contactName: parsed.data.contactName ?? null,
        contactEmail: parsed.data.contactEmail ?? null,
        contactPhone: parsed.data.contactPhone ?? null,
        currentPlanId: parsed.data.currentPlanId ?? null,
        message: parsed.data.message ?? null,
        status: 'pending',
        createdBy: actor,
        updatedBy: actor,
      });
      if (!record) return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      res.status(201).json({ success: true, message: 'Request submitted', data: record });
    } catch (error) {
      logger.error('[AdminRequestController.create] Error:', error);
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
      const payload: Parameters<AdminRequestRepositoryClass['update']>[1] = {
        status: 'resolved',
        updatedBy: getActor(req),
      };
      if (parsed.data.quotedAmount !== undefined) payload.quotedAmount = parsed.data.quotedAmount.toFixed(2);

      const record = await this.repository.update(paramId(req.params.id), payload);
      if (!record) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Request resolved', data: record });
    } catch (error) {
      logger.error('[AdminRequestController.resolve] Error:', error);
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
