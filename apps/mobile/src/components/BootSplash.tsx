/**
 * Session boot screen — same brand atmosphere as Login, not a bare spinner.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { C, F } from '../theme/theme';
import { useLocale } from '../i18n';

const LOGO = require('../../assets/images/innocenz-logo.png');

export function BootSplash() {
  const { t } = useLocale();
  const enter = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 480,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start();

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.sin),
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.sin),
        }),
      ]),
    );
    pulseLoop.start();

    const barLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bar, {
          toValue: 1,
          duration: 1400,
          useNativeDriver: false,
          easing: Easing.inOut(Easing.quad),
        }),
        Animated.timing(bar, {
          toValue: 0,
          duration: 1400,
          useNativeDriver: false,
          easing: Easing.inOut(Easing.quad),
        }),
      ]),
    );
    barLoop.start();

    return () => {
      pulseLoop.stop();
      barLoop.stop();
    };
  }, [enter, pulse, bar]);

  const opacity = enter;
  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  const logoScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });
  const barWidth = bar.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['18%', '72%', '28%'],
  });
  const barLeft = bar.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['8%', '14%', '48%'],
  });

  return (
    <View style={styles.screen} accessibilityLabel={t.common.loading}>
      <View style={styles.atmosphere} pointerEvents="none">
        <View style={[styles.orb, styles.orbTop]} />
        <View style={[styles.orb, styles.orbGold]} />
        <View style={[styles.orb, styles.orbBottom]} />
        <View style={styles.vignette} />
      </View>

      <Animated.View
        style={[styles.brand, { opacity, transform: [{ translateY }] }]}
      >
        <View style={styles.logoWrap}>
          <Animated.View style={[styles.logoGlow, { opacity: glowOpacity }]} />
          <Animated.View style={{ transform: [{ scale: logoScale }] }}>
            <Image
              source={LOGO}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel={t.common.brandLogo}
            />
          </Animated.View>
        </View>

        <Text style={styles.wordmark}>InnocenZ</Text>
        <Text style={styles.caption}>{t.common.loadingSession}</Text>

        <View style={styles.track}>
          <Animated.View style={[styles.fill, { width: barWidth, left: barLeft }]} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bg,
  },
  atmosphere: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orbTop: {
    width: 280,
    height: 280,
    top: -80,
    right: -60,
    backgroundColor: 'rgba(183,156,232,0.18)',
  },
  orbGold: {
    width: 200,
    height: 200,
    top: '38%',
    left: -70,
    backgroundColor: 'rgba(227,184,119,0.1)',
  },
  orbBottom: {
    width: 240,
    height: 240,
    bottom: -90,
    right: 20,
    backgroundColor: 'rgba(155,126,217,0.12)',
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,17,32,0.35)',
  },
  brand: {
    alignItems: 'center',
    paddingHorizontal: 32,
    maxWidth: 320,
    width: '100%',
  },
  logoWrap: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  logoGlow: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(183,156,232,0.22)',
  },
  logo: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  wordmark: {
    fontFamily: F.playfair,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: C.accentL,
    textAlign: 'center',
  },
  caption: {
    fontFamily: F.manrope,
    fontSize: 14,
    letterSpacing: 0.3,
    color: C.prMuted,
    marginTop: 10,
    marginBottom: 28,
    textAlign: 'center',
  },
  track: {
    width: '100%',
    maxWidth: 160,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(232,224,245,0.1)',
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: C.violet,
  },
});
