import { describe, expect, it } from 'vitest';
import { phoneLoginCandidates } from '@/features/user/user.repository';
import {
  agencyMayCorrectStub,
  isActivatedAccount,
  sameSignInEmail,
  sameSignInPhone,
  signInContactChanges,
  signInPhoneDigits,
  signInPhoneLookupForms,
  storedSignInPhone,
} from './sign-in-contact';

describe('signInPhoneDigits (the contract normaliser)', () => {
  it.each([
    ['+60 12-345 6789', '60123456789'],
    ['0123456789', '60123456789'],
    ['0060123456789', '60123456789'],
    ['60123456789', '60123456789'],
    ['+6591234567', '6591234567'],
  ])('%s -> %s', (input, expected) => {
    expect(signInPhoneDigits(input)).toBe(expected);
  });

  it.each([[''], [null], ['1234567'], ['1234567890123456'], ['deleted_abc']])(
    'refuses %s',
    (input) => {
      expect(signInPhoneDigits(input)).toBeNull();
    },
  );
});

describe('sameSignInEmail / sameSignInPhone', () => {
  it('ignores case and surrounding space for email; null equals blank', () => {
    expect(sameSignInEmail(' Owner@Atlas-Agency.MY ', 'owner@atlas-agency.my')).toBe(true);
    expect(sameSignInEmail(null, '')).toBe(true);
    expect(sameSignInEmail('', 'owner@atlas-agency.my')).toBe(false);
  });

  it('treats one line written three ways as the same phone', () => {
    expect(sameSignInPhone('+60123456789', '012-345 6789')).toBe(true);
    expect(sameSignInPhone('60123456789', '+60 12 345 6789')).toBe(true);
    expect(sameSignInPhone('+60123456789', '+60123456780')).toBe(false);
    expect(sameSignInPhone(null, '')).toBe(true);
    expect(sameSignInPhone('', '+60123456789')).toBe(false);
  });
});

describe('signInContactChanges', () => {
  const account = { email: 'vicky@example.com', phoneNum: '+60123456789' };

  it('drops unchanged values and keeps undefined as "not asked"', () => {
    expect(signInContactChanges(account, {})).toEqual({});
    expect(
      signInContactChanges(account, { email: 'VICKY@example.com', phone: '0123456789' }),
    ).toEqual({});
  });

  it('normalises a real change for storage, and null clears', () => {
    expect(
      signInContactChanges(account, { email: ' New@Example.com ', phone: '0198887777' }),
    ).toEqual({ email: 'new@example.com', phoneNum: '+60198887777' });
    expect(signInContactChanges(account, { email: null, phone: '' })).toEqual({
      email: null,
      phoneNum: null,
    });
  });

  it('stores an un-normalisable phone as typed rather than refusing the roster entry', () => {
    expect(storedSignInPhone(' 12345 ')).toBe('12345');
    expect(storedSignInPhone('   ')).toBeNull();
  });
});

describe('signInPhoneLookupForms — agrees with the REAL login lookup', () => {
  /**
   * What `getUserByLoginMethod('phone', form)` would match: the SQL compares the
   * stored number's digits against `phoneLoginCandidates(form)`. Using the real
   * candidate function is the point — a fake that matched `method:value`
   * exactly is why the `00` miss was invisible to the controller tests.
   */
  function lookupFinds(storedPhoneNum: string, typed: string): boolean {
    const storedDigits = storedPhoneNum.replace(/\D/g, '');
    return signInPhoneLookupForms(typed).some((form) =>
      phoneLoginCandidates(form).includes(storedDigits),
    );
  }

  it.each([
    // [on file, typed]
    ['00123456789', '00123456789'], // '00' + 9 digits
    ['0012345678', '0012345678'], // '00' + 8 digits
    ['0060123456789', '+60 12-345 6789'],
    ['0060123456789', '0123456789'],
    ['+60123456789', '0060123456789'],
    ['+60123456789', '012-345 6789'],
    ['0123456789', '+60123456789'],
    ['123456', '123456'], // too short to normalise: looked up as typed, as before
  ])('a number on file as %s is found when typed as %s', (onFile, typed) => {
    expect(lookupFinds(onFile, typed)).toBe(true);
  });

  it('control: the stored form ALONE misses a 00-prefixed number (the bug these forms fix)', () => {
    const stored = storedSignInPhone('00123456789');
    expect(stored).toBe('+123456789');
    expect(phoneLoginCandidates(stored as string)).not.toContain('00123456789');
    expect(phoneLoginCandidates(storedSignInPhone('0060123456789') as string)).not.toContain(
      '0060123456789',
    );
  });

  it('the stored form stays first, so a current row costs one query', () => {
    expect(signInPhoneLookupForms('012-345 6789')).toEqual([
      '+60123456789',
      '0060123456789',
      '012-345 6789',
    ]);
    // Already one of the earlier forms by digits: no duplicate query.
    expect(signInPhoneLookupForms('+60123456789')).toEqual(['+60123456789', '0060123456789']);
    expect(signInPhoneLookupForms('0060123456789')).toEqual(['+60123456789', '0060123456789']);
  });

  it('is empty for blank or digit-less input', () => {
    expect(signInPhoneLookupForms('')).toEqual([]);
    expect(signInPhoneLookupForms(null)).toEqual([]);
    expect(signInPhoneLookupForms('abc')).toEqual([]);
  });
});

describe('agencyMayCorrectStub', () => {
  const A = 'agency-a';
  const B = 'agency-b';

  it('lets the creating agency correct its own stub', () => {
    expect(agencyMayCorrectStub({ agencyId: A, creatorAgencyIds: [A], rosterAgencyIds: [A] })).toBe(
      true,
    );
    // Not rostered anywhere yet (the invite failed after the account was made).
    expect(agencyMayCorrectStub({ agencyId: A, creatorAgencyIds: [A], rosterAgencyIds: [] })).toBe(
      true,
    );
  });

  it("refuses another agency's stub (the takeover path)", () => {
    expect(agencyMayCorrectStub({ agencyId: B, creatorAgencyIds: [A], rosterAgencyIds: [A] })).toBe(
      false,
    );
  });

  it('refuses the creator once a second agency rosters the stub', () => {
    expect(
      agencyMayCorrectStub({ agencyId: A, creatorAgencyIds: [A], rosterAgencyIds: [A, B] }),
    ).toBe(false);
  });

  it('refuses when the creator is not a person (seed / system) or no agency is acting', () => {
    expect(agencyMayCorrectStub({ agencyId: A, creatorAgencyIds: [], rosterAgencyIds: [A] })).toBe(
      false,
    );
    expect(
      agencyMayCorrectStub({ agencyId: null, creatorAgencyIds: [A], rosterAgencyIds: [A] }),
    ).toBe(false);
  });
});

describe('isActivatedAccount', () => {
  it('is the password, nothing else', () => {
    expect(isActivatedAccount({ passwordHash: 'x' })).toBe(true);
    expect(isActivatedAccount({ passwordHash: null })).toBe(false);
    expect(isActivatedAccount(null)).toBe(false);
  });
});
