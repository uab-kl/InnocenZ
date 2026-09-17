import { describe, expect, it } from 'vitest';
import { storedPhone, toWhatsAppDigits } from './phone';

describe('toWhatsAppDigits', () => {
  it.each([
    ['+60123456789', '60123456789'],
    ['60123456789', '60123456789'],
    ['0123456789', '60123456789'],
    ['+60 12-345 6789', '60123456789'],
    ['0060123456789', '60123456789'],
    ['00601112345678', '601112345678'],
    ['+6581234567', '6581234567'],
  ])('%s → %s', (input, expected) => {
    expect(toWhatsAppDigits(input)).toBe(expected);
  });

  it.each([
    ['too short', '1234567'],
    ['a local number that is too short even after 0 → 60', '012345'],
    ['longer than E.164 allows', '1234567890123456'],
    ['empty', ''],
    ['letters only', 'not a phone'],
  ])('refuses %s', (_label, input) => {
    expect(toWhatsAppDigits(input)).toBeNull();
  });

  it('refuses null and undefined', () => {
    expect(toWhatsAppDigits(null)).toBeNull();
    expect(toWhatsAppDigits(undefined)).toBeNull();
  });

  it('does not turn "00" + "0…" into a Malaysian number', () => {
    // "00" is the international prefix; what follows is taken as-is.
    expect(toWhatsAppDigits('000123456789')).toBe('0123456789');
  });
});

describe('storedPhone', () => {
  it('writes + and the digits, the form user.phone_num holds', () => {
    expect(storedPhone('60123456789')).toBe('+60123456789');
  });
});
