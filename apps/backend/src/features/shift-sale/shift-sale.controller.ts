import { Request, Response } from 'express';
import { ShiftSaleRepositoryClass } from './shift-sale.repository';
import { ShiftRepositoryClass } from '@/features/shift/shift.repository';
import { ShiftAssignmentRepositoryClass } from '@/features/shift-assignment/shift-assignment.repository';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';
import { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository';
import { AuthRepositoryClass } from '@/features/auth/auth.repository';
import { Error } from '@/error/index';
import { getActor } from '@/util/actor';
import { logger } from '@/util/logger';
import { CreateShiftSaleSchema } from '@/schema/shift-sale.schema';
import { ShiftSaleFilter } from './shift-sale.model';
import { OrgScope, resolveOrgScope, isOutletCaller } from '@/util/org-scope';

function money(value: number | undefined): string {
  return (Number.isFinite(value) && value! > 0 ? value! : 0).toFixed(2);
}

export class ShiftSaleControllerClass {
  constructor(
    private shiftSaleRepository: ShiftSaleRepositoryClass,
    private shiftRepository: ShiftRepositoryClass,
    private shiftAssignmentRepository: ShiftAssignmentRepositoryClass,
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

  /** Filter shared by list + report: pin each caller to the org it belongs to. */
  private scopedFilter(req: Request, scope: OrgScope): ShiftSaleFilter | null {
    if (isOutletCaller(scope)) {
      return {
        outletIds: scope.outletIds,
        outletId: req.query.outletId as string | undefined,
        fromDate: req.query.fromDate as string | undefined,
        toDate: req.query.toDate as string | undefined,
      };
    }
    if (scope.agencyId) {
      return {
        agencyId: scope.agencyId,
        outletId: req.query.outletId as string | undefined,
        fromDate: req.query.fromDate as string | undefined,
        toDate: req.query.toDate as string | undefined,
      };
    }
    if (scope.isAdmin) {
      return {
        agencyId: req.query.agencyId as string | undefined,
        outletId: req.query.outletId as string | undefined,
        fromDate: req.query.fromDate as string | undefined,
        toDate: req.query.toDate as string | undefined,
      };
    }
    return null;
  }

  async create(req: Request, res: Response) {
    try {
      const parsed = CreateShiftSaleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const shift = await this.shiftRepository.getById(parsed.data.shiftId);
      if (!shift) return res.status(404).json({ success: false, message: 'Shift not found', data: null });

      const scope = await this.resolveScope(req);
      // Ownership: the caller must own the shift the sale belongs to.
      const owns =
        scope.isAdmin ||
        (scope.agencyId !== null && shift.agencyId === scope.agencyId) ||
        (isOutletCaller(scope) && scope.outletIds.includes(shift.outletId));
      if (!owns) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      // The PR must actually be staffing this shift — sales cannot be attributed
      // to a PR who was never assigned, and a cancelled/no-show PR generated no
      // floor sales (the cost side already excludes those statuses, so exclude
      // them here too for symmetry).
      const assignments = await this.shiftAssignmentRepository.listByShift(shift.id);
      const isStaffing = assignments.some(
        (a) => a.prId === parsed.data.prId && a.status !== 'cancelled' && a.status !== 'no_show',
      );
      if (!isStaffing) {
        return res.status(400).json({ success: false, message: 'PR is not actively assigned to this shift', data: null });
      }

      // Total is computed server-side; the client never dictates the sum.
      const drinkSalesRm = parsed.data.drinkSalesRm ?? 0;
      const tipSalesRm = parsed.data.tipSalesRm ?? 0;
      const totalSalesRm = drinkSalesRm + tipSalesRm;

      const actor = getActor(req);
      const sale = await this.shiftSaleRepository.upsert({
        shiftId: shift.id,
        prId: parsed.data.prId,
        // Derived from the shift — authoritative, cannot be forged by the client.
        outletId: shift.outletId,
        agencyId: shift.agencyId,
        soldOn: shift.shiftDate,
        drinkUnits: parsed.data.drinkUnits ?? 0,
        drinkSalesRm: money(drinkSalesRm),
        tipUnits: parsed.data.tipUnits ?? 0,
        tipSalesRm: money(tipSalesRm),
        totalSalesRm: money(totalSalesRm),
        createdBy: actor,
        updatedBy: actor,
      });
      if (!sale) return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      res.status(201).json({ success: true, message: 'Sale logged', data: sale });
    } catch (error) {
      logger.error('[ShiftSaleController.create] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      const filter = this.scopedFilter(req, scope);
      if (!filter) {
        return res.status(403).json({ success: false, message: 'No organization associated with this account', data: null });
      }
      filter.shiftId = req.query.shiftId as string | undefined;
      const sales = await this.shiftSaleRepository.list(filter);
      res.status(200).json({ success: true, message: 'OK', data: sales });
    } catch (error) {
      logger.error('[ShiftSaleController.list] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async report(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      const filter = this.scopedFilter(req, scope);
      if (!filter) {
        return res.status(403).json({ success: false, message: 'No organization associated with this account', data: null });
      }
      // Revenue (shift_sale) and cost (shift_assignment.pay_amount) are both
      // aggregated server-side over the same scope, so the client never has to
      // page through raw assignment rows to compute margin. Cost stays at
      // (PR × day) grain so the client can slice it to the selected range.
      const [byDay, byPr, costByPrDay] = await Promise.all([
        this.shiftSaleRepository.reportByDay(filter),
        this.shiftSaleRepository.reportByPr(filter),
        this.shiftAssignmentRepository.reportCostByPrDay(filter),
      ]);
      res.status(200).json({ success: true, message: 'OK', data: { byDay, byPr, costByPrDay } });
    } catch (error) {
      logger.error('[ShiftSaleController.report] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
