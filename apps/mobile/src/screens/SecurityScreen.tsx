/**
 * Security settings — change password (current password) and change phone
 * (WhatsApp OTP on the new number).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, F, GRADIENTS, grad } from '../theme/theme';
import { font } from '../theme/fonts';
import { usePrNav } from '../lib/pr-nav';
import { useSession } from '../lib/session';
import { formatMessage, useLocale } from '../i18n';
import { useKeyboardInset } from '../lib/use-keyboard-inset';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ApiError,
  changePassword,
  changePhoneWithOtp,
  deleteOwnAccount,
  sendPrOtp,
  verifyPrOtp,
} from '../lib/api';
import {
  loadPhoneCountryCode,
  localPhoneDigits,
  phoneLoginIdentifier,
  savePhoneCountryCode,
} from '../lib/phone-prefs';
import { ChevronLeft, Lock, Phone, Shield, Trash2 } from '../components/icons';
import { COUNTRY_BY_CODE, COUNTRY_DIAL_OPTIONS } from './sign-up/constants';
import { Picker } from './sign-up/fields';
import { normalizeOtpInput } from './sign-up/step-6';

type Sheet = null | 'menu' | 'password' | 'phone' | 'otp' | 'delete';

const DIAL_PICKER_OPTIONS = COUNTRY_DIAL_OPTIONS.map((c) => ({
  value: c.countryCode,
  label: c.label,
  flag: c.flag,
  name: c.name,
  meta: c.dialCode,
}));

export function SecurityScreen() {
  const { goBack } = usePrNav();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  const { me, token, signOut, refreshMe } = useSession();
  const [sheet, setSheet] = useState<Sheet>('menu');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [deletePw, setDeletePw] = useState('');

  const [phoneCountryCode, setPhoneCountryCode] = useState(loadPhoneCountryCode);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [resendIn, setResendIn] = useState(0);

  const localDigits = useMemo(() => localPhoneDigits(phoneNumber), [phoneNumber]);
  const country = COUNTRY_BY_CODE[phoneCountryCode];
  const fullPhone = phoneLoginIdentifier(phoneCountryCode, phoneNumber);
  const closedDialLabel = country
    ? `${country.flag ? `${country.flag} ` : ''}${country.dialCode}`
    : null;
  const displayPhone = `${country?.dialCode ?? ''} ${localDigits}`.trim();

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const closeAll = () => {
    setSheet(null);
    goBack();
  };

  const savePassword = async () => {
    if (!token || busy) return;
    if (newPw.length < 6) {
      setError(t.security.passwordMin);
      return;
    }
    if (newPw !== confirmPw) {
      setError(t.security.passwordMismatch);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await changePassword(token, curPw, newPw);
      setMsg(t.security.passwordUpdated);
      setSheet('menu');
      setCurPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.security.updatePasswordFailed);
    } finally {
      setBusy(false);
    }
  };

  const sendPhoneOtp = async () => {
    if (!token || !localDigits || busy) return;
    setBusy(true);
    setError(null);
    try {
      savePhoneCountryCode(phoneCountryCode);
      const res = await sendPrOtp(fullPhone, 'change_phone', token);
      setResendIn(res.resendAfterSec ?? 60);
      setOtp('');
      setSheet('otp');
      setMsg(formatMessage(t.security.codeSentTo, { phone: displayPhone }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.security.sendCodeFailed);
    } finally {
      setBusy(false);
    }
  };

  const verifyPhoneOtp = async () => {
    if (!token || otp.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const verified = await verifyPrOtp(fullPhone, otp, 'change_phone');
      await changePhoneWithOtp(token, fullPhone, verified.verificationId);
      await refreshMe();
      setMsg(t.security.phoneUpdated);
      setSheet('menu');
      setPhoneNumber('');
      setOtp('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.security.updatePhoneFailed);
    } finally {
      setBusy(false);
    }
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
      setError(e instanceof ApiError ? e.message : t.security.deleteAccountFailed);
    } finally {
      setBusy(false);
    }
  };

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
      </Text>

      {msg ? <Text style={styles.toast}>{msg}</Text> : null}

      <Pressable style={styles.card} onPress={() => setSheet('menu')}>
        <Lock size={18} color={C.goldL} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{t.security.title}</Text>
          <Text style={styles.cardSub}>
            {t.security.changePassword} · {t.security.changePhone}
          </Text>
        </View>
      </Pressable>

      <Pressable
        style={[styles.card, styles.dangerCard]}
        onPress={() => {
          setError(null);
          setDeletePw('');
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
        onRequestClose={() => setSheet(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSheet(null)}>
          <Pressable
            style={[styles.sheet, keyboardInset > 0 && { paddingBottom: keyboardInset + 16 }]}
            onPress={(e) => e.stopPropagation()}
          >
            {sheet === 'menu' && (
              <>
                <Text style={styles.sheetTitle}>{t.security.title}</Text>
                <MenuRow
                  icon={Lock}
                  label={t.security.changePassword}
                  onPress={() => {
                    setError(null);
                    setSheet('password');
                  }}
                />
                <MenuRow
                  icon={Phone}
                  label={t.security.changePhone}
                  onPress={() => {
                    setError(null);
                    setSheet('phone');
                  }}
                />
                <Pressable style={styles.sheetCancel} onPress={() => setSheet(null)}>
                  <Text style={styles.sheetCancelText}>{t.common.close}</Text>
                </Pressable>
              </>
            )}

            {sheet === 'password' && (
              <>
                <Text style={styles.sheetTitle}>{t.security.changePassword}</Text>
                <Field label={t.security.currentPassword} value={curPw} onChange={setCurPw} secure />
                <Field label={t.security.newPassword} value={newPw} onChange={setNewPw} secure />
                <Field
                  label={t.security.confirmPassword}
                  value={confirmPw}
                  onChange={setConfirmPw}
                  secure
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
                <Pressable style={styles.sheetCancel} onPress={() => setSheet('menu')}>
                  <Text style={styles.sheetCancelText}>{t.common.back}</Text>
                </Pressable>
              </>
            )}

            {sheet === 'phone' && (
              <>
                <Text style={styles.sheetTitle}>{t.security.changePhone}</Text>
                <Text style={styles.sheetHint}>{t.security.changePhoneHint}</Text>
                <Text style={styles.fieldLabel}>{t.security.newMobileNumber}</Text>
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
                {error ? <Text style={styles.sheetError}>{error}</Text> : null}
                <Pressable
                  style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
                  onPress={() => void sendPhoneOtp()}
                  disabled={busy || !localDigits}
                >
                  <Text style={styles.primaryText}>
                    {busy ? t.forgot.sending : t.security.sendWhatsappCode}
                  </Text>
                </Pressable>
                <Pressable style={styles.sheetCancel} onPress={() => setSheet('menu')}>
                  <Text style={styles.sheetCancelText}>{t.common.back}</Text>
                </Pressable>
              </>
            )}

            {sheet === 'otp' && (
              <>
                <Text style={styles.sheetTitle}>{t.security.otpTitle}</Text>
                <Text style={styles.sheetHint}>
                  {formatMessage(t.security.otpHint, { phone: displayPhone })}
                </Text>
                <Field
                  label={t.security.otpLabel}
                  value={otp}
                  onChange={(v) => setOtp(normalizeOtpInput(v))}
                  keyboardType="number-pad"
                />
                {error ? <Text style={styles.sheetError}>{error}</Text> : null}
                <Pressable
                  style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
                  onPress={() => void verifyPhoneOtp()}
                  disabled={busy || otp.length !== 6}
                >
                  <Text style={styles.primaryText}>
                    {busy ? t.forgot.saving : t.security.verifyAndSave}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.sheetCancel}
                  onPress={() => resendIn === 0 && void sendPhoneOtp()}
                  disabled={resendIn > 0 || busy}
                >
                  <Text style={styles.sheetCancelText}>
                    {resendIn > 0
                      ? formatMessage(t.forgot.resendIn, { s: resendIn })
                      : t.forgot.resend}
                  </Text>
                </Pressable>
                <Pressable style={styles.sheetCancel} onPress={() => setSheet('phone')}>
                  <Text style={styles.sheetCancelText}>{t.common.back}</Text>
                </Pressable>
              </>
            )}

            {sheet === 'delete' && (
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secure?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'phone-pad';
}) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        keyboardType={keyboardType}
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
  sheetError: { marginTop: 10, ...font(), fontSize: 13, color: C.red },
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
