// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test as globals.
import { formatAmount, formatRM } from './demo-shifts';

/*
 * NEGATIVE MONEY, ONE SIGN, BEFORE THE CURRENCY (30 Sep 2026). A PR whose week's
 * deductions outran its earnings saw "RM -4.50" as their take-home: the signed
 * number was formatted whole, so the sign landed inside the amount. It reads
 * "−RM 4.50" now — U+2212, the glyph the Payment grid already prints.
 */

describe('formatRM', () => {
  test('a negative reads −RM 4.50, never RM -4.50', () => {
    expect(formatRM(-4.5)).toBe('−RM 4.50');
    expect(formatRM(-4.5)).not.toContain('-');
  });

  test('zero and positives are unchanged', () => {
    expect(formatRM(0)).toBe('RM 0.00');
    expect(formatRM(4.5)).toBe('RM 4.50');
    expect(formatRM(20)).toBe('RM 20.00');
  });

  test('thousands are grouped on either side of zero', () => {
    expect(formatRM(1234.5)).toBe('RM 1,234.50');
    expect(formatRM(-1234.5)).toBe('−RM 1,234.50');
    expect(formatRM(-1234567.891)).toBe('−RM 1,234,567.89');
  });

  test('nothing that prints as 0.00 carries a sign', () => {
    expect(formatRM(-0)).toBe('RM 0.00');
    expect(formatRM(-0.004)).toBe('RM 0.00');
    expect(formatRM(-0.01)).toBe('−RM 0.01');
  });

  test('a deduction is shown by passing it negative — one sign, not two', () => {
    const fee = 20;
    expect(formatRM(-fee)).toBe('−RM 20.00');
  });
});

/*
 * The bare figure the Payment grid's cells and the evidence sheet's item table
 * print — their column already says RM. A fee used to read "−20.00" in the cell
 * and "-20.00" (a hyphen) in the proof sheet behind it.
 */
describe('formatAmount', () => {
  test('a negative reads −20.00, with the grid’s minus, never a hyphen', () => {
    expect(formatAmount(-20)).toBe('−20.00');
    expect(formatAmount(-20)).not.toContain('-');
  });

  test('zero and positives print plain', () => {
    expect(formatAmount(0)).toBe('0.00');
    expect(formatAmount(3.6)).toBe('3.60');
  });

  test('nothing that prints as 0.00 carries a sign', () => {
    expect(formatAmount(-0)).toBe('0.00');
    expect(formatAmount(-0.004)).toBe('0.00');
  });
});
