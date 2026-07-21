import { Request, Response } from 'express';
import { ShiftRepositoryClass } from './shift.repository';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';
import { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository';
import { AuthRepositoryClass } from '@/features/auth/auth.repository';
import { Error } from '@/error/index';
import { paramId } from '@/util/params';
import { getActor } from '@/util/actor';
import { logger } from '@/util/logger';
import { CreateShiftSchema, UpdateShiftSchema } from '@/schema/shift.schema';
import { ShiftFilter, ShiftStatus, ShiftEventKind } from './shift.model';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

/**
 * A caller is scoped one of three ways: admin (everything), agency member
 * (their agency's shifts), or outlet member (their own outlets' shifts, read
 * only). `outletIds` is empty for non-outlet callers.
 */
type Scope = { isAdmin: boolean; agencyId: string | null; outletIds: string[] };

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
  ) {}

  /**
   * Admins see everything; every other caller is confined to the org they belong
   * to (resolved from the DB, never trusted from the request body). Agency
   * membership wins when a user somehow holds both.
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
    // shifts booked at its own venues.
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
      const shift = await this.shiftRepository.getById(paramId(req.params.id));
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
      // payTiers is a child-table override, not a shift column — keep it out of
      // the shift insert and persist it alongside in one transaction.
      const { payTiers, ...shiftData } = parsed.data;
      const shift = await this.shiftRepository.createWithPayTiers(
        {
          ...shiftData,
          agencyId, // authoritative — overrides any client-supplied value
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
      if (!scope.isAdmin && existing.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const { payTiers, ...data } = parsed.data;
      // Agency users cannot move a shift to a different agency.
      if (!scope.isAdmin) delete data.agencyId;

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
      if (!scope.isAdmin && existing.agencyId !== scope.agencyId) {
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
