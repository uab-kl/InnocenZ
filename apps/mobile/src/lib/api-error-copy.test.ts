// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test as globals.
import { translations } from '../i18n/translations';
import { isCodeRejection, localizeApiError, matchCodeFlowError } from './api-error-copy';

/**
 * The verification-code flows (forgot password, change phone / email, change
 * password) answer with FIXED English sentences. The PR app renders them in
 * the reader's language — and a sentence that silently stops matching ships
 * English to a Chinese screen with no warning, which is what these pin.
 */

const EN = translations.en.errors;
const ZH = translations.zh.errors;
const ZH_HANT = translations['zh-Hant'].errors;

/** Every contract sentence, exactly as the server sends it, and the key it must reach. */
const CONTRACT: ReadonlyArray<readonly [string, keyof typeof EN]> = [
  ['Invalid code', 'invalidCode'],
  ['This code has expired — request a new one', 'codeExpired'],
  ['This change has expired — start again', 'changeExpired'],
  ['This code was already used', 'codeAlreadyUsed'],
  ['Could not send the code — try again later', 'codeSendFailed'],
  ['That is already your email', 'sameEmail'],
  ['That is already your phone number', 'samePhone'],
  ['That email is already used by another account', 'emailTaken'],
  ['That phone number is already used by another account', 'phoneTaken'],
  ['Your account has no phone or email we can send a code to', 'noContactChannel'],
  ['Current password is incorrect', 'currentPasswordIncorrect'],
  ['New password must be different', 'passwordMustDiffer'],
  ['Change your email from Security settings', 'changeEmailInSecurity'],
  ['Change your phone from Security settings', 'changePhoneInSecurity'],
  [
    'Changing your phone now needs a code to your current contacts — please update the app',
    'phoneChangeNeedsUpdate',
  ],
  ['Use Forgot password on the sign-in page', 'useForgotPassword'],
  // 429 from the code's own attempt cap (backend account-code/shared.ts TOO_MANY_ATTEMPTS).
  ['Too many attempts — request a new code', 'tooManyCodeAttempts'],
  // The endpoints' fixed validation sentences (backend account-code/schemas.ts).
  ['Enter a valid phone number', 'invalidPhoneNumber'],
  ['Enter the 6-digit code', 'enterSixDigitCode'],
  ['Enter a valid email address', 'invalidEmailAddress'],
  ['Current password is required', 'currentPasswordRequired'],
];

describe('matchCodeFlowError', () => {
  test.each(CONTRACT)('recognises %p', (sentence, key) => {
    expect(matchCodeFlowError(sentence)).toBe(key);
  });

  test('tolerates a retyped dash, a trailing full stop, spacing and case', () => {
    expect(matchCodeFlowError('This code has expired - request a new one.')).toBe('codeExpired');
    expect(matchCodeFlowError('  this change has expired – start again ')).toBe('changeExpired');
    expect(matchCodeFlowError('Invalid  code.')).toBe('invalidCode');
  });

  test('recognises the resend cooldown and the rate limiters', () => {
    expect(matchCodeFlowError('Wait 42s before requesting another code')).toBe('codeCooldown');
    expect(
      matchCodeFlowError('Too many verification codes requested. Please try again later.'),
    ).toBe('tooManyRequests');
    expect(
      matchCodeFlowError('Too many attempts. Please wait a few minutes and try again.'),
    ).toBe('tooManyRequests');
  });

  test('the code attempt cap is NOT the rate limiter — one needs a new code, the other a wait', () => {
    expect(matchCodeFlowError('Too many attempts — request a new code')).toBe('tooManyCodeAttempts');
    expect(matchCodeFlowError('Too many attempts - request a new code.')).toBe('tooManyCodeAttempts');
    expect(
      matchCodeFlowError('Too many attempts. Please wait a few minutes and try again.'),
    ).toBe('tooManyRequests');
  });

  test('leaves everything else alone — including the sign-in lockout, whose minutes matter', () => {
    expect(matchCodeFlowError('Too many failed attempts. Try again in 5 minutes.')).toBeNull();
    expect(matchCodeFlowError('You are 137 m from the venue')).toBeNull();
    expect(matchCodeFlowError('Invalid code for this voucher')).toBeNull();
    expect(matchCodeFlowError('')).toBeNull();
  });
});

describe('isCodeRejection', () => {
  test.each([
    'Invalid code',
    'This code has expired — request a new one',
    'This change has expired — start again',
    'This code was already used',
    'Too many attempts — request a new code',
  ])('%p is about the code — clear it', (message) => {
    expect(isCodeRejection(message)).toBe(true);
  });

  test.each([
    // A limiter answers BEFORE the controller runs: the code is still pending and valid.
    'Too many attempts. Please wait a few minutes and try again.',
    'Too many verification codes requested. Please try again later.',
    'Could not send the code — try again later',
    'Wait 42s before requesting another code',
    'That email is already used by another account',
    'Internal Server Error',
    'Request failed (500)',
  ])('%p leaves the typed code standing', (message) => {
    expect(isCodeRejection(message)).toBe(false);
  });
});

describe('localizeApiError — contract sentences', () => {
  test.each(CONTRACT)('%p renders in all three locales', (sentence, key) => {
    expect(localizeApiError(sentence, EN)).toBe(EN[key]);
    expect(localizeApiError(sentence, ZH)).toBe(ZH[key]);
    expect(localizeApiError(sentence, ZH_HANT)).toBe(ZH_HANT[key]);
    // A Chinese screen must never get the English sentence back.
    expect(localizeApiError(sentence, ZH)).not.toBe(sentence);
    expect(localizeApiError(sentence, ZH_HANT)).not.toBe(sentence);
  });

  test('English copy is the server sentence itself, so an English screen reads unchanged', () => {
    for (const [sentence, key] of CONTRACT) {
      expect(EN[key]).toBe(sentence);
    }
  });

  test('the cooldown keeps its seconds in every language', () => {
    const message = 'Wait 42s before requesting another code';
    expect(localizeApiError(message, EN)).toBe('Wait 42s before requesting another code');
    expect(localizeApiError(message, ZH)).toBe('请等待 42 秒后再获取验证码');
    expect(localizeApiError(message, ZH_HANT)).toBe('請等待 42 秒後再取得驗證碼');
  });

  test('a rate limiter refusal is translated', () => {
    const message = 'Too many password reset requests. Please try again later.';
    expect(localizeApiError(message, ZH)).toBe(ZH.tooManyRequests);
  });

  test('the attempt cap and the limiter read differently in Chinese', () => {
    expect(localizeApiError('Too many attempts — request a new code', ZH)).not.toBe(ZH.tooManyRequests);
    expect(localizeApiError('Too many attempts — request a new code', ZH_HANT)).not.toBe(
      ZH_HANT.tooManyRequests,
    );
  });

  test('an unrecognised server refusal is shown verbatim', () => {
    const message = 'RCP-000007 has already been reviewed by the agency';
    expect(localizeApiError(message, ZH)).toBe(message);
  });

  test('the older client-written messages still map', () => {
    expect(localizeApiError('Request failed (503)', ZH)).toBe('请求失败（503）');
    expect(localizeApiError('Not signed in', ZH_HANT)).toBe(ZH_HANT.notSignedIn);
  });
});

describe('translations for the new keys', () => {
  const NEW_ERROR_KEYS = [
    ...CONTRACT.map(([, key]) => key),
    'codeCooldown',
    'tooManyRequests',
  ] as const;

  test.each(['en', 'zh', 'zh-Hant'] as const)('%s has every error key, non-empty', (locale) => {
    const errors = translations[locale].errors;
    for (const key of NEW_ERROR_KEYS) {
      expect(typeof errors[key]).toBe('string');
      expect(errors[key].trim().length).toBeGreaterThan(0);
    }
    expect(errors.codeCooldown).toContain('{s}');
  });
});
