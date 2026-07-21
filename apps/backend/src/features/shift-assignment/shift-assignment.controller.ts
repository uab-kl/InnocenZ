import { Request, Response } from 'express';
import { ShiftAssignmentRepositoryClass } from './shift-assignment.repository';
import { ShiftRepositoryClass } from '@/features/shift/shift.repository';
import { PrRepositoryClass } from '@/features/pr/pr.repository';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';
import { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository';
import { AuthRepositoryClass } from '@/features/auth/auth.repository';
import { Error } from '@/error/index';
import { paramId } from '@/util/params';
import { getActor } from '@/util/actor';
import { logger } from '@/util/logger';
import {
  CreateShiftAssignmentSchema,
  UpdateShiftAssignmentSchema,
} from '@/schema/shift-assignment.schema';
import { ShiftAssignmentFilter, ShiftAssignmentStatus } from './shift-assignment.model';
import { OrgScope, resolveOrgScope, isOutletCaller } from '@/util/org-scope';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;
const PG_UNIQUE_VIOLATION = '23505';

function parsePaging(req: Request): { page: number; pageSize: number } {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE));
  return { page, pageSize };
}

// Drizzle wraps the pg error, so the SQLSTATE lives on `error.cause.code`, not `error.code`.
function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === PG_UNIQUE_VIOLATION || e?.cause?.code === PG_UNIQUE_VIOLATION;
}

export class ShiftAssignmentControllerClass {
  constructor(
    private shiftAssignmentRepository: ShiftAssignmentRepositoryClass,
    private shiftRepository: ShiftRepositoryClass,
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

  async list(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      const outletCaller = isOutletCaller(scope);
      if (!scope.isAdmin && !scope.agencyId && !outletCaller) {
        return res.status(403).json({ success: false, message: 'No agency associated with this account', data: null });
      }

      const { page, pageSize } = parsePaging(req);
      const filter: ShiftAssignmentFilter = {
        shiftId: req.query.shiftId as string | undefined,
        prId: req.query.prId as string | undefined,
        status: req.query.status as ShiftAssignmentStatus | undefined,
        // An outlet caller has no agency of its own — the shifts at its venues
        // belong to whichever agency staffed them.
        agencyId: scope.isAdmin
          ? (req.query.agencyId as string | undefined)
          : (scope.agencyId ?? undefined),
        // Pins an outlet caller to its own venues, matched on the joined shift.
        outletIds: outletCaller ? scope.outletIds : undefined,
      };

      const { assignments, totalCount } = await this.shiftAssignmentRepository.listPaginated({ filter, page, pageSize });
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      res.status(200).json({
        success: true,
        message: 'OK',
        data: assignments,
        pagination: { page, pageSize, totalCount, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
      });
    } catch (error) {
      logger.error('[ShiftAssignmentController.list] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const assignment = await this.shiftAssignmentRepository.getById(paramId(req.params.id));
      if (!assignment) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      // Hide existence of records outside the caller's scope (404, not 403). An
      // outlet caller is matched on the shift's outlet rather than the agency.
      let visible = scope.isAdmin || (scope.agencyId !== null && assignment.agencyId === scope.agencyId);
      if (!visible && scope.outletIds.length > 0) {
        const shift = await this.shiftRepository.getById(assignment.shiftId);
        visible = shift !== null && scope.outletIds.includes(shift.outletId);
      }
      if (!visible) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      res.status(200).json({ success: true, message: 'OK', data: assignment });
    } catch (error) {
      logger.error('[ShiftAssignmentController.getById] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const parsed = CreateShiftAssignmentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && !scope.agencyId) {
        return res.status(403).json({ success: false, message: 'No agency associated with this account', data: null });
      }

      // The shift is the authority for the assignment's agency; verify the caller owns it.
      const shift = await this.shiftRepository.getById(parsed.data.shiftId);
      if (!shift) return res.status(404).json({ success: false, message: 'Shift not found', data: null });
      if (!scope.isAdmin && shift.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: 'Shift not found', data: null });
      }

      // The PR must belong to the same agency as the shift.
      const pr = await this.prRepository.getById(parsed.data.prId);
      if (!pr) return res.status(404).json({ success: false, message: 'PR not found', data: null });
      if (pr.agencyId !== shift.agencyId) {
        return res.status(400).json({ success: false, message: 'PR belongs to a different agency', data: null });
      }

      const actor = getActor(req);
      const assignment = await this.shiftAssignmentRepository.create({
        shiftId: shift.id,
        prId: pr.id,
        agencyId: shift.agencyId, // authoritative — derived from the shift
        status: parsed.data.status ?? 'assigned',
        payAmount: parsed.data.payAmount,
        checkInAt: parsed.data.checkInAt ? new Date(parsed.data.checkInAt) : undefined,
        checkOutAt: parsed.data.checkOutAt ? new Date(parsed.data.checkOutAt) : undefined,
        notes: parsed.data.notes,
        createdBy: actor,
        updatedBy: actor,
      });
      res.status(201).json({ success: true, message: 'PR assigned to shift', data: assignment });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({ success: false, message: 'PR is already assigned to this shift', data: null });
      }
      logger.error('[ShiftAssignmentController.create] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const parsed = UpdateShiftAssignmentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const existing = await this.shiftAssignmentRepository.getById(id);
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && existing.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const assignment = await this.shiftAssignmentRepository.update(id, {
        status: parsed.data.status,
        payAmount: parsed.data.payAmount,
        checkInAt: parsed.data.checkInAt ? new Date(parsed.data.checkInAt) : undefined,
        checkOutAt: parsed.data.checkOutAt ? new Date(parsed.data.checkOutAt) : undefined,
        notes: parsed.data.notes,
        updatedBy: getActor(req),
      });
      if (!assignment) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Assignment updated', data: assignment });
    } catch (error) {
      logger.error('[ShiftAssignmentController.update] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async remove(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);

      const existing = await this.shiftAssignmentRepository.getById(id);
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && existing.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const removed = await this.shiftAssignmentRepository.remove(id);
      if (!removed) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'PR unassigned from shift', data: null });
    } catch (error) {
      logger.error('[ShiftAssignmentController.remove] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
