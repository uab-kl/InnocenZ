import { metresBetween } from './check-in-geofence';
import { NON_STAFFING_STATUSES } from './shift-assignment.model';
import { shiftWindowInstants } from '@/util/slot-window';

/**
 * Can this PR physically GET to the next shift?
 *
 * `POST /shift-assignment` refuses a strict overlap and nothing else, so until
 * this existed a PR could be booked 11:00–12:00 at one venue and 12:01–13:01 at
 * another across the city and every guard passed: the two windows do not
 * intersect, and nothing anywhere measured the space BETWEEN two shifts.
 *
 * OWNER'S RULE (17 Aug 2026): the gap needed is derived from where the two venues
 * actually are — *"make the time dependent on the location of the outlets so if
 * the PR is assigned to the same outlet then there should be no time needed for
 * travelling"* — and falling short is a WARNING, not a refusal. The agency knows
 * things this model does not (the two venues share a car park; the PR lives
 * upstairs), so it may assign anyway.
 *
 * Deliberately offline. A routing API would be more accurate and would put a
 * network call, a key and a new failure mode on the assign path; a straight line
 * with a winding factor is wrong by a few minutes, which is well inside the slack
 * a warning is asking for in the first place.
 */

/**
 * Straight-line metres → road metres. Nobody travels as the crow flies; ~1.35 is
 * the usual detour ratio for a dense street grid. Too low and the warning misses
 * real trips, too high and it cries wolf on venues one street apart.
 */
const ROAD_WINDING_FACTOR = 1.35;

/** Kuala Lumpur door-to-door, traffic and all — not a highway speed. */
const AVERAGE_CITY_SPEED_KMH = 25;

/**
 * Leaving one venue and getting into the next: changing, finding the car or the
 * ride, parking, walking in. Independent of distance, which is why it is added
 * rather than folded into the speed — at 500 m the speed term is nearly zero and
 * this is the entire honest answer.
 */
const BOARDING_MINUTES = 15;

/** Nobody plans to the minute. Rounding up keeps the number readable as advice. */
const ROUND_UP_TO_MINUTES = 5;

/**
 * Past this the pins are likelier wrong than the trip is real (a mis-typed
 * coordinate, a venue pinned in the wrong country). Capping stops one bad row
 * from making every assignment at that venue look impossible.
 */
const MAX_TRAVEL_MINUTES = 180;

export interface VenuePin {
  outletId: string;
  lat: number | null;
  lng: number | null;
}

/** A shift the PR already holds, in the shape `listForPr` already returns. */
export interface NeighbourShift {
  shiftDate: string;
  slot: string | null;
  outletId: string;
  outletName: string | null;
  outletLat: number | null;
  outletLng: number | null;
  /** A real stamp beats the schedule — see `travelShortfall`. */
  checkOutAt: Date | string | null;
  /**
   * WHO holds this neighbour — and therefore both whether the agency being told
   * about it may hear the details, and whether "too tight" is advice or a refusal.
   *
   * OWN shift     -> a WARNING that names the venue. The agency can see both
   *                  bookings and knows things this model does not (the two venues
   *                  share a car park, the PR lives upstairs), so it may assign
   *                  anyway — the owner's rule of 17 Aug 2026, unchanged.
   * FOREIGN shift -> a REFUSAL that says nothing. The agency cannot see the other
   *                  booking at all, so it has nothing to exercise judgement WITH;
   *                  an override here is not a decision, it is a guess that ends
   *                  with a PR who does not arrive. See `foreignTravelBlock`.
   */
  agencyId: string;
}

export interface TravelShortfall {
  other: NeighbourShift;
  /** Minutes the trip needs. */
  needMinutes: number;
  /** Minutes the roster actually leaves. */
  haveMinutes: number;
}

/**
 * Minutes to get from one venue to the other, or null when it cannot be known.
 *
 * Null is NOT zero and callers must not collapse them: an outlet that has never
 * dropped its map pin produces null, and inventing a distance for it would warn
 * on rosters nobody can check. Zero is the real answer for the SAME venue —
 * staying put needs no travel, which is the owner's rule stated exactly.
 */
export function travelMinutesBetween(a: VenuePin, b: VenuePin): number | null {
  if (a.outletId === b.outletId) return 0;
  if (a.lat === null || a.lng === null || b.lat === null || b.lng === null) return null;

  const roadMetres =
    metresBetween({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }) * ROAD_WINDING_FACTOR;
  const minutes = (roadMetres / 1000 / AVERAGE_CITY_SPEED_KMH) * 60 + BOARDING_MINUTES;
  const rounded = Math.ceil(minutes / ROUND_UP_TO_MINUTES) * ROUND_UP_TO_MINUTES;
  return Math.min(rounded, MAX_TRAVEL_MINUTES);
}

/**
 * The WORST trip this assignment would ask of the PR, or null when every gap is
 * comfortable. Worst = least slack, so the single message shown names the tightest
 * hop rather than whichever row happened to be read first.
 *
 * ⚠️ The gap is measured from the ACTUAL check-out when there is one, and from the
 * scheduled end only otherwise. Cut-loss releases a PR mid-shift precisely so they
 * can be sent somewhere else the same night; measuring from the scheduled end would
 * fight the feature that release exists for, and would refuse to see the two free
 * hours the venue just handed back.
 *
 * Overlapping neighbours are skipped rather than warned about — an overlap is a
 * different fault with a different answer, and it is refused outright before this
 * ever runs. Warning "you have -45 minutes to travel" about a booking that was
 * rejected anyway helps nobody.
 */
export function travelShortfall(params: {
  shift: { shiftDate: string; slot: string | null } & VenuePin;
  others: NeighbourShift[];
}): TravelShortfall | null {
  const here = shiftWindowInstants(params.shift.shiftDate, params.shift.slot);
  if (!here) return null;

  let worst: TravelShortfall | null = null;
  const slack = (s: TravelShortfall) => s.haveMinutes - s.needMinutes;

  for (const other of params.others) {
    const there = shiftWindowInstants(other.shiftDate, other.slot);
    if (!there) continue;

    const needMinutes = travelMinutesBetween(params.shift, {
      outletId: other.outletId,
      lat: other.outletLat,
      lng: other.outletLng,
    });
    // Unknown pin: say nothing rather than invent a distance.
    if (needMinutes === null) continue;

    const leftThere = other.checkOutAt ? new Date(other.checkOutAt) : there.end;
    let haveMinutes: number | null = null;
    if (leftThere.getTime() <= here.start.getTime()) {
      haveMinutes = (here.start.getTime() - leftThere.getTime()) / 60_000;
    } else if (here.end.getTime() <= there.start.getTime()) {
      // The other shift comes AFTER this one, so its check-in has not happened and
      // the schedule is the only honest number for that end.
      haveMinutes = (there.start.getTime() - here.end.getTime()) / 60_000;
    }
    if (haveMinutes === null) continue;
    if (haveMinutes >= needMinutes) continue;

    const shortfall: TravelShortfall = {
      other,
      needMinutes,
      haveMinutes: Math.round(haveMinutes),
    };
    if (!worst || slack(shortfall) < slack(worst)) worst = shortfall;
  }

  return worst;
}

/** A row as `listForPr` returns it — the neighbour fields plus what filters it. */
export type HeldAssignment = NeighbourShift & { shiftId: string; status: string };

/**
 * The ONE sentence an agency hears when the PR cannot be where it wants them,
 * and the reason is none of its business.
 *
 * ⚠️ DELIBERATELY THE SAME STRING FOR A DIRECT OVERLAP AND FOR A TRAVEL SHORTFALL.
 * Two messages would separate "she is working at that exact hour" from "she is
 * working near that hour, far away", and the second one leaks DISTANCE: an agency
 * that could tell the two apart could walk a candidate time backwards until the
 * refusal changed and read off roughly how far away the other venue is. One string
 * says only what the asking agency is entitled to know — not now, try another time.
 *
 * It names no agency, no venue and no hour. It is deliberately NOT the
 * self-declared-block wording either: that one claims the whole DAY is spoken for,
 * which since the window rule is no longer true — the PR really is bookable later
 * the same day, and telling an agency otherwise would cost the PR the work.
 */
export const PR_UNAVAILABLE_THEN =
  'This PR is not available at that time — try another time, or pick someone else.';

/**
 * Is a shift held by ANOTHER agency too close to this one to be physical?
 *
 * The cross-agency half of the travel rule, and the replacement for the old
 * "THE DAY BELONGS TO THE PR" guard, which took a PR off the market for every
 * other agency for a whole CALENDAR DAY. That was far more than physics asks:
 * a PR finishing an afternoon at one venue can plainly work a night at another,
 * and the day rule refused all of it — costing the PR the shift and the second
 * agency the booking (owner's change, 20 Aug 2026).
 *
 * What is left is exactly the part that IS physics: the other shift's own window,
 * plus the time it takes to get from there to here. Anything outside that stays
 * bookable by anyone.
 *
 * Returns true/false, never a reason — the caller has nothing to say beyond
 * `PR_UNAVAILABLE_THEN`, and handing it a shortfall it must remember not to
 * render is how the venue name escapes.
 */
export function foreignTravelBlock(params: {
  shift: { shiftDate: string; slot: string | null } & VenuePin;
  others: NeighbourShift[];
  actingAgencyId: string;
}): boolean {
  const foreign = params.others.filter((o) => o.agencyId !== params.actingAgencyId);
  if (foreign.length === 0) return false;
  return travelShortfall({ shift: params.shift, others: foreign }) !== null;
}

/**
 * The travel warning for putting `prId` on `shift`, or null — the whole check,
 * end to end, for every lane that seats a PR.
 *
 * THREE lanes reach this: `POST /shift-assignment` (a fresh assignment),
 * `PUT /shift-assignment/:id` when a cancelled row is re-staffed, and outlet-swap
 * approve. They are different endpoints in different controllers, but they make the
 * same thing true — a person is now expected at a venue at a time — so the rule
 * about whether they can get there has to be ONE implementation. It was inline in
 * `create` first; that is exactly how the second and third lanes end up with a
 * slightly different idea of which statuses count.
 *
 * ⚠️ Call it AFTER the write. The lanes differ in what they change, and reading the
 * PR's roster afterwards is the only way to see the state being warned about — a
 * swap in particular is only true once the move has happened.
 *
 * Never throws: advice that fails must not turn a completed booking into a 500.
 * Pass `onError` to log it — silence here would hide a broken check forever.
 */
export async function travelWarningFor(params: {
  shift: { shiftDate: string; slot: string | null; outletId: string };
  prId: string;
  /**
   * WHOSE roster this advice is for. Only this agency's OWN shifts are compared.
   *
   * ⚠️ Without it this warning named a rival's venue and hours in plain text —
   * `travelGapWarning` renders "this PR also works 15:00 - 04:00 at JK House" —
   * which is the exact disclosure the refusals next to it are written to prevent.
   * A tight turnaround against ANOTHER agency's booking is not advice at all: it
   * is refused outright by `foreignTravelBlock` before the write, and there is
   * nothing left for the agency to weigh. So foreign neighbours are dropped here
   * rather than described.
   */
  actingAgencyId: string;
  /** Excluded from the comparison — the shift being seated is not its own neighbour. */
  excludeShiftId?: string;
  loadPin: (outletId: string) => Promise<VenuePin | null>;
  loadAssignments: (prId: string) => Promise<HeldAssignment[]>;
  onError?: (error: unknown) => void;
}): Promise<string | null> {
  try {
    const pin = await params.loadPin(params.shift.outletId);
    if (!pin) return null;
    const held = await params.loadAssignments(params.prId);
    // 'completed' rows stay IN: a finished shift is precisely the one a PR travels
    // FROM, and its `checkOutAt` is what makes an early cut-loss release count as
    // the free time it actually is. Only rows where the PR is NOT there are dropped.
    //
    // Imported rather than spelled out: seven other call sites read this list from
    // the model, and a fourth non-staffing status added there would have reached
    // all of them and not this one — the module would have kept warning about a
    // shift the PR is no longer expected at. Same list, one owner.
    const neighbours = held.filter(
      (a) =>
        a.shiftId !== params.excludeShiftId &&
        // THIS AGENCY'S OWN SHIFTS ONLY — see `actingAgencyId` above. A foreign
        // neighbour is already a refusal, and describing one here would hand over
        // the venue and hours that refusal exists to withhold.
        a.agencyId === params.actingAgencyId &&
        !NON_STAFFING_STATUSES.includes(a.status as (typeof NON_STAFFING_STATUSES)[number]),
    );
    return travelGapWarning(
      travelShortfall({
        shift: {
          shiftDate: params.shift.shiftDate,
          slot: params.shift.slot,
          outletId: params.shift.outletId,
          lat: pin.lat,
          lng: pin.lng,
        },
        others: neighbours,
      }),
    );
  } catch (error) {
    params.onError?.(error);
    return null;
  }
}

/** Minutes as something a person reads: "1 h 20 m", "45 min", "no time at all". */
function humanMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m === 0) return 'no time at all';
  if (m < 60) return `${m} min`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} m`;
}

/**
 * The warning an agency sees, or null when the roster is fine.
 *
 * Names the other venue, what the trip needs and what the roster leaves — an
 * agency overriding this needs all three, and "too tight" is not a fact anyone can
 * act on.
 */
export function travelGapWarning(shortfall: TravelShortfall | null): string | null {
  if (!shortfall) return null;
  const venue = shortfall.other.outletName ?? 'another venue';
  return (
    `Tight turnaround: this PR also works ${shortfall.other.slot ?? 'a shift'} at ${venue}, ` +
    `which leaves ${humanMinutes(shortfall.haveMinutes)} to get between the two — ` +
    `about ${humanMinutes(shortfall.needMinutes)} of travel. Assigned anyway; ` +
    `pick someone else if they cannot make it.`
  );
}
