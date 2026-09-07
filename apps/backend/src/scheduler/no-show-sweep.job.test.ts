import { describe, expect, test } from 'vitest';
import { NO_SHOW_GRACE_HOURS, nextStartAfter, noShowCutoff } from './no-show-sweep.job';

/**
 * The rule the owner asked for, in his words (7 Sep 2026): "for a shift that is
 * a few hours past the time and if there is not check-in record then it will be
 * marked a no-show. In the case that they have back to back shifts then it
 * should make it no-show when the shift ends."
 *
 * Venues are Malaysian (UTC+8, no DST), so every expectation below is written
 * as the instant that KL wall-clock time actually is. Writing them as bare
 * local strings is the mistake `slot-window.ts` warns about, and would make
 * these tests pass on one host and fail on another.
 */
const kl = (iso: string) => new Date(`${iso}+08:00`);

describe('noShowCutoff', () => {
  test('an ordinary shift is judged a few hours after it ENDS', () => {
    // 10:00-11:00 on 3 Sep, nothing after it: 11:00 + 3h = 14:00 KL.
    expect(noShowCutoff('2026-09-03', '10:00 - 11:00', null)).toEqual(kl('2026-09-03T14:00:00'));
  });

  test('the grace runs from the end, so arriving late is not an absence', () => {
    // An overnight shift is not judged 3 hours after it STARTED — that moment
    // is still inside the shift, and a PR who came late has worked it.
    const cutoff = noShowCutoff('2026-09-03', '22:00 - 04:00', null);
    expect(cutoff).toEqual(kl('2026-09-04T07:00:00'));
    expect(cutoff!.getTime()).toBeGreaterThan(kl('2026-09-04T04:00:00').getTime());
  });

  test('BACK TO BACK: a next shift starting at this one’s end cuts it there', () => {
    // Vicky's real 3 Sep: 10:00-11:00 followed by 11:00-12:00. Once she is
    // working the next one no late check-in is possible, so 11:00 is the answer.
    expect(noShowCutoff('2026-09-03', '10:00 - 11:00', kl('2026-09-03T11:00:00'))).toEqual(
      kl('2026-09-03T11:00:00'),
    );
  });

  test('a next shift inside the grace window pulls the cutoff forward to it', () => {
    expect(noShowCutoff('2026-09-03', '10:00 - 11:00', kl('2026-09-03T12:30:00'))).toEqual(
      kl('2026-09-03T12:30:00'),
    );
  });

  test('a next shift beyond the grace window changes nothing', () => {
    expect(noShowCutoff('2026-09-03', '10:00 - 11:00', kl('2026-09-03T20:00:00'))).toEqual(
      kl('2026-09-03T14:00:00'),
    );
  });

  test('an overlapping roster never cuts before the shift’s own end', () => {
    // A next shift starting BEFORE this one ends is a rostering mistake, and it
    // must not shorten the chance to work a shift the PR may be standing at.
    expect(noShowCutoff('2026-09-03', '10:00 - 11:00', kl('2026-09-03T10:30:00'))).toEqual(
      kl('2026-09-03T11:00:00'),
    );
  });

  test('a slot with no clock in it is not judged at all', () => {
    // An unknown is not an absence — the row stays `assigned` for a human.
    expect(noShowCutoff('2026-09-03', 'Late night', null)).toBeNull();
    expect(noShowCutoff('2026-09-03', null, null)).toBeNull();
  });

  test('the grace is a named constant, not a magic number', () => {
    expect(noShowCutoff('2026-09-03', '10:00 - 11:00', null)).toEqual(
      noShowCutoff('2026-09-03', '10:00 - 11:00', null, NO_SHOW_GRACE_HOURS),
    );
  });
});

describe('nextStartAfter', () => {
  const end = kl('2026-09-03T11:00:00');

  test('takes the earliest shift starting at or after the end', () => {
    expect(
      nextStartAfter(
        [
          { shiftDate: '2026-09-03', slot: '16:00 - 20:00', status: 'assigned' },
          { shiftDate: '2026-09-03', slot: '11:00 - 12:00', status: 'completed' },
        ],
        end,
      ),
    ).toEqual(kl('2026-09-03T11:00:00'));
  });

  test('ignores shifts that never happened', () => {
    // A cancelled or excused next shift is no evidence the PR moved on, so it
    // must not shorten the grace on the shift before it.
    expect(
      nextStartAfter(
        [
          { shiftDate: '2026-09-03', slot: '11:00 - 12:00', status: 'cancelled' },
          { shiftDate: '2026-09-03', slot: '13:00 - 14:00', status: 'leave_approved' },
        ],
        end,
      ),
    ).toBeNull();
  });

  test('ignores everything that started before this shift ended', () => {
    expect(
      nextStartAfter([{ shiftDate: '2026-09-03', slot: '08:00 - 09:00', status: 'completed' }], end),
    ).toBeNull();
  });

  test('a peer with no clock in its slot cannot be the evidence', () => {
    expect(
      nextStartAfter([{ shiftDate: '2026-09-03', slot: 'Late night', status: 'assigned' }], end),
    ).toBeNull();
  });
});
