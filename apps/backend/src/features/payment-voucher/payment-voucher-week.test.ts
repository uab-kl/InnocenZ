import { describe, expect, it } from 'vitest';
import { PAYMENT_TERM_DAYS, paymentDueDate } from './payment-voucher-week.js';

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
