/**
 * Shift history — filters + collapsible weeks from real payment_voucher data.
 * Current week = live draft lines (same source as Payment). Past weeks = signed/paid only.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, F } from '../theme/theme';
import {
  formatRM,
  historyShiftOutlets,
  mergeHistoryShiftsWithWeekPay,
  type DemoHistoryShift,
  type DemoHistoryWeek,
  type WeekPayRecord,
} from '../lib/demo-shifts';
import { usePrEarnings } from '../lib/pr-earnings';
import type { PrReceiptLine } from '../lib/api';
import { matchesShiftDayTime } from '../lib/hist-date-time-filters';
import { usePaymentHistory } from '../lib/payment-history';
import {
  currentWeekHistoryMeta,
  historyVoucherToHistoryWeek,
  historyVoucherToShifts,
} from '../lib/payment-history-map';
import { useShiftSession } from '../lib/shift-session';
import { HistDateTimeFilter } from './HistDateTimeFilter';
import { IzButton, Pill } from './ui';
import {
  Briefcase,
  ChevronDown,
  House,
  Search,
  Sparkles,
  Wallet,
  Wine,
} from './icons';

type StatusFilter = 'any' | 'sealed' | 'signed' | 'cancelled' | 'current';
type SelectKind = 'outlet' | 'status' | null;

const STATUS_OPTIONS: { id: StatusFilter; label: string }[] = [
  { id: 'any', label: 'Any status' },
  { id: 'current', label: 'Current' },
  { id: 'sealed', label: 'Sealed' },
  { id: 'signed', label: 'Signed' },
  { id: 'cancelled', label: 'Cancelled' },
];

function statusPill(status: DemoHistoryShift['status']): {
  variant: 'green' | 'amber' | 'red';
  label: string;
} {
  if (status === 'cancelled') return { variant: 'red', label: 'Cancelled' };
  if (status === 'signed') return { variant: 'amber', label: 'Signed' };
  if (status === 'current') return { variant: 'amber', label: 'Pending' };
  return { variant: 'green', label: 'Sealed' };
}

/**
 * Build one current-week History card per calendar day — same grain as Payment's
 * This-week columns — so 2 verified days → 2 cards (not one per outlet).
 * Outlet label prefers the wages outlet; otherwise joins unique outlets.
 */
function weekRecordsFromLines(lines: PrReceiptLine[]): WeekPayRecord[] {
  const byDate = new Map<
    string,
    WeekPayRecord & { outlets: Set<string>; wagesOutlet: string | null }
  >();
  for (const l of lines) {
    const dateIso = l.lineDate?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
    if (!dateIso) continue;
    const outlet = l.outlet?.trim() || 'Outlet';
    const rec =
      byDate.get(dateIso) ??
      {
        dateIso,
        outlet,
        wages: 0,
        drinks: 0,
        tips: 0,
        others: 0,
        outlets: new Set<string>(),
        wagesOutlet: null,
      };
    rec.outlets.add(outlet);
    if (l.kind === 'wages') {
      rec.wages += l.commission;
      if (!rec.wagesOutlet) rec.wagesOutlet = outlet;
    } else if (l.kind === 'drinks') rec.drinks += l.commission;
    else if (l.kind === 'tips') rec.tips += l.commission;
    else if (l.kind === 'others') rec.others += l.commission;
    byDate.set(dateIso, rec);
  }
  return [...byDate.values()].map((rec) => {
    const names = [...rec.outlets];
    // Label by every outlet that contributed that day — never fold a second
    // venue's drinks/tips silently under the wages outlet (keeps the per-day
    // total matching Payment while attributing money to the right venues).
    const outlet =
      names.length > 1
        ? names.join(' · ')
        : names[0] ?? rec.wagesOutlet ?? rec.outlet;
    return {
      dateIso: rec.dateIso,
      outlet,
      wages: rec.wages,
      drinks: rec.drinks,
      tips: rec.tips,
      others: rec.others,
    };
  });
}

export function ShiftHistoryPanel() {
  const { closedShift, checkedInAt, checkedOutAt } = useShiftSession();
  const { current, lines } = usePrEarnings();
  const { vouchers } = usePaymentHistory();
  const weekRecords = useMemo(() => weekRecordsFromLines(lines), [lines]);

  const historyWeeks: DemoHistoryWeek[] = useMemo(() => {
    const currentMeta = currentWeekHistoryMeta(
      current?.weekStart ?? new Date().toISOString().slice(0, 10),
      current?.weekEnd ?? new Date().toISOString().slice(0, 10),
    );
    return [currentMeta, ...vouchers.map(historyVoucherToHistoryWeek)];
  }, [current?.weekStart, current?.weekEnd, vouchers]);

  const allShifts = useMemo(() => {
    const currentShifts = mergeHistoryShiftsWithWeekPay(
      [],
      weekRecords,
      { closedShift, checkedInAt, checkedOutAt },
    );
    const past = vouchers.flatMap((v) => {
      const week = historyVoucherToHistoryWeek(v);
      return historyVoucherToShifts(v, week.id);
    });
    return [...currentShifts, ...past].sort((a, b) => b.dateIso.localeCompare(a.dateIso));
  }, [weekRecords, closedShift, checkedInAt, checkedOutAt, vouchers]);

  const [query, setQuery] = useState('');
  const [outlet, setOutlet] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('any');
  const [date, setDate] = useState('');
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [openSelect, setOpenSelect] = useState<SelectKind>(null);
  const [openWeeks, setOpenWeeks] = useState<Record<string, boolean>>({ 'week-current': true });

  const workDayKeys = useMemo(
    () =>
      Array.from(
        new Set(allShifts.filter((s) => s.status !== 'cancelled').map((s) => s.dateIso)),
      ).sort(),
    [allShifts],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const dayTime = { date, timeFrom, timeTo };
    return allShifts.filter((s) => {
      if (outlet !== 'all' && s.outlet !== outlet) return false;
      if (status !== 'any' && s.status !== status) return false;
      if (!matchesShiftDayTime(s, dayTime)) return false;
      if (q) {
        const blob = [
          s.outlet,
          s.dateLabel,
          s.time,
          s.status,
          String(s.payout),
          String(s.wages),
          String(s.drinks),
          String(s.tips),
          String(s.others),
        ]
          .join(' ')
          .toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [query, outlet, status, date, timeFrom, timeTo, allShifts]);

  const outlets = useMemo(() => historyShiftOutlets(allShifts), [allShifts]);

  const earned = filtered
    .filter((s) => s.status !== 'cancelled')
    .reduce((sum, s) => sum + s.payout, 0);
  const wagesTotal = filtered
    .filter((s) => s.status !== 'cancelled')
    .reduce((sum, s) => sum + s.wages, 0);

  const clearFilters = () => {
    setQuery('');
    setOutlet('all');
    setStatus('any');
    setDate('');
    setTimeFrom('');
    setTimeTo('');
    setCalendarOpen(false);
    setOpenSelect(null);
  };

  const toggleWeek = (id: string) => {
    setOpenWeeks((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <View>
      <View style={styles.summary}>
        <View style={[styles.summaryCol, styles.summaryColLeft]}>
          <Text style={styles.summaryLabel}>EARNED IN RANGE</Text>
          <Text style={styles.summaryVal} adjustsFontSizeToFit minimumFontScale={0.65} numberOfLines={1}>
            {formatRM(earned)}
          </Text>
        </View>
        <View style={styles.summaryCol}>
          <Text style={styles.summaryLabel}>WAGES</Text>
          <Text style={styles.summaryVal} adjustsFontSizeToFit minimumFontScale={0.65} numberOfLines={1}>
            {formatRM(wagesTotal)}
          </Text>
        </View>
      </View>

      <View style={styles.filterHead}>
        <Text style={styles.filterTitle}>SHIFT HISTORY</Text>
      </View>

      <View style={styles.search}>
        <Search size={14} color={C.muted2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search wages, sales, others, drinks…"
          placeholderTextColor={C.muted2}
          style={styles.searchInput}
        />
      </View>

      <View style={styles.filterRow}>
        <FilterField
          icon={House}
          label="OUTLET"
          value={outlet === 'all' ? 'Any outlet' : outlet}
          onPress={() => setOpenSelect((s) => (s === 'outlet' ? null : 'outlet'))}
        />
        <FilterField
          icon={Briefcase}
          label="STATUS"
          value={STATUS_OPTIONS.find((o) => o.id === status)?.label ?? 'Any status'}
          onPress={() => setOpenSelect((s) => (s === 'status' ? null : 'status'))}
        />
      </View>

      <HistDateTimeFilter
        date={date}
        timeFrom={timeFrom}
        timeTo={timeTo}
        workDayKeys={workDayKeys}
        activityKind="shift"
        calendarOpen={calendarOpen}
        onCalendarOpenChange={(open) => {
          setCalendarOpen(open);
          if (open) setOpenSelect(null);
        }}
        onDateChange={(iso) => {
          setDate(iso);
          if (!iso) {
            setTimeFrom('');
            setTimeTo('');
          }
        }}
        onTimeFromChange={setTimeFrom}
        onTimeToChange={setTimeTo}
      />

      {openSelect === 'outlet' && (
        <SelectList
          options={[{ id: 'all', label: 'Any outlet' }, ...outlets.map((o) => ({ id: o, label: o }))]}
          selected={outlet}
          onPick={(id) => {
            setOutlet(id);
            setOpenSelect(null);
          }}
        />
      )}
      {openSelect === 'status' && (
        <SelectList
          options={STATUS_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
          selected={status}
          onPick={(id) => {
            setStatus(id as StatusFilter);
            setOpenSelect(null);
          }}
        />
      )}

      <View style={styles.weekList}>
        {historyWeeks.map((week) => {
          const weekShifts = filtered.filter((s) => s.weekId === week.id);
          // Hide empty past weeks entirely (no phantom PV totals without shifts).
          if (week.kind !== 'current' && weekShifts.length === 0) return null;
          if (
            weekShifts.length === 0 &&
            (outlet !== 'all' || status !== 'any' || date || query)
          ) {
            return null;
          }
          const active = weekShifts.filter((s) => s.status !== 'cancelled');
          const weekEarned = active.reduce((s, r) => s + r.payout, 0);
          const weekWages = active.reduce((s, r) => s + r.wages, 0);
          const open = openWeeks[week.id] ?? week.kind === 'current';
          const count = weekShifts.length;

          return (
            <View key={week.id} style={styles.weekCard}>
              <Pressable style={styles.weekHd} onPress={() => toggleWeek(week.id)}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.weekTitle}>{week.title}</Text>
                  <View style={styles.weekMetaRow}>
                    {week.kind === 'current' ? (
                      <Pill variant="amber">Current</Pill>
                    ) : (
                      <Text style={styles.pvRef}>{week.pvRef}</Text>
                    )}
                    <Text style={styles.weekCount}>
                      {count} shift{count === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <Text style={styles.weekEarn}>
                    {formatRM(weekEarned)} earned · {formatRM(weekWages)} wages
                  </Text>
                </View>
                <ChevronDown
                  size={16}
                  color={C.goldL}
                  style={open ? { transform: [{ rotate: '180deg' }] } : undefined}
                />
              </Pressable>

              {open && (
                <View style={styles.weekBody}>
                  {weekShifts.length === 0 ? (
                    <Text style={styles.emptyText}>No shifts in this week</Text>
                  ) : (
                    weekShifts.map((row) => <ShiftCard key={row.id} shift={row} />)
                  )}
                </View>
              )}
            </View>
          );
        })}

        {filtered.length === 0 && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No shifts match these filters</Text>
            <IzButton label="Reset filters" variant="soft" small onPress={clearFilters} />
          </View>
        )}
      </View>
    </View>
  );
}

function ShiftCard({ shift }: { shift: DemoHistoryShift }) {
  const pill = statusPill(shift.status);
  const cancelled = shift.status === 'cancelled';

  return (
    <View style={[styles.shiftCard, cancelled && styles.shiftCardCancelled]}>
      <View style={styles.shiftTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.outlet}>{shift.outlet}</Text>
          <Text style={styles.meta}>
            {shift.dateLabel} · {shift.time}
          </Text>
        </View>
        <Pill variant={pill.variant}>{pill.label}</Pill>
      </View>

      {!cancelled && (
        <>
          <Text style={styles.payoutLine}>{formatRM(shift.payout)} total payout</Text>
          <View style={styles.metrics}>
            <Metric icon={Wallet} label="Wages" value={shift.wages} />
            <Metric icon={Wine} label="Drinks" value={shift.drinks} />
            <Metric icon={Sparkles} label="Tips" value={shift.tips} />
            <Metric icon={Briefcase} label="Others" value={shift.others} />
          </View>
        </>
      )}
      {cancelled && <Text style={styles.cancelledNote}>Shift cancelled — no payout</Text>}
    </View>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wallet;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricLabelRow}>
        <Icon size={11} color={C.muted2} />
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      <Text style={styles.metricVal}>{value > 0 ? formatRM(value) : '—'}</Text>
    </View>
  );
}

function FilterField({
  icon: Icon,
  label,
  value,
  onPress,
  disabled,
  flex,
}: {
  icon: typeof House;
  label: string;
  value: string;
  onPress?: () => void;
  disabled?: boolean;
  flex?: boolean;
}) {
  return (
    <Pressable
      style={[styles.filterField, flex && { flex: 1 }, disabled && { opacity: 0.45 }]}
      onPress={disabled ? undefined : onPress}
      disabled={disabled || !onPress}
    >
      <View style={styles.filterFieldTop}>
        <Icon size={11} color={C.muted2} />
        <Text style={styles.filterFieldLabel}>{label}</Text>
      </View>
      <Text style={styles.filterFieldValue} numberOfLines={1}>
        {value}
      </Text>
    </Pressable>
  );
}

function SelectList({
  options,
  selected,
  onPick,
}: {
  options: { id: string; label: string }[];
  selected: string;
  onPick: (id: string) => void;
}) {
  return (
    <View style={styles.selectList}>
      {options.map((o) => (
        <Pressable
          key={o.id || 'any'}
          style={[styles.selectRow, selected === o.id && styles.selectRowOn]}
          onPress={() => onPick(o.id)}
        >
          <Text style={[styles.selectText, selected === o.id && { color: C.goldL }]}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    marginTop: 14,
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(255,255,255,0.02)',
    overflow: 'hidden',
  },
  summaryCol: {
    flex: 1,
    minWidth: 0,
    padding: 14,
  },
  summaryColLeft: {
    borderRightWidth: 1,
    borderRightColor: C.line,
  },
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
  filterRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  filterField: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  filterFieldTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  filterFieldLabel: {
    fontFamily: F.sora,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: C.muted2,
  },
  filterFieldValue: {
    marginTop: 3,
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.prMuted,
  },
  selectList: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line2,
    overflow: 'hidden',
    backgroundColor: C.panel,
  },
  selectRow: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  selectRowOn: { backgroundColor: 'rgba(232,194,122,0.08)' },
  selectText: { fontFamily: F.sora, fontSize: 13, fontWeight: '600', color: C.txt },
  weekList: { marginTop: 14, gap: 12 },
  weekCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(255,255,255,0.02)',
    overflow: 'hidden',
  },
  weekHd: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
  },
  weekTitle: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: C.goldL,
  },
  weekMetaRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  pvRef: {
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '700',
    color: C.violetL,
  },
  weekCount: { fontFamily: F.manrope, fontSize: 12, color: C.prMuted },
  weekEarn: {
    marginTop: 6,
    fontFamily: F.manrope,
    fontSize: 13,
    color: C.txt,
  },
  weekBody: {
    borderTopWidth: 1,
    borderTopColor: C.line,
    padding: 12,
    gap: 10,
  },
  shiftCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: 'rgba(0,0,0,0.18)',
    padding: 12,
  },
  shiftCardCancelled: { opacity: 0.75 },
  shiftTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  outlet: { fontFamily: F.sora, fontSize: 16, fontWeight: '700', color: C.txt },
  meta: { marginTop: 3, fontFamily: F.manrope, fontSize: 12, color: C.prMuted },
  payoutLine: {
    marginTop: 10,
    fontFamily: F.sora,
    fontSize: 18,
    fontWeight: '800',
    color: C.accentL,
  },
  metrics: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metric: {
    width: '47%',
    flexGrow: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  metricLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metricLabel: {
    fontFamily: F.sora,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: C.muted2,
  },
  metricVal: {
    marginTop: 4,
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '800',
    color: C.txt,
  },
  cancelledNote: {
    marginTop: 10,
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.red,
  },
  emptyBox: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  emptyText: { fontFamily: F.manrope, fontSize: 14, color: C.prMuted, textAlign: 'center' },
});
