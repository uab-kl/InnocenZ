/**
 * PR sign-in — brand-led first screen: atmosphere, wordmark, one form, one CTA.
 * Phone is country code + local number; last dial country is remembered.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../theme/theme';
import { ApiError } from '../lib/api';
import {
  loadPhoneCountryCode,
  localPhoneDigits,
  phoneLoginIdentifier,
  savePhoneCountryCode,
} from '../lib/phone-prefs';
import { useSession } from '../lib/session';
import { IzButton } from '../components/ui';
import { Eye, EyeOff, Lock, LogIn } from '../components/icons';
import { COUNTRY_BY_CODE, COUNTRY_DIAL_OPTIONS } from './sign-up/constants';
import { Picker } from './sign-up/fields';

const DIAL_PICKER_OPTIONS = COUNTRY_DIAL_OPTIONS.map((c) => ({
  value: c.countryCode,
  label: c.label,
  flag: c.flag,
  name: c.name,
  meta: c.dialCode,
}));

export function LoginScreen({ onCreateAccount }: { onCreateAccount?: () => void } = {}) {
  const { signIn } = useSession();
  const insets = useSafeAreaInsets();
  const [phoneCountryCode, setPhoneCountryCode] = useState(loadPhoneCountryCode);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);

  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 520,
      useNativeDriver: true,
    }).start();
  }, [enter]);

  const brandOpacity = enter;
  const brandY = enter.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const formOpacity = enter.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0, 1] });
  const formY = enter.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });

  const localDigits = useMemo(() => localPhoneDigits(phoneNumber), [phoneNumber]);
  const country = COUNTRY_BY_CODE[phoneCountryCode];
  const closedDialLabel = country
    ? `${country.flag ? `${country.flag} ` : ''}${country.dialCode}`
    : null;

  const canSubmit = Boolean(phoneCountryCode && localDigits && password);

  const submit = async () => {
    if (busy || !canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      savePhoneCountryCode(phoneCountryCode);
      await signIn(phoneLoginIdentifier(phoneCountryCode, phoneNumber), password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Sign in failed — please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.atmosphere} pointerEvents="none">
        <View style={[styles.orb, styles.orbTop]} />
        <View style={[styles.orb, styles.orbGold]} />
        <View style={[styles.orb, styles.orbBottom]} />
        <View style={styles.vignette} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: Math.max(insets.top, 20) + 36,
              paddingBottom: 28 + Math.max(insets.bottom, 16),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              styles.brand,
              { opacity: brandOpacity, transform: [{ translateY: brandY }] },
            ]}
          >
            <Text style={styles.wordmark}>InnocenZ</Text>
            <View style={styles.brandRule} />
            <Text style={styles.brandLine}>For promotional models</Text>
          </Animated.View>

          <Animated.View
            style={[
              styles.formBlock,
              { opacity: formOpacity, transform: [{ translateY: formY }] },
            ]}
          >
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in with your mobile number.</Text>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Mobile number</Text>
              <View style={styles.phoneRow}>
                <Picker
                  value={phoneCountryCode}
                  options={DIAL_PICKER_OPTIONS}
                  onSelect={(code) => {
                    setPhoneCountryCode(code);
                    savePhoneCountryCode(code);
                    if (error) setError(null);
                  }}
                  width={118}
                  placeholder="Code"
                  displayValue={closedDialLabel}
                  title="Country & dial code"
                  searchable
                />
                <View
                  style={[
                    styles.inputWrap,
                    styles.phoneInput,
                    phoneFocused && styles.inputWrapFocused,
                    error && styles.inputWrapError,
                  ]}
                >
                  <TextInput
                    style={styles.input}
                    value={phoneNumber}
                    onChangeText={(t) => {
                      setPhoneNumber(t);
                      if (error) setError(null);
                    }}
                    onFocus={() => setPhoneFocused(true)}
                    onBlur={() => setPhoneFocused(false)}
                    placeholder="123456789"
                    placeholderTextColor={C.muted2}
                    keyboardType="phone-pad"
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="telephoneNumber"
                  />
                </View>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Password</Text>
              <View
                style={[
                  styles.inputWrap,
                  passFocused && styles.inputWrapFocused,
                  error && styles.inputWrapError,
                ]}
              >
                <Lock size={16} color={passFocused ? C.accentL : C.muted2} />
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    if (error) setError(null);
                  }}
                  onFocus={() => setPassFocused(true)}
                  onBlur={() => setPassFocused(false)}
                  placeholder="Your password"
                  placeholderTextColor={C.muted2}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  onSubmitEditing={submit}
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={10}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff size={17} color={C.muted2} />
                  ) : (
                    <Eye size={17} color={C.muted2} />
                  )}
                </Pressable>
              </View>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <IzButton
              label={busy ? 'Signing in…' : 'Sign in'}
              icon={LogIn}
              onPress={submit}
              disabled={busy || !canSubmit}
              style={styles.cta}
            />

            {onCreateAccount ? (
              <Pressable onPress={onCreateAccount} hitSlop={10} style={styles.signUpLink}>
                <Text style={styles.signUpText}>
                  New here? <Text style={styles.signUpAccent}>Create an account</Text>
                </Text>
              </Pressable>
            ) : null}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg2,
  },
  flex: { flex: 1 },
  atmosphere: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orbTop: {
    width: 340,
    height: 340,
    top: -120,
    right: -80,
    backgroundColor: 'rgba(183,156,232,0.18)',
  },
  orbGold: {
    width: 220,
    height: 220,
    top: '28%',
    left: -90,
    backgroundColor: 'rgba(227,184,119,0.10)',
  },
  orbBottom: {
    width: 280,
    height: 280,
    bottom: -100,
    right: -60,
    backgroundColor: 'rgba(155,126,217,0.12)',
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,17,32,0.35)',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  brand: {
    alignItems: 'center',
    marginBottom: 40,
  },
  wordmark: {
    fontFamily: F.playfair,
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: C.accentL,
    textAlign: 'center',
  },
  brandRule: {
    width: 36,
    height: 1.5,
    backgroundColor: C.accent,
    marginTop: 14,
    marginBottom: 12,
    opacity: 0.85,
  },
  brandLine: {
    fontFamily: F.manrope,
    fontSize: 13,
    letterSpacing: 0.4,
    color: C.prMuted,
  },
  formBlock: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  title: {
    fontFamily: F.sora,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: C.txt,
  },
  subtitle: {
    fontFamily: F.manrope,
    fontSize: 15,
    lineHeight: 22,
    color: C.prMuted,
    marginTop: 6,
    marginBottom: 26,
  },
  field: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: C.muted,
    marginBottom: 8,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  phoneInput: {
    flex: 1,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(33,29,46,0.72)',
    paddingHorizontal: 16,
    minHeight: 52,
  },
  inputWrapFocused: {
    borderColor: 'rgba(227,184,119,0.55)',
    backgroundColor: 'rgba(42,37,56,0.9)',
  },
  inputWrapError: {
    borderColor: 'rgba(240,138,138,0.45)',
  },
  input: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontFamily: F.sora,
    fontSize: 16,
    fontWeight: '500',
    color: C.txt,
  },
  error: {
    fontFamily: F.manrope,
    fontSize: 14,
    lineHeight: 20,
    color: C.red,
    marginBottom: 12,
  },
  cta: {
    marginTop: 6,
  },
  signUpLink: {
    alignSelf: 'center',
    marginTop: 22,
    paddingVertical: 8,
  },
  signUpText: {
    fontFamily: F.manrope,
    fontSize: 15,
    color: C.prMuted,
  },
  signUpAccent: {
    fontFamily: F.sora,
    fontWeight: '700',
    color: C.accentL,
  },
});
