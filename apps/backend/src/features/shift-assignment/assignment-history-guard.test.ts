import { describe, expect, test } from 'vitest';
import { assignmentHistoryReason, isAssignmentHistory } from './assignment-history-guard';

const TODAY = '2026-08-19';
const base = { checkInAt: null, checkOutAt: null, todayIso: TODAY };

describe('assignmentHistoryReason', () => {
  test('a shift still ahead is an ordinary booking', () => {
    expect(assignmentHistoryReason({ ...base, shiftDate: '2026-08-21' })).toBeNull();
  });

  // The case the whole rule exists to preserve: undoing a mis-assignment must
  // stay available all through the shift's own day.
  test("today's shift is still a booking, right up to midnight", () => {
    expect(assignmentHistoryReason({ ...base, shiftDate: TODAY })).toBeNull();
  });

  test('yesterday is a record, not a booking', () => {
    expect(assignmentHistoryReason({ ...base, shiftDate: '2026-08-18' })).toBe('past-shift');
  });

  // ── THE ARM NO LIVE PROBE COULD REACH ────────────────────────────────────
  // Both refusals were fired against the real database, and both returned 409
  // for a past date. The check-in arm could not be exercised: that DB has no
  // assignment dated today-or-later carrying a stamp, so there was nothing to
  // aim at. Absent evidence about the instrument, not about the rule — which
  // is exactly what a unit test is for.
  test('a check-in stamp seals TODAY’S shift, whose date is not yet past', () => {
    expect(
      assignmentHistoryReason({ ...base, shiftDate: TODAY, checkInAt: new Date() }),
    ).toBe('attendance-stamped');
  });

  test('a check-in stamp seals a FUTURE shift too — the stamp outranks the date', () => {
    expect(
      assignmentHistoryReason({ ...base, shiftDate: '2026-08-25', checkInAt: '2026-08-25T12:00:00Z' }),
    ).toBe('attendance-stamped');
  });

  test('a check-out alone also seals it — the old gate tested only this one', () => {
    expect(
      assignmentHistoryReason({ ...base, shiftDate: TODAY, checkOutAt: new Date() }),
    ).toBe('attendance-stamped');
  });

  // The date is reported first because it is the more useful sentence: "that
  // shift has already passed" tells the operator more than "someone clocked in".
  test('a past shift that was also worked reports the DATE', () => {
    expect(
      assignmentHistoryReason({
        ...base,
        shiftDate: '2026-08-18',
        checkInAt: new Date(),
        checkOutAt: new Date(),
      }),
    ).toBe('past-shift');
  });

  // ⚠️ The venue's day, never the server's. On a UTC host `new Date()` rolls
  // over eight hours early, and yesterday would reopen for a KL agency at 08:00.
  test('the comparison is against the VENUE day it is handed, not any clock', () => {
    expect(assignmentHistoryReason({ ...base, shiftDate: '2026-08-19', todayIso: '2026-08-20' })).toBe('past-shift');
    expect(assignmentHistoryReason({ ...base, shiftDate: '2026-08-19', todayIso: '2026-08-19' })).toBeNull();
  });

  test('a timestamptz shift date compares on its leading date only', () => {
    expect(
      assignmentHistoryReason({ ...base, shiftDate: '2026-08-18T16:00:00.000Z' }),
    ).toBe('past-shift');
  });

  // A row we cannot read must not become a silent refusal of something legal —
  // the callers already 404 when the shift is missing.
  test('an unknown shift date is not treated as past', () => {
    expect(assignmentHistoryReason({ ...base, shiftDate: null })).toBeNull();
    expect(assignmentHistoryReason({ ...base, shiftDate: undefined })).toBeNull();
  });

  test('isAssignmentHistory mirrors the reason', () => {
    expect(isAssignmentHistory({ ...base, shiftDate: '2026-08-18' })).toBe(true);
    expect(isAssignmentHistory({ ...base, shiftDate: '2026-08-21' })).toBe(false);
  });
});
