/**
 * Which account a logged-out "Forgot password" is for — typed as a PHONE or as
 * an EMAIL. Pure: no React, no network — unit-tested in
 * forgot-identifier.test.ts.
 *
 * `POST /auth/password/forgot/start` takes exactly ONE of `{ phoneNum }` or
 * `{ email }` (backend account-code/schemas.ts `ForgotStartSchema`). A PR who
 * no longer has the phone on the account can still reach it by the email on
 * file, and the ONE code still goes to every contact the account holds.
 *
 * Normalisation is the same the rest of the app already uses, so a reset is
 * looked up the way sign-in and Security settings look the account up:
 *  • phone — dial code + local digits with the trunk "0" dropped
 *    (`phoneLoginIdentifier`), sent as '+' + digits like the phone step always
 *    has been;
 *  • email — trimmed and lowercased (`normalizeEmailInput`), refused before the
 *    call when it is plainly not an address (`isPlausibleEmail`). The server's
 *    zod email stays the real gate; its sentence is mapped in api-error-copy.
 */
import { isPlausibleEmail, normalizeEmailInput } from './code-delivery';
import { localPhoneDigits, phoneLoginIdentifier } from './phone-prefs';

export type ForgotIdentifierKind = 'phone' | 'email';

/** The phone is the default: it is how a PR signs in. */
export const DEFAULT_FORGOT_IDENTIFIER_KIND: ForgotIdentifierKind = 'phone';

export type ForgotIdentifierInput =
  | { kind: 'phone'; countryCode: string; localNumber: string }
  | { kind: 'email'; email: string };

export type ForgotStartBody = { phoneNum: string } | { email: string };

export type ForgotIdentifierResult =
  | { ok: true; body: ForgotStartBody }
  /** `empty` — nothing typed yet (the send button stays disabled). */
  | { ok: false; reason: 'empty' }
  /** `invalidEmail` — something typed that cannot be an address; say so. */
  | { ok: false; reason: 'invalidEmail' };

/** The request body for forgot/start, or why there is none yet. */
export function forgotStartBody(input: ForgotIdentifierInput): ForgotIdentifierResult {
  if (input.kind === 'phone') {
    if (!localPhoneDigits(input.localNumber)) return { ok: false, reason: 'empty' };
    const digits = phoneLoginIdentifier(input.countryCode, input.localNumber).replace(/^\+/, '');
    return { ok: true, body: { phoneNum: `+${digits}` } };
  }
  const email = normalizeEmailInput(input.email);
  if (!email) return { ok: false, reason: 'empty' };
  if (!isPlausibleEmail(email)) return { ok: false, reason: 'invalidEmail' };
  return { ok: true, body: { email } };
}

/** True once something has been typed for the chosen kind — enables "Send code". */
export function hasForgotIdentifier(input: ForgotIdentifierInput): boolean {
  const result = forgotStartBody(input);
  return result.ok || result.reason !== 'empty';
}
