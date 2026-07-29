import { Request, Response } from 'express';
import { SpecialServiceRepositoryClass } from './special-service.repository.js';
import { PrRepositoryClass } from '@/features/pr/pr.repository.js';
import { AuthRepositoryClass } from '@/features/auth/auth.repository.js';
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
import { parseDatesQuery } from '@/util/filter-date-format.js';
import { resolveCallerOrg, type CallerOrgDeps } from '@/util/caller-org.js';

export class SpecialServiceControllerClass {
  constructor(
    private repository: SpecialServiceRepositoryClass,
    private prRepository: PrRepositoryClass,
    private authRepository: AuthRepositoryClass,
    private callerOrgDeps: CallerOrgDeps,
  ) {}

  private parseOrder(req: Request): 'asc' | 'desc' {
    return req.query.order === 'asc' ? 'asc' : 'desc';
  }

  /**
   * `initiatedBy` is not a label, it is a decision: an agency posting lands as
   * `admin_accepted: 'pending'` and waits for review, while outlet and PR
   * postings go live immediately. It arrived straight from the request body, so
   * a PR could post as 'outlet' and bypass admin review entirely.
   *
   * The enum values are the same strings as the role names, so the caller's own
   * role decides what it may claim. Admin may post on anyone's behalf; everyone
   * else may only speak for themselves. Returns null when the claim does not
   * match, which the caller turns into a 403.
   */
  private async initiatedByForCaller(
    req: Request,
    claimed: SpecialServiceInitiatedBy,
  ): Promise<SpecialServiceInitiatedBy | null> {
    const userId = req.user?.id;
    if (!userId) return null;
    const roles = await this.authRepository.getRolesForUserIds([userId]);
    const roleNames = roles.map((role) => role.roleName);
    if (roleNames.includes('admin')) return claimed;
    return roleNames.includes(claimed) ? claimed : null;
  }

  private buildFilter(req: Request): SpecialServiceFilter {
    const idRaw = typeof req.query.id === 'string' ? req.query.id.trim() : '';
    return {
      outletId: req.query.outletId as string | undefined,
      status: req.query.status as SpecialServiceStatus | undefined,
      category: req.query.category as SpecialServiceCategory | undefined,
      vendorName: req.query.vendorName as string | undefined,
      initiatedBy: req.query.initiatedBy as SpecialServiceInitiatedBy | undefined,
      adminAccepted: req.query.adminAccepted as SpecialServiceAdminAccepted | undefined,
      id: idRaw || undefined,
      dates: parseDatesQuery(req.query.dates),
      scheduledDates: parseDatesQuery(req.query.scheduledDates),
    };
  }

  /**
   * Narrows the client's filter to what the caller may see.
   *
   * `list` used to build its filter purely from query params, so any signed-in
   * account could page every outlet's and agency's service orders.
   *
   * An outlet is pinned to its own outletId. An agency is a looser fit —
   * `special_service` has no agency column — so it is confined to the orders it
   * initiated. That is narrower than the truth (it will not show an outlet's
   * request this agency ends up fulfilling), which is the right direction to err
   * until the table carries an agency id.
   *
   * Returns null when the caller belongs to no org.
   */
  private async scopedFilter(req: Request): Promise<SpecialServiceFilter | null> {
    const filter = this.buildFilter(req);
    const scope = await resolveCallerOrg(req, this.callerOrgDeps);
    if (scope.isAdmin) return filter;
    if (scope.outletId) return { ...filter, outletId: scope.outletId };
    if (scope.agencyId) return { ...filter, initiatedBy: 'agency' };
    return null;
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
        order: this.parseOrder(req),
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
        filter: {
          initiatedBy: 'agency',
          adminAccepted: 'pending',
          dates: parseDatesQuery(req.query.dates),
          scheduledDates: parseDatesQuery(req.query.scheduledDates),
        },
        page,
        pageSize,
        order: this.parseOrder(req),
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

  // The signed-in PR's own postings (mobile "Your service orders"). Scoped
  // server-side to the caller's pr.id, resolved from their user account.
  async listMine(req: Request, res: Response) {
    try {
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 50);
      const emptyPage = {
        page,
        pageSize,
        totalCount: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      };
      const userId = req.user?.id;
      const pr = userId ? await this.prRepository.getByUserId(userId) : null;
      if (!pr) {
        return res
          .status(200)
          .json({ success: true, message: 'OK', data: [], pagination: emptyPage });
      }
      const { records, totalCount } = await this.repository.listPaginated({
        filter: { postingPrId: pr.id },
        page,
        pageSize,
        order: this.parseOrder(req),
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
      logger.error('[SpecialServiceController.listMine] Error:', error);
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

      // Someone else's order is a 404, not a 403 — the response must not confirm
      // the id exists. Same ownership rule as scopedFilter above.
      const scope = await resolveCallerOrg(req, this.callerOrgDeps);
      const ownsIt =
        scope.isAdmin ||
        (scope.outletId !== null && record.outletId === scope.outletId) ||
        (scope.agencyId !== null && record.initiatedBy === 'agency');
      if (!ownsIt) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

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
      const initiatedBy = await this.initiatedByForCaller(req, parsed.data.initiatedBy);
      if (!initiatedBy) {
        return res.status(403).json({
          success: false,
          message: 'Cannot post a special service on behalf of another role',
          data: null,
        });
      }
      // Agency posts wait for admin review; outlet/PR posts go live as 'open'.
      const adminAccepted = initiatedBy === 'agency' ? 'pending' : 'n_a';

      // PR-initiated postings go to the admin. A PR cannot read the /pr list, so
      // its pr.id is resolved server-side from the signed-in user account rather
      // than trusted from the client.
      let postingPrId = parsed.data.postingPrId ?? null;
      if (initiatedBy === 'pr') {
        const userId = req.user?.id;
        const pr = userId ? await this.prRepository.getByUserId(userId) : null;
        if (!pr) {
          return res.status(400).json({
            success: false,
            message: 'No PR profile is linked to this account',
            data: null,
          });
        }
        postingPrId = pr.id;
      }

      const record = await this.repository.create({
        outletId: parsed.data.outletId ?? null,
        title: parsed.data.title,
        category: parsed.data.category,
        description: parsed.data.description ?? null,
        budget: parsed.data.budget !== undefined ? parsed.data.budget.toFixed(2) : null,
        status: 'open',
        initiatedBy,
        adminAccepted,
        postingAgencyId: parsed.data.postingAgencyId ?? null,
        postingAgencyName: parsed.data.postingAgencyName ?? null,
        postingPrId,
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
        vendorName: parsed.data.vendorName,
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
      if (parsed.data.vendorName !== undefined) {
        payload.vendorName = parsed.data.vendorName;
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
