/**
 * Toast pinned to the phone screen (not the scroll content), sitting just
 * below center. Web: portals into PhoneFrame. Native: transparent Modal.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { createPortal } from 'react-dom';

/** Exactly what react-dom's createPortal accepts as a container. */
type PortalHost = Parameters<typeof createPortal>[1];
import { C, F } from '../theme/theme';
import { PHONE_SCREEN_ID } from './PhoneFrame';

/** How far under the vertical center the toast sits. */
const BELOW_CENTER_OFFSET = 60;

export type ToastVariant = 'success' | 'error' | 'info';

export function useToast(durationMs = 2500) {
  const [message, setMessage] = useState<string | null>(null);
  const [variant, setVariant] = useState<ToastVariant>('success');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const showToast = useCallback(
    (msg: string, nextVariant: ToastVariant = 'success') => {
      if (timer.current) clearTimeout(timer.current);
      setVariant(nextVariant);
      setMessage(msg);
      timer.current = setTimeout(() => setMessage(null), durationMs);
    },
    [durationMs],
  );

  const clearToast = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(null);
  }, []);

  return { message, variant, showToast, clearToast };
}

export function AppToast({
  message,
  variant = 'success',
}: {
  message: string | null;
  variant?: ToastVariant;
}) {
  const visible = Boolean(message);

  const body = (
    <View pointerEvents="none" style={styles.host}>
      <View
        style={[
          styles.pill,
          variant === 'error' && styles.pillError,
          variant === 'info' && styles.pillInfo,
        ]}
      >
        <Text
          style={[
            styles.text,
            variant === 'error' && styles.textError,
            variant === 'info' && styles.textInfo,
          ]}
          numberOfLines={3}
        >
          {message}
        </Text>
      </View>
    </View>
  );

  if (Platform.OS === 'web') {
    if (!visible) return null;
    // RN has no DOM lib (deliberately), so reach the browser document through
    // globalThis rather than declaring a global — the same idiom as
    // lib/proof-photo.ts. A global `document` would let native-only files
    // reference it and still type-check, which is the bug this avoids.
    const doc = (
      globalThis as {
        document?: { getElementById: (id: string) => PortalHost | null };
      }
    ).document;
    const host = doc?.getElementById(PHONE_SCREEN_ID) ?? null;
    return host ? createPortal(body, host) : body;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      {body}
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    // Centered, nudged below the middle of the screen.
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: BELOW_CENTER_OFFSET * 2,
    zIndex: 200,
    paddingHorizontal: 24,
  },
  pill: {
    maxWidth: 340,
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(18, 72, 52, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(93, 217, 160, 0.5)',
  },
  pillError: {
    backgroundColor: 'rgba(90, 28, 36, 0.96)',
    borderColor: 'rgba(240, 138, 138, 0.5)',
  },
  pillInfo: {
    backgroundColor: 'rgba(30, 24, 48, 0.96)',
    borderColor: 'rgba(183, 156, 232, 0.45)',
  },
  text: {
    fontFamily: F.manrope,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: C.green,
    textAlign: 'center',
  },
  textError: { color: '#f0a0a0' },
  textInfo: { color: C.txt },
});
