import { describe, expect, it } from 'vitest';
import { overtimeFromStamps } from './overtime.js';

/** Shorthand so the stamps in these cases read as clock times, not as ISO noise. */
const at = (hhmmss: string) => new Date(`2026-08-03T${hhmmss}Z`);

describe('overtimeFromStamps', () => {
  it('claims the overrun when the PR worked the whole shift', () => {
    // 09:00 in, six-hour slot ending 15:00, out at 17:00 — two hours past.
    const claim = overtimeFromStamps(at('09:00:00'), at('15:00:00'), at('17:00:00'));
    expect(claim).toEqual({ minutes: 120, reason: 'recorded', elapsedHours: 8 });
  });

  it('never claims more overtime than the PR was clocked in for', () => {
    // THE LIVE REGRESSION (assignment 6574b2ee): checked in 4h38m AFTER the slot
    // had already ended and checked out 12 seconds later. Measuring from the
    // scheduled end billed all 279 of those minutes — ~RM813 for twelve seconds.
    const claim = overtimeFromStamps(at('16:38:00'), at('12:00:00'), at('16:38:12'));
    expect(claim.minutes).toBeNull();
    expect(claim.reason).toBe('within_schedule');
  });

  it('counts only the clocked minutes when the PR starts after the slot closed', () => {
    // Two hours genuinely worked, all of it past a slot that ended at noon. The
    // claim is the two hours actually worked, not the six since the slot closed.
    const claim = overtimeFromStamps(at('16:00:00'), at('12:00:00'), at('18:00:00'));
    expect(claim.minutes).toBe(120);
    expect(claim.reason).toBe('recorded');
  });

  it('holds the invariant across the whole late-check-in range', () => {
    // Whatever the schedule says, minutes claimed can never exceed minutes present.
    for (let startHour = 8; startHour <= 20; startHour++) {
      const checkIn = at(`${String(startHour).padStart(2, '0')}:00:00`);
      const claim = overtimeFromStamps(checkIn, at('12:00:00'), at('21:00:00'));
      const clockedMinutes = (at('21:00:00').getTime() - checkIn.getTime()) / 60_000;
      expect(claim.minutes ?? 0).toBeLessThanOrEqual(clockedMinutes);
    }
  });

  it('raises no claim when the shift closed inside its window', () => {
    const claim = overtimeFromStamps(at('09:00:00'), at('15:00:00'), at('14:30:00'));
    expect(claim.minutes).toBeNull();
    expect(claim.reason).toBe('within_schedule');
  });

  it('raises no claim when there is no parseable slot to have run past', () => {
    const claim = overtimeFromStamps(at('09:00:00'), null, at('17:00:00'));
    expect(claim).toEqual({ minutes: null, reason: 'no_schedule', elapsedHours: null });
  });

  it('refuses an implausible stamp rather than capping it', () => {
    // A check-out two days later is not two days of overtime; the stamp has
    // stopped being evidence, so the honest record is nothing at all.
    const claim = overtimeFromStamps(at('09:00:00'), at('15:00:00'), new Date('2026-08-05T09:00:00Z'));
    expect(claim.minutes).toBeNull();
    expect(claim.reason).toBe('implausible_stamp');
  });
});
