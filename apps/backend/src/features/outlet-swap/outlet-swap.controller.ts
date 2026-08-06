import { Request, Response } from 'express';
import { ShiftAssignmentRepositoryClass } from '@/features/shift-assignment/shift-assignment.repository';
import { ShiftRepositoryClass } from '@/features/shift/shift.repository';
import { PrRepositoryClass } from '@/features/pr-personnel/pr.repository';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';
import { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository';
import { AuthRepositoryClass } from '@/features/auth/auth.repository';
import { Error } from '@/error/index';
import { paramId } from '@/util/params';
import { getActor } from '@/util/actor';
import { logger } from '@/util/logger';
import { OrgScope, resolveOrgScope } from '@/util/org-scope';
import { CreateOutletSwapSchema, RespondOutletSwapSchema } from '@/schema/outlet-swap.schema';
import { OutletSwapApprovalRejection, OutletSwapRepositoryClass } from './outlet-swap.repository';
import { OutletSwapStatus } from './outlet-swap.model';

const PG_UNIQUE_VIOLATION = '23505';

/**
 * Why an approval was refused, in the PR's words. Every one of these is a race
 * the PR's screen can lose while it sits open, so each says what actually
 * happened rather than a generic failure — the difference between "try again"
 * and "this is over".
 */
const REJECTION_MESSAGES: Record<OutletSwapApprovalRejection, string> = {
  not_found: Error.NOT_FOUND,
  not_pending: 'This swap request has already been answered',
  destination_full: 'That shift is now fully staffed — the swap cannot go ahead',
  date_mismatch: 'The shifts are no longer on the same date — ask your agency to re-send it',
  already_assigned: 'You are already on that shift',
};

// Drizzle wraps the pg error, so the SQLSTATE lives on `error.cause.code`.
// Here it means the partial unique index caught a second pending request for
// the same assignment — a double-tap, not a server fault.
function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === PG_UNIQUE_VIOLATION || e?.cause?.code === PG_UNIQUE_VIOLATION;
}

export class OutletSwapControllerClass {
  constructor(
    private outletSwapRepository: OutletSwapRepositoryClass,
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

  /**
   * Swaps the calling agency raised (admins see any agency via ?agencyId).
   * Outlets are deliberately not readers here: a swap is an agency↔PR
   * negotiation, and the venue only ever sees the settled roster.
   */
  async list(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && !scope.agencyId) {
        return res.status(403).json({ success: false, message: 'No agency associated with this account', data: null });
      }
      const requests = await this.outletSwapRepository.list({
        agencyId: scope.isAdmin ? (req.query.agencyId as string | undefined) : scope.agencyId!,
        assignmentId: req.query.assignmentId as string | undefined,
        status: req.query.status as OutletSwapStatus | undefined,
      });
      res.status(200).json({ success: true, message: 'OK', data: requests });
    } catch (error) {
      logger.error('[OutletSwapController.list] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Where this PR could be moved tonight: every other staffable shift the agency
   * runs on the assignment's date, each with its live headcount so the picker
   * can mark the full ones. Offering a full shift would only produce a request
   * that approval must reject.
   */
  async listTargets(req: Request, res: Response) {
    try {
      const assignmentId = req.query.assignmentId as string | undefined;
      if (!assignmentId) {
        return res.status(400).json({ success: false, message: 'assignmentId is required', data: null });
      }
      const assignment = await this.shiftAssignmentRepository.getById(assignmentId);
      if (!assignment) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && assignment.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      const shift = await this.shiftRepository.getById(assignment.shiftId);
      if (!shift) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const targets = await this.outletSwapRepository.listSwapTargets({
        agencyId: assignment.agencyId,
        shiftDate: shift.shiftDate,
        excludeShiftId: assignment.shiftId,
      });
      res.status(200).json({ success: true, message: 'OK', data: targets });
    } catch (error) {
      logger.error('[OutletSwapController.listTargets] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * The agency proposes the move. Nothing changes on the roster here — the row
   * sits at `pending_pr` until the PR answers. The origin shift is taken from
   * the assignment rather than the body so the record cannot claim a shift the
   * PR was never on.
   */
  async create(req: Request, res: Response) {
    try {
      const parsed = CreateOutletSwapSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const { assignmentId, toShiftId, agencyNote } = parsed.data;

      const assignment = await this.shiftAssignmentRepository.getById(assignmentId);
      if (!assignment) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && assignment.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      // Swapping a PR who is no longer working the shift is meaningless, and
      // approving it later would resurrect a cancelled booking.
      if (assignment.status === 'cancelled' || assignment.status === 'no_show' || assignment.status === 'leave_approved') {
        return res.status(400).json({ success: false, message: 'This PR is no longer working that shift', data: null });
      }
      if (toShiftId === assignment.shiftId) {
        return res.status(400).json({ success: false, message: 'Pick a different shift to swap to', data: null });
      }

      const [fromShift, toShift] = await Promise.all([
        this.shiftRepository.getById(assignment.shiftId),
        this.shiftRepository.getById(toShiftId),
      ]);
      if (!fromShift || !toShift) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      if (!scope.isAdmin && toShift.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      if (fromShift.shiftDate !== toShift.shiftDate) {
        return res.status(400).json({ success: false, message: 'A swap has to be to a shift on the same date', data: null });
      }

      // Reject a doomed request up front: approval re-checks capacity under a
      // lock, so this is a courtesy, not the guarantee.
      const counts = await this.outletSwapRepository.countLiveAssignments([toShiftId]);
      if ((counts.get(toShiftId) ?? 0) >= toShift.quantity) {
        return res.status(409).json({ success: false, message: 'That shift is already fully staffed', data: null });
      }

      const actor = getActor(req);
      const request = await this.outletSwapRepository.create({
        assignmentId,
        fromShiftId: assignment.shiftId,
        toShiftId,
        agencyId: assignment.agencyId,
        agencyNote: agencyNote ?? null,
        status: 'pending_pr',
        createdBy: actor,
        updatedBy: actor,
      });
      res.status(201).json({ success: true, message: 'Swap request sent to the PR', data: request });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({ success: false, message: 'This PR already has a swap request awaiting a reply', data: null });
      }
      logger.error('[OutletSwapController.create] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** The agency retracts a request the PR has not answered yet. */
  async cancel(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const existing = await this.outletSwapRepository.getById(id);
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && existing.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const request = await this.outletSwapRepository.resolveWithoutMoving({
        id,
        status: 'cancelled',
        respondedBy: getActor(req),
      });
      if (!request) {
        return res.status(409).json({ success: false, message: 'This swap request has already been answered', data: null });
      }
      res.status(200).json({ success: true, message: 'Swap request withdrawn', data: request });
    } catch (error) {
      logger.error('[OutletSwapController.cancel] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * The signed-in PR's own swap requests, scoped server-side to their pr.id.
   * Surfacing the row IS the notification — no transport exists to push one.
   */
  async listMine(req: Request, res: Response) {
    try {
      const pr = await this.resolveCallerPr(req);
      if (!pr) return res.status(200).json({ success: true, message: 'OK', data: [] });
      const requests = await this.outletSwapRepository.list({
        prId: pr.id,
        status: req.query.status as OutletSwapStatus | undefined,
      });
      res.status(200).json({ success: true, message: 'OK', data: requests });
    } catch (error) {
      logger.error('[OutletSwapController.listMine] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * The PR accepts: this is the only path that moves the roster. The capacity
   * re-check and the move happen together under a row lock in the repository,
   * so a shift that filled up while this screen was open rejects here rather
   * than overfilling.
   */
  async approveMine(req: Request, res: Response) {
    try {
      const parsed = RespondOutletSwapSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const owned = await this.resolveOwnPendingSwap(req, res);
      if (!owned) return;

      const result = await this.outletSwapRepository.approve({
        id: owned.id,
        prNote: parsed.data.note ?? null,
        respondedBy: getActor(req),
      });
      if (!result.ok) {
        const status = result.reason === 'not_found' ? 404 : 409;
        return res.status(status).json({ success: false, message: REJECTION_MESSAGES[result.reason], data: null });
      }
      res.status(200).json({ success: true, message: 'Swap approved — your shift has been moved', data: result.request });
    } catch (error) {
      logger.error('[OutletSwapController.approveMine] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** The PR turns it down: the roster is untouched and the agency sees the reason. */
  async declineMine(req: Request, res: Response) {
    try {
      const parsed = RespondOutletSwapSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const owned = await this.resolveOwnPendingSwap(req, res);
      if (!owned) return;

      const request = await this.outletSwapRepository.resolveWithoutMoving({
        id: owned.id,
        status: 'declined',
        note: parsed.data.note ?? null,
        respondedBy: getActor(req),
      });
      if (!request) {
        return res.status(409).json({ success: false, message: REJECTION_MESSAGES.not_pending, data: null });
      }
      res.status(200).json({ success: true, message: 'Swap declined — you stay on your original shift', data: request });
    } catch (error) {
      logger.error('[OutletSwapController.declineMine] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** The `pr` row behind the signed-in user, or null when they have no PR profile. */
  private async resolveCallerPr(req: Request) {
    const userId = req.user?.id;
    return userId ? await this.prRepository.getByUserId(userId) : null;
  }

  /**
   * The swap named in the URL, but only if it belongs to the caller's own
   * assignment. A swap for someone else's assignment answers 404, not 403 — a
   * PR should not be able to probe which swap ids exist. Writes the response
   * itself and returns null when the caller cannot act; the repository re-checks
   * `pending_pr` under a lock, so this is a fast path, not the guarantee.
   */
  private async resolveOwnPendingSwap(req: Request, res: Response) {
    const id = paramId(req.params.id);
    const pr = await this.resolveCallerPr(req);
    if (!pr) {
      res.status(403).json({ success: false, message: 'No PR profile for this account', data: null });
      return null;
    }
    const request = await this.outletSwapRepository.getById(id);
    if (!request) {
      res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      return null;
    }
    const assignment = await this.shiftAssignmentRepository.getById(request.assignmentId);
    if (!assignment || assignment.prId !== pr.id) {
      res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      return null;
    }
    return request;
  }
}
