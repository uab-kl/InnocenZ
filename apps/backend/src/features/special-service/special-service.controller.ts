import { Request, Response } from 'express';
import { SpecialServiceRepositoryClass } from './special-service.repository.js';
import {
  SpecialServiceAdminAccepted,
  SpecialServiceCategory,
  SpecialServiceFilter,
  SpecialServiceInitiatedBy,
  SpecialServiceStatus,
} from './special-service.model.js';
import {
  AssignSpecialServiceSchema,
  CreateSpecialServiceSchema,
  UpdateSpecialServiceSchema,
  UpdateStatusSchema,
} from '@/schema/special-service.schema.js';
import { Error } from '@/error/index.js';
import { paramId } from '@/util/params.js';
import { getActor } from '@/util/actor.js';
import { logger } from '@/util/logger.js';

export class SpecialServiceControllerClass {
  constructor(private repository: SpecialServiceRepositoryClass) {}

  private buildFilter(req: Request): SpecialServiceFilter {
    return {
      outletId: req.query.outletId as string | undefined,
      status: req.query.status as SpecialServiceStatus | undefined,
      category: req.query.category as SpecialServiceCategory | undefined,
      assignedAgencyId: req.query.assignedAgencyId as string | undefined,
      initiatedBy: req.query.initiatedBy as SpecialServiceInitiatedBy | undefined,
      adminAccepted: req.query.adminAccepted as SpecialServiceAdminAccepted | undefined,
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
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      });
    } catch (error) {
      logger.error('[SpecialServiceController.list] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  // Agency-initiated jobs awaiting admin accept/decline (Admin Job Postings screen).
  async listAdminPending(req: Request, res: Response) {
    try {
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 50);
      const { records, totalCount } = await this.repository.listPaginated({
        filter: { initiatedBy: 'agency', adminAccepted: 'pending' },
        page,
        pageSize,
      });
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      res.status(200).json({
        success: true,
        message: 'OK',
        data: records,
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      });
    } catch (error) {
      logger.error('[SpecialServiceController.listAdminPending] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  // Counts by status for the summary cards.
  async statusSummary(_req: Request, res: Response) {
    try {
      const rows = await this.repository.statusCounts();
      const byStatus: Record<string, number> = {
        open: 0,
        assigned: 0,
        in_progress: 0,
        completed: 0,
        cancelled: 0,
      };
      let total = 0;
      for (const row of rows) {
        byStatus[row.status] = row.count;
        total += row.count;
      }
      res.status(200).json({ success: true, message: 'OK', data: byStatus, total });
    } catch (error) {
      logger.error('[SpecialServiceController.statusSummary] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const record = await this.repository.getById(paramId(req.params.id));
      if (!record) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'OK', data: record });
    } catch (error) {
      logger.error('[SpecialServiceController.getById] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const parsed = CreateSpecialServiceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const actor = getActor(req);
      const initiatedBy = parsed.data.initiatedBy;
      const adminAccepted = initiatedBy === 'agency' ? 'pending' : 'n_a';
      const record = await this.repository.create({
        outletId: parsed.data.outletId ?? null,
        outletName: parsed.data.outletName,
        title: parsed.data.title,
        category: parsed.data.category,
        description: parsed.data.description ?? null,
        budget: parsed.data.budget !== undefined ? parsed.data.budget.toFixed(2) : null,
        status: 'open',
        initiatedBy,
        adminAccepted,
        postingAgencyId: parsed.data.postingAgencyId ?? null,
        postingAgencyName: parsed.data.postingAgencyName ?? null,
        scheduledFor: parsed.data.scheduledFor ?? null,
        createdBy: actor,
        updatedBy: actor,
      });
      if (!record) return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      res.status(201).json({ success: true, message: 'Special service created', data: record });
    } catch (error) {
      logger.error('[SpecialServiceController.create] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  // Assign to an agency (moves status to 'assigned').
  async assign(req: Request, res: Response) {
    try {
      const parsed = AssignSpecialServiceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const record = await this.repository.update(paramId(req.params.id), {
        assignedAgencyId: parsed.data.assignedAgencyId,
        assignedAgencyName: parsed.data.assignedAgencyName,
        status: 'assigned',
        updatedBy: getActor(req),
      });
      if (!record) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Assigned to agency', data: record });
    } catch (error) {
      logger.error('[SpecialServiceController.assign] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async updateStatus(req: Request, res: Response) {
    try {
      const parsed = UpdateStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const record = await this.repository.update(paramId(req.params.id), {
        status: parsed.data.status,
        updatedBy: getActor(req),
      });
      if (!record) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Status updated', data: record });
    } catch (error) {
      logger.error('[SpecialServiceController.updateStatus] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** Edit budget / schedule / title on an existing order (admin). */
  async update(req: Request, res: Response) {
    try {
      const parsed = UpdateSpecialServiceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const existing = await this.repository.getById(paramId(req.params.id));
      if (!existing) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      const payload: Parameters<SpecialServiceRepositoryClass['update']>[1] = {
        updatedBy: getActor(req),
      };
      if (parsed.data.title !== undefined) payload.title = parsed.data.title;
      if (parsed.data.description !== undefined) payload.description = parsed.data.description;
      if (parsed.data.category !== undefined) payload.category = parsed.data.category;
      if (parsed.data.outletName !== undefined) payload.outletName = parsed.data.outletName;
      if (parsed.data.postingAgencyName !== undefined) {
        payload.postingAgencyName = parsed.data.postingAgencyName;
      }
      if (parsed.data.initiatedBy !== undefined) {
        payload.initiatedBy = parsed.data.initiatedBy;
      }
      if (parsed.data.budget !== undefined) {
        payload.budget =
          parsed.data.budget === null ? null : parsed.data.budget.toFixed(2);
      }
      if (parsed.data.scheduledFor !== undefined) {
        payload.scheduledFor = parsed.data.scheduledFor;
      }
      const record = await this.repository.update(existing.id, payload);
      if (!record) {
        return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      }
      res.status(200).json({ success: true, message: 'Special service updated', data: record });
    } catch (error) {
      logger.error('[SpecialServiceController.update] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async adminApprove(req: Request, res: Response) {
    try {
      const existing = await this.repository.getById(paramId(req.params.id));
      if (!existing) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      if (existing.initiatedBy !== 'agency' || existing.adminAccepted !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Only agency-initiated jobs pending admin review can be approved',
          data: null,
        });
      }
      const record = await this.repository.update(existing.id, {
        adminAccepted: 'accepted',
        updatedBy: getActor(req),
      });
      if (!record) return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      res.status(200).json({ success: true, message: 'Job posting approved', data: record });
    } catch (error) {
      logger.error('[SpecialServiceController.adminApprove] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async adminDecline(req: Request, res: Response) {
    try {
      const existing = await this.repository.getById(paramId(req.params.id));
      if (!existing) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      if (existing.initiatedBy !== 'agency' || existing.adminAccepted !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Only agency-initiated jobs pending admin review can be declined',
          data: null,
        });
      }
      const record = await this.repository.update(existing.id, {
        adminAccepted: 'declined',
        status: 'cancelled',
        updatedBy: getActor(req),
      });
      if (!record) return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      res.status(200).json({ success: true, message: 'Job posting declined', data: record });
    } catch (error) {
      logger.error('[SpecialServiceController.adminDecline] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
