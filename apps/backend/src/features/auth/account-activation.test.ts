import { describe, expect, it } from 'vitest';
import {
  isClaimablePrStub,
  isUnactivatedAccount,
  mayResetPassword,
  receiptProvesPhoneAlone,
} from './account-activation';

/**
 * A reset may REPLACE a password, never create the first one; a stub is
 * claimed only by the PR's own sign-up with a phone-only receipt. These pin
 * the decisions every reset path and the sign-up claim share.
 */

const STUB = { status: 'active', passwordHash: null };
const ACTIVATED = { status: 'active', passwordHash: '$2b$10$hash' };

describe('mayResetPassword', () => {
  it('allows an active account that already has a password', () => {
    expect(mayResetPassword(ACTIVATED)).toBe(true);
  });

  it('refuses a roster stub (active, no password) — a reset never creates the first password', () => {
    expect(mayResetPassword(STUB)).toBe(false);
    expect(mayResetPassword({ status: 'active', passwordHash: '' })).toBe(false);
    expect(mayResetPassword({ status: 'active' })).toBe(false);
  });

  it('refuses an inactive or blocked account, with or without a password', () => {
    expect(mayResetPassword({ status: 'inactive', passwordHash: '$2b$10$hash' })).toBe(false);
    expect(mayResetPassword({ status: 'blocked', passwordHash: '$2b$10$hash' })).toBe(false);
  });

  it('refuses no account at all', () => {
    expect(mayResetPassword(null)).toBe(false);
    expect(mayResetPassword(undefined)).toBe(false);
  });

  it('reads the status case-insensitively, as login does', () => {
    expect(mayResetPassword({ status: 'ACTIVE', passwordHash: '$2b$10$hash' })).toBe(true);
  });
});

describe('isUnactivatedAccount', () => {
  it('is a stub only while active AND password-less', () => {
    expect(isUnactivatedAccount(STUB)).toBe(true);
    expect(isUnactivatedAccount(ACTIVATED)).toBe(false);
    expect(isUnactivatedAccount({ status: 'inactive', passwordHash: null })).toBe(false);
    expect(isUnactivatedAccount(null)).toBe(false);
  });
});

describe('isClaimablePrStub', () => {
  it('a PR-only stub may be claimed', () => {
    expect(isClaimablePrStub(STUB, ['pr'])).toBe(true);
  });

  it('never an activated account, whatever its roles', () => {
    expect(isClaimablePrStub(ACTIVATED, ['pr'])).toBe(false);
  });

  it('never an account holding any organisation or admin role', () => {
    expect(isClaimablePrStub(STUB, ['admin'])).toBe(false);
    expect(isClaimablePrStub(STUB, ['pr', 'Owner'])).toBe(false);
    expect(isClaimablePrStub(STUB, ['pr', 'admin'])).toBe(false);
  });

  it('never an account with no active role at all', () => {
    expect(isClaimablePrStub(STUB, [])).toBe(false);
  });

  it('never a disabled stub', () => {
    expect(isClaimablePrStub({ status: 'blocked', passwordHash: null }, ['pr'])).toBe(false);
  });
});

describe('receiptProvesPhoneAlone', () => {
  it.each([['whatsapp,sms'], ['whatsapp'], ['sms'], [' WhatsApp , SMS ']])(
    'a code sent only to the phone (%s) proves the phone',
    (channel) => {
      expect(receiptProvesPhoneAlone(channel)).toBe(true);
    },
  );

  it.each([['whatsapp,sms,email'], ['email'], ['none'], [''], [null], [undefined]])(
    'a code that also went to an email, or went nowhere (%s), proves nothing a claim can use',
    (channel) => {
      expect(receiptProvesPhoneAlone(channel)).toBe(false);
    },
  );
});
