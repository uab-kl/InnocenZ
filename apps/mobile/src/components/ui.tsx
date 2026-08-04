/**
 * Shared PR-app primitives — pixel ports of the prototype's `iz-*` classes:
 * avatars, status pills, buttons, dashed empty states, icon labels, wordmark.
 */
import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { C, F, GRADIENTS, grad } from '../theme/theme';
import { assetUrl } from '../lib/api';
import type { IconComponent } from './icons';

/** `.iz-avatar` — photo or gradient initial. `logo` mimics `iz-avatar-photo--logo`. */
export function Avatar({
  size = 48,
  radius = 15,
  fontSize = 18,
  photoPath,
  initial,
  logo = false,
  gradientCss = GRADIENTS.avatarGold,
  style,
}: {
  size?: number;
  radius?: number;
  fontSize?: number;
  photoPath?: string | null;
  initial?: string;
  logo?: boolean;
  gradientCss?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const uri = assetUrl(photoPath);
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: radius },
        !uri && grad(gradientCss, '#C99B4E'),
        logo && { backgroundColor: '#0a0a0a' },
        style,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={[
            StyleSheet.absoluteFillObject,
            logo && { transform: [{ scale: 1.28 }, { translateY: -size * 0.04 }] },
          ]}
          resizeMode="cover"
        />
      ) : (
        <Text style={[styles.avatarInitial, { fontSize }]}>{initial ?? '?'}</Text>
      )}
    </View>
  );
}

const PILL_BORDERS = {
  green: 'rgba(93,217,160,0.35)',
  amber: 'rgba(232,198,106,0.35)',
  red: 'rgba(240,138,138,0.35)',
} as const;

/** `PrStatusPill` — green / amber / red status chip. */
export function Pill({ variant, children }: { variant: 'green' | 'amber' | 'red'; children: string }) {
  const color = variant === 'green' ? C.green : variant === 'amber' ? C.amber : C.red;
  const bg = variant === 'green' ? C.greenBg : variant === 'amber' ? C.amberBg : C.redBg;
  return (
    <View style={[styles.pill, { backgroundColor: bg, borderColor: PILL_BORDERS[variant] }]}>
      <Text style={[styles.pillText, { color }]}>{children}</Text>
    </View>
  );
}

/** `.iz-btn` / `.iz-btn-primary` / `.iz-btn-soft` (+ `-sm`). */
export function IzButton({
  label,
  onPress,
  variant = 'primary',
  small = false,
  fullWidth = true,
  icon: Icon,
  disabled = false,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'soft';
  small?: boolean;
  fullWidth?: boolean;
  icon?: IconComponent;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const textColor = variant === 'primary' ? '#241a08' : C.txt;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSm,
        !fullWidth && { width: 'auto', alignSelf: 'flex-start' },
        variant === 'primary' ? grad(GRADIENTS.accent, C.accent) : styles.btnSoft,
        pressed && { transform: [{ scale: 0.975 }] },
        disabled && { opacity: 0.55 },
        style,
      ]}
    >
      {Icon && <Icon size={small ? 14 : 16} color={textColor} strokeWidth={2.2} />}
      <Text style={[styles.btnText, small && styles.btnTextSm, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

/** Dashed-border empty state — `iz-tiny iz-muted2 border-dashed` card. */
export function EmptyDashed({ children }: { children: string }) {
  return (
    <View style={styles.emptyDashed}>
      <Text style={styles.emptyDashedText}>{children}</Text>
    </View>
  );
}

/** `LabelWithIcon` — small muted icon + label (shift-card fact keys). */
export function LabelWithIcon({
  icon: Icon,
  label,
  color = C.muted2,
  size = 13,
  textStyle,
}: {
  icon: IconComponent;
  label: string;
  color?: string;
  size?: number;
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={styles.labelWithIcon}>
      <Icon size={size} color={color} />
      <Text style={[styles.labelWithIconText, { color }, textStyle]}>{label}</Text>
    </View>
  );
}

/** `.iz-wordmark` — Playfair Display gold "InnocenZ". */
export function Wordmark({ fontSize = 22 }: { fontSize?: number }) {
  return <Text style={[styles.wordmark, { fontSize }]}>InnocenZ</Text>;
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarInitial: {
    fontFamily: F.sora,
    fontWeight: '800',
    color: '#fff',
  },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  pillText: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  btn: {
    width: '100%',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnSm: {
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  btnSoft: {
    backgroundColor: C.glass2,
    borderWidth: 1,
    borderColor: C.line2,
  },
  btnText: {
    fontFamily: F.sora,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  btnTextSm: {
    fontSize: 14,
    letterSpacing: 0.1,
  },
  emptyDashed: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.line,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyDashedText: {
    fontFamily: F.manrope,
    fontSize: C.fsTiny,
    lineHeight: C.fsTiny * 1.55,
    color: C.prMuted2,
    textAlign: 'center',
  },
  labelWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  labelWithIconText: {
    fontFamily: F.manrope,
    fontSize: 12,
    fontWeight: '600',
  },
  wordmark: {
    fontFamily: F.playfair,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: C.accentL,
  },
});
