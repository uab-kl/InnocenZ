import { Request, Response } from 'express';
import {
  ShiftAssignmentRepositoryClass,
  ResolvedTierRate,
  ShiftTierOverride,
  ShiftFullError,
  ShiftGoneError,
  TierFullError,
  PrUnavailableError,
  NON_STAFFING_STATUSES,
} from './shift-assignment.repository';
import { ASSIGNABLE_SHIFT_STATUSES, type ShiftStatus } from '@/features/shift/shift.model';
import { ShiftRepositoryClass } from '@/features/shift/shift.repository';
import { PrRepositoryClass } from '@/features/pr-personnel/pr.repository';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';
import { AgencyOutletRepository } from '@/features/agency/agency-outlet.repository';
import { AgencyPrRepository } from '@/features/agency/agency-pr.repository';
import { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository';
import { AuthRepositoryClass } from '@/features/auth/auth.repository';
import { notify, notifyMany } from '@/features/notification/notify.js';
import { Error } from '@/error/index';
import { paramId } from '@/util/params';
import { getActor } from '@/util/actor';
import { logger } from '@/util/logger';
import { saveProofPhotosToR2 } from '@/util/pv-proof-photo';
import { isOwnedUserKey } from '@/util/user-folder';
import {
  LineDateConflictError,
  MAX_PLAUSIBLE_SHIFT_HOURS,
  overtimeAmountCents,
  overtimeBasisAmount,
} from '@/features/payment-voucher/payment-voucher-audit';
import { formatCents } from '@/features/payment-voucher/payment-voucher-balance';
import { PaymentVoucherRepositoryClass } from '@/features/payment-voucher/payment-voucher.repository';
import { buildOvertimeLine, overtimeDedupeRef } from '@/features/payment-voucher/overtime-line';
import { weekOfDate } from '@/features/payment-voucher/payment-voucher-week';
import { sealCheckOut } from './seal-checkout';
import { computeCancelFee, type CancelFee } from './cancel-fee';
import { AgencyPenaltyRuleRepositoryClass } from '@/features/agency/agency-penalty-rule.repository.js';
import {
  PR_TIER_TO_OUTLET_LABEL,
  mergeRate,
  resolveTierWages as resolveTierWagesShared,
  resolveTierWageOutcome,
  resolveTierWageOutcomesForShifts,
} from './resolve-tier-wages';
import { shiftDayKey, shiftsOverlap } from '@/util/slot-window';
import { travelWarningFor } from './travel-gap';
import {
  CheckInMineSchema,
  CreateShiftAssignmentSchema,
  UpdateShiftAssignmentSchema,
} from '@/schema/shift-assignment.schema';
import { describeDeviceFix, verifyWithinGeoFence } from './check-in-geofence';
import {
  ShiftAssignmentFilter,
  ShiftAssignmentStatus,
  LeaveStatus,
  leaveStatusValues,
} from './shift-assignment.model';
import { OrgScope, resolveOrgScope, isOutletCaller } from '@/util/org-scope';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;
const PG_UNIQUE_VIOLATION = '23505';
/** MC / leave proof bounds — the phone downscales, the server still enforces. */
const MAX_LEAVE_PHOTOS = 5;
const MAX_LEAVE_PHOTO_CHARS = 3_000_000;

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

/**
 * Why this shift cannot take anybody, or null when it can — the ONE place both
 * seating lanes ask, so `create` and the re-staffing `update` cannot drift into
 * two different ideas of which statuses are open for business.
 *
 * Says which state it is in and what would change it, because "cannot assign" on
 * its own leaves the agency with nowhere to go: a draft is the OUTLET's to
 * publish, and a sealed shift is nobody's to reopen.
 */
function shiftNotAssignableReason(status: ShiftStatus): string | null {
  if (ASSIGNABLE_SHIFT_STATUSES.includes(status as (typeof ASSIGNABLE_SHIFT_STATUSES)[number])) {
    return null;
  }
  return status === 'draft'
    ? 'This shift is still a draft — the outlet has to publish it before anyone can be put on it.'
    : 'This shift is sealed: its payroll is closed, so no one can be added to it now.';
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
    // Cancelling seals a fee priced off the agency's cancellation bands, so
    // this controller needs to read them at the moment of the cancel — not at
    // payroll time, when the bands may since have changed.
    private agencyPenaltyRuleRepository: AgencyPenaltyRuleRepositoryClass,
    // Assigning a shift needs THIS agency's decision on THIS PR, and only
    // `agency_pr` holds it. The synthetic PR carries the approval of its PRIMARY
    // (oldest) membership, which is a different agency's answer whenever the PR
    // is on more than one roster — so `create` reads the row directly.
    private agencyPrRepository: AgencyPrRepository,
    // Assigning is a NEW commitment at a venue, so it needs the partnership to
    // still be live — a question only `agency_outlet` answers. `shift_agency`
    // says who was invited when the shift was posted and is never revoked, by
    // design, so it cannot be asked this.
    private agencyOutletRepository: AgencyOutletRepository,
  ) {}

  /**
   * Flat shift wages for this PR's tier on this shift: per-shift override from
   * Post Job "Pay by PR tier → Wages", else the outlet workspace tier rate.
   * Commission-only PRs have no wages row (null).
   */
  private resolveTierWages(
    pr: { tier: string },
    shiftId: string,
    outletId: string,
  ): Promise<string | null> {
    // Delegates to the shared resolver: cut-loss releases a PR through the same
    // seal, so it must reach the same day rate. Two copies would be two answers.
    return resolveTierWagesShared(this.shiftAssignmentRepository, pr, shiftId, outletId);
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
        // `?leaveStatus=pending` for the queue, `?leaveStatus=approved,rejected`
        // for history. Unknown words are dropped rather than passed to SQL, and
        // an all-invalid list stays an empty array so it matches nothing.
        leaveStatuses: req.query.leaveStatus
          ? String(req.query.leaveStatus)
              .split(',')
              .map((s) => s.trim())
              .filter((s): s is LeaveStatus =>
                (leaveStatusValues as readonly string[]).includes(s),
              )
          : undefined,
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
      // The clamp, the overtime claim and the wage — all of it. Shared with the
      // cut-loss release path so a PR sent home early and a PR who taps out
      // themselves are paid identically for identical hours; see seal-checkout.ts.
      const seal = sealCheckOut({
        checkInAt: new Date(existing.checkInAt),
        shiftDate: shift?.shiftDate ?? null,
        slot: shift?.slot ?? null,
        dayRate: tierWages,
        now,
      });
      const { scheduled, overtime, earned } = seal;
      const scheduledEnd = scheduled?.end ?? null;
      const clampTo = seal.checkOutAt;
      const assignment = await this.shiftAssignmentRepository.update(id, {
        ...seal.columns,
        // The only thing this path adds over the shared close: where the phone
        // said it was. A release has no fix behind it at all, which is precisely
        // why `released_by` exists to tell the two apart.
        ...(outFix
          ? {
              checkOutLat: String(outFix.lat),
              checkOutLng: String(outFix.lng),
              checkOutDistanceM: outFix.distanceM,
              checkOutAccuracyM: outFix.accuracyM,
            }
          : {}),
        updatedBy: actor,
      });
      // A sealed 0.00 is the one wage outcome worth interrupting someone over.
      // The stamps put this PR entirely outside their own shift window — the
      // shape that billed assignment 6574b2ee a full day for twelve seconds —
      // and paying nothing is correct but must never happen quietly.
      if (earned.rule === 'never_present') {
        logger.error(
          `[shift-assignment.checkOut] ${id}: check-in ${existing.checkInAt} .. check-out ` +
            `${clampTo.toISOString()} falls outside the scheduled window ` +
            `(${scheduled?.start.toISOString()} .. ${scheduled?.end.toISOString()}) — sealed 0.00`,
        );
      } else if (earned.rule === 'pro_rata') {
        logger.info(
          `[shift-assignment.checkOut] ${id}: pro-rata ${earned.workedMinutes}/${earned.scheduledMinutes} min ` +
            `of RM${earned.dayRate} — sealed RM${earned.amount}`,
        );
      }
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

      // Seal the cancellation fee NOW, against the bands in force at this
      // moment. The PR was shown this number on the Cancel button; storing it
      // is what stops an later edit to the agency's bands from restating what
      // they owe. `payAmount` is still the forecast day rate here — the shift
      // was never worked, so nothing has sealed it down.
      let fee: CancelFee = { feeRm: '0.00', pct: 0, noticeHours: '0.00' };
      try {
        const shift = await this.shiftRepository.getById(existing.shiftId);
        const rules = await this.agencyPenaltyRuleRepository.listByAgencyId(existing.agencyId);

        // The basis is the TIER RATE for this outlet, not `pay_amount`.
        //
        // `pay_amount` is `clientPayAmount ?? tierRate ?? 0` at assign time, so a
        // hand-entered figure silently overrides the rate card — live rows carry
        // 40.00 and 55.00 against Tier I/III cards of 500 and 700. Charging 50%
        // of those bills RM 20 instead of RM 250. The rate card is what the PR's
        // tier actually entitles them to, so it is what a percentage of "their
        // daily wage" has to mean.
        //
        // Falls back to `pay_amount` only when no card resolves — a
        // commission-only PR has no daily wage, and `resolveTierWages` returns
        // null for them, which correctly yields no fee rather than a wrong one.
        let basis: string | null = null;
        if (pr?.tier && shift?.outletId) {
          // The same resolver check-out and cut-loss seal against — two copies
          // would be two answers to "what does this shift pay".
          basis = await this.resolveTierWages(
            { tier: pr.tier },
            existing.shiftId,
            shift.outletId,
          );
        }

        fee = computeCancelFee({
          rule: rules.find((r) => r.ruleType === 'cancellation'),
          dailyWageRm: basis ?? existing.payAmount,
          shiftDate: shift?.shiftDate ?? '',
          slot: shift?.slot ?? null,
        });
      } catch (feeError) {
        // A fee that cannot be priced must not block the PR from cancelling —
        // they still need out of the shift, and the agency still needs telling.
        // It stays NULL, which reads as "never sealed", not as "nothing owed".
        logger.error('[ShiftAssignmentController.cancelMine] cancel fee:', feeError);
      }

      const assignment = await this.shiftAssignmentRepository.update(id, {
        status: 'cancelled',
        notes: reason,
        updatedBy: actor,
        cancelFeeRm: fee.feeRm,
        cancelFeePct: fee.pct,
        cancelNoticeHours: fee.noticeHours,
        // charged_at stays NULL: sealed, owed, and not yet collected.
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
      // A fresh photo is a data URL; a photo already stored on this assignment
      // comes back as this user's own R2 key (`user/{userId}/leave/…`), so an
      // amend flow can re-send what the server served without the PR having to
      // re-photograph the MC. saveProofPhotosToR2 passes owned keys through and
      // drops foreign ones.
      for (const photo of rawPhotos) {
        // Owner is proven by the uuid head so BOTH `user/<uuid>/leave/…` and
        // `user/pr/<slug>-<id8>/leave/…` are accepted as this PR's own key.
        const isOwnedKey =
          typeof photo === 'string' &&
          isOwnedUserKey(photo, userId) &&
          photo.includes('/leave/');
        if (typeof photo !== 'string' || (!photo.startsWith('data:image/') && !isOwnedKey)) {
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

      // Validated as data URLs above (the phone only ever sends those), then
      // stored as bare R2 keys under user/{userId}/leave/mc-…. On any R2
      // failure the data URLs store unchanged — a storage hiccup must never
      // block an MC from being filed. Old rows keep their data URLs; readers
      // tolerate both formats.
      const storedProofPhotos = await saveProofPhotosToR2({
        userId,
        kind: 'leave',
        photos: proofPhotos,
      });

      const assignment = await this.shiftAssignmentRepository.update(id, {
        status: 'leave_pending',
        notes: reason,
        leaveProofPhotos: storedProofPhotos,
        // Awaiting a decision — decidedAt/By stay null because nobody decided.
        leaveStatus: 'pending',
        leaveDecidedAt: null,
        leaveDecidedBy: null,
        updatedBy: getActor(req),
      });
      const actor = getActor(req);
      res.status(200).json({ success: true, message: 'Leave request sent — your agency will review it', data: assignment });

      // Same false promise cancelMine used to make: that message has been
      // saying "your agency will review it" since the endpoint shipped, while
      // nothing told the agency there was anything to review.
      void this.notifyAgencyLeaveRequested({
        agencyId: existing.agencyId,
        assignmentId: id,
        shiftId: existing.shiftId,
        prName: pr?.name ?? 'PR',
        reason,
        actor,
      });
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
        // The decision as DATA, so history can prove who excused this shift.
        leaveStatus: 'approved',
        leaveDecidedAt: new Date(),
        leaveDecidedBy: actor,
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

      // And tell the PR, who until now watched the agency get notified about
      // their own MC while they heard nothing either way.
      void this.notifyPr({
        prId: existing.prId,
        kind: 'leave_decided',
        title: 'MC / leave approved',
        body: 'Your agency approved the request — you are excused from this shift with no penalty.',
        payload: { assignmentId: id, shiftId: existing.shiftId, decision: 'approved' },
        actor,
      }).catch((error) => {
        logger.error('[ShiftAssignmentController.approveLeave] notify Error:', error);
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

      const rejectActor = getActor(req);
      const assignment = await this.shiftAssignmentRepository.update(id, {
        status: 'assigned',
        // The '[Leave rejected]' prefix is kept for now because the PR app still
        // reads it, but it is no longer how the rejection is KNOWN — leaveStatus
        // is. The prefix is display text; this is the record.
        notes: `[Leave rejected] ${existing.notes ?? ''}`.slice(0, 500),
        leaveStatus: 'rejected',
        leaveDecidedAt: new Date(),
        leaveDecidedBy: rejectActor,
        updatedBy: rejectActor,
      });
      res.status(200).json({ success: true, message: 'Leave rejected — the PR stays on this shift', data: assignment });

      // The PR is still expected to work this shift — of the two outcomes this
      // is the one they MUST be told about, and it was the one telling nobody.
      void this.notifyPr({
        prId: existing.prId,
        kind: 'leave_decided',
        title: 'MC / leave rejected',
        body: 'Your agency rejected the request — you are still on this shift.',
        payload: { assignmentId: id, shiftId: existing.shiftId, decision: 'rejected' },
        actor: getActor(req),
      }).catch((error) => {
        logger.error('[ShiftAssignmentController.rejectLeave] notify Error:', error);
      });
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
        //
        // The basis is the FULL day rate, never the sealed `payAmount`: since
        // 0097 that amount can be pro-rated, and a PR who came in late and
        // stayed late would otherwise have their overtime rate cut by exactly
        // the minutes they were short at the start.
        //
        // Divided by the SHIFT'S window, not a flat six hours, so the premium is
        // 1.5× of what an hour on this shift is really worth — the same divisor
        // the wage was pro-rated at.
        amount: formatCents(
          overtimeAmountCents(overtimeBasisAmount(row), row.overtimeMinutes, row.scheduledMinutes),
        ),
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
        // The full day rate, not the possibly pro-rated sealed amount — the OT
        // rate is a property of the rate card, not of how much this particular
        // night happened to earn.
        payAmount: overtimeBasisAmount(assignment),
        // Same window the wage was pro-rated at, so the 1.5× premium is 1.5× of
        // this shift's own ordinary hour rather than of a notional six-hour one.
        scheduledMinutes: assignment.scheduledMinutes,
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
        // Drops tiers the shift has no remaining demand for, so the sheet never
        // offers a PR the assign call would refuse with a 409.
        shiftId: existing.shiftId,
      });
      res.status(200).json({ success: true, message: 'OK', data: candidates });
    } catch (error) {
      logger.error('[ShiftAssignmentController.listReplacementCandidatesForAssignment] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * What a PR would earn on each of the given shifts, BEFORE anyone assigns them.
   *
   * Read-only, and deliberately answered by `resolveTierWageOutcomesForShifts` —
   * the same resolver `create` gates on and check-out later seals against. The
   * roster sheet used to show the SHIFT's `pay_per_hour`, one number that did not
   * move when you picked a different PR, so a Tier I and a Servant read the same
   * wage on the same card.
   *
   * It returns the OUTCOME, not a number, because the three cases must not look
   * alike: `commission_only` is a PR correctly earning no day rate, while
   * `unpriced` is a tier this outlet never costed — and `create` REFUSES that one
   * unless the agency names a payAmount itself. Showing it here turns a mystery
   * refusal at assign time into a fact on the card before the click.
   *
   * Shifts outside the caller's agency are dropped rather than reported, so this
   * cannot be used to probe for another agency's shift ids.
   */
  async wagePreview(req: Request, res: Response) {
    try {
      // A day's shifts at one outlet is a handful; the cap only stops a caller
      // turning one request into an unbounded fan-out.
      const MAX_SHIFTS = 60;
      const prId = typeof req.query.prId === 'string' ? req.query.prId.trim() : '';
      const rawShiftIds = typeof req.query.shiftIds === 'string' ? req.query.shiftIds : '';
      const shiftIds = [
        ...new Set(
          rawShiftIds
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ].slice(0, MAX_SHIFTS);

      if (!prId || shiftIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'prId and a non-empty shiftIds list are required',
          data: null,
        });
      }

      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && !scope.agencyId) {
        return res.status(403).json({ success: false, message: 'No agency associated with this account', data: null });
      }

      // Priced FOR the asking agency, and gated on that agency's own roster.
      //
      // ⚠️ This carried the same `pr.agencyId !== scope.agencyId` test that
      // `create` had, and it is wrong for the same reason: `pr.agencyId` is one
      // value on a person who holds an `agency_pr` row PER AGENCY, so it names
      // whichever agency signed them first. The preview therefore 404'd for
      // exactly the multi-roster PRs that assigning now accepts — the roster
      // rendered that 404 as "rate unavailable" on a PR it was about to book.
      //
      // `agency_pr` is the authority, as it is in `create`: a person is on this
      // agency's roster or they are not, and the tier that prices the shift is
      // the one THIS agency grades them at.
      const pr = await this.prRepository.getById(prId, scope.agencyId ?? undefined);
      if (!pr) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      if (!scope.isAdmin) {
        const onOurRoster = (await this.agencyPrRepository.listByUser(pr.userId)).some(
          (row) => row.agencyId === scope.agencyId,
        );
        if (!onOurRoster) {
          return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
        }
      }

      // ⚠️ NOT `s.agencyId === scope.agencyId`. That column is the shift's ANCHOR —
      // the first agency the outlet addressed — and since 0124 a shift can be posted
      // to several. Scoping by it meant every agency EXCEPT the anchor got no wage
      // back for a shared shift, and the roster rendered that silence as
      // "rate unavailable" on a shift whose rate card is perfectly well defined.
      // Visibility belongs to `shift_agency`, exactly as the migration warns.
      const invited = await this.shiftRepository.listAgencyIdsForShifts(shiftIds);
      const shifts = (await Promise.all(shiftIds.map((id) => this.shiftRepository.getById(id))))
        .filter((s): s is NonNullable<typeof s> => s !== null)
        .filter(
          (s) =>
            scope.isAdmin ||
            (scope.agencyId !== null && (invited.get(s.id) ?? []).includes(scope.agencyId)),
        );

      const outcomes = await resolveTierWageOutcomesForShifts(
        this.shiftAssignmentRepository,
        // A PR with no tier resolves to no label, which the resolver reports as
        // `unpriced` — the honest answer, not a zero.
        { tier: pr.tier ?? '' },
        shifts.map((s) => ({ shiftId: s.id, outletId: s.outletId })),
      );

      const data = [...outcomes.entries()].map(([shiftId, outcome]) => ({ shiftId, ...outcome }));
      res.status(200).json({ success: true, message: 'OK', data });
    } catch (error) {
      logger.error('[ShiftAssignmentController.wagePreview] Error:', error);
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

      const shift = await this.shiftRepository.getById(parsed.data.shiftId);
      if (!shift) return res.status(404).json({ success: false, message: 'Shift not found', data: null });
      // MAY THIS CALLER STAFF THIS SHIFT — asked of `shift_agency`, never of
      // `shift.agency_id`.
      //
      // This was `shift.agencyId !== scope.agencyId`, which is the ANCHOR (0124):
      // the first agency the outlet addressed. On a shift posted to two agencies
      // that passes for exactly one of them, so the second agency saw the open
      // shift in its own planner — the list query goes through `shift_agency`
      // correctly — clicked it, and got "Shift not found" on a shift it had
      // genuinely been invited to.
      if (
        !scope.isAdmin &&
        (!scope.agencyId ||
          !(await this.shiftRepository.isAgencyInvited(shift.id, scope.agencyId)))
      ) {
        return res.status(404).json({ success: false, message: 'Shift not found', data: null });
      }

      // IS THIS SHIFT OPEN FOR BUSINESS AT ALL? Asked before anything about the
      // caller, because it is a fact about the shift and cheap to answer.
      //
      // ⚠️ Nothing here tested `shift.status` before, so a `draft` — a shift the
      // outlet has not published and is still editing — took assignments, and so
      // did a `sealed` one whose payroll had already closed. Both clients had
      // guessed at a rule and guessed differently; the server, which is the only
      // one that decides anything, had no rule at all.
      const notAssignable = shiftNotAssignableReason(shift.status);
      if (notAssignable) {
        return res.status(400).json({ success: false, message: notAssignable, data: null });
      }

      /**
       * WHO IS DOING THE ASSIGNING — the caller, not the shift's anchor.
       *
       * Everything below asks about the ACTING agency: which agency an ops
       * bridge belongs to, whose PR this is, who accepted them, and which of a
       * PR's other bookings count as "someone else's". All four read
       * `shift.agencyId`, so on a shared shift they silently answered for the
       * anchor. Only the final INSERT had been corrected — which is exactly how
       * a fix named after its symptom leaves its siblings in place.
       *
       * Admin and outlet callers have no agency of their own and keep the
       * anchor: for them it is the only agency the shift names.
       */
      const actingAgencyId = scope.agencyId ?? shift.agencyId;

      // IS THE PARTNERSHIP STILL LIVE? Being invited to the shift is not enough.
      //
      // `shift_agency` records who was invited when the shift was POSTED, and it
      // is deliberately never revoked — that is what lets an agency finish PRs it
      // already rostered after a venue ends the link (0127). But finishing
      // existing work and taking on NEW work are different acts, and only the
      // first survives the ending. Without this an ended partnership still let
      // the agency staff fresh seats indefinitely, which made "ended" mean
      // nothing on the one screen where it costs money.
      //
      // This is the caller `listApprovedOutletIdsForAgency` was written for and
      // never had: `outlet.repository`'s own note says anything making a NEW
      // commitment must read it, and until now nothing did.
      if (scope.agencyId) {
        const staffable =
          await this.agencyOutletRepository.listApprovedOutletIdsForAgency(scope.agencyId);
        if (!staffable.includes(shift.outletId)) {
          // ⚠️ ONE EXCEPTION, and it is the whole point of the design: a shift
          // this agency is ALREADY staffing stays fillable. Otherwise the guard
          // would strand the very work it exists to protect — a PR no-shows on a
          // shift the agency already holds, and the agency cannot put anyone in
          // their place because the venue ended the link that morning. Backfilling
          // a seat you already own is finishing, not starting.
          //
          // Scoped to THIS agency's rows: another agency's presence on a shared
          // shift is not a licence for this one.
          const ours = (await this.shiftAssignmentRepository.listByShift(shift.id)).some(
            (row) =>
              row.agencyId === scope.agencyId &&
              !NON_STAFFING_STATUSES.includes(
                row.status as (typeof NON_STAFFING_STATUSES)[number],
              ),
          );
          if (!ours) {
            return res.status(400).json({
              success: false,
              message:
                'This venue is no longer partnered with your agency — you can finish shifts you are already staffing, but not take on new ones.',
              data: null,
            });
          }
        }
      }

      // Resolve ops identity: prefer userId (ensure temporary pr bridge), else prId.
      //
      // ⚠️ RESOLVED FOR THE ACTING AGENCY. Without it both lookups fall back to
      // the person's OLDEST `agency_pr` row, so `pr.tier` belonged to whichever
      // agency signed them up first — and that same `pr` is handed to
      // `resolveTierWageOutcome`, whose answer becomes `payAmount`. The SEAT was
      // taken from the acting agency's tier while the WAGE was priced off a
      // different agency's grade for the same person. Alice is tier_2 at Atlas
      // and tier_1 at three others: every shift those three sold her was priced
      // at Atlas's grade.
      let pr = parsed.data.prId
        ? await this.prRepository.getById(parsed.data.prId, actingAgencyId)
        : parsed.data.userId
          ? await this.prRepository.getByUserId(parsed.data.userId, actingAgencyId)
          : null;
      if (!pr && parsed.data.userId) {
        pr = await this.prRepository.ensureOpsBridge({
          userId: parsed.data.userId,
          agencyId: actingAgencyId,
          actor: getActor(req),
        });
      }
      if (!pr) return res.status(404).json({ success: false, message: 'PR not found', data: null });

      /**
       * IS THIS PERSON ON THE ACTING AGENCY'S ROSTER, AND ACCEPTED?
       *
       * ⚠️ There used to be a `pr.agencyId !== actingAgencyId` test above this,
       * and it was wrong by construction, not by a wrong operand: `pr.agencyId`
       * is ONE value on a person who holds an `agency_pr` row per agency, and it
       * resolves to a single membership. A PR legitimately on two rosters
       * therefore failed for whichever agency was not the one it resolved to —
       * so agency B, acting entirely within its rights, was refused for a PR
       * sitting in its own planner.
       *
       * `agency_pr` is the only thing that can answer this, because it is the
       * only place the relationship is stored per agency. That makes this check
       * the single authority, which also closes a hole the old pair left: the
       * membership test was `if (membership && …)`, so someone with NO
       * membership at the acting agency fell straight through it.
       *
       * `ensureOpsBridge` above writes an APPROVED row, so a first-time bridge
       * still passes.
       */
      const membership = (await this.agencyPrRepository.listByUser(pr.userId)).find(
        (row) => row.agencyId === actingAgencyId,
      );
      if (!membership) {
        return res.status(400).json({
          success: false,
          // ⚠️ SAYS NOTHING ABOUT ANY OTHER AGENCY, deliberately. "PR belongs to
          // a different agency" — the old wording — told agency B that this
          // person is on somebody else's roster, which is a rival's commercial
          // information and none of B's business. Worse, it made this endpoint a
          // probe: fire it at a list of people and the error message sorts them
          // into "unknown" and "signed elsewhere".
          //
          // This is the same rule the day-guard follows, where the refusal for
          // "booked by another agency" reuses the self-declared-block wording
          // word for word so the two cannot be told apart.
          message: 'This PR is not on your roster — add them under Manage PR first.',
          data: null,
        });
      }
      // Their status WITH THIS AGENCY is the agency's own fact, so it can be
      // stated plainly — unlike anything about the rosters they are on.
      if (membership.approveStatus !== 'approved') {
        // ⚠️ The live `agency_pr_approve_status` enum has FIVE labels —
        // pending, approved, rejected, leave_pending, left — while the model
        // declares three, so TypeScript sees this as exhaustive when it is not.
        // Everything that was not 'rejected' fell through to "awaiting your
        // approval", which told an operator that a PR who had LEFT the agency
        // was sitting in a queue, and sent them to Approvals to look for someone
        // who will never appear there. Each state now says what is actually true
        // and where the remedy is.
        const status = membership.approveStatus as string;
        return res.status(400).json({
          success: false,
          message:
            status === 'rejected'
              ? 'This PR was declined by your agency and cannot be assigned.'
              : status === 'left'
                ? 'This PR has left your agency — re-add them under Manage PR before assigning a shift.'
                : status === 'leave_pending'
                  ? 'This PR has asked to leave your agency — settle that under Approvals before assigning a shift.'
                  : 'This PR is still awaiting your approval — approve them under Approvals before assigning a shift.',
          data: null,
        });
      }

      // A PR may work TWO shifts on the same day — but only at different
      // times. Compared on a continuous timeline, so an overnight 22:00–04:00
      // also meets the next morning's 02:00–06:00 — the same-date-only test
      // this replaced never compared those, and overnight is the normal shape
      // here. Label-only slots carry no window and never clash.
      //
      // A CLOSED shift never clashes. `completed` joins the excluded statuses
      // because cut-loss releases a PR mid-shift precisely so they can be sent
      // somewhere else the same night: their released row still carries the
      // original window, so an overlap test that counted it would refuse the
      // re-assignment the release existed to make possible. A row is closed when
      // it has a check-out stamp, and a stamp is a fact about the past — it
      // cannot collide with work not yet done.
      const others = await this.shiftAssignmentRepository.listForPr(pr.id);
      const clash = others.find(
        (a) =>
          a.shiftId !== shift.id &&
          !['cancelled', 'no_show', 'leave_approved', 'completed'].includes(a.status) &&
          !a.checkOutAt &&
          shiftsOverlap(shift.shiftDate, shift.slot, a.shiftDate, a.slot),
      );
      if (clash) {
        return res.status(400).json({
          success: false,
          message: `This PR already works ${clash.slot ?? 'a shift'} at ${clash.outletName ?? 'another outlet'} that day — pick a time that does not overlap.`,
          data: null,
        });
      }

      // THE DAY BELONGS TO THE PR (owner's rule, 18 Aug 2026).
      //
      // A confirmed assignment at ANY agency takes that calendar day off the market
      // for every OTHER agency. Two agencies can hold the same PR on their rosters,
      // and without this both can book her for the same night — the overlap guard
      // above only catches shifts that actually collide, so an afternoon at A and a
      // night at B sail through and the PR discovers the double-booking herself.
      //
      // ⚠️ The refusal deliberately reuses the SELF-DECLARED BLOCK wording, word for
      // word. Agency B must not be able to tell "she took the day off" from "she is
      // booked by someone else": both are true statements about her availability and
      // neither mentions an agency. A distinguishable message would turn this guard
      // into a probe for reading a rival's roster one day at a time.
      //
      // Same-agency doubles still work — the rule is about what OTHER agencies may
      // do, and an agency already knows its own bookings.
      const dayKey = shiftDayKey(shift.shiftDate);
      const committedElsewhere = others.find(
        (a) =>
          a.shiftId !== shift.id &&
          // "Booked by SOMEONE ELSE" means an agency other than the one acting.
          // Against the anchor, an agency sharing a shift measured its own other
          // bookings as a rival's and refused its own PR.
          a.agencyId !== actingAgencyId &&
          !NON_STAFFING_STATUSES.includes(a.status as (typeof NON_STAFFING_STATUSES)[number]) &&
          shiftDayKey(a.shiftDate) === dayKey,
      );
      if (committedElsewhere) {
        return res.status(400).json({
          success: false,
          message: `This PR has marked ${dayKey} as unavailable — pick someone else for this shift.`,
          data: null,
        });
      }

      const actor = getActor(req);

      // The outlet must have PRICED this PR's tier. Nothing checks that the tier
      // was REQUESTED (shift_pay_tier.pr_count is still read by nobody — that is
      // its own task); this checks only that assigning them can produce a wage.
      //
      // It has to, because the fallback below spends a missing rate as '0.00' and
      // returns 201: a PR booked onto a tier the outlet never costed worked the
      // night for nothing and the screen said "PR assigned to shift". A refusal
      // is the only outcome that reaches anyone in time.
      //
      // `commission_only` is NOT unpriced — that PR is correctly on no day rate —
      // which is why this reads the outcome and not the number.
      const wageOutcome = await resolveTierWageOutcome(
        this.shiftAssignmentRepository,
        pr,
        shift.id,
        shift.outletId,
      );
      // An explicit payAmount is the agency naming the wage itself, so a missing
      // rate card is no longer the authority and must not block them.
      if (wageOutcome.kind === 'unpriced' && parsed.data.payAmount === undefined) {
        return res.status(409).json({
          success: false,
          message: `This outlet has no ${wageOutcome.tierLabel ?? 'rate'} wage for this shift — set the tier's rate in the outlet's workspace, or send an explicit pay amount. Assigning now would book the PR at RM0.00.`,
          data: null,
        });
      }
      const tierWages = wageOutcome.kind === 'priced' ? wageOutcome.wage : null;
      const assignment = await this.shiftAssignmentRepository.create({
        shiftId: shift.id,
        prId: pr.id,
        // Dual-write (0087) — ops will key on user_id after pr is dropped.
        userId: pr.userId ?? undefined,
        // WHICH AGENCY SUPPLIED THIS PR — the caller, not the shift.
        //
        // `shift.agency_id` is only the ANCHOR (0124): the first agency the outlet
        // addressed. Stamping it here meant that when a second invited agency supplied
        // a PR, the delivery was recorded as the anchor's — and this column is what
        // per-agency fulfilment AND the money chain read, since vouchers derive from
        // `shift_assignment`.
        agencyId: actingAgencyId,
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

      // CAN THEY GET THERE? The guard above refuses a strict overlap, so a PR could
      // be booked 11:00–12:00 at one venue and 12:01–13:01 at another across the city
      // and every check passed — nothing measured the space BETWEEN two shifts.
      //
      // A WARNING, not a refusal (owner's rule): the agency knows things this model
      // does not, so it may assign anyway. Computed AFTER the write and wrapped, so a
      // failure to advise can never undo an assignment that already succeeded — a 500
      // here would report a completed booking as a failed one.
      const travelWarning = await travelWarningFor({
        shift,
        prId: pr.id,
        excludeShiftId: shift.id,
        loadPin: (outletId) => this.shiftAssignmentRepository.getOutletPin(outletId),
        loadAssignments: (prId) => this.shiftAssignmentRepository.listForPr(prId),
        onError: (error) =>
          logger.error('[ShiftAssignmentController.create] travel-gap check failed:', error),
      });

      res.status(201).json({
        success: true,
        message: 'PR assigned to shift',
        data: assignment,
        warning: travelWarning,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({ success: false, message: 'PR is already assigned to this shift', data: null });
      }
      // The PR blocked this day on their own schedule. 409 like the two below —
      // well-formed and authorised, just refused — but the remedy is a different
      // PERSON, not a bigger headcount or another tier, so it says so plainly.
      if (error instanceof PrUnavailableError) {
        return res.status(409).json({
          success: false,
          message: `This PR has marked ${error.shiftDate} as unavailable — pick someone else for this shift.`,
          data: null,
        });
      }
      // 409, same family as the duplicate above: the request was well-formed and
      // authorised, it just lost a race for the last seat. The count is named so
      // the roster can say WHY without a second round-trip.
      if (error instanceof ShiftFullError) {
        return res.status(409).json({
          success: false,
          message: `This shift is already fully staffed (${error.staffed}/${error.quantity}) — raise the headcount or pick another shift.`,
          data: null,
        });
      }
      // Room overall, but not for this TIER. Separate message from the headcount
      // 409 because the remedy differs: send a different tier, do not raise the
      // headcount.
      if (error instanceof TierFullError) {
        return res.status(409).json({
          success: false,
          message: error.bucket
            ? `This shift already has all ${error.asked} ${error.bucket} it asked for — assign a different tier.`
            : `This shift's remaining seats are reserved for the tiers it requested — assign one of those tiers.`,
          data: null,
        });
      }
      if (error instanceof ShiftGoneError) {
        return res.status(404).json({ success: false, message: 'Shift not found', data: null });
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
  /**
   * A PR filed an MC/leave request — the agency has a decision to make.
   *
   * Addressed to the agency's active members, resolved the same way
   * notifyAgencyCoverNeeded resolves them. Never throws: a failed notification
   * must not undo an MC the PR has already filed.
   *
   * NOT `shift_cover_needed`. Nobody is off yet, and the shift is still fully
   * staffed — pointing the agency at the roster's backfill list here would be
   * telling it to replace someone who may well be working that night. Cover is
   * raised afterwards by approveLeave, and only if it approves.
   */
  private async notifyAgencyLeaveRequested(input: {
    agencyId: string;
    assignmentId: string;
    shiftId: string;
    prName: string;
    reason: string;
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

      await notifyMany(recipients, {
        kind: 'leave_requested',
        title: `MC / leave request — ${input.prName}`,
        body: `${input.prName} asked to be excused from ${when}: "${input.reason}". Review it on Approvals → MC/Leaves.`,
        payload: {
          assignmentId: input.assignmentId,
          shiftId: input.shiftId,
        },
        actor: input.actor,
      });
    } catch (error) {
      logger.error('[ShiftAssignmentController.notifyAgencyLeaveRequested] Error:', error);
    }
  }

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
    kind: 'shift_assigned' | 'shift_cancelled' | 'leave_decided';
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

      // The OTHER way a shift can end up over its headcount: not an insert, but
      // an existing row flipped back INTO a staffing status (a cancelled PR
      // un-cancelled after the slot was backfilled). `create`'s locked check
      // cannot see this path — there is no insert — so it is checked here.
      // Transitions between two staffing statuses (assigned -> confirmed, a
      // check-in, a check-out) took their seat long ago and are never re-tested.
      const isNonStaffing = (s: ShiftAssignmentStatus | undefined) =>
        s !== undefined && NON_STAFFING_STATUSES.includes(s as (typeof NON_STAFFING_STATUSES)[number]);
      const reStaffing =
        parsed.data.status !== undefined &&
        isNonStaffing(existing.status) &&
        !isNonStaffing(parsed.data.status);
      const patch = {
        status: parsed.data.status,
        payAmount: parsed.data.payAmount,
        checkInAt: parsed.data.checkInAt ? new Date(parsed.data.checkInAt) : undefined,
        checkOutAt: parsed.data.checkOutAt ? new Date(parsed.data.checkOutAt) : undefined,
        notes: parsed.data.notes,
        updatedBy: getActor(req),
      };

      // The shift this row is going back onto, read ONCE: the status gate just
      // below and the travel warning further down both want it, and it is the same
      // row in the same request. Null when nobody is being seated.
      const seatedShift = reStaffing ? await this.shiftRepository.getById(existing.shiftId) : null;

      let assignment: Awaited<ReturnType<ShiftAssignmentRepositoryClass['update']>>;
      if (reStaffing) {
        // The same shift-status rule `create` applies, for the same reason: this
        // branch puts a person back onto a shift, so it is a seating lane and has
        // to refuse a draft or a sealed shift too. Asked ONLY when re-staffing —
        // a note edit or a check-out stamp moves nobody, and on a sealed shift
        // those are exactly the edits that legitimately still happen.
        const blocked = seatedShift ? shiftNotAssignableReason(seatedShift.status) : null;
        if (blocked) {
          return res.status(400).json({ success: false, message: blocked, data: null });
        }
        // Seat check AND write in ONE transaction, with the shift row locked.
        // The PR is named so the TIER mix is checked too, not just headcount:
        // without it, cancelling a Tier I, backfilling with another and then
        // un-cancelling the first left 3 Tier I on a shift that asked for 2 — a
        // row `create` would have refused, landing through the PATCH. And
        // without the shared transaction, two people un-cancelling into the last
        // seat could both read "free" and both land.
        const result = await this.shiftAssignmentRepository.updateIfSeatFree(id, patch, {
          shiftId: existing.shiftId,
          prId: existing.userId ?? existing.prId,
          agencyId: existing.agencyId,
        });
        if (!result.ok) {
          const { seat } = result;
          // Checked before the two capacity refusals: when the PR has blocked
          // the day, `free` is false even with seats to spare, so falling
          // through would report "already fully staffed" off a headcount that
          // is not the reason — and send the agency to raise a quantity that
          // would not help.
          const message = seat.prUnavailable
            ? `This PR has marked ${seat.prUnavailable.shiftDate} as unavailable — they cannot be put back on this shift.`
            : seat.tierFull
              ? seat.tierFull.bucket
                ? `This shift already has all ${seat.tierFull.asked} ${seat.tierFull.bucket} it asked for — that tier was filled after this PR came off it.`
                : `This shift has no unallocated seat left for that tier (${seat.tierFull.staffed}/${seat.tierFull.asked}) — its remaining seats are reserved for the tiers it named.`
              : `This shift is already fully staffed (${seat.staffed}/${seat.quantity}) — the slot was filled after this PR came off it.`;
          return res.status(409).json({ success: false, message, data: null });
        }
        assignment = result.assignment;
      } else {
        assignment = await this.shiftAssignmentRepository.update(id, patch);
      }
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

      // RE-STAFFING IS A SEATING TOO. Putting a cancelled row back can make the
      // same impossible trip a fresh assignment would have been warned about — the
      // roster has moved on since that PR came off it. Asked only when the row is
      // actually going back on: a note edit or a check-out stamp changes nothing
      // about where anyone has to be.
      let travelWarning: string | null = null;
      if (reStaffing) {
        if (seatedShift) {
          travelWarning = await travelWarningFor({
            shift: seatedShift,
            prId: existing.userId ?? existing.prId,
            excludeShiftId: existing.shiftId,
            loadPin: (outletId) => this.shiftAssignmentRepository.getOutletPin(outletId),
            loadAssignments: (prId) => this.shiftAssignmentRepository.listForPr(prId),
            onError: (error) =>
              logger.error('[ShiftAssignmentController.update] travel-gap check failed:', error),
          });
        }
      }

      res.status(200).json({
        success: true,
        message: 'Assignment updated',
        data: assignment,
        warning: travelWarning,
      });
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

      // Read the shift BEFORE the delete — the date it happened on is the whole
      // question below, and the notify step at the bottom needs it either way.
      const shift = await this.shiftRepository.getById(existing.shiftId);

      // ── AN ASSIGNMENT ON A FINISHED SHIFT IS A RECORD, NOT A BOOKING ───────
      // The row carries the attendance stamps and the wage sealed at check-out,
      // and the weekly voucher job reads `shift_assignment` — so deleting one
      // erases a shift somebody actually worked from the only place the money
      // chain looks, with nothing left to rebuild it from. The counterpart rule
      // already exists one layer up: an outlet cannot withdraw a posted shift
      // once its date has arrived (shift.controller.ts remove).
      //
      // Two separate refusals, because they protect different things:
      //   · a PAST date — the day is over, so there is no booking left to undo.
      //   · an attendance STAMP on ANY date — someone clocked in, so the honest
      //     correction is `cancelled` / `no_show`, which keeps the row and its
      //     history instead of deleting the evidence.
      // Undoing a mis-assignment stays available all through the shift's own day.
      //
      // Compared in the VENUE's timezone, not the server's, for the same reason
      // the shift rule is: on a UTC host `new Date()` rolls the date eight hours
      // early, which would reopen yesterday for a Kuala Lumpur agency at 08:00.
      // Admin is exempt — support has to be able to clean up a bad row.
      if (!scope.isAdmin) {
        const todayIso = shiftDayKey(new Date());
        const shiftIso = shift ? String(shift.shiftDate).slice(0, 10) : null;
        if (shiftIso && shiftIso < todayIso) {
          return res.status(409).json({
            success: false,
            message:
              'That shift has already passed — the assignment on it is the record of who worked, not a booking to undo. Mark it cancelled or no-show instead.',
            data: null,
          });
        }
        if (existing.checkInAt || existing.checkOutAt) {
          return res.status(409).json({
            success: false,
            message:
              'This PR has already clocked in on this shift — the assignment carries their attendance and their pay. Mark it cancelled or no-show instead.',
            data: null,
          });
        }
      }

      const removed = await this.shiftAssignmentRepository.remove(id);
      if (!removed) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      // Unassigning is a cancellation from the PR's side — the shift is simply
      // gone from their app, and until now nothing said so.
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
