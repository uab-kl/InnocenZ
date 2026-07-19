/**
 * History — port of InnocenZ-proto `/host/history`
 * Shifts tab + Payment history tab (PrPaymentHistoryPanel).
 */
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, F } from '../theme/theme';
import { HISTORY_SHIFTS, formatRM } from '../lib/demo-shifts';
import { useViewportSize } from '../lib/viewport';
import { TopBar } from '../components/TopBar';
import { PaymentHistoryPanel } from '../components/PaymentHistoryPanel';
import { IzButton, Pill } from '../components/ui';
import { Briefcase, Filter, HistoryIcon, Search, Wallet } from '../components/icons';
import type { PrTab } from '../components/BottomNav';

type HistTab = 'shifts' | 'payment';
type StatusChip = 'any' | 'paid' | 'signed' | 'disputed' | 'sealed';

export function HistoryScreen({ onNavigate }: { onNavigate: (tab: PrTab) => void }) {
  const { width } = useViewportSize();
  const titleSize = Math.min(28, Math.max(22.4, width * 0.052));
  const [tab, setTab] = useState<HistTab>('payment');
  const [query, setQuery] = useState('');
  const [statusChip, setStatusChip] = useState<StatusChip>('any');
  const [filterOpen, setFilterOpen] = useState(false);

  const earned = HISTORY_SHIFTS.filter((h) => h.status === 'complete').reduce(
    (s, h) => s + h.payout,
    0,
  );
  const wages = Math.round(earned * 0.62 * 100) / 100;

  const shifts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return HISTORY_SHIFTS;
    return HISTORY_SHIFTS.filter(
      (h) => h.outlet.toLowerCase().includes(q) || h.dateLabel.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <View style={styles.screen}>
      <TopBar
        onOpenProfile={() => onNavigate('profile')}
        backLabel={filterOpen && tab === 'shifts' ? 'History' : undefined}
        onBack={filterOpen && tab === 'shifts' ? () => setFilterOpen(false) : undefined}
      />
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
        <>
          <View style={styles.summary}>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>EARNED IN RANGE</Text>
              <Text style={styles.summaryVal}>{formatRM(earned || 8498)}</Text>
            </View>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>WAGES</Text>
              <Text style={styles.summaryVal}>{formatRM(wages || 5273)}</Text>
            </View>
          </View>

          <View style={styles.filterHead}>
            <Text style={styles.filterTitle}>SHIFT HISTORY</Text>
            <Pressable style={styles.moreBtn} onPress={() => setFilterOpen(true)}>
              <Filter size={12} color={C.muted} />
              <Text style={styles.moreText}>More</Text>
            </Pressable>
          </View>

          <View style={styles.search}>
            <Search size={14} color={C.muted2} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search wages, sales, outlet…"
              placeholderTextColor={C.muted2}
              style={styles.searchInput}
            />
          </View>

          <View style={styles.filterRow}>
            <FilterChip label="OUTLET" value="Any outlet" />
            <FilterChip
              label="STATUS"
              value={statusChip === 'any' ? 'Any status' : statusChip}
            />
            <FilterChip label="DATE" value="Any date" />
          </View>

          <Text style={styles.weekHead}>Payroll week · 05–11 Jul 2026</Text>
          <View style={styles.list}>
            {shifts.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>No shifts match these filters</Text>
                <IzButton
                  label="Reset filters"
                  variant="soft"
                  small
                  onPress={() => {
                    setQuery('');
                    setStatusChip('any');
                  }}
                />
              </View>
            ) : (
              shifts.map((row) => (
                <View key={row.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.outlet}>{row.outlet}</Text>
                    <Text style={styles.meta}>
                      {row.dateLabel} · {row.time}
                    </Text>
                    {row.status === 'complete' && (
                      <Text style={styles.metrics}>
                        Wages {formatRM(Math.round(row.payout * 0.7))} · Drinks{' '}
                        {formatRM(Math.round(row.payout * 0.2))} · Tips{' '}
                        {formatRM(Math.round(row.payout * 0.1))}
                      </Text>
                    )}
                  </View>
                  <View style={styles.right}>
                    <Pill variant={row.status === 'complete' ? 'green' : 'red'}>
                      {row.status === 'complete' ? 'Sealed' : 'Cancelled'}
                    </Pill>
                    {row.status === 'complete' && (
                      <Text style={styles.payout}>{formatRM(row.payout)}</Text>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>

          <Modal
            visible={filterOpen}
            transparent
            animationType="slide"
            onRequestClose={() => setFilterOpen(false)}
          >
            <Pressable style={styles.backdrop} onPress={() => setFilterOpen(false)}>
              <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
                <Text style={styles.sheetTitle}>Filter shift history</Text>
                <Text style={styles.sheetLabel}>Status</Text>
                <View style={styles.chips}>
                  {(['any', 'paid', 'signed', 'disputed', 'sealed'] as StatusChip[]).map((c) => (
                    <Pressable
                      key={c}
                      style={[styles.chip, statusChip === c && styles.chipOn]}
                      onPress={() => setStatusChip(c)}
                    >
                      <Text style={[styles.chipText, statusChip === c && { color: C.txt }]}>
                        {c === 'any' ? 'Any' : c[0].toUpperCase() + c.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <IzButton
                  label="Apply filters"
                  onPress={() => setFilterOpen(false)}
                  style={{ marginTop: 16 }}
                />
                <IzButton
                  label="Clear & close"
                  variant="soft"
                  onPress={() => {
                    setQuery('');
                    setStatusChip('any');
                    setFilterOpen(false);
                  }}
                  style={{ marginTop: 10 }}
                />
              </Pressable>
            </Pressable>
          </Modal>
        </>
      ) : (
        <PaymentHistoryPanel onOpenPayment={() => onNavigate('payment')} />
      )}
    </View>
  );
}

function FilterChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.filterChip}>
      <Text style={styles.filterChipLabel}>{label}</Text>
      <Text style={styles.filterChipValue}>{value}</Text>
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
  summary: {
    marginTop: 14,
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(255,255,255,0.02)',
    overflow: 'hidden',
  },
  summaryCol: { flex: 1, padding: 14 },
  summaryLabel: {
    fontFamily: F.sora,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: C.muted2,
  },
  summaryVal: {
    marginTop: 6,
    fontFamily: F.sora,
    fontSize: 18,
    fontWeight: '800',
    color: C.accentL,
  },
  filterHead: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterTitle: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: C.txt,
  },
  moreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
  },
  moreText: { fontFamily: F.sora, fontSize: 12, fontWeight: '600', color: C.muted },
  search: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: C.line2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  searchInput: { flex: 1, fontFamily: F.manrope, fontSize: 14, color: C.txt, padding: 0 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  filterChip: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  filterChipLabel: {
    fontFamily: F.sora,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: C.muted2,
  },
  filterChipValue: { fontFamily: F.manrope, fontSize: 12, color: C.prMuted, marginTop: 2 },
  weekHead: {
    marginTop: 14,
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: C.goldL,
  },
  list: { gap: 10, marginTop: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  outlet: { fontFamily: F.sora, fontSize: 16, fontWeight: '700', color: C.txt },
  meta: { fontFamily: F.manrope, fontSize: C.fsTiny, color: C.prMuted, marginTop: 2 },
  metrics: { marginTop: 4, fontFamily: F.manrope, fontSize: 11, color: C.prMuted2 },
  right: { alignItems: 'flex-end', gap: 6 },
  payout: { fontFamily: F.sora, fontSize: 14, fontWeight: '700', color: C.accentL },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.line,
  },
  chipOn: { borderColor: C.violet, backgroundColor: C.violetInk },
  chipText: { fontFamily: F.sora, fontSize: 13, fontWeight: '600', color: C.muted },
  emptyBox: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  emptyText: { fontFamily: F.manrope, fontSize: 14, color: C.prMuted },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(6,3,12,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.panel,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: C.line2,
    padding: 18,
    paddingBottom: 28,
    maxWidth: 392,
    width: '100%',
    alignSelf: 'center',
  },
  sheetTitle: { fontFamily: F.sora, fontSize: 20, fontWeight: '800', color: C.txt },
  sheetLabel: {
    marginTop: 12,
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: C.prMuted2,
  },
});
