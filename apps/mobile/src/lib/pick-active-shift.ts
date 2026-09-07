/**
 * Which ONE shift the app acts on, and the small date rules behind it.
 *
 * Split out of `active-shift.tsx` so it can be tested: that file builds a React
 * context and pulls in react-native, whose Flow-typed source vitest cannot
 * parse, which left every rule in here unreachable from a test. Nothing in this
 * module knows about React — it is a function of the rows and the clock.
 */
import type { ShiftAssignmentRecord } from './api';

export type AttendancePhase = 'idle' | 'booked' | 'on_duty' | 'complete';

/** Attendance phase implied by a row's check-in / check-out stamps. */
export function derivePhase(
  a: ShiftAssignmentRecord,
): Exclude<AttendancePhase, 'idle'> {
  if (a.checkOutAt) return 'complete';
  if (a.checkInAt) return 'on_duty';
  return 'booked';
}

/** Local (device-time) calendar day as YYYY-MM-DD — the PR's own "today". */
export function localDateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * A check-out is still "fresh" while its calendar day is today or it happened
 * under 12 h ago — a 23:50 night-shift check-out must not fall off Today /
 * Check-In minutes later at midnight. Same rule as ShiftsScreen's Today cards.
 */
export function checkOutFresh(stamp: string): boolean {
  if (localDateKey(new Date(stamp)) === localDateKey(new Date())) return true;
  return Date.now() - new Date(stamp).getTime() < 12 * 60 * 60 * 1000;
}

/**
 * The single assignment the app acts on:
 *  1. a shift in progress (checked in, not out) — highest;
 *  2. a shift booked for TODAY still awaiting check-in — a new same-day
 *     assignment renews the Check-In page even right after a check-out, so
 *     the PR can start the next shift instead of staring at the old summary;
 *  3. a shift the PR checked out TODAY or under 12 h ago (night shifts cross
 *     midnight) — with no new shift, the just-finished summary stays pinned,
 *     then clears once the check-out stops being fresh;
 *  4. the soonest TODAY-or-future one still awaiting check-in (their next
 *     shift) — a PAST booking that was never checked in is a missed shift,
 *     not the next shift: it surfaces on Today → To-do instead of posing as
 *     a live "Booked" card here.
 * Nothing matching means Check-In is IDLE — there is deliberately no "latest
 * completed" fallback; see the note where this returns null.
 * Cancelled / no-show / locally-dismissed rows are skipped.
 */
export function pickActive(
  list: ShiftAssignmentRecord[],
  dismissed: Set<string>,
): ShiftAssignmentRecord | null {
  const open = list.filter(
    (a) =>
      !dismissed.has(a.id) &&
      a.status !== 'cancelled' &&
      a.status !== 'no_show' &&
      // Excused via approved MC/leave — never today's active shift.
      a.status !== 'leave_approved',
  );
  const today = localDateKey(new Date());

  // A shift dated in the future can't be "on duty" today — you check in when it
  // actually starts. Guarding on shiftDate stops tomorrow's booked shift (with a
  // stray check-in) from hijacking Check-In before its day arrives.
  //
  // Two open check-ins should be impossible — the backend now refuses the
  // second (`open_check_in_elsewhere`) — but rows written before that rule
  // exist, and `.find` returned whichever the API happened to list first. That
  // arbitrariness made the OTHER one unreachable, so a PR could not close the
  // very shift that was blocking every future check-in.
  //
  // OLDEST open stamp first: the forgotten one is what stands in the way, and
  // it is the one that has to be cleared. With the normal single open check-in
  // this sorts a one-element list and changes nothing.
  const onDuty = open
    .filter((a) => a.checkInAt && !a.checkOutAt && a.shiftDate <= today)
    .sort((a, b) => (a.checkInAt ?? '').localeCompare(b.checkInAt ?? ''));
  if (onDuty.length) return onDuty[0];

  // A fresh assignment for TONIGHT outranks this morning's check-out summary —
  // the agency re-booked the PR, so Check-In renews to the new shift. Strictly
  // today's date: tomorrow's booking must not evict the summary early.
  const bookedToday = open
    .filter(
      (a) => !a.checkInAt && a.status !== 'completed' && a.shiftDate === today,
    )
    .sort((a, b) => (a.slot ?? '').localeCompare(b.slot ?? ''));
  if (bookedToday.length) return bookedToday[0];

  // Keep the just-finished shift on screen while its check-out is fresh —
  // the rest of its day, or 12 h past a pre-midnight check-out.
  const completedToday = open
    .filter((a) => a.checkOutAt && checkOutFresh(a.checkOutAt))
    .sort((a, b) => (b.checkOutAt ?? '').localeCompare(a.checkOutAt ?? ''));
  if (completedToday.length) return completedToday[0];

  const booked = open
    .filter(
      (a) => !a.checkInAt && a.status !== 'completed' && a.shiftDate >= today,
    )
    .sort((a, b) => a.shiftDate.localeCompare(b.shiftDate));
  if (booked.length) return booked[0];
  /*
   * NO FALLBACK. Check-In goes idle.
   *
   * This used to end in "the latest completed one, so the page is never
   * blank" — an unbounded pick whose entire test was "has a check-out stamp".
   * On 6 Aug it handed Check-In a shift from 30 JULY: seven days old, already
   * complete, already paid RM 600 — presented as the current attendance state
   * while Today, one tab away, correctly said "No shift scheduled for today."
   * It even reached PAST the 3 and 4 Aug bookings that rule 4 skips as missed
   * shifts. A page that is never blank is not the same as a page that is never
   * wrong, and the PR reads this one to decide whether they are clocked in.
   *
   * Rule 3 is now the only way a finished shift reaches this screen, and its
   * freshness window is the same one ShiftsScreen applies
   * (ShiftsScreen.tsx:151-163) — which is exactly why Today was right and this
   * was not. Past that window CheckInScreen renders its idle state, which
   * already exists and already says the right thing.
   */
  return null;
}
