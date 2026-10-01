import {
  lockPrBookings,
  lockShiftSeats,
  ShiftWriteRefused,
  type RuleRefusal,
  type ShiftWriteGuard,
} from '@/features/shift/shift-write-guard';
import type { ShiftRepositoryClass } from '@/features/shift/shift.repository';
import type { DbTransaction } from '@/types/db-transaction';
import { shiftsOverlap } from '@/util/slot-window';
import { NON_STAFFING_STATUSES } from './shift-assignment.model';
import type { ShiftAssignmentRepositoryClass } from './shift-assignment.repository';
import {
  foreignTravelBlock,
  PR_UNAVAILABLE_THEN,
  type HeldAssignment,
  type VenuePin,
} from './travel-gap';

/**
 * CAN THIS PR BE SEATED HERE? — what every lane that puts a person on a shift
 * reads from that person's OTHER bookings (30 Sep 2026).
 *
 * Three lanes seat a PR: `POST /shift-assignment`, the re-staffing
 * `PUT /shift-assignment/:id`, and outlet-swap approval. Each checked these
 * rules BEFORE its write and wrote afterwards, so two bookings of one PR at two
 * venues — or a booking beside an edit that moves one of her shifts — could each
 * pass against a database holding neither, and both commit: one person in two
 * places. Moved out of the two controllers so the check before the write and the
 * re-check inside it are ONE implementation: the write takes the shift's lock,
 * then the PR's (shift-write-guard.ts), and re-reads everything through its own
 * transaction before any row is locked or written.
 */

/** The shift being filled, as the rules read it. */
export type SeatShift = { id: string; shiftDate: string; slot: string | null; outletId: string };

/** What the PR's other bookings say about seating them on `shift`. */
export type SeatFacts = {
  /** Already on this very shift, in a staffing status. */
  alreadyHere?: HeldAssignment;
  /** Another live booking whose window overlaps this one. */
  overlap?: HeldAssignment;
  /** Another AGENCY's booking too close to travel between. */
  travelBlocked: boolean;
};

const staffing = (a: HeldAssignment) =>
  !NON_STAFFING_STATUSES.includes(a.status as (typeof NON_STAFFING_STATUSES)[number]);

/**
 * The three facts, from the PR's bookings (`listForPr`) and the shift's venue pin.
 *
 * OVERLAP — a PR may work two shifts on one day, but only at different times.
 * Compared on a continuous timeline, so an overnight 22:00–04:00 also meets the
 * next morning's 02:00–06:00; label-only slots carry no window and never clash.
 * A CLOSED shift never clashes: `completed` or a check-out stamp is a fact about
 * the past, and cut-loss releases a PR mid-shift precisely so they can be sent
 * somewhere else the same night.
 *
 * TRAVEL — the shift and the trip belong to the PR, not the day (owner, 20 Aug
 * 2026): only the other shift's window plus the time to get between the venues
 * is off the market. ⚠️ Asymmetric on purpose: against this agency's OWN booking
 * a tight turnaround is a warning it may override (`travelWarningFor`, after the
 * write); against a FOREIGN one it is a refusal, because that agency cannot see
 * the other shift at all. Completed shifts stay IN here — a finished shift is
 * precisely the one a PR travels FROM. No pin, no verdict: physics that cannot
 * be computed must not block.
 *
 * `vacating` is a shift the PR leaves in the same move (a swap's origin): it is
 * neither a neighbour nor a clash.
 */
export function seatFacts(input: {
  shift: SeatShift;
  pin: VenuePin | null;
  held: readonly HeldAssignment[];
  actingAgencyId: string;
  vacating?: string;
}): SeatFacts {
  const { shift, pin } = input;
  const neighbours = input.held.filter(
    (a) => a.shiftId !== shift.id && a.shiftId !== input.vacating && staffing(a),
  );
  return {
    alreadyHere: input.held.find((a) => a.shiftId === shift.id && staffing(a)),
    overlap: neighbours.find(
      (a) =>
        a.status !== 'completed' &&
        !a.checkOutAt &&
        shiftsOverlap(shift.shiftDate, shift.slot, a.shiftDate, a.slot),
    ),
    travelBlocked:
      !!pin &&
      foreignTravelBlock({
        shift: { ...shift, lat: pin.lat, lng: pin.lng },
        others: neighbours,
        actingAgencyId: input.actingAgencyId,
      }),
  };
}

/**
 * `POST /shift-assignment`'s answers. WHOSE booking it collides with decides
 * what may be SAID about it: this agency's own is named in full — slot and
 * venue — which is what makes the refusal actionable. Another agency's may say
 * none of that: the venue is a rival's client and the slot is when it trades,
 * and fired at a roster one PR at a time this endpoint would become a survey of
 * a competitor's business. So every foreign cause answers `PR_UNAVAILABLE_THEN`,
 * ONE string, so a direct collision and a travel shortfall cannot be told apart.
 *
 * Already on this shift is checked first: the `(shift_id, pr_id)` index is
 * agency-agnostic by design, so its bare refusal would tell a rival agency this
 * person is already working for someone else that night.
 */
export function assignAnswer(facts: SeatFacts, actingAgencyId: string): RuleRefusal | null {
  if (facts.alreadyHere) {
    return {
      status: 409,
      message:
        facts.alreadyHere.agencyId === actingAgencyId
          ? 'PR is already assigned to this shift'
          : PR_UNAVAILABLE_THEN,
    };
  }
  if (facts.overlap) return overlapAnswer(facts.overlap, actingAgencyId);
  return facts.travelBlocked ? { status: 400, message: PR_UNAVAILABLE_THEN } : null;
}

/** The assign lane's overlap refusal, to an AGENCY: its own booking named, a rival's never. */
function overlapAnswer(clash: HeldAssignment, actingAgencyId: string): RuleRefusal {
  return {
    status: 400,
    message:
      clash.agencyId === actingAgencyId
        ? `This PR already works ${clash.slot ?? 'a shift'} at ${clash.outletName ?? 'another outlet'} that day — pick a time that does not overlap.`
        : PR_UNAVAILABLE_THEN,
  };
}

/**
 * Re-staffing a cancelled row (`PUT /shift-assignment/:id`) — the same two
 * physical-presence rules, as 409s: without them the way to double-book a
 * person across two agencies was to book them, cancel, and put them back.
 */
export function reStaffAnswer(facts: SeatFacts, agencyId: string): RuleRefusal | null {
  if (facts.overlap) {
    const clash = facts.overlap;
    return {
      status: 409,
      message:
        clash.agencyId === agencyId
          ? `This PR already works ${clash.slot ?? 'a shift'} at ${clash.outletName ?? 'another outlet'} that day — they cannot be put back on this shift.`
          : PR_UNAVAILABLE_THEN,
    };
  }
  return facts.travelBlocked ? { status: 409, message: PR_UNAVAILABLE_THEN } : null;
}

/**
 * Swap approval — the PR is the caller and can see both of her bookings, so the
 * refusal is plain rather than the anonymous agency-facing sentence.
 *
 * AN OVERLAP IS REFUSED TOO (30 Sep 2026). The swap lane only ever asked about
 * the TRIP, and `travelShortfall` skips overlapping shifts by design — so a
 * swap onto a time she already works elsewhere was approved: one person in two
 * places. It answers in the same sentence as the travel refusal, deliberately:
 * the assign lane's overlap sentence addresses an AGENCY ("This PR … pick a
 * time"), which is the wrong reader here, and an overlapping shift is the
 * extreme of "too close" — no time at all to get between the venues.
 */
export function swapApproveAnswer(facts: SeatFacts): RuleRefusal | null {
  return facts.overlap || facts.travelBlocked
    ? {
        status: 409,
        message:
          'Another of your shifts is too close to this one — there is not enough time to travel between the venues, so this swap can no longer be approved.',
      }
    : null;
}

/**
 * Raising a swap — a courtesy screen to the AGENCY, which approval then
 * guarantees. An overlap answers exactly as assigning her there would (the
 * assign lane's 400: its own booking named, a rival's never); a trip too short
 * to a rival's shift keeps its anonymous 409.
 */
export function swapRequestAnswer(facts: SeatFacts, actingAgencyId: string): RuleRefusal | null {
  if (facts.overlap) return overlapAnswer(facts.overlap, actingAgencyId);
  return facts.travelBlocked ? { status: 409, message: PR_UNAVAILABLE_THEN } : null;
}

/** The reads the rules make, each through the pool or a write's transaction. */
export type SeatReads = {
  shiftRepository: Pick<ShiftRepositoryClass, 'getById'>;
  assignments: Pick<ShiftAssignmentRepositoryClass, 'getOutletPin' | 'listForPr'>;
};

/**
 * One lane's seating rules, twice: `check` before the write, through the pool,
 * on the shift the caller already read; `guard` inside the write, FIRST — the
 * shift's lock, then the PR's, then the shift re-read (an edit may have re-timed
 * it) and the rules again through the transaction. One definition, so a refusal
 * under the lock is the lane's own sentence and status.
 *
 * `prId` is the id `listForPr` filters on, so the lock covers exactly the rows
 * the rules read.
 */
export function seatingRules(
  reads: SeatReads,
  seat: { shiftId: string; prId: string; actingAgencyId: string; vacating?: string },
  answer: (facts: SeatFacts, actingAgencyId: string) => RuleRefusal | null,
): { check: (shift: SeatShift) => Promise<RuleRefusal | null>; guard: ShiftWriteGuard } {
  const judge = async (shift: SeatShift | null, client?: DbTransaction) => {
    // Gone: the write's own not-found answer covers it.
    if (!shift) return null;
    const pin = await reads.assignments.getOutletPin(shift.outletId, client);
    const held = await reads.assignments.listForPr(seat.prId, client);
    const facts = seatFacts({
      shift,
      pin,
      held,
      actingAgencyId: seat.actingAgencyId,
      vacating: seat.vacating,
    });
    return answer(facts, seat.actingAgencyId);
  };
  return {
    check: (shift) => judge(shift),
    guard: async (tx) => {
      await lockShiftSeats(tx, [seat.shiftId]);
      await lockPrBookings(tx, [seat.prId]);
      const refused = await judge(await reads.shiftRepository.getById(seat.shiftId, tx), tx);
      if (refused) throw new ShiftWriteRefused(refused.status, refused.message, 0);
    },
  };
}
