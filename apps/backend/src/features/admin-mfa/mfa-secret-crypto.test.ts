import { describe, expect, it } from 'vitest';
import { generateSecret, verifyTotp, currentCode } from '@/util/totp';
import {
  isSealedMfaSecret,
  mfaKeyFrom,
  openMfaSecret,
  sealMfaSecret,
} from './mfa-secret-crypto';

const key = mfaKeyFrom('a-test-key-that-is-long-enough');
const otherKey = mfaKeyFrom('a-different-key-entirely-here');

describe('admin authenticator secret sealed at rest', () => {
  it('round-trips, and the opened seed still verifies a real code', () => {
    const seed = generateSecret();
    const stored = sealMfaSecret(seed, key);
    expect(isSealedMfaSecret(stored)).toBe(true);
    expect(stored).not.toContain(seed);
    expect(stored.length).toBeLessThanOrEqual(255); // the column is varchar(255)
    const opened = openMfaSecret(stored, key);
    expect(opened).toBe(seed);
    expect(verifyTotp(opened, currentCode(seed))).toBe(true);
  });

  it('seals the same seed differently each time (fresh IV)', () => {
    const seed = generateSecret();
    expect(sealMfaSecret(seed, key)).not.toBe(sealMfaSecret(seed, key));
  });

  it('without a key, stores and reads exactly as before', () => {
    const seed = generateSecret();
    expect(sealMfaSecret(seed, null)).toBe(seed);
    expect(openMfaSecret(seed, null)).toBe(seed);
  });

  it('reads a legacy plain-text row unchanged once a key is set', () => {
    const seed = generateSecret();
    expect(openMfaSecret(seed, key)).toBe(seed);
  });

  it('never double-seals', () => {
    const once = sealMfaSecret(generateSecret(), key);
    expect(sealMfaSecret(once, key)).toBe(once);
  });

  it('FAILS CLOSED: a wrong key, a missing key or a tampered value throws', () => {
    const stored = sealMfaSecret(generateSecret(), key);
    expect(() => openMfaSecret(stored, otherKey)).toThrow();
    expect(() => openMfaSecret(stored, null)).toThrow(/MFA_SECRET_KEY/);
    const [iv, tag, body] = stored.slice('enc:v1:'.length).split('.');
    const flipped = `${body.slice(0, -2)}${body.endsWith('AA') ? 'BB' : 'AA'}`;
    expect(() => openMfaSecret(`enc:v1:${iv}.${tag}.${flipped}`, key)).toThrow();
    expect(() => openMfaSecret('enc:v1:only-one-part', key)).toThrow(/malformed/);
  });
});
