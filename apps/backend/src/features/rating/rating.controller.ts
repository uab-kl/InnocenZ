import { Request, Response } from 'express';
import { RatingRepositoryClass } from './rating.repository.js';
import { RatingFilter } from './rating.model.js';
import { PrRepositoryClass } from '@/features/pr/pr.repository.js';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository.js';
import { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository.js';
import { AuthRepositoryClass } from '@/features/auth/auth.repository.js';
import { CreateRatingSchema } from '@/schema/rating.schema.js';
import { Error } from '@/error/index.js';
import { getActor } from '@/util/actor.js';
import { logger } from '@/util/logger.js';
import { OrgScope, resolveOrgScope, isOutletCaller } from '@/util/org-scope.js';

export class RatingControllerClass {
  constructor(
    private repository: RatingRepositoryClass,
    private prRepository: PrRepositoryClass,
    private agencyMemberRepository: AgencyMemberRepositoryClass,
    private authRepository: AuthRepositoryClass,
    private outletMemberRepository: OutletMemberRepositoryClass,
  ) {}

  private resolveScope(req: Request): Promise<OrgScope> {
    return resolveOrgScope(req, {
      authRepository: this.authRepository,
      agencyMemberRepository: this.agencyMemberRepository,
      outletMemberRepository: this.outletMemberRepository,
    });
  }

  /**
   * Pin the caller to the ratings its own org owns. `null` means the account
   * belongs to no org at all, which is a 403 rather than an unscoped read.
   *
   * The role gate in front decides WHO may call this; this decides WHICH rows
   * come back. Without it the shared role would hand every outlet's ratings to
   * every outlet, since `list` takes its filter straight from the query string.
   */
  private async scopedFilter(req: Request, scope: OrgScope): Promise<RatingFilter | null> {
    const outletId = req.query.outletId as string | undefined;
    const prId = req.query.prId as string | undefined;

    if (scope.isAdmin) return { outletId, prId };

    // A venue operator reads the ratings written at its own venues.
    if (isOutletCaller(scope)) return { outletIds: scope.outletIds, outletId, prId };

    // An agency holds no outlet membership, and `rating.pr_id` is not a FK, so
    // the only honest agency link runs through the PR: an agency sees ratings of
    // its own PRs, whichever venue wrote them. A PR id the frontend invented
    // rather than a real `pr.id` simply will not match, which under-reports
    // instead of leaking.
    if (scope.agencyId) {
      const prIds = await this.prRepository.listIdsByAgency(scope.agencyId);
      return { prIds, outletId, prId };
    }

    return null;
  }

  async list(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      const filter = await this.scopedFilter(req, scope);
      if (!filter) {
        return res.status(403).json({
          success: false,
          message: 'No organization associated with this account',
          data: null,
        });
      }
      const records = await this.repository.list(filter);
      res.status(200).json({ success: true, message: 'OK', data: records });
    } catch (error) {
      logger.error('[RatingController.list] Error:', error);
      res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async upsert(req: Request, res: Response) {
    try {
      const parsed = CreateRatingSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      // The route gate says an outlet may rate; this says WHICH outlet. outletId
      // arrives in the request body, so without this an operator at one venue
      // could file a rating under another venue's id — and since the unique key
      // is (outlet, PR), that would overwrite the other venue's real rating.
      const scope = await this.resolveScope(req);
      const ownsOutlet = scope.isAdmin || scope.outletIds.includes(parsed.data.outletId);
      if (!ownsOutlet) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const actor = getActor(req);
      const record = await this.repository.upsert(
        {
          outletId: parsed.data.outletId,
          prId: parsed.data.prId,
          prName: parsed.data.prName,
          stars: parsed.data.stars,
          note: parsed.data.note,
          tags: parsed.data.tags,
        },
        actor,
      );
      if (!record) {
        return res
          .status(500)
          .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      }
      res.status(201).json({ success: true, message: 'Rating saved', data: record });
    } catch (error) {
      logger.error('[RatingController.upsert] Error:', error);
      res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
