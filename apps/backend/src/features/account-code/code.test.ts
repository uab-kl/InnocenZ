import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  boundCodeMatches,
  generateAccountCode,
  hashBoundCode,
  identityProofHash,
  identityProofMatches,
} from './code';

const USER = '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607';
const OTHER_USER = '9a1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607';

describe('hashBoundCode', () => {
  it('is sha256 hex of JSON.stringify([code, userId, ...binding])', () => {
    const expected = crypto
      .createHash('sha256')
      .update(JSON.stringify(['123456', USER, 'email', 'new@x.my']), 'utf8')
      .digest('hex');
    expect(hashBoundCode('123456', USER, 'email', 'new@x.my')).toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
  });

  const base = hashBoundCode('123456', USER, 'email', 'new@x.my', 'identity-row-1');

  it.each([
    ['the code', () => hashBoundCode('123457', USER, 'email', 'new@x.my', 'identity-row-1')],
    ['the user', () => hashBoundCode('123456', OTHER_USER, 'email', 'new@x.my', 'identity-row-1')],
    ['the kind', () => hashBoundCode('123456', USER, 'phone', 'new@x.my', 'identity-row-1')],
    ['the value', () => hashBoundCode('123456', USER, 'email', 'other@x.my', 'identity-row-1')],
    ['the identity row', () => hashBoundCode('123456', USER, 'email', 'new@x.my', 'identity-row-2')],
    ['the number of bound values', () => hashBoundCode('123456', USER, 'email', 'new@x.my')],
  ])('changes when %s changes', (_label, other) => {
    expect(other()).not.toBe(base);
  });

  it('cannot be confused by moving characters between bound values', () => {
    expect(hashBoundCode('123456', USER, 'ab', 'c')).not.toBe(hashBoundCode('123456', USER, 'a', 'bc'));
  });
});

describe('boundCodeMatches', () => {
  const stored = hashBoundCode('654321', USER, 'phone', '+60123456789');

  it('accepts the right code with the right binding', () => {
    expect(boundCodeMatches(stored, '654321', USER, 'phone', '+60123456789')).toBe(true);
  });

  it('refuses the right code for a different value', () => {
    expect(boundCodeMatches(stored, '654321', USER, 'phone', '+60199999999')).toBe(false);
  });

  it('refuses the right code for a different user', () => {
    expect(boundCodeMatches(stored, '654321', OTHER_USER, 'phone', '+60123456789')).toBe(false);
  });

  it('refuses a malformed stored hash without throwing', () => {
    expect(boundCodeMatches('not-hex', '654321', USER)).toBe(false);
    expect(boundCodeMatches('', '654321', USER)).toBe(false);
  });
});

describe('identity proof', () => {
  it('binds user, kind and value without the code', () => {
    const proof = identityProofHash(USER, 'email', 'new@x.my');
    expect(identityProofMatches(proof, USER, 'email', 'new@x.my')).toBe(true);
    expect(identityProofMatches(proof, USER, 'email', 'else@x.my')).toBe(false);
    expect(identityProofMatches(proof, OTHER_USER, 'email', 'new@x.my')).toBe(false);
  });

  it('can never be matched by a real six-digit code', () => {
    const proof = identityProofHash(USER, 'email', 'new@x.my');
    expect(boundCodeMatches(proof, '000000', USER, 'email', 'new@x.my')).toBe(false);
  });
});

describe('generateAccountCode', () => {
  it('is always six digits', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateAccountCode()).toMatch(/^\d{6}$/);
    }
  });
});
