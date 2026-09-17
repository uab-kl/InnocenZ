/**
 * PR sign-in — brand-led first screen: logo, atmosphere, one form, one CTA.
 * Phone is country code + local number; last dial country is remembered.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
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
import { font } from '../theme/fonts';
import { ApiError } from '../lib/api';
import { localizeSignInError } from '../lib/api-error-copy';
import { useKeyboardHeight } from '../lib/keyboard';
import {
  loadPhoneCountryCode,
  localPhoneDigits,
  phoneLoginIdentifier,
  savePhoneCountryCode,
} from '../lib/phone-prefs';
import { useSession } from '../lib/session';
import { useLocale } from '../i18n';
import { IzButton } from '../components/ui';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { Eye, EyeOff, Lock, LogIn } from '../components/icons';
import { ForgotPasswordModal } from './ForgotPasswordModal';
import { COUNTRY_BY_CODE, COUNTRY_DIAL_OPTIONS } from './sign-up/constants';
import { Picker } from './sign-up/fields';
import {
  KeyboardScrollProvider,
  reportFocusFromView,
  useKeyboardScroll,
} from './sign-up/keyboard-scroll';

const LOGO = require('../../assets/images/innocenz-logo.png');

const DIAL_PICKER_OPTIONS = COUNTRY_DIAL_OPTIONS.map((c) => ({
  value: c.countryCode,
  label: c.label,
  flag: c.flag,
  name: c.name,
  meta: c.dialCode,
}));

export function LoginScreen({ onCreateAccount }: { onCreateAccount?: () => void } = {}) {
  const scroller = useRef<ScrollView | null>(null);
  return (
    <KeyboardScrollProvider scrollRef={scroller} footerReserve={24}>
      <LoginScreenInner onCreateAccount={onCreateAccount} scroller={scroller} />
    </KeyboardScrollProvider>
  );
}

function LoginScreenInner({
  onCreateAccount,
  scroller,
}: {
  onCreateAccount?: () => void;
  scroller: React.RefObject<ScrollView | null>;
}) {
  const { signIn } = useSession();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const keyboardScroll = useKeyboardScroll();
  const keyboardHeight = useKeyboardHeight();
  const phoneWrapRef = useRef<View>(null);
  const passWrapRef = useRef<View>(null);

  const [phoneCountryCode, setPhoneCountryCode] = useState(loadPhoneCountryCode);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

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
  const liftedPad =
    keyboardHeight > 0 ? Math.max(0, keyboardHeight - insets.bottom) + 12 : 0;

  const reveal = (wrap: View | null) => {
    const run = () =>
      reportFocusFromView(wrap, keyboardScroll?.ensureVisible);
    run();
    setTimeout(run, 120);
    setTimeout(run, 360);
  };

  const submit = async () => {
    if (busy || !canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      savePhoneCountryCode(phoneCountryCode);
      await signIn(phoneLoginIdentifier(phoneCountryCode, phoneNumber), password);
    } catch (e) {
      // localizeSignInError, not localizeLoginError: signIn re-throws the
      // limiter's 429 and the 500 catch-all too, and those need the shared map.
      setError(
        e instanceof ApiError
          ? localizeSignInError(e.message, t)
          : t.login.signInFailed,
      );
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
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <ScrollView
          ref={scroller}
          contentContainerStyle={[
            styles.scroll,
            keyboardHeight > 0 ? styles.scrollKeyboard : styles.scrollIdle,
            {
              paddingTop: Math.max(insets.top, 20) + (keyboardHeight > 0 ? 12 : 28),
              paddingBottom: 28 + Math.max(insets.bottom, 16) + liftedPad,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          onScroll={(e) => keyboardScroll?.onScrollY(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
        >
          <Animated.View
            style={[
              styles.brand,
              keyboardHeight > 0 && styles.brandCompact,
              { opacity: brandOpacity, transform: [{ translateY: brandY }] },
            ]}
          >
            <View style={styles.langRow}>
              <LanguageSwitcher compact />
            </View>
            <Image
              source={LOGO}
              style={[styles.logo, keyboardHeight > 0 && styles.logoCompact]}
              resizeMode="contain"
              accessibilityLabel={t.login.logoAlt}
            />
            <Text style={[styles.wordmark, keyboardHeight > 0 && styles.wordmarkCompact]}>
              InnocenZ
            </Text>
            {keyboardHeight === 0 ? (
              <Text style={styles.brandLine}>{t.login.brandLine}</Text>
            ) : null}
          </Animated.View>

          <Animated.View
            style={[
              styles.formBlock,
              { opacity: formOpacity, transform: [{ translateY: formY }] },
            ]}
          >
            <Text style={styles.title}>{t.login.title}</Text>
            <Text style={styles.subtitle}>{t.login.subtitle}</Text>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>{t.login.mobileNumber}</Text>
              <View ref={phoneWrapRef} style={styles.phoneRow} collapsable={false}>
                <Picker
                  value={phoneCountryCode}
                  options={DIAL_PICKER_OPTIONS}
                  onSelect={(code) => {
                    setPhoneCountryCode(code);
                    savePhoneCountryCode(code);
                    if (error) setError(null);
                  }}
                  width={118}
                  placeholder={t.login.dialCode}
                  displayValue={closedDialLabel}
                  title={t.login.dialTitle}
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
                    onChangeText={(text) => {
                      setPhoneNumber(text);
                      if (error) setError(null);
                    }}
                    onFocus={() => {
                      setPhoneFocused(true);
                      reveal(phoneWrapRef.current);
                    }}
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

            <View style={styles.field} ref={passWrapRef} collapsable={false}>
              <Text style={styles.fieldLabel}>{t.login.password}</Text>
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
                  onChangeText={(text) => {
                    setPassword(text);
                    if (error) setError(null);
                  }}
                  onFocus={() => {
                    setPassFocused(true);
                    reveal(passWrapRef.current);
                  }}
                  onBlur={() => setPassFocused(false)}
                  placeholder={t.login.passwordPlaceholder}
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
                  accessibilityLabel={showPassword ? t.login.hidePassword : t.login.showPassword}
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

            <Pressable
              onPress={() => setForgotOpen(true)}
              hitSlop={10}
              style={styles.forgotLink}
            >
              <Text style={styles.forgotText}>{t.login.forgotPassword}</Text>
            </Pressable>

            <IzButton
              label={busy ? t.login.signingIn : t.login.signIn}
              icon={LogIn}
              onPress={submit}
              disabled={busy || !canSubmit}
              style={styles.cta}
            />

            {onCreateAccount ? (
              <Pressable onPress={onCreateAccount} hitSlop={10} style={styles.signUpLink}>
                <Text style={styles.signUpText}>
                  {t.login.newHere}{' '}
                  <Text style={styles.signUpAccent}>{t.login.createAccount}</Text>
                </Text>
              </Pressable>
            ) : null}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ForgotPasswordModal
        visible={forgotOpen}
        onClose={() => setForgotOpen(false)}
        initialCountryCode={phoneCountryCode}
        initialLocalNumber={phoneNumber}
      />
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
  },
  scrollIdle: {
    justifyContent: 'center',
  },
  scrollKeyboard: {
    justifyContent: 'flex-start',
  },
  brand: {
    alignItems: 'center',
    marginBottom: 32,
  },
  langRow: {
    alignSelf: 'stretch',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  brandCompact: {
    marginBottom: 16,
  },
  logo: {
    width: 88,
    height: 88,
    marginBottom: 14,
    borderRadius: 44,
  },
  logoCompact: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginBottom: 8,
  },
  wordmark: {
    fontFamily: F.playfair,
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: C.accentL,
    textAlign: 'center',
  },
  wordmarkCompact: {
    fontSize: 26,
  },
  brandLine: {
    ...font(),
    fontSize: 13,
    letterSpacing: 0.4,
    color: C.prMuted,
    marginTop: 8,
  },
  formBlock: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  title: {
    ...font(700),
    fontSize: 22,
    letterSpacing: -0.3,
    color: C.txt,
  },
  subtitle: {
    ...font(),
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
    ...font(600),
    fontSize: 12,
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
    ...font(500),
    fontSize: 16,
    color: C.txt,
  },
  error: {
    ...font(),
    fontSize: 14,
    lineHeight: 20,
    color: C.red,
    marginBottom: 12,
  },
  forgotLink: {
    alignSelf: 'flex-end',
    marginBottom: 10,
    paddingVertical: 4,
  },
  forgotText: {
    ...font(600),
    fontSize: 13,
    color: C.accentL,
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
    ...font(),
    fontSize: 15,
    color: C.prMuted,
  },
  signUpAccent: {
    ...font(700),
    color: C.accentL,
  },
});
