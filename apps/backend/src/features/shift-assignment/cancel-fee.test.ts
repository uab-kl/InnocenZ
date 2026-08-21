import { describe, expect, it } from 'vitest';
import type { AgencyPenaltyRule } from '@/features/agency/agency-penalty-rule.model.js';
import { computeCancelFee, shiftStartMs } from './cancel-fee.js';

/**
 * The cancellation fee is SEALED onto the assignment and never recomputed, and
 * the PR app quotes the same arithmetic before they press the button. Two things
 * therefore have to be true, and both were false:
 *
 *   1. the notice window must be measured in the VENUE's clock, not the server
 *      process's — on a UTC container `new Date(y, m, d, hh, mm)` read a 22:00
 *      Kuala Lumpur shift eight hours late, inflating notice hours and dropping
 *      every cancellation a band;
 *   2. a slot the parser cannot read must yield NO fee, not the maximum one —
 *      the old private regex fell back to a 1970 midnight, which is maximally in
 *      the past and so priced "Late night" at the late band.
 *
 * Every assertion here is written against ABSOLUTE instants (`…Z`), so the suite
 * proves the same thing whatever timezone it runs in. That is deliberate: a test
 * that passes only on a UTC+8 laptop cannot catch this bug, which is part of how
 * it survived.
 */

/** Bands: 48h+ free, 12–48h costs 50%, under 12h costs 100%. */
const RULE = {
  enabled: true,
  freeCancelHours: 48,
  shortNoticeHours: 12,
  shortNoticePct: 50,
  lateCancelPct: 100,
} as unknown as AgencyPenaltyRule;

describe('shiftStartMs — the venue timezone', () => {
  it('reads the slot in Kuala Lumpur time, not the server timezone', () => {
    // 22:00 KL on 6 Aug is 14:00Z. Built with the local-time constructor on a
    // UTC host it would be 22:00Z — eight hours late.
    expect(shiftStartMs('2026-08-06', '22:00 - 04:00')).toBe(
      Date.parse('2026-08-06T14:00:00.000Z'),
    );
  });

  it('resolves a meridiem slot the old private regex read as midnight', () => {
    expect(shiftStartMs('2026-08-06', '8pm - 2am')).toBe(
      Date.parse('2026-08-06T12:00:00.000Z'),
    );
  });

  it('returns null — not a 1970 midnight — for a label-only slot', () => {
    expect(shiftStartMs('2026-08-06', 'Late night')).toBeNull();
    expect(shiftStartMs('2026-08-06', null)).toBeNull();
    expect(shiftStartMs('not-a-date', '22:00 - 04:00')).toBeNull();
  });
});

describe('computeCancelFee — the band is measured in venue time', () => {
  const shift = { shiftDate: '2026-08-06', slot: '22:00 - 04:00' } as const;
  // The shift starts 2026-08-06T14:00:00Z.

  it('charges the LATE band for a cancellation two hours before the shift', () => {
    // 12:00Z is 20:00 KL — two hours' notice.
    const fee = computeCancelFee({
      rule: RULE,
      dailyWageRm: '300.00',
      ...shift,
      now: new Date('2026-08-06T12:00:00Z'),
    });
    expect(fee.noticeHours).toBe('2.00');
    expect(fee.pct).toBe(100);
    expect(fee.feeRm).toBe('300.00');
  });

  /**
   * THE REGRESSION THIS FILE EXISTS FOR.
   *
   * A cancellation at 06:00 KL on the day of a 22:00 shift is 16 hours' notice —
   * the SHORT-NOTICE band. Read in UTC the shift looked like it started at
   * 22:00Z, so the same moment appeared to carry 24 hours' notice and fell into
   * the FREE band: the agency collected nothing, and the PR was quoted nothing,
   * for a same-day drop.
   */
  it('does not slip a same-day cancellation into the free band', () => {
    // 22:00Z on the 5th is 06:00 KL on the 6th — 16 hours before a 22:00 start.
    const fee = computeCancelFee({
      rule: RULE,
      dailyWageRm: '300.00',
      ...shift,
      now: new Date('2026-08-05T22:00:00Z'),
    });
    expect(fee.noticeHours).toBe('16.00');
    expect(fee.pct).toBe(50);
    expect(fee.feeRm).toBe('150.00');
  });

  it('is free well outside the free-cancel boundary', () => {
    const fee = computeCancelFee({
      rule: RULE,
      dailyWageRm: '300.00',
      ...shift,
      now: new Date('2026-08-03T14:00:00Z'), // 72 hours' notice
    });
    expect(fee.pct).toBe(0);
    expect(fee.feeRm).toBe('0.00');
  });

  it('charges nothing when the slot carries no readable window', () => {
    // Was the LATE band: an unparseable slot fell back to a 1970 midnight, which
    // is maximally in the past, so this returned 100% of the daily wage.
    const fee = computeCancelFee({
      rule: RULE,
      dailyWageRm: '300.00',
      shiftDate: '2026-08-06',
      slot: 'Late night',
      now: new Date('2026-08-06T12:00:00Z'),
    });
    expect(fee.pct).toBe(0);
    expect(fee.feeRm).toBe('0.00');
  });

  it('charges nothing when the agency has no rule, or switched it off', () => {
    const base = {
      dailyWageRm: '300.00',
      ...shift,
      now: new Date('2026-08-06T12:00:00Z'),
    };
    expect(computeCancelFee({ rule: null, ...base }).feeRm).toBe('0.00');
    expect(
      computeCancelFee({ rule: { ...RULE, enabled: false }, ...base }).feeRm,
    ).toBe('0.00');
  });
});
