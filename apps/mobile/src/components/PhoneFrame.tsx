/**
 * Phone shell — port of the prototype's `.iz-shell` / `.iz-phone` frame:
 * desktop web gets the bezel + notch + status bar (like the deployed proto),
 * narrow web / native fills the screen edge-to-edge.
 */
import React, { useEffect, useState, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { C, F, GRADIENTS, grad } from '../theme/theme';
import { fmtClock } from '../lib/demo-shifts';
import { useViewportSize } from '../lib/viewport';

function useClock(): string {
  const [time, setTime] = useState(() => fmtClock(new Date()));
  useEffect(() => {
    const id = setInterval(() => setTime(fmtClock(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);
  return time;
}

/** `.iz-statusbar` — time + signal/wifi/battery glyphs from proto Brand.tsx. */
function StatusBar() {
  const time = useClock();
  return (
    <View style={styles.statusbar}>
      <Text style={styles.statusbarTime}>{time}</Text>
      <View style={styles.statusbarIcons}>
        <Svg width={17} height={12} viewBox="0 0 17 12" fill={C.txt}>
          <Rect x={0} y={7} width={3} height={5} rx={1} />
          <Rect x={4.5} y={4} width={3} height={8} rx={1} />
          <Rect x={9} y={2} width={3} height={10} rx={1} />
          <Rect x={13.5} y={0} width={3} height={12} rx={1} />
        </Svg>
        <Svg width={16} height={12} viewBox="0 0 16 12" fill={C.txt}>
          <Path
            d="M8 2.5c2 0 3.8.8 5.1 2l1.1-1.2C13.6 1.7 11 .7 8 .7S2.4 1.7.7 3.3l1.1 1.2C3.2 3.3 6 2.5 8 2.5z"
            opacity={0.5}
          />
          <Path d="M8 6c1.1 0 2.1.4 2.9 1.1l1.1-1.2C11 4.9 9.6 4.3 8 4.3s-3 .6-4 1.6l1.1 1.2C5.9 6.4 6.9 6 8 6z" />
          <Circle cx={8} cy={9.5} r={1.6} />
        </Svg>
        <Svg width={25} height={12} viewBox="0 0 25 12" fill="none">
          <Rect x={1} y={1} width={20} height={10} rx={3} stroke={C.txt} opacity={0.5} />
          <Rect x={2.5} y={2.5} width={15} height={7} rx={1.5} fill={C.txt} />
          <Rect x={22} y={4} width={2} height={4} rx={1} fill={C.txt} opacity={0.5} />
        </Svg>
      </View>
    </View>
  );
}

export function PhoneFrame({
  children,
  footer,
  overlay,
  scroll = true,
}: {
  children: ReactNode;
  /** Bottom tab bar — pinned under the scroll area. */
  footer?: ReactNode;
  /** Sheets / modals — rendered over the frame. */
  overlay?: ReactNode;
  scroll?: boolean;
}) {
  const { width, height } = useViewportSize();
  const framed = Platform.OS === 'web' && width > 520;

  const body = (
    <View
      style={[
        styles.phone,
        grad(GRADIENTS.phone, C.bg),
        framed
          ? { width: 392, height: Math.min(850, height * 0.96), borderRadius: 48, ...webPhoneShadow }
          : styles.phoneFull,
      ]}
    >
      <StatusBar />
      {scroll ? (
        <ScrollView
          style={styles.viewport}
          contentContainerStyle={footer ? { paddingBottom: C.tabbarH } : undefined}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.viewport}>{children}</View>
      )}
      {footer && <View style={styles.footer}>{footer}</View>}
      {overlay}
      {framed && <View style={styles.notch} pointerEvents="none" />}
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
  notch: {
    position: 'absolute',
    top: 11,
    left: '50%',
    transform: [{ translateX: -60 }],
    width: 120,
    height: 30,
    backgroundColor: '#06030c',
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    zIndex: 60,
  },
  statusbar: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 26,
    paddingBottom: 6,
    zIndex: 50,
    flexShrink: 0,
  },
  statusbarTime: {
    fontFamily: F.sora,
    fontSize: 16,
    fontWeight: '600',
    color: C.txt,
  },
  statusbarIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
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
