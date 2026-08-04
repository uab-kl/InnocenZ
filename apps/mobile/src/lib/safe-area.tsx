/**
 * Safe Area wrapper that falls back when the native module is missing from an
 * older development build (Fabric then throws IllegalViewOperationException /
 * ViewManagerRegistry.get for RNCSafeAreaProvider).
 *
 * After `npx expo run:android` installs a build with safe-area-context linked,
 * the native provider is used automatically.
 */
import React, { type ReactNode } from 'react';
import { Platform, StatusBar, UIManager, useWindowDimensions } from 'react-native';
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider as NativeSafeAreaProvider,
} from 'react-native-safe-area-context';

function hasNativeSafeArea(): boolean {
  if (Platform.OS === 'web') return true;
  try {
    // Paper / Fabric view-manager registry — missing → old APK without the module.
    return UIManager.getViewManagerConfig('RNCSafeAreaProvider') != null;
  } catch {
    return false;
  }
}

function FallbackSafeAreaProvider({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  // StatusBar.currentHeight is often 0 with edge-to-edge / older APKs — floor
  // both insets so auth screens clear the system bars.
  const top = Math.max(StatusBar.currentHeight ?? 0, Platform.OS === 'android' ? 40 : 47);
  const bottom = Platform.OS === 'android' ? 48 : 34;
  const insets = { top, left: 0, right: 0, bottom };
  const frame = { x: 0, y: 0, width, height };
  return (
    <SafeAreaFrameContext.Provider value={frame}>
      <SafeAreaInsetsContext.Provider value={insets}>{children}</SafeAreaInsetsContext.Provider>
    </SafeAreaFrameContext.Provider>
  );
}

export function AppSafeAreaProvider({ children }: { children: ReactNode }) {
  if (hasNativeSafeArea()) {
    return <NativeSafeAreaProvider>{children}</NativeSafeAreaProvider>;
  }
  return <FallbackSafeAreaProvider>{children}</FallbackSafeAreaProvider>;
}
