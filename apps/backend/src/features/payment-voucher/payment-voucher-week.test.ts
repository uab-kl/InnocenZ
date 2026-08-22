import { describe, expect, it } from 'vitest';
import {
  PAYMENT_TERM_DAYS,
  klToday,
  paymentDueDate,
  previousWeekBounds,
  weekBounds,
} from './payment-voucher-week.js';
import { checkLineAgainstWeek } from './payment-voucher-audit.js';

describe('paymentDueDate', () => {
  it('falls due PAYMENT_TERM_DAYS after the week closes', () => {
    expect(PAYMENT_TERM_DAYS).toBe(7);
    // The week PV-000006 was generated for.
    expect(paymentDueDate('2026-08-08')).toBe('2026-08-15');
    expect(paymentDueDate('2026-08-01')).toBe('2026-08-08');
  });

  it('crosses month and year boundaries', () => {
    expect(paymentDueDate('2026-12-26')).toBe('2027-01-02');
    // Non-leap February: 22nd + 7 lands on 1 March, not 29 February.
    expect(paymentDueDate('2026-02-22')).toBe('2026-03-01');
  });

  it('refuses a malformed week end rather than inventing a date', () => {
    // Date.UTC silently rolls 2026-02-30 into March; the round-trip guard
    // catches it, so a voucher cannot be stamped with a date nobody chose.
    expect(paymentDueDate('2026-02-30')).toBeNull();
    expect(paymentDueDate('not-a-date')).toBeNull();
    expect(paymentDueDate('')).toBeNull();
  });

  it('honours an explicit term', () => {
    expect(paymentDueDate('2026-08-08', 0)).toBe('2026-08-08');
    expect(paymentDueDate('2026-08-08', 14)).toBe('2026-08-22');
  });

  it('does not shift the date by the KL offset', () => {
    // The input is already a KL-local calendar date. Applying the +8h offset a
    // second time would land the due date a day early for half of every day,
    // so the result must depend only on the input string.
    expect(paymentDueDate('2026-08-08')).toBe('2026-08-15');
    expect(paymentDueDate('2026-01-01')).toBe('2026-01-08');
  });
});

/**
 * THE EIGHT HOURS EVERY SUNDAY WHEN A PR COULD NOT LOG MONEY.
 *
 * `weekBounds` used to read UTC calendar fields. Kuala Lumpur is UTC+8, so from
 * 00:00 to 07:59 local the UTC date is still yesterday — and on Sunday,
 * yesterday sits in the week that just closed. The self-log guard compares the
 * PHONE's local date against that window, so every attempt to log takings in
 * the closing hours of Saturday night came back HTTP 400.
 *
 * These tests pin the instant explicitly. A test that just calls `new Date()`
 * on a UTC+8 laptop cannot catch this — the same warning `cancel-fee.test.ts`
 * carries, and the reason the bug survived a green suite.
 */
describe('weekBounds — Kuala Lumpur anchoring', () => {
  // A PR's phone dates a line from its LOCAL clock. This is that date.
  const phoneDate = (utc: string) =>
    new Date(new Date(utc).getTime() + 8 * 3600_000).toISOString().slice(0, 10);

  it('puts Sunday 01:23 KL in the week that STARTS that Sunday', () => {
    // 17:23 Sat UTC === 01:23 Sun 23 Aug KL — the instant on the owner's screen.
    const at = new Date('2026-08-22T17:23:00Z');
    expect(weekBounds(at)).toEqual({
      weekStart: '2026-08-23',
      weekEnd: '2026-08-29',
    });
    // The UTC reading, which is what the bug returned.
    expect(weekBounds(at).weekStart).not.toBe('2026-08-16');
  });

  it('still closes the week at Saturday 23:59 KL', () => {
    // The boundary must not have moved the other way: a shift ending late on
    // Saturday belongs to the week that is closing, not the one opening.
    expect(weekBounds(new Date('2026-08-22T15:59:00Z'))).toEqual({
      weekStart: '2026-08-16',
      weekEnd: '2026-08-22',
    });
  });

  it('accepts a phone-dated line at every hour of a fortnight', () => {
    // The regression in one assertion: the guard the controller runs, against
    // the window the controller computes, for both the client's date and the
    // server's own default. Any drift between the two anchors shows up here.
    const rejected: string[] = [];
    const base = Date.UTC(2026, 7, 16, 0, 0, 0);
    for (let h = 0; h < 24 * 14; h++) {
      const now = new Date(base + h * 3600_000);
      const week = weekBounds(now);
      for (const date of [phoneDate(now.toISOString()), klToday(now)]) {
        if (checkLineAgainstWeek(date, week)) rejected.push(`${now.toISOString()} -> ${date}`);
      }
    }
    expect(rejected).toEqual([]);
  });

  it('agrees with previousCompleteWeek across the Sunday rollover', () => {
    // previousWeekBounds is what the PR's "last week" read uses. At 01:23 Sunday
    // it must name the week that just ended, not the one before it.
    expect(previousWeekBounds(new Date('2026-08-22T17:23:00Z'))).toEqual({
      weekStart: '2026-08-16',
      weekEnd: '2026-08-22',
    });
  });

  it('is stable across a month boundary', () => {
    // 00:30 Sun 1 Nov 2026 KL === 16:30 Sat 31 Oct UTC.
    expect(weekBounds(new Date('2026-10-31T16:30:00Z'))).toEqual({
      weekStart: '2026-11-01',
      weekEnd: '2026-11-07',
    });
  });
});
