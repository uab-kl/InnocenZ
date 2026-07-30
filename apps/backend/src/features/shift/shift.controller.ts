import { Request, Response } from 'express';
import { ShiftRepositoryClass } from './shift.repository';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';
import { OutletRepositoryClass } from '@/features/outlet/outlet.repository';
import { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository';
import { AuthRepositoryClass } from '@/features/auth/auth.repository';
import { Error } from '@/error/index';
import { paramId, uuidParam } from '@/util/params';
import { getActor } from '@/util/actor';
import { logger } from '@/util/logger';
import { CreateShiftSchema, UpdateShiftSchema } from '@/schema/shift.schema';
import { ShiftFilter, ShiftStatus, ShiftEventKind } from './shift.model';
import { OrgScope, resolveOrgScope, isOutletCaller } from '@/util/org-scope';
import { ShiftAssignmentRepositoryClass } from '@/features/shift-assignment/shift-assignment.repository';
import { shiftsOverlap, shiftDayKey } from '@/util/slot-window';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

function parsePaging(req: Request): { page: number; pageSize: number } {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE));
  return { page, pageSize };
}

export class ShiftControllerClass {
  constructor(
    private shiftRepository: ShiftRepositoryClass,
    private agencyMemberRepository: AgencyMemberRepositoryClass,
    private authRepository: AuthRepositoryClass,
    private outletMemberRepository: OutletMemberRepositoryClass,
    private outletRepository: OutletRepositoryClass,
    // Only for the double-booking check on a timing edit — a shift moving in
    // time is the mirror of assigning into a clash, so both ends need to see
    // the same assignments.
    private shiftAssignmentRepository: ShiftAssignmentRepositoryClass,
  ) {}

  /** True when the caller is an outlet operator (no admin/agency scope, ≥1 outlet). */
  private isOutletCaller(scope: OrgScope): boolean {
    return isOutletCaller(scope);
  }

  private resolveScope(req: Request): Promise<OrgScope> {
    return resolveOrgScope(req, {
      authRepository: this.authRepository,
      agencyMemberRepository: this.agencyMemberRepository,
      outletMemberRepository: this.outletMemberRepository,
    });
  }

  async list(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      const isOutletCaller = this.isOutletCaller(scope);
      if (!scope.isAdmin && !scope.agencyId && !isOutletCaller) {
        return res.status(403).json({ success: false, message: 'No agency associated with this account', data: null });
      }

      const { page, pageSize } = parsePaging(req);
      const filter: ShiftFilter = {
        outletId: req.query.outletId as string | undefined,
        status: req.query.status as ShiftStatus | undefined,
        eventKind: req.query.eventKind as ShiftEventKind | undefined,
        fromDate: req.query.fromDate as string | undefined,
        toDate: req.query.toDate as string | undefined,
        agencyId: scope.isAdmin ? (req.query.agencyId as string | undefined) : (scope.agencyId ?? undefined),
        // Pins an outlet caller to its own venues; a supplied ?outletId still
        // narrows further but can never widen past this set.
        outletIds: isOutletCaller ? scope.outletIds : undefined,
      };

      const { shifts, totalCount } = await this.shiftRepository.listPaginated({ filter, page, pageSize });
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      res.status(200).json({
        success: true,
        message: 'OK',
        data: shifts,
        pagination: { page, pageSize, totalCount, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
      });
    } catch (error) {
      logger.error('[ShiftController.list] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      // A non-uuid cannot match a row, and handing one to Postgres 500s — so it
      // is answered as what it is: not found. See uuidParam().
      const shiftId = uuidParam(req.params.id);
      const shift = shiftId ? await this.shiftRepository.getById(shiftId) : null;
      if (!shift) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      // Hide existence of records outside the caller's scope (404, not 403).
      // An outlet caller is matched on the shift's outlet rather than its agency.
      const visible =
        scope.isAdmin ||
        (scope.agencyId !== null && shift.agencyId === scope.agencyId) ||
        scope.outletIds.includes(shift.outletId);
      if (!visible) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      // Fold in the per-shift pay-tier overrides so the outlet portal can render
      // and re-edit exactly what it posted (empty when it uses workspace defaults).
      const payTiers = await this.shiftRepository.listPayTiersForShift(shift.id);
      res.status(200).json({ success: true, message: 'OK', data: { ...shift, payTiers } });
    } catch (error) {
      logger.error('[ShiftController.getById] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const parsed = CreateShiftSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const scope = await this.resolveScope(req);
      let agencyId: string;
      let outletId = parsed.data.outletId;
      // An outlet posting a job is committing to run it, so it goes straight to
      // `confirmed` — it shows up immediately as tonight's live shift (Today) and
      // as a confirmed event (Calendar). Admin/agency creates keep the table
      // default (`draft`). The client cannot set status; this is authoritative.
      let postedStatus: 'confirmed' | undefined;
      if (scope.isAdmin) {
        if (!parsed.data.agencyId) {
          return res.status(400).json({ success: false, message: 'agencyId is required', data: null });
        }
        agencyId = parsed.data.agencyId;
      } else if (scope.agencyId) {
        agencyId = scope.agencyId;
      } else if (this.isOutletCaller(scope)) {
        // Outlet posts a job at one of its own venues; the PR request is routed
        // to the agency that onboarded that outlet. Any client-supplied agencyId
        // is ignored — the routing is authoritative and cannot be forged.
        if (!scope.outletIds.includes(outletId)) {
          return res.status(403).json({ success: false, message: 'You can only create shifts for your own outlet', data: null });
        }
        const outlet = await this.outletRepository.getById(outletId);
        if (!outlet?.onboardedByAgencyId) {
          return res.status(400).json({ success: false, message: 'This outlet has no onboarding agency to request PR from', data: null });
        }
        agencyId = outlet.onboardedByAgencyId;
        postedStatus = 'confirmed';
      } else {
        return res.status(403).json({ success: false, message: 'No organization associated with this account', data: null });
      }

      const actor = getActor(req);
      // payTiers is a child-table override, not a shift column — keep it out of
      // the shift insert and persist it alongside in one transaction.
      const { payTiers, ...shiftData } = parsed.data;
      const shift = await this.shiftRepository.createWithPayTiers(
        {
          ...shiftData,
          agencyId, // authoritative — overrides any client-supplied value
          ...(postedStatus ? { status: postedStatus } : {}),
          createdBy: actor,
          updatedBy: actor,
        },
        payTiers,
        actor,
      );
      res.status(201).json({ success: true, message: 'Shift created', data: shift });
    } catch (error) {
      logger.error('[ShiftController.create] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const parsed = UpdateShiftSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const existing = await this.shiftRepository.getById(id);
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      const isOutlet = this.isOutletCaller(scope);
      // Hide records outside the caller's scope (404, not 403). An outlet is
      // matched on the shift's outlet; an agency on the shift's agency.
      const owns =
        scope.isAdmin ||
        (scope.agencyId !== null && existing.agencyId === scope.agencyId) ||
        (isOutlet && scope.outletIds.includes(existing.outletId));
      if (!owns) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const { payTiers, ...data } = parsed.data;
      // Agency users cannot move a shift to a different agency.
      if (!scope.isAdmin) delete data.agencyId;
      // Outlets cannot move a shift to a different venue.
      if (isOutlet) delete data.outletId;

      // Moving a shift's time is the OTHER way a PR gets double-booked.
      // Assigning already refuses a clash (shift-assignment create), but nothing
      // stopped an edit from dragging this shift on top of another one the same
      // PR already works — same outcome, opposite direction, and it lands
      // silently because nobody is assigning anything at that moment.
      const nextSlot = data.slot === undefined ? existing.slot : data.slot;
      const nextDate = data.shiftDate === undefined ? existing.shiftDate : data.shiftDate;
      const timingChanged =
        (data.slot !== undefined && data.slot !== existing.slot) ||
        (data.shiftDate !== undefined &&
          shiftDayKey(nextDate) !== shiftDayKey(existing.shiftDate));

      if (timingChanged) {
        const assigned = await this.shiftAssignmentRepository.listByShift(id);
        const live = assigned.filter(
          (a) => !['cancelled', 'no_show', 'leave_approved'].includes(a.status),
        );
        for (const a of live) {
          const others = await this.shiftAssignmentRepository.listForPr(a.prId);
          const clash = others.find(
            (o) =>
              o.shiftId !== id &&
              !['cancelled', 'no_show', 'leave_approved'].includes(o.status) &&
              shiftsOverlap(nextDate, nextSlot, o.shiftDate, o.slot),
          );
          if (clash) {
            return res.status(400).json({
              success: false,
              message: `That time clashes for a PR on this shift — they already work ${clash.slot ?? 'a shift'} at ${clash.outletName ?? 'another outlet'} that day. Move the other shift first, or unassign them here.`,
              data: null,
            });
          }
        }
      }

      const actor = getActor(req);
      const shift = await this.shiftRepository.updateWithPayTiers(
        id,
        { ...data, updatedBy: actor },
        payTiers,
        actor,
      );
      if (!shift) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Shift updated', data: shift });
    } catch (error) {
      logger.error('[ShiftController.update] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async remove(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);

      const existing = await this.shiftRepository.getById(id);
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      const owns =
        scope.isAdmin ||
        (scope.agencyId !== null && existing.agencyId === scope.agencyId) ||
        (this.isOutletCaller(scope) && scope.outletIds.includes(existing.outletId));
      if (!owns) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const removed = await this.shiftRepository.remove(id);
      if (!removed) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Shift removed', data: null });
    } catch (error) {
      logger.error('[ShiftController.remove] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
