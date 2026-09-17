import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db/index.js', () => ({ db: {} }));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { OtpSendSchema, OtpVerifySchema } from './otp.controller';
import { phoneVerificationPurposeValues, publicOtpPurposeValues } from './phone-verification.model';

/**
 * The public /auth/otp/send and /auth/otp/verify take a phone number from
 * anybody. The account-code purposes are keyed on an ACCOUNT and bound to it,
 * so these two schemas must refuse them — and `change_phone`, which now needs a
 * code to the current contacts first.
 */
const REFUSED = ['reset_password', 'contact_change_identity', 'contact_change_new', 'change_phone'];

describe('public OTP schemas', () => {
  it.each(REFUSED)('/auth/otp/send refuses purpose=%s', (purpose) => {
    expect(OtpSendSchema.safeParse({ phoneNum: '60123456789', purpose }).success).toBe(false);
  });

  it.each(REFUSED)('/auth/otp/verify refuses purpose=%s', (purpose) => {
    expect(
      OtpVerifySchema.safeParse({ phoneNum: '60123456789', code: '123456', purpose }).success,
    ).toBe(false);
  });

  it.each(['signup', 'forgot_password'])('still accepts purpose=%s', (purpose) => {
    expect(OtpSendSchema.safeParse({ phoneNum: '60123456789', purpose }).success).toBe(true);
    expect(
      OtpVerifySchema.safeParse({ phoneNum: '60123456789', code: '123456', purpose }).success,
    ).toBe(true);
  });

  it('defaults to signup', () => {
    const parsed = OtpSendSchema.parse({ phoneNum: '60123456789' });
    expect(parsed.purpose).toBe('signup');
  });

  it('the row model still knows every purpose, so stored rows stay typed', () => {
    for (const purpose of [...REFUSED, ...publicOtpPurposeValues]) {
      expect(phoneVerificationPurposeValues).toContain(purpose);
    }
    // varchar(32) on the column.
    for (const purpose of phoneVerificationPurposeValues) {
      expect(purpose.length).toBeLessThanOrEqual(32);
    }
  });
});
