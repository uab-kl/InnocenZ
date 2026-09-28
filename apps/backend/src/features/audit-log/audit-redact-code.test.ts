import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { isSensitiveAuditKey, redactSensitive } from './audit-log.repository';

/**
 * A request body carrying a one-time code is written to `audit_logs` by the
 * platform audit middleware. With its request id beside it, a stored code is a
 * replayable proof until the row expires — so `code` is redacted like a password.
 */
describe('audit redaction of account codes', () => {
  it('redacts code, and the password fields of every code flow', () => {
    // ⚠️ `newRequestId` was dropped on 21 Sep 2026 with the identity step — no
    // contact-change body carries a second id any more.
    const body = {
      requestId: '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607',
      kind: 'email',
      value: 'new@x.my',
      code: '123456',
      password: 'hunter22',
      currentPassword: 'old-one',
      newPassword: 'new-one',
    };
    expect(redactSensitive(body)).toEqual({
      requestId: body.requestId,
      kind: 'email',
      value: 'new@x.my',
      code: '[REDACTED]',
      password: '[REDACTED]',
      currentPassword: '[REDACTED]',
      newPassword: '[REDACTED]',
    });
  });

  it('redacts the re-issued tokens in a response', () => {
    const response = { success: true, data: { accessToken: 'a.b.c', refreshToken: 'd.e.f', email: 'x@y.my' } };
    const redacted = redactSensitive(response);
    expect(redacted.data.accessToken).toBe('[REDACTED]');
    expect(redacted.data.refreshToken).toBe('[REDACTED]');
    expect(redacted.data.email).toBe('x@y.my');
  });

  it('lists the keys', () => {
    for (const key of ['code', 'newPassword', 'currentPassword', 'password', 'verificationId']) {
      expect(isSensitiveAuditKey(key)).toBe(true);
    }
  });
});

/**
 * The three spellings found in the live table on 28 Sep 2026 — a plaintext
 * `confirmPassword`, and MFA enrolments carrying `otpauthUrl` — plus the
 * variants of each that a camelCase-only list would also have missed.
 */
describe('audit redaction of credential spellings', () => {
  it('redacts the spellings that leaked', () => {
    const body = {
      confirmPassword: 'hunter22',
      otpauthUrl: 'otpauth://totp/InnocenZ:admin?secret=JBSWY3DPEHPK3PXP',
      secret: 'JBSWY3DPEHPK3PXP',
      mfaCode: '654321',
    };
    const redacted = redactSensitive(body);
    for (const key of Object.keys(body)) {
      expect(redacted[key as keyof typeof body]).toBe('[REDACTED]');
    }
  });

  it('is blind to case and separators', () => {
    for (const key of ['refresh_token', 'ACCESS_TOKEN', 'otpauth_url', 'Confirm-Password', 'mfa_secret']) {
      expect(isSensitiveAuditKey(key)).toBe(true);
    }
  });

  it('catches any key ENDING in password, token or secret', () => {
    for (const key of ['oldPassword', 'repeatPassword', 'resetToken', 'inviteToken', 'clientSecret']) {
      expect(isSensitiveAuditKey(key)).toBe(true);
    }
  });

  it('keeps fields that only mention a credential', () => {
    for (const key of ['passwordChangedAt', 'tokenCount', 'secretaryName', 'email', 'status']) {
      expect(isSensitiveAuditKey(key)).toBe(false);
    }
  });

  it('keeps a boolean or null under a credential-shaped key', () => {
    const row = { hasPassword: true, password: null, token: undefined };
    expect(redactSensitive(row)).toEqual(row);
  });

  it('redacts nested values and whole objects under a credential key', () => {
    const response = {
      data: {
        mfa: { secret: { base32: 'JBSWY3DP', otpauth_url: 'otpauth://…' } },
        user: { email: 'x@y.my', resetToken: 'abc' },
      },
    };
    const redacted = redactSensitive(response);
    expect(redacted.data.mfa.secret).toBe('[REDACTED]');
    expect(redacted.data.user.resetToken).toBe('[REDACTED]');
    expect(redacted.data.user.email).toBe('x@y.my');
  });
});
