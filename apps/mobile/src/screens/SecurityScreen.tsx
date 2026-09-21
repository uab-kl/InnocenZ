/**
 * Security settings — change password, change phone and change email, delete
 * account.
 *
 * EVERY credential change here is TWO calls and ONE code (owner, 21 Sep 2026:
 * "must be the same otp"), and every one of them starts with the CURRENT
 * PASSWORD:
 *
 *   password  1. start   { currentPassword }                → one code to the
 *                        phone AND the email already on file.
 *                resend  { requestId }                      → sent again.
 *             2. confirm { requestId, code, newPassword }   → writes it.
 *
 *   phone /   1. start   { kind, value, currentPassword }   → one code to the
 *   email               NEW contact AND the channel already on file.
 *                resend  { requestId, kind, value }         → sent again.
 *             2. confirm { kind, value, requestId, code }   → writes it.
 *
 * ⚠️ A RESEND ANSWERS A NEW `requestId` on both flows — the previous row is
 * retired as the next code goes out, so the id we hold must be REPLACED or the
 * confirm collects 'This code has expired'.
 *
 * ⚠️ NOTHING IS EVER SENT TO THE OLD PHONE OR OLD EMAIL — not a code, and not a
 * "your email was changed" notice afterwards. "Old" means the value being
 * REPLACED: a new email still copies the code to the phone on file, because
 * that phone is not what is changing.
 *
 * The password is what says the person holding this unlocked phone owns the
 * account; the code says she can read a channel the account owns. Neither alone
 * is enough, which is why the password change grew its second step today — the
 * current password on its own used to be the whole proof.
 *
 * Both steps of both flows show where the code went, using the server's masked
 * `sentTo`.
 *
 * ⚠️ Changing the password, the phone or the email re-issues the session token
 * and stamps a cutoff that refuses every older token. The new token is stored
 * BEFORE any other request (including refreshing the profile), and a failed
 * refresh afterwards never turns a change that SUCCEEDED into an error message.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, GRADIENTS, grad } from '../theme/theme';
import { font } from '../theme/fonts';
import { usePrNav } from '../lib/pr-nav';
import { useSession } from '../lib/session';
import { formatMessage, useLocale } from '../i18n';
import { useKeyboardInset } from '../lib/use-keyboard-inset';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ApiError,
  confirmContactChange,
  confirmPasswordChange,
  deleteOwnAccount,
  resendContactChangeNewCode,
  resendPasswordChangeCode,
  startContactChange,
  startPasswordChange,
  type CodeDelivery,
  type ContactKind,
} from '../lib/api';
import {
  isCodeRejection,
  isSessionRefusal,
  localizeApiError,
  matchCodeFlowError,
} from '../lib/api-error-copy';
import {
  codeReachedSomewhere,
  describeCodeDelivery,
  isCompleteCode,
  isPlausibleEmail,
  minutesFromSeconds,
  normalizeEmailInput,
  retryAfterSeconds,
} from '../lib/code-delivery';
import {
  loadPhoneCountryCode,
  localPhoneDigits,
  phoneLoginIdentifier,
  savePhoneCountryCode,
} from '../lib/phone-prefs';
import { ChevronLeft, Eye, EyeOff, Lock, Mail, Phone, Shield, Trash2 } from '../components/icons';
import { COUNTRY_BY_CODE, COUNTRY_DIAL_OPTIONS } from './sign-up/constants';
import { Picker } from './sign-up/fields';
import { normalizeOtpInput } from './sign-up/step-6';

type Sheet =
  | null
  | 'menu'
  /** Password step 1 — the current password, and the new one twice. */
  | 'password'
  /** Password step 2 — the code sent to the contacts ALREADY on file. */
  | 'passwordCode'
  /** Step 1 — the new phone / email, and the current password. */
  | 'contact'
  /** Step 2 — the code sent to the NEW contact. */
  | 'newCode'
  | 'delete'
  /**
   * Sign in again: a change was SAVED but no fresh session came back, or the
   * server refused the session itself (401 Unauthorized) and nothing was saved.
   */
  | 'signInAgain';

/** What was just changed, when the PR has to sign in again afterwards. */
type ChangedCredential = 'password' | ContactKind;

/**
 * Why the PR has to sign in again: a credential that WAS changed, or
 * `sessionEnded` — the token was refused before anything was written.
 */
type SignInReason = ChangedCredential | 'sessionEnded';

const DIAL_PICKER_OPTIONS = COUNTRY_DIAL_OPTIONS.map((c) => ({
  value: c.countryCode,
  label: c.label,
  flag: c.flag,
  name: c.name,
  meta: c.dialCode,
}));

/** The server's password cap (bcrypt reads at most 72 bytes). */
const PASSWORD_MAX = 72;

export function SecurityScreen() {
  const { goBack } = usePrNav();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  const { me, token, signOut, refreshMe, adoptToken } = useSession();
  const [sheet, setSheet] = useState<Sheet>('menu');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Backdrop tap / hardware back while a code is outstanding asks first. */
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  /**
   * Set when a change committed but the answer carried no token. A flag, not a
   * sentence, so the line follows a locale switch.
   */
  const [signInAfter, setSignInAfter] = useState<SignInReason | null>(null);

  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [deletePw, setDeletePw] = useState('');
  const [showDeletePw, setShowDeletePw] = useState(false);

  /*
   * ── The password change's own code row ──────────────────────────────────
   *
   * Deliberately NOT the contact flow's `requestId` / `sentTo` / `code`, even
   * though only one sheet is ever open: the two codes are bound to different
   * things server-side (this one to the account, the other to a kind + value),
   * and one shared box is how a password's id ends up posted to a contact
   * confirm — refused, and unreadable from the screen. The same reasoning that
   * gave `contactPw` its own state instead of borrowing `curPw`.
   *
   * `resendIn` IS shared: it is one countdown driven by one timer, and both
   * flows write it from their own server answer as they open.
   */
  const [pwRequestId, setPwRequestId] = useState<string | null>(null);
  /** Where the password code went — the contacts ALREADY on file, masked. */
  const [pwSentTo, setPwSentTo] = useState<CodeDelivery[]>([]);
  const [pwExpiresInSec, setPwExpiresInSec] = useState(600);
  const [pwCode, setPwCode] = useState('');

  const [contactKind, setContactKind] = useState<ContactKind>('phone');
  const [phoneCountryCode, setPhoneCountryCode] = useState(loadPhoneCountryCode);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [emailInput, setEmailInput] = useState('');
  /**
   * The current password, typed on the CONTACT sheet — its own state, never
   * `curPw`, which belongs to the password sheet and is cleared on a different
   * schedule. Sharing one box would leave a password behind one sheet after the
   * other cleared it, and clear it under the PR mid-flow.
   *
   * ⚠️ Deliberately NOT cleared by `resetContactFlow`: that also runs when a
   * taken address sends her back to step 1 to pick another value, and making
   * her retype the password for the server's own refusal is busywork.
   */
  const [contactPw, setContactPw] = useState('');
  /**
   * The normalised new value, frozen when step 1 succeeds. Both calls must send
   * the SAME value (the server binds the code to it), so step 2 never re-reads
   * the text boxes.
   */
  const [pendingValue, setPendingValue] = useState('');
  /**
   * The open code row. ⚠️ A RESEND ANSWERS A NEW ONE and this must be replaced
   * with it — the server retires the previous row as it sends, so confirming
   * with the old id collects "This code has expired".
   */
  const [requestId, setRequestId] = useState<string | null>(null);
  /** Where the code went — the NEW contact, masked by the server. */
  const [sentTo, setSentTo] = useState<CodeDelivery[]>([]);
  const [expiresInSec, setExpiresInSec] = useState(600);
  const [pendingInvites, setPendingInvites] = useState(0);
  const [code, setCode] = useState('');
  const [resendIn, setResendIn] = useState(0);

  const localDigits = useMemo(() => localPhoneDigits(phoneNumber), [phoneNumber]);
  const country = COUNTRY_BY_CODE[phoneCountryCode];
  const fullPhone = phoneLoginIdentifier(phoneCountryCode, phoneNumber);
  const closedDialLabel = country
    ? `${country.flag ? `${country.flag} ` : ''}${country.dialCode}`
    : null;

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const describeError = (e: unknown, fallback: string) =>
    e instanceof ApiError ? localizeApiError(e.message, t.errors) : fallback;

  /**
   * The server refused the SESSION, not the request — an expired token, or the
   * cutoff a password / phone / email change on another device stamps. Every
   * later call here would be refused the same way, and this app has no global
   * sign-out on a 401, so printing "Unauthorized" would leave her retrying a
   * screen that can never work. Status AND sentence: a mistyped password on
   * delete is also a 401, and must stay an error line she can fix.
   */
  const sessionRefused = (e: unknown) =>
    e instanceof ApiError && isSessionRefusal(e.status, e.message);

  /** A 429 cooldown carries how long to wait — start the resend countdown from it. */
  const noteCooldown = (e: unknown) => {
    const wait = retryAfterSeconds(e);
    if (wait) setResendIn(wait);
  };

  const closeAll = () => {
    if (signInAfter) {
      signOut();
      return;
    }
    setSheet(null);
    goBack();
  };

  /**
   * The change is SAVED, but the answer carried no fresh token. The token in
   * hand was refused the moment the change stamped the session cutoff, and this
   * app has no global sign-out on a 401 — keeping it would leave every later
   * screen failing quietly. Say it worked, then sign out on her next tap.
   */
  const requireSignInAgain = (reason: SignInReason) => {
    setConfirmDiscard(false);
    setError(null);
    setMsg(null);
    if (reason === 'sessionEnded') {
      // Nothing was saved; drop what she typed rather than leave it behind the sheet.
      clearTypedPasswords();
      setDeletePw('');
      // The contact sheet's password goes too — resetContactFlow keeps it on
      // purpose (see contactPw), but a dead session is not a recoverable step.
      setContactPw('');
      resetContactFlow();
      resetPasswordFlow();
    }
    setSignInAfter(reason);
    setSheet('signInAgain');
  };

  const changedLine = (reason: SignInReason) =>
    reason === 'sessionEnded'
      ? t.security.sessionEnded
      : reason === 'password'
        ? t.security.passwordUpdated
        : reason === 'email'
          ? t.security.emailUpdated
          : t.security.phoneUpdated;

  /**
   * ⚠️ Leaves `contactPw` alone. This also runs when the server refuses the new
   * value (taken since she started) and sends her back to step 1 to pick
   * another — her password is still right, and clearing it there is busywork.
   * The places that must drop it clear it themselves.
   */
  const resetContactFlow = () => {
    setPendingValue('');
    setRequestId(null);
    setSentTo([]);
    setPendingInvites(0);
    setCode('');
    setResendIn(0);
  };

  /**
   * Drops the open password code row. Leaves the TYPED PASSWORDS alone on
   * purpose — the places that must drop those (success, discard, a dead
   * session) clear them themselves, and one of this function's callers is the
   * server sending her back to step 1 to choose a different new password.
   */
  const resetPasswordFlow = () => {
    setPwRequestId(null);
    setPwSentTo([]);
    setPwCode('');
    setResendIn(0);
  };

  /** Everything typed into the password sheet. */
  const clearTypedPasswords = () => {
    setCurPw('');
    setNewPw('');
    setConfirmPw('');
  };

  /** A code is outstanding — closing the sheet would throw it away. */
  const codeOutstanding = sheet === 'newCode' || sheet === 'passwordCode';

  const requestCloseSheet = () => {
    if (signInAfter) {
      signOut();
      return;
    }
    if (busy) return;
    if (codeOutstanding) {
      setConfirmDiscard(true);
      return;
    }
    setSheet(null);
  };

  const openContact = (kind: ContactKind) => {
    resetContactFlow();
    setContactKind(kind);
    setPhoneNumber('');
    setEmailInput('');
    // A fresh change starts with an empty password box, never one left over
    // from the change before it.
    setContactPw('');
    setError(null);
    setMsg(null);
    setSheet('contact');
  };

  /**
   * Open the password sheet fresh. Never inherits a code row or a password from
   * the change before it — a stale `pwRequestId` would be confirmed against a
   * code that no longer exists.
   */
  const openPassword = () => {
    resetPasswordFlow();
    clearTypedPasswords();
    setError(null);
    setMsg(null);
    setSheet('password');
  };

  /**
   * What the PR can be told BEFORE the server is asked: the new password's
   * shape, and that it differs from the current one. Returns the sentence, or
   * null when there is nothing to say.
   *
   * ⚠️ The "must differ" check is the only place this comparison can be made
   * cheaply. `confirm` carries no current password, so the server has to
   * compare against the stored HASH and can only refuse at the very end, after
   * a code has been sent and typed. Catching it here saves that whole round.
   */
  const newPasswordProblem = (): string | null => {
    if (newPw.length < 6) return t.security.passwordMin;
    if (newPw.length > PASSWORD_MAX) return t.security.passwordMax;
    if (newPw !== confirmPw) return t.security.passwordMismatch;
    if (newPw === curPw) return t.errors.passwordMustDiffer;
    return null;
  };

  /**
   * Password step 1: the current password proves it is her, and the server
   * sends ONE code to the phone AND the email on file.
   *
   * The new password is validated here but NOT sent — it travels with the code
   * on confirm. A refusal keeps her on this sheet: every one of them is about
   * something in front of her (the current password, a lockout, a cooldown, or
   * an account with nowhere to send a code).
   */
  const sendPasswordCode = async () => {
    if (!token || busy) return;
    if (!curPw) {
      setError(t.errors.currentPasswordRequired);
      return;
    }
    const problem = newPasswordProblem();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await startPasswordChange(token, curPw);
      setPwRequestId(res.requestId);
      setPwSentTo(res.sentTo ?? []);
      setPwExpiresInSec(res.expiresInSec ?? 600);
      setResendIn(res.resendAfterSec ?? 60);
      setPwCode('');
      setSheet('passwordCode');
    } catch (e) {
      /*
       * ⚠️ A WRONG PASSWORD IS 400, NOT 401 — deliberately, and
       * `isSessionRefusal` checks the sentence as well as the status, so
       * 'Current password is incorrect' falls through to the error line below
       * instead of signing her out over a typo.
       */
      if (sessionRefused(e)) {
        requireSignInAgain('sessionEnded');
        return;
      }
      noteCooldown(e);
      setError(describeError(e, t.security.sendCodeFailed));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Another code to the same contacts. No password — the `requestId` is the
   * proof, exactly as the contact flow's resend works.
   *
   * ⚠️ THE ANSWER CARRIES A NEW `requestId` AND IT REPLACES THE OLD ONE.
   */
  const resendPasswordCode = async () => {
    if (!token || !pwRequestId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await resendPasswordChangeCode(token, { requestId: pwRequestId });
      setPwRequestId(res.requestId);
      setPwSentTo(res.sentTo ?? []);
      setPwExpiresInSec(res.expiresInSec ?? 600);
      setResendIn(res.resendAfterSec ?? 60);
      setPwCode('');
    } catch (e) {
      if (sessionRefused(e)) {
        requireSignInAgain('sessionEnded');
        return;
      }
      noteCooldown(e);
      setError(describeError(e, t.security.sendCodeFailed));
    } finally {
      setBusy(false);
    }
  };

  /** Password step 2: the code and the new password together — writes it. */
  const confirmNewPassword = async () => {
    if (!token || !pwRequestId || !isCompleteCode(pwCode) || busy) return;
    setBusy(true);
    setError(null);
    let issued: Awaited<ReturnType<typeof confirmPasswordChange>>;
    try {
      issued = await confirmPasswordChange(token, {
        requestId: pwRequestId,
        code: pwCode,
        newPassword: newPw,
      });
    } catch (e) {
      setBusy(false);
      if (sessionRefused(e)) {
        requireSignInAgain('sessionEnded');
        return;
      }
      const message = e instanceof ApiError ? e.message : '';
      const refusal = message ? matchCodeFlowError(message) : null;
      const failed = describeError(e, t.security.updatePasswordFailed);
      /*
       * A refusal about the NEW PASSWORD, not about the code — 'New password
       * must be different' (the server compares against the stored hash,
       * because confirm carries no current password) and the two length
       * bounds. The field it names is on the FIRST sheet, so that is where she
       * is sent, and the code row is dropped rather than left dangling: we
       * cannot know from here whether the server spent it before or after this
       * check, and offering a code that may already be used is worse than
       * sending a fresh one.
       */
      if (
        refusal === 'passwordMustDiffer' ||
        refusal === 'passwordMinLength' ||
        refusal === 'passwordMaxLength'
      ) {
        resetPasswordFlow();
        setError(failed);
        setSheet('password');
        return;
      }
      // Only a refusal about the code clears it; a limiter's 429 leaves it valid.
      if (isCodeRejection(message)) setPwCode('');
      setError(failed);
      return;
    }
    /*
     * ⚠️ STORE THE RE-ISSUED TOKEN FIRST. The change stamped a session cutoff,
     * so the token that made the call is refused from here on; any request sent
     * with it would collect a 401 under a password that DID change.
     */
    const accessToken = issued?.accessToken ?? null;
    if (accessToken) adoptToken(accessToken);
    resetPasswordFlow();
    clearTypedPasswords();
    setBusy(false);
    if (!accessToken) {
      // Changed, but no token to carry on with — the old one is already dead.
      requireSignInAgain('password');
      return;
    }
    setSheet(null);
    setMsg(t.security.passwordUpdated);
    // Pass the new token explicitly — adoptToken's state is not visible until
    // the next render. A failed refresh is not a failed change: stay quiet.
    void refreshMe(accessToken).catch(() => undefined);
  };

  /**
   * Step 1: the current password, and one code to the NEW contact.
   *
   * A refusal keeps her on the contact sheet — every one of them is about
   * something in front of her (the password, the value, a cooldown), and the
   * value she typed is still in the box to correct.
   */
  const requestNewContactCode = async (kind: ContactKind, value: string) => {
    if (!token || busy || !value || !contactPw) return;
    setBusy(true);
    setError(null);
    try {
      const res = await startContactChange(token, kind, value, contactPw);
      setPendingValue(value);
      setRequestId(res.requestId);
      setSentTo(res.sentTo ?? []);
      setExpiresInSec(res.expiresInSec ?? 600);
      setResendIn(res.resendAfterSec ?? 60);
      setPendingInvites(kind === 'email' ? res.pendingInvitesToCurrentEmail ?? 0 : 0);
      setCode('');
      setSheet('newCode');
    } catch (e) {
      /*
       * ⚠️ A WRONG PASSWORD IS 400, NOT 401 — the server says so deliberately,
       * and `isSessionRefusal` checks the sentence as well as the status, so
       * 'Current password is incorrect' falls through to the error line below
       * instead of signing her out over a typo.
       */
      if (sessionRefused(e)) {
        requireSignInAgain('sessionEnded');
        return;
      }
      noteCooldown(e);
      setError(describeError(e, t.security.sendCodeFailed));
    } finally {
      setBusy(false);
    }
  };

  const startChange = () => {
    if (!contactPw) return;
    if (contactKind === 'phone') {
      if (!localDigits) return;
      savePhoneCountryCode(phoneCountryCode);
      void requestNewContactCode('phone', `+${fullPhone.replace(/^\+/, '')}`);
      return;
    }
    const value = normalizeEmailInput(emailInput);
    if (!value) return;
    if (!isPlausibleEmail(value)) {
      setError(t.profile.emailInvalid);
      return;
    }
    void requestNewContactCode('email', value);
  };

  /**
   * Another code to the same new contact. No password — the `requestId` is the
   * proof, and asking again would mean holding her password behind the code
   * sheet for the whole flow.
   *
   * ⚠️ THE ANSWER CARRIES A NEW `requestId` AND IT REPLACES THE OLD ONE. The
   * server retires the previous row as it sends the next code, so confirming
   * with the id we arrived holding would be refused as expired.
   */
  const resendNewCode = async () => {
    if (!token || !requestId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await resendContactChangeNewCode(token, {
        requestId,
        kind: contactKind,
        value: pendingValue,
      });
      setRequestId(res.requestId);
      setSentTo(res.sentTo ?? []);
      setExpiresInSec(res.expiresInSec ?? 600);
      setResendIn(res.resendAfterSec ?? 60);
      setCode('');
    } catch (e) {
      if (sessionRefused(e)) {
        requireSignInAgain('sessionEnded');
        return;
      }
      const message = e instanceof ApiError ? e.message : '';
      const refusal = message ? matchCodeFlowError(message) : null;
      if (refusal === 'emailTaken' || refusal === 'phoneTaken') {
        // Taken while she waited. No code can fix that: back to step 1, with her
        // password still typed, to choose another value.
        resetContactFlow();
        setError(describeError(e, t.security.sendCodeFailed));
        setSheet('contact');
        return;
      }
      noteCooldown(e);
      setError(describeError(e, t.security.sendCodeFailed));
    } finally {
      setBusy(false);
    }
  };

  /** Step 2: the new contact's code — writes the change. */
  const confirmChange = async () => {
    if (!token || !requestId || !isCompleteCode(code) || busy) return;
    const kind = contactKind;
    setBusy(true);
    setError(null);
    let result: Awaited<ReturnType<typeof confirmContactChange>>;
    try {
      result = await confirmContactChange(token, {
        requestId,
        kind,
        value: pendingValue,
        code,
      });
    } catch (e) {
      // 401 is answered before the write: nothing changed, the session did.
      if (sessionRefused(e)) {
        setBusy(false);
        requireSignInAgain('sessionEnded');
        return;
      }
      const message = e instanceof ApiError ? e.message : '';
      const refusal = message ? matchCodeFlowError(message) : null;
      const failed = describeError(
        e,
        kind === 'email' ? t.security.updateEmailFailed : t.security.updatePhoneFailed,
      );
      if (refusal === 'emailTaken' || refusal === 'phoneTaken') {
        // Taken since step 1 — back there to choose another (password kept).
        resetContactFlow();
        setError(failed);
        setSheet('contact');
        setBusy(false);
        return;
      }
      // Only a refusal about the code clears it; a limiter's 429 leaves it valid.
      if (isCodeRejection(message)) setCode('');
      setError(failed);
      setBusy(false);
      return;
    }
    /*
     * ⚠️ ADOPT THE NEW TOKEN BEFORE ANYTHING ELSE TOUCHES THE API.
     *
     * The write has already committed, and the token in hand is now dead twice
     * over: a phone- or email-keyed token names a contact no row carries any
     * more, and the server stamped a session cutoff that refuses every token
     * issued before it. Sending it again would print an error under a change
     * that SUCCEEDED.
     */
    const accessToken = result?.accessToken ?? null;
    if (accessToken) adoptToken(accessToken);
    resetContactFlow();
    setPhoneNumber('');
    setEmailInput('');
    // The change is written — the password has nothing left to prove here.
    setContactPw('');
    setBusy(false);
    if (!accessToken) {
      // Changed, but no token to carry on with — the old one is already dead.
      requireSignInAgain(kind);
      return;
    }
    setSheet(null);
    setMsg(kind === 'email' ? t.security.emailUpdated : t.security.phoneUpdated);
    /*
     * ⚠️ PASS THE NEW TOKEN EXPLICITLY — adoptToken sets React state, which a
     * bare refreshMe() would not see until the next render. And swallow its
     * failure: the change is done, and a refresh that trips on a network blip
     * must not paint "could not update" over it. The next screen load refetches.
     */
    void refreshMe(accessToken).catch(() => undefined);
  };

  const deleteAccount = async () => {
    if (!token || !me || busy) return;
    if (!deletePw.trim()) {
      setError(t.security.deleteAccountPassword);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteOwnAccount(token, me.id, deletePw);
      setSheet(null);
      setDeletePw('');
      await signOut();
    } catch (e) {
      // Only the session refusal. A wrong password here is ALSO a 401
      // ("Incorrect password") and stays an error line she can correct.
      if (sessionRefused(e)) {
        requireSignInAgain('sessionEnded');
        return;
      }
      setError(describeError(e, t.security.deleteAccountFailed));
    } finally {
      setBusy(false);
    }
  };

  const resendLabel = busy
    ? t.forgot.sending
    : resendIn > 0
      ? formatMessage(t.forgot.resendIn, { s: resendIn })
      : t.forgot.resend;

  const codeValidLine = formatMessage(t.security.codeValidFor, {
    m: minutesFromSeconds(expiresInSec),
  });

  /** The password code's own TTL — its own server answer, its own line. */
  const pwCodeValidLine = formatMessage(t.security.codeValidFor, {
    m: minutesFromSeconds(pwExpiresInSec),
  });

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <Pressable style={styles.back} onPress={closeAll} hitSlop={10}>
        <ChevronLeft size={20} color={C.goldL} />
        <Text style={styles.backText}>{t.nav.profile}</Text>
      </Pressable>

      <Text style={styles.eyebrow}>{t.security.eyebrow}</Text>
      <View style={styles.titleRow}>
        <Shield size={22} color={C.accent} />
        <Text style={styles.title}>{t.security.title}</Text>
      </View>
      <Text style={styles.meta}>
        {t.security.intro}
        {me?.phoneNum
          ? ` ${formatMessage(t.security.currentPhone, { phone: me.phoneNum })}`
          : ''}
        {me?.email ? ` ${formatMessage(t.security.currentEmail, { email: me.email })}` : ''}
      </Text>

      {msg ? <Text style={styles.toast}>{msg}</Text> : null}

      <Pressable
        style={styles.card}
        onPress={() => {
          setConfirmDiscard(false);
          setSheet('menu');
        }}
      >
        <Lock size={18} color={C.goldL} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{t.security.title}</Text>
          <Text style={styles.cardSub}>
            {t.security.changePassword} · {t.security.changePhone} · {t.security.changeEmail}
          </Text>
        </View>
      </Pressable>

      <Pressable
        style={[styles.card, styles.dangerCard]}
        onPress={() => {
          setError(null);
          setDeletePw('');
          setConfirmDiscard(false);
          setSheet('delete');
        }}
      >
        <Trash2 size={18} color={C.red} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: C.red }]}>{t.security.deleteAccount}</Text>
          <Text style={styles.cardSub}>{t.security.deleteAccountConfirm}</Text>
        </View>
      </Pressable>

      <Modal
        visible={sheet !== null}
        transparent
        animationType="slide"
        onRequestClose={requestCloseSheet}
      >
        <Pressable style={styles.backdrop} onPress={requestCloseSheet}>
          <Pressable
            style={[styles.sheet, keyboardInset > 0 && { paddingBottom: keyboardInset + 16 }]}
            onPress={(e) => e.stopPropagation()}
          >
            {confirmDiscard && (
              <>
                <Text style={styles.sheetTitle}>{t.common.discardTitle}</Text>
                <Text style={styles.sheetHint}>{t.common.discardBody}</Text>
                <Pressable
                  style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
                  onPress={() => setConfirmDiscard(false)}
                >
                  <Text style={styles.primaryText}>{t.common.keepGoing}</Text>
                </Pressable>
                <Pressable
                  style={styles.sheetCancel}
                  onPress={() => {
                    setConfirmDiscard(false);
                    resetContactFlow();
                    resetPasswordFlow();
                    // Leaving the flow entirely — every password typed into it
                    // goes with it, on both flows.
                    setContactPw('');
                    clearTypedPasswords();
                    setError(null);
                    setSheet(null);
                  }}
                >
                  <Text style={styles.leaveText}>{t.common.leave}</Text>
                </Pressable>
              </>
            )}

            {!confirmDiscard && sheet === 'menu' && (
              <>
                <Text style={styles.sheetTitle}>{t.security.title}</Text>
                <MenuRow
                  icon={Lock}
                  label={t.security.changePassword}
                  onPress={openPassword}
                />
                <MenuRow
                  icon={Phone}
                  label={t.security.changePhone}
                  onPress={() => openContact('phone')}
                />
                <MenuRow
                  icon={Mail}
                  label={t.security.changeEmail}
                  onPress={() => openContact('email')}
                />
                <Pressable style={styles.sheetCancel} onPress={() => setSheet(null)}>
                  <Text style={styles.sheetCancelText}>{t.common.close}</Text>
                </Pressable>
              </>
            )}

            {!confirmDiscard && sheet === 'password' && (
              <>
                <Text style={styles.sheetTitle}>{t.security.changePassword}</Text>
                <Text style={styles.sheetHint}>{t.security.changePasswordHint}</Text>
                <Field
                  label={t.security.currentPassword}
                  value={curPw}
                  onChange={setCurPw}
                  secure
                  autoComplete="current-password"
                  maxLength={PASSWORD_MAX}
                  testID="security-current-password"
                />
                <Field
                  label={t.security.newPassword}
                  value={newPw}
                  onChange={setNewPw}
                  secure
                  autoComplete="new-password"
                  maxLength={PASSWORD_MAX}
                  testID="security-new-password"
                />
                <Field
                  label={t.security.confirmPassword}
                  value={confirmPw}
                  onChange={setConfirmPw}
                  secure
                  autoComplete="new-password"
                  maxLength={PASSWORD_MAX}
                  testID="security-confirm-password"
                />
                {error ? <Text style={styles.sheetError}>{error}</Text> : null}
                <Pressable
                  style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
                  onPress={() => void sendPasswordCode()}
                  disabled={busy || !curPw || !newPw || !confirmPw}
                >
                  <Text style={styles.primaryText}>
                    {busy ? t.forgot.sending : t.security.sendOtp}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.sheetCancel}
                  onPress={() => {
                    setError(null);
                    setSheet('menu');
                  }}
                  disabled={busy}
                >
                  <Text style={styles.sheetCancelText}>{t.common.back}</Text>
                </Pressable>
              </>
            )}

            {!confirmDiscard && sheet === 'passwordCode' && (
              <>
                <Text style={styles.sheetTitle}>{t.security.passwordCodeTitle}</Text>
                <Text style={codeReachedSomewhere(pwSentTo) ? styles.sentTo : styles.notSent}>
                  {describeCodeDelivery(pwSentTo, t.security)}
                </Text>
                <Text style={styles.sheetHint}>{pwCodeValidLine}</Text>
                <Field
                  label={t.security.otpLabel}
                  value={pwCode}
                  onChange={(v) => setPwCode(normalizeOtpInput(v))}
                  keyboardType="number-pad"
                  maxLength={6}
                  testID="security-password-code"
                />
                {error ? <Text style={styles.sheetError}>{error}</Text> : null}
                <Pressable
                  style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
                  onPress={() => void confirmNewPassword()}
                  disabled={busy || !pwRequestId || !isCompleteCode(pwCode)}
                >
                  <Text style={styles.primaryText}>
                    {busy ? t.forgot.saving : t.security.verifyAndSave}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.sheetCancel}
                  onPress={() => resendIn === 0 && void resendPasswordCode()}
                  disabled={resendIn > 0 || busy}
                >
                  <Text style={styles.sheetCancelText}>{resendLabel}</Text>
                </Pressable>
                {/*
                 * Back to step 1 with the code row dropped — the same "start
                 * again" the contact flow offers. The typed passwords stay: she
                 * is correcting one of them, not abandoning the change.
                 */}
                <Pressable
                  style={styles.sheetCancel}
                  onPress={() => {
                    resetPasswordFlow();
                    setError(null);
                    setSheet('password');
                  }}
                  disabled={busy}
                >
                  <Text style={styles.sheetCancelText}>{t.security.startAgain}</Text>
                </Pressable>
              </>
            )}

            {!confirmDiscard && sheet === 'contact' && (
              <>
                <Text style={styles.sheetTitle}>
                  {contactKind === 'email' ? t.security.changeEmail : t.security.changePhone}
                </Text>
                <Text style={styles.sheetHint}>
                  {contactKind === 'email'
                    ? t.security.changeEmailHint
                    : t.security.changePhoneHint}
                </Text>
                {contactKind === 'phone' ? (
                  <>
                    <Text style={styles.fieldLabel}>{t.security.newMobileNumber}</Text>
                    <View style={styles.phoneRow}>
                      <Picker
                        value={phoneCountryCode}
                        options={DIAL_PICKER_OPTIONS}
                        onSelect={(next) => {
                          setPhoneCountryCode(next);
                          savePhoneCountryCode(next);
                        }}
                        width={118}
                        placeholder={t.login.dialCode}
                        displayValue={closedDialLabel}
                        title={t.login.dialTitle}
                        searchable
                      />
                      <TextInput
                        style={[styles.input, styles.phoneInput]}
                        value={phoneNumber}
                        onChangeText={setPhoneNumber}
                        placeholder="123456789"
                        placeholderTextColor={C.muted2}
                        keyboardType="phone-pad"
                        autoCapitalize="none"
                        // Off for the same reason as the email box above: `tel` is
                        // also a username token, and this sits over a password too.
                        autoComplete="off"
                        nativeID="innocenz-new-phone"
                        textContentType="none"
                      />
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.fieldLabel}>{t.security.newEmail}</Text>
                    <TextInput
                      style={styles.input}
                      value={emailInput}
                      onChangeText={setEmailInput}
                      placeholder="you@example.com"
                      placeholderTextColor={C.muted2}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      /*
                       * ⚠️ `off`, AND NOT `email` — the second attempt at this bug.
                       *
                       * On Expo web a browser filled this box with `188716214`, the
                       * owner's phone without its country code, and filled the
                       * password box below it at the same time. That pair is the
                       * tell: it is Chrome's PASSWORD MANAGER restoring a saved
                       * login for localhost:8081, not stray form history. The PR
                       * app's sign-in splits the number into a dial picker and
                       * local digits, so the credential Chrome saved has
                       * `188716214` as its username.
                       *
                       * Marking this box `email` made it WORSE: `email` is a
                       * username token, so it told Chrome this was the username
                       * field of a login form and invited the fill. `off` plus an
                       * id of its own takes it out of the running instead.
                       *
                       * The app state was empty throughout — `openContact` clears
                       * it on every open. Nothing here is ever the account's data.
                       */
                      autoComplete="off"
                      nativeID="innocenz-new-email"
                      textContentType="none"
                      maxLength={254}
                    />
                  </>
                )}
                {/*
                 * The proof that replaced the code to the old contact. Its own
                 * state, and the same Field the password sheet uses — one look
                 * and one cap (bcrypt's 72 bytes) for the same thing.
                 */}
                <Field
                  label={t.security.currentPassword}
                  value={contactPw}
                  onChange={setContactPw}
                  secure
                  autoComplete="current-password"
                  maxLength={PASSWORD_MAX}
                  testID="security-contact-password"
                />
                {error ? <Text style={styles.sheetError}>{error}</Text> : null}
                <Pressable
                  style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
                  onPress={startChange}
                  disabled={
                    busy ||
                    !contactPw ||
                    (contactKind === 'phone' ? !localDigits : !emailInput.trim())
                  }
                >
                  <Text style={styles.primaryText}>
                    {busy ? t.forgot.sending : t.security.sendOtp}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.sheetCancel}
                  onPress={() => {
                    setError(null);
                    setSheet('menu');
                  }}
                  disabled={busy}
                >
                  <Text style={styles.sheetCancelText}>{t.common.back}</Text>
                </Pressable>
              </>
            )}

            {!confirmDiscard && sheet === 'newCode' && (
              <>
                <Text style={styles.sheetTitle}>
                  {contactKind === 'email'
                    ? t.security.newEmailCodeTitle
                    : t.security.newPhoneCodeTitle}
                </Text>
                <Text style={codeReachedSomewhere(sentTo) ? styles.sentTo : styles.notSent}>
                  {describeCodeDelivery(sentTo, t.security)}
                </Text>
                <Text style={styles.sheetHint}>{codeValidLine}</Text>
                {/*
                 * ⚠️ THE INVITATION WARNING LIVES HERE NOW. It used to render on
                 * the identity sheet, which is gone — left there it would simply
                 * never be seen, and a PR would lose invitations she was never
                 * told about. Email only: `pendingInvites` is zeroed for a phone
                 * change, but the guard says so at the render site too.
                 */}
                {contactKind === 'email' && pendingInvites > 0 ? (
                  <Text style={styles.warning}>
                    {formatMessage(t.security.pendingInvites, { n: pendingInvites })}
                  </Text>
                ) : null}
                <Field
                  label={t.security.otpLabel}
                  value={code}
                  onChange={(v) => setCode(normalizeOtpInput(v))}
                  keyboardType="number-pad"
                  maxLength={6}
                  testID="security-contact-code"
                />
                {error ? <Text style={styles.sheetError}>{error}</Text> : null}
                <Pressable
                  style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
                  onPress={() => void confirmChange()}
                  disabled={busy || !requestId || !isCompleteCode(code)}
                >
                  <Text style={styles.primaryText}>
                    {busy ? t.forgot.saving : t.security.verifyAndSave}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.sheetCancel}
                  onPress={() => resendIn === 0 && void resendNewCode()}
                  disabled={resendIn > 0 || busy}
                >
                  <Text style={styles.sheetCancelText}>{resendLabel}</Text>
                </Pressable>
                <Pressable
                  style={styles.sheetCancel}
                  onPress={() => {
                    resetContactFlow();
                    setError(null);
                    setSheet('contact');
                  }}
                  disabled={busy}
                >
                  <Text style={styles.sheetCancelText}>{t.security.startAgain}</Text>
                </Pressable>
              </>
            )}

            {!confirmDiscard && sheet === 'signInAgain' && signInAfter && (
              <>
                <Text style={styles.sheetTitle}>{t.security.signInAgain}</Text>
                {/* Green only for a change that WAS saved; amber when nothing was. */}
                <Text style={signInAfter === 'sessionEnded' ? styles.warning : styles.sentTo}>
                  {changedLine(signInAfter)}
                </Text>
                <Text style={styles.sheetHint}>{t.security.signInAgainBody}</Text>
                <Pressable
                  style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
                  onPress={() => signOut()}
                >
                  <Text style={styles.primaryText}>{t.security.signInAgain}</Text>
                </Pressable>
              </>
            )}

            {!confirmDiscard && sheet === 'delete' && (
              <>
                <Text style={styles.sheetTitle}>{t.security.deleteAccountTitle}</Text>
                <Text style={styles.sheetHint}>{t.security.deleteAccountHint}</Text>
                <View style={styles.revealRow}>
                  <TextInput
                    style={[styles.input, styles.revealInput]}
                    value={deletePw}
                    onChangeText={setDeletePw}
                    placeholder={t.security.deleteAccountPassword}
                    placeholderTextColor={C.muted2}
                    secureTextEntry={!showDeletePw}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="current-password"
                    testID="security-delete-password"
                  />
                  <Pressable
                    style={styles.revealEye}
                    onPress={() => setShowDeletePw((v) => !v)}
                    hitSlop={10}
                    accessibilityLabel={showDeletePw ? t.login.hidePassword : t.login.showPassword}
                  >
                    {showDeletePw ? <EyeOff size={17} color={C.muted2} /> : <Eye size={17} color={C.muted2} />}
                  </Pressable>
                </View>
                {error ? <Text style={styles.sheetError}>{error}</Text> : null}
                <Pressable
                  style={[styles.dangerBtn, busy && { opacity: 0.6 }]}
                  onPress={() => void deleteAccount()}
                  disabled={busy}
                >
                  <Text style={styles.dangerBtnText}>
                    {busy ? '…' : t.security.deleteAccountConfirm}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.sheetCancel}
                  onPress={() => {
                    setDeletePw('');
                    setError(null);
                    setSheet(null);
                  }}
                >
                  <Text style={styles.sheetCancelText}>{t.common.cancel}</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function MenuRow({
  icon: Icon,
  label,
  onPress,
}: {
  icon: typeof Lock;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.menuRow} onPress={onPress}>
      <Icon size={16} color={C.goldL} />
      <Text style={styles.menuLabel}>{label}</Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChange,
  secure,
  keyboardType,
  maxLength,
  testID,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secure?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'phone-pad';
  maxLength?: number;
  /**
   * What the browser or keychain should offer here. Without it a browser has
   * nothing to match on and falls back to "the last thing typed in a box this
   * shape" — which is how the Change EMAIL box came to show a phone number.
   */
  autoComplete?: 'current-password' | 'new-password' | 'email' | 'tel' | 'off';
  /**
   * These boxes carry no placeholder and a secure one has no readable value,
   * so a test can only address them by id. Named per sheet, because WHICH box
   * received which password is the thing worth pinning.
   */
  testID?: string;
}) {
  /*
   * ONE EYE PER BOX, and its own state — owner, 21 Sep 2026: "every password
   * row got an eye to see what user was typed". Each Field holds its own, so
   * revealing the new password does not also reveal the confirmation; the two
   * only check each other while they are read separately.
   */
  const [shown, setShown] = useState(false);
  const t = useLocale().t;
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={secure ? styles.revealRow : undefined}>
        <TextInput
          value={value}
          onChangeText={onChange}
          secureTextEntry={secure ? !shown : false}
          keyboardType={keyboardType}
          maxLength={maxLength}
          style={[styles.input, secure ? styles.revealInput : null]}
          placeholderTextColor={C.muted2}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={autoComplete}
          testID={testID}
        />
        {secure ? (
          <Pressable
            style={styles.revealEye}
            onPress={() => setShown((v) => !v)}
            hitSlop={10}
            accessibilityLabel={shown ? t.login.hidePassword : t.login.showPassword}
            testID={testID ? `${testID}-reveal` : undefined}
          >
            {shown ? <EyeOff size={17} color={C.muted2} /> : <Eye size={17} color={C.muted2} />}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 10, paddingHorizontal: 18, paddingBottom: 26 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  backText: { ...font(700), fontSize: 16, color: C.txt },
  eyebrow: {
    ...font(600),
    fontSize: 12,
    letterSpacing: 1.68,
    color: '#c4b4d8',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  title: { ...font(800), fontSize: 26, color: C.txt },
  meta: { marginTop: 8, ...font(), fontSize: 13, color: C.prMuted, lineHeight: 18 },
  toast: {
    marginTop: 10,
    ...font(),
    fontSize: 13,
    color: C.green,
  },
  card: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 14,
  },
  dangerCard: { borderColor: 'rgba(240,138,138,0.35)' },
  cardTitle: { ...font(700), fontSize: 15, color: C.txt },
  cardSub: { marginTop: 2, ...font(), fontSize: 12, color: C.prMuted },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(6,3,12,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.panel,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: C.line2,
    padding: 18,
    paddingBottom: 28,
    maxWidth: 392,
    width: '100%',
    alignSelf: 'center',
  },
  sheetTitle: { ...font(800), fontSize: 20, color: C.txt, marginBottom: 8 },
  sheetHint: { ...font(), fontSize: 13, color: C.prMuted, marginBottom: 8, lineHeight: 18 },
  /** Where the code went — green, like every "done" line on this screen. */
  sentTo: { ...font(600), fontSize: 13, color: C.green, marginBottom: 6, lineHeight: 18 },
  /** Nothing went out — the same line in red, never in "done" green. */
  notSent: { ...font(600), fontSize: 13, color: C.red, marginBottom: 6, lineHeight: 18 },
  /** Amber = waiting on the PR, per the app's status colours. */
  warning: {
    ...font(),
    fontSize: 13,
    color: C.amber,
    backgroundColor: C.amberBg,
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    lineHeight: 18,
  },
  sheetError: { marginTop: 10, ...font(), fontSize: 13, color: C.red, lineHeight: 18 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  menuLabel: { ...font(600), fontSize: 15, color: C.txt },
  fieldLabel: {
    ...font(600),
    fontSize: 11,
    letterSpacing: 0.8,
    color: C.prMuted2,
    marginBottom: 4,
  },
  phoneRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  phoneInput: { flex: 1 },
  /* A password box and its eye on one line; the box takes what the eye leaves. */
  revealRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  revealInput: { flex: 1 },
  revealEye: { padding: 6 },
  input: {
    ...font(600),
    fontSize: 16,
    color: C.txt,
    borderWidth: 1,
    borderColor: C.line2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  primary: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { ...font(700), fontSize: 16, color: '#241a08' },
  sheetCancel: { marginTop: 10, alignItems: 'center', padding: 10 },
  sheetCancelText: { ...font(600), fontSize: 14, color: C.muted },
  /** Red = close/leave, per the app's button rule. */
  leaveText: { ...font(600), fontSize: 14, color: C.red },
  dangerBtn: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: C.redBg,
    borderWidth: 1,
    borderColor: 'rgba(240,138,138,0.4)',
  },
  dangerBtnText: { ...font(700), fontSize: 16, color: C.red },
});
