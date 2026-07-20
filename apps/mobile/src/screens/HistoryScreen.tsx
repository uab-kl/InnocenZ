/**
 * History — port of InnocenZ-proto `/host/history`
 * Shifts tab (filters + payroll weeks) + Payment history tab.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, F } from '../theme/theme';
import { useViewportSize } from '../lib/viewport';
import { TopBar } from '../components/TopBar';
import { PaymentHistoryPanel } from '../components/PaymentHistoryPanel';
import { ShiftHistoryPanel } from '../components/ShiftHistoryPanel';
import { Briefcase, HistoryIcon, Wallet } from '../components/icons';
import type { PrTab } from '../components/BottomNav';

type HistTab = 'shifts' | 'payment';

export function HistoryScreen({ onNavigate }: { onNavigate: (tab: PrTab) => void }) {
  const { width } = useViewportSize();
  const titleSize = Math.min(28, Math.max(22.4, width * 0.052));
  const [tab, setTab] = useState<HistTab>('shifts');

  return (
    <View style={styles.screen}>
      <TopBar onOpenProfile={() => onNavigate('profile')} />
      <View style={styles.pageHeader}>
        <Text style={styles.headerLabel}>EARNINGS</Text>
        <View style={styles.headerTitleRow}>
          <HistoryIcon size={22} color={C.accent} />
          <Text style={[styles.headerTitle, { fontSize: titleSize }]}>History</Text>
        </View>
      </View>

      <View style={styles.hubToggle}>
        <Pressable
          style={[styles.hubBtn, tab === 'shifts' && styles.hubBtnOn]}
          onPress={() => setTab('shifts')}
        >
          <Briefcase size={14} color={tab === 'shifts' ? C.goldL : C.prMuted} />
          <Text style={[styles.hubText, tab === 'shifts' && { color: C.goldL }]}>Shifts</Text>
        </Pressable>
        <Pressable
          style={[styles.hubBtn, tab === 'payment' && styles.hubBtnOnPay]}
          onPress={() => setTab('payment')}
        >
          <Wallet size={14} color={tab === 'payment' ? C.violetL : C.prMuted} />
          <Text style={[styles.hubText, tab === 'payment' && { color: C.violetL }]}>
            Payment history
          </Text>
        </Pressable>
      </View>

      {tab === 'shifts' ? (
        <ShiftHistoryPanel />
      ) : (
        <PaymentHistoryPanel onOpenPayment={() => onNavigate('payment')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 6, paddingHorizontal: 18, paddingBottom: 26 },
  pageHeader: { paddingTop: 2 },
  headerLabel: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.68,
    color: '#c4b4d8',
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  headerTitle: { fontFamily: F.sora, fontWeight: '800', letterSpacing: -0.45, color: C.txt },
  hubToggle: {
    flexDirection: 'row',
    marginTop: 12,
    padding: 3,
    gap: 3,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  hubBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 38,
    borderRadius: 11,
  },
  hubBtnOn: { backgroundColor: 'rgba(232,194,122,0.14)' },
  hubBtnOnPay: { backgroundColor: 'rgba(167,139,250,0.16)' },
  hubText: { fontFamily: F.sora, fontSize: 12, fontWeight: '600', color: C.prMuted },
});
