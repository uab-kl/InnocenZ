import { describe, expect, it } from 'vitest';
import {
  FAILED_LOGIN_MEMORY_MINUTES,
  UnknownLoginLockout,
  loginIdentifierKey,
} from './unknown-login-lockout.js';

/**
 * The in-memory twin of the real account lockout: identifiers with no account
 * must lock on the same count, for the same time, by the same rules — or the
 * sixth wrong guess tells a stranger which accounts exist.
 */
function lockout(overrides: { maxEntries?: number; idleTtlMs?: number } = {}) {
  let clock = Date.parse('2026-09-30T10:00:00Z');
  const box = new UnknownLoginLockout({
    maxAttempts: 5,
    lockoutMinutes: 15,
    now: () => clock,
    ...overrides,
  });
  return {
    box,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe('UnknownLoginLockout — the real lockout, for identifiers with no row', () => {
  it('is not locked before the fifth failure, and is locked for 15 minutes at it', () => {
    const { box } = lockout();
    const key = loginIdentifierKey('email', 'nobody@example.test');
    for (let i = 0; i < 4; i += 1) {
      box.recordFailure(key);
      expect(box.minutesLeft(key)).toBeNull();
    }
    box.recordFailure(key);
    expect(box.minutesLeft(key)).toBe(15);
  });

  it('counts down in whole minutes, rounded up, and opens when the lock runs out', () => {
    const { box, advance } = lockout();
    const key = loginIdentifierKey('phone', '0123456789');
    for (let i = 0; i < 5; i += 1) box.recordFailure(key);
    advance(14 * 60_000 + 1);
    expect(box.minutesLeft(key)).toBe(1);
    advance(60_000);
    expect(box.minutesLeft(key)).toBeNull();
  });

  it('never resets the count when the lock runs out — the next failure locks again, like the SQL', () => {
    const { box, advance } = lockout();
    const key = loginIdentifierKey('email', 'nobody@example.test');
    for (let i = 0; i < 5; i += 1) box.recordFailure(key);
    advance(16 * 60_000);
    expect(box.minutesLeft(key)).toBeNull();
    box.recordFailure(key);
    expect(box.minutesLeft(key)).toBe(15);
  });

  it('keeps identifiers apart', () => {
    const { box } = lockout();
    const a = loginIdentifierKey('email', 'a@example.test');
    const b = loginIdentifierKey('email', 'b@example.test');
    for (let i = 0; i < 5; i += 1) box.recordFailure(a);
    expect(box.minutesLeft(a)).toBe(15);
    expect(box.minutesLeft(b)).toBeNull();
  });

  it('forgets an identifier idle past its TTL (the documented limit of an in-memory count)', () => {
    const { box, advance } = lockout({ idleTtlMs: 60 * 60_000 });
    const key = loginIdentifierKey('email', 'nobody@example.test');
    for (let i = 0; i < 4; i += 1) box.recordFailure(key);
    advance(61 * 60_000);
    box.recordFailure(key);
    expect(box.minutesLeft(key)).toBeNull();
  });

  it('by default forgets after the SAME day a real account does (migration 0170, owner 30 Sep 2026)', () => {
    expect(FAILED_LOGIN_MEMORY_MINUTES).toBe(24 * 60);
    const key = loginIdentifierKey('email', 'nobody@example.test');

    // Four old guesses, then a day's silence: the fifth guess is a FIRST.
    const aged = lockout();
    for (let i = 0; i < 4; i += 1) aged.box.recordFailure(key);
    aged.advance(FAILED_LOGIN_MEMORY_MINUTES * 60_000 + 1);
    aged.box.recordFailure(key);
    expect(aged.box.minutesLeft(key)).toBeNull();

    // The same four inside the day still count: the fifth locks.
    const fresh = lockout();
    for (let i = 0; i < 4; i += 1) fresh.box.recordFailure(key);
    fresh.advance(FAILED_LOGIN_MEMORY_MINUTES * 60_000 - 60_000);
    fresh.box.recordFailure(key);
    expect(fresh.box.minutesLeft(key)).toBe(15);
  });

  it('when full, drops UNLOCKED entries first — a flood cannot wash out a lock', () => {
    const { box } = lockout({ maxEntries: 2 });
    const [a, b, c] = ['a', 'b', 'c'].map((x) => loginIdentifierKey('email', `${x}@example.test`));
    for (let i = 0; i < 5; i += 1) box.recordFailure(a);
    box.recordFailure(b);
    box.recordFailure(c);
    expect(box.minutesLeft(a)).toBe(15);
  });

  it('when every entry is locked, the oldest goes, so memory stays bounded', () => {
    const { box } = lockout({ maxEntries: 2 });
    const [a, b, c] = ['a', 'b', 'c'].map((x) => loginIdentifierKey('email', `${x}@example.test`));
    for (const key of [a, b, c]) for (let i = 0; i < 5; i += 1) box.recordFailure(key);
    expect(box.minutesLeft(a)).toBeNull();
    expect(box.minutesLeft(b)).toBe(15);
    expect(box.minutesLeft(c)).toBe(15);
  });
});

describe('loginIdentifierKey — one count per account the lookup would find', () => {
  it('folds an email the way sign-in matches it: trimmed, any case', () => {
    expect(loginIdentifierKey('email', '  Owner@Example.TEST ')).toBe(
      loginIdentifierKey('email', 'owner@example.test'),
    );
  });

  it('folds a phone the way sign-in matches it: digits, 0… and 60… as one line', () => {
    const key = loginIdentifierKey('phone', '+60 12-345 6789');
    expect(loginIdentifierKey('phone', '012-3456789')).toBe(key);
    expect(loginIdentifierKey('phone', '60123456789')).toBe(key);
    // The international dialling prefix too — the delivery drops it.
    expect(loginIdentifierKey('phone', '0060123456789')).toBe(key);
    expect(loginIdentifierKey('phone', '0123456780')).not.toBe(key);
  });

  it('never keeps the identifier in the clear, and an email never shares a key with a phone', () => {
    const key = loginIdentifierKey('email', 'owner@example.test');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain('owner');
    expect(loginIdentifierKey('phone', '60123456789')).not.toBe(loginIdentifierKey('email', '60123456789'));
  });
});
