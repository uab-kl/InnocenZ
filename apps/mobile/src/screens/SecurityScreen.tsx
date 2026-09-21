/**
 * Security settings — change password (current password), change phone and
 * change email, delete account.
 *
 * Changing a phone or an email is TWO calls (owner's decision, 21 Sep 2026):
 *
 *   1. start    { kind, value, currentPassword } → one code to the NEW contact
 *               (WhatsApp + SMS to a new number, email to a new address).
 *      resend                                    → another code to the same new
 *               contact, and a NEW `requestId` that replaces the one we hold.
 *   2. confirm  { kind, value, requestId, code } → writes the change.
 *
 * ⚠️ NOTHING IS EVER SENT TO THE OLD PHONE OR OLD EMAIL — not a code, and not a
 * "your email was changed" notice afterwards. The identity code that used to go
 * to the contacts already on file is GONE; the CURRENT PASSWORD took its place.
 * That is why the first sheet asks for the password beside the new value: the
 * password says the person holding this unlocked phone owns the account, and the
 * code to the new contact says she typed it correctly and can receive on it —
 * without which a typo would lock her out of her own account.
 *
 * Both steps show where the code went, using the server's masked `sentTo`.
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
  changePassword,
  confirmContactChange,
  deleteOwnAccount,
  resendContactChangeNewCode,
  startContactChange,
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
import { ChevronLeft, Lock, Mail, Phone, Shield, Trash2 } from '../components/icons';
import { COUNTRY_BY_CODE, COUNTRY_DIAL_OPTIONS } from './sign-up/constants';
import { Picker } from './sign-up/fields';
import { normalizeOtpInput } from './sign-up/step-6';

type Sheet =
  | null
  | 'menu'
  | 'password'
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
      setCurPw('');
      setNewPw('');
      setConfirmPw('');
      setDeletePw('');
      // The contact sheet's password goes too — resetContactFlow keeps it on
      // purpose (see contactPw), but a dead session is not a recoverable step.
      setContactPw('');
      resetContactFlow();
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

  /** A code is outstanding — closing the sheet would throw it away. */
  const codeOutstanding = sheet === 'newCode';

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

  const savePassword = async () => {
    if (!token || busy) return;
    if (newPw.length < 6) {
      setError(t.security.passwordMin);
      return;
    }
    if (newPw.length > PASSWORD_MAX) {
      setError(t.security.passwordMax);
      return;
    }
    if (newPw !== confirmPw) {
      setError(t.security.passwordMismatch);
      return;
    }
    if (newPw === curPw) {
      setError(t.errors.passwordMustDiffer);
      return;
    }
    setBusy(true);
    setError(null);
    let issued: Awaited<ReturnType<typeof changePassword>>;
    try {
      issued = await changePassword(token, curPw, newPw);
    } catch (e) {
      setBusy(false);
      if (sessionRefused(e)) {
        requireSignInAgain('sessionEnded');
        return;
      }
      setError(describeError(e, t.security.updatePasswordFailed));
      return;
    }
    /*
     * ⚠️ STORE THE RE-ISSUED TOKEN FIRST. The change stamped a session cutoff,
     * so the token that made the call is refused from here on; any request sent
     * with it would collect a 401 under a password that DID change.
     */
    const accessToken = issued?.accessToken ?? null;
    if (accessToken) adoptToken(accessToken);
    setCurPw('');
    setNewPw('');
    setConfirmPw('');
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
                    // Leaving the flow entirely — the password goes with it.
                    setContactPw('');
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
                  onPress={() => {
                    setError(null);
                    setMsg(null);
                    setSheet('password');
                  }}
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
                <Field
                  label={t.security.currentPassword}
                  value={curPw}
                  onChange={setCurPw}
                  secure
                  maxLength={PASSWORD_MAX}
                />
                <Field
                  label={t.security.newPassword}
                  value={newPw}
                  onChange={setNewPw}
                  secure
                  maxLength={PASSWORD_MAX}
                />
                <Field
                  label={t.security.confirmPassword}
                  value={confirmPw}
                  onChange={setConfirmPw}
                  secure
                  maxLength={PASSWORD_MAX}
                />
                {error ? <Text style={styles.sheetError}>{error}</Text> : null}
                <Pressable
                  style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
                  onPress={() => void savePassword()}
                  disabled={busy}
                >
                  <Text style={styles.primaryText}>
                    {busy ? t.common.loading : t.common.save}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.sheetCancel}
                  onPress={() => setSheet('menu')}
                  disabled={busy}
                >
                  <Text style={styles.sheetCancelText}>{t.common.back}</Text>
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
                  maxLength={PASSWORD_MAX}
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
                <TextInput
                  style={styles.input}
                  value={deletePw}
                  onChangeText={setDeletePw}
                  placeholder={t.security.deleteAccountPassword}
                  placeholderTextColor={C.muted2}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secure?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'phone-pad';
  maxLength?: number;
}) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        keyboardType={keyboardType}
        maxLength={maxLength}
        style={styles.input}
        placeholderTextColor={C.muted2}
        autoCapitalize="none"
      />
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
