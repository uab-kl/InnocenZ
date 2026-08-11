import { Request, Response } from 'express';
import { Error } from '@/error/index';
import { logger } from '@/util/logger';
import { paramId } from '@/util/params';
import { getActor } from '@/util/actor';
import { OrgScope, isOutletCaller, resolveOrgScope } from '@/util/org-scope';
import { notify, notifyMany } from '@/features/notification/notify.js';
import { ShiftRepositoryClass } from '@/features/shift/shift.repository';
import { ShiftAssignmentRepositoryClass } from '@/features/shift-assignment/shift-assignment.repository';
import { PrRepositoryClass } from '@/features/pr-personnel/pr.repository';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';
import { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository';
import { AuthRepositoryClass } from '@/features/auth/auth.repository';
import { sealCheckOut } from '@/features/shift-assignment/seal-checkout';
import { resolveTierWages } from '@/features/shift-assignment/resolve-tier-wages';
import { CreateCutlostRequestSchema, DecideCutlostRequestSchema } from '@/schema/cutlost.schema';
import { CutlostRepositoryClass } from './cutlost.repository';
import { CutlostRequestWithContext } from './cutlost.model';

/**
 * Cut-loss: an outlet asks to spend less on a shift, the agency decides, and an
 * approval is what actually releases anyone.
 *
 * 🔴 The money rule is NOT here. Releasing a PR calls the same `sealCheckOut` a
 * PR's own check-out calls, so an early release is pro-rated by exactly the rule
 * that governs every other close. This controller decides WHO may ask, WHO may
 * approve and WHICH rows are touched — never what a shift pays.
 */
export class CutlostControllerClass {
  constructor(
    private cutlostRepository: CutlostRepositoryClass,
    private shiftRepository: ShiftRepositoryClass,
    private shiftAssignmentRepository: ShiftAssignmentRepositoryClass,
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
   * An OUTLET raises a request against one of its own shifts.
   *
   * Two scope proofs, both server-side and neither inferable from the body: the
   * shift must be at a venue this caller belongs to, and every named assignment
   * must be ON that shift. Without the second, an outlet could name an
   * assignment at somebody else's venue and have the agency release a PR who was
   * never theirs — the request body is the caller's to write.
   */
  async create(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      const outletCaller = isOutletCaller(scope);
      if (!scope.isAdmin && !outletCaller) {
        return res.status(403).json({
          success: false,
          message: 'Only the venue can raise a cut-loss request',
          data: null,
        });
      }

      const parsed = CreateCutlostRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res
          .status(400)
          .json({ success: false, message: 'Invalid request', data: parsed.error.issues });
      }
      const input = parsed.data;

      const shift = await this.shiftRepository.getById(input.shiftId);
      // 404 rather than 403 for a shift outside the caller's venues: an outlet
      // must not be able to probe for the existence of another venue's shifts.
      if (!shift || (!scope.isAdmin && !scope.outletIds.includes(shift.outletId))) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      // Resolve who is being released against the shift's OWN roster. This is
      // both a translation — the outlet UI holds PR ids, the table keys on
      // assignments — and the scope proof: anything the body names that is not
      // on this shift is refused, so a caller cannot have the agency release a
      // PR who was never theirs. The request body is the caller's to write.
      let assignmentIds = input.assignmentIds ?? [];
      const wantPrIds = assignmentIds.length === 0 ? (input.prIds ?? []) : [];
      if (assignmentIds.length > 0 || wantPrIds.length > 0) {
        const onShift = await this.shiftAssignmentRepository.listPaginated({
          filter: { shiftId: input.shiftId },
          page: 1,
          pageSize: 200,
        });
        if (assignmentIds.length > 0) {
          const allowed = new Set(onShift.assignments.map((a) => a.id));
          if (assignmentIds.some((id) => !allowed.has(id))) {
            return res.status(400).json({
              success: false,
              message: 'One or more assignments are not on this shift',
              data: null,
            });
          }
        } else {
          // A PR holds at most one assignment per shift
          // (`shift_assignment_shift_pr_unique`), so this mapping is exact.
          // Both keys are indexed because `pr_id` and `user_id` are equal after
          // the 0089 cutover but callers may still hold either.
          const byPr = new Map<string, string>();
          for (const a of onShift.assignments) {
            if (a.userId) byPr.set(a.userId, a.id);
            if (a.prId) byPr.set(a.prId, a.id);
          }
          const missing = wantPrIds.filter((prId) => !byPr.has(prId));
          if (missing.length > 0) {
            return res.status(400).json({
              success: false,
              message: 'One or more PRs are not on this shift',
              data: null,
            });
          }
          assignmentIds = wantPrIds.map((prId) => byPr.get(prId) as string);
        }
      }

      const actor = getActor(req);
      const created = await this.cutlostRepository.create(
        {
          shiftId: input.shiftId,
          kind: input.kind,
          status: 'pending',
          slotsCut: input.slotsCut ?? null,
          estimatedSavings: input.estimatedSavings ?? '0.00',
          rationale: input.rationale ?? null,
          createdBy: actor,
          updatedBy: actor,
        },
        assignmentIds,
      );

      const request = await this.cutlostRepository.getById(created.id);
      res.status(201).json({ success: true, message: 'Cut-loss request raised', data: request });

      // After the response: the request is saved either way, and a notification
      // failure must not fail the write the outlet just made.
      void this.notifyAgency(request, actor);
    } catch (error) {
      logger.error('[CutlostController.create] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Requests visible to the caller: an agency sees the ones raised against its
   * shifts, an outlet the ones raised at its venues.
   *
   * The scope goes into the REPOSITORY's WHERE clause, never a filter after the
   * read — a path that fetches everything and trims afterwards is one refactor
   * away from leaking, and this codebase has been bitten by exactly that.
   */
  async list(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      const outletCaller = isOutletCaller(scope);
      if (!scope.isAdmin && !scope.agencyId && !outletCaller) {
        return res
          .status(403)
          .json({ success: false, message: 'No organisation for this account', data: null });
      }

      const data = await this.cutlostRepository.listWithContext({
        shiftId: (req.query.shiftId as string | undefined) ?? undefined,
        status: req.query.status as 'pending' | 'approved' | 'rejected' | undefined,
        agencyId: scope.isAdmin ? undefined : (scope.agencyId ?? undefined),
        outletIds: outletCaller ? scope.outletIds : undefined,
      });
      res.status(200).json({ success: true, message: 'OK', data });
    } catch (error) {
      logger.error('[CutlostController.list] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * The AGENCY approves or rejects. Approval is the only thing that releases
   * anyone — a pending request has never touched a roster row.
   *
   * The decision is CLAIMED with a conditional update before any release runs,
   * so two agency users clicking Approve at once cannot both proceed. Releasing
   * is not idempotent — each release seals a wage — so losing that race has to
   * mean doing nothing at all rather than doing it twice.
   */
  async decide(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const parsed = DecideCutlostRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res
          .status(400)
          .json({ success: false, message: 'Invalid decision', data: parsed.error.issues });
      }

      const scope = await this.resolveScope(req);
      const request = await this.cutlostRepository.getById(id);
      if (!request) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      // The agency that staffed the shift decides. An outlet may raise a request
      // and read its own, but must never approve its own ask — that would let a
      // venue cut a bill the agency never agreed to.
      if (!scope.isAdmin && (!scope.agencyId || scope.agencyId !== request.agencyId)) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      if (request.status !== 'pending') {
        return res.status(409).json({
          success: false,
          message: `This request was already ${request.status}`,
          data: null,
        });
      }

      const actor = getActor(req);
      const decision = parsed.data.decision;
      const claimed = await this.cutlostRepository.claimDecision({
        id,
        status: decision === 'approve' ? 'approved' : 'rejected',
        declineReason: decision === 'reject' ? (parsed.data.reason ?? null) : null,
        actor,
      });
      if (!claimed) {
        return res.status(409).json({
          success: false,
          message: 'This request was decided by someone else a moment ago',
          data: null,
        });
      }

      const released = decision === 'approve' ? await this.applyApproval(request, actor) : [];
      const fresh = await this.cutlostRepository.getById(id);
      res.status(200).json({
        success: true,
        message: decision === 'approve' ? 'Cut-loss approved' : 'Cut-loss rejected',
        data: { request: fresh, released },
      });

      void this.notifyOutcome(request, decision, released, actor);
    } catch (error) {
      logger.error('[CutlostController.decide] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Carries out an approved request: release the named PRs, take the cut slots
   * off the plan.
   *
   * Each release is an ordinary check-out stamped on the PR's behalf — same
   * seal, same clamp, same pro-rata — with `released_by` recording that it was
   * not the PR who tapped it. Nothing here decides an amount.
   */
  private async applyApproval(
    request: CutlostRequestWithContext,
    actor: string,
  ): Promise<Array<{ assignmentId: string; outcome: string; payAmount?: string | null }>> {
    const results: Array<{ assignmentId: string; outcome: string; payAmount?: string | null }> = [];
    const now = new Date();
    const reason = `Released early — cut-loss ${request.id}`;

    for (const named of request.releasedAssignments) {
      const assignment = await this.shiftAssignmentRepository.getById(named.assignmentId);
      if (!assignment) {
        results.push({ assignmentId: named.assignmentId, outcome: 'missing' });
        continue;
      }
      // Already closed, or never going to be: releasing again would seal a
      // second wage over the first. Reported, not thrown — one stale row must
      // not leave the rest of an approved plan half-applied.
      if (
        assignment.checkOutAt ||
        assignment.status === 'cancelled' ||
        assignment.status === 'no_show'
      ) {
        results.push({ assignmentId: named.assignmentId, outcome: 'already_closed' });
        continue;
      }

      // Never checked in: this PR had not started, so there are no hours to
      // pro-rate, and a `completed` row sealing 0.00 would claim they worked and
      // earned nothing. Cancelling says what actually happened — stood down
      // before the shift began — and leaves the penalty question, deliberately
      // unbuilt, to be answered later against a truthful record.
      if (!assignment.checkInAt) {
        await this.shiftAssignmentRepository.update(named.assignmentId, {
          status: 'cancelled',
          releasedBy: actor,
          releaseReason: reason,
          updatedBy: actor,
        });
        results.push({ assignmentId: named.assignmentId, outcome: 'stood_down_before_start' });
        continue;
      }

      const shift = await this.shiftRepository.getById(assignment.shiftId);
      const pr = await this.prRepository.getById(assignment.prId);
      const dayRate =
        shift && pr
          ? await resolveTierWages(
              this.shiftAssignmentRepository,
              pr,
              assignment.shiftId,
              shift.outletId,
            )
          : null;

      const seal = sealCheckOut({
        checkInAt: new Date(assignment.checkInAt),
        shiftDate: shift?.shiftDate ?? null,
        slot: shift?.slot ?? null,
        dayRate,
        now,
      });
      const updated = await this.shiftAssignmentRepository.update(named.assignmentId, {
        ...seal.columns,
        // The one thing a release adds. No geofence fix and no selfie sits
        // behind this stamp, unlike a check-out the PR tapped, so the row says
        // so rather than looking identical to one that does.
        releasedBy: actor,
        releaseReason: reason,
        updatedBy: actor,
      });
      results.push({
        assignmentId: named.assignmentId,
        outcome: 'released',
        payAmount: updated?.payAmount ?? seal.earned.amount,
      });
      logger.info(
        `[cutlost.approve] ${request.id}: released ${named.assignmentId} — ` +
          `${seal.earned.workedMinutes}/${seal.earned.scheduledMinutes} min, ` +
          `rule=${seal.earned.rule}, sealed RM${seal.earned.amount}`,
      );
    }

    // Unfilled slots come off the plan, floored at the people actually on the
    // shift: a request raised before someone was assigned must never cut the
    // shift below the staff standing in it.
    //
    // ⚠️ Counted from the assignment rows, NOT from `shift.filled`. That counter
    // reads 0 on shifts that demonstrably have staff — it is not maintained by
    // the assign path — so flooring on it would have been a guard that quietly
    // never fires. Live-checked before writing this: a shift with one assigned
    // PR reported `filled=0`.
    if ((request.slotsCut ?? 0) > 0) {
      const shift = await this.shiftRepository.getById(request.shiftId);
      if (shift) {
        const onShift = await this.shiftAssignmentRepository.listPaginated({
          filter: { shiftId: request.shiftId },
          page: 1,
          pageSize: 200,
        });
        const stillStaffed = onShift.assignments.filter(
          (a) => !['cancelled', 'no_show'].includes(a.status),
        ).length;
        const nextQuantity = Math.max(
          stillStaffed,
          (shift.quantity ?? 0) - (request.slotsCut ?? 0),
        );
        await this.shiftRepository.update(request.shiftId, {
          quantity: nextQuantity,
          updatedBy: actor,
        });
      }
    }

    return results;
  }

  /** Tells the agency a venue is asking. Recipients are the agency's members. */
  private async notifyAgency(request: CutlostRequestWithContext | null, actor: string) {
    if (!request) return;
    try {
      const members = await this.agencyMemberRepository.listByAgency(request.agencyId);
      const userIds = members.map((m) => m.userId).filter((v): v is string => !!v);
      const names = request.releasedAssignments.map((a) => a.prName ?? 'a PR');
      await notifyMany(userIds, {
        kind: 'cutlost_requested',
        title: 'Venue asked to cut a shift',
        body:
          `${request.outletName ?? 'A venue'} · ${request.shiftDate}` +
          (names.length > 0 ? ` · release ${names.join(', ')}` : '') +
          ((request.slotsCut ?? 0) > 0 ? ` · cut ${request.slotsCut} slot(s)` : ''),
        payload: {
          requestId: request.id,
          shiftId: request.shiftId,
          kind: request.kind,
          estimatedSavings: request.estimatedSavings,
        },
        actor,
      });
    } catch (error) {
      logger.error('[CutlostController.notifyAgency] Error:', error);
    }
  }

  /**
   * Tells the outlet what was decided, and every RELEASED PR that they were sent
   * home. The PR half matters most: their wage just changed, and an unexplained
   * short payment is what a dispute is made of.
   */
  private async notifyOutcome(
    request: CutlostRequestWithContext,
    decision: 'approve' | 'reject',
    released: Array<{ assignmentId: string; outcome: string; payAmount?: string | null }>,
    actor: string,
  ) {
    try {
      const members = await this.outletMemberRepository.listByOutlet(request.outletId);
      const userIds = members.map((m) => m.userId).filter((v): v is string => !!v);
      await notifyMany(userIds, {
        kind: 'cutlost_decided',
        title: decision === 'approve' ? 'Cut-loss approved' : 'Cut-loss declined',
        body: `${request.outletName ?? 'Your venue'} · ${request.shiftDate}`,
        payload: { requestId: request.id, shiftId: request.shiftId, decision },
        actor,
      });

      if (decision !== 'approve') return;
      for (const row of released.filter((r) => r.outcome === 'released')) {
        const named = request.releasedAssignments.find((a) => a.assignmentId === row.assignmentId);
        if (!named) continue;
        const pr = await this.prRepository.getById(named.prId);
        if (!pr?.userId) continue;
        await notify({
          userId: pr.userId,
          kind: 'shift_released_early',
          title: 'You were released early',
          body:
            `${request.outletName ?? 'The venue'} on ${request.shiftDate} — ` +
            `wages sealed at RM${row.payAmount ?? '0.00'} for the hours you worked`,
          payload: {
            requestId: request.id,
            assignmentId: row.assignmentId,
            shiftId: request.shiftId,
            payAmount: row.payAmount ?? null,
          },
          actor,
        });
      }
    } catch (error) {
      logger.error('[CutlostController.notifyOutcome] Error:', error);
    }
  }
}
