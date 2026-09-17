// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test as globals.
import { formatMessage, localizeLoginError, translations } from '../i18n/translations';
import {
  isCodeRejection,
  isSessionRefusal,
  localizeApiError,
  localizeSignInError,
  matchCodeFlowError,
} from './api-error-copy';

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
  // forgot/start (ForgotStartSchema) and contact-change/start (ContactChangeStartSchema).
  ['Enter your email or your phone number', 'enterEmailOrPhone'],
  ['Enter the new email or phone number', 'enterNewContact'],
  // contact-change.controller.ts 500s, password-change.controller.ts, the zod
  // fallback, and ApiError.INTERNAL_SERVER_ERROR (backend error/index.ts).
  ['Could not start the change', 'couldNotStartChange'],
  ['Could not send the code', 'couldNotSendCode'],
  ['This account cannot change password here', 'cannotChangePasswordHere'],
  ['Validation failed', 'validationFailed'],
  ['Internal Server Error', 'internalServerError'],
  // ApiError.UNAUTHORIZED — authenticate-jwt and the account-code controllers' 401.
  ['Unauthorized', 'unauthorized'],
];

/** The password bounds carry a number (account-code/schemas.ts, auth.schema.ts, outlet.schema.ts). */
const LENGTH: ReadonlyArray<readonly [string, 'passwordMinLength' | 'passwordMaxLength', string]> = [
  ['Password must be at least 6 characters long', 'passwordMinLength', '6'],
  ['Password must be at most 72 characters long', 'passwordMaxLength', '72'],
  ['Password must be at least 6 characters', 'passwordMinLength', '6'],
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

  test.each(LENGTH)('recognises the password bound %p', (sentence, key) => {
    expect(matchCodeFlowError(sentence)).toBe(key);
    expect(matchCodeFlowError(`${sentence}.`)).toBe(key);
  });

  test('the 500 "Could not send the code" and the 503 "… — try again later" stay two sentences', () => {
    expect(matchCodeFlowError('Could not send the code')).toBe('couldNotSendCode');
    expect(matchCodeFlowError('Could not send the code — try again later')).toBe('codeSendFailed');
    expect(matchCodeFlowError('Could not send the code - try again later.')).toBe('codeSendFailed');
  });

  test('leaves everything else alone — including the sign-in lockout, whose minutes matter', () => {
    expect(matchCodeFlowError('Password must be at least six characters long')).toBeNull();
    expect(matchCodeFlowError('Could not send the voucher')).toBeNull();
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
    'Could not send the code',
    'Could not start the change',
    'Validation failed',
    'Password must be at least 6 characters long',
    'Request failed (500)',
    'Unauthorized',
  ])('%p leaves the typed code standing', (message) => {
    expect(isCodeRejection(message)).toBe(false);
  });
});

describe('isSessionRefusal', () => {
  test('a 401 "Unauthorized" is the session, not the request', () => {
    expect(isSessionRefusal(401, 'Unauthorized')).toBe(true);
    expect(isSessionRefusal(401, ' Unauthorized. ')).toBe(true);
    // lib/session.tsx's own no-token throw.
    expect(isSessionRefusal(401, 'Not signed in')).toBe(true);
  });

  test('a 401 with any other sentence is a refusal she can fix — never a sign-out', () => {
    // POST /user/:id/delete answers a mistyped password with 401.
    expect(isSessionRefusal(401, 'Incorrect password')).toBe(false);
    expect(isSessionRefusal(401, 'Wrong password')).toBe(false);
    expect(isSessionRefusal(401, 'Invalid code')).toBe(false);
  });

  test('the sentence without 401 is not a session refusal', () => {
    // The self-only /user/:id handlers send 403 "Unauthorized".
    expect(isSessionRefusal(403, 'Unauthorized')).toBe(false);
    expect(isSessionRefusal(500, 'Unauthorized')).toBe(false);
    expect(isSessionRefusal(0, 'Unauthorized')).toBe(false);
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

  test.each(LENGTH)('%p keeps the server’s own number in every language', (sentence, key, n) => {
    expect(localizeApiError(sentence, ZH)).toBe(ZH[key].replace('{n}', n));
    expect(localizeApiError(sentence, ZH_HANT)).toBe(ZH_HANT[key].replace('{n}', n));
    expect(localizeApiError(sentence, ZH)).toContain(n);
    expect(localizeApiError(sentence, ZH_HANT)).toContain(n);
    expect(localizeApiError(sentence, ZH)).not.toBe(sentence);
  });

  test('English reads the server’s password bounds unchanged', () => {
    expect(localizeApiError('Password must be at least 6 characters long', EN)).toBe(
      'Password must be at least 6 characters long',
    );
    expect(localizeApiError('Password must be at most 72 characters long', EN)).toBe(
      'Password must be at most 72 characters long',
    );
  });

  test('a changed bound is read, not assumed', () => {
    expect(localizeApiError('Password must be at least 8 characters long', ZH)).toBe('密码至少 8 位');
    expect(localizeApiError('Password must be at most 64 characters long', ZH_HANT)).toBe(
      '密碼最多 64 位',
    );
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

describe('localizeSignInError — what the sign-in screen can receive', () => {
  const ZH_T = translations.zh;
  const ZH_HANT_T = translations['zh-Hant'];
  const EN_T = translations.en;

  /** loginLimiter (backend middlewares/rate-limit.ts), exactly as sent. */
  const LOGIN_LIMITER = 'Too many sign-in attempts. Please wait a few minutes and try again.';
  /** auth.controller.ts login catch: `Error.INTERNAL_SERVER_ERROR`. */
  const LOGIN_500 = 'Internal Server Error';

  test('the instrument: localizeLoginError alone returns both in English (the bug)', () => {
    expect(localizeLoginError(LOGIN_500, ZH_T.login)).toBe(LOGIN_500);
    expect(localizeLoginError(LOGIN_LIMITER, ZH_T.login)).toBe(LOGIN_LIMITER);
  });

  test.each([
    ['zh', ZH_T],
    ['zh-Hant', ZH_HANT_T],
  ] as const)('%s: the 500 and the login limiter are translated', (_locale, t) => {
    expect(localizeSignInError(LOGIN_500, t)).toBe(t.errors.internalServerError);
    expect(localizeSignInError(LOGIN_LIMITER, t)).toBe(t.errors.tooManyRequests);
    expect(localizeSignInError(LOGIN_500, t)).not.toBe(LOGIN_500);
    expect(localizeSignInError(LOGIN_LIMITER, t)).not.toBe(LOGIN_LIMITER);
  });

  test.each([
    ['zh', ZH_T],
    ['zh-Hant', ZH_HANT_T],
  ] as const)('%s: sign-in sentences keep their own copy, and the lockout its minutes', (_locale, t) => {
    expect(localizeSignInError('Wrong password', t)).toBe(t.login.wrongPassword);
    expect(localizeSignInError('This account is not registered yet.', t)).toBe(
      t.login.accountNotRegistered,
    );
    expect(localizeSignInError('This account is inactive.', t)).toBe(t.login.accountInactive);
    const lockout = localizeSignInError('Too many failed attempts. Try again in 7 minutes.', t);
    expect(lockout).toBe(formatMessage(t.login.tooManyAttempts, { m: '7' }));
    // The limiter pattern must not swallow the lockout.
    expect(lockout).not.toBe(t.errors.tooManyRequests);
  });

  test('the client-written messages map too, and server refusals stay verbatim', () => {
    expect(localizeSignInError('Request failed (502)', ZH_T)).toBe(
      formatMessage(ZH_T.errors.requestFailed, { status: '502' }),
    );
    expect(localizeSignInError('Password must be at least 6 characters long', ZH_HANT_T)).toBe(
      formatMessage(ZH_HANT_T.errors.passwordMinLength, { n: '6' }),
    );
    const refusal = 'Your agency has paused sign-in for this account';
    expect(localizeSignInError(refusal, ZH_T)).toBe(refusal);
    expect(localizeSignInError('   ', ZH_T)).toBe(ZH_T.login.signInFailed);
  });

  test('English reads the server sentences unchanged', () => {
    expect(localizeSignInError(LOGIN_500, EN_T)).toBe(LOGIN_500);
    expect(localizeSignInError('Wrong password', EN_T)).toBe(EN_T.login.wrongPassword);
  });
});

describe('translations for the new keys', () => {
  const NEW_ERROR_KEYS = [
    ...CONTRACT.map(([, key]) => key),
    'codeCooldown',
    'tooManyRequests',
    'passwordMinLength',
    'passwordMaxLength',
  ] as const;

  test.each(['en', 'zh', 'zh-Hant'] as const)('%s has every error key, non-empty', (locale) => {
    const errors = translations[locale].errors;
    for (const key of NEW_ERROR_KEYS) {
      expect(typeof errors[key]).toBe('string');
      expect(errors[key].trim().length).toBeGreaterThan(0);
    }
    expect(errors.codeCooldown).toContain('{s}');
    expect(errors.passwordMinLength).toContain('{n}');
    expect(errors.passwordMaxLength).toContain('{n}');
  });
});
