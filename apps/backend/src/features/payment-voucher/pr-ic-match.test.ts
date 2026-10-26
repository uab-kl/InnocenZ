import { describe, expect, it } from 'vitest';
import { maskIc, normalizeIc, prIcMatchesProfile } from './pr-ic-match';

describe('normalizeIc', () => {
  it('drops dashes and spaces so a MyKad typed either way compares equal', () => {
    expect(normalizeIc('950312-14-8821')).toBe('950312148821');
    expect(normalizeIc(' 950312 14 8821 ')).toBe('950312148821');
  });

  it('keeps a passport’s letters, upper-cased', () => {
    expect(normalizeIc('a12-34567')).toBe('A1234567');
  });

  it('returns null for missing or empty values', () => {
    expect(normalizeIc(null)).toBeNull();
    expect(normalizeIc(undefined)).toBeNull();
    expect(normalizeIc(' - ')).toBeNull();
  });
});

describe('prIcMatchesProfile', () => {
  it('is false for the PV-000009 pair — two different numbers', () => {
    expect(prIcMatchesProfile('950312-14-8821', '960312-14-8820')).toBe(false);
  });

  it('is true when only the formatting differs', () => {
    expect(prIcMatchesProfile('950312148821', '950312-14-8821')).toBe(true);
  });

  it('is null, not true, when either side is missing', () => {
    expect(prIcMatchesProfile(null, '960312-14-8820')).toBeNull();
    expect(prIcMatchesProfile('950312-14-8821', null)).toBeNull();
    expect(prIcMatchesProfile('', '')).toBeNull();
  });
});

describe('maskIc', () => {
  it('keeps only the last two characters of a MyKad — no date-of-birth digits', () => {
    expect(maskIc('950312-14-8821')).toBe('••••••••••21');
    expect(maskIc('960312-14-8820')).toBe('••••••••••20');
  });

  it('masks a dashed and an undashed IC identically', () => {
    expect(maskIc('950312148821')).toBe(maskIc('950312-14-8821'));
  });

  it('keeps only the last two of a passport, whatever its length', () => {
    expect(maskIc('A1234567')).toBe('••••••67');
    expect(maskIc('A12345')).toBe('••••45');
    expect(maskIc('k 1234 5678 90')).toBe('•••••••••90');
  });

  it('never shows more than the last two characters', () => {
    for (const ic of ['950312-14-8821', 'A1234567', 'AB12345', '12345']) {
      const masked = maskIc(ic);
      expect(masked.replace(/•/g, '')).toHaveLength(2);
      expect(masked.slice(0, -2)).toMatch(/^•+$/);
    }
  });

  it('masks a value too short to hide anything behind its tail entirely', () => {
    expect(maskIc('A12')).toBe('•••');
    expect(maskIc('1234')).toBe('••••');
  });

  it('says (none) for a missing value', () => {
    expect(maskIc(null)).toBe('(none)');
    expect(maskIc('  ')).toBe('(none)');
    expect(maskIc(' - ')).toBe('(none)');
  });
});
