import { Request, Response } from 'express';
import { SpecialServiceRepositoryClass } from './special-service.repository.js';
import { PrRepositoryClass } from '@/features/pr-personnel/pr.repository.js';
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
import { resolveOrgScope, type OrgScopeDeps } from '@/util/org-scope.js';
import { portalRoleName } from '@/types/rbac-constant.js';
import type { AgencyOutletRepository } from '@/features/agency/agency-outlet.repository.js';

export class SpecialServiceControllerClass {
  constructor(
    private repository: SpecialServiceRepositoryClass,
    private prRepository: PrRepositoryClass,
    private authRepository: AuthRepositoryClass,
    private orgScopeDeps: OrgScopeDeps,
    private agencyOutletRepository: AgencyOutletRepository,
  ) {}

  /**
   * May this caller file a posting against THIS venue?
   *
   * `create` pinned `initiatedBy` server-side but took `outletId` on trust — any
   * uuid the client sent was stored. That stayed latent while the agency portal
   * sent only `outletName` (which this handler ignores), so `outletId` arrived
   * null from that path; sending the real id made it reachable, and a forged one
   * would put an attacker-chosen job posting, budget and agency name onto a
   * rival venue's own service list, where `getById` shows it as theirs because
   * `scope.outletIds.includes(record.outletId)` is true.
   *
   * Scoped by the rule each org already uses: an OUTLET operator may post only
   * at its own venues; an AGENCY only at venues it holds an approved
   * `agency_outlet` link to — the repository's stated portal visibility rule.
   * A posting with NO outlet stays allowed: a PR or an agency may raise one that
   * names no venue, which is what a nullable `outlet_id` is for.
   */
  private async mayPostForOutlet(
    req: Request,
    outletId: string | null,
  ): Promise<boolean> {
    if (!outletId) return true;
    const scope = await resolveOrgScope(req, this.orgScopeDeps);
    if (scope.isAdmin) return true;
    if (scope.outletIds.length > 0) return scope.outletIds.includes(outletId);
    if (scope.agencyId) {
      const linked =
        await this.agencyOutletRepository.listApprovedOutletIdsForAgency(
          scope.agencyId,
        );
      return linked.includes(outletId);
    }
    // A PR belongs to no venue, so it may not pin a posting to one.
    return false;
  }

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
    if (roles.some((r) => r.roleName === portalRoleName.ADMIN)) return claimed;

    /**
     * ⚠️ THIS COMPARED THE ROLE NAME TO THE PORTAL CODE, so agency and outlet
     * postings were refused outright — the feature has never worked for either.
     *
     * `initiatedBy` is one of 'outlet' | 'agency' | 'pr', which are PORTAL
     * CODES. A role row carries both: an agency owner is
     * `{ roleName: 'Owner', portalCode: 'agency' }` and an outlet owner is
     * `{ roleName: 'Owner', portalCode: 'outlet' }`. Testing `roleName` against
     * 'agency' therefore asked whether someone's TITLE was the word "agency",
     * which no seeded role has, and every agency and outlet caller got
     * "Cannot post a special service on behalf of another role".
     *
     * Only PRs slipped through, by coincidence: their role really is named 'pr'
     * and their `portalCode` is null, so the old test passed for exactly the one
     * caller it happened to fit. That is why the bug survived — the path that
     * was exercised was the path that worked.
     *
     * Both are accepted now, matching `holdsAgencyLane`/`holdsOutletLane`, which
     * already look at `portalCode` first and fall back to role names.
     */
    return roles.some((r) => r.portalCode === claimed || r.roleName === claimed)
      ? claimed
      : null;
  }

  private buildFilter(req: Request): SpecialServiceFilter {
    const idRaw = typeof req.query.id === 'string' ? req.query.id.trim() : '';
    return {
      outletId: req.query.outletId as string | undefined,
      status: req.query.status as SpecialServiceStatus | undefined,
      category: req.query.category as SpecialServiceCategory | undefined,
      vendorName: req.query.vendorName as string | undefined,
      initiatedBy: req.query.initiatedBy as
        SpecialServiceInitiatedBy | undefined,
      adminAccepted: req.query.adminAccepted as
        SpecialServiceAdminAccepted | undefined,
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
  private async scopedFilter(
    req: Request,
  ): Promise<SpecialServiceFilter | null> {
    const filter = this.buildFilter(req);
    const scope = await resolveOrgScope(req, this.orgScopeDeps);
    if (scope.isAdmin) return filter;
    // outletIds is plural but the filter takes one, so an operator of several
    // venues sees the first. A multi-outlet filter is the follow-up.
    const outletId = scope.outletIds[0];
    if (outletId) return { ...filter, outletId };
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
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
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
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
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
      if (!userId) {
        return res.status(200).json({
          success: true,
          message: 'OK',
          data: [],
          pagination: emptyPage,
        });
      }
      // Prefer posting_user_id (0087); fall back to legacy posting_pr_id bridge.
      const pr = await this.prRepository.getByUserId(userId);
      const { records, totalCount } = await this.repository.listPaginated({
        filter: {
          postingUserId: userId,
          ...(pr ? { postingPrId: pr.id } : {}),
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
      logger.error('[SpecialServiceController.listMine] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
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
      res
        .status(200)
        .json({ success: true, message: 'OK', data: byStatus, total });
    } catch (error) {
      logger.error('[SpecialServiceController.statusSummary] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const record = await this.repository.getById(paramId(req.params.id));
      if (!record)
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });

      // Someone else's order is a 404, not a 403 — the response must not confirm
      // the id exists. Same ownership rule as scopedFilter above.
      const scope = await resolveOrgScope(req, this.orgScopeDeps);
      const ownsIt =
        scope.isAdmin ||
        (record.outletId !== null &&
          scope.outletIds.includes(record.outletId)) ||
        (scope.agencyId !== null && record.initiatedBy === 'agency');
      if (!ownsIt) {
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      res.status(200).json({ success: true, message: 'OK', data: record });
    } catch (error) {
      logger.error('[SpecialServiceController.getById] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const parsed = CreateSpecialServiceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message,
          data: null,
        });
      }
      const actor = getActor(req);
      const initiatedBy = await this.initiatedByForCaller(
        req,
        parsed.data.initiatedBy,
      );
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
      let postingUserId: string | null = null;
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
        postingUserId = userId ?? pr.userId ?? null;
      }

      // The venue must be one this caller may actually post at — see
      // `mayPostForOutlet`. Checked here, after `initiatedBy` is pinned, so the
      // scope is judged from what the caller IS, never from what they claimed.
      if (!(await this.mayPostForOutlet(req, parsed.data.outletId ?? null))) {
        return res.status(403).json({
          success: false,
          message: 'You cannot post a service at that outlet',
          data: null,
        });
      }

      const record = await this.repository.create({
        outletId: parsed.data.outletId ?? null,
        title: parsed.data.title,
        category: parsed.data.category,
        description: parsed.data.description ?? null,
        budget:
          parsed.data.budget !== undefined
            ? parsed.data.budget.toFixed(2)
            : null,
        status: 'open',
        initiatedBy,
        adminAccepted,
        postingAgencyId: parsed.data.postingAgencyId ?? null,
        postingAgencyName: parsed.data.postingAgencyName ?? null,
        postingPrId,
        postingUserId,
        scheduledFor: parsed.data.scheduledFor ?? null,
        createdBy: actor,
        updatedBy: actor,
      });
      if (!record)
        return res.status(500).json({
          success: false,
          message: Error.INTERNAL_SERVER_ERROR,
          data: null,
        });
      res.status(201).json({
        success: true,
        message: 'Special service created',
        data: record,
      });
    } catch (error) {
      logger.error('[SpecialServiceController.create] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  // Assign to an agency (moves status to 'assigned').
  async assign(req: Request, res: Response) {
    try {
      const parsed = AssignSpecialServiceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message,
          data: null,
        });
      }
      const record = await this.repository.update(paramId(req.params.id), {
        vendorName: parsed.data.vendorName,
        status: 'assigned',
        updatedBy: getActor(req),
      });
      if (!record)
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });
      res
        .status(200)
        .json({ success: true, message: 'Assigned to agency', data: record });
    } catch (error) {
      logger.error('[SpecialServiceController.assign] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  async updateStatus(req: Request, res: Response) {
    try {
      const parsed = UpdateStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message,
          data: null,
        });
      }
      const record = await this.repository.update(paramId(req.params.id), {
        status: parsed.data.status,
        updatedBy: getActor(req),
      });
      if (!record)
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });
      res
        .status(200)
        .json({ success: true, message: 'Status updated', data: record });
    } catch (error) {
      logger.error('[SpecialServiceController.updateStatus] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /** Edit budget / schedule / title on an existing order (admin). */
  async update(req: Request, res: Response) {
    try {
      const parsed = UpdateSpecialServiceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message,
          data: null,
        });
      }
      const existing = await this.repository.getById(paramId(req.params.id));
      if (!existing) {
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      const payload: Parameters<SpecialServiceRepositoryClass['update']>[1] = {
        updatedBy: getActor(req),
      };
      if (parsed.data.title !== undefined) payload.title = parsed.data.title;
      if (parsed.data.description !== undefined)
        payload.description = parsed.data.description;
      if (parsed.data.category !== undefined)
        payload.category = parsed.data.category;
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
        return res.status(500).json({
          success: false,
          message: Error.INTERNAL_SERVER_ERROR,
          data: null,
        });
      }
      res.status(200).json({
        success: true,
        message: 'Special service updated',
        data: record,
      });
    } catch (error) {
      logger.error('[SpecialServiceController.update] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  async adminApprove(req: Request, res: Response) {
    try {
      const existing = await this.repository.getById(paramId(req.params.id));
      if (!existing) {
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      if (
        existing.initiatedBy !== 'agency' ||
        existing.adminAccepted !== 'pending'
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Only agency-initiated jobs pending admin review can be approved',
          data: null,
        });
      }
      const record = await this.repository.update(existing.id, {
        adminAccepted: 'accepted',
        updatedBy: getActor(req),
      });
      if (!record)
        return res.status(500).json({
          success: false,
          message: Error.INTERNAL_SERVER_ERROR,
          data: null,
        });
      res
        .status(200)
        .json({ success: true, message: 'Job posting approved', data: record });
    } catch (error) {
      logger.error('[SpecialServiceController.adminApprove] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  async adminDecline(req: Request, res: Response) {
    try {
      const existing = await this.repository.getById(paramId(req.params.id));
      if (!existing) {
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      if (
        existing.initiatedBy !== 'agency' ||
        existing.adminAccepted !== 'pending'
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Only agency-initiated jobs pending admin review can be declined',
          data: null,
        });
      }
      const record = await this.repository.update(existing.id, {
        adminAccepted: 'declined',
        status: 'cancelled',
        updatedBy: getActor(req),
      });
      if (!record)
        return res.status(500).json({
          success: false,
          message: Error.INTERNAL_SERVER_ERROR,
          data: null,
        });
      res
        .status(200)
        .json({ success: true, message: 'Job posting declined', data: record });
    } catch (error) {
      logger.error('[SpecialServiceController.adminDecline] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }
}
