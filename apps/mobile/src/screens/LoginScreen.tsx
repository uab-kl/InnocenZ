/**
 * PR sign-in — styled like the prototype's PR portal auth screen (wordmark +
 * tagline, `iz-field-input` fields, gold Sign in CTA) but authenticating for
 * real against the backend the admin portal uses.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, F } from '../theme/theme';
import { ApiError } from '../lib/api';
import { useSession } from '../lib/session';
import { IzButton } from '../components/ui';
import { Eye, EyeOff, Lock, LogIn, Phone } from '../components/icons';

export function LoginScreen({ onCreateAccount }: { onCreateAccount?: () => void } = {}) {
  const { signIn } = useSession();
  const [identifier, setIdentifier] = useState('60123456789');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(identifier, password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Sign in failed — please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.brand}>
        <Text style={styles.wordmark}>InnocenZ</Text>
        <Text style={styles.tagline}>WORK · FLOW · ELEGANCE</Text>
      </View>

      <Text style={styles.title}>PR sign in</Text>
      <Text style={styles.subtitle}>Sign in with your registered mobile number.</Text>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Mobile number</Text>
        <View style={styles.inputWrap}>
          <Phone size={15} color={C.muted2} />
          <TextInput
            style={styles.input}
            value={identifier}
            onChangeText={setIdentifier}
            placeholder="60123456789"
            placeholderTextColor={C.muted2}
            keyboardType="phone-pad"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Password</Text>
        <View style={styles.inputWrap}>
          <Lock size={15} color={C.muted2} />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={C.muted2}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={submit}
          />
          <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
            {showPassword ? (
              <EyeOff size={16} color={C.muted2} />
            ) : (
              <Eye size={16} color={C.muted2} />
            )}
          </Pressable>
        </View>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <IzButton
        label={busy ? 'Signing in…' : 'Sign in'}
        icon={LogIn}
        onPress={submit}
        disabled={busy || !identifier.trim() || !password}
        style={{ marginTop: 8 }}
      />

      {onCreateAccount && (
        <Pressable onPress={onCreateAccount} hitSlop={8} style={styles.signUpLink}>
          <Text style={styles.signUpText}>
            New here? <Text style={styles.signUpAccent}>Create an account</Text>
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 48,
    paddingBottom: 26,
  },
  brand: {
    alignItems: 'center',
    gap: 4,
    marginBottom: 36,
  },
  wordmark: {
    fontFamily: F.playfair,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: C.accentL,
  },
  tagline: {
    fontFamily: F.sora,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    color: C.accent,
  },
  title: {
    fontFamily: F.sora,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: C.txt,
  },
  subtitle: {
    fontFamily: F.manrope,
    fontSize: C.fsTiny,
    lineHeight: C.fsTiny * 1.55,
    color: C.prMuted,
    marginTop: 4,
    marginBottom: 22,
  },
  field: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontFamily: F.sora,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
    color: C.prMuted,
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.bg2,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontFamily: F.sora,
    fontSize: 16,
    fontWeight: '600',
    color: C.txt,
  },
  error: {
    fontFamily: F.manrope,
    fontSize: C.fsTiny,
    lineHeight: C.fsTiny * 1.4,
    color: C.red,
    marginBottom: 10,
  },
  signUpLink: {
    alignSelf: 'center',
    marginTop: 18,
    paddingVertical: 6,
  },
  signUpText: {
    fontFamily: F.manrope,
    fontSize: C.fsTiny,
    color: C.prMuted,
  },
  signUpAccent: {
    fontFamily: F.sora,
    fontWeight: '700',
    color: C.accent,
  },
});
