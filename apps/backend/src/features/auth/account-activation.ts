/**
 * AN ACCOUNT WITH NO PASSWORD — and the only door that may turn it into one
 * that signs in.
 *
 * A roster STUB is `user.status = 'active'` with `password_hash IS NULL`.
 * `POST /pr` creates one when an agency adds a PR by phone or email, and
 * `/auth/register` creates one when an admin sends no password. Login refuses
 * it. What used to ACTIVATE it was a password reset: every reset path asked
 * only whether the account was active. And while the hash is null the CREATING
 * AGENCY may still correct the stub's sign-in email and phone
 * (`writeUnactivatedSignInContact`, pr.repository.ts) — so an agency could
 * point a stub at a mailbox or a number it holds, "reset" a password nobody
 * ever set, and own an account carrying the PR's legal name and IC. That
 * account signs payment vouchers.
 *
 * THE RULE (Fix First, 28 Sep 2026):
 *
 *  • NO RESET ACTIVATES AN ACCOUNT. The emailed link, the emailed / WhatsApped
 *    / SMSed code and the PR app's WhatsApp OTP all require a password ALREADY
 *    on file (`mayResetPassword`), and answer a stub exactly as they answer an
 *    address nobody registered — same status, same sentence, same timing.
 *  • THE ONE WAY IN FOR A STUB IS THE PR'S OWN SIGN-UP. Public PR registration
 *    already demands a verified WhatsApp OTP receipt for its phone, so a
 *    receipt for the stub's number now CLAIMS the stub (`isClaimablePrStub` +
 *    `receiptProvesPhoneAlone`) instead of being refused as "already
 *    registered", and the claimant chooses every sign-in contact the account
 *    keeps.
 *
 * ⚠️ What a claim proves is POSSESSION OF THE NUMBER on file, nothing more. The
 * agency typed that number, and until the claim it may still change it. An
 * agency that sets a stub's phone to a line it holds can claim the stub through
 * sign-up exactly as it could through a reset. What is closed is the EMAIL
 * side (a sign-up code for a stub goes to the phone alone) and every reset
 * path; what stays is the property the product needs — an invited PR joins by
 * proving the number she gave the agency.
 *
 * A leaf module (one constants import, no db), so the controllers of both
 * features and their tests share one definition.
 */
import { portalRoleName } from '@/types/rbac-constant.js';

/** The two columns activation is decided on. */
export type ActivationState = {
  status: string;
  passwordHash?: string | null;
};

/** Active, and never given a password — a roster stub nobody has claimed. */
export function isUnactivatedAccount(account: ActivationState | null | undefined): boolean {
  return Boolean(account && account.status.toLowerCase() === 'active' && !account.passwordHash);
}

/**
 * MAY A PASSWORD RESET FINISH ON THIS ACCOUNT? Only on an active one that
 * already HAS a password. A reset replaces a password; it never creates the
 * first one — that is a claim, and a claim goes through sign-up.
 *
 * A type guard, so a caller that answers "no" and returns can use the account
 * as non-null afterwards.
 */
export function mayResetPassword<T extends ActivationState>(
  account: T | null | undefined,
): account is T {
  return Boolean(account && account.status.toLowerCase() === 'active' && account.passwordHash);
}

/**
 * A stub a PR's OWN SIGN-UP may take over: never activated, and holding the
 * `pr` role and nothing else. An account with an organisation or admin role is
 * never claimable by a phone code — those are created with a password, and one
 * without is a fault to fix by hand, not a door to open.
 *
 * `roleNames` are the account's ACTIVE roles (`getRolesForUserIds`).
 */
export function isClaimablePrStub(
  account: ActivationState | null | undefined,
  roleNames: readonly string[],
): boolean {
  if (!isUnactivatedAccount(account)) return false;
  return roleNames.length > 0 && roleNames.every((name) => name === portalRoleName.PR);
}

/**
 * DID THIS SIGN-UP RECEIPT PROVE THE PHONE — AND ONLY THE PHONE?
 *
 * `phone_verification.channel` records where the code was sent
 * ('whatsapp,sms' or 'whatsapp,sms,email'). A sign-up code is ALSO emailed to
 * the address typed on the wizard, so a receipt whose code went to an email as
 * well proves possession of the phone OR that mailbox — and the mailbox is the
 * sign-up's own, typed by whoever is standing at the form. Good enough to
 * create a new account; never enough to take over a stub somebody else was
 * invited as. Such a receipt is refused for a claim, which closes the window of
 * a code emailed before the number became a stub.
 */
export function receiptProvesPhoneAlone(channel: string | null | undefined): boolean {
  const channels = (channel ?? '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  return (
    channels.length > 0 &&
    channels.every((part) => part === 'whatsapp' || part === 'sms')
  );
}
