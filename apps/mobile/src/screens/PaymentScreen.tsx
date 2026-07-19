/**
 * Payment — port of InnocenZ-proto `/host/PaymentVoucher` (screenshot 7):
 * Payroll header, week tabs, LAST WEEK card with SENT + daily wages/drinks grid.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, F } from '../theme/theme';
import {
  PAYMENT_VOUCHERS,
  buildLastWeekPayGrid,
  formatRM,
  weekRangeLabel,
} from '../lib/demo-shifts';
import { useViewportSize } from '../lib/viewport';
import { TopBar } from '../components/TopBar';
import { IzButton, Pill } from '../components/ui';
import { ChevronDown, Shield, Wallet } from '../components/icons';
import type { PrTab } from '../components/BottomNav';
import { usePrNav } from '../lib/pr-nav';

type WeekTab = 'last' | 'current';

export function PaymentScreen({ onNavigate }: { onNavigate: (tab: PrTab) => void }) {
  const { openPv } = usePrNav();
  const { width } = useViewportSize();
  const titleSize = Math.min(28, Math.max(22.4, width * 0.052));
  const [weekTab, setWeekTab] = useState<WeekTab>('last');
  const [lastOpen, setLastOpen] = useState(true);

  const lastLabel = weekRangeLabel(1);
  const thisLabel = weekRangeLabel(0);
  const grid = useMemo(() => buildLastWeekPayGrid(), []);
  const verifiedDays = grid.filter((d) => d.drinks != null).length;
  const awaiting = PAYMENT_VOUCHERS.find((p) => p.status === 'awaiting_pr');

  return (
    <View style={styles.screen}>
      <TopBar onOpenProfile={() => onNavigate('profile')} />
      <View style={styles.pageHeader}>
        <View style={styles.headerLabelRow}>
          <Text style={styles.dollar}>$</Text>
          <Text style={styles.headerLabel}>PAYROLL</Text>
        </View>
        <View style={styles.headerTitleRow}>
          <Wallet size={22} color={C.accent} />
          <Text style={[styles.headerTitle, { fontSize: titleSize }]}>Payment</Text>
        </View>
        <Text style={styles.meta}>
          Review &amp; sign · unsigned PVs only — signed/paid moved to History
        </Text>
      </View>

      <View style={styles.flowBox}>
        <Shield size={12} color={C.muted} />
        <Text style={styles.flowText}>
          Outlet → Agency → your bank · one PV per week (issued Sunday)
        </Text>
      </View>

      <View style={styles.weekTabs}>
        <Pressable
          style={[styles.weekTab, weekTab === 'last' && styles.weekTabOn]}
          onPress={() => setWeekTab('last')}
        >
          <Text style={[styles.weekTabTitle, weekTab === 'last' && { color: C.txt }]}>
            Last week
          </Text>
          <Text style={styles.weekTabSub}>{lastLabel}</Text>
        </Pressable>
        <Pressable
          style={[styles.weekTab, weekTab === 'current' && styles.weekTabOn]}
          onPress={() => setWeekTab('current')}
        >
          <Text style={[styles.weekTabTitle, weekTab === 'current' && { color: C.txt }]}>
            This week
          </Text>
          <Text style={styles.weekTabSub}>{thisLabel}</Text>
        </Pressable>
      </View>

      {weekTab === 'last' ? (
        <View style={styles.section}>
          <Pressable style={styles.sectionHd} onPress={() => setLastOpen((o) => !o)}>
            <View style={{ flex: 1 }}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>LAST WEEK</Text>
                <Pill variant="amber">SENT</Pill>
                <Text style={styles.sectionFrac}>
                  {verifiedDays}/7
                </Text>
              </View>
              <Text style={styles.sectionAction}>
                {lastOpen ? 'Tap to collapse' : 'Tap to expand'}
              </Text>
            </View>
            <ChevronDown
              size={16}
              color={C.goldL}
              style={lastOpen ? { transform: [{ rotate: '180deg' }] } : undefined}
            />
          </Pressable>

          {lastOpen && (
            <View style={styles.sectionBody}>
              <Text style={styles.weekCaption}>Last week {lastLabel}</Text>
              <Text style={styles.verified}>
                Verified days {verifiedDays}/7
              </Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
                <View>
                  <View style={styles.gridRow}>
                    <Text style={[styles.gridCorner, styles.gridLabel]}> </Text>
                    {grid.map((d) => (
                      <View key={d.day + d.date} style={styles.gridCol}>
                        <Text style={styles.gridDay}>{d.day}</Text>
                        <Text style={styles.gridDate}>{d.date}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.gridRow}>
                    <Text style={styles.gridLabel}>Daily wages</Text>
                    {grid.map((d) => (
                      <View key={`w-${d.date}`} style={styles.gridCol}>
                        <Text style={styles.gridVal}>{d.wages.toFixed(2)}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.gridRow}>
                    <Text style={styles.gridLabel}>Drinks</Text>
                    {grid.map((d) => (
                      <View key={`d-${d.date}`} style={styles.gridCol}>
                        <Text style={styles.gridVal}>
                          {d.drinks != null ? d.drinks.toFixed(2) : '—'}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              </ScrollView>

              {awaiting && (
                <IzButton
                  label={`Review & sign · ${formatRM(awaiting.net)}`}
                  small
                  onPress={() => openPv(awaiting.id)}
                  style={{ marginTop: 14 }}
                />
              )}
            </View>
          )}
        </View>
      ) : (
        <View style={styles.section}>
          <View style={styles.sectionBody}>
            <Text style={styles.weekCaption}>This week {thisLabel}</Text>
            <Text style={styles.verified}>In progress — PV issues Sunday after week closes</Text>
            <IzButton
              label="Open History"
              variant="soft"
              small
              onPress={() => onNavigate('history')}
              style={{ marginTop: 14 }}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 6, paddingHorizontal: 18, paddingBottom: 26 },
  pageHeader: { paddingTop: 2 },
  headerLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dollar: { fontFamily: F.sora, fontSize: 14, fontWeight: '800', color: C.goldL },
  headerLabel: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.68,
    color: '#c4b4d8',
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  headerTitle: { fontFamily: F.sora, fontWeight: '800', letterSpacing: -0.45, color: C.txt },
  meta: {
    marginTop: 6,
    fontFamily: F.manrope,
    fontSize: 13,
    color: C.prMuted,
    lineHeight: 18,
  },
  flowBox: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.line,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  flowText: { flex: 1, fontFamily: F.manrope, fontSize: 12, color: C.prMuted },
  weekTabs: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  weekTab: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: 'rgba(255,255,255,0.02)',
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  weekTabOn: {
    borderColor: 'rgba(183,156,232,0.45)',
    backgroundColor: 'rgba(183,156,232,0.1)',
  },
  weekTabTitle: { fontFamily: F.sora, fontSize: 14, fontWeight: '700', color: C.muted },
  weekTabSub: {
    marginTop: 4,
    fontFamily: F.manrope,
    fontSize: 11,
    color: C.prMuted2,
    textAlign: 'center',
  },
  section: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  sectionHd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  sectionTitle: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: C.txt,
  },
  sectionFrac: { fontFamily: F.sora, fontSize: 13, fontWeight: '700', color: C.goldL },
  sectionAction: {
    marginTop: 4,
    fontFamily: F.manrope,
    fontSize: 12,
    fontWeight: '600',
    color: C.goldL,
  },
  sectionBody: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: C.line },
  weekCaption: {
    marginTop: 12,
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '700',
    color: C.txt,
  },
  verified: { marginTop: 4, fontFamily: F.manrope, fontSize: 13, color: C.prMuted },
  gridRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  gridCorner: { width: 78 },
  gridLabel: {
    width: 78,
    fontFamily: F.manrope,
    fontSize: 11,
    color: C.muted2,
  },
  gridCol: { width: 56, alignItems: 'center' },
  gridDay: { fontFamily: F.sora, fontSize: 10, fontWeight: '700', color: C.muted2 },
  gridDate: { fontFamily: F.manrope, fontSize: 11, color: C.prMuted },
  gridVal: { fontFamily: F.sora, fontSize: 12, fontWeight: '700', color: C.txt },
});
