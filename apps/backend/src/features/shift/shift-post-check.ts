import type { AgencyOutletRepository } from '@/features/agency/agency-outlet.repository';
import type { OutletRepositoryClass } from '@/features/outlet/outlet.repository';
// Widens a named-PR pick across every invited agency that holds her (0131).
import { listMembershipPairs } from '@/features/pr-personnel/pr.repository';
import { shiftTemplateBelongsToOutlet } from '@/features/shift-template/shift-template.repository';
import type { PlanLookup } from '@/features/subscription/plan-limit';
import {
  CreateShiftSchema,
  normaliseSpecialEvent,
  type CreateShiftInput,
} from '@/schema/shift.schema';
import type { DbTransaction } from '@/types/db-transaction';
import { isOutletCaller, type OrgScope } from '@/util/org-scope';
import type { ShiftInsertType } from './shift.model';
import type {
  ShiftDrinkMenuInput,
  ShiftPayTierInput,
  ShiftRepositoryClass,
} from './shift.repository';
import {
  AGENCIES_NOT_APPROVED_REFUSAL,
  demandExceedsQuantity,
  NO_APPROVED_AGENCY_REFUSAL,
  planCapacityRefusal,
  readOutletPlan,
  shiftClashRefusal,
  UNKNOWN_TEMPLATE_REFUSAL,
  venueNotLiveRefusal,
} from './shift-venue-rules';
import { venueWriteGuard, type RuleRefusal, type ShiftWriteGuard } from './shift-write-guard';

/**
 * THE ONE CHECK A POSTED SHIFT PASSES — and what a batch of them needs.
 *
 * Moved out of shift.controller.ts (30 Sep 2026). `POST /shift` runs
 * `checkShiftPost` for its body and `POST /shift/batch` for each item in turn,
 * so a shift is refused with the same sentence and status whichever door it
 * came through, and a rule added here reaches both. Nothing in this file
 * writes: it answers with the rows to write, or with the refusal.
 */

/**
 * One shift that passed every check a post makes (`checkShiftPost`): exactly
 * what the repository writes for it, and who is told once it is written.
 */
export type PreparedShiftPost = {
  /** The `shift` row — status, anchor agency and actor already resolved. */
  row: Omit<ShiftInsertType, 'id' | 'createdAt' | 'updatedAt'>;
  payTiers: ShiftPayTierInput[] | undefined;
  /** Server-resolved and filtered against the outlet's approved links. */
  selectedAgencyIds: string[];
  requestRows: { userId: string; agencyId: string }[];
  /** The special night's own prices, normalised — undefined on a normal shift. */
  eventDrinkMenu: ShiftDrinkMenuInput[] | undefined;
  /** Every invited agency; the anchor alone on the admin path. */
  notifyAgencyIds: string[];
};

/** A refusal in the exact sentence and status `POST /shift` answers it with. */
type ShiftPostRefusal = { status: number; message: string | undefined };

type ShiftPostRefused = { ok: false; refusal: ShiftPostRefusal };

export type ShiftPostCheck = { ok: true; post: PreparedShiftPost } | ShiftPostRefused;

function refusePost(status: number, message: string | undefined): ShiftPostRefused {
  return { ok: false, refusal: { status, message } };
}

/**
 * The date a batch item asked for, so a refusal can name it — even for an item
 * that did not parse. Only ever a real `yyyy-MM-dd`; anything else is null,
 * never echoed back.
 */
export function batchItemShiftDate(item: unknown): string | null {
  if (!item || typeof item !== 'object') return null;
  const value = (item as { shiftDate?: unknown }).shiftDate;
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/**
 * What ONE request knows while it checks posts — built fresh for every request
 * by `createShiftPostContext`, never shared between two.
 *
 * A venue's STANDING facts — which agencies it may post to, whether it is live,
 * its plan — are read once per venue per request, however many items of a
 * batch name it: they cannot differ between two items checked a moment apart,
 * and a month posted in one go used to read each of them once per shift. A
 * single post still reads each exactly once, where it always did. Everything
 * that depends on the ITEM — its template, its named picks, the shifts around
 * its date, the headcount already on its day — is read per item, as before.
 * This memo is the CHECK's: the write's guard reads the plan once more, under
 * the lock, through its own transaction (`shiftPostGuard`).
 */
export type ShiftPostContext = {
  /** The caller's scope, resolved on first use — once the first body parses. */
  scope: () => Promise<OrgScope>;
  actor: string;
  approvedAgencyIds: (outletId: string) => Promise<string[]>;
  venueNotLive: (outletId: string) => Promise<string | null>;
  plan: (outletId: string) => Promise<PlanLookup>;
  /**
   * The stored shifts the clash rule reads — per item, never memoised, and read
   * again through the write's transaction by `shiftPostGuard`.
   */
  shiftRepository: Pick<ShiftRepositoryClass, 'listByOutletAroundDate'>;
};

/** `read` at most once per key, for the life of the returned function. */
function oncePerKey<T>(read: (key: string) => Promise<T>): (key: string) => Promise<T> {
  const known = new Map<string, Promise<T>>();
  return (key) => {
    const seen = known.get(key);
    if (seen) return seen;
    const reading = read(key);
    known.set(key, reading);
    return reading;
  };
}

export function createShiftPostContext(deps: {
  resolveScope: () => Promise<OrgScope>;
  actor: string;
  shiftRepository: Pick<ShiftRepositoryClass, 'listByOutletAroundDate'>;
  outletRepository: Pick<OutletRepositoryClass, 'getById'>;
  agencyOutletRepository: Pick<AgencyOutletRepository, 'listApprovedAgencyIdsForOutlet'>;
}): ShiftPostContext {
  let scope: Promise<OrgScope> | undefined;
  return {
    scope: () => {
      scope ??= deps.resolveScope();
      return scope;
    },
    actor: deps.actor,
    approvedAgencyIds: oncePerKey((outletId) =>
      deps.agencyOutletRepository.listApprovedAgencyIdsForOutlet(outletId),
    ),
    venueNotLive: oncePerKey((outletId) => venueNotLiveRefusal(deps.outletRepository, outletId)),
    plan: oncePerKey(readOutletPlan),
    shiftRepository: deps.shiftRepository,
  };
}

/**
 * EVERY CHECK A POSTED SHIFT MUST PASS — the one place they live.
 *
 * `earlier` is the batch's items that have already passed, taken as though
 * they were already posted — an item that clashes with one of them is
 * refused, and the plan counts their headcount on the same date. Empty for a
 * single post. Only a POSTED shift counts: a draft (the admin path) neither
 * clashes nor consumes capacity once it is stored, so it does not here either.
 */
export async function checkShiftPost(
  body: unknown,
  ctx: ShiftPostContext,
  earlier: readonly PreparedShiftPost[],
): Promise<ShiftPostCheck> {
  const parsed = CreateShiftSchema.safeParse(body);
  if (!parsed.success) return refusePost(400, parsed.error.issues[0]?.message);

  const routed = await routePost(parsed.data, await ctx.scope(), ctx);
  if (!routed.ok) return routed;
  const { agencyId, selectedAgencyIds, postedStatus } = routed;
  const { actor } = ctx;
  const outletId = parsed.data.outletId;

  // A template link must name one of the VENUE'S OWN cards — a forged id
  // would hang another outlet's picture on this shift (0128).
  if (parsed.data.templateId) {
    const owns = await shiftTemplateBelongsToOutlet(parsed.data.templateId, outletId);
    if (!owns) return refusePost(400, UNKNOWN_TEMPLATE_REFUSAL);
  }
  // payTiers is a child-table override, not a shift column — keep it out of
  // the shift insert and persist it alongside in one transaction. The event's
  // own price list (0167) is the same kind of child row.
  const {
    payTiers,
    requestedPrs,
    specialEventType,
    customSpecialEventName,
    eventDrinkMenu,
    ...shiftData
  } = parsed.data;
  // What this shift keeps about its special night (0167): nothing at all on a
  // normal shift, and the "Other" name only for 'other'. The composer used to
  // collect all three and the post dropped them, so a blank VIP night came
  // back a bare "Special" priced from the everyday list.
  const special = normaliseSpecialEvent({
    eventKind: shiftData.eventKind,
    specialEventType,
    customSpecialEventName,
    eventDrinkMenu,
  });
  // A NAMED PICK IS A PERSON, NOT A MEMBERSHIP (owner, 3 Sep 2026: "ask all
  // their related agencies that got posted the job and have that PR").
  //
  // The picker draws ONE card per person, so the client could only ever name
  // one membership — whichever `selectDistinctOn` left standing in the PR
  // list, which is the NEWEST among the ticked agencies. Trusting it wrote a
  // single row: Emhub posted to Atlas AND Why We Met, and only Why We Met
  // (membership 12 Aug, vs Atlas 20 Jul) ever saw the ask. Measured on the
  // live rows by scripts/_probe-request-pr-cross-agency.ts.
  //
  // So the pairs are RE-RESOLVED from the roster rather than trusted, and
  // the client's `agencyId` is now advisory. Both halves of the owner's rule
  // fall out of one expression: the invited set is the ONLY source of
  // agencies, so an agency the venue did not post to never appears — not
  // even when the PR is on its roster (Vicky's third agency, Delta) — and
  // every invited agency that does hold her gets a row.
  //
  // Unknown or stale picks still DROP rather than refuse: the picker pool
  // and the agency links can drift between page load and post, and losing
  // one name must not sink the whole job.
  const invitedForRequests =
    selectedAgencyIds.length > 0 ? selectedAgencyIds : [agencyId];
  const requestRows = await listMembershipPairs(
    [...new Set((requestedPrs ?? []).map((r) => r.userId))],
    invitedForRequests,
  );

  const overAsked = demandExceedsQuantity(payTiers, shiftData.quantity);
  if (overAsked) return refusePost(400, overAsked);

  const venueRefused = await venueRuleRefusal(shiftData, ctx, earlier);
  if (venueRefused) return venueRefused;

  return {
    ok: true,
    post: {
      row: {
        ...shiftData,
        ...special.columns,
        agencyId, // authoritative — overrides any client-supplied value
        ...(postedStatus ? { status: postedStatus } : {}),
        createdBy: actor,
        updatedBy: actor,
      },
      payTiers,
      selectedAgencyIds,
      requestRows,
      eventDrinkMenu: special.eventDrinkMenu,
      // Every invited agency, not just the anchor — the same fan-out the
      // withdrawal path learned to use (0124). Falls back to the anchor for the
      // admin path, which posts to exactly one agency.
      notifyAgencyIds: selectedAgencyIds.length > 0 ? selectedAgencyIds : [agencyId],
    },
  };
}

/** Who a post goes to and in what status — or why this caller may not post it. */
type RoutedPost =
  | {
      ok: true;
      agencyId: string;
      /** Every agency invited to staff this shift (0124); empty on the admin path. */
      selectedAgencyIds: string[];
      postedStatus: 'confirmed' | undefined;
    }
  | ShiftPostRefused;

/** Step one of `checkShiftPost`: the caller's right to post, and the routing. */
async function routePost(
  input: CreateShiftInput,
  scope: OrgScope,
  ctx: ShiftPostContext,
): Promise<RoutedPost> {
  const outletId = input.outletId;
  if (scope.isAdmin) {
    if (!input.agencyId) return refusePost(400, 'agencyId is required');
    // Every agency invited to staff this shift (0124). Defaults to just the
    // resolved `agencyId` so the admin path, which posts to one agency, keeps
    // producing exactly the fan-out it always implied. Admin creates keep the
    // table default status (`draft`).
    return { ok: true, agencyId: input.agencyId, selectedAgencyIds: [], postedStatus: undefined };
  }
  if (scope.agencyId) {
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
    return refusePost(
      403,
      'Only an outlet can post a shift. The outlet posts the job to its agency.',
    );
  }
  if (!isOutletCaller(scope)) {
    return refusePost(403, 'No organization associated with this account');
  }
  // Outlet posts a job at one of its own venues; the PR request is routed
  // to the agency that onboarded that outlet. Any client-supplied agencyId
  // is ignored — the routing is authoritative and cannot be forged.
  if (!scope.outletIds.includes(outletId)) {
    return refusePost(403, 'You can only create shifts for your own outlet');
  }
  // WHICH AGENCIES THIS JOB GOES TO (0123 + 0124).
  //
  // Resolved from the outlet's APPROVED links, never from
  // `onboarded_by_agency_id` — that column is provenance now, and reading
  // it here is exactly what limited a venue to a single agency. It also
  // meant a self-signed-up outlet (null column) could never post at all.
  //
  // The client's selection is FILTERED against the approved set rather
  // than trusted: a forged agencyId must not become an invitation.
  const approved = await ctx.approvedAgencyIds(outletId);
  if (approved.length === 0) {
    return refusePost(400, NO_APPROVED_AGENCY_REFUSAL);
  }

  const requested = input.agencyIds?.length ? input.agencyIds : approved;
  const selectedAgencyIds = requested.filter((id) => approved.includes(id));
  if (selectedAgencyIds.length === 0) {
    return refusePost(403, AGENCIES_NOT_APPROVED_REFUSAL);
  }
  // The anchor is the first SELECTED agency, so `shift.agency_id` always
  // names an agency that was genuinely invited. Scoping still goes via
  // `shift_agency` — see the column comment in shift.model.ts.
  //
  // An outlet posting a job is committing to run it, so it goes straight to
  // `confirmed` — it shows up immediately as tonight's live shift (Today) and
  // as a confirmed event (Calendar). The client cannot set status; this is
  // authoritative.
  return { ok: true, agencyId: selectedAgencyIds[0], selectedAgencyIds, postedStatus: 'confirmed' };
}

/** What the clash and plan rules read of one shift — a parsed body or a prepared row. */
type VenueShift = { outletId: string; shiftDate: string; slot?: string | null; quantity?: number };

type PostedRow = PreparedShiftPost['row'];

/**
 * Step two: the venue's own rules — clash, live, plan — with the batch's
 * EARLIER items counted as though already posted. The refusal, or null.
 */
async function venueRuleRefusal(
  shiftData: VenueShift,
  ctx: ShiftPostContext,
  earlier: readonly PreparedShiftPost[],
): Promise<ShiftPostRefused | null> {
  const postedEarlier = postedEarlierAt(shiftData.outletId, earlier);

  // A VENUE'S SHIFTS MUST NOT COLLIDE. Checked before the plan gate on purpose:
  // a clash usually also pushes the day's total up, and answering it with "you
  // are over your plan" sends the venue to upgrade a plan that is not the
  // problem. The more specific cause wins.
  const clash = await venueClashRefusal(shiftData, ctx, postedEarlier);
  if (clash) return { ok: false, refusal: clash };

  /**
   * THE VENUE IS ACTUALLY LIVE — checked on the SERVER, which it never was.
   *
   * The portal has always confined a `pending_review` or `suspended` venue
   * to Settings/Profile, but that is `canAccessOutletPath()` in apps/web:
   * client RBAC. Nothing on this path ever read `outlet.status` — the only
   * `outletRepository.getById` calls in the controller fetch a venue NAME for
   * a notification — so the API accepted a post from a venue the UI had locked
   * out. That was survivable while billing ran from sign-up; now that the
   * meter starts at approval (0157), it would be work done for free.
   *
   * Verified against the live database before shipping: all 8 outlets are
   * `active` and all 4 venues that have ever posted are `active`, so this
   * takes nobody offline today.
   */
  const notLive = await ctx.venueNotLive(shiftData.outletId);
  if (notLive) return refusePost(403, notLive);

  // THE VENUE'S PLAN, enforced. Until now this cap lived only in the Post
  // Job screen's own state, so anything that was not that screen — the API,
  // a script, a second UI — could post past it silently.
  const overPlan = await venuePlanRefusal(shiftData, ctx.plan, postedEarlier);
  if (overPlan) return { ok: false, refusal: overPlan };

  return null;
}

/**
 * The batch's earlier items at THIS venue, as the database will hold them once
 * written — posted ones only, the same filter both stored reads apply.
 */
function postedEarlierAt(outletId: string, earlier: readonly PreparedShiftPost[]): PostedRow[] {
  return earlier
    .map((prepared) => prepared.row)
    .filter((row) => row.outletId === outletId && (row.status ?? 'draft') !== 'draft');
}

/**
 * The clash rule for one shift, the batch's earlier items counted in. `tx` is
 * the write guard's transaction; without one the stored shifts come from the pool.
 */
async function venueClashRefusal(
  shift: VenueShift,
  ctx: ShiftPostContext,
  postedEarlier: readonly PostedRow[],
  tx?: DbTransaction,
): Promise<RuleRefusal | null> {
  const clash = await shiftClashRefusal(ctx.shiftRepository, {
    outletId: shift.outletId,
    shiftDate: shift.shiftDate,
    slot: shift.slot,
    alsoPosting: postedEarlier.map((row) => ({
      shiftDate: row.shiftDate,
      slot: row.slot ?? null,
      eventName: row.eventName ?? null,
    })),
    client: tx,
  });
  return clash ? { status: 409, message: clash } : null;
}

/**
 * The plan rule for one shift, the batch's earlier headcount on its date counted
 * in. `readPlan` is the check's memo, through the pool, or the guard's own, read
 * through its transaction under the lock (1 Oct 2026) — never the check's memo
 * inside the write, or a plan switched in between is enforced at its old size.
 */
async function venuePlanRefusal(
  shift: VenueShift,
  readPlan: (outletId: string) => Promise<PlanLookup>,
  postedEarlier: readonly PostedRow[],
  tx?: DbTransaction,
): Promise<RuleRefusal | null> {
  const overPlan = await planCapacityRefusal({
    outletId: shift.outletId,
    shiftDate: shift.shiftDate,
    adding: shift.quantity,
    alsoPosting: postedEarlier
      .filter((row) => row.shiftDate === shift.shiftDate)
      .reduce((sum, row) => sum + (row.quantity ?? 0), 0),
    readPlan,
    client: tx,
  });
  return overPlan ? { status: 409, message: overPlan } : null;
}

/**
 * A POST'S CLASH AND PLAN RULES AGAIN, INSIDE ITS WRITE (30 Sep 2026) — the
 * guard `POST /shift` and `POST /shift/batch` hand the repository.
 *
 * `checkShiftPost` has already run and given every ordinary answer; this only
 * catches a shift that landed between that check and the write's lock (the race
 * is named in shift-write-guard.ts). Under the venues' locks it re-runs, for
 * each shift in order, the clash rule and then the plan rule, counting the
 * shifts before it through the very helpers `venueRuleRefusal` uses — so a
 * refusal here is the sentence and status the check would now give. The live
 * rule is a standing fact, already answered from the memo, and is not asked again.
 *
 * The PLAN is asked again (1 Oct 2026): once per venue per write, through the
 * transaction, after the venues are locked — the cap it sets is a rule over the
 * whole day, so it must be the plan in force when the day is counted
 * (`planCapacityRefusal` says why).
 */
export function shiftPostGuard(
  ctx: ShiftPostContext,
  posts: readonly PreparedShiftPost[],
): ShiftWriteGuard {
  return async (tx) => {
    // Filled only by the re-checks below, which run once every venue is locked.
    const planUnderLock = oncePerKey((outletId) => readOutletPlan(outletId, tx));
    await venueWriteGuard(
      posts.map((post) => post.row.outletId),
      posts.map((post, index) => async (lockedTx) => {
        const postedEarlier = postedEarlierAt(post.row.outletId, posts.slice(0, index));
        const clash = await venueClashRefusal(post.row, ctx, postedEarlier, lockedTx);
        if (clash) return clash;
        return venuePlanRefusal(post.row, planUnderLock, postedEarlier, lockedTx);
      }),
    )(tx);
  };
}
