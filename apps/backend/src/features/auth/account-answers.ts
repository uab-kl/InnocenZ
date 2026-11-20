/**
 * THE ANSWERS A STRANGER GETS — sign-in and sign-up, one sentence each.
 *
 * Owner, 29 Sep 2026 ("General message, both"): a public route must not tell
 * whoever is typing whether an email, a phone number or an ID number belongs
 * to an account. Sign-in and sign-up both used to: "This account is not
 * registered yet." against "Wrong password", and a sign-up 409 that named the
 * field — so every address and number on the platform could be tested one by
 * one, without an account and without knowing a password.
 *
 * The rule these encode: an answer may depend on an account existing only
 * after the caller has PROVED they own the thing being asked about — the right
 * password, or a code that reached the phone alone. Everyone else gets the same
 * sentence, whatever the rows say.
 *
 * Wire data: the web (`routes/login.tsx`, `landing-i18n/member-signup-refusal.ts`,
 * `components/auth/signup-form.tsx`) and the PR app (`i18n/translations.ts`
 * `localizeLoginError`, `lib/api-error-copy.ts`) translate these by their exact
 * English. Change a sentence only together with those maps.
 */

/*
 * ⚠️ SIGN-IN NO LONGER HIDES WHETHER AN ACCOUNT EXISTS (owner, 19 Nov 2026 —
 * reversing 29 Sep for SIGN-IN ONLY: "if no dont say wrong say account no
 * found, ask user to sign up as outlet or pr agency", then "2" = name the
 * missing account and the wrong password separately). Accepted trade-off:
 * anyone can now test whether an email or phone has an account by trying to
 * sign in. Sign-up, password reset and the emailed codes below keep the
 * one-answer rule. The unknown-identifier lockout and the refusal floor stay.
 */

/** An EMAIL sign-in with no usable account behind it (none, or a stub with no password yet). */
export const LOGIN_EMAIL_ACCOUNT_NOT_FOUND =
  'Account not found — please sign up as an Outlet or PR Agency';

/** A PHONE sign-in with no usable account — phone sign-in is the PR app's, so no organisation door. */
export const LOGIN_PHONE_ACCOUNT_NOT_FOUND = 'Account not found — please sign up first';

/** A sign-in to an account that exists, with the wrong password. */
export const LOGIN_WRONG_PASSWORD = 'Wrong password';

/**
 * The 29 Sep one-answer sentences. No longer SENT by this server; kept because
 * the web and the PR app still translate them for an older server that does.
 */
export const LOGIN_WRONG_EMAIL_OR_PASSWORD = 'Wrong email or password';
export const LOGIN_WRONG_PHONE_OR_PASSWORD = 'Wrong phone number or password';

/**
 * Any public sign-up that collides with an existing account — email, phone or
 * ID number — without saying which. It points at the two doors that help the
 * person who really is the owner: sign in, or reset the password.
 */
export const SIGNUP_NOT_COMPLETED =
  "We couldn't complete sign-up — if you already have an account, sign in or reset your password";

/**
 * A PR sign-up whose phone is taken, told so ONLY because its code reached the
 * phone alone (`receiptProvesPhoneAlone`): the person reading it has just
 * proved the number is theirs.
 */
export const SIGNUP_PHONE_HAS_ACCOUNT =
  'That phone number already has an account — sign in, or reset your password';

/**
 * The same, for the EMAIL of a venue, agency or team-member sign-up — said only
 * because the code emailed to that address was entered (owner, 30 Sep 2026:
 * proof before an organisation or member account is created).
 */
export const SIGNUP_EMAIL_HAS_ACCOUNT =
  'That email already has an account — sign in, or reset your password';

/*
 * THE EMAILED SIGN-UP CODE (`signup-email-code.ts`). Sent to whatever address is
 * typed, with the same answer whether or not it has an account — only whoever
 * reads that inbox can use it.
 */
export const SIGNUP_EMAIL_CODE_SENT =
  'We sent a 6-digit code to that email — it expires in 10 minutes';
export const SIGNUP_EMAIL_CODE_REQUIRED =
  'Verify your email first — we will send you a 6-digit code';
export const SIGNUP_EMAIL_CODE_EXPIRED = 'That code has expired — request a new one';
export const SIGNUP_EMAIL_CODE_SEND_FAILED =
  'Could not send the code — try again in a few minutes';
/** The phone code's own sentences, so a client translates one set. */
export const CODE_INVALID = 'Invalid code';
export const CODE_TOO_MANY_ATTEMPTS = 'Too many attempts — request a new code';

/** "Too many failed attempts. Try again in 3 minutes." — shared by real and unknown identifiers. */
export function lockedOutMessage(minutesLeft: number): string {
  return `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`;
}
