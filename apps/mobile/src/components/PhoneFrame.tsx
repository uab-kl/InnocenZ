/**
 * Phone shell — port of the prototype's `.iz-shell` / `.iz-phone` frame:
 * desktop web gets the bezel (like the deployed proto), narrow web / native
 * fills the screen edge-to-edge. Fake iOS status bar / notch removed.
 */
import React, { useEffect, useRef, type ReactNode } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, GRADIENTS, grad } from '../theme/theme';
import { useViewportSize } from '../lib/viewport';
import { notePhoneScrollMetrics, registerPhoneScrollView, refreshPhoneScrollWindow } from '../lib/phone-scroll';

/**
 * DOM id of the phone screen container on web — PhoneSheet portals bottom
 * sheets into it so they stay inside the frame instead of covering the
 * whole browser viewport.
 */
export const PHONE_SCREEN_ID = 'iz-phone-screen';

export function PhoneFrame({
  children,
  header,
  footer,
  overlay,
  scroll = true,
}: {
  children: ReactNode;
  /** Status bar — pinned above the scroll area, fixed on every page. */
  header?: ReactNode;
  /** Bottom tab bar — pinned under the scroll area. */
  footer?: ReactNode;
  /** Sheets / modals — rendered over the frame. */
  overlay?: ReactNode;
  scroll?: boolean;
}) {
  const { width, height } = useViewportSize();
  const framed = Platform.OS === 'web' && width > 520;
  // Real device notch/status-bar and nav-button heights — all zero on web, so
  // the desktop bezel preview is unaffected.
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const setScrollRef = (node: ScrollView | null) => {
    scrollRef.current = node;
    registerPhoneScrollView(node);
  };

  useEffect(() => {
    if (!scroll) {
      registerPhoneScrollView(null);
      return;
    }
    registerPhoneScrollView(scrollRef.current);
    return () => registerPhoneScrollView(null);
  }, [scroll]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    notePhoneScrollMetrics(contentOffset.y, layoutMeasurement.height, contentSize.height);
  };

  const body = (
    <View
      nativeID={PHONE_SCREEN_ID}
      style={[
        styles.phone,
        grad(GRADIENTS.phone, C.bg),
        framed
          ? { width: 392, height: Math.min(850, height * 0.96), borderRadius: 48, ...webPhoneShadow }
          : styles.phoneFull,
      ]}
    >
      {header && (
        <View style={[styles.header, insets.top > 0 && { paddingTop: insets.top }]}>
          {header}
        </View>
      )}
      {scroll ? (
        <ScrollView
          ref={setScrollRef}
          key="phone-scroll"
          style={styles.viewport}
          contentContainerStyle={
            footer ? { paddingBottom: C.tabbarH + insets.bottom } : undefined
          }
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={onScroll}
          onContentSizeChange={(_w, h) => {
            notePhoneScrollMetrics(undefined, undefined, h);
          }}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0) notePhoneScrollMetrics(undefined, h, undefined);
            refreshPhoneScrollWindow();
          }}
        >
          {children}
        </ScrollView>
      ) : (
        <View key="phone-static" style={styles.viewport}>
          {children}
        </View>
      )}
      {footer && (
        <View
          style={[
            styles.footer,
            insets.bottom > 0 && { paddingBottom: insets.bottom, backgroundColor: C.bg },
          ]}
        >
          {footer}
        </View>
      )}
      {overlay}
    </View>
  );

  if (!framed) return body;

  return <View style={[styles.shell, grad(GRADIENTS.shell, C.bg)]}>{body}</View>;
}

const webPhoneShadow =
  Platform.OS === 'web'
    ? {
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.04), 0 0 0 1px rgba(183,156,232,0.14), 0 0 0 11px #141120, 0 0 0 12px #2a2438, 0 40px 100px -20px rgba(0,0,0,0.85), 0 0 100px -10px rgba(183,156,232,0.22)',
      }
    : {};

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    backgroundColor: C.bg,
    overflow: 'hidden',
  },
  phone: {
    overflow: 'hidden',
    flexDirection: 'column',
  },
  phoneFull: {
    flex: 1,
    width: '100%',
  },
  header: {
    zIndex: 30,
  },
  viewport: {
    flex: 1,
    minHeight: 0,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
  },
});
