import { describe, expect, it } from 'vitest';
import { countryCodeOf, maskEmail, maskPhone } from './masks';

describe('maskPhone — country code + last four', () => {
  it('masks a stored Malaysian number exactly as the contract shows', () => {
    expect(maskPhone('+60123456789')).toBe('+60 ••••• 6789');
  });

  it('masks the local form the same way', () => {
    expect(maskPhone('0123456789')).toBe('+60 ••••• 6789');
  });

  it('keeps a Singapore code', () => {
    expect(maskPhone('+6581234567')).toBe('+65 ••••• 4567');
  });

  it('never reveals the hidden length', () => {
    expect(maskPhone('+601112345678')).toBe('+60 ••••• 5678');
  });

  it('answers bullets alone for something that is not a number', () => {
    expect(maskPhone('')).toBe('•••••');
    expect(maskPhone(null)).toBe('•••••');
  });
});

describe('countryCodeOf', () => {
  it.each([
    ['14155552671', '1'],
    ['79161234567', '7'],
    ['60123456789', '60'],
    ['85291234567', '852'],
    ['886912345678', '886'],
    ['971501234567', '971'],
  ])('%s → +%s', (digits, code) => {
    expect(countryCodeOf(digits)).toBe(code);
  });
});

describe('maskEmail — first character + domain', () => {
  it('masks exactly as the contract shows', () => {
    expect(maskEmail('owner@atlas-agency.my')).toBe('o••••@atlas-agency.my');
  });

  it('lowercases and trims first', () => {
    expect(maskEmail('  Owner@Atlas-Agency.MY ')).toBe('o••••@atlas-agency.my');
  });

  it('uses a fixed number of bullets, never the local part length', () => {
    expect(maskEmail('a@x.my')).toBe('a••••@x.my');
    expect(maskEmail('averyveryverylongname@x.my')).toBe('a••••@x.my');
  });

  it('answers bullets for something that is not an address', () => {
    expect(maskEmail('')).toBe('••••');
    expect(maskEmail('@x.my')).toBe('••••');
    expect(maskEmail('name@')).toBe('••••');
  });
});
