import { Request, Response } from 'express';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';
import { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository';
import { AuthRepositoryClass } from '@/features/auth/auth.repository';
import { Error } from '@/error/index';
import { getActor } from '@/util/actor';
import { logger } from '@/util/logger';
import { OrgScope, resolveOrgScope } from '@/util/org-scope';
import { BlockPrDaySchema, PrAvailabilityRangeSchema } from '@/schema/pr-availability.schema';
import { AgencyOutletRepository } from '@/features/agency/agency-outlet.repository.js';
import { PrAvailabilityRepositoryClass } from './pr-availability.repository';

export class PrAvailabilityControllerClass {
  constructor(
    private prAvailabilityRepository: PrAvailabilityRepositoryClass,
    private agencyMemberRepository: AgencyMemberRepositoryClass,
    private authRepository: AuthRepositoryClass,
    private outletMemberRepository: OutletMemberRepositoryClass,
    private agencyOutletRepository: AgencyOutletRepository,
  ) {}

  private resolveScope(req: Request): Promise<OrgScope> {
    return resolveOrgScope(req, {
      authRepository: this.authRepository,
      agencyMemberRepository: this.agencyMemberRepository,
      outletMemberRepository: this.outletMemberRepository,
    });
  }

  /**
   * WHEN the outlet's pool is spoken for — times only (0131 companion read).
   *
   * The venue's half of the cross-agency busy rule: it may know a PR's hours
   * are taken so it does not post a job at them, and it may know NOTHING
   * else — the rows leaving here carry userId, date and a bare HH:MM window
   * (canonicalWindow upstream), never an agency or a venue. Scoped to the
   * agencies APPROVED for the caller's own outlets, so a venue cannot read
   * the movements of people it has no link to.
   */
  async listCommittedForOutlet(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      const outletIds = scope.isAdmin
        ? [req.query.outletId as string].filter(Boolean)
        : (scope.outletIds ?? []);
      if (!scope.isAdmin && outletIds.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'No outlet associated with this account',
          data: null,
        });
      }
      const parsed = PrAvailabilityRangeSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message,
          data: null,
        });
      }
      const agencyIds = new Set<string>();
      for (const outletId of outletIds) {
        const approved =
          await this.agencyOutletRepository.listApprovedAgencyIdsForOutlet(
            outletId,
          );
        for (const id of approved) agencyIds.add(id);
      }
      if (agencyIds.size === 0) {
        return res.status(200).json({ success: true, message: 'OK', data: [] });
      }
      const rows = await this.prAvailabilityRepository.listCommittedWindows({
        agencyIds: [...agencyIds],
        from: parsed.data.from,
        to: parsed.data.to,
      });
      // One person can surface via two memberships; the venue asked about
      // the PERSON, so identical (person, day, window) rows collapse.
      const seen = new Set<string>();
      const deduped = rows.filter((r) => {
        const key = `${r.userId}|${r.date}|${r.slot ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      res.status(200).json({ success: true, message: 'OK', data: deduped });
    } catch (error) {
      logger.error('[PrAvailabilityController.listCommittedForOutlet] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
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
   * WHEN this agency's roster is already committed elsewhere — the week grid's
   * "unavailable at that time" markers.
   *
   * Deliberately a SEPARATE endpoint from `listForAgency`, not a second array on
   * it. The two answer different questions: that one lists days the PR blocked
   * HERSELF, which is a `pr_availability` row with her own reason; this one lists
   * time WINDOWS derived from other agencies' bookings, which is not a row at all
   * and carries no reason. Folding derived entries into that feed once already
   * produced a list whose halves had to be made indistinguishable field by field.
   *
   * Same guard as its sibling: agency or admin, scoped in the repository through
   * `agency_pr`. An outlet is not a reader — a PR's commitments elsewhere are
   * their agency's staffing concern, never the venue's.
   */
  async listCommittedForAgency(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && !scope.agencyId) {
        return res.status(403).json({ success: false, message: 'No agency associated with this account', data: null });
      }
      const parsed = PrAvailabilityRangeSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      // Same rule as the sibling read: an admin may name an agency, anyone else
      // gets their own, and an admin who names none gets nothing rather than a
      // read across every agency on the platform.
      const agencyId = scope.isAdmin ? (req.query.agencyId as string | undefined) : scope.agencyId;
      if (!agencyId) {
        return res.status(200).json({ success: true, message: 'OK', data: [] });
      }
      const rows = await this.prAvailabilityRepository.listCommittedWindows({
        agencyId,
        from: parsed.data.from,
        to: parsed.data.to,
        userId: req.query.prId as string | undefined,
      });
      res.status(200).json({ success: true, message: 'OK', data: rows });
    } catch (error) {
      logger.error('[PrAvailabilityController.listCommittedForAgency] Error:', error);
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

      /*
       * ⚠️ THE DERIVED "COMMITTED ELSEWHERE" DAY-BLOCKS ARE GONE (owner's change,
       * 20 Aug 2026). `listCommittedElsewhere` is deliberately LEFT in the
       * repository rather than deleted — read this before re-wiring it.
       *
       * They existed to serve the DAY rule: a shift at any agency took that whole
       * calendar day off the market for every other agency, so the picker greyed
       * the day and the assign guard refused it — preview and action agreeing, as
       * they must. The rule is now the shift's own window PLUS the travel time
       * between the two venues, and nothing else. The day is no longer the unit of
       * anything.
       *
       * Left as day-blocks they would now be the WRONG half of that pair. A PR
       * booked 15:00–04:00 elsewhere is genuinely free that morning, and greying
       * the whole day would refuse IN THE INTERFACE exactly the bookings the new
       * rule exists to allow — the owner's instruction defeated by the preview
       * instead of by the guard.
       *
       * What is lost is early warning, and it is worth stating plainly: the planner
       * can now propose a time the assign guard will refuse. That is the lesser of
       * the two faults — a refusal at Confirm costs a click, a greyed day costs the
       * PR the shift — but the real repair is to preview the WINDOWS rather than
       * the days, and `listCommittedElsewhere` is the query to build that on, which
       * is why it stays. Anything reinstated here must keep the anonymity work
       * already inside it: no agency, no venue, and no separable row shape.
       */
      // The declared blocks ARE the answer now — nothing is appended.
      const merged = rows;

      res.status(200).json({ success: true, message: 'OK', data: merged });
    } catch (error) {
      logger.error('[PrAvailabilityController.listForAgency] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
