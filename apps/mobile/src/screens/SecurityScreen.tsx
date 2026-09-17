/**
 * Security settings — change password (current password), change phone and
 * change email (both verified twice), delete account.
 *
 * Changing a phone or an email is three calls, and it is three on purpose:
 *
 *   1. start            → a code to the CURRENT phone (WhatsApp + SMS) and
 *                         CURRENT email: proves the person holding this signed-in
 *                         phone is the account's owner, not someone who picked
 *                         it up unlocked.
 *   2. verify-identity  → checks that code; the server sends a SECOND code to
 *                         the NEW contact.
 *   3. confirm          → checks the second code (proves the new contact is
 *                         really hers) and writes the change.
 *
 * Every step shows where its code went, using the server's masked `sentTo`.
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
  verifyContactChangeIdentity,
  type CodeDelivery,
  type ContactKind,
} from '../lib/api';
import { isCodeRejection, localizeApiError, matchCodeFlowError } from '../lib/api-error-copy';
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
  /** Step 1 — type the new phone / email. */
  | 'contact'
  /** Step 2 — the code sent to the CURRENT contacts. */
  | 'identity'
  /** Step 3 — the code sent to the NEW contact. */
  | 'newCode'
  | 'delete'
  /** A change was SAVED but no fresh session came back — sign in again. */
  | 'signInAgain';

/** What was just changed, when the PR has to sign in again afterwards. */
type ChangedCredential = 'password' | ContactKind;

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
  const [signInAfter, setSignInAfter] = useState<ChangedCredential | null>(null);

  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [deletePw, setDeletePw] = useState('');

  const [contactKind, setContactKind] = useState<ContactKind>('phone');
  const [phoneCountryCode, setPhoneCountryCode] = useState(loadPhoneCountryCode);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [emailInput, setEmailInput] = useState('');
  /**
   * The normalised new value, frozen when step 1 succeeds. All three calls must
   * send the SAME value (the server binds the codes to it), so steps 2 and 3
   * never re-read the text boxes.
   */
  const [pendingValue, setPendingValue] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [newRequestId, setNewRequestId] = useState<string | null>(null);
  const [identitySentTo, setIdentitySentTo] = useState<CodeDelivery[]>([]);
  const [newSentTo, setNewSentTo] = useState<CodeDelivery[]>([]);
  const [expiresInSec, setExpiresInSec] = useState(300);
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
  const requireSignInAgain = (changed: ChangedCredential) => {
    setConfirmDiscard(false);
    setError(null);
    setMsg(null);
    setSignInAfter(changed);
    setSheet('signInAgain');
  };

  const changedLine = (changed: ChangedCredential) =>
    changed === 'password'
      ? t.security.passwordUpdated
      : changed === 'email'
        ? t.security.emailUpdated
        : t.security.phoneUpdated;

  const resetContactFlow = () => {
    setPendingValue('');
    setRequestId(null);
    setNewRequestId(null);
    setIdentitySentTo([]);
    setNewSentTo([]);
    setPendingInvites(0);
    setCode('');
    setResendIn(0);
  };

  /** A code is outstanding — closing the sheet would throw it away. */
  const codeOutstanding = sheet === 'identity' || sheet === 'newCode';

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
      setError(describeError(e, t.security.updatePasswordFailed));
      setBusy(false);
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

  /** Step 1 (and its resend): a code to the CURRENT phone + email. */
  const requestIdentityCode = async (kind: ContactKind, value: string) => {
    if (!token || busy || !value) return;
    setBusy(true);
    setError(null);
    try {
      const res = await startContactChange(token, kind, value);
      setPendingValue(value);
      setRequestId(res.requestId);
      setNewRequestId(null);
      setIdentitySentTo(res.sentTo ?? []);
      setNewSentTo([]);
      setExpiresInSec(res.expiresInSec ?? 300);
      setResendIn(res.resendAfterSec ?? 60);
      setPendingInvites(kind === 'email' ? res.pendingInvitesToCurrentEmail ?? 0 : 0);
      setCode('');
      setSheet('identity');
    } catch (e) {
      noteCooldown(e);
      setError(describeError(e, t.security.sendCodeFailed));
    } finally {
      setBusy(false);
    }
  };

  const startChange = () => {
    if (contactKind === 'phone') {
      if (!localDigits) return;
      savePhoneCountryCode(phoneCountryCode);
      void requestIdentityCode('phone', `+${fullPhone.replace(/^\+/, '')}`);
      return;
    }
    const value = normalizeEmailInput(emailInput);
    if (!value) return;
    if (!isPlausibleEmail(value)) {
      setError(t.profile.emailInvalid);
      return;
    }
    void requestIdentityCode('email', value);
  };

  /** Step 2: check the identity code; the server then codes the NEW contact. */
  const verifyIdentity = async () => {
    if (!token || !requestId || !isCompleteCode(code) || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await verifyContactChangeIdentity(token, {
        requestId,
        kind: contactKind,
        value: pendingValue,
        code,
      });
      setNewRequestId(res.newRequestId);
      setNewSentTo(res.sentTo ?? []);
      setExpiresInSec(res.expiresInSec ?? 600);
      setResendIn(res.resendAfterSec ?? 60);
      setCode('');
      setSheet('newCode');
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      const message = e instanceof ApiError ? e.message : '';
      const refusal = message ? matchCodeFlowError(message) : null;

      if (refusal === 'emailTaken' || refusal === 'phoneTaken') {
        // Taken while she was reading the code. No code can fix that: back to
        // step 1, where the value she typed is still in the box to change.
        resetContactFlow();
        setError(describeError(e, t.security.sendCodeFailed));
        setSheet('contact');
        return;
      }

      if (status >= 500 || refusal === 'codeAlreadyUsed') {
        /*
         * The identity code was — or may have been — ACCEPTED: the server marks
         * it verified BEFORE it sends the second code, so a send that fails
         * afterwards (503, 500) or a second tap that lost the race (409) leaves
         * it spent. Typing it again can only answer "This change has expired".
         * Step 3's Resend calls resend-new, which needs no new identity code; if
         * the identity step was in fact never proven, resend-new says the change
         * expired and Start again is right there.
         */
        setNewRequestId(null);
        setNewSentTo([]);
        setCode('');
        setResendIn(0);
        setExpiresInSec(600);
        setSheet('newCode');
        // The empty `sentTo` already reads "could not be delivered — try Resend";
        // only an unexplained server error is worth a second line.
        setError(
          status >= 500 && refusal !== 'codeSendFailed'
            ? describeError(e, t.security.sendCodeFailed)
            : null,
        );
        return;
      }

      noteCooldown(e);
      // A limiter's 429 leaves the code valid — keep what she typed.
      if (isCodeRejection(message)) setCode('');
      setError(describeError(e, t.security.sendCodeFailed));
    } finally {
      setBusy(false);
    }
  };

  /** Step 3's resend — the identity step stays proven for 15 minutes. */
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
      setNewRequestId(res.newRequestId);
      setNewSentTo(res.sentTo ?? []);
      setExpiresInSec(res.expiresInSec ?? 600);
      setResendIn(res.resendAfterSec ?? 60);
      setCode('');
    } catch (e) {
      noteCooldown(e);
      setError(describeError(e, t.security.sendCodeFailed));
    } finally {
      setBusy(false);
    }
  };

  /** Step 3: the new contact's code — writes the change. */
  const confirmChange = async () => {
    if (!token || !requestId || !newRequestId || !isCompleteCode(code) || busy) return;
    const kind = contactKind;
    setBusy(true);
    setError(null);
    let result: Awaited<ReturnType<typeof confirmContactChange>>;
    try {
      result = await confirmContactChange(token, {
        requestId,
        newRequestId,
        kind,
        value: pendingValue,
        code,
      });
    } catch (e) {
      const message = e instanceof ApiError ? e.message : '';
      const refusal = message ? matchCodeFlowError(message) : null;
      const failed = describeError(
        e,
        kind === 'email' ? t.security.updateEmailFailed : t.security.updatePhoneFailed,
      );
      if (refusal === 'emailTaken' || refusal === 'phoneTaken') {
        // Taken since step 2 — back to step 1 to choose another.
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
                {error ? <Text style={styles.sheetError}>{error}</Text> : null}
                <Pressable
                  style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
                  onPress={startChange}
                  disabled={
                    busy || (contactKind === 'phone' ? !localDigits : !emailInput.trim())
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

            {!confirmDiscard && sheet === 'identity' && (
              <>
                <Text style={styles.sheetTitle}>{t.security.identityTitle}</Text>
                <Text style={codeReachedSomewhere(identitySentTo) ? styles.sentTo : styles.notSent}>
                  {describeCodeDelivery(identitySentTo, t.security)}
                </Text>
                <Text style={styles.sheetHint}>{codeValidLine}</Text>
                {pendingInvites > 0 ? (
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
                  onPress={() => void verifyIdentity()}
                  disabled={busy || !isCompleteCode(code)}
                >
                  <Text style={styles.primaryText}>
                    {busy ? t.forgot.verifying : t.forgot.verify}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.sheetCancel}
                  onPress={() =>
                    resendIn === 0 && void requestIdentityCode(contactKind, pendingValue)
                  }
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

            {!confirmDiscard && sheet === 'newCode' && (
              <>
                <Text style={styles.sheetTitle}>
                  {contactKind === 'email'
                    ? t.security.newEmailCodeTitle
                    : t.security.newPhoneCodeTitle}
                </Text>
                <Text style={codeReachedSomewhere(newSentTo) ? styles.sentTo : styles.notSent}>
                  {describeCodeDelivery(newSentTo, t.security)}
                </Text>
                {/* No second code exists yet, so there is no validity to state. */}
                {newRequestId ? <Text style={styles.sheetHint}>{codeValidLine}</Text> : null}
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
                  // No newRequestId = the second code never went out (see
                  // verifyIdentity): Resend below is the way forward.
                  disabled={busy || !newRequestId || !isCompleteCode(code)}
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
                <Text style={styles.sentTo}>{changedLine(signInAfter)}</Text>
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
