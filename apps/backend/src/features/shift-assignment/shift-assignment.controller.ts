import { Request, Response } from 'express';
import {
  ShiftAssignmentRepositoryClass,
  ResolvedTierRate,
  ShiftTierOverride,
} from './shift-assignment.repository';
import { ShiftRepositoryClass } from '@/features/shift/shift.repository';
import { PrRepositoryClass } from '@/features/pr-personnel/pr.repository';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';
import { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository';
import { AuthRepositoryClass } from '@/features/auth/auth.repository';
import { notify, notifyMany } from '@/features/notification/notify.js';
import { Error } from '@/error/index';
import { paramId } from '@/util/params';
import { getActor } from '@/util/actor';
import { logger } from '@/util/logger';
import {
  LineDateConflictError,
  MAX_PLAUSIBLE_SHIFT_HOURS,
  overtimeAmountCents,
} from '@/features/payment-voucher/payment-voucher-audit';
import { formatCents } from '@/features/payment-voucher/payment-voucher-balance';
import { PaymentVoucherRepositoryClass } from '@/features/payment-voucher/payment-voucher.repository';
import { buildOvertimeLine, overtimeDedupeRef } from '@/features/payment-voucher/overtime-line';
import { weekOfDate } from '@/features/payment-voucher/payment-voucher-week';
import { overtimeFromStamps } from './overtime';
import { shiftsOverlap } from '@/util/slot-window';
import {
  CheckInMineSchema,
  CreateShiftAssignmentSchema,
  UpdateShiftAssignmentSchema,
} from '@/schema/shift-assignment.schema';
import { describeDeviceFix, verifyWithinGeoFence } from './check-in-geofence';
import { ShiftAssignmentFilter, ShiftAssignmentStatus } from './shift-assignment.model';
import { OrgScope, resolveOrgScope, isOutletCaller } from '@/util/org-scope';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;
const PG_UNIQUE_VIOLATION = '23505';
/** MC / leave proof bounds — the phone downscales, the server still enforces. */
const MAX_LEAVE_PHOTOS = 5;
const MAX_LEAVE_PHOTO_CHARS = 3_000_000;

/**
 * The `pr.tier` enum maps to the outlet workspace's tier-rate labels. Ranked
 * tiers carry a label (`outlet_tier_rate.kind='tier'`); commission-only is a
 * label-less row (`kind='commission_only'`), so it resolves via the flag below,
 * not a label. Keep this in step with `prTierValues` and the outlet portal's
 * `OUTLET_PR_TIERS`.
 */
const PR_TIER_TO_OUTLET_LABEL: Record<string, string> = {
  tier_1: 'Tier I',
  tier_2: 'Tier II',
  tier_3: 'Tier III',
  tier_4: 'Tier IV',
  tier_5: 'Tier V',
  servant: 'Servant',
};

/**
 * Effective rate for one assignment: the per-shift override wins field-by-field
 * over the outlet workspace default; the happy-hour window always comes from the
 * workspace (a shift override never moves it). `overridden` flags that a shift
 * override row applied, so the mobile app can show "rate set for this shift".
 * Returns null only when neither source has a rate configured.
 */
function mergeRate(
  ws: ResolvedTierRate | undefined,
  ov: ShiftTierOverride | undefined,
): (ResolvedTierRate & { overridden: boolean }) | null {
  if (!ws && !ov) return null;
  return {
    wagePerHour: ov?.wagePerHour ?? ws?.wagePerHour ?? null,
    drinkPct: ov?.drinkPct ?? ws?.drinkPct ?? '0',
    happyHourDrinkPct: ov?.happyHourDrinkPct ?? ws?.happyHourDrinkPct ?? null,
    tipPct: ov?.tipPct ?? ws?.tipPct ?? '0',
    otAfterHours: ov?.otAfterHours ?? ws?.otAfterHours ?? null,
    targetSalesRm: ov?.targetSalesRm ?? ws?.targetSalesRm ?? null,
    happyHourStart: ws?.happyHourStart ?? '',
    happyHourEnd: ws?.happyHourEnd ?? '',
    overridden: !!ov,
  };
}

/**
 * A caller is scoped one of three ways: admin (everything), agency member
 * (their agency's assignments), or outlet member (assignments on shifts at their
 * own venues, read only). `outletIds` is empty for non-outlet callers.
 */
type Scope = { isAdmin: boolean; agencyId: string | null; outletIds: string[] };

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

/** Mine ownership: prefer assignment.user_id, fall back to legacy pr.id. */
function ownsMineAssignment(
  existing: { prId: string; userId?: string | null },
  userId: string,
  pr: { id: string } | null,
): boolean {
  if (existing.userId && existing.userId === userId) return true;
  return !!pr && existing.prId === pr.id;
}

export class ShiftAssignmentControllerClass {
  constructor(
    private shiftAssignmentRepository: ShiftAssignmentRepositoryClass,
    private shiftRepository: ShiftRepositoryClass,
    private prRepository: PrRepositoryClass,
    private agencyMemberRepository: AgencyMemberRepositoryClass,
    private authRepository: AuthRepositoryClass,
    private outletMemberRepository: OutletMemberRepositoryClass,
    // Approving overtime writes a voucher line, so this controller owns the one
    // path that turns attendance into money. Injected rather than reached for
    // through the payment-voucher controller: the RULES that make such a line
    // safe (component classification, the line-date assertion) live in the
    // repository, so going through it is what keeps this path under them.
    private paymentVoucherRepository: PaymentVoucherRepositoryClass,
  ) {}

  /**
   * Flat shift wages for this PR's tier on this shift: per-shift override from
   * Post Job "Pay by PR tier → Wages", else the outlet workspace tier rate.
   * Commission-only PRs have no wages row (null).
   */
  private async resolveTierWages(
    pr: { tier: string },
    shiftId: string,
    outletId: string,
  ): Promise<string | null> {
    const commissionOnly = pr.tier === 'commission_only';
    if (commissionOnly) return null;
    const tierLabel = PR_TIER_TO_OUTLET_LABEL[pr.tier] ?? null;
    const [rateByOutlet, overrideByShift] = await Promise.all([
      this.shiftAssignmentRepository.resolveTierRatesForOutlets({
        outletIds: [outletId],
        tierLabel,
        commissionOnly,
      }),
      this.shiftAssignmentRepository.resolveShiftTierOverrides({
        shiftIds: [shiftId],
        tierLabel,
        commissionOnly,
      }),
    ]);
    const rate = mergeRate(rateByOutlet.get(outletId), overrideByShift.get(shiftId));
    if (rate?.wagePerHour == null || rate.wagePerHour === '') return null;
    const n = Number(rate.wagePerHour);
    return Number.isFinite(n) ? n.toFixed(2) : null;
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

  /**
   * The signed-in PR's own shift assignments (mobile Shifts screen). Scoped
   * server-side to the caller's pr.id, resolved from their user account, since
   * PRs cannot read the agency/outlet-only list.
   */
  async listMine(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(200).json({ success: true, message: 'OK', data: [] });
      }
      const pr = await this.prRepository.getByUserId(userId);
      const assignments = await this.shiftAssignmentRepository.listForUser(userId);
      if (assignments.length === 0) {
        return res.status(200).json({ success: true, message: 'OK', data: [] });
      }

      // Resolve the PR's rate card once per outlet, then fold it onto each row so
      // the mobile app can compute wage/commission/OT/target against real rates
      // instead of hardcoded percentages. Tier still comes from the ops bridge
      // until /mine reads agency_pr.tier directly.
      const tier = pr?.tier ?? 'tier_1';
      const commissionOnly = tier === 'commission_only';
      const tierLabel = PR_TIER_TO_OUTLET_LABEL[tier] ?? null;
      // Outlet workspace default (per outlet) + per-shift override (per shift);
      // the override wins field-by-field in mergeRate. The drink menu is resolved
      // per outlet too, so the PR self-log lists this outlet's real drinks.
      const [rateByOutlet, overrideByShift, menuByOutlet] = await Promise.all([
        this.shiftAssignmentRepository.resolveTierRatesForOutlets({
          outletIds: assignments.map((a) => a.outletId),
          tierLabel,
          commissionOnly,
        }),
        this.shiftAssignmentRepository.resolveShiftTierOverrides({
          shiftIds: assignments.map((a) => a.shiftId),
          tierLabel,
          commissionOnly,
        }),
        this.shiftAssignmentRepository.resolveDrinkMenusForOutlets(
          assignments.map((a) => a.outletId),
        ),
      ]);
      const data = assignments.map((a) => ({
        ...a,
        tier,
        rate: mergeRate(rateByOutlet.get(a.outletId), overrideByShift.get(a.shiftId)),
        drinkMenu: menuByOutlet.get(a.outletId) ?? [],
      }));
      res.status(200).json({ success: true, message: 'OK', data });
    } catch (error) {
      logger.error('[ShiftAssignmentController.listMine] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * The signed-in PR stamps check-in on its OWN assignment. Scoped server-side
   * to the caller's pr.id (PRs cannot use the admin/agency PUT). Sets check_in_at
   * and advances the row to `confirmed`; refuses if the assignment is not the
   * caller's, is cancelled/no_show, or is already checked in.
   */
  async checkInMine(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(403).json({ success: false, message: 'No PR profile for this account', data: null });
      }
      const pr = await this.prRepository.getByUserId(userId);

      const id = paramId(req.params.id);
      const existing = await this.shiftAssignmentRepository.getById(id);
      // Hide assignments outside the caller's scope behind a 404.
      if (!existing || !ownsMineAssignment(existing, userId, pr)) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      // leave_approved = excused from the shift; leave_pending is NOT blocked —
      // a PR who shows up anyway checks in, which flips the row to `confirmed`
      // and thereby withdraws the pending request.
      if (
        existing.status === 'cancelled' ||
        existing.status === 'no_show' ||
        existing.status === 'leave_approved'
      ) {
        return res.status(400).json({ success: false, message: 'This shift can no longer be checked in', data: null });
      }
      if (existing.checkInAt) {
        return res.status(400).json({ success: false, message: 'Already checked in', data: null });
      }

      // The phone's claimed position. The distance is NOT taken from the body —
      // it is recomputed here from the outlet's own pin, because the phone is
      // the thing being verified and does not get to grade itself.
      const parsed = CheckInMineSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: 'Invalid location', data: parsed.error.issues });
      }
      const outletPin = await this.shiftAssignmentRepository.getOutletGeoFenceForAssignment(id);
      const verdict = verifyWithinGeoFence({ outlet: outletPin, device: parsed.data });
      if (!verdict.ok) {
        if (verdict.detail.reason === 'mock_location') {
          // The refusal itself leaves no row behind, so the log line IS the
          // audit trail for a disputed shift. Worth a warn, not an error: it is
          // a rejected attempt, not a broken server.
          logger.warn(
            `[ShiftAssignmentController.checkInMine] Mock location rejected: assignment=${id} pr=${pr?.id ?? userId}`,
          );
        }
        // 422: the request was well-formed, the PR is simply not at the venue.
        // Hard block — there is no demo/relax bypass on the server.
        return res.status(422).json({ success: false, message: verdict.message, data: verdict.detail });
      }
      const fix = verdict.fix;

      const actor = getActor(req);
      const assignment = await this.shiftAssignmentRepository.update(id, {
        checkInAt: new Date(),
        status: 'confirmed',
        ...(fix
          ? {
              checkInLat: String(fix.lat),
              checkInLng: String(fix.lng),
              checkInDistanceM: fix.distanceM,
              checkInAccuracyM: fix.accuracyM,
            }
          : {}),
        updatedBy: actor,
      });
      res.status(200).json({ success: true, message: 'Checked in', data: assignment });
    } catch (error) {
      logger.error('[ShiftAssignmentController.checkInMine] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * The signed-in PR stamps check-out on its OWN assignment. Requires a prior
   * check-in; sets check_out_at and seals the row as `completed` (the state the
   * weekly PV job rolls up).
   */
  /** "8pm", "20:00", "8.30pm" → minutes since midnight, or null when not a clock time. */
  private slotClockToMinutes(token: string): number | null {
    const m = token.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/i);
    if (!m) return null;
    let hour = Number(m[1]);
    const minutes = Number(m[2] ?? '0');
    const meridiem = m[3]?.toLowerCase();
    if (meridiem) {
      if (hour < 1 || hour > 12) return null;
      hour = (hour % 12) + (meridiem === 'pm' ? 12 : 0);
    } else if (hour > 23) return null;
    if (minutes > 59) return null;
    return hour * 60 + minutes;
  }

  /**
   * The scheduled end of a shift as a Date: shift_date + the slot's end time,
   * rolled to the next day when the window crosses midnight ("22:00 - 04:00").
   * Null when the free-text slot has no parseable window — then no clamp.
   */
  private scheduledShiftEnd(shiftDate: string, slot: string | null): Date | null {
    if (!slot) return null;
    const parts = slot.split(/[—–-]/);
    if (parts.length !== 2) return null;
    const start = this.slotClockToMinutes(parts[0]);
    const end = this.slotClockToMinutes(parts[1]);
    if (start == null || end == null) return null;
    const [y, m, d] = shiftDate.split('-').map(Number);
    const endDate = new Date(y, (m || 1) - 1, d || 1, Math.floor(end / 60), end % 60);
    if (end <= start) endDate.setDate(endDate.getDate() + 1);
    return endDate;
  }

  async checkOutMine(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(403).json({ success: false, message: 'No PR profile for this account', data: null });
      }
      const pr = await this.prRepository.getByUserId(userId);

      const id = paramId(req.params.id);
      const existing = await this.shiftAssignmentRepository.getById(id);
      if (!existing || !ownsMineAssignment(existing, userId, pr)) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      if (!existing.checkInAt) {
        return res.status(400).json({ success: false, message: 'Check in before checking out', data: null });
      }
      if (existing.checkOutAt) {
        return res.status(400).json({ success: false, message: 'Already checked out', data: null });
      }

      // Check-out RECORDS the position but never blocks on it: a PR who has
      // already worked the shift must always be able to close it, even if they
      // stepped out to the car park. The fence gates entry, not exit.
      const parsedOut = CheckInMineSchema.safeParse(req.body ?? {});
      if (!parsedOut.success) {
        return res.status(400).json({ success: false, message: 'Invalid location', data: parsedOut.error.issues });
      }
      const outletPinOut = await this.shiftAssignmentRepository.getOutletGeoFenceForAssignment(id);
      // Never blocks (see above), but a spoofed fix is still dropped by
      // describeDeviceFix rather than written to the row, so check-out closes
      // with no position instead of a fabricated one.
      if (parsedOut.data.mocked === true) {
        logger.warn(
          `[ShiftAssignmentController.checkOutMine] Mock location discarded: assignment=${id} pr=${pr?.id ?? userId}`,
        );
      }
      const outFix = describeDeviceFix({ outlet: outletPinOut, device: parsedOut.data });

      const actor = getActor(req);
      const shift = await this.shiftRepository.getById(existing.shiftId);
      const tierWages =
        shift && pr
          ? await this.resolveTierWages(pr, existing.shiftId, shift.outletId)
          : null;
      // Forgot-to-check-out guard: the stamp is CLAMPED to the shift's
      // scheduled end, so pay locks to the shift's duration — a check-out
      // hours late can't inflate wages/OT by itself. Hours past the window
      // only ever count once the agency approves OT (separate flow). Never
      // clamps below the check-in stamp (a PR who started late still closes
      // with a forward duration), and an unparseable slot means no clamp.
      const now = new Date();
      const scheduledEnd = shift ? this.scheduledShiftEnd(shift.shiftDate, shift.slot) : null;
      const clampTo =
        scheduledEnd && now > scheduledEnd && scheduledEnd > new Date(existing.checkInAt)
          ? scheduledEnd
          : now;
      // RECORD the overtime before the clamp destroys the evidence for it.
      //
      // The clamp overwrites `check_out_at` with the scheduled end, so after this
      // update the row no longer knows when the PR actually stopped. Deriving the
      // minutes later is therefore impossible — it has to happen here or not at
      // all, which is why migration 0077's columns sat unwritten and every hour of
      // overtime worked until now is unrecoverable.
      const overtime = overtimeFromStamps(new Date(existing.checkInAt), scheduledEnd, now);
      const assignment = await this.shiftAssignmentRepository.update(id, {
        checkOutAt: clampTo,
        // NULL status means "no overtime on this shift" — the overwhelming
        // majority of rows — so both columns are written only when there is a
        // real claim. `pending` is the only state a check-out may set: approval
        // belongs to the agency, and a shift that sealed itself approved would be
        // a PR authorising their own pay.
        ...(overtime.minutes != null
          ? { overtimeMinutes: overtime.minutes, overtimeStatus: 'pending' as const }
          : {}),
        status: 'completed',
        ...(outFix
          ? {
              checkOutLat: String(outFix.lat),
              checkOutLng: String(outFix.lng),
              checkOutDistanceM: outFix.distanceM,
              checkOutAccuracyM: outFix.accuracyM,
            }
          : {}),
        // Seal flat tier wages onto the assignment so PV / History match Post Job.
        ...(tierWages != null ? { payAmount: tierWages } : {}),
        updatedBy: actor,
      });
      // A forgotten check-out is worth seeing even though it claims nothing —
      // otherwise the only trace of it is a shift that quietly sealed at its
      // scheduled hours, and a PR who really did work late has no way to say so.
      if (overtime.reason === 'implausible_stamp') {
        logger.warn(
          `[shift-assignment.checkOut] ${id}: check-out ${overtime.elapsedHours?.toFixed(1)}h after ` +
            `check-in exceeds ${MAX_PLAUSIBLE_SHIFT_HOURS}h — no overtime recorded, raise it by hand if real`,
        );
      }
      // The stamp was clamped, so the PR worked past the scheduled end and those
      // hours are NOT money until the agency approves them. Nothing told the
      // agency before — overtime sat unseen unless someone opened the shift.
      // Recipient is the agency, not the PR: it is the agency's decision.
      //
      // Gated on a RECORDED claim rather than on `now > scheduledEnd`, which is
      // what it used to test. Those differ exactly where it matters: a check-out
      // two days late overran the window, so the old condition asked an agency to
      // approve overtime that no longer has a believable number behind it — and
      // now has no number at all, since the columns stay null.
      if (overtime.minutes != null) {
        const members = await this.agencyMemberRepository.listByAgency(existing.agencyId);
        const memberUserIds = members
          .map((m) => m.userId)
          .filter((userId): userId is string => !!userId);
        await notifyMany(memberUserIds, {
          kind: 'overtime_pending_approval',
          title: 'Overtime needs approval',
          body: `${pr?.name ?? 'PR'} worked ${overtime.minutes} min past the scheduled end${shift ? ` on ${shift.shiftDate}` : ''}`,
          payload: {
            assignmentId: id,
            prId: pr?.id ?? existing.prId,
            shiftId: existing.shiftId,
            scheduledEnd: scheduledEnd?.toISOString() ?? null,
            checkedOutAt: now.toISOString(),
            // The figure the agency is being asked to decide on, so the alert
            // does not send someone to the shift to work out what it means.
            overtimeMinutes: overtime.minutes,
          },
          actor,
        });
      }

      res.status(200).json({ success: true, message: 'Checked out', data: assignment });
    } catch (error) {
      logger.error('[ShiftAssignmentController.checkOutMine] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * The signed-in PR cancels its OWN upcoming assignment with a required reason.
   * Sets status='cancelled' and stores the reason on the reused `notes` column
   * (no new table) — the agency reads shift_assignment, so a cancelled row with
   * its reason IS the agency notification. A shift already checked in or
   * completed can no longer be cancelled.
   */
  async cancelMine(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(403).json({ success: false, message: 'No PR profile for this account', data: null });
      }
      const pr = await this.prRepository.getByUserId(userId);

      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      if (!reason) {
        return res.status(400).json({ success: false, message: 'A cancellation reason is required', data: null });
      }
      if (reason.length > 500) {
        return res.status(400).json({ success: false, message: 'Reason is too long (max 500)', data: null });
      }

      const id = paramId(req.params.id);
      const existing = await this.shiftAssignmentRepository.getById(id);
      if (!existing || !ownsMineAssignment(existing, userId, pr)) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      if (existing.status === 'cancelled') {
        return res.status(400).json({ success: false, message: 'This shift is already cancelled', data: null });
      }
      if (existing.status === 'leave_approved') {
        return res.status(400).json({ success: false, message: 'Leave is already approved for this shift — no need to cancel', data: null });
      }
      if (existing.checkInAt || existing.status === 'completed') {
        return res.status(400).json({
          success: false,
          message: 'This shift is in progress or completed and can no longer be cancelled',
          data: null,
        });
      }

      const actor = getActor(req);
      const assignment = await this.shiftAssignmentRepository.update(id, {
        status: 'cancelled',
        notes: reason,
        updatedBy: actor,
      });
      res.status(200).json({ success: true, message: 'Shift cancelled — your agency has been notified', data: assignment });

      // That message above has been promising this since the endpoint shipped,
      // and nothing was actually telling anyone. Now it is true.
      void this.notifyAgencyCoverNeeded({
        agencyId: existing.agencyId,
        assignmentId: id,
        shiftId: existing.shiftId,
        prName: pr?.name ?? 'PR',
        reason: 'cancelled',
        actor,
      });
    } catch (error) {
      logger.error('[ShiftAssignmentController.cancelMine] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * The signed-in PR files an MC/leave request on its OWN upcoming assignment
   * (Slice 2 of the cancel epic). Unlike cancelMine this is NOT immediate: the
   * row goes to `leave_pending` with the reason on the reused `notes` column and
   * waits for the agency to approve (→ `leave_approved`, excused, no penalty) or
   * reject (→ back to `assigned`). Checking in while pending withdraws the
   * request (see checkInMine).
   */
  async requestLeaveMine(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(403).json({ success: false, message: 'No PR profile for this account', data: null });
      }
      const pr = await this.prRepository.getByUserId(userId);

      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      if (!reason) {
        return res.status(400).json({ success: false, message: 'A leave reason is required', data: null });
      }
      if (reason.length > 500) {
        return res.status(400).json({ success: false, message: 'Reason is too long (max 500)', data: null });
      }

      // MC proof is REQUIRED: the agency approves an excused absence off this
      // photo, so a request with no picture would ask it to decide blind.
      // Validated here rather than trusted from the phone — same
      // bounded-image-array contract as payment_voucher_line.proof_photos.
      const rawPhotos = req.body?.proofPhotos;
      if (!Array.isArray(rawPhotos) || rawPhotos.length === 0) {
        return res.status(400).json({ success: false, message: 'An MC / leave photo is required', data: null });
      }
      if (rawPhotos.length > MAX_LEAVE_PHOTOS) {
        return res.status(400).json({ success: false, message: `Too many photos (max ${MAX_LEAVE_PHOTOS})`, data: null });
      }
      const proofPhotos: string[] = [];
      for (const photo of rawPhotos) {
        if (typeof photo !== 'string' || !photo.startsWith('data:image/')) {
          return res.status(400).json({ success: false, message: 'Each MC photo must be an image', data: null });
        }
        if (photo.length > MAX_LEAVE_PHOTO_CHARS) {
          return res.status(400).json({ success: false, message: 'Photo is too large — retake it', data: null });
        }
        proofPhotos.push(photo);
      }

      const id = paramId(req.params.id);
      const existing = await this.shiftAssignmentRepository.getById(id);
      if (!existing || !ownsMineAssignment(existing, userId, pr)) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      if (existing.status === 'leave_pending') {
        return res.status(400).json({ success: false, message: 'A leave request for this shift is already awaiting review', data: null });
      }
      if (existing.status === 'leave_approved') {
        return res.status(400).json({ success: false, message: 'Leave is already approved for this shift', data: null });
      }
      if (existing.status === 'cancelled' || existing.status === 'no_show') {
        return res.status(400).json({ success: false, message: 'This shift can no longer take a leave request', data: null });
      }
      if (existing.checkInAt || existing.status === 'completed') {
        return res.status(400).json({
          success: false,
          message: 'This shift is in progress or completed and can no longer take a leave request',
          data: null,
        });
      }

      const assignment = await this.shiftAssignmentRepository.update(id, {
        status: 'leave_pending',
        notes: reason,
        leaveProofPhotos: proofPhotos,
        updatedBy: getActor(req),
      });
      res.status(200).json({ success: true, message: 'Leave request sent — your agency will review it', data: assignment });
    } catch (error) {
      logger.error('[ShiftAssignmentController.requestLeaveMine] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Agency (or admin) approves a pending MC/leave request: the PR is excused
   * from the shift with no penalty. `leave_approved` is terminal like
   * `cancelled` — staffing/cost rollups skip it — but stays distinct so an
   * excused absence never reads as a penalty cancel.
   */
  async approveLeave(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const existing = await this.shiftAssignmentRepository.getById(id);
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && existing.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      if (existing.status !== 'leave_pending') {
        return res.status(400).json({ success: false, message: 'Only a pending leave request can be approved', data: null });
      }

      const actor = getActor(req);
      const assignment = await this.shiftAssignmentRepository.update(id, {
        status: 'leave_approved',
        updatedBy: actor,
      });
      res.status(200).json({ success: true, message: 'Leave approved — the PR is excused from this shift', data: assignment });

      // The slot is now open. Say so, rather than leaving it to be noticed.
      const excusedPr = await this.prRepository.getById(existing.prId);
      void this.notifyAgencyCoverNeeded({
        agencyId: existing.agencyId,
        assignmentId: id,
        shiftId: existing.shiftId,
        prName: excusedPr?.name ?? 'A PR',
        reason: 'leave_approved',
        actor,
      });
    } catch (error) {
      logger.error('[ShiftAssignmentController.approveLeave] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Agency (or admin) rejects a pending MC/leave request: the row returns to
   * `assigned` (the PR is still expected to work the shift). The reason keeps
   * living on `notes`, prefixed so the mobile app can tell the PR the request
   * was rejected; sliced to the column's 500 limit.
   */
  async rejectLeave(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const existing = await this.shiftAssignmentRepository.getById(id);
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && existing.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      if (existing.status !== 'leave_pending') {
        return res.status(400).json({ success: false, message: 'Only a pending leave request can be rejected', data: null });
      }

      const assignment = await this.shiftAssignmentRepository.update(id, {
        status: 'assigned',
        notes: `[Leave rejected] ${existing.notes ?? ''}`.slice(0, 500),
        updatedBy: getActor(req),
      });
      res.status(200).json({ success: true, message: 'Leave rejected — the PR stays on this shift', data: assignment });
    } catch (error) {
      logger.error('[ShiftAssignmentController.rejectLeave] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Overtime claims waiting on this agency — the worklist for the OT screen.
   *
   * Each row carries what the claim is WORTH, priced here rather than on the
   * client. The rate is daily wage ÷ a standard shift × 1.5, and it must be one
   * number everywhere: if the screen derived its own, an agency could approve a
   * figure that differs from the line the approval then writes.
   */
  async listPendingOvertime(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      const agencyId = scope.isAdmin ? (req.query.agencyId as string | undefined) : scope.agencyId;
      if (!agencyId) {
        return res.status(scope.isAdmin ? 400 : 403).json({
          success: false,
          message: scope.isAdmin
            ? 'agencyId is required'
            : 'No agency associated with this account',
          data: null,
        });
      }

      const rows = await this.shiftAssignmentRepository.listPendingOvertimeForAgency(agencyId);
      const claims = rows.map((row) => ({
        ...row,
        // The week this claim will be paid on, so the screen can say which
        // voucher is being held rather than leaving it to be worked out.
        week: weekOfDate(row.shiftDate),
        // Priced by the same function the approval uses, so what the agency
        // approves and what lands on the voucher cannot be two numbers. Zero
        // means the claim cannot be priced (a commission-only PR has no daily
        // wage) — the approval refuses that case rather than paying nothing.
        amount: formatCents(overtimeAmountCents(row.payAmount, row.overtimeMinutes)),
      }));
      res.status(200).json({ success: true, message: 'OK', data: claims });
    } catch (error) {
      logger.error('[ShiftAssignmentController.listPendingOvertime] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * The agency approves or rejects one overtime claim.
   *
   * This is the endpoint that turns recorded minutes into money, and it is the
   * ONLY thing that ever does — check-out records a claim and deliberately
   * cannot approve its own pay.
   *
   * Four rules are load-bearing here, none of them obvious from the signature:
   *
   *  1. **The line lands on the week the shift was WORKED**, not the week of the
   *     approval (owner's decision, 31 Jul 2026: "sent together with the week PV
   *     it originates from"). So the voucher is looked up by `weekOfDate(shift
   *     date)`. That rule is only coherent because a pending claim already blocks
   *     its own week from being sent — which is why the 409 below should be
   *     unreachable rather than routine.
   *  2. **The line is dated the shift's own date.** The repository refuses
   *     otherwise, and that refusal exists because a live voucher once carried
   *     overtime dated a day its shift was not on.
   *  3. **The amount is computed once** and written to both the line and
   *     `overtime_amount`. That column FREEZES the decision, so a later change to
   *     the tier rate cannot restate what somebody already approved.
   *  4. **Writing is idempotent.** The line is written before the decision is
   *     stamped, and a re-run finds the existing line by its `-ot` dedupe ref
   *     instead of paying twice. A retry after a half-completed approval must
   *     never be able to double the money.
   */
  async decideOvertime(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const decision = req.body?.decision;
      if (decision !== 'approve' && decision !== 'reject') {
        return res.status(400).json({
          success: false,
          message: "decision must be 'approve' or 'reject'",
          data: null,
        });
      }

      const context = await this.shiftAssignmentRepository.getOvertimeContext(id);
      if (!context) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      const { assignment, shiftDate, outletName } = context;

      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && assignment.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      // 409 rather than 400: the claim's state is a fact about the record, not a
      // malformed request, and the distinction matters to a screen deciding
      // whether to re-fetch. Already-decided lands here too, which is what makes
      // a double approval impossible rather than merely unlikely.
      if (assignment.overtimeStatus !== 'pending' || assignment.overtimeMinutes == null) {
        return res.status(409).json({
          success: false,
          message: assignment.overtimeStatus
            ? `This overtime claim was already ${assignment.overtimeStatus}`
            : 'There is no overtime claim on this shift',
          data: null,
        });
      }

      const actor = getActor(req);
      const minutes = assignment.overtimeMinutes;
      const pr = await this.prRepository.getById(assignment.prId);

      if (decision === 'reject') {
        // 0.00, not null: the column then records "decided, worth nothing"
        // rather than "never decided", which is the distinction the audit and
        // the send gate both read.
        const rejected = await this.shiftAssignmentRepository.claimOvertimeDecision({
          assignmentId: id,
          status: 'rejected',
          amount: '0.00',
          actor,
        });
        if (!rejected) {
          return res.status(409).json({
            success: false,
            message: 'This overtime claim was decided by someone else a moment ago',
            data: null,
          });
        }
        res.status(200).json({
          success: true,
          message: 'Overtime rejected — no line was added to the voucher',
          data: rejected,
        });
        void this.notifyPrOvertimeDecided({
          pr,
          decision: 'reject',
          minutes,
          shiftDate,
          assignmentId: id,
          amount: '0.00',
          actor,
        });
        return;
      }

      const week = weekOfDate(shiftDate);
      if (!week) {
        logger.error(
          `[ShiftAssignmentController.decideOvertime] ${id}: unusable shift date ${shiftDate}`,
        );
        return res.status(409).json({
          success: false,
          message: 'This shift has no usable date, so overtime cannot be placed on a week',
          data: null,
        });
      }

      const { line, amountCents } = buildOvertimeLine({
        assignmentId: id,
        shiftDate,
        minutes,
        payAmount: assignment.payAmount,
        outlet: outletName,
        actor,
      });
      // A commission-only PR has no sealed daily wage, so there is no hourly
      // rate to derive and nothing to approve. Refusing is the honest answer: a
      // 0.00 overtime line on a voucher reads as "we paid you nothing for those
      // hours", which is a different and worse claim than "this cannot be
      // priced". Reject the claim instead, or seal a wage on the assignment.
      if (amountCents <= 0) {
        return res.status(409).json({
          success: false,
          message:
            'This assignment carries no daily wage, so overtime cannot be priced. ' +
            'Seal a wage on the shift first, or reject the claim.',
          data: null,
        });
      }

      // CLAIM the decision before writing any money. This is the mutex: only one
      // request can move the row out of 'pending', so a double-clicked Approve
      // cannot put two overtime lines on the voucher. The read above is not
      // enough — two requests can both read 'pending' and both find no existing
      // line before either inserts one.
      const approved = await this.shiftAssignmentRepository.claimOvertimeDecision({
        assignmentId: id,
        status: 'approved',
        amount: line.amount,
        actor,
      });
      if (!approved) {
        return res.status(409).json({
          success: false,
          message: 'This overtime claim was decided by someone else a moment ago',
          data: null,
        });
      }

      let voucherId: string;
      try {
        const voucherResult = await this.paymentVoucherRepository.getOrCreateCurrentWeekDraft({
          prId: assignment.prId,
          userId: assignment.userId ?? pr?.userId,
          agencyId: assignment.agencyId,
          prName: pr?.name ?? 'PR',
          prIc: pr?.icNo,
          outlet: outletName,
          weekStart: week.weekStart,
          weekEnd: week.weekEnd,
          actor,
        });
        // Should be unreachable: a pending claim blocks its own week from being
        // sent, so the week cannot have closed underneath it. Kept because
        // "should be unreachable" is not "is", and appending to a document a PR
        // already signed is the exact failure the send gate was built to prevent.
        if (!voucherResult.ok) {
          await this.shiftAssignmentRepository.revertOvertimeDecision(id, actor);
          return res.status(409).json({ success: false, message: voucherResult.reason, data: null });
        }
        voucherId = voucherResult.voucher.id;

        // Belt and braces beside the claim above: the claim stops two concurrent
        // approvals, this stops a line being added twice across separate
        // attempts — a revert-then-retry arrives here with the first attempt's
        // line possibly already written.
        const full = await this.paymentVoucherRepository.getById(voucherId);
        const dedupe = overtimeDedupeRef(id);
        if (!full?.lines.some((l) => (l.ref ?? '').includes(dedupe))) {
          await this.paymentVoucherRepository.addLine(voucherId, line);
        }
      } catch (writeError) {
        // The decision is stamped but the money never landed. Put the claim back
        // so it reappears on the agency's worklist: an approval with no line is
        // unpaid overtime that nothing would ever surface again, and the send
        // gate would let the week close straight over it.
        await this.shiftAssignmentRepository.revertOvertimeDecision(id, actor);
        throw writeError;
      }

      res.status(200).json({
        success: true,
        message: `Overtime approved — RM${line.amount} added to the voucher for ${week.weekStart}`,
        data: { assignment: approved, voucherId, amount: line.amount, week },
      });
      void this.notifyPrOvertimeDecided({
        pr,
        decision: 'approve',
        minutes,
        shiftDate,
        assignmentId: id,
        amount: line.amount,
        actor,
      });
    } catch (error) {
      // The line-date rule is the caller's fault, not the server's, so it keeps
      // its 400 here as it does on the six payment-voucher routes. Reaching it
      // would mean the shift moved between the two reads above.
      if (error instanceof LineDateConflictError) {
        return res.status(400).json({ success: false, message: error.reason, data: null });
      }
      logger.error('[ShiftAssignmentController.decideOvertime] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Tells the PR what the agency decided about their overtime.
   *
   * Fire-and-forget after the response, like the other producers here: a
   * notification that fails must not undo a decision that succeeded. Rejection
   * is the case this exists for — an approved claim shows up as money on the
   * voucher, but a rejected one shows up as nothing at all, and an absence is
   * indistinguishable from a bug from where the PR is standing.
   */
  private async notifyPrOvertimeDecided(input: {
    pr: { userId?: string | null } | null;
    decision: 'approve' | 'reject';
    minutes: number;
    shiftDate: string;
    assignmentId: string;
    amount: string;
    actor: string;
  }): Promise<void> {
    try {
      const userId = input.pr?.userId;
      // A PR row with no user account cannot be notified — that is a data gap,
      // not a failure of this decision, so it is logged and not thrown.
      if (!userId) {
        logger.warn(
          `[ShiftAssignmentController.notifyPrOvertimeDecided] assignment=${input.assignmentId}: PR has no user account`,
        );
        return;
      }
      const approved = input.decision === 'approve';
      await notify({
        userId,
        kind: 'overtime_decided',
        title: approved ? 'Overtime approved' : 'Overtime not approved',
        body: approved
          ? `Your ${input.minutes} min of overtime on ${input.shiftDate} was approved — RM${input.amount} is on that week's payment voucher.`
          : `Your ${input.minutes} min of overtime on ${input.shiftDate} was not approved. Ask your agency if you think this is wrong.`,
        payload: {
          assignmentId: input.assignmentId,
          decision: input.decision,
          overtimeMinutes: input.minutes,
          shiftDate: input.shiftDate,
          amount: input.amount,
        },
        actor: input.actor,
      });
    } catch (error) {
      logger.error('[ShiftAssignmentController.notifyPrOvertimeDecided] Error:', error);
    }
  }

  /**
   * The agency's backfill worklist (Slice 3 of the cancel epic): upcoming slots
   * whose PR cancelled or had leave approved, while the shift is still below
   * its quantity. Surfacing the row on the roster IS the notification — same
   * philosophy as the cancel/leave rows themselves.
   */
  async listBackfill(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && !scope.agencyId) {
        return res.status(403).json({ success: false, message: 'No agency associated with this account', data: null });
      }
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const slots = await this.shiftAssignmentRepository.listBackfillSlots({
        fromDate: today,
        agencyId: scope.isAdmin ? (req.query.agencyId as string | undefined) : scope.agencyId!,
      });
      res.status(200).json({ success: true, message: 'OK', data: slots });
    } catch (error) {
      logger.error('[ShiftAssignmentController.listBackfill] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Where the agency's PRs stamped attendance on one date.
   *
   * Named for what it is. There is no continuous position feed anywhere in the
   * system — `shift_assignment` keeps a fix only at check-in and at check-out —
   * so this endpoint cannot and does not report a live location. The response
   * carries the stamp time next to every coordinate for exactly that reason: a
   * position with no time beside it reads as "now", which would be a lie about
   * data that may be hours old.
   *
   * Three states arrive distinctly, and none of them is inferred:
   *   - not stamped yet        -> checkIn === null
   *   - stamped, no fix stored -> checkIn set, its lat/lng null (pre-dates the
   *                               geofence columns, or the venue has no pin)
   *   - stamped with a fix     -> lat/lng plus the server's own distanceM
   *
   * `distanceM` is the server's recomputed metres from the venue pin, never a
   * distance the phone claimed, and `outlet.pinned` says whether a fence existed
   * at all — an unpinned venue accepts every check-in with no location check, so
   * "in range" is meaningless there and must not be rendered.
   *
   * Agency and admin only. Deliberately NOT opened to outlet callers, who can
   * already read the roster at their own venues: a worker's coordinates are a
   * step beyond that, and widening it is a privacy decision rather than a
   * scoping one.
   */
  async listAttendanceFixes(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && !scope.agencyId) {
        return res.status(403).json({ success: false, message: 'No agency associated with this account', data: null });
      }

      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const requested = req.query.date as string | undefined;
      if (requested !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(requested)) {
        return res.status(400).json({ success: false, message: 'date must be YYYY-MM-DD', data: null });
      }
      const shiftDate = requested ?? today;

      // An admin may name an agency; anyone else is pinned to their own. Without
      // an agency in either place there is nothing to scope to, so this refuses
      // rather than reading across every agency's workers.
      const agencyId = scope.isAdmin ? (req.query.agencyId as string | undefined) : scope.agencyId!;
      if (!agencyId) {
        return res.status(400).json({ success: false, message: 'agencyId is required', data: null });
      }

      const rows = await this.shiftAssignmentRepository.listAttendanceFixesForAgencyDate({ agencyId, shiftDate });

      // Coordinates leave as numbers: they are geometry, not money, and the
      // client does map maths on them. The string-numeric convention elsewhere
      // exists to protect currency precision, which does not apply here.
      const toNum = (value: string | null): number | null => {
        if (value === null) return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };
      const stamp = (
        at: Date | null,
        lat: string | null,
        lng: string | null,
        distanceM: number | null,
        accuracyM: number | null,
      ) =>
        at === null
          ? null
          : { at: at.toISOString(), lat: toNum(lat), lng: toNum(lng), distanceM, accuracyM };

      const data = rows.map((row) => {
        const outletLat = toNum(row.outletLat);
        const outletLng = toNum(row.outletLng);
        return {
          assignmentId: row.assignmentId,
          prId: row.prId,
          prName: row.prName,
          status: row.status,
          shiftDate: row.shiftDate,
          slot: row.slot,
          outlet: {
            id: row.outletId,
            name: row.outletName,
            lat: outletLat,
            lng: outletLng,
            radiusM: row.outletGeoFenceRadius,
            // No pin means check-in ran with no location check at all, which the
            // client has to show differently from "checked in, out of range".
            pinned: outletLat !== null && outletLng !== null,
          },
          checkIn: stamp(row.checkInAt, row.checkInLat, row.checkInLng, row.checkInDistanceM, row.checkInAccuracyM),
          checkOut: stamp(row.checkOutAt, row.checkOutLat, row.checkOutLng, row.checkOutDistanceM, row.checkOutAccuracyM),
        };
      });

      res.status(200).json({ success: true, message: 'OK', data });
    } catch (error) {
      logger.error('[ShiftAssignmentController.listAttendanceFixes] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Ranked replacement PRs for one released assignment: free that night, same
   * agency, active — ordered by the released PR's tier (rate parity), then
   * completed shifts at the outlet, then name. Filling the slot reuses the
   * normal POST / (create assignment), so no separate write path exists here.
   */
  async listReplacementCandidatesForAssignment(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const existing = await this.shiftAssignmentRepository.getById(id);
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && existing.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const shift = await this.shiftRepository.getById(existing.shiftId);
      if (!shift) return res.status(404).json({ success: false, message: 'Shift not found', data: null });

      const releasedPr = await this.prRepository.getById(existing.prId);
      const candidates = await this.shiftAssignmentRepository.listReplacementCandidates({
        agencyId: existing.agencyId,
        shiftDate: shift.shiftDate,
        outletId: shift.outletId,
        excludePrIds: [existing.prId],
        preferTier: releasedPr?.tier,
      });
      res.status(200).json({ success: true, message: 'OK', data: candidates });
    } catch (error) {
      logger.error('[ShiftAssignmentController.listReplacementCandidatesForAssignment] Error:', error);
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

      // Resolve ops identity: prefer userId (ensure temporary pr bridge), else prId.
      let pr = parsed.data.prId
        ? await this.prRepository.getById(parsed.data.prId)
        : parsed.data.userId
          ? await this.prRepository.getByUserId(parsed.data.userId)
          : null;
      if (!pr && parsed.data.userId) {
        pr = await this.prRepository.ensureOpsBridge({
          userId: parsed.data.userId,
          agencyId: shift.agencyId,
          actor: getActor(req),
        });
      }
      if (!pr) return res.status(404).json({ success: false, message: 'PR not found', data: null });
      if (pr.agencyId !== shift.agencyId) {
        return res.status(400).json({ success: false, message: 'PR belongs to a different agency', data: null });
      }

      // A PR may work TWO shifts on the same day — but only at different
      // times. Compared on a continuous timeline, so an overnight 22:00–04:00
      // also meets the next morning's 02:00–06:00 — the same-date-only test
      // this replaced never compared those, and overnight is the normal shape
      // here. Label-only slots carry no window and never clash.
      const others = await this.shiftAssignmentRepository.listForPr(pr.id);
      const clash = others.find(
        (a) =>
          a.shiftId !== shift.id &&
          !['cancelled', 'no_show', 'leave_approved'].includes(a.status) &&
          shiftsOverlap(shift.shiftDate, shift.slot, a.shiftDate, a.slot),
      );
      if (clash) {
        return res.status(400).json({
          success: false,
          message: `This PR already works ${clash.slot ?? 'a shift'} at ${clash.outletName ?? 'another outlet'} that day — pick a time that does not overlap.`,
          data: null,
        });
      }

      const actor = getActor(req);
      const tierWages = await this.resolveTierWages(pr, shift.id, shift.outletId);
      const assignment = await this.shiftAssignmentRepository.create({
        shiftId: shift.id,
        prId: pr.id,
        // Dual-write (0087) — ops will key on user_id after pr is dropped.
        userId: pr.userId ?? undefined,
        agencyId: shift.agencyId, // authoritative — derived from the shift
        status: parsed.data.status ?? 'assigned',
        // Client override wins; otherwise Post Job / workspace tier wages.
        payAmount: parsed.data.payAmount ?? tierWages ?? '0.00',
        checkInAt: parsed.data.checkInAt ? new Date(parsed.data.checkInAt) : undefined,
        checkOutAt: parsed.data.checkOutAt ? new Date(parsed.data.checkOutAt) : undefined,
        notes: parsed.data.notes,
        createdBy: actor,
        updatedBy: actor,
      });
      await this.notifyPr({
        prId: pr.id,
        kind: 'shift_assigned',
        title: 'You have a new shift',
        body: shift.shiftDate,
        payload: { assignmentId: assignment?.id, shiftId: shift.id, shiftDate: shift.shiftDate },
        actor,
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

  /**
   * Tell a PR about their own assignment.
   *
   * One place for the pr -> user hop, because `notify()` takes a USER id and
   * every caller here has a pr id. Deliberately not awaited into the response
   * path's success: notify() never throws, so a failed notification can never
   * undo the assignment the agency just made.
   */
  /**
   * Tell the agency a shift needs covering.
   *
   * Sick cover was almost entirely built already — the backfill worklist, the
   * ranked replacement candidates and the assign write all existed. What was
   * missing is this: the worklist sat there and nobody was told to look at it,
   * so a PR dropping out on the night was only noticed if someone happened to
   * open the panel.
   *
   * Addressed to the agency's members, like the overtime notification above and
   * unlike the three shift ones, which go to the PR. Never throws — a failed
   * notification must not undo the release the PR is entitled to.
   */
  private async notifyAgencyCoverNeeded(input: {
    agencyId: string;
    assignmentId: string;
    shiftId: string;
    prName: string;
    reason: 'cancelled' | 'leave_approved';
    actor: string;
  }): Promise<void> {
    try {
      const shift = await this.shiftRepository.getById(input.shiftId);
      const members = await this.agencyMemberRepository.listByAgency(input.agencyId);
      const recipients = members.filter((m) => m.status === 'active').map((m) => m.userId);
      if (recipients.length === 0) return;

      const when = shift
        ? `${shift.shiftDate}${shift.slot ? ` · ${shift.slot}` : ''}`
        : 'an upcoming shift';
      const why = input.reason === 'leave_approved' ? 'approved leave' : 'cancelled';

      await notifyMany(recipients, {
        kind: 'shift_cover_needed',
        title: `Cover needed — ${input.prName}`,
        body: `${input.prName} is off ${when} (${why}). Find a replacement on the roster's backfill list.`,
        payload: {
          assignmentId: input.assignmentId,
          shiftId: input.shiftId,
          reason: input.reason,
        },
        actor: input.actor,
      });
    } catch (error) {
      logger.error('[ShiftAssignmentController.notifyAgencyCoverNeeded] Error:', error);
    }
  }

  private async notifyPr(input: {
    prId: string;
    kind: 'shift_assigned' | 'shift_cancelled';
    title: string;
    body?: string;
    payload: Record<string, unknown>;
    actor: string;
  }): Promise<void> {
    const pr = await this.prRepository.getById(input.prId);
    if (!pr?.userId) return;
    await notify({
      userId: pr.userId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      payload: input.payload,
      actor: input.actor,
    });
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

      // Only on the transition INTO cancelled — re-saving an already-cancelled
      // row must not tell the PR twice.
      if (parsed.data.status === 'cancelled' && existing.status !== 'cancelled') {
        const shift = await this.shiftRepository.getById(existing.shiftId);
        await this.notifyPr({
          prId: existing.prId,
          kind: 'shift_cancelled',
          title: 'A shift was cancelled',
          body: shift?.shiftDate,
          payload: { assignmentId: existing.id, shiftId: existing.shiftId },
          actor: getActor(req),
        });
      }

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

      // Unassigning is a cancellation from the PR's side — the shift is simply
      // gone from their app, and until now nothing said so.
      const shift = await this.shiftRepository.getById(existing.shiftId);
      await this.notifyPr({
        prId: existing.prId,
        kind: 'shift_cancelled',
        title: 'You were removed from a shift',
        body: shift?.shiftDate,
        payload: { assignmentId: existing.id, shiftId: existing.shiftId },
        actor: getActor(req),
      });

      res.status(200).json({ success: true, message: 'PR unassigned from shift', data: null });
    } catch (error) {
      logger.error('[ShiftAssignmentController.remove] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}

// slotMinutes / slotWindowsOverlap now live in `@/util/slot-window` so the
// shift-timing edit guard in shift.controller.ts tests overlap the same way
// this one does. Two copies of "do these collide?" is how the two ends of one
// rule drift apart.
