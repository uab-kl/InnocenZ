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
import { formatMessage, type AppTranslations } from '../i18n';

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
];

/**
 * The refusals that are about the CODE itself — wrong, expired, already spent,
 * or out of guesses — as opposed to a rate limiter or a send failure, which
 * leave a still-valid code standing. A screen clears the typed code (and sends
 * the PR back to the code step) only for these; for anything else the code she
 * typed is still good and retyping it would be busywork.
 */
const CODE_REJECTIONS: ReadonlySet<ErrorKey> = new Set<ErrorKey>([
  'invalidCode',
  'codeExpired',
  'changeExpired',
  'codeAlreadyUsed',
  'tooManyCodeAttempts',
]);

/** `Wait 42s before requesting another code` — the 429 resend cooldown. */
const CODE_COOLDOWN = /^Wait (\d+)\s*s(?:ec(?:ond)?s?)? before requesting another code$/i;

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
  return null;
}

/** True when a thrown message says the typed CODE is no good (see CODE_REJECTIONS). */
export function isCodeRejection(message: string): boolean {
  const key = matchCodeFlowError(message);
  return key !== null && CODE_REJECTIONS.has(key);
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

  const codeFlow = matchCodeFlowError(trimmed);
  if (codeFlow === 'codeCooldown') {
    const seconds = CODE_COOLDOWN.exec(trimmed.replace(/\.$/, ''));
    return formatMessage(errors.codeCooldown, { s: seconds?.[1] ?? '60' });
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
