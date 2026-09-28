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

  /*
   * The admin screen stored '+admin-' + 12 hex characters as a phone. Stripping
   * the letters used to leave digits that read as a real Malaysian mobile, and
   * every code for that admin went to it by WhatsApp and SMS.
   */
  describe('a value holding a letter is never a delivery target', () => {
    it.each([
      ['the admin placeholder, all-digit hex', '+admin-012345678901'],
      ['the admin placeholder, mixed hex', '+admin-0a12b3456c78'],
      ['letters between digits', '012-345a6789'],
      ['a trailing note', '0123456789 ext'],
      ['a letter from another script', '０１２３４５６７８９号'],
      ['an accented letter', '0123456789é'],
    ])('%s', (_label, input) => {
      expect(toWhatsAppDigits(input)).toBeNull();
    });

    it('still strips the punctuation people really type', () => {
      expect(toWhatsAppDigits('+60 (12) 345-6789')).toBe('60123456789');
      expect(toWhatsAppDigits('012.345.6789')).toBe('60123456789');
    });

    it('the same digits WITHOUT the letters still normalise — it is the letter that refuses', () => {
      expect(toWhatsAppDigits('+012345678901')).toBe('6012345678901');
    });
  });
});

describe('storedPhone', () => {
  it('writes + and the digits, the form user.phone_num holds', () => {
    expect(storedPhone('60123456789')).toBe('+60123456789');
  });
});
