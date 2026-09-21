/**
 * Forgot password (signed out).
 *
 *   identify → a Phone (default, with the dial-code picker) / Email switch
 *            → POST /auth/password/forgot/start {phoneNum} or {email}
 *            → the server sends ONE code by WhatsApp + SMS to the phone on file
 *              and by email to the email on file — whichever one was typed
 *   code  → entered here, checked only at the end (there is no verify call)
 *   new password → POST /auth/password/forgot/complete {requestId, code, password}
 *   done
 *
 * ⚠️ BOTH calls are NEUTRAL on purpose, so this sheet can never be used to find
 * out who is registered. `start` answers the same sentence and a request id
 * whether or not the phone / email belongs to an account. For an unknown one
 * the id is a stand-in the server remembers: at the last step it answers
 * "Invalid code", counts guesses to the same attempt cap ("Too many attempts —
 * request a new code") and expires on the same clock — exactly what a real
 * account's wrong code answers. (It used to end in "This code has expired",
 * which gave the unknown account away; backend forgot-password.controller.ts.)
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Eye, EyeOff } from '../components/icons';
import { C, GRADIENTS, grad } from '../theme/theme';
import { font } from '../theme/fonts';
import { ApiError, completeForgotPassword, startForgotPassword } from '../lib/api';
import { isCodeRejection, localizeApiError } from '../lib/api-error-copy';
import {
  isCompleteCode,
  minutesFromSeconds,
  retryAfterSeconds,
} from '../lib/code-delivery';
import {
  DEFAULT_FORGOT_IDENTIFIER_KIND,
  type ForgotIdentifierInput,
  type ForgotIdentifierKind,
  forgotStartBody,
  hasForgotIdentifier,
} from '../lib/forgot-identifier';
import { loadPhoneCountryCode, savePhoneCountryCode } from '../lib/phone-prefs';
import { useKeyboardInset } from '../lib/use-keyboard-inset';
import { formatMessage, useLocale } from '../i18n';
import { COUNTRY_BY_CODE, COUNTRY_DIAL_OPTIONS } from './sign-up/constants';
import { Picker } from './sign-up/fields';
import { normalizeOtpInput } from './sign-up/step-6';

type Step = 'identify' | 'code' | 'password' | 'done';

const IDENTIFIER_KINDS: readonly ForgotIdentifierKind[] = ['phone', 'email'];

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Prefill dial + local from the login form when opened. */
  initialCountryCode?: string;
  initialLocalNumber?: string;
};

const DIAL_PICKER_OPTIONS = COUNTRY_DIAL_OPTIONS.map((c) => ({
  value: c.countryCode,
  label: c.label,
  flag: c.flag,
  name: c.name,
  meta: c.dialCode,
}));

/** The server's password cap (bcrypt reads at most 72 bytes). */
const PASSWORD_MAX = 72;

export function ForgotPasswordModal({
  visible,
  onClose,
  initialCountryCode,
  initialLocalNumber,
}: Props) {
  const { t } = useLocale();
  const keyboardInset = useKeyboardInset();
  const [step, setStep] = useState<Step>('identify');
  const [identifierKind, setIdentifierKind] = useState<ForgotIdentifierKind>(
    DEFAULT_FORGOT_IDENTIFIER_KIND,
  );
  const [phoneCountryCode, setPhoneCountryCode] = useState(
    () => initialCountryCode || loadPhoneCountryCode(),
  );
  const [phoneNumber, setPhoneNumber] = useState(initialLocalNumber ?? '');
  const [email, setEmail] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [expiresInSec, setExpiresInSec] = useState(600);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  /*
   * ONE EYE PER PASSWORD BOX, each with its own state (owner, 21 Sep 2026:
   * "every password row got an eye to see what user was typed"). Separate,
   * not shared: revealing the new password should not also reveal the
   * confirmation, or the two stop being an independent check of each other.
   */
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  /** A backdrop tap / hardware back mid-flow asks first instead of discarding. */
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const identifier = useMemo<ForgotIdentifierInput>(
    () =>
      identifierKind === 'phone'
        ? { kind: 'phone', countryCode: phoneCountryCode, localNumber: phoneNumber }
        : { kind: 'email', email },
    [identifierKind, phoneCountryCode, phoneNumber, email],
  );
  const canSend = hasForgotIdentifier(identifier);
  const country = COUNTRY_BY_CODE[phoneCountryCode];
  const closedDialLabel = country
    ? `${country.flag ? `${country.flag} ` : ''}${country.dialCode}`
    : null;

  useEffect(() => {
    if (!visible) return;
    setStep('identify');
    setIdentifierKind(DEFAULT_FORGOT_IDENTIFIER_KIND);
    setPhoneCountryCode(initialCountryCode || loadPhoneCountryCode());
    setPhoneNumber(initialLocalNumber ?? '');
    setEmail('');
    setRequestId(null);
    setExpiresInSec(600);
    setCode('');
    setPassword('');
    setConfirm('');
    setBusy(false);
    setError(null);
    setInfo(null);
    setResendIn(0);
    setConfirmDiscard(false);
  }, [visible, initialCountryCode, initialLocalNumber]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const describeError = (e: unknown, fallback: string) =>
    e instanceof ApiError ? localizeApiError(e.message, t.errors) : fallback;

  /**
   * Progress worth protecting: a code has been requested and not yet used.
   * The identify step has nothing to lose, and "done" has nothing left to do.
   */
  const hasProgress = step === 'code' || step === 'password';

  const requestClose = () => {
    if (busy) return;
    if (hasProgress) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  const chooseKind = (next: ForgotIdentifierKind) => {
    if (busy || next === identifierKind) return;
    setIdentifierKind(next);
    // An error about the other field ("Enter a valid email address") would
    // read as being about this one.
    setError(null);
  };

  const sendCode = async () => {
    if (busy) return;
    const start = forgotStartBody(identifier);
    if (!start.ok) {
      if (start.reason === 'invalidEmail') setError(t.errors.invalidEmailAddress);
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (identifier.kind === 'phone') savePhoneCountryCode(identifier.countryCode);
      const res = await startForgotPassword(start.body);
      setRequestId(res.requestId);
      setExpiresInSec(res.expiresInSec ?? 600);
      setResendIn(res.resendAfterSec ?? 60);
      setInfo(t.forgot.codeSentInfo);
      setCode('');
      setStep('code');
    } catch (e) {
      const wait = retryAfterSeconds(e);
      if (wait) setResendIn(wait);
      setError(describeError(e, t.security.sendCodeFailed));
    } finally {
      setBusy(false);
    }
  };

  const continueToPassword = () => {
    if (!isCompleteCode(code)) return;
    setError(null);
    setStep('password');
  };

  const savePassword = async () => {
    if (!requestId || busy) return;
    if (password.length < 6) {
      setError(t.security.passwordMin);
      return;
    }
    if (password.length > PASSWORD_MAX) {
      setError(t.security.passwordMax);
      return;
    }
    if (password !== confirm) {
      setError(t.security.passwordMismatch);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await completeForgotPassword(requestId, code, password);
      setCode('');
      setPassword('');
      setConfirm('');
      setInfo(null);
      setStep('done');
    } catch (e) {
      /*
       * Only a refusal about the CODE itself (wrong, expired, spent, or out of
       * guesses) sends the PR back to the code step. A 429 from the per-IP
       * limiter answers BEFORE the code is looked at — that code is still
       * pending and valid, so it stays typed and she stays here to try again
       * once the limiter's wait is over.
       */
      if (e instanceof ApiError && isCodeRejection(e.message)) {
        // The CODE is what failed, not the password — put the PR back where she
        // can fix it (re-type, or resend), and keep the password she typed.
        setCode('');
        setInfo(null);
        setStep('code');
      }
      setError(describeError(e, t.forgot.resetFailed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={requestClose}>
      <Pressable style={styles.backdrop} onPress={requestClose}>
        <Pressable
          style={[styles.sheet, keyboardInset > 0 && { paddingBottom: keyboardInset + 16 }]}
          onPress={(e) => e.stopPropagation()}
        >
          {confirmDiscard ? (
            <>
              <Text style={styles.title}>{t.common.discardTitle}</Text>
              <Text style={styles.hint}>{t.common.discardBody}</Text>
              <Pressable
                style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
                onPress={() => setConfirmDiscard(false)}
              >
                <Text style={styles.primaryText}>{t.common.keepGoing}</Text>
              </Pressable>
              <Pressable
                style={styles.cancel}
                onPress={() => {
                  setConfirmDiscard(false);
                  onClose();
                }}
              >
                <Text style={styles.leaveText}>{t.common.leave}</Text>
              </Pressable>
            </>
          ) : null}

          {!confirmDiscard && step === 'identify' && (
            <>
              <Text style={styles.title}>{t.forgot.title}</Text>
              {/* A choice, so segmented tabs — not a gold "act" button. */}
              <View style={styles.kindTabs} accessibilityRole="tablist">
                {IDENTIFIER_KINDS.map((kind) => {
                  const on = identifierKind === kind;
                  return (
                    <Pressable
                      key={kind}
                      style={[styles.kindTab, on && styles.kindTabOn]}
                      onPress={() => chooseKind(kind)}
                      disabled={busy}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on, disabled: busy }}
                    >
                      <Text style={[styles.kindTabText, on && styles.kindTabTextOn]}>
                        {kind === 'phone' ? t.forgot.byPhone : t.forgot.byEmail}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.hint}>
                {identifierKind === 'phone' ? t.forgot.phoneHint : t.forgot.emailHint}
              </Text>
              {identifierKind === 'phone' ? (
                <>
                  <Text style={styles.label}>{t.login.mobileNumber}</Text>
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
                  <Text style={styles.label}>{t.forgot.emailLabel}</Text>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      if (error) setError(null);
                    }}
                    onSubmitEditing={() => void sendCode()}
                    placeholder="you@example.com"
                    placeholderTextColor={C.muted2}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={254}
                  />
                </>
              )}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
                onPress={() => void sendCode()}
                disabled={busy || !canSend}
              >
                <Text style={styles.primaryText}>
                  {busy ? t.forgot.sending : t.forgot.sendCode}
                </Text>
              </Pressable>
              <Pressable style={styles.cancel} onPress={onClose}>
                <Text style={styles.cancelText}>{t.common.cancel}</Text>
              </Pressable>
            </>
          )}

          {!confirmDiscard && step === 'code' && (
            <>
              <Text style={styles.title}>{t.forgot.otpTitle}</Text>
              {info ? <Text style={styles.info}>{info}</Text> : null}
              <Text style={styles.hint}>
                {formatMessage(t.forgot.otpHint, { m: minutesFromSeconds(expiresInSec) })}
              </Text>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={(text) => setCode(normalizeOtpInput(text))}
                placeholder="123456"
                placeholderTextColor={C.muted2}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                maxLength={6}
                autoFocus
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
                onPress={continueToPassword}
                disabled={busy || !isCompleteCode(code)}
              >
                <Text style={styles.primaryText}>{t.common.continue}</Text>
              </Pressable>
              <Pressable
                style={styles.cancel}
                onPress={() => resendIn === 0 && void sendCode()}
                disabled={resendIn > 0 || busy}
              >
                <Text style={styles.cancelText}>
                  {busy
                    ? t.forgot.sending
                    : resendIn > 0
                      ? formatMessage(t.forgot.resendIn, { s: resendIn })
                      : t.forgot.resend}
                </Text>
              </Pressable>
              <Pressable
                style={styles.cancel}
                onPress={() => {
                  setError(null);
                  setStep('identify');
                }}
              >
                <Text style={styles.cancelText}>{t.common.back}</Text>
              </Pressable>
            </>
          )}

          {!confirmDiscard && step === 'password' && (
            <>
              <Text style={styles.title}>{t.forgot.newPassword}</Text>
              <Text style={styles.hint}>{t.forgot.passwordHint}</Text>
              <Text style={styles.label}>{t.forgot.newPassword}</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholder={t.security.passwordMin}
                  placeholderTextColor={C.muted2}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  maxLength={PASSWORD_MAX}
                />
                <Pressable
                  style={styles.eye}
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={10}
                  accessibilityLabel={showPassword ? t.login.hidePassword : t.login.showPassword}
                >
                  {showPassword ? <EyeOff size={17} color={C.muted2} /> : <Eye size={17} color={C.muted2} />}
                </Pressable>
              </View>
              <Text style={styles.label}>{t.forgot.confirmPassword}</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry={!showConfirm}
                  placeholder={t.forgot.confirmPassword}
                  placeholderTextColor={C.muted2}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  maxLength={PASSWORD_MAX}
                />
                <Pressable
                  style={styles.eye}
                  onPress={() => setShowConfirm((v) => !v)}
                  hitSlop={10}
                  accessibilityLabel={showConfirm ? t.login.hidePassword : t.login.showPassword}
                >
                  {showConfirm ? <EyeOff size={17} color={C.muted2} /> : <Eye size={17} color={C.muted2} />}
                </Pressable>
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
                onPress={() => void savePassword()}
                disabled={busy || password.length < 6}
              >
                <Text style={styles.primaryText}>
                  {busy ? t.forgot.saving : t.forgot.setPassword}
                </Text>
              </Pressable>
              <Pressable
                style={styles.cancel}
                onPress={() => {
                  setError(null);
                  setStep('code');
                }}
                disabled={busy}
              >
                <Text style={styles.cancelText}>{t.common.back}</Text>
              </Pressable>
            </>
          )}

          {!confirmDiscard && step === 'done' && (
            <>
              <Text style={styles.title}>{t.forgot.doneTitle}</Text>
              <Text style={styles.hint}>{t.forgot.doneBody}</Text>
              <Pressable
                style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
                onPress={onClose}
              >
                <Text style={styles.primaryText}>{t.forgot.backToSignIn}</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  title: { ...font(800), fontSize: 20, color: C.txt, marginBottom: 8 },
  hint: {
    ...font(),
    fontSize: 13,
    color: C.prMuted,
    marginBottom: 12,
    lineHeight: 18,
  },
  info: {
    ...font(),
    fontSize: 13,
    color: C.green,
    marginBottom: 8,
    lineHeight: 18,
  },
  label: {
    ...font(600),
    fontSize: 11,
    letterSpacing: 0.8,
    color: C.prMuted2,
    marginBottom: 4,
    marginTop: 8,
  },
  /*
   * The same shape as the Payment / History week tabs — a choice between two
   * options reads as one mechanism across the app: lavender when chosen, never
   * gold (gold = act).
   */
  kindTabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  kindTab: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: 'rgba(255,255,255,0.02)',
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  kindTabOn: {
    borderColor: 'rgba(183,156,232,0.45)',
    backgroundColor: 'rgba(183,156,232,0.1)',
  },
  kindTabText: { ...font(700), fontSize: 14, color: C.muted },
  kindTabTextOn: { color: C.txt },
  phoneRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  phoneInput: { flex: 1 },
  /* The box and its eye on one line; the box takes the room the eye leaves. */
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passwordInput: { flex: 1 },
  eye: { padding: 6 },
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
  error: { marginTop: 10, ...font(), fontSize: 13, color: C.red, lineHeight: 18 },
  primary: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { ...font(700), fontSize: 16, color: '#241a08' },
  cancel: { marginTop: 10, alignItems: 'center', padding: 10 },
  cancelText: { ...font(600), fontSize: 14, color: C.muted },
  /** Red = close/leave, per the app's button rule. */
  leaveText: { ...font(600), fontSize: 14, color: C.red },
});
