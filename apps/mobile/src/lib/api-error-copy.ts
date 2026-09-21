/**
 * English → active-locale copy for the errors the REST client throws.
 *
 * `lib/api.ts` is a plain module with no React, so it cannot call `useLocale`.
 * It keeps throwing ENGLISH — which is also what a developer reads in the logs
 * and what a bug report can be searched for — and the RENDER site maps that
 * message onto a dictionary key here. Same shape as `localizeLoginError` in
 * `i18n/translations.ts`, which already does this for the auth messages.
 *
 * ⚠️ An unrecognised message comes back UNTOUCHED, on purpose. Most `ApiError`
 * messages are the SERVER's own refusal text — "RCP-000007 has already been
 * reviewed by the agency", the 409 listing what is still unsettled before an
 * agency can be left, "You are 137 m from the venue…" — and screens are
 * required to show those verbatim. Only the handful of messages this client
 * writes itself are mapped.
 *
 * Every {placeholder} stays a placeholder: the backend URL, the status code and
 * the underlying network detail are filled back in at render time, never baked
 * into the translated sentence.
 */
import { formatMessage, localizeLoginError, type AppTranslations } from '../i18n';

/** `Cannot reach the InnocenZ backend at ${API_BASE}. Is it running?` */
const UNREACHABLE =
  /^Cannot reach the InnocenZ backend at (\S+)\. Is it running\?$/;

/**
 * `Upload failed — could not finish talking to ${API_BASE} (${detail}). …`
 *
 * Matched loosely across the dash: the thrown string carries an em dash and a
 * non-breaking hyphen in "Wi‑Fi", and a resolver that silently stops matching
 * because someone retyped one of those would ship English with no warning.
 */
const UPLOAD_UNREACHABLE =
  /^Upload failed\b.*could not finish talking to (\S+) \(([\s\S]*)\)\./;

/** `That photo is too large — pick one under 5 MB` (multer's 5 MB cap). */
const PHOTO_TOO_LARGE = /^That photo is too large\b/;

const REQUEST_FAILED = /^Request failed \((\d+)\)$/;
const UPLOAD_FAILED = /^Upload failed \((\d+)\)$/;
const PDF_EXPORT_FAILED = /^PDF export failed \((\d+)\)$/;
const EXCEL_EXPORT_FAILED = /^Excel export failed \((\d+)\)$/;

/** `lib/session.tsx` — no token/user yet, so the call was never sent. */
const NOT_SIGNED_IN = 'Not signed in';

/** api.ts's own fallback when the thrown cause carries no message of its own. */
const NETWORK_ERROR = 'network error';

/*
 * ── Verification-code flows ──────────────────────────────────────────────
 *
 * The exception to "server text is shown verbatim": these are FIXED sentences
 * from the forgot-password / contact-change / change-password contract, not
 * data-bearing refusals, so each one has a translation. Anything else the
 * server says still falls through untouched.
 */
type ErrorKey = keyof AppTranslations['errors'];

const CODE_FLOW_SENTENCES: ReadonlyArray<readonly [string, ErrorKey]> = [
  ['Invalid code', 'invalidCode'],
  ['This code has expired — request a new one', 'codeExpired'],
  ['This code was already used', 'codeAlreadyUsed'],
  ['Could not send the code — try again later', 'codeSendFailed'],
  ['That is already your email', 'sameEmail'],
  ['That is already your phone number', 'samePhone'],
  ['That email is already used by another account', 'emailTaken'],
  ['That phone number is already used by another account', 'phoneTaken'],
  ['Your account has no phone or email we can send a code to', 'noContactChannel'],
  /*
   * 422 — the PASSWORD change's own version of that, and a DIFFERENT sentence
   * (password-change.controller.ts NOWHERE_TO_SEND): it tells the person what
   * to do about it, because unlike forgot-password she is signed in and can fix
   * it herself. Matched exactly, so neither swallows the other.
   */
  [
    'Add a phone number or an email to your account before changing your password',
    'addContactBeforePasswordChange',
  ],
  ['Current password is incorrect', 'currentPasswordIncorrect'],
  ['New password must be different', 'passwordMustDiffer'],
  ['Change your email from Security settings', 'changeEmailInSecurity'],
  ['Change your phone from Security settings', 'changePhoneInSecurity'],
  /** 400 — contact-change/start on an account with no password hash to compare. */
  ['Set a password before you change your sign-in email or phone', 'setPasswordFirst'],
  ['Use Forgot password on the sign-in page', 'useForgotPassword'],
  /*
   * The CODE's own attempt cap (429). Not a rate limiter: the code is dead and
   * only a new one helps, so it has its own sentence rather than "wait".
   */
  ['Too many attempts — request a new code', 'tooManyCodeAttempts'],
  // The endpoints' fixed validation sentences (backend account-code/schemas.ts).
  ['Enter a valid phone number', 'invalidPhoneNumber'],
  ['Enter the 6-digit code', 'enterSixDigitCode'],
  ['Enter a valid email address', 'invalidEmailAddress'],
  ['Current password is required', 'currentPasswordRequired'],
  ['Enter your email or your phone number', 'enterEmailOrPhone'],
  ['Enter the new email or phone number', 'enterNewContact'],
  /*
   * Also sent on these same routes, and shown in English on a 中文 screen until
   * 17 Sep 2026 (read from the backend as built): the two 500s in
   * contact-change.controller.ts, the password-less account in
   * password-change.controller.ts, the zod fallback every handler carries, and
   * `ApiError.INTERNAL_SERVER_ERROR`, the catch-all each one ends with.
   *
   * ⚠️ 'Could not send the code' (500, the second code row) is NOT
   * 'Could not send the code — try again later' (503, delivery). The lookup is
   * exact on the canonical form, so neither can swallow the other.
   */
  ['Could not start the change', 'couldNotStartChange'],
  ['Could not send the code', 'couldNotSendCode'],
  ['This account cannot change password here', 'cannotChangePasswordHere'],
  ['Validation failed', 'validationFailed'],
  ['Internal Server Error', 'internalServerError'],
  /*
   * `ApiError.UNAUTHORIZED`. Two statuses carry it, and both mean "this
   * session cannot do that — sign in again" in this app:
   *   • 401 — authenticate-jwt and every account-code controller, for a token
   *     that is missing, expired or behind a credential-change cutoff;
   *   • 403 — the self-only /user/:id handlers when the token's account is not
   *     the id the screen sent, i.e. a session that belongs to someone else.
   * A 401 is better handled than shown: see `isSessionRefusal`.
   */
  ['Unauthorized', 'unauthorized'],
];

/**
 * The schema's password bounds carry the number the server enforces
 * (`PASSWORD_MIN` / `PASSWORD_MAX` in account-code/schemas.ts, and the 6 in
 * auth.schema.ts). The number is READ out of the sentence, never assumed, so a
 * changed bound still reads correctly. " long" is optional because
 * outlet.schema.ts words the same rule without it.
 */
const PASSWORD_MIN_LENGTH = /^Password must be at least (\d+) characters(?: long)?$/i;
const PASSWORD_MAX_LENGTH = /^Password must be at most (\d+) characters(?: long)?$/i;

/**
 * The refusals that are about the CODE itself — wrong, expired, already spent,
 * or out of guesses — as opposed to a rate limiter or a send failure, which
 * leave a still-valid code standing. A screen clears the typed code (and sends
 * the PR back to the code step) only for these; for anything else the code she
 * typed is still good and retyping it would be busywork.
 *
 * ⚠️ Expiry is `codeExpired` — 'This code has expired — request a new one',
 * which contact-change, forgot-password and the request-id schema all still
 * send. The retired request-level twin ('This change has expired — start
 * again') was dropped on 21 Sep 2026 once no backend route sent it; clearing
 * behaviour on the LIVE sentence is unchanged, because it never matched that
 * twin in the first place.
 */
const CODE_REJECTIONS: ReadonlySet<ErrorKey> = new Set<ErrorKey>([
  'invalidCode',
  'codeExpired',
  'codeAlreadyUsed',
  'tooManyCodeAttempts',
]);

/** `Wait 42s before requesting another code` — the 429 resend cooldown. */
const CODE_COOLDOWN = /^Wait (\d+)\s*s(?:ec(?:ond)?s?)? before requesting another code$/i;

/**
 * `Too many failed attempts. Try again in 5 minutes.` — the SIGN-IN lockout.
 *
 * It is not only login's any more: every door that takes the current password
 * honours it before comparing (contact-change's `proveIdentity`, and the
 * password change's start since 21 Sep 2026), so a settings sheet can receive
 * it. Until it was mapped here that sentence reached a 中文 Security screen in
 * English — `localizeLoginError` knows it, and only the sign-in screen calls
 * that.
 *
 * ⚠️ Matched HERE, not in `matchCodeFlowError`, and the minute count is kept.
 * `localizeSignInError` asks `localizeLoginError` FIRST, so the sign-in screen
 * still answers with `login.tooManyAttempts` and nothing about that path moves.
 * The singular ("1 minute") is the backend's own wording — the `s?` is why a
 * lockout of one minute still reads.
 */
const LOCKED_OUT = /^Too many failed attempts\. Try again in (\d+) minutes?\.?$/i;

/**
 * Every rate limiter's refusal: "Too many verification codes requested. Please
 * try again later.", "Too many attempts. Please wait a few minutes and try
 * again." Deliberately NOT the sign-in lockout ("… Try again in 5 minutes."),
 * whose minute count `localizeLoginError` keeps.
 */
const TOO_MANY = /^Too many\b[\s\S]*\b(?:try again later|and try again)$/i;

/**
 * Compare on a canonical form so a retyped dash or a trailing full stop cannot
 * silently stop a sentence matching: any spaced hyphen / en dash / em dash reads
 * as ' — ', whitespace collapses, the final '.' goes, and case is ignored.
 */
function canonical(sentence: string): string {
  return sentence
    .trim()
    .replace(/\s+[-–—]\s+/g, ' — ')
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '')
    .toLowerCase();
}

const CODE_FLOW_BY_CANONICAL = new Map(
  CODE_FLOW_SENTENCES.map(([sentence, key]) => [canonical(sentence), key] as const),
);

/**
 * Which contract sentence a thrown message is, if any. Exported so a screen can
 * decide WHERE to show it (a wrong code sends the forgot-password flow back to
 * the code step) without comparing English strings itself.
 */
export function matchCodeFlowError(message: string): ErrorKey | null {
  const key = canonical(message);
  const exact = CODE_FLOW_BY_CANONICAL.get(key);
  if (exact) return exact;
  const stripped = message.trim().replace(/\.$/, '');
  if (CODE_COOLDOWN.test(stripped)) return 'codeCooldown';
  if (TOO_MANY.test(stripped)) return 'tooManyRequests';
  const spaced = stripped.replace(/\s+/g, ' ');
  if (PASSWORD_MIN_LENGTH.test(spaced)) return 'passwordMinLength';
  if (PASSWORD_MAX_LENGTH.test(spaced)) return 'passwordMaxLength';
  return null;
}

/** True when a thrown message says the typed CODE is no good (see CODE_REJECTIONS). */
export function isCodeRejection(message: string): boolean {
  const key = matchCodeFlowError(message);
  return key !== null && CODE_REJECTIONS.has(key);
}

/**
 * True when the SESSION was refused — the token is gone, expired, or stamped
 * out by a credential change on another device — rather than the request.
 *
 * ⚠️ Status AND sentence, never the status alone. `POST /user/:id/delete`
 * answers a mistyped password with 401 "Incorrect password": a screen that
 * signed out on every 401 would throw a PR to the login page over a typo. Only
 * the server's bare `Unauthorized` (and this client's own "Not signed in") say
 * the session itself is the problem. The app has no global sign-out on a 401,
 * so a screen that gets this should send the PR to sign in, not print it.
 */
export function isSessionRefusal(status: number, message: string): boolean {
  if (status !== 401) return false;
  return message.trim() === NOT_SIGNED_IN || matchCodeFlowError(message) === 'unauthorized';
}

/**
 * Localise one thrown API message. `errors` is passed in (never defaulted) so
 * the caller's live locale decides — a default would pin one language forever.
 */
export function localizeApiError(
  message: string,
  errors: AppTranslations['errors'],
): string {
  const trimmed = message.trim();

  if (trimmed === NOT_SIGNED_IN) return errors.notSignedIn;
  if (PHOTO_TOO_LARGE.test(trimmed)) return errors.photoTooLarge;

  // Before the limiter patterns: 'Too many failed attempts…' is a LOCKOUT with
  // a minute count, and must never be flattened into "wait and try again".
  const lockedOut = LOCKED_OUT.exec(trimmed);
  if (lockedOut) return formatMessage(errors.lockedOut, { m: lockedOut[1] });

  const codeFlow = matchCodeFlowError(trimmed);
  if (codeFlow === 'codeCooldown') {
    const seconds = CODE_COOLDOWN.exec(trimmed.replace(/\.$/, ''));
    return formatMessage(errors.codeCooldown, { s: seconds?.[1] ?? '60' });
  }
  if (codeFlow === 'passwordMinLength' || codeFlow === 'passwordMaxLength') {
    const pattern = codeFlow === 'passwordMinLength' ? PASSWORD_MIN_LENGTH : PASSWORD_MAX_LENGTH;
    const bound = pattern.exec(trimmed.replace(/\.$/, '').replace(/\s+/g, ' '));
    // matchCodeFlowError only answers these keys when the pattern matched.
    return bound ? formatMessage(errors[codeFlow], { n: bound[1] }) : trimmed;
  }
  if (codeFlow) return errors[codeFlow];

  const unreachable = UNREACHABLE.exec(trimmed);
  if (unreachable) {
    return formatMessage(errors.backendUnreachable, { base: unreachable[1] });
  }

  const uploadUnreachable = UPLOAD_UNREACHABLE.exec(trimmed);
  if (uploadUnreachable) {
    const detail = uploadUnreachable[2].trim();
    return formatMessage(errors.uploadUnreachable, {
      base: uploadUnreachable[1],
      // Only OUR fallback word is translated. A real platform message
      // ("Network request failed") is evidence — show it as it was thrown.
      detail: detail === NETWORK_ERROR ? errors.networkError : detail,
    });
  }

  const requestFailed = REQUEST_FAILED.exec(trimmed);
  if (requestFailed) {
    return formatMessage(errors.requestFailed, { status: requestFailed[1] });
  }

  const uploadFailed = UPLOAD_FAILED.exec(trimmed);
  if (uploadFailed) {
    return formatMessage(errors.uploadFailed, { status: uploadFailed[1] });
  }

  const pdfFailed = PDF_EXPORT_FAILED.exec(trimmed);
  if (pdfFailed) {
    return formatMessage(errors.pdfExportFailed, { status: pdfFailed[1] });
  }

  const excelFailed = EXCEL_EXPORT_FAILED.exec(trimmed);
  if (excelFailed) {
    return formatMessage(errors.excelExportFailed, { status: excelFailed[1] });
  }

  return trimmed;
}

/**
 * Localise a SIGN-IN failure. The sign-in screen must use this, not
 * `localizeLoginError` alone.
 *
 * `localizeLoginError` knows the four sentences that only /auth/login sends
 * (not registered, inactive, wrong password, the minute-counted lockout). But
 * `session.signIn` re-throws every status other than 400/401, so the screen also
 * receives the shared ones: the login limiter's 429 "Too many sign-in attempts.
 * Please wait a few minutes and try again.", the catch-all 500 "Internal Server
 * Error", an unreachable backend, a password-length 400. Those shipped English
 * to a 中文 sign-in screen until 17 Sep 2026.
 *
 * Sign-in wording wins: the lockout keeps its minute count, and the limiter
 * pattern cannot swallow it.
 *
 * Lives here, not in i18n/translations.ts: this module already imports the i18n
 * barrel, so calling back into it from translations.ts would be an import cycle.
 */
export function localizeSignInError(
  message: string,
  t: Pick<AppTranslations, 'login' | 'errors'>,
): string {
  const trimmed = message.trim();
  const signInCopy = localizeLoginError(trimmed, t.login);
  // Changed = a sign-in sentence (or the empty-message fallback) was recognised.
  if (signInCopy !== trimmed) return signInCopy;
  return localizeApiError(trimmed, t.errors);
}
