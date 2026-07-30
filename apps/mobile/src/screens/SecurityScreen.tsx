/**
 * Security settings — port of InnocenZ-proto `/host/security`
 * (change password / phone / email + OTP + delete account sheets).
 */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, F, GRADIENTS, grad } from '../theme/theme';
import { usePrNav } from '../lib/pr-nav';
import { useSession } from '../lib/session';
import { useKeyboardInset } from '../lib/use-keyboard-inset';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Lock, Phone, Shield, Trash2 } from '../components/icons';

type Sheet =
  | null
  | 'menu'
  | 'password'
  | 'phone'
  | 'email'
  | 'otp'
  | 'delete';

type OtpTarget = 'phone' | 'email';

export function SecurityScreen() {
  const { goBack } = usePrNav();
  // Detail screen outside the tab shell — the back row must clear the status bar.
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  const { me, signOut } = useSession();
  const [sheet, setSheet] = useState<Sheet>('menu');
  const [otpTarget, setOtpTarget] = useState<OtpTarget>('phone');
  const [msg, setMsg] = useState<string | null>(null);

  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [phone, setPhone] = useState(me?.phoneNum ?? '');
  const [email, setEmail] = useState(me?.email ?? '');
  const [otp, setOtp] = useState('');

  const closeAll = () => {
    setSheet(null);
    goBack();
  };

  const savePassword = () => {
    if (newPw.length < 6) {
      setMsg('Password must be at least 6 characters');
      return;
    }
    if (newPw !== confirmPw) {
      setMsg('Passwords do not match');
      return;
    }
    setMsg('Password updated (demo)');
    setSheet('menu');
    setCurPw('');
    setNewPw('');
    setConfirmPw('');
  };

  const sendOtp = (target: OtpTarget) => {
    setOtpTarget(target);
    setOtp('');
    setSheet('otp');
    setMsg(`OTP sent (demo code 123456)`);
  };

  const verifyOtp = () => {
    if (otp.trim() !== '123456') {
      setMsg('Invalid OTP — use 123456 in demo');
      return;
    }
    setMsg(otpTarget === 'phone' ? 'Phone updated (demo)' : 'Email updated (demo)');
    setSheet('menu');
  };

  const deleteAccount = () => {
    setSheet(null);
    signOut();
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <Pressable style={styles.back} onPress={closeAll} hitSlop={10}>
        <ChevronLeft size={20} color={C.goldL} />
        <Text style={styles.backText}>Profile</Text>
      </Pressable>

      <Text style={styles.eyebrow}>ACCOUNT</Text>
      <View style={styles.titleRow}>
        <Shield size={22} color={C.accent} />
        <Text style={styles.title}>Security settings</Text>
      </View>
      <Text style={styles.meta}>
        Change password, phone, or email. Demo OTP is always 123456.
      </Text>

      {msg ? <Text style={styles.toast}>{msg}</Text> : null}

      <Pressable style={styles.card} onPress={() => setSheet('menu')}>
        <Lock size={18} color={C.goldL} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Open security settings</Text>
          <Text style={styles.cardSub}>Password · Phone · Email</Text>
        </View>
      </Pressable>

      <Pressable style={[styles.card, styles.dangerCard]} onPress={() => setSheet('delete')}>
        <Trash2 size={18} color={C.red} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: C.red }]}>Delete account</Text>
          <Text style={styles.cardSub}>Permanently remove this PR account</Text>
        </View>
      </Pressable>

      <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSheet(null)}>
          <Pressable
            style={[styles.sheet, keyboardInset > 0 && { paddingBottom: keyboardInset + 16 }]}
            onPress={(e) => e.stopPropagation()}
          >
            {sheet === 'menu' && (
              <>
                <Text style={styles.sheetTitle}>Security settings</Text>
                <MenuRow
                  icon={Lock}
                  label="Change password"
                  onPress={() => setSheet('password')}
                />
                <MenuRow
                  icon={Phone}
                  label="Change phone"
                  onPress={() => setSheet('phone')}
                />
                <MenuRow
                  icon={Lock}
                  label="Change email"
                  onPress={() => setSheet('email')}
                />
                <Pressable style={styles.sheetCancel} onPress={() => setSheet(null)}>
                  <Text style={styles.sheetCancelText}>Close</Text>
                </Pressable>
              </>
            )}

            {sheet === 'password' && (
              <>
                <Text style={styles.sheetTitle}>Change password</Text>
                <Field label="Current password" value={curPw} onChange={setCurPw} secure />
                <Field label="New password" value={newPw} onChange={setNewPw} secure />
                <Field label="Confirm new password" value={confirmPw} onChange={setConfirmPw} secure />
                <Pressable
                  style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
                  onPress={savePassword}
                >
                  <Text style={styles.primaryText}>Save password</Text>
                </Pressable>
                <Pressable style={styles.sheetCancel} onPress={() => setSheet('menu')}>
                  <Text style={styles.sheetCancelText}>Back</Text>
                </Pressable>
              </>
            )}

            {sheet === 'phone' && (
              <>
                <Text style={styles.sheetTitle}>Change phone</Text>
                <Field label="New phone" value={phone} onChange={setPhone} />
                <Pressable
                  style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
                  onPress={() => sendOtp('phone')}
                >
                  <Text style={styles.primaryText}>Send OTP &amp; update</Text>
                </Pressable>
                <Pressable style={styles.sheetCancel} onPress={() => setSheet('menu')}>
                  <Text style={styles.sheetCancelText}>Back</Text>
                </Pressable>
              </>
            )}

            {sheet === 'email' && (
              <>
                <Text style={styles.sheetTitle}>Change email</Text>
                <Field label="New email" value={email} onChange={setEmail} />
                <Pressable
                  style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
                  onPress={() => sendOtp('email')}
                >
                  <Text style={styles.primaryText}>Send OTP &amp; update</Text>
                </Pressable>
                <Pressable style={styles.sheetCancel} onPress={() => setSheet('menu')}>
                  <Text style={styles.sheetCancelText}>Back</Text>
                </Pressable>
              </>
            )}

            {sheet === 'otp' && (
              <>
                <Text style={styles.sheetTitle}>Verify OTP</Text>
                <Text style={styles.sheetHint}>
                  Enter the 6-digit code sent to your {otpTarget}. Demo: 123456
                </Text>
                <Field label="OTP" value={otp} onChange={setOtp} />
                <Pressable
                  style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
                  onPress={verifyOtp}
                >
                  <Text style={styles.primaryText}>Verify &amp; save</Text>
                </Pressable>
                <Pressable style={styles.sheetCancel} onPress={() => setSheet('menu')}>
                  <Text style={styles.sheetCancelText}>Back</Text>
                </Pressable>
              </>
            )}

            {sheet === 'delete' && (
              <>
                <Text style={styles.sheetTitle}>Delete account?</Text>
                <Text style={styles.sheetHint}>
                  This permanently removes your PR account from this device session (demo).
                </Text>
                <Pressable style={styles.dangerBtn} onPress={deleteAccount}>
                  <Text style={styles.dangerBtnText}>Delete account</Text>
                </Pressable>
                <Pressable style={styles.sheetCancel} onPress={() => setSheet(null)}>
                  <Text style={styles.sheetCancelText}>Cancel</Text>
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secure?: boolean;
}) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
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
  backText: { fontFamily: F.sora, fontSize: 16, fontWeight: '700', color: C.txt },
  eyebrow: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.68,
    color: '#c4b4d8',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  title: { fontFamily: F.sora, fontSize: 26, fontWeight: '800', color: C.txt },
  meta: { marginTop: 8, fontFamily: F.manrope, fontSize: 13, color: C.prMuted, lineHeight: 18 },
  toast: {
    marginTop: 10,
    fontFamily: F.manrope,
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
  cardTitle: { fontFamily: F.sora, fontSize: 15, fontWeight: '700', color: C.txt },
  cardSub: { marginTop: 2, fontFamily: F.manrope, fontSize: 12, color: C.prMuted },
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
  sheetTitle: { fontFamily: F.sora, fontSize: 20, fontWeight: '800', color: C.txt, marginBottom: 8 },
  sheetHint: { fontFamily: F.manrope, fontSize: 13, color: C.prMuted, marginBottom: 8, lineHeight: 18 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  menuLabel: { fontFamily: F.sora, fontSize: 15, fontWeight: '600', color: C.txt },
  fieldLabel: {
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: C.prMuted2,
    marginBottom: 4,
  },
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
  primary: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { fontFamily: F.sora, fontSize: 16, fontWeight: '700', color: '#241a08' },
  sheetCancel: { marginTop: 10, alignItems: 'center', padding: 10 },
  sheetCancelText: { fontFamily: F.sora, fontSize: 14, fontWeight: '600', color: C.muted },
  dangerBtn: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: C.redBg,
    borderWidth: 1,
    borderColor: 'rgba(240,138,138,0.4)',
  },
  dangerBtnText: { fontFamily: F.sora, fontSize: 16, fontWeight: '700', color: C.red },
});
