import { Request, Response } from 'express';
import { ShiftRepositoryClass } from './shift.repository';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';
import { AgencyOutletRepository } from '@/features/agency/agency-outlet.repository';
import { OutletRepositoryClass } from '@/features/outlet/outlet.repository';
import { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository';
import { AuthRepositoryClass } from '@/features/auth/auth.repository';
import { Error } from '@/error/index';
import { paramId, uuidParam } from '@/util/params';
import { getActor } from '@/util/actor';
import { shiftTemplateBelongsToOutlet } from '@/features/shift-template/shift-template.repository';
// Widens a named-PR pick across every invited agency that holds her (0131).
import { listMembershipPairs } from '@/features/pr-personnel/pr.repository';
import { logger } from '@/util/logger';
import {
  CreateShiftBatchSchema,
  UpdateShiftSchema,
  normaliseSpecialEvent,
} from '@/schema/shift.schema';
import { ShiftFilter, ShiftStatus, ShiftEventKind } from './shift.model';
import { OrgScope, resolveOrgScope, isOutletCaller } from '@/util/org-scope';
import { ShiftAssignmentRepositoryClass } from '@/features/shift-assignment/shift-assignment.repository';
import { shiftDayKey, shiftWindowInstants } from '@/util/slot-window';
import {
  batchItemShiftDate,
  checkShiftPost,
  createShiftPostContext,
  shiftPostGuard,
  type PreparedShiftPost,
  type ShiftPostContext,
} from './shift-post-check';
import { demandExceedsQuantity, UNKNOWN_TEMPLATE_REFUSAL } from './shift-venue-rules';
import { moveRefusal, shiftEditRules } from './shift-edit-rules';
import { writeUnlessRefused } from './shift-write-guard';
import {
  notifyPostedAfterCommit,
  notifyShiftWithdrawn,
  type ShiftNotificationDeps,
} from './shift-notifications';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

/**
 * `PUT /shift/:id`'s success sentence when the edit SEALS the night. The web
 * Calendar shows it (translated by exact match — change both together).
 */
export const SHIFT_SEALED_MESSAGE = 'Shift sealed — no one else can be added to it';

/**
 * `POST /shift/batch`'s success sentence. Post Job shows it as its toast,
 * translated by pattern in the web's `outlet-write-refusal.ts` — change both
 * together.
 */
export function shiftsPostedMessage(count: number): string {
  return `Posted ${count} shift${count === 1 ? '' : 's'}`;
}

/**
 * A refusal in the one shape every shift write answers with — whether the check
 * refused it or the write's guard did (shift-write-guard.ts), so the two can
 * never drift apart.
 */
function refuse(
  res: Response,
  refusal: { status: number; message: string | undefined },
  data: { index: number; shiftDate: string | null } | null = null,
) {
  return res.status(refusal.status).json({ success: false, message: refusal.message, data });
}

/** WHICH shift stopped a batch, so the screen can name its date. */
function batchItem(items: readonly unknown[], index: number) {
  return { index, shiftDate: batchItemShiftDate(items[index]) };
}

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
    /** Resolves which agencies a venue may post to — replaces the old
     * `outlet.onboarded_by_agency_id` lookup (0123). */
    private agencyOutletRepository: AgencyOutletRepository,
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
      // HOW FULL THE SHIFT IS, across every agency it was posted to (0124). The
      // roster cannot compute this for itself: `GET /shift-assignment` is scoped to
      // the caller's own agency, so a client counting the rows it can see reports its
      // own contribution and offers seats another agency has already filled.
      const staffedByShift = await this.shiftRepository.countStaffedForShifts(
        shifts.map((s) => s.id),
      );
      // The venue's named-PR requests (0131). Agency callers see only the
      // requests ADDRESSED to them — which PRs a venue asked of a rival is
      // the rival's business; the outlet authored the rows and reads all.
      const requestedByShift = await this.shiftRepository.listRequestedPrsForShifts(
        shifts.map((s) => s.id),
        !scope.isAdmin && !isOutletCaller ? (scope.agencyId ?? undefined) : undefined,
      );
      // WHICH AGENCIES each shift was sent to (0124). The venue chose them, so it
      // reads them back — its screens used to guess the agency from whoever was
      // rostered, and named nobody (or the wrong one) on a shared shift. An agency
      // caller gets nothing: who else a venue asked is never an agency's business.
      const invitedByShift =
        scope.isAdmin || isOutletCaller
          ? await this.shiftRepository.listAgencyIdsForShifts(shifts.map((s) => s.id))
          : null;
      // A special event's OWN prices (0167), batched like the pay tiers. Only a
      // special shift can hold any, so only those ids are asked about.
      const eventMenuByShift = await this.shiftRepository.listEventDrinkMenuForShifts(
        shifts.filter((s) => s.eventKind === 'special').map((s) => s.id),
      );
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      res.status(200).json({
        success: true,
        message: 'OK',
        data: shifts.map((s) => ({
          ...s,
          payTiers: payTiersByShift.get(s.id) ?? [],
          staffedCount: staffedByShift.get(s.id)?.total ?? 0,
          staffedBuckets: staffedByShift.get(s.id)?.byBucket ?? {},
          requestedPrs: requestedByShift.get(s.id) ?? [],
          ...(invitedByShift ? { agencyIds: invitedByShift.get(s.id) ?? [s.agencyId] } : {}),
          // Empty = priced from the venue's Workspace list.
          eventDrinkMenu: eventMenuByShift.get(s.id) ?? [],
        })),
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
      //
      // The agency arm goes through `shift_agency` (0124), NOT `shift.agency_id`
      // — that column is only the ANCHOR, so comparing it here 404'd the shift
      // for every invited agency except the first. The LIST query already
      // resolved through `shift_agency`, which made the failure maximally
      // confusing: the shift sat right there in the roster, and opening it said
      // it did not exist.
      const visible =
        scope.isAdmin ||
        (scope.agencyId !== null &&
          (await this.shiftRepository.isAgencyInvited(shift.id, scope.agencyId))) ||
        scope.outletIds.includes(shift.outletId);
      if (!visible) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      // Fold in the per-shift pay-tier overrides so the outlet portal can render
      // and re-edit exactly what it posted (empty when it uses workspace defaults).
      const payTiers = await this.shiftRepository.listPayTiersForShift(shift.id);
      const staffed = (await this.shiftRepository.countStaffedForShifts([shift.id])).get(shift.id);
      // Same scoping rule as the list read (0131).
      const requested = (
        await this.shiftRepository.listRequestedPrsForShifts(
          [shift.id],
          !scope.isAdmin && !this.isOutletCaller(scope)
            ? (scope.agencyId ?? undefined)
            : undefined,
        )
      ).get(shift.id);
      // Same rule as the list: the venue and admin read who it was sent to.
      const invited =
        scope.isAdmin || this.isOutletCaller(scope)
          ? ((await this.shiftRepository.listAgencyIdsForShifts([shift.id])).get(shift.id) ?? [
              shift.agencyId,
            ])
          : null;
      // The special event's own prices (0167) — as the list serves them.
      const eventDrinkMenu =
        shift.eventKind === 'special'
          ? await this.shiftRepository.listEventDrinkMenuForShift(shift.id)
          : [];
      res.status(200).json({
        success: true,
        message: 'OK',
        data: {
          ...shift,
          payTiers,
          staffedCount: staffed?.total ?? 0,
          staffedBuckets: staffed?.byBucket ?? {},
          requestedPrs: requested ?? [],
          ...(invited ? { agencyIds: invited } : {}),
          eventDrinkMenu,
        },
      });
    } catch (error) {
      logger.error('[ShiftController.getById] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * What this request knows while it checks posts (`createShiftPostContext`):
   * the caller, and each venue's standing facts — read once per venue, however
   * many items of a batch name it.
   */
  private postContext(req: Request): ShiftPostContext {
    return createShiftPostContext({
      resolveScope: () => this.resolveScope(req),
      actor: getActor(req),
      shiftRepository: this.shiftRepository,
      outletRepository: this.outletRepository,
      agencyOutletRepository: this.agencyOutletRepository,
    });
  }

  /** The repositories every announcement reads (shift-notifications.ts). */
  private notificationDeps(): ShiftNotificationDeps {
    return {
      agencyMemberRepository: this.agencyMemberRepository,
      outletRepository: this.outletRepository,
      shiftRepository: this.shiftRepository,
    };
  }

  async create(req: Request, res: Response) {
    try {
      const ctx = this.postContext(req);
      const { actor } = ctx;
      const check = await checkShiftPost(req.body, ctx, []);
      if (!check.ok) return refuse(res, check.refusal);

      const { post } = check;
      const written = await writeUnlessRefused(
        this.shiftRepository.createWithPayTiers(
          post.row,
          post.payTiers,
          actor,
          // Server-resolved and already filtered against the outlet's approved
          // links — never the raw client list.
          post.selectedAgencyIds,
          post.requestRows,
          post.eventDrinkMenu,
          // The clash and plan rules again, under the venue's lock, for a post
          // that landed after the check above (shift-write-guard.ts).
          shiftPostGuard(ctx, [post]),
        ),
      );
      // Refused inside the write: the check's own sentence, nothing written, no bell.
      if (!written.ok) return refuse(res, written.refused);
      const shift = written.written;
      res.status(201).json({ success: true, message: 'Shift created', data: shift });

      notifyPostedAfterCommit(this.notificationDeps(), [{ post, shift }], actor, 'create');
    } catch (error) {
      logger.error('[ShiftController.create] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * `POST /shift/batch` — the shifts Post Job composes together, posted ALL OR
   * NOTHING.
   *
   * The screen used to send them one `POST /shift` at a time. A refusal halfway
   * (the plan's daily cap, a clash) left the earlier shifts posted while the form
   * still held every one of them, so a retry double-posted or was refused as a
   * clash with the very shifts it had just written — and the success handler
   * never ran, so the venue could not even see which ones had gone.
   *
   * Every item runs `checkShiftPost` — the single post's own checks, in the same
   * order — with the items before it counted as though already posted. The first
   * refusal answers with that check's own sentence and status, names the item it
   * stopped on (`data: { index, shiftDate }`), and NOTHING is written. Otherwise
   * every shift is written in ONE transaction, and each is announced after the
   * commit exactly as a single post announces itself.
   *
   * THE CHECK-THEN-INSERT RACE, CLOSED (30 Sep 2026). The checks READ and the
   * transaction WRITES afterwards, so two posts landing together (two tabs, or a
   * batch beside a single post) could each pass the clash and plan checks
   * against a database holding neither, and both commit. The write's own
   * transaction now locks every venue the batch touches before its first insert
   * and re-runs those two rules through itself (`shiftPostGuard`,
   * shift-write-guard.ts): the later post waits, reads the earlier one, and is
   * refused just as the check would refuse it — item named, nothing written.
   */
  async createBatch(req: Request, res: Response) {
    try {
      const envelope = CreateShiftBatchSchema.safeParse(req.body);
      if (!envelope.success) {
        return res
          .status(400)
          .json({ success: false, message: envelope.error.issues[0]?.message, data: null });
      }

      // ONE context for the whole batch: the caller's scope and each venue's
      // standing facts are read once, however many items name them.
      const ctx = this.postContext(req);
      const { actor } = ctx;
      const { items } = envelope.data;
      let posts: readonly PreparedShiftPost[] = [];
      for (let index = 0; index < items.length; index += 1) {
        const check = await checkShiftPost(items[index], ctx, posts);
        if (!check.ok) return refuse(res, check.refusal, batchItem(items, index));
        posts = [...posts, check.post];
      }

      const written = await writeUnlessRefused(
        this.shiftRepository.createManyWithPayTiers(
          posts.map((post) => ({
            data: post.row,
            payTiers: post.payTiers,
            agencyIds: post.selectedAgencyIds,
            requestedPrs: post.requestRows,
            eventDrinkMenu: post.eventDrinkMenu,
          })),
          actor,
          shiftPostGuard(ctx, posts),
        ),
      );
      if (!written.ok) {
        return refuse(res, written.refused, batchItem(items, written.refused.index));
      }
      const shifts = written.written;
      res.status(201).json({
        success: true,
        message: shiftsPostedMessage(shifts.length),
        data: shifts,
      });

      notifyPostedAfterCommit(
        this.notificationDeps(),
        posts.map((post, index) => ({ post, shift: shifts[index] })),
        actor,
        'createBatch',
      );
    } catch (error) {
      logger.error('[ShiftController.createBatch] Error:', error);
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

      // `requestedPrs` and `agencyIds` are not shift columns, so leaving them in
      // `data` meant the update silently dropped them: an edit that renamed the
      // venue's picks answered "Shift updated" and changed nothing.
      const {
        payTiers,
        requestedPrs,
        agencyIds,
        specialEventType,
        customSpecialEventName,
        eventDrinkMenu,
        ...data
      } = parsed.data;
      // The special night's type, name and prices (0167), resolved against what
      // the row already holds: an omitted field keeps it, an edit that makes the
      // shift normal clears all three, and an edit naming none of them — a
      // status change — writes none of them.
      const special = normaliseSpecialEvent(
        { eventKind: data.eventKind, specialEventType, customSpecialEventName, eventDrinkMenu },
        {
          eventKind: existing.eventKind,
          specialEventType: existing.specialEventType ?? null,
          customSpecialEventName: existing.customSpecialEventName ?? null,
        },
      );

      // WHO a shift was sent to is fixed at posting — invitations, notifications
      // and the other agencies' rosters all hang off it. Refused out loud rather
      // than ignored, so a caller is never told a change landed that did not.
      if (agencyIds !== undefined) {
        return res.status(400).json({
          success: false,
          message: 'The agencies a shift was sent to cannot be changed — withdraw it and post it again.',
          data: null,
        });
      }

      // WHERE THE SHIFT ENDS UP. Outlets cannot move a shift to a different venue —
      // their `outletId` is dropped below; an admin's is a move, and the shift then
      // answers to the TARGET's rules (shift-edit-rules.ts).
      const toOutletId = isOutlet ? existing.outletId : (data.outletId ?? existing.outletId);

      if (toOutletId.toLowerCase() !== existing.outletId.toLowerCase()) {
        // A move: its agencies must be approved at the target, and its template —
        // named here or already linked — must be the target's own card.
        const moveRefused = await moveRefusal(
          {
            approvedAgencyIds: (outletId) =>
              this.agencyOutletRepository.listApprovedAgencyIdsForOutlet(outletId),
            templateBelongsToOutlet: shiftTemplateBelongsToOutlet,
          },
          {
            toOutletId,
            // `existing.id`, never the URL's `id`: the map comes back keyed in the
            // database's lower case, and a URL in capitals missed it — the move
            // was then checked against the anchor alone (1 Oct 2026).
            agencyIds: [
              ...((await this.shiftRepository.listAgencyIdsForShifts([existing.id])).get(
                existing.id,
              ) ?? []),
              data.agencyId ?? existing.agencyId,
            ],
            templateId: data.templateId ?? existing.templateId ?? null,
          },
        );
        if (moveRefused) return refuse(res, moveRefused);
      } else if (
        // The same check create makes: a template must be one of THIS venue's own
        // cards, or an edit could hang another outlet's picture on the shift.
        data.templateId &&
        !(await shiftTemplateBelongsToOutlet(data.templateId, existing.outletId))
      ) {
        return res.status(400).json({ success: false, message: UNKNOWN_TEMPLATE_REFUSAL, data: null });
      }

      // The venue's named picks, re-resolved exactly as create does: one row per
      // INVITED agency that holds the person, never the client's pairing.
      // Undefined leaves the existing picks untouched; an empty list clears them.
      let requestRows: { userId: string; agencyId: string }[] | undefined;
      if (requestedPrs !== undefined) {
        const invited =
          (await this.shiftRepository.listAgencyIdsForShifts([existing.id])).get(existing.id) ??
          [existing.agencyId];
        requestRows = await listMembershipPairs(
          [...new Set(requestedPrs.map((r) => r.userId))],
          invited,
        );
      }

      // SEALING: the venue declaring the night closed. Only legal on a shift
      // that has actually FINISHED.
      //
      // This is not cosmetic. `sealed` is one of the two statuses excluded from
      // ASSIGNABLE_SHIFT_STATUSES, so a sealed shift cannot take a PR — sealing a
      // FUTURE shift would silently make it unstaffable while it still shows on
      // the venue's calendar as a night it expects covered.
      //
      // The window comes from `shiftWindowInstants`, which reads the slot in the
      // VENUE's timezone and carries an overnight 22:00-04:00 into the next day.
      // A plain end-time comparison would call that shift finished at 04:00 on
      // the morning it started, while it was still on the floor.
      //
      // Fails CLOSED on a slot carrying no window ("Late night"): we cannot prove
      // such a shift has ended, and "this night is closed" is not a declaration
      // to grant on the strength of a string we could not read.
      if (data.status === 'sealed' && existing.status !== 'sealed') {
        const sealWindow = shiftWindowInstants(shiftDayKey(existing.shiftDate), existing.slot);
        if (!sealWindow) {
          return res.status(400).json({
            success: false,
            message: 'This shift has no scheduled time, so it cannot be sealed',
            data: null,
          });
        }
        if (sealWindow.end.getTime() > Date.now()) {
          return res.status(400).json({
            success: false,
            message: 'A shift can only be sealed after it has finished',
            data: null,
          });
        }
      }

      // Against the EFFECTIVE quantity and the EFFECTIVE tier rows. Dropping
      // quantity from 6 to 4 without resending payTiers has to be refused too,
      // or the shift keeps stored demand for 6 that nothing can ever satisfy —
      // so when the request omits payTiers, the STORED rows are what we check.
      const effectiveTiers = payTiers ?? (await this.shiftRepository.listPayTiersForShift(id));
      const overAsked = demandExceedsQuantity(effectiveTiers, data.quantity ?? existing.quantity);
      if (overAsked) {
        return res.status(400).json({ success: false, message: overAsked, data: null });
      }

      // What this edit makes the shift's timing — read by BOTH timing rules (the
      // venue clash and the PR double-booking, shift-edit-rules.ts), and the clash
      // runs before the plan gate for the same reason it does on create: the
      // specific cause beats the incidental one.
      const nextSlot = data.slot === undefined ? existing.slot : data.slot;
      const nextDate = data.shiftDate === undefined ? existing.shiftDate : data.shiftDate;
      const timingChanged =
        (data.slot !== undefined && data.slot !== existing.slot) ||
        (data.shiftDate !== undefined &&
          shiftDayKey(nextDate) !== shiftDayKey(existing.shiftDate));

      // An edit is the other way two shifts end up on top of each other (post 11:00
      // and 15:00, then drag the second onto 12:00), and the other way a PR gets
      // double-booked (drag a shift onto another one its PR works). Both rules, the
      // plan gate, and — when an ADMIN moves the shift to another venue — that
      // venue's own rules, live in shift-edit-rules.ts. They run here as the check,
      // and again inside the write as its guard, under the venues' locks, this
      // shift's seat lock and its PRs' booking locks (30 Sep 2026).
      const editRules = shiftEditRules(
        {
          shiftRepository: this.shiftRepository,
          outletRepository: this.outletRepository,
          assignments: this.shiftAssignmentRepository,
        },
        {
          // The stored id: the PR rule compares it in code with the ids her
          // bookings carry, and a URL in capitals never matched her booking on
          // THIS shift — re-timing it then clashed with itself.
          shiftId: existing.id,
          fromOutletId: existing.outletId,
          toOutletId,
          shiftDate: nextDate,
          slot: nextSlot,
          timingChanged,
          adding: data.quantity ?? existing.quantity,
        },
      );
      const editRefused = await editRules.check();
      if (editRefused) return refuse(res, editRefused);

      // Agency users cannot move a shift to a different agency.
      if (!scope.isAdmin) delete data.agencyId;
      // Outlets cannot move a shift to a different venue.
      if (isOutlet) delete data.outletId;

      const actor = getActor(req);
      const written = await writeUnlessRefused(
        this.shiftRepository.updateWithPayTiers(
          id,
          { ...data, ...special.columns, updatedBy: actor },
          payTiers,
          actor,
          requestRows,
          special.eventDrinkMenu,
          editRules.guard,
        ),
      );
      if (!written.ok) return refuse(res, written.refused);
      const shift = written.written;
      if (!shift) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      // Closing a night says what closing DID (confirm-every-action rule): the
      // Calendar used to shut its sheet on a bare "Shift updated" nobody saw.
      const sealedNow = data.status === 'sealed' && existing.status !== 'sealed';
      res.status(200).json({
        success: true,
        message: sealedNow ? SHIFT_SEALED_MESSAGE : 'Shift updated',
        data: shift,
      });
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
      void notifyShiftWithdrawn(this.notificationDeps(), {
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
