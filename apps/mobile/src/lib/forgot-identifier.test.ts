// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test as globals.
import { translations } from '../i18n/translations';
import {
  DEFAULT_FORGOT_IDENTIFIER_KIND,
  forgotStartBody,
  hasForgotIdentifier,
} from './forgot-identifier';
import { phoneLoginIdentifier } from './phone-prefs';

/**
 * Forgot password takes the account's PHONE or its EMAIL. The body must be
 * exactly one of `{ phoneNum }` / `{ email }` — backend ForgotStartSchema
 * refuses both, and refuses neither — normalised the way sign-in and Security
 * settings already normalise, so the reset finds the same account they do.
 */

describe('forgotStartBody — phone', () => {
  test('the phone is the default switch position', () => {
    expect(DEFAULT_FORGOT_IDENTIFIER_KIND).toBe('phone');
  });

  test('dial code + local digits, trunk 0 and punctuation dropped, sent as +digits', () => {
    expect(
      forgotStartBody({ kind: 'phone', countryCode: 'MY', localNumber: '012-345 6789' }),
    ).toEqual({ ok: true, body: { phoneNum: '+60123456789' } });
  });

  test('another offered dial code is honoured', () => {
    expect(forgotStartBody({ kind: 'phone', countryCode: 'ID', localNumber: '0812 345 678' })).toEqual({
      ok: true,
      body: { phoneNum: '+62812345678' },
    });
  });

  test('a country the picker does not offer falls back to Malaysia, as sign-in does', () => {
    expect(forgotStartBody({ kind: 'phone', countryCode: 'SG', localNumber: '91234567' })).toEqual({
      ok: true,
      body: { phoneNum: '+6091234567' },
    });
  });

  test('is byte-identical to what the phone-only sheet used to send', () => {
    for (const [countryCode, localNumber] of [
      ['MY', '0123456789'],
      ['ID', '812345678'],
      ['my', ' 12 345 6789 '],
      ['??', '123456789'],
    ] as const) {
      const legacy = `+${phoneLoginIdentifier(countryCode, localNumber).replace(/^\+/, '')}`;
      expect(forgotStartBody({ kind: 'phone', countryCode, localNumber })).toEqual({
        ok: true,
        body: { phoneNum: legacy },
      });
    }
  });

  test('no digits typed is "empty" — nothing to send, no error to show', () => {
    expect(forgotStartBody({ kind: 'phone', countryCode: 'MY', localNumber: '' })).toEqual({
      ok: false,
      reason: 'empty',
    });
    expect(forgotStartBody({ kind: 'phone', countryCode: 'MY', localNumber: '000' })).toEqual({
      ok: false,
      reason: 'empty',
    });
    expect(forgotStartBody({ kind: 'phone', countryCode: 'MY', localNumber: 'abc' })).toEqual({
      ok: false,
      reason: 'empty',
    });
  });
});

describe('forgotStartBody — email', () => {
  test('trimmed and lowercased, the form the server stores and compares', () => {
    expect(forgotStartBody({ kind: 'email', email: '  Someone@Example.COM ' })).toEqual({
      ok: true,
      body: { email: 'someone@example.com' },
    });
  });

  test('blank is "empty"', () => {
    expect(forgotStartBody({ kind: 'email', email: '' })).toEqual({ ok: false, reason: 'empty' });
    expect(forgotStartBody({ kind: 'email', email: '   ' })).toEqual({ ok: false, reason: 'empty' });
  });

  test('something that cannot be an address is refused before the call, with a reason', () => {
    for (const email of ['someone', 'someone@example', '@example.com', 'some one@example.com']) {
      expect(forgotStartBody({ kind: 'email', email })).toEqual({ ok: false, reason: 'invalidEmail' });
    }
  });

  test('over 254 characters is not an address', () => {
    const long = `${'a'.repeat(250)}@example.com`;
    expect(forgotStartBody({ kind: 'email', email: long })).toEqual({
      ok: false,
      reason: 'invalidEmail',
    });
  });
});

describe('the body carries exactly ONE identifier', () => {
  test.each([
    { kind: 'phone', countryCode: 'MY', localNumber: '123456789' } as const,
    { kind: 'email', email: 'someone@example.com' } as const,
  ])('%p', (input) => {
    const result = forgotStartBody(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const keys = Object.keys(result.body);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe(input.kind === 'phone' ? 'phoneNum' : 'email');
  });
});

describe('hasForgotIdentifier — enables "Send code"', () => {
  test('nothing typed keeps it disabled', () => {
    expect(hasForgotIdentifier({ kind: 'phone', countryCode: 'MY', localNumber: '' })).toBe(false);
    expect(hasForgotIdentifier({ kind: 'email', email: ' ' })).toBe(false);
  });

  test('a half-typed email still enables it, so the press can SAY what is wrong', () => {
    expect(hasForgotIdentifier({ kind: 'email', email: 'someone' })).toBe(true);
  });

  test('a usable phone or email enables it', () => {
    expect(hasForgotIdentifier({ kind: 'phone', countryCode: 'MY', localNumber: '123456789' })).toBe(
      true,
    );
    expect(hasForgotIdentifier({ kind: 'email', email: 'someone@example.com' })).toBe(true);
  });
});

describe('forgot switch copy', () => {
  const KEYS = ['byPhone', 'byEmail', 'emailHint', 'emailLabel'] as const;

  test.each(['en', 'zh', 'zh-Hant'] as const)('%s has every switch key, non-empty', (locale) => {
    const forgot = translations[locale].forgot;
    for (const key of KEYS) {
      expect(typeof forgot[key]).toBe('string');
      expect(forgot[key].trim().length).toBeGreaterThan(0);
    }
  });

  test('a Chinese screen never gets the English switch copy', () => {
    for (const key of KEYS) {
      expect(translations.zh.forgot[key]).not.toBe(translations.en.forgot[key]);
      expect(translations['zh-Hant'].forgot[key]).not.toBe(translations.en.forgot[key]);
    }
  });

  test('the email hint keeps the neutral promise — it never says the address has an account', () => {
    expect(translations.en.forgot.emailHint).not.toMatch(/\bregistered\b|\bfound\b/i);
    expect(translations.en.forgot.emailHint).toContain('WhatsApp, SMS and email');
  });
});
