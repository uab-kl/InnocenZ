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
    const body = {
      requestId: '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607',
      newRequestId: '9a1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607',
      kind: 'email',
      value: 'new@x.my',
      code: '123456',
      password: 'hunter22',
      currentPassword: 'old-one',
      newPassword: 'new-one',
    };
    expect(redactSensitive(body)).toEqual({
      requestId: body.requestId,
      newRequestId: body.newRequestId,
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
