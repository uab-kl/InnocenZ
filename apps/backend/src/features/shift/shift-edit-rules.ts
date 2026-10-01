import type { OutletRepositoryClass } from '@/features/outlet/outlet.repository';
import { NON_STAFFING_STATUSES } from '@/features/shift-assignment/shift-assignment.model';
import type { ShiftAssignmentRepositoryClass } from '@/features/shift-assignment/shift-assignment.repository';
import type { DbTransaction } from '@/types/db-transaction';
import { shiftsOverlap } from '@/util/slot-window';
import type { ShiftRepositoryClass } from './shift.repository';
import {
  AGENCIES_NOT_APPROVED_REFUSAL,
  NO_APPROVED_AGENCY_REFUSAL,
  planCapacityRefusal,
  shiftClashRefusal,
  UNKNOWN_TEMPLATE_REFUSAL,
  venueNotLiveRefusal,
} from './shift-venue-rules';
import {
  lockPrBookings,
  lockShiftSeats,
  lockVenueShiftWrites,
  ShiftWriteRefused,
  type RuleRefusal,
  type ShiftWriteGuard,
} from './shift-write-guard';

/**
 * `PUT /shift/:id`'S RULES (30 Sep 2026) — the venue's (clash, live, plan) and
 * the PRs' (double-booking), as ONE definition run twice: by the controller
 * through the pool as its check, then by the write's guard through the
 * transaction, under the locks, so the answer under the lock is the check's own.
 *
 * Two races lived here. An edit beside a post (shift-write-guard.ts). And an
 * edit that moves this shift in time beside a booking of one of its PRs
 * somewhere else: the double-booking loop read her other shifts, the booking
 * read this one at its OLD time, and both committed. A venue lock cannot see a
 * booking at ANOTHER venue, so the guard also takes this shift's seat lock and
 * each PR's booking lock — after the venue locks, in the one order every lane
 * keeps — and re-reads her bookings under them.
 */

/** What the edit changes that the rules read. */
export type ShiftEdit = {
  shiftId: string;
  /** Where the shift is now, and where the edit leaves it — the same unless an admin moves it. */
  fromOutletId: string;
  toOutletId: string;
  /** The shift's time after the edit, and whether that differs from the stored time. */
  shiftDate: string;
  slot: string | null;
  timingChanged: boolean;
  /** The headcount the shift will ask for. */
  adding: number | undefined;
};

export type EditDeps = {
  shiftRepository: Pick<ShiftRepositoryClass, 'listByOutletAroundDate'>;
  outletRepository: Pick<OutletRepositoryClass, 'getById'>;
  assignments: Pick<ShiftAssignmentRepositoryClass, 'listByShift' | 'listForPr'>;
};

/** Does the edit put the shift at another venue? Postgres reads a uuid in either case. */
function isMove(edit: Pick<ShiftEdit, 'fromOutletId' | 'toOutletId'>): boolean {
  return edit.toOutletId.toLowerCase() !== edit.fromOutletId.toLowerCase();
}

/**
 * A move's refusal when the target approves SOME of the shift's agencies but not
 * all (1 Oct 2026). The post's "None of the selected agencies…" is exact for a
 * post, which refuses only once every pick has been filtered out; a move refuses
 * on the first agency missing, and said "none" while the target approved the
 * rest. "This shift's agencies" — the ones it was sent to AND the anchor the
 * edit names, which need not be one of them. Admin-only, like the move itself:
 * no portal screen moves a shift.
 */
export const SOME_AGENCIES_NOT_APPROVED_REFUSAL =
  "Only some of this shift's agencies are approved for that outlet — " +
  'link the others to it first, or withdraw the shift and post it again';

/**
 * AN ADMIN MOVE'S STANDING CHECKS at the target venue (30 Sep 2026), before any
 * other rule and in the post's own order and words: WHO may staff the shift
 * there, then WHOSE card it wears.
 *
 * Every agency the shift was sent to must be approved at the target — the post
 * answers 400 when a venue has no approved agency at all and 403 when the ones
 * named are not approved, and so does a move: 403 with the post's own "None of…"
 * when not one is approved there, and `SOME_AGENCIES_NOT_APPROVED_REFUSAL` when
 * only some are. A post can drop an unapproved pick; a move cannot, because the
 * agencies a shift was sent to are fixed at posting. Then its event template —
 * the one the edit names, or the one it already carries — must be the TARGET's
 * own card, or the moved shift would wear another venue's picture.
 *
 * Standing facts: read once, here, and not again under the lock.
 */
export async function moveRefusal(
  deps: {
    approvedAgencyIds: (outletId: string) => Promise<string[]>;
    templateBelongsToOutlet: (templateId: string, outletId: string) => Promise<boolean>;
  },
  move: { toOutletId: string; agencyIds: readonly string[]; templateId: string | null },
): Promise<RuleRefusal | null> {
  const approved = await deps.approvedAgencyIds(move.toOutletId);
  if (approved.length === 0) return { status: 400, message: NO_APPROVED_AGENCY_REFUSAL };
  // Lower-cased on both sides: Postgres reads a uuid in either case. (The anchor
  // is usually listed twice — once invited, once as the anchor — which changes
  // neither count's verdict.)
  const approvedThere = new Set(approved.map((agencyId) => agencyId.toLowerCase()));
  const missing = move.agencyIds.filter(
    (agencyId) => !approvedThere.has(agencyId.toLowerCase()),
  ).length;
  if (missing > 0) {
    return {
      status: 403,
      message:
        missing === move.agencyIds.length
          ? AGENCIES_NOT_APPROVED_REFUSAL
          : SOME_AGENCIES_NOT_APPROVED_REFUSAL,
    };
  }
  if (move.templateId && !(await deps.templateBelongsToOutlet(move.templateId, move.toOutletId))) {
    return { status: 400, message: UNKNOWN_TEMPLATE_REFUSAL };
  }
  return null;
}

/** The shift's assignments that still put someone on it. */
function liveOn<T extends { status: string }>(rows: readonly T[]): T[] {
  return rows.filter(
    (a) => !NON_STAFFING_STATUSES.includes(a.status as (typeof NON_STAFFING_STATUSES)[number]),
  );
}

export function shiftEditRules(
  deps: EditDeps,
  edit: ShiftEdit,
): { check: () => Promise<RuleRefusal | null>; guard: ShiftWriteGuard } {
  const moving = isMove(edit);

  /**
   * THE VENUE'S RULES, at the venue the shift ends up at.
   *
   * The clash is gated on `timingChanged` deliberately: a row that already
   * clashed before this rule existed must stay editable, or the venue can
   * neither change its headcount nor move it out of the way. An ADMIN MOVE to
   * another venue is a new placement there, so it answers to that venue's rules
   * as a post would — clash, then live, then plan (409 / 403 / 409). Nothing
   * checked the target at all before: a support move could stack a shift on the
   * target's clock, past its plan, at a suspended venue.
   *
   * The plan is measured WITHOUT this shift's own stored headcount, so raising
   * a shift from 4 to 5 is checked as 5, not 9. The check reads the plan through
   * the pool; the guard reads it AGAIN through its transaction, under the locks
   * (1 Oct 2026), so a plan switched in between is enforced at its new size —
   * why, in `planCapacityRefusal`.
   */
  const venueRules = async (tx?: DbTransaction): Promise<RuleRefusal | null> => {
    if (edit.timingChanged || moving) {
      const clash = await shiftClashRefusal(deps.shiftRepository, {
        outletId: edit.toOutletId,
        shiftDate: String(edit.shiftDate).slice(0, 10),
        slot: edit.slot,
        excludeShiftId: edit.shiftId,
        client: tx,
      });
      if (clash) return { status: 409, message: clash };
    }
    if (moving) {
      // Re-read under the lock too — one row, on the transaction's own connection:
      // a venue suspended between the check and the lock must not take the shift.
      const closed = await venueNotLiveRefusal(deps.outletRepository, edit.toOutletId, tx);
      if (closed) return { status: 403, message: closed };
    }
    const overPlan = await planCapacityRefusal({
      outletId: edit.toOutletId,
      shiftDate: edit.shiftDate,
      adding: edit.adding,
      excludeShiftId: edit.shiftId,
      client: tx,
    });
    return overPlan ? { status: 409, message: overPlan } : null;
  };

  /**
   * MOVING A SHIFT'S TIME IS THE OTHER WAY A PR GETS DOUBLE-BOOKED — the same
   * outcome as assigning into a clash, from the opposite direction, and silent,
   * because nobody is assigning anything at that moment.
   *
   * ⚠️ WHOSE shift it collides with decides what may be SAID: on this route the
   * caller is the VENUE, so "own" means this venue's other shift. `listForPr`
   * carries no agency filter, and cannot — a person is in one place at a time
   * whoever booked them — so the row found is routinely another agency's
   * booking at a third venue. The foreign branch says only that the PR is not
   * free then, ONE string for every non-own cause: two distinguishable refusals
   * would let a caller walk the clock and read off where the other venue is.
   */
  const doubleBooking = async (tx?: DbTransaction): Promise<RuleRefusal | null> => {
    if (!edit.timingChanged) return null;
    for (const a of liveOn(await deps.assignments.listByShift(edit.shiftId, tx))) {
      const others = await deps.assignments.listForPr(a.prId, tx);
      const clash = liveOn(others).find(
        (o) =>
          o.shiftId !== edit.shiftId &&
          shiftsOverlap(edit.shiftDate, edit.slot, o.shiftDate, o.slot),
      );
      if (clash) {
        return {
          status: 400,
          message:
            clash.outletId === edit.fromOutletId
              ? `That time clashes with another shift this PR works here (${clash.slot ?? 'a shift'}) — move that one first, or unassign them here.`
              : 'A PR on this shift is not available at that time — pick another time, or unassign them here.',
        };
      }
    }
    return null;
  };

  return {
    check: async () => (await venueRules()) ?? (await doubleBooking()),
    guard: async (tx) => {
      // Both venues on a move — the one it leaves and the one it joins.
      await lockVenueShiftWrites(tx, [edit.fromOutletId, edit.toOutletId]);
      const venueRefused = await venueRules(tx);
      if (venueRefused) throw new ShiftWriteRefused(venueRefused.status, venueRefused.message, 0);
      if (!edit.timingChanged) return;
      // This shift's seats first — no booking onto it can land while we hold
      // them — then every PR on it. Read again after their locks: a PR may have
      // come off meanwhile, and none can have come on.
      await lockShiftSeats(tx, [edit.shiftId]);
      const onShift = liveOn(await deps.assignments.listByShift(edit.shiftId, tx));
      await lockPrBookings(tx, onShift.map((a) => a.prId));
      const prRefused = await doubleBooking(tx);
      if (prRefused) throw new ShiftWriteRefused(prRefused.status, prRefused.message, 0);
    },
  };
}
