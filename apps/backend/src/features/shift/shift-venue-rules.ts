import type { OutletRepositoryClass } from '@/features/outlet/outlet.repository';
import {
  outletDailyPrUsage,
  resolveActivePlanLimit,
  type PlanLookup,
} from '@/features/subscription/plan-limit';
import type { DbTransaction } from '@/types/db-transaction';
import { shiftDayKey, shiftsOverlap, slotsAreSameWindow } from '@/util/slot-window';
import type { ShiftRepositoryClass } from './shift.repository';

/**
 * A VENUE'S RULES FOR ITS OWN SHIFTS — the refusals that posting AND editing a
 * shift answer with (`POST /shift`, `POST /shift/batch`, `PUT /shift/:id`).
 *
 * Moved out of shift.controller.ts unchanged (30 Sep 2026), so the controller
 * reads as requests and this file as rules. Each rule answers with its refusal
 * SENTENCE, or null; the caller chooses the status. The web translates these
 * sentences by exact match or anchored pattern (`outlet-write-refusal.ts`), so a
 * change to any wording here is a change there too.
 */

/**
 * The post's refusals for WHO may staff a venue and WHOSE card a shift wears —
 * answered by `POST /shift` and, since 30 Sep 2026, by an admin's `PUT` that
 * moves a shift to another venue (shift-edit-rules.ts). One string each, so the
 * two cannot drift apart under the web's exact-match translation.
 */
export const NO_APPROVED_AGENCY_REFUSAL =
  'No approved agency to request PR from — link an agency in Settings first';
export const AGENCIES_NOT_APPROVED_REFUSAL =
  'None of the selected agencies are approved for this outlet';
export const UNKNOWN_TEMPLATE_REFUSAL = 'Unknown event template for this outlet';

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
export function demandExceedsQuantity(
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
 * NO ACTIVE PLAN REFUSES OUTRIGHT (owner's call, 2 Sep 2026). This used to wave
 * such a venue through on the reasoning that "no subscription is a billing
 * problem, not a posting problem" — but the effect was the opposite of what that
 * sentence implies: because `resolveActivePlanLimit` returned nothing and the
 * check below was skipped, a venue with NO plan could request UNLIMITED PRs a
 * day, while a venue paying for the cheapest one was capped. The failure ran in
 * the permissive direction, so holding the cheapest plan was strictly worse than
 * holding none. The rule is now that no outlet may exist without a plan, and
 * this is where a venue that somehow does is stopped.
 *
 * It is checked BEFORE the `asking <= 0` return, unlike the capacity rule below:
 * "you have no plan" does not depend on the headcount, and a shift created
 * without an explicit quantity would otherwise slip past the gate entirely.
 *
 * Two cases still do NOT refuse:
 *   • `limitAmount` null on a real plan — Premier and the open-ended bands are a
 *     floor with no ceiling, and the POS add-on is not a capacity product.
 *   • the lookup or the usage count FAILED — a gate must not refuse on a fact it
 *     does not have, and must not read a failed count as "nothing used" either.
 *     This is why `PlanLookup` separates `none` from `unknown`: a database blip
 *     must not read as "no plan" and take every venue offline at once.
 */
const NO_PLAN_REFUSAL =
  'This venue has no active subscription plan, so it cannot post shifts. ' +
  'Choose a plan under Settings → Subscription, or contact InnocenZ.';

/**
 * The venue's live plan — what `planCapacityRefusal` reads unless handed a memo.
 * Through the pool, or through the write guard's transaction under the lock.
 */
export function readOutletPlan(outletId: string, client?: DbTransaction): Promise<PlanLookup> {
  return resolveActivePlanLimit({ subscriberType: 'outlet', subscriberId: outletId }, client);
}

export async function planCapacityRefusal(params: {
  outletId: string;
  shiftDate: string;
  adding: number | undefined;
  excludeShiftId?: string;
  /**
   * Headcount the SAME batch already asks for on this date, in items that passed
   * before this one (`POST /shift/batch`). Not in the database yet — they are
   * written together — so it is added to the stored day as though it were.
   */
  alsoPosting?: number;
  /**
   * How to read the venue's plan: `readOutletPlan` through `client` unless the
   * caller hands in a memo, so a batch reads each venue's plan once rather than
   * once per item — the check's (`createShiftPostContext`, through the pool), or
   * the guard's own, filled through its transaction (`shiftPostGuard`).
   */
  readPlan?: (outletId: string) => Promise<PlanLookup>;
  /**
   * The write guard's transaction (shift-write-guard.ts, 30 Sep 2026): the day
   * — and, without a `readPlan`, the plan — are then read under the venue's
   * lock, on the connection that holds it. Omitted, through the pool.
   *
   * THE PLAN IS READ AGAIN UNDER THE LOCK (1 Oct 2026). The guard used to judge
   * the day it counted under the lock against the plan the CHECK had read
   * before it, so a plan switched in between was enforced at its old size: a
   * post decided on Growth could land after one decided on the new, smaller
   * plan had filled the day, and leave it past that plan's cap. Read under the
   * lock, every post at a venue is judged against the plan in force when it
   * holds the venue, counting every post before it. A plan switch takes no
   * venue lock and needs none: it never reads a day's shifts, so a post landing
   * either side of it is a real order. And a check whose plan read FAILED no
   * longer waves the post through the cap — the guard asks again.
   */
  client?: DbTransaction;
}): Promise<string | null> {
  const plan = params.readPlan
    ? await params.readPlan(params.outletId)
    : await readOutletPlan(params.outletId, params.client);
  if (plan.kind === 'unknown') return null;
  if (plan.kind === 'none') return NO_PLAN_REFUSAL;

  const asking = params.adding ?? 0;
  if (asking <= 0) return null;
  if (plan.limitAmount === null) return null;

  const stored = await outletDailyPrUsage(
    {
      outletId: params.outletId,
      shiftDate: params.shiftDate,
      excludeShiftId: params.excludeShiftId,
    },
    params.client,
  );
  // An unknown count skips the gate even with batch items on the day: the rule
  // is never to refuse on a fact we do not have, whatever else we know.
  if (stored < 0) return null;

  const used = stored + (params.alsoPosting ?? 0);
  const total = used + asking;
  if (total <= plan.limitAmount) return null;

  const left = Math.max(0, plan.limitAmount - used);
  return (
    `Your ${plan.planName} plan covers ${plan.limitAmount} PR${plan.limitAmount === 1 ? '' : 's'} a day. ` +
    `${used} already requested on ${params.shiftDate}, so this shift can ask for at most ${left} more — ` +
    `lower the headcount or upgrade the plan.`
  );
}

/**
 * Is this venue live enough to post work — as a refusal message, or null.
 *
 * ONLY `active` MAY POST. A `pending_review` venue has not been let in yet, a
 * `suspended` one has been shut out, and an `inactive` one cannot even sign
 * in. All three are already refused by the portal's own routing
 * (`isOrgProfileOnly` → no nav at all), but that lives in apps/web, and a
 * client-side gate is a UI convenience rather than a rule.
 *
 * ⚠️ A LOOKUP FAILURE DOES NOT REFUSE. `getById` returns null both for "no
 * such venue" and for a query that threw, and a database blip must not take
 * every venue offline at once — the same rule `planCapacityRefusal` follows
 * for its own `unknown` case, and the reason `PlanLookup` distinguishes the
 * two at all. A missing outlet id is caught by the scope checks above this,
 * which run first.
 *
 * The message names the state, because the venue's own status is something
 * its own people can already see, and "contact InnocenZ" with no reason is
 * what sends someone to reset a password that was never the problem.
 */
export async function venueNotLiveRefusal(
  outletRepository: Pick<OutletRepositoryClass, 'getById'>,
  outletId: string,
  /** An admin move re-reads the target's status under the venues' locks (30 Sep 2026). */
  client?: DbTransaction,
): Promise<string | null> {
  const outlet = await outletRepository.getById(outletId, client);
  if (!outlet) return null;
  if (outlet.status === 'active') return null;
  if (outlet.status === 'pending_review') {
    return (
      'This venue is still awaiting InnocenZ approval, so it cannot post shifts yet. ' +
      'You will be notified as soon as it is approved.'
    );
  }
  return `This venue is ${outlet.status} and cannot post shifts. Contact InnocenZ to restore access.`;
}

/**
 * A venue's own shifts must not collide in time — as a refusal message, or null.
 *
 * OWNER'S RULE (17 Aug 2026): "I don't want an outlet to have clashing time for
 * their shifts." ANY overlap is refused, not merely an exact repeat.
 *
 * ⚠️ BACK-TO-BACK IS DELIBERATELY ALLOWED — it was blocked here for one revision and
 * that was the wrong place for the rule. A venue running 11:00–12:00 and 12:00–13:00
 * is posting two shifts it may well staff with two different people, which is its
 * business and harms nobody. The real constraint is on the PERSON who would have to
 * be in two places, and that is the assign-time travel gap; enforcing it here would
 * have stopped a legitimate roster while still not stopping what actually goes wrong.
 *
 * Nothing before this looked at the clock at all. `create` checked the tier mix
 * and the plan's daily headcount, and both of those measure a DAY — a day's demand
 * is ADDITIVE, so 2 + 3 reads as a legitimate 5 whether that is two shifts or one
 * shift said twice.
 *
 * Two tests, because they carry different advice and because `shiftsOverlap` needs
 * a parseable window at both ends — two label-only slots ("Late night" twice on one
 * date) are invisible to it and are caught by name instead.
 *
 * Returns null when the shift carries no slot: with no time given there is
 * nothing to compare, and refusing on that would block a venue that posts
 * untimed shifts on purpose.
 */
export async function shiftClashRefusal(
  shiftRepository: Pick<ShiftRepositoryClass, 'listByOutletAroundDate'>,
  params: {
    outletId: string;
    shiftDate: string;
    slot: string | null | undefined;
    excludeShiftId?: string;
    /**
     * This venue's shifts from EARLIER items of the same batch
     * (`POST /shift/batch`) — not written yet, and compared as though they were,
     * so two items of one batch cannot clash with each other. Not narrowed to
     * the ±1 day the stored read uses: `shiftsOverlap` is exact on its own, and
     * nothing further away than that can overlap anyway.
     */
    alsoPosting?: readonly { shiftDate: string; slot: string | null; eventName: string | null }[];
    /** The write guard's transaction (30 Sep 2026) — the stored shifts are read under its lock. */
    client?: DbTransaction;
  },
): Promise<string | null> {
  if (!params.slot?.trim()) return null;

  const stored = await shiftRepository.listByOutletAroundDate(
    {
      outletId: params.outletId,
      shiftDate: params.shiftDate,
      excludeShiftId: params.excludeShiftId,
    },
    params.client,
  );
  // Stored shifts first: when both would clash, the one already on the
  // calendar is the one to name.
  const nearby = [...stored, ...(params.alsoPosting ?? [])];

  const sameDayAs = (other: string) =>
    shiftDayKey(other) === shiftDayKey(params.shiftDate);
  const clash = nearby.find(
    (s) =>
      shiftsOverlap(params.shiftDate, params.slot, s.shiftDate, s.slot) ||
      (sameDayAs(s.shiftDate) && slotsAreSameWindow(s.slot, params.slot)),
  );
  if (!clash) return null;

  const named = clash.eventName ? ` ("${clash.eventName}")` : '';
  const where = `${clash.slot} on ${String(clash.shiftDate).slice(0, 10)}${named}`;

  // Two shapes, two remedies — and a refusal that names the wrong one is barely
  // better than no message: the same time twice wants a bigger headcount, an
  // overlap wants a different clock.
  if (slotsAreSameWindow(clash.slot, params.slot) && sameDayAs(clash.shiftDate)) {
    return (
      `You already have a shift at ${where}. Raise that shift's headcount instead of ` +
      `posting a second one for the same time.`
    );
  }
  return (
    `This clashes with your shift at ${where} — an outlet's shifts cannot overlap. ` +
    `Change this shift's time, or move the other one first.`
  );
}
