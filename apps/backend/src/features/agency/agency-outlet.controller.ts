import type { Request, Response } from 'express';
import type { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';
import type { AgencyOutletRepository } from '@/features/agency/agency-outlet.repository';
import type { AgencyPrRepository } from '@/features/agency/agency-pr.repository';
import type { AuthRepositoryClass } from '@/features/auth/auth.repository';
import type { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository';
import {
  DecideOutletLinkSchema,
  ListAgencyOutletLinksQuerySchema,
  SyncOutletAgenciesSchema,
} from '@/schema/agency-outlet.schema';
import { getActor } from '@/util/actor';
import { logger } from '@/util/logger';
import { isOutletCaller, resolveOrgScope, type OrgScope } from '@/util/org-scope';

/**
 * Agency ↔ outlet linking endpoints.
 *
 * Deliberately its OWN router rather than more paths on `/agency/:id/...`.
 * Every route here derives the caller's org from the session (`resolveOrgScope`,
 * which reads the DB) instead of taking an id from the URL, so there is no
 * `:agencyId` to forget to scope-check. The agency router already carries a
 * logged P0 where five read paths take an `:id` and never verify the caller
 * belongs to it — a PR token read a foreign agency's roster that way. This
 * surface cannot grow that bug, because it never asks who you are.
 */
export class AgencyOutletControllerClass {
  constructor(
    private readonly agencyOutletRepository: AgencyOutletRepository,
    private readonly agencyPrRepository: AgencyPrRepository,
    private readonly authRepository: AuthRepositoryClass,
    private readonly agencyMemberRepository: AgencyMemberRepositoryClass,
    private readonly outletMemberRepository: OutletMemberRepositoryClass,
  ) {}

  /**
   * One route param as a plain string.
   *
   * Express types params as `string | string[]`. A cast would compile and then
   * hand `"a,b"` to a uuid comparison, which matches nothing and 404s with no
   * hint why; taking the first element keeps a repeated param honest.
   */
  private param(req: Request, name: string): string {
    const raw = req.params[name] as string | string[] | undefined;
    return Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
  }

  private resolveScope(req: Request): Promise<OrgScope> {
    return resolveOrgScope(req, {
      authRepository: this.authRepository,
      agencyMemberRepository: this.agencyMemberRepository,
      outletMemberRepository: this.outletMemberRepository,
    });
  }

  /**
   * Which of the caller's OWN venues this request is about.
   *
   * Returns an error rather than guessing. An operator holding two venues who
   * omits `outletId` gets a 400 asking which — silently picking the first would
   * let someone rewrite one venue's agency list believing they were editing the
   * other's, and the screen would look right afterwards.
   */
  private resolveOwnOutletId(
    scope: OrgScope,
    requested?: string,
  ): { outletId: string } | { error: { status: number; message: string } } {
    if (!isOutletCaller(scope)) {
      return { error: { status: 403, message: 'Only an outlet can manage its agency links' } };
    }
    if (requested) {
      if (!scope.outletIds.includes(requested)) {
        return { error: { status: 403, message: 'You can only manage your own outlet' } };
      }
      return { outletId: requested };
    }
    if (scope.outletIds.length === 1) return { outletId: scope.outletIds[0] };
    return {
      error: { status: 400, message: 'Specify which outlet — this account holds several' },
    };
  }

  /**
   * Outlet Settings — the agencies a venue can choose from.
   *
   * Name + code only. An outlet is barred from `GET /agency` because it must
   * not enumerate full agency records; this is the narrow slice it genuinely
   * needs in order to pick a partner, and nothing more.
   */
  async directory(_req: Request, res: Response) {
    try {
      const agencies = await this.agencyOutletRepository.listDirectory();
      return res.json({ success: true, message: 'Agency directory', data: agencies });
    } catch (error) {
      logger.error('[AgencyOutletController.directory] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to load agencies', data: null });
    }
  }

  /** Outlet Settings — every agency this venue is linked to, in any state. */
  async listMine(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      const resolved = this.resolveOwnOutletId(scope, req.query.outletId as string | undefined);
      if ('error' in resolved) {
        return res
          .status(resolved.error.status)
          .json({ success: false, message: resolved.error.message, data: null });
      }

      const links = await this.agencyOutletRepository.listByOutlet(resolved.outletId);
      return res.json({ success: true, message: 'Agency links', data: links });
    } catch (error) {
      logger.error('[AgencyOutletController.listMine] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to load agency links', data: null });
    }
  }

  /**
   * Outlet Settings — set this venue's agency list.
   *
   * New links land `pending`; existing ones keep whatever the agency already
   * decided (see `syncLinksForOutlet`), so re-saving this screen never bumps an
   * approved partner back into the queue.
   */
  async syncMine(req: Request, res: Response) {
    try {
      const parsed = SyncOutletAgenciesSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const scope = await this.resolveScope(req);
      const resolved = this.resolveOwnOutletId(scope, parsed.data.outletId);
      if ('error' in resolved) {
        return res
          .status(resolved.error.status)
          .json({ success: false, message: resolved.error.message, data: null });
      }

      // Refuse unknown agency ids outright rather than silently dropping them:
      // a half-succeeding save is worse than a failing one, because the venue
      // sees a shorter list than it submitted and nothing says why.
      //
      // Reuses `filterExistingAgencyIds` rather than paging `agency.list()`.
      // That list endpoint clamps `pageSize` — asking for 500 returns 100 with
      // no error — so a membership check built on it would start rejecting
      // valid agencies the moment the platform passed 100 of them.
      const wanted = [...new Set(parsed.data.agencyIds)];
      if (wanted.length > 0) {
        const known = await this.agencyPrRepository.filterExistingAgencyIds(wanted);
        if (known.length !== wanted.length) {
          return res
            .status(400)
            .json({ success: false, message: 'One or more agencies do not exist', data: null });
        }
      }

      await this.agencyOutletRepository.syncLinksForOutlet(resolved.outletId, wanted, getActor(req));
      const links = await this.agencyOutletRepository.listByOutlet(resolved.outletId);
      return res.json({ success: true, message: 'Agency links updated', data: links });
    } catch (error) {
      logger.error('[AgencyOutletController.syncMine] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to update agency links', data: null });
    }
  }

  /** Outlet-Linking tab — venues linked to (or asking to link to) MY agency. */
  async listForMyAgency(req: Request, res: Response) {
    try {
      const parsed = ListAgencyOutletLinksQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const scope = await this.resolveScope(req);
      if (!scope.agencyId) {
        return res
          .status(403)
          .json({ success: false, message: 'No agency associated with this account', data: null });
      }

      const links = await this.agencyOutletRepository.listByAgency(scope.agencyId, {
        approveStatus: parsed.data.approveStatus,
        search: parsed.data.search,
      });
      return res.json({ success: true, message: 'Outlet links', data: links });
    } catch (error) {
      logger.error('[AgencyOutletController.listForMyAgency] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to load outlet links', data: null });
    }
  }

  /** Outlet-Linking tab — approve or reject one venue's request. */
  async decide(req: Request, res: Response) {
    try {
      const parsed = DecideOutletLinkSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const scope = await this.resolveScope(req);
      if (!scope.agencyId) {
        return res
          .status(403)
          .json({ success: false, message: 'No agency associated with this account', data: null });
      }

      // Scoped by the SESSION's agency, never by anything in the URL — the
      // `:outletId` names the venue, not the agency doing the deciding.
      const row = await this.agencyOutletRepository.setApproveStatus(
        scope.agencyId,
        this.param(req, 'outletId'),
        parsed.data.approveStatus,
        getActor(req),
        parsed.data.rejectReason,
      );
      if (!row) {
        return res
          .status(404)
          .json({ success: false, message: 'No link request from this outlet', data: null });
      }
      return res.json({ success: true, message: `Outlet ${parsed.data.approveStatus}`, data: row });
    } catch (error) {
      logger.error('[AgencyOutletController.decide] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to update the link', data: null });
    }
  }

  /**
   * Agency drops a venue it had accepted.
   *
   * Removes only the link row. Shifts already posted to this agency hold their
   * own FK and are untouched — this means "send me no more work from here", not
   * "erase what we did together".
   */
  async unlink(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      if (!scope.agencyId) {
        return res
          .status(403)
          .json({ success: false, message: 'No agency associated with this account', data: null });
      }

      const removed = await this.agencyOutletRepository.removeLink(
        scope.agencyId,
        this.param(req, 'outletId'),
      );
      if (!removed) {
        return res.status(404).json({ success: false, message: 'Link not found', data: null });
      }
      return res.json({ success: true, message: 'Outlet unlinked', data: null });
    } catch (error) {
      logger.error('[AgencyOutletController.unlink] Error:', error);
      return res.status(500).json({ success: false, message: 'Failed to unlink', data: null });
    }
  }
}
