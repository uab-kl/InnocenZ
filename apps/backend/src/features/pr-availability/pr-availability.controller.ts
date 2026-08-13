import { Request, Response } from 'express';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';
import { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository';
import { AuthRepositoryClass } from '@/features/auth/auth.repository';
import { Error } from '@/error/index';
import { getActor } from '@/util/actor';
import { logger } from '@/util/logger';
import { OrgScope, resolveOrgScope } from '@/util/org-scope';
import { BlockPrDaySchema, PrAvailabilityRangeSchema } from '@/schema/pr-availability.schema';
import { PrAvailabilityRepositoryClass } from './pr-availability.repository';

export class PrAvailabilityControllerClass {
  constructor(
    private prAvailabilityRepository: PrAvailabilityRepositoryClass,
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

  /** The signed-in PR's own blocked days. Scoped to the token, never to a query param. */
  async listMine(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }
      const parsed = PrAvailabilityRangeSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const rows = await this.prAvailabilityRepository.listForUser({
        userId,
        from: parsed.data.from,
        to: parsed.data.to,
      });
      res.status(200).json({ success: true, message: 'OK', data: rows });
    } catch (error) {
      logger.error('[PrAvailabilityController.listMine] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * The PR marks one day unavailable.
   *
   * Refused when they are already working that day: the way out of a booked
   * shift is to cancel it or request leave, and letting a block stand in for
   * either would drop them off a roster the agency is still counting on with no
   * cancellation, no fee and no notification.
   */
  async blockMine(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }
      const parsed = BlockPrDaySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const { date, reason } = parsed.data;

      const booked = await this.prAvailabilityRepository.hasLiveAssignmentOn({ userId, date });
      if (booked) {
        return res.status(409).json({
          success: false,
          message: 'You are already rostered that day — cancel the shift or request leave instead',
          data: null,
        });
      }

      const row = await this.prAvailabilityRepository.block({
        userId,
        unavailableDate: date,
        reason: reason ?? null,
        actor: getActor(req),
      });
      res.status(201).json({ success: true, message: 'Day marked unavailable', data: row });
    } catch (error) {
      logger.error('[PrAvailabilityController.blockMine] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** The PR reopens a day they had blocked. */
  async unblockMine(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }
      const parsed = BlockPrDaySchema.safeParse({ date: req.params.date });
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const removed = await this.prAvailabilityRepository.unblock({
        userId,
        unavailableDate: parsed.data.date,
      });
      if (!removed) {
        return res.status(404).json({ success: false, message: 'That day was not marked unavailable', data: null });
      }
      res.status(200).json({ success: true, message: 'Day reopened', data: { date: parsed.data.date } });
    } catch (error) {
      logger.error('[PrAvailabilityController.unblockMine] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Blocked days across the calling agency's own roster, for the week grid.
   *
   * Agency (or admin) only, and scoped through `agency_pr` in the repository —
   * `pr_availability` has no `agency_id` to filter on, so the membership join IS
   * the scope. An outlet is not a reader: a PR's private calendar is their
   * agency's staffing concern, and the venue only ever sees the roster it
   * settles into.
   */
  async listForAgency(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && !scope.agencyId) {
        return res.status(403).json({ success: false, message: 'No agency associated with this account', data: null });
      }
      const parsed = PrAvailabilityRangeSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      // An admin may name an agency; anyone else gets their own, ignoring the
      // query entirely. Without the agency resolved there is nothing to scope
      // by, so an admin who names none gets an empty list rather than a read of
      // every PR's calendar on the platform.
      const agencyId = scope.isAdmin ? (req.query.agencyId as string | undefined) : scope.agencyId;
      if (!agencyId) {
        return res.status(200).json({ success: true, message: 'OK', data: [] });
      }
      const rows = await this.prAvailabilityRepository.listForAgency({
        agencyId,
        from: parsed.data.from,
        to: parsed.data.to,
        userId: req.query.prId as string | undefined,
      });
      res.status(200).json({ success: true, message: 'OK', data: rows });
    } catch (error) {
      logger.error('[PrAvailabilityController.listForAgency] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
