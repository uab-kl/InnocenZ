/**
 * `.iz-tabbar` / `.iz-pr-tabbar` port — Shifts · Check-In · Payment · History
 * · Profile with the gold top indicator + glow on the active tab.
 */
import React, { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { C, F, GRADIENTS, grad } from '../theme/theme';
import { useLocale } from '../i18n';
import { Briefcase, HistoryIcon, MapPin, UserIcon, Wallet, type IconComponent } from './icons';

export type PrTab = 'shifts' | 'checkin' | 'payment' | 'history' | 'profile';

export function BottomNav({ active, onChange }: { active: PrTab; onChange: (tab: PrTab) => void }) {
  const { t } = useLocale();
  const tabs = useMemo(
    (): { key: PrTab; label: string; icon: IconComponent }[] => [
      { key: 'shifts', label: t.nav.today, icon: Briefcase },
      { key: 'checkin', label: t.nav.checkIn, icon: MapPin },
      { key: 'payment', label: t.nav.payment, icon: Wallet },
      { key: 'history', label: t.nav.history, icon: HistoryIcon },
      { key: 'profile', label: t.nav.profile, icon: UserIcon },
    ],
    [t],
  );

  return (
    <View style={styles.tabbar}>
      {tabs.map(({ key, label, icon: Icon }) => {
        const on = key === active;
        const color = on ? C.goldL : C.muted2;
        return (
          <Pressable key={key} style={styles.tab} onPress={() => onChange(key)}>
            {on && <View style={[styles.indicator, grad(GRADIENTS.gold, C.violet)]} />}
            <Icon size={20} color={color} strokeWidth={1.8} style={on ? glowStyle : undefined} />
            <Text style={[styles.label, { color }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const glowStyle =
  Platform.OS === 'web'
    ? ({ filter: 'drop-shadow(0 0 10px rgba(183,156,232,0.6))' } as object)
    : undefined;

const webOnly = (style: object): object => (Platform.OS === 'web' ? style : {});

const styles = StyleSheet.create({
  tabbar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(8,5,15,0.94)',
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 8,
    paddingHorizontal: 6,
    paddingBottom: 22,
    minHeight: C.tabbarH,
    ...webOnly({ backdropFilter: 'blur(16px)' }),
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
  },
  indicator: {
    position: 'absolute',
    top: -8,
    width: 24,
    height: 2,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    ...webOnly({ boxShadow: '0 0 8px rgba(183,156,232,0.6)' }),
  },
  label: {
    fontFamily: F.sora,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
