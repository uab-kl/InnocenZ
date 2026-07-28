import { Request, Response } from 'express';
import { PrRepositoryClass } from './pr.repository';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';
import { AgencyPrRepository } from '@/features/agency/agency-pr.repository';
import { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository';
import { AuthRepositoryClass } from '@/features/auth/auth.repository';
import { Error } from '@/error/index';
import { paramId } from '@/util/params';
import { getActor } from '@/util/actor';
import { logger } from '@/util/logger';
import { CreatePrSchema, UpdatePrSchema } from '@/schema/pr.schema';
import { PrFilter, PrStatus, PrTier } from './pr.model';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

/**
 * A caller is scoped one of three ways: admin (everything), agency member (their
 * agency's PRs), or outlet member (only PRs rostered at their own venues, read
 * only). `outletIds` is empty for non-outlet callers.
 */
type Scope = { isAdmin: boolean; agencyId: string | null; outletIds: string[] };

function parsePaging(req: Request): { page: number; pageSize: number } {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE));
  return { page, pageSize };
}

export class PrControllerClass {
  constructor(
    private prRepository: PrRepositoryClass,
    private agencyMemberRepository: AgencyMemberRepositoryClass,
    private authRepository: AuthRepositoryClass,
    private outletMemberRepository: OutletMemberRepositoryClass,
    private agencyPrRepository: AgencyPrRepository,
  ) {}

  /**
   * The signed-in PR sets which agencies they want to be under, from their own
   * profile page. Links are written as `pending` — this is a join *request*,
   * so the agency still has to approve before the PR is on its roster.
   */
  async updateMyAgencies(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }

      const pr = await this.prRepository.getByUserId(userId);
      if (!pr) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const raw = req.body?.agencyIds;
      if (!Array.isArray(raw) || raw.length > 20) {
        return res.status(400).json({
          success: false,
          message: 'agencyIds must be an array of at most 20 agency ids',
          data: null,
        });
      }
      const agencyIds = [
        ...new Set(raw.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)),
      ];

      // A request already on the agency's desk locks the selection: the PR
      // cannot add or drop agencies until it is approved or rejected.
      const current = await this.agencyPrRepository.listByPr(pr.id);
      const pendingLink = current.find((link) => link.approveStatus === 'pending');
      if (pendingLink) {
        return res.status(409).json({
          success: false,
          message: 'An agency request is awaiting approval. You cannot change agencies until it is approved or rejected.',
          data: null,
        });
      }

      // Every id must be a real agency, else the FK insert would 500 later.
      const known = await this.agencyPrRepository.filterExistingAgencyIds(agencyIds);
      if (known.length !== agencyIds.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more agencies do not exist',
          data: null,
        });
      }

      await this.agencyPrRepository.syncLinksForPr(pr.id, known, getActor(req));
      const links = await this.agencyPrRepository.listLinksByUserIds([userId]);

      res.status(200).json({ success: true, message: 'Agencies updated', data: links });
    } catch (error) {
      logger.error('[PrController.updateMyAgencies] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Resolves the caller's data scope. Admins see everything; every other caller
   * is confined to the org they belong to (resolved from the DB, never trusted
   * from the request body). Agency membership wins when a user holds both.
   */
  private async resolveScope(req: Request): Promise<Scope> {
    const user = req.user!;
    const roles = await this.authRepository.getRolesForUserIds([user.id]);
    const isAdmin = roles.some((r) => r.roleName === 'admin');
    if (isAdmin) return { isAdmin: true, agencyId: null, outletIds: [] };

    const memberships = await this.agencyMemberRepository.listByUser(user.id);
    const active = memberships.find((m) => m.status === 'active') ?? memberships[0];
    if (active?.agencyId) {
      return { isAdmin: false, agencyId: active.agencyId, outletIds: [] };
    }

    // No agency link — fall back to outlet membership so an outlet can read the
    // personnel rostered at its own venues.
    const outletMemberships = await this.outletMemberRepository.listByUser(user.id);
    const outletIds = [
      ...new Set(
        outletMemberships.filter((m) => m.status === 'active').map((m) => m.outletId),
      ),
    ];
    return { isAdmin: false, agencyId: null, outletIds };
  }

  async list(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      const isOutletCaller = !scope.isAdmin && !scope.agencyId && scope.outletIds.length > 0;
      if (!scope.isAdmin && !scope.agencyId && !isOutletCaller) {
        return res.status(403).json({ success: false, message: 'No agency associated with this account', data: null });
      }

      const { page, pageSize } = parsePaging(req);
      const filter: PrFilter = {
        status: req.query.status as PrStatus | undefined,
        tier: req.query.tier as PrTier | undefined,
        name: req.query.name as string | undefined,
        // Admins may optionally filter by any agency; agency users are pinned to
        // their own. An outlet has no agency — it is pinned by venue instead, so
        // it sees each staffing agency's PRs but only those who worked for it.
        agencyId: scope.isAdmin
          ? (req.query.agencyId as string | undefined)
          : (scope.agencyId ?? undefined),
        assignedToOutletIds: isOutletCaller ? scope.outletIds : undefined,
      };

      const { prs, totalCount } = await this.prRepository.listPaginated({ filter, page, pageSize });
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      res.status(200).json({
        success: true,
        message: 'OK',
        data: prs,
        pagination: { page, pageSize, totalCount, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
      });
    } catch (error) {
      logger.error('[PrController.list] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const pr = await this.prRepository.getById(paramId(req.params.id));
      if (!pr) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      // Hide existence of records outside the caller's agency (404, not 403).
      if (!scope.isAdmin && pr.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      res.status(200).json({ success: true, message: 'OK', data: pr });
    } catch (error) {
      logger.error('[PrController.getById] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const parsed = CreatePrSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const scope = await this.resolveScope(req);
      let agencyId: string;
      if (scope.isAdmin) {
        if (!parsed.data.agencyId) {
          return res.status(400).json({ success: false, message: 'agencyId is required', data: null });
        }
        agencyId = parsed.data.agencyId;
      } else {
        if (!scope.agencyId) {
          return res.status(403).json({ success: false, message: 'No agency associated with this account', data: null });
        }
        agencyId = scope.agencyId;
      }

      const actor = getActor(req);
      const pr = await this.prRepository.create({
        ...parsed.data,
        agencyId, // authoritative — overrides any client-supplied value
        status: 'active',
        createdBy: actor,
        updatedBy: actor,
      });
      res.status(201).json({ success: true, message: 'PR created', data: pr });
    } catch (error) {
      logger.error('[PrController.create] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const parsed = UpdatePrSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const existing = await this.prRepository.getById(id);
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && existing.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const data = { ...parsed.data };
      // Agency users cannot move a PR to a different agency.
      if (!scope.isAdmin) delete data.agencyId;

      const pr = await this.prRepository.update(id, { ...data, updatedBy: getActor(req) });
      if (!pr) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'PR updated', data: pr });
    } catch (error) {
      logger.error('[PrController.update] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async remove(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);

      const existing = await this.prRepository.getById(id);
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && existing.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const removed = await this.prRepository.remove(id);
      if (!removed) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'PR removed', data: null });
    } catch (error) {
      logger.error('[PrController.remove] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
