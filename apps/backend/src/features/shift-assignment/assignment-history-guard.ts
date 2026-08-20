/**
 * Is this assignment still a BOOKING, or has it become a RECORD?
 *
 * Pulled out of the controllers so the rule can be tested at all. It was
 * enforced in two places — `DELETE /shift-assignment/:id` and
 * `POST /outlet-swap` — and firing either one against a live database is the
 * only way to exercise it there: a bug in the date arm does not return 409, it
 * deletes a real assignment row and takes the attendance stamps and the sealed
 * wage with it. **A guard you cannot test without risking the thing it
 * protects is not testable in place.** As a pure function it is free to test,
 * and the check-in arm — which no live probe could reach, because no assignment
 * dated today-or-later currently carries a stamp — is covered below.
 *
 * `todayIso` is injected rather than read here. Both callers pass
 * `shiftDayKey(new Date())`, which resolves the VENUE's day: on a UTC host the
 * server's own date rolls over eight hours early and would reopen yesterday for
 * a Kuala Lumpur agency at 08:00.
 */
export type AssignmentHistoryInput = {
  /** The shift's date. Anything with a leading `YYYY-MM-DD`; the rest is ignored. */
  shiftDate: string | null | undefined;
  checkInAt: Date | string | null | undefined;
  checkOutAt: Date | string | null | undefined;
  /** Today in the VENUE's timezone — `shiftDayKey(new Date())`. */
  todayIso: string;
};

export type AssignmentHistoryReason = 'past-shift' | 'attendance-stamped' | null;

/**
 * Why this assignment may no longer be unassigned or swapped — or `null` when
 * it still may be.
 *
 * Two reasons, deliberately distinct rather than one boolean: they protect
 * different things and the caller says different words for each. A past DATE
 * means the day is over and there is no booking left to undo. A STAMP on any
 * date means someone clocked in, so the honest correction is `cancelled` /
 * `no_show`, which keeps the row and its history instead of deleting the
 * evidence.
 *
 * An UNKNOWN shift date is not treated as past. A missing row must not become a
 * silent refusal of something legitimate — the callers already 404 when the
 * shift cannot be read.
 */
export function assignmentHistoryReason(
  input: AssignmentHistoryInput,
): AssignmentHistoryReason {
  const shiftIso = input.shiftDate ? String(input.shiftDate).slice(0, 10) : null;
  if (shiftIso && shiftIso < input.todayIso) return 'past-shift';
  if (input.checkInAt || input.checkOutAt) return 'attendance-stamped';
  return null;
}

/** Convenience for the callers that only need the yes/no. */
export function isAssignmentHistory(input: AssignmentHistoryInput): boolean {
  return assignmentHistoryReason(input) !== null;
}
