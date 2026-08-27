/**
 * Forgot password — WhatsApp OTP on the account phone, then set a new password.
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
import { C, F, GRADIENTS, grad } from '../theme/theme';
import { ApiError, resetPasswordWithOtp, sendPrOtp, verifyPrOtp } from '../lib/api';
import {
  loadPhoneCountryCode,
  localPhoneDigits,
  phoneLoginIdentifier,
  savePhoneCountryCode,
} from '../lib/phone-prefs';
import { useKeyboardInset } from '../lib/use-keyboard-inset';
import { formatMessage, useLocale } from '../i18n';
import { COUNTRY_BY_CODE, COUNTRY_DIAL_OPTIONS } from './sign-up/constants';
import { Picker } from './sign-up/fields';
import { normalizeOtpInput } from './sign-up/step-6';

type Step = 'phone' | 'otp' | 'password' | 'done';

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

export function ForgotPasswordModal({
  visible,
  onClose,
  initialCountryCode,
  initialLocalNumber,
}: Props) {
  const { t } = useLocale();
  const keyboardInset = useKeyboardInset();
  const [step, setStep] = useState<Step>('phone');
  const [phoneCountryCode, setPhoneCountryCode] = useState(
    () => initialCountryCode || loadPhoneCountryCode(),
  );
  const [phoneNumber, setPhoneNumber] = useState(initialLocalNumber ?? '');
  const [otp, setOtp] = useState('');
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  const localDigits = useMemo(() => localPhoneDigits(phoneNumber), [phoneNumber]);
  const country = COUNTRY_BY_CODE[phoneCountryCode];
  const fullPhone = phoneLoginIdentifier(phoneCountryCode, phoneNumber);
  const closedDialLabel = country
    ? `${country.flag ? `${country.flag} ` : ''}${country.dialCode}`
    : null;

  useEffect(() => {
    if (!visible) return;
    setStep('phone');
    setPhoneCountryCode(initialCountryCode || loadPhoneCountryCode());
    setPhoneNumber(initialLocalNumber ?? '');
    setOtp('');
    setVerificationId(null);
    setPassword('');
    setConfirm('');
    setBusy(false);
    setError(null);
    setInfo(null);
    setResendIn(0);
  }, [visible, initialCountryCode, initialLocalNumber]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const sendCode = async () => {
    if (!localDigits || busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      savePhoneCountryCode(phoneCountryCode);
      const res = await sendPrOtp(fullPhone, 'forgot_password');
      setResendIn(res.resendAfterSec ?? 60);
      setInfo(t.forgot.codeSentInfo);
      setStep('otp');
      setOtp('');
      setVerificationId(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.security.sendCodeFailed);
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (otp.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await verifyPrOtp(fullPhone, otp, 'forgot_password');
      setVerificationId(res.verificationId);
      setStep('password');
      setInfo(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.forgot.invalidCode);
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    if (!verificationId || busy) return;
    if (password.length < 6) {
      setError(t.security.passwordMin);
      return;
    }
    if (password !== confirm) {
      setError(t.security.passwordMismatch);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetPasswordWithOtp(fullPhone, verificationId, password);
      setStep('done');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.forgot.resetFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, keyboardInset > 0 && { paddingBottom: keyboardInset + 16 }]}
          onPress={(e) => e.stopPropagation()}
        >
          {step === 'phone' && (
            <>
              <Text style={styles.title}>{t.forgot.title}</Text>
              <Text style={styles.hint}>{t.forgot.phoneHint}</Text>
              <Text style={styles.label}>{t.login.mobileNumber}</Text>
              <View style={styles.phoneRow}>
                <Picker
                  value={phoneCountryCode}
                  options={DIAL_PICKER_OPTIONS}
                  onSelect={(code) => {
                    setPhoneCountryCode(code);
                    savePhoneCountryCode(code);
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
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
                onPress={() => void sendCode()}
                disabled={busy || !localDigits}
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

          {step === 'otp' && (
            <>
              <Text style={styles.title}>{t.forgot.otpTitle}</Text>
              <Text style={styles.hint}>{t.forgot.otpHint}</Text>
              {info ? <Text style={styles.info}>{info}</Text> : null}
              <TextInput
                style={styles.input}
                value={otp}
                onChangeText={(text) => setOtp(normalizeOtpInput(text))}
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
                onPress={() => void verifyCode()}
                disabled={busy || otp.length !== 6}
              >
                <Text style={styles.primaryText}>
                  {busy ? t.forgot.verifying : t.forgot.verify}
                </Text>
              </Pressable>
              <Pressable
                style={styles.cancel}
                onPress={() => resendIn === 0 && void sendCode()}
                disabled={resendIn > 0 || busy}
              >
                <Text style={styles.cancelText}>
                  {resendIn > 0
                    ? formatMessage(t.forgot.resendIn, { s: resendIn })
                    : t.forgot.resend}
                </Text>
              </Pressable>
              <Pressable style={styles.cancel} onPress={() => setStep('phone')}>
                <Text style={styles.cancelText}>{t.common.back}</Text>
              </Pressable>
            </>
          )}

          {step === 'password' && (
            <>
              <Text style={styles.title}>{t.forgot.newPassword}</Text>
              <Text style={styles.hint}>{t.forgot.phoneHint}</Text>
              <Text style={styles.label}>{t.forgot.newPassword}</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder={t.security.passwordMin}
                placeholderTextColor={C.muted2}
                autoCapitalize="none"
              />
              <Text style={styles.label}>{t.forgot.confirmPassword}</Text>
              <TextInput
                style={styles.input}
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                placeholder={t.forgot.confirmPassword}
                placeholderTextColor={C.muted2}
                autoCapitalize="none"
              />
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
              <Pressable style={styles.cancel} onPress={() => setStep('otp')}>
                <Text style={styles.cancelText}>{t.common.back}</Text>
              </Pressable>
            </>
          )}

          {step === 'done' && (
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
  title: { fontFamily: F.sora, fontSize: 20, fontWeight: '800', color: C.txt, marginBottom: 8 },
  hint: {
    fontFamily: F.manrope,
    fontSize: 13,
    color: C.prMuted,
    marginBottom: 12,
    lineHeight: 18,
  },
  info: {
    fontFamily: F.manrope,
    fontSize: 13,
    color: C.green,
    marginBottom: 8,
  },
  label: {
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: C.prMuted2,
    marginBottom: 4,
    marginTop: 8,
  },
  phoneRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  phoneInput: { flex: 1 },
  input: {
    fontFamily: F.sora,
    fontSize: 16,
    fontWeight: '600',
    color: C.txt,
    borderWidth: 1,
    borderColor: C.line2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  error: { marginTop: 10, fontFamily: F.manrope, fontSize: 13, color: C.red },
  primary: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { fontFamily: F.sora, fontSize: 16, fontWeight: '700', color: '#241a08' },
  cancel: { marginTop: 10, alignItems: 'center', padding: 10 },
  cancelText: { fontFamily: F.sora, fontSize: 14, fontWeight: '600', color: C.muted },
});
