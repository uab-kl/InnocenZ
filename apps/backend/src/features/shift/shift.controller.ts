import { Request, Response } from 'express';
import { ShiftRepositoryClass } from './shift.repository';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';
import { OutletRepositoryClass } from '@/features/outlet/outlet.repository';
import { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository';
import { AuthRepositoryClass } from '@/features/auth/auth.repository';
import { notifyMany } from '@/features/notification/notify.js';
import { Error } from '@/error/index';
import { paramId, uuidParam } from '@/util/params';
import { getActor } from '@/util/actor';
import { logger } from '@/util/logger';
import { CreateShiftSchema, UpdateShiftSchema } from '@/schema/shift.schema';
import { ShiftFilter, ShiftStatus, ShiftEventKind } from './shift.model';
import { OrgScope, resolveOrgScope, isOutletCaller } from '@/util/org-scope';
import { ShiftAssignmentRepositoryClass } from '@/features/shift-assignment/shift-assignment.repository';
import { shiftsOverlap, shiftDayKey } from '@/util/slot-window';
import {
  outletDailyPrUsage,
  resolveActivePlanLimit,
} from '@/features/subscription/plan-limit';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

function parsePaging(req: Request): { page: number; pageSize: number } {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE));
  return { page, pageSize };
}

/**
 * `shift.quantity` governs: the per-tier rows PARTITION the headcount, they never
 * add to it. Returns the refusal message, or null when the shift is consistent.
 *
 * Enforced at AUTHORING time because assignment reads these rows as a hard cap —
 * demand that exceeds the headcount is a shift no one can ever staff correctly,
 * and it is far cheaper to refuse the save than to explain the stalemate later.
 *
 * Skipped when the quantity is unknown (omitted on create, where the column
 * default applies): there is nothing to compare against, and the assign-side
 * total-headcount guard still holds.
 */
function demandExceedsQuantity(
  payTiers: { prCount?: number }[] | undefined,
  quantity: number | undefined,
): string | null {
  if (!payTiers?.length || quantity === undefined || quantity === null) return null;
  const asked = payTiers.reduce((n, row) => n + (row.prCount ?? 0), 0);
  return asked > quantity
    ? `The pay tiers ask for ${asked} PRs but this shift only has ${quantity} slot${quantity === 1 ? '' : 's'} — lower a tier's count or raise the headcount.`
    : null;
}

/**
 * The venue's PLAN capacity, as a refusal message or null.
 *
 * The plan governs how many PRs a venue may REQUEST in a calendar day, so the
 * day's usage is the sum of `quantity` across its shifts that date — a shift
 * posted for 8 consumes 8 whether or not anyone is rostered onto it yet.
 *
 * Three cases deliberately do NOT refuse:
 *   • `limitAmount` null — Premier and the open-ended bands are a floor with no
 *     ceiling, and the POS add-on is not a capacity product.
 *   • no active plan — a venue with no subscription is a billing problem, not a
 *     posting problem, and blocking its roster would be a strange way to raise
 *     it. Nothing here is the place to invent that policy.
 *   • the usage count FAILED (-1) — a gate must not refuse on a number it does
 *     not have, and must not read a failed count as "nothing used" either.
 */
async function planCapacityRefusal(params: {
  outletId: string;
  shiftDate: string;
  adding: number | undefined;
  excludeShiftId?: string;
}): Promise<string | null> {
  const asking = params.adding ?? 0;
  if (asking <= 0) return null;

  const plan = await resolveActivePlanLimit({
    subscriberType: 'outlet',
    subscriberId: params.outletId,
  });
  if (!plan || plan.limitAmount === null) return null;

  const used = await outletDailyPrUsage({
    outletId: params.outletId,
    shiftDate: params.shiftDate,
    excludeShiftId: params.excludeShiftId,
  });
  if (used < 0) return null;

  const total = used + asking;
  if (total <= plan.limitAmount) return null;

  const left = Math.max(0, plan.limitAmount - used);
  return (
    `Your ${plan.planName} plan covers ${plan.limitAmount} PR${plan.limitAmount === 1 ? '' : 's'} a day. ` +
    `${used} already requested on ${params.shiftDate}, so this shift can ask for at most ${left} more — ` +
    `lower the headcount or upgrade the plan.`
  );
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
      // The tier MIX rides along with the list, not just with getById: the roster
      // and the auto-assign planner have to OFFER only tiers the assign call will
      // accept, and they read shifts from here. Purely additive — a consumer that
      // ignores `payTiers` sees exactly what it saw before.
      const payTiersByShift = await this.shiftRepository.listPayTiersForShifts(
        shifts.map((s) => s.id),
      );
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      res.status(200).json({
        success: true,
        message: 'OK',
        data: shifts.map((s) => ({ ...s, payTiers: payTiersByShift.get(s.id) ?? [] })),
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
      // as a confirmed event (Calendar). Admin creates keep the table default
      // (`draft`). The client cannot set status; this is authoritative.
      let postedStatus: 'confirmed' | undefined;
      if (scope.isAdmin) {
        if (!parsed.data.agencyId) {
          return res.status(400).json({ success: false, message: 'agencyId is required', data: null });
        }
        agencyId = parsed.data.agencyId;
      } else if (scope.agencyId) {
        // POSTING A SHIFT IS THE OUTLET'S ACT, and only the outlet's. The venue
        // decides it needs staff and posts the job TO its onboarding agency;
        // `outlet.onboarded_by_agency_id` is the routing address for that post,
        // not a licence for the agency to author demand on the venue's behalf.
        //
        // The router already blocks plain agency tokens (`canCreate =
        // requireRole('admin','outlet')`), so this branch was only ever reachable
        // by someone holding the OUTLET role AND an agency membership:
        // `isOutletCaller` requires `!agencyId`, so such a hybrid fell past the
        // outlet branch into this one and created a shift for their agency at any
        // outlet id they liked — no `scope.outletIds` check runs on this path.
        return res.status(403).json({
          success: false,
          message: 'Only an outlet can post a shift. The outlet posts the job to its agency.',
          data: null,
        });
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

      const overAsked = demandExceedsQuantity(payTiers, shiftData.quantity);
      if (overAsked) {
        return res.status(400).json({ success: false, message: overAsked, data: null });
      }

      // THE VENUE'S PLAN, enforced. Until now this cap lived only in the Post
      // Job screen's own state, so anything that was not that screen — the API,
      // a script, a second UI — could post past it silently.
      const overPlan = await planCapacityRefusal({
        outletId: shiftData.outletId,
        shiftDate: shiftData.shiftDate,
        adding: shiftData.quantity,
      });
      if (overPlan) {
        return res.status(409).json({ success: false, message: overPlan, data: null });
      }

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
      // Editing a shift is the venue's act, so ownership is the VENUE, not the
      // agency it posts to. The agency clause that used to sit here
      // (`existing.agencyId === scope.agencyId`) is gone: with `agency` off this
      // route it was unreachable by a plain agency token, but a caller holding
      // the OUTLET role AND an agency membership still passed through it —
      // `isOutletCaller` requires `!agencyId` — and could edit any shift of their
      // agency at any venue, since the `outletIds` check below never ran for them.
      const owns =
        scope.isAdmin || (isOutlet && scope.outletIds.includes(existing.outletId));
      if (!owns) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const { payTiers, ...data } = parsed.data;

      // Against the EFFECTIVE quantity and the EFFECTIVE tier rows. Dropping
      // quantity from 6 to 4 without resending payTiers has to be refused too,
      // or the shift keeps stored demand for 6 that nothing can ever satisfy —
      // so when the request omits payTiers, the STORED rows are what we check.
      const effectiveTiers = payTiers ?? (await this.shiftRepository.listPayTiersForShift(id));
      const overAsked = demandExceedsQuantity(effectiveTiers, data.quantity ?? existing.quantity);
      if (overAsked) {
        return res.status(400).json({ success: false, message: overAsked, data: null });
      }

      // The same plan gate as create, measured against the day WITHOUT this
      // shift's current headcount — otherwise raising a shift from 4 to 5 would
      // be checked as 9 and refused for a day that has room.
      const overPlanOnEdit = await planCapacityRefusal({
        outletId: existing.outletId,
        shiftDate: data.shiftDate === undefined ? existing.shiftDate : data.shiftDate,
        adding: data.quantity ?? existing.quantity,
        excludeShiftId: id,
      });
      if (overPlanOnEdit) {
        return res.status(409).json({ success: false, message: overPlanOnEdit, data: null });
      }

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

  /**
   * Tell everyone a withdrawn shift mattered to: the PRs who were booked on it,
   * and the agency that staffed it.
   *
   * Both use the existing `shift_cancelled` kind. That kind names the EVENT — a
   * shift that was on is now off — which is exactly true for both audiences, and
   * it avoids a `notification_kind` enum migration on a shared database for a
   * message that reads identically. If these two ever need to be filtered apart
   * (a PR-only inbox, say), a dedicated `shift_withdrawn` kind is the fix, and it
   * costs one hand-authored migration.
   *
   * Never throws: the shift is already gone, and a failed notification must not
   * be reported to the outlet as a failed withdrawal.
   */
  private async notifyShiftWithdrawn(input: {
    shift: { id: string; agencyId: string; shiftDate: string; slot: string | null; eventName: string | null };
    outletName: string | null;
    affected: { prId: string; userId: string | null }[];
    actor: string;
  }): Promise<void> {
    const { shift, outletName, affected, actor } = input;
    const where = outletName ?? 'the venue';
    const when = `${shift.shiftDate}${shift.slot ? ` · ${shift.slot}` : ''}`;
    const payload = {
      shiftId: shift.id,
      shiftDate: shift.shiftDate,
      outletName,
      withdrawn: true,
    };

    // `shift_assignment.pr_id` IS the user id after 0089, so `userId` and `prId`
    // are the same value; prefer the explicit column and fall back.
    const prRecipients = [
      ...new Set(affected.map((a) => a.userId ?? a.prId).filter(Boolean)),
    ] as string[];
    if (prRecipients.length > 0) {
      await notifyMany(prRecipients, {
        kind: 'shift_cancelled',
        title: 'A shift was withdrawn',
        body: `${where} withdrew the shift on ${when}. You are no longer booked for it.`,
        payload,
        actor,
      });
    }

    const members = await this.agencyMemberRepository.listByAgency(shift.agencyId);
    const agencyRecipients = members
      .filter((m) => m.status === 'active')
      .map((m) => m.userId);
    if (agencyRecipients.length === 0) return;
    await notifyMany(agencyRecipients, {
      kind: 'shift_cancelled',
      title: `Shift withdrawn — ${where}`,
      body:
        affected.length > 0
          ? `${where} withdrew the shift on ${when}. ${affected.length} booked PR${affected.length === 1 ? ' was' : 's were'} released and notified.`
          : `${where} withdrew the shift on ${when}. Nobody was booked on it.`,
      payload: { ...payload, releasedCount: affected.length },
      actor,
    });
  }

  async remove(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);

      const existing = await this.shiftRepository.getById(id);
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      // Deleting a shift is the venue's act — the same rule as posting and
      // editing, and the most destructive of the three. Ownership is the OUTLET,
      // never the agency the shift was posted to. The agency clause that used to
      // sit here let a caller holding the outlet role AND an agency membership
      // delete any shift of their agency at any venue: `isOutletCaller` requires
      // `!agencyId`, so they skipped the `outletIds` check entirely.
      const owns =
        scope.isAdmin ||
        (this.isOutletCaller(scope) && scope.outletIds.includes(existing.outletId));
      if (!owns) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      // A shift may be withdrawn only while it is ENTIRELY in the future. Today's
      // is refused even before it starts, because deleting a shift CASCADES to
      // its `shift_assignment` rows (and from there to swaps and cut-loss
      // requests): a same-day delete silently cancels PRs who may already be on
      // their way. Admin is exempt — support has to be able to clean up a bad row.
      //
      // Compared in the VENUE's timezone, not the server's: on a UTC host
      // `new Date()` rolls the date eight hours early, which would let a Kuala
      // Lumpur outlet delete tonight's shift from 16:00 onwards.
      if (!scope.isAdmin) {
        const todayIso = shiftDayKey(new Date());
        const shiftIso = String(existing.shiftDate).slice(0, 10);
        if (shiftIso <= todayIso) {
          return res.status(409).json({
            success: false,
            message:
              "This shift is today or has already passed — it can no longer be withdrawn. Contact the agency to stand the team down.",
            data: null,
          });
        }
      }

      // ⚠️ READ THE ROSTER BEFORE DELETING. `shift_assignment` cascades off
      // `shift`, so after the delete there is no record of who was booked — the
      // people we have to tell would be unreachable a line later.
      const booked = await this.shiftAssignmentRepository.listByShift(id);
      const affected = booked.filter(
        (a) => !['cancelled', 'no_show', 'leave_approved'].includes(a.status),
      );
      const outlet = await this.outletRepository.getById(existing.outletId);

      const removed = await this.shiftRepository.remove(id);
      if (!removed) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Shift removed', data: null });

      // Fire-and-forget, after the response: the withdrawal is already committed
      // and a failed notification must not be reported as a failed delete. Both
      // sides are told — the PRs because their booking vanished, the agency
      // because it staffed a night that no longer exists.
      void this.notifyShiftWithdrawn({
        shift: existing,
        outletName: outlet?.name ?? null,
        affected,
        actor: getActor(req),
      }).catch((error) => {
        logger.error('[ShiftController.remove] notify Error:', error);
      });
    } catch (error) {
      logger.error('[ShiftController.remove] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
