/**
 * Placeholder tab screens (Check-In / Payment / History) — same chrome as the
 * prototype's PR pages; the flows land once the backend models shifts & PVs.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C, F } from '../theme/theme';
import { useViewportSize } from '../lib/viewport';
import { TopBar } from '../components/TopBar';
import { EmptyDashed } from '../components/ui';
import type { IconComponent } from '../components/icons';
import type { PrTab } from '../components/BottomNav';

export function PlaceholderScreen({
  label,
  title,
  icon: Icon,
  message,
  onNavigate,
}: {
  label: string;
  title: string;
  icon: IconComponent;
  message: string;
  onNavigate: (tab: PrTab) => void;
}) {
  const { width } = useViewportSize();
  const titleSize = Math.min(28, Math.max(22.4, width * 0.052));

  return (
    <View style={styles.screen}>
      <TopBar onOpenProfile={() => onNavigate('profile')} />
      <View style={styles.pageHeader}>
        <View style={styles.headerLabelRow}>
          <Icon size={15} color={C.muted2} />
          <Text style={styles.headerLabel}>{label.toUpperCase()}</Text>
        </View>
        <View style={styles.headerTitleRow}>
          <Icon size={22} color={C.accent} />
          <Text style={[styles.headerTitle, { fontSize: titleSize }]}>{title}</Text>
        </View>
      </View>
      <View style={{ marginTop: 16 }}>
        <EmptyDashed>{message}</EmptyDashed>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 6,
    paddingHorizontal: 18,
    paddingBottom: 26,
  },
  pageHeader: {
    paddingTop: 2,
  },
  headerLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerLabel: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.68,
    color: '#c4b4d8',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  headerTitle: {
    fontFamily: F.sora,
    fontWeight: '800',
    letterSpacing: -0.45,
    color: C.txt,
  },
});
