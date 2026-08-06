import { describe, expect, it } from 'vitest';
import { earnedWage, describeWorkedTime } from './wage.js';
import { shiftWindowInstants } from '@/util/slot-window';
import {
  maxOvertimeCents,
  overtimeAmountCents,
  STANDARD_SHIFT_HOURS,
} from '@/features/payment-voucher/payment-voucher-audit';

/** Shorthand so the stamps read as clock times, not as ISO noise. UTC throughout. */
const at = (hhmmss: string) => new Date(`2026-08-03T${hhmmss}Z`);
/** A 09:00–15:00 window — six hours, the same length as STANDARD_SHIFT_HOURS. */
const sixHourShift = { start: at('09:00:00'), end: at('15:00:00') };

describe('earnedWage', () => {
  it('pays the full day rate for the whole window', () => {
    const wage = earnedWage({
      dayRate: '700.00',
      scheduled: sixHourShift,
      checkInAt: at('09:00:00'),
      checkOutAt: at('15:00:00'),
    });
    expect(wage).toEqual({
      amount: '700.00',
      dayRate: '700.00',
      workedMinutes: 360,
      scheduledMinutes: 360,
      rule: 'full_day',
    });
  });

  it('pays by the minute when the PR leaves early — THE REGRESSION', () => {
    // Three hours early on a six-hour shift. This is the case that was paid in
    // full, on the ordinary check-out path, with no release-early feature in it.
    const wage = earnedWage({
      dayRate: '700.00',
      scheduled: sixHourShift,
      checkInAt: at('09:00:00'),
      checkOutAt: at('12:00:00'),
    });
    expect(wage.amount).toBe('350.00');
    expect(wage.rule).toBe('pro_rata');
    expect(wage.workedMinutes).toBe(180);
  });

  it('does not round the minutes', () => {
    // 4h12m of 6h at RM700 = RM490.00 exactly; 4h13m = RM491.94.
    expect(
      earnedWage({
        dayRate: '700.00',
        scheduled: sixHourShift,
        checkInAt: at('09:00:00'),
        checkOutAt: at('13:12:00'),
      }).amount,
    ).toBe('490.00');
    expect(
      earnedWage({
        dayRate: '700.00',
        scheduled: sixHourShift,
        checkInAt: at('09:00:00'),
        checkOutAt: at('13:13:00'),
      }).amount,
    ).toBe('491.94');
  });

  it('forgives a shortfall inside the five-minute grace', () => {
    const wage = earnedWage({
      dayRate: '700.00',
      scheduled: sixHourShift,
      checkInAt: at('09:00:00'),
      checkOutAt: at('14:55:00'),
    });
    expect(wage.amount).toBe('700.00');
    expect(wage.rule).toBe('grace');
  });

  it('pro-rates the minute past the grace', () => {
    // Six minutes short is six minutes short — the grace has an edge and this is
    // it. RM700 × 354/360 = RM688.33.
    const wage = earnedWage({
      dayRate: '700.00',
      scheduled: sixHourShift,
      checkInAt: at('09:00:00'),
      checkOutAt: at('14:54:00'),
    });
    expect(wage.amount).toBe('688.33');
    expect(wage.rule).toBe('pro_rata');
  });

  it('measures the grace on the TOTAL shortfall, not on each end', () => {
    // Three minutes late AND three minutes early is six short, not two
    // forgivable slips of three.
    const wage = earnedWage({
      dayRate: '700.00',
      scheduled: sixHourShift,
      checkInAt: at('09:03:00'),
      checkOutAt: at('14:57:00'),
    });
    expect(wage.rule).toBe('pro_rata');
    expect(wage.workedMinutes).toBe(354);
  });

  it('charges a late arrival the same way as an early departure', () => {
    const late = earnedWage({
      dayRate: '700.00',
      scheduled: sixHourShift,
      checkInAt: at('12:00:00'),
      checkOutAt: at('15:00:00'),
    });
    const early = earnedWage({
      dayRate: '700.00',
      scheduled: sixHourShift,
      checkInAt: at('09:00:00'),
      checkOutAt: at('12:00:00'),
    });
    expect(late.amount).toBe(early.amount);
    expect(late.amount).toBe('350.00');
  });

  it('never pays more than a day for arriving early or staying late', () => {
    // Time outside the window is not wages. Past the end it is overtime, which
    // is the agency's separate decision; before the start it is nothing.
    const wage = earnedWage({
      dayRate: '700.00',
      scheduled: sixHourShift,
      checkInAt: at('07:00:00'),
      checkOutAt: at('17:00:00'),
    });
    expect(wage.amount).toBe('700.00');
    expect(wage.rule).toBe('full_day');
  });

  it('seals nothing for a PR with no day rate', () => {
    // Commission-only. A 0.00 here would read as "we paid you nothing for this
    // shift" rather than "wages do not apply", and would overwrite the column.
    const wage = earnedWage({
      dayRate: null,
      scheduled: sixHourShift,
      checkInAt: at('09:00:00'),
      checkOutAt: at('12:00:00'),
    });
    expect(wage.amount).toBeNull();
  });

  it('pays in full when the slot carries no window', () => {
    // "Late night" has nothing to divide by. Underpaying on a parse failure is
    // the one direction this must never fail in.
    const wage = earnedWage({
      dayRate: '700.00',
      scheduled: null,
      checkInAt: at('09:00:00'),
      checkOutAt: at('10:00:00'),
    });
    expect(wage.amount).toBe('700.00');
    expect(wage.rule).toBe('no_schedule');
  });

  it('pays nothing when the stamps fall entirely outside the window', () => {
    // The live shape of assignment 6574b2ee: checked in 4h38m after the slot
    // closed, out twelve seconds later. It was paid a full day.
    const wage = earnedWage({
      dayRate: '700.00',
      scheduled: { start: at('06:00:00'), end: at('12:00:00') },
      checkInAt: at('16:38:00'),
      checkOutAt: at('16:38:12'),
    });
    expect(wage.amount).toBe('0.00');
    expect(wage.rule).toBe('never_present');
  });

  it('holds the invariant across every departure time', () => {
    // Pay rises with minutes worked and never exceeds the day rate — the two
    // properties every case above is an instance of.
    let previous = -1;
    for (let minute = 0; minute <= 360; minute += 7) {
      const wage = earnedWage({
        dayRate: '700.00',
        scheduled: sixHourShift,
        checkInAt: at('09:00:00'),
        checkOutAt: new Date(at('09:00:00').getTime() + minute * 60_000),
      });
      const cents = Math.round(Number(wage.amount) * 100);
      expect(cents).toBeLessThanOrEqual(70_000);
      expect(cents).toBeGreaterThanOrEqual(previous);
      previous = cents;
    }
  });
});

describe('shiftWindowInstants — the venue timezone', () => {
  it('reads the slot in Kuala Lumpur time, not the server timezone', () => {
    // 20:00-02:00 on 6 Aug KL is 12:00Z to 18:00Z on the 6th. Built with
    // `new Date(y, m, d, ...)` on a UTC host it lands eight hours late and every
    // stamp a PR made falls outside their own window — which would pay a
    // fully-worked shift RM0.00.
    const window = shiftWindowInstants('2026-08-06', '20:00 - 02:00');
    expect(window?.start.toISOString()).toBe('2026-08-06T12:00:00.000Z');
    expect(window?.end.toISOString()).toBe('2026-08-06T18:00:00.000Z');
  });

  it('a full overnight shift in venue time earns the full day', () => {
    const window = shiftWindowInstants('2026-08-06', '20:00 - 02:00');
    const wage = earnedWage({
      dayRate: '700.00',
      scheduled: window,
      checkInAt: new Date('2026-08-06T12:00:00Z'), // 20:00 KL
      checkOutAt: new Date('2026-08-06T18:00:00Z'), // 02:00 KL, next day
    });
    expect(wage.amount).toBe('700.00');
    expect(wage.rule).toBe('full_day');
  });

  it('still parses the meridiem slots the controller used to handle alone', () => {
    expect(shiftWindowInstants('2026-08-06', '8pm - 2am')?.start.toISOString()).toBe(
      '2026-08-06T12:00:00.000Z',
    );
    expect(shiftWindowInstants('2026-08-06', '8.30pm-2am')?.start.toISOString()).toBe(
      '2026-08-06T12:30:00.000Z',
    );
  });

  it('a decorated slot still resolves through the original regex', () => {
    expect(shiftWindowInstants('2026-08-06', 'Friday 22:00 - 04:00')?.start.toISOString()).toBe(
      '2026-08-06T14:00:00.000Z',
    );
  });

  it('carries no window for a label-only slot', () => {
    expect(shiftWindowInstants('2026-08-06', 'Late night')).toBeNull();
    expect(shiftWindowInstants('2026-08-06', null)).toBeNull();
  });
});

describe('overtimeAmountCents — the divisor is the shift window', () => {
  // At RM700 the ordinary hour is 700/window. Overtime must be 1.5x THAT, on
  // every window — not 1.5x a notional six-hour day.
  // Deliberately UNROUNDED — the function rounds once, at the end. Rounding here
  // too makes the six-hour case disagree by a cent for no reason but the test.
  const ordinaryHourCents = (windowHours: number) => (700 / windowHours) * 100;

  it('is 1.5x this shift\'s own ordinary hour, whatever the window', () => {
    for (const windowHours of [1, 2, 4, 6, 8]) {
      const oneOvertimeHour = overtimeAmountCents('700.00', 60, windowHours * 60);
      expect(oneOvertimeHour).toBe(Math.round(ordinaryHourCents(windowHours) * 1.5));
    }
  });

  it('never prices an overtime hour below an ordinary one — THE REGRESSION', () => {
    // A 2-hour booking: the ordinary hour is RM350, but the old flat divisor
    // priced overtime at 700/6 x 1.5 = RM175 — half an ordinary hour. At 4 hours
    // the premium silently vanished to 1.0x. Only at exactly 6 did 1.5x hold.
    for (const windowHours of [1, 2, 4, 6, 8]) {
      const oneOvertimeHour = overtimeAmountCents('700.00', 60, windowHours * 60);
      expect(oneOvertimeHour).toBeGreaterThanOrEqual(ordinaryHourCents(windowHours));
    }
    expect(overtimeAmountCents('700.00', 60, 2 * 60)).toBe(52_500); // RM525, not RM175
  });

  it('falls back to a standard shift when the window is unknown', () => {
    // Rows sealed before 0097 carry no window; they must keep pricing exactly as
    // they always did, or approving their overtime restates history.
    const legacy = overtimeAmountCents('700.00', 60);
    expect(legacy).toBe(overtimeAmountCents('700.00', 60, STANDARD_SHIFT_HOURS * 60));
    expect(legacy).toBe(17_500); // 700 / 6 * 1.5
    expect(overtimeAmountCents('700.00', 60, null)).toBe(legacy);
    expect(overtimeAmountCents('700.00', 60, 0)).toBe(legacy);
  });

  it('still pays nothing when there is no daily wage', () => {
    expect(overtimeAmountCents(null, 60, 240)).toBe(0);
    expect(overtimeAmountCents('0.00', 60, 240)).toBe(0);
    expect(overtimeAmountCents('700.00', 0, 240)).toBe(0);
  });
});

describe('maxOvertimeCents — a decision is never restated', () => {
  const approved = {
    id: 'a1',
    shiftDate: '2026-08-06',
    status: 'completed',
    payAmount: '385.00',
    dayRateAmount: '700.00',
    scheduledMinutes: 240,
    checkInAt: null,
    checkOutAt: null,
    overtimeMinutes: 60,
    overtimeStatus: 'approved',
  };

  it('budgets the FROZEN approved amount, not today\'s arithmetic', () => {
    // The figure an agency approved under the old divisor must still reconcile.
    expect(maxOvertimeCents({ ...approved, overtimeAmount: '175.00' })).toBe(17_500);
  });

  it('derives only when the decision stored no amount', () => {
    // 700 / 4h * 1.5 = RM262.50 for one hour.
    expect(maxOvertimeCents({ ...approved, overtimeAmount: null })).toBe(26_250);
  });

  it('budgets nothing for a claim that was not approved', () => {
    expect(maxOvertimeCents({ ...approved, overtimeStatus: 'pending', overtimeAmount: '175.00' })).toBe(0);
    expect(maxOvertimeCents({ ...approved, overtimeStatus: 'rejected', overtimeAmount: '0.00' })).toBe(0);
  });
});

describe('describeWorkedTime', () => {
  it('reads as clock time on a voucher line', () => {
    expect(describeWorkedTime(252, 360)).toBe('4h12m of 6h00m');
  });
});
