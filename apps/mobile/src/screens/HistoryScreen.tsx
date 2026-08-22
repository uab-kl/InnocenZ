/**
 * History — port of InnocenZ-proto `/host/history`
 * Shifts tab (filters + payroll weeks) + Payment history tab.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, F } from '../theme/theme';
import { useLocale } from '../i18n';
import { useViewportSize } from '../lib/viewport';
import { PaymentHistoryPanel } from '../components/PaymentHistoryPanel';
import { ShiftHistoryPanel } from '../components/ShiftHistoryPanel';
import { Briefcase, HistoryIcon, Wallet } from '../components/icons';
import type { PrTab } from '../components/BottomNav';
import { type PrHistoryTab, usePrNav } from '../lib/pr-nav';

/**
 * The sub-tab is REMEMBERED in nav state, not held here.
 *
 * As local `useState('shifts')` it reset on every mount, so a PR who opened a
 * voucher from Payment history came back to Shifts — and one who actually
 * SIGNED, and is redirected to History by PvDetailScreen, also landed on
 * Shifts, with the signature she had just given sitting on the other tab.
 */
type HistTab = PrHistoryTab;

export function HistoryScreen({ onNavigate }: { onNavigate: (tab: PrTab) => void }) {
  const { t } = useLocale();
  const { width } = useViewportSize();
  const titleSize = Math.min(28, Math.max(22.4, width * 0.052));
  const { historyTab: tab, setHistoryTab: setTab } = usePrNav();

  return (
    <View style={styles.screen}>
      <View style={styles.pageHeader}>
        <View style={styles.headerTitleRow}>
          <HistoryIcon size={22} color={C.accent} />
          <Text style={[styles.headerTitle, { fontSize: titleSize }]}>{t.history.title}</Text>
        </View>
      </View>

      <View style={styles.hubToggle}>
        <Pressable
          style={[styles.hubBtn, tab === 'shifts' && styles.hubBtnOn]}
          onPress={() => setTab('shifts')}
        >
          <Briefcase size={14} color={tab === 'shifts' ? C.goldL : C.prMuted} />
          <Text style={[styles.hubText, tab === 'shifts' && { color: C.goldL }]}>
            {t.history.shifts}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.hubBtn, tab === 'payment' && styles.hubBtnOnPay]}
          onPress={() => setTab('payment')}
        >
          <Wallet size={14} color={tab === 'payment' ? C.violetL : C.prMuted} />
          <Text style={[styles.hubText, tab === 'payment' && { color: C.violetL }]}>
            {t.payment.history}
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
