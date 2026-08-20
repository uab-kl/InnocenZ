import { Request, Response } from 'express';
import { travelWarningFor } from '@/features/shift-assignment/travel-gap';
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
import { shiftDayKey } from '@/util/slot-window';
import { assignmentHistoryReason } from '@/features/shift-assignment/assignment-history-guard';
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
  // Deliberately not "fully staffed": the shift has a seat, it just is not for
  // this PR's grade, so "try again later" would be false hope — no cancellation
  // opens a Tier III seat on a shift that only ever wanted two.
  destination_tier_full:
    'That shift has no seat left for your tier — ask your agency to re-send it for another shift',
  date_mismatch: 'The shifts are no longer on the same date — ask your agency to re-send it',
  destination_not_assignable:
    'That shift has been closed by the venue — ask your agency to re-send it for another shift',
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
        // The PR being moved. Without it the picker can only screen on
        // headcount, and would keep offering shifts whose tier quota is already
        // spent — a request the agency can raise and approval can only refuse.
        prId: assignment.userId ?? assignment.prId,
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
      // `shift.agency_id` is the ANCHOR — the first agency the outlet addressed
      // (0124) — so `toShift.agencyId !== scope.agencyId` refused every OTHER
      // invited agency, and the picker had just offered them the shift:
      // `listSwapTargets` resolves candidates through `shift_agency`. Live proof
      // — JK House 2026-08-18 is anchored to Atlas but also invited to Why We
      // Met, so Why We Met saw it in the picker and got a bare 404 on send.
      // Ask the membership table, which is what "may this agency staff it" means.
      if (
        !scope.isAdmin &&
        (!scope.agencyId || !(await this.shiftRepository.isAgencyInvited(toShiftId, scope.agencyId)))
      ) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      if (fromShift.shiftDate !== toShift.shiftDate) {
        return res.status(400).json({ success: false, message: 'A swap has to be to a shift on the same date', data: null });
      }

      // ── A SWAP IS A PLAN FOR A NIGHT THAT HAS NOT HAPPENED YET ─────────────
      // It relocates a PR to another venue that same night, and only once THEY
      // approve. On a date that is gone, that request asks someone to agree to a
      // move that already did or did not happen, and approving it would rewrite
      // where a worked shift was worked — the attendance stamps and the sealed
      // wage stay on the assignment, so the two would then disagree about the
      // venue. Both shifts are on one date (checked above), so testing `from` is
      // testing both. Venue timezone, as everywhere a shift date is compared to
      // "now" — a UTC host rolls the day over eight hours early.
      //
      // The check-in stamp is its own refusal on any date: a PR standing on the
      // floor is not relocatable, and until now only a check-OUT stopped this —
      // the UI's `releasedEarly` gate — which left the whole middle of a shift
      // open to a swap request.
      // Same tested rule as the unassign lane — see assignment-history-guard.ts.
      // Both shifts are on one date (checked just above), so testing `from`
      // tests both.
      if (!scope.isAdmin) {
        const reason = assignmentHistoryReason({
          shiftDate: String(fromShift.shiftDate),
          checkInAt: assignment.checkInAt,
          checkOutAt: assignment.checkOutAt,
          todayIso: shiftDayKey(new Date()),
        });
        if (reason === 'past-shift') {
          return res.status(409).json({
            success: false,
            message: 'That shift has already passed — there is nothing left to swap.',
            data: null,
          });
        }
        if (reason === 'attendance-stamped') {
          return res.status(409).json({
            success: false,
            message: 'This PR has already clocked in on that shift — they can no longer be moved to another venue.',
            data: null,
          });
        }
      }

      // Reject a doomed request up front: approval re-checks BOTH rules under a
      // lock, so this is a courtesy, not the guarantee. It screens on the same
      // two things and in the same order — headcount, then the tier mix. Only
      // headcount was screened here before, so a request whose destination had
      // room but not for this PR's tier could be raised, sit in the PR's queue,
      // and then be refused at approval for a reason nobody could have seen.
      const counts = await this.outletSwapRepository.countLiveAssignments([toShiftId]);
      if ((counts.get(toShiftId) ?? 0) >= toShift.quantity) {
        return res.status(409).json({ success: false, message: 'That shift is already fully staffed', data: null });
      }
      const targets = await this.outletSwapRepository.listSwapTargets({
        // The agency doing the swap — the SAME argument `listTargets` passes, so
        // the picker and this screen see one list. `toShift.agencyId` is the
        // anchor again, and here it is worse than a wrong row set: the tier
        // screen reads the PR's grade from `agency_pr` for THIS agency id, and
        // one person holds a row per agency. Alice is tier_1 at Why We Met and
        // tier_2 at Atlas — grading Why We Met's own PR under the anchor's
        // membership answers the seat question about a different person.
        agencyId: assignment.agencyId,
        shiftDate: toShift.shiftDate,
        excludeShiftId: assignment.shiftId,
        prId: assignment.userId ?? assignment.prId,
      });
      if (targets.find((t) => t.shiftId === toShiftId)?.tierBlocked) {
        return res.status(409).json({
          success: false,
          message: 'That shift has room, but not for this PR\'s tier — it already has every PR of that tier it asked for',
          data: null,
        });
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
      // THE SWAP IS THE THIRD WAY A PERSON ENDS UP SOMEWHERE. The roster has moved,
      // so ask the same question the assign lanes ask: can they get to the venue they
      // just took on? Read AFTER the move, which is the only moment the answer is
      // about the roster that now exists. A warning, never a refusal — and it rides
      // on the success response, because the swap HAPPENED.
      // The swap row names the assignment, not the person — the PR is on the
      // assignment, and the move changed its shift, never its owner.
      const moved = await this.shiftAssignmentRepository.getById(owned.assignmentId);
      const toShift = await this.shiftRepository.getById(owned.toShiftId);
      const travelWarning =
        toShift && moved
        ? await travelWarningFor({
            shift: toShift,
            prId: moved.userId ?? moved.prId,
            excludeShiftId: owned.toShiftId,
            loadPin: (outletId) => this.shiftAssignmentRepository.getOutletPin(outletId),
            loadAssignments: (prId) => this.shiftAssignmentRepository.listForPr(prId),
            onError: (error) =>
              logger.error('[OutletSwapController.approveMine] travel-gap check failed:', error),
          })
        : null;

      res.status(200).json({
        success: true,
        message: 'Swap approved — your shift has been moved',
        data: result.request,
        warning: travelWarning,
      });
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
