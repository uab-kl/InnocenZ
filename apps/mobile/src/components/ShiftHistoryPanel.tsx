/**
 * Shift history — filters + collapsible weeks from real payment_voucher data.
 * Current week = live draft lines (same source as Payment). Past weeks = signed/paid only.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, F } from '../theme/theme';
import { font } from '../theme/fonts';
import {
  currentWeekIdFor,
  formatRM,
  formatUpcomingWeekLabel,
  historyShiftOutlets,
  mergeHistoryShiftsWithWeekPay,
  type DemoHistoryShift,
  type DemoHistoryWeek,
} from '../lib/demo-shifts';
import { usePrEarnings } from '../lib/pr-earnings';
import {
  agencyResolver,
  weekRecordsFromLines,
} from '../lib/week-agency-split';
import { matchesShiftDayTime } from '../lib/hist-date-time-filters';
import { usePaymentHistory } from '../lib/payment-history';
import {
  currentWeekHistoryMeta,
  historyVoucherToHistoryWeek,
  historyVoucherToShifts,
} from '../lib/payment-history-map';
import { useShiftSession } from '../lib/shift-session';
import { formatMessage, useLocale, type AppTranslations } from '../i18n';
import { HistDateTimeFilter } from './HistDateTimeFilter';
import { AgencyLogo } from './AgencyLogo';
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
/**
 * Which HALF of the history the list is showing.
 *
 * The two are different KINDS of thing, not two date ranges: a current week is
 * money still being logged, with no voucher and nothing to sign, while a
 * payroll week is a document that exists and has a PV number. Mixing them in
 * one scroll is what made the live week hard to find once a PR had a few
 * months of history behind them.
 */
type WeekTab = 'current' | 'payroll';
type SelectKind = 'outlet' | 'status' | null;

/**
 * `id` is the STORED status — it is compared against `shift.status` and is the
 * React key of the picker row — so it stays English. Only `label` is copy, and
 * it holds a FUNCTION: this map is built at module scope, before any hook has
 * run, so a plain string would freeze whichever locale loaded first.
 */
const STATUS_OPTIONS: { id: StatusFilter; label: (t: AppTranslations) => string }[] = [
  { id: 'any', label: (t) => t.history.anyStatus },
  { id: 'current', label: (t) => t.history.statusCurrent },
  { id: 'sealed', label: (t) => t.shiftStatus.sealed },
  { id: 'signed', label: (t) => t.history.statusSigned },
  { id: 'cancelled', label: (t) => t.schedule.outcomeCancelled },
];

function statusPill(
  status: DemoHistoryShift['status'],
  /** The dictionary, LAST and with no default — a default would pin one locale. */
  t: AppTranslations,
): {
  variant: 'green' | 'amber' | 'red';
  label: string;
} {
  if (status === 'cancelled') return { variant: 'red', label: t.schedule.outcomeCancelled };
  if (status === 'signed') return { variant: 'amber', label: t.history.statusSigned };
  if (status === 'current') return { variant: 'amber', label: t.shiftStatus.pending };
  return { variant: 'green', label: t.shiftStatus.sealed };
}

/**
 * The week card's heading, rebuilt in the active locale from the week's DATA.
 *
 * `DemoHistoryWeek.title` is composed English at both producers in
 * `payment-history-map.ts` and stays that way — but this line is its ONLY
 * consumer (`matchPayWeekForHistoryWeek` pairs on `weekLabel` and `pvRef`), so
 * the rendered heading is free to be localized. Formatting from the ISO bounds
 * beats re-parsing the English title: the month names come from the dictionary
 * by index and Chinese gets its own order for free, via the same
 * `schedule.weekRange*` templates the timetable strip already uses.
 *
 * The English `title` remains the fallback for a week with no bounds to format
 * — the `HISTORY_WEEKS` fixtures, and any voucher row whose week_start/week_end
 * came back null.
 *
 * ⚠️ THE AGENCY IS NO LONGER IN THIS STRING. It renders as its own line beside
 * the logo (`week.agencyName` in the card header), because appending it here
 * gave a heading that wrapped to two or three lines on a phone — "Why We Met"
 * broke across a line end — and repeated what the mark beside it already says.
 * `t` comes LAST with no default: a default would pin whichever locale loaded
 * first for every caller.
 */
function weekTitle(week: DemoHistoryWeek, t: AppTranslations): string {
  if (!week.weekStartIso || !week.weekEndIso) return week.title;
  const range = formatUpcomingWeekLabel(week.weekStartIso, week.weekEndIso, t);
  return week.kind === 'current'
    ? formatMessage(t.history.weekTitleCurrent, { range })
    : formatMessage(t.history.weekTitlePayroll, { range });
}

/**
 * Which tab a week belongs under.
 *
 * Derived from `kind`, which `currentWeekHistoryMeta` and
 * `historyVoucherToHistoryWeek` already set — rather than from the presence of
 * a `pvRef`, which the live card also carries (it reads "PV pending Sunday").
 */
function weekTabOf(week: DemoHistoryWeek): WeekTab {
  return week.kind === 'current' ? 'current' : 'payroll';
}

export function ShiftHistoryPanel() {
  const { t } = useLocale();
  const { closedShift, checkedInAt, checkedOutAt } = useShiftSession();
  const { current, lines } = usePrEarnings();
  const { vouchers } = usePaymentHistory();
  const agencyOf = useMemo(
    () => agencyResolver(current?.vouchers),
    [current?.vouchers],
  );
  const weekRecords = useMemo(
    () => weekRecordsFromLines(lines, agencyOf),
    [lines, agencyOf],
  );

  /**
   * The live week, split into one card PER AGENCY — the same shape the past
   * weeks already take, where each card is one voucher and so one payer.
   *
   * ORDERED BY THE SERVER'S `vouchers`, not by anything derived here, so the
   * cards keep their places across a refresh instead of swapping whenever a
   * day's money lands.
   *
   * The unattributed card is added when — and only when — some line could not
   * be traced to a voucher, plus as the single fallback for a week with no
   * money in it at all. Both keep the id this card has always had, so a build
   * talking to a backend without `vouchers[]` renders exactly what it did.
   */
  const historyWeeks: DemoHistoryWeek[] = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const weekStart = current?.weekStart ?? today;
    const weekEnd = current?.weekEnd ?? today;
    const present = new Set(weekRecords.map((r) => r.agencyId ?? ''));
    const currentMetas: DemoHistoryWeek[] = [];
    for (const v of current?.vouchers ?? []) {
      if (!present.has(v.agencyId)) continue;
      // One card per AGENCY, not per voucher: two vouchers for one agency in a
      // week would otherwise raise two cards holding the same rows.
      if (currentMetas.some((m) => m.id === currentWeekIdFor(v.agencyId))) continue;
      currentMetas.push(
        currentWeekHistoryMeta(weekStart, weekEnd, {
          id: v.agencyId,
          name: v.agencyName,
          logo: v.agencyLogo ?? null,
        }),
      );
    }
    if (present.has('') || currentMetas.length === 0) {
      currentMetas.push(currentWeekHistoryMeta(weekStart, weekEnd));
    }
    return [...currentMetas, ...vouchers.map(historyVoucherToHistoryWeek)];
  }, [current?.weekStart, current?.weekEnd, current?.vouchers, weekRecords, vouchers]);

  const allShifts = useMemo(() => {
    const currentShifts = mergeHistoryShiftsWithWeekPay(
      [],
      weekRecords,
      { closedShift, checkedInAt, checkedOutAt },
      t,
    );
    const past = vouchers.flatMap((v) => {
      const week = historyVoucherToHistoryWeek(v);
      return historyVoucherToShifts(v, week.id, t);
    });
    return [...currentShifts, ...past].sort((a, b) => b.dateIso.localeCompare(a.dateIso));
    // `t` is READ here (the date labels are built from it), so it belongs in
    // the deps — without it the list keeps yesterday's language after a switch.
  }, [weekRecords, closedShift, checkedInAt, checkedOutAt, vouchers, t]);

  const [query, setQuery] = useState('');
  const [outlet, setOutlet] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('any');
  const [date, setDate] = useState('');
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [openSelect, setOpenSelect] = useState<SelectKind>(null);
  const [weekTab, setWeekTab] = useState<WeekTab>('current');
  // Seeded EMPTY on purpose: the live week is many cards now, and the render
  // below already opens every `kind === 'current'` card by default.
  const [openWeeks, setOpenWeeks] = useState<Record<string, boolean>>({});

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

  /**
   * The tab counts, and the count actually on screen.
   *
   * Counted from `filtered` and from the same week list the cards walk, so the
   * numbers on the tabs are what tapping them will show. Counting `allShifts`
   * instead would promise 12 shifts and then render three, every time a filter
   * was on.
   */
  const { currentShiftCount, payrollShiftCount, hasAnyPayrollWeek } = useMemo(() => {
    const idsByTab = new Map<string, WeekTab>();
    let payrollWeeks = 0;
    for (const w of historyWeeks) {
      const tab = weekTabOf(w);
      idsByTab.set(w.id, tab);
      if (tab === 'payroll') payrollWeeks += 1;
    }
    let current = 0;
    let payroll = 0;
    for (const s of filtered) {
      if (idsByTab.get(s.weekId) === 'payroll') payroll += 1;
      else if (idsByTab.get(s.weekId) === 'current') current += 1;
    }
    return {
      currentShiftCount: current,
      payrollShiftCount: payroll,
      // Whether any payroll week EXISTS, which is a different question from
      // whether any survived the filters — they need different empty states.
      hasAnyPayrollWeek: payrollWeeks > 0,
    };
  }, [filtered, historyWeeks]);
  const shownShiftCount =
    weekTab === 'current' ? currentShiftCount : payrollShiftCount;

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
          <Text style={styles.summaryLabel}>{t.history.earnedInRange}</Text>
          <Text style={styles.summaryVal} adjustsFontSizeToFit minimumFontScale={0.65} numberOfLines={1}>
            {formatRM(earned)}
          </Text>
        </View>
        <View style={styles.summaryCol}>
          <Text style={styles.summaryLabel}>{t.history.wagesTotal}</Text>
          <Text style={styles.summaryVal} adjustsFontSizeToFit minimumFontScale={0.65} numberOfLines={1}>
            {formatRM(wagesTotal)}
          </Text>
        </View>
      </View>

      <View style={styles.filterHead}>
        <Text style={styles.filterTitle}>{t.history.shiftHistory}</Text>
      </View>

      <View style={styles.search}>
        <Search size={14} color={C.muted2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t.history.searchPlaceholder}
          placeholderTextColor={C.muted2}
          style={styles.searchInput}
        />
      </View>

      <View style={styles.filterRow}>
        <FilterField
          icon={House}
          label={t.history.filterOutlet}
          value={outlet === 'all' ? t.history.anyOutlet : outlet}
        active={outlet !== 'all'}
        open={openSelect === 'outlet'}
          onPress={() => {
            setOpenSelect((s) => (s === 'outlet' ? null : 'outlet'));
            setCalendarOpen(false);
          }}
        />
        <FilterField
          icon={Briefcase}
          label={t.history.filterStatus}
          value={STATUS_OPTIONS.find((o) => o.id === status)?.label(t) ?? t.history.anyStatus}
        active={status !== 'any'}
        open={openSelect === 'status'}
          onPress={() => {
            setOpenSelect((s) => (s === 'status' ? null : 'status'));
            setCalendarOpen(false);
          }}
        />
      </View>

      {openSelect === 'outlet' && (
        <SelectList
          options={[
            { id: 'all', label: t.history.anyOutlet },
            // Outlet NAMES are data — the venue is called what it is called.
            ...outlets.map((o) => ({ id: o, label: o })),
          ]}
          selected={outlet}
          onPick={(id) => {
            setOutlet(id);
            setOpenSelect(null);
          }}
        />
      )}
      {openSelect === 'status' && (
        <SelectList
          options={STATUS_OPTIONS.map((o) => ({ id: o.id, label: o.label(t) }))}
          selected={status}
          onPick={(id) => {
            setStatus(id as StatusFilter);
            setOpenSelect(null);
          }}
        />
      )}

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

      {/*
        The two halves of the history, counted on the SAME `filtered` list the
        cards render from — so a tab never advertises shifts the active filters
        have already removed.
      */}
      <View style={styles.weekTabs}>
        <Pressable
          style={[styles.weekTab, weekTab === 'current' && styles.weekTabOn]}
          onPress={() => setWeekTab('current')}
        >
          <Text
            style={[
              styles.weekTabTitle,
              weekTab === 'current' && styles.weekTabTitleOn,
            ]}
          >
            {t.history.tabCurrentWeek}
          </Text>
          <Text style={styles.weekTabSub}>
            {formatMessage(
              currentShiftCount === 1
                ? t.history.shiftCountOne
                : t.history.shiftCountMany,
              { n: currentShiftCount },
            )}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.weekTab, weekTab === 'payroll' && styles.weekTabOn]}
          onPress={() => setWeekTab('payroll')}
        >
          <Text
            style={[
              styles.weekTabTitle,
              weekTab === 'payroll' && styles.weekTabTitleOn,
            ]}
          >
            {t.history.tabPayrollWeeks}
          </Text>
          <Text style={styles.weekTabSub}>
            {formatMessage(
              payrollShiftCount === 1
                ? t.history.shiftCountOne
                : t.history.shiftCountMany,
              { n: payrollShiftCount },
            )}
          </Text>
        </Pressable>
      </View>

      <View style={styles.weekList}>
        {historyWeeks.map((week) => {
          // The tab is the FIRST cut: a week belonging to the other half is not
          // "empty", it is not on this screen at all, so it must not reach the
          // no-results state below either.
          if (weekTabOf(week) !== weekTab) return null;
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
                {/*
                  Drawn only when the card is ABOUT one agency. A week with no
                  agency (an older backend, or lines nothing could attribute)
                  would otherwise get a "?" monogram claiming a company that is
                  not there.
                */}
                {week.agencyName ? (
                  <AgencyLogo
                    logoImage={week.agencyLogo}
                    name={week.agencyName}
                    size={32}
                  />
                ) : null}
                <View style={{ flex: 1, minWidth: 0 }}>
                  {/*
                    Agency FIRST and biggest: with two cards for one week it is
                    the only thing that tells them apart, and a monogram is not
                    a name — most agencies have no logo at all.
                  */}
                  {week.agencyName ? (
                    <Text style={styles.weekAgency} numberOfLines={1}>
                      {week.agencyName}
                    </Text>
                  ) : null}
                  <Text style={styles.weekTitle}>{weekTitle(week, t)}</Text>
                  <View style={styles.weekMetaRow}>
                    {week.kind === 'current' ? (
                      <Pill variant="amber">{t.history.statusCurrent}</Pill>
                    ) : (
                      <Text style={styles.pvRef}>{week.pvRef}</Text>
                    )}
                    {/* Two whole sentences, not an 's' appended to one:
                        Chinese has no plural form to append. */}
                    <Text style={styles.weekCount}>
                      {formatMessage(
                        count === 1 ? t.history.shiftCountOne : t.history.shiftCountMany,
                        { n: count },
                      )}
                    </Text>
                  </View>
                  <Text style={styles.weekEarn}>
                    {formatMessage(t.history.weekEarnLine, {
                      earned: formatRM(weekEarned),
                      wages: formatRM(weekWages),
                    })}
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
                    <Text style={styles.emptyText}>{t.history.noShiftsInWeek}</Text>
                  ) : (
                    weekShifts.map((row) => <ShiftCard key={row.id} shift={row} />)
                  )}
                </View>
              )}
            </View>
          );
        })}

        {/*
          Two different emptinesses, and they need different sentences. "No
          shifts match" beside a Reset button is wrong for a PR who has simply
          never been issued a voucher — there is nothing to reset, and the
          button would do nothing.
        */}
        {shownShiftCount === 0 &&
          (weekTab === 'payroll' && !hasAnyPayrollWeek ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>{t.history.noPayrollWeeksYet}</Text>
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>{t.history.noShiftsMatch}</Text>
              <IzButton label={t.history.resetFilters} variant="soft" small onPress={clearFilters} />
            </View>
          ))}
      </View>
    </View>
  );
}

function ShiftCard({ shift }: { shift: DemoHistoryShift }) {
  const { t } = useLocale();
  const pill = statusPill(shift.status, t);
  const cancelled = shift.status === 'cancelled';

  return (
    <View style={[styles.shiftCard, cancelled && styles.shiftCardCancelled]}>
      <View style={styles.shiftTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.outlet}>{shift.outlet}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {shift.dateLabel} · {shift.time}
          </Text>
        </View>
        <Pill variant={pill.variant}>{pill.label}</Pill>
      </View>

      {!cancelled && (
        <>
          <Text style={styles.payoutLine}>
            {formatMessage(t.history.totalPayout, { amount: formatRM(shift.payout) })}
          </Text>
          <View style={styles.metrics}>
            <Metric icon={Wallet} label={t.history.metricWages} value={shift.wages} />
            <Metric icon={Wine} label={t.shiftStatus.drinks} value={shift.drinks} />
            <Metric icon={Sparkles} label={t.shiftStatus.tips} value={shift.tips} />
            <Metric icon={Briefcase} label={t.history.metricOthers} value={shift.others} />
          </View>
        </>
      )}
      {cancelled && <Text style={styles.cancelledNote}>{t.history.cancelledNoPayout}</Text>}
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

/**
 * One filter control.
 *
 * ⚠️ It has to look TAPPABLE and it has to show whether it is doing anything.
 * These read as static captions before: a 9px label and a 12px value, both
 * muted, in a box whose border and fill were a hair off the card behind them —
 * and an OUTLET set to a real venue looked exactly like one set to "Any".
 *
 * So two changes, not one. The resting state gets weight (a chevron, a real
 * border, bigger value text); the ACTIVE state gets the violet tint the portals
 * use for a live filter, so a narrowed list always says so.
 */
function FilterField({
  icon: Icon,
  label,
  value,
  onPress,
  disabled,
  flex,
  active,
  open,
}: {
  icon: typeof House;
  label: string;
  value: string;
  onPress?: () => void;
  disabled?: boolean;
  flex?: boolean;
  /** The filter is NARROWING the list — not left on "Any". */
  active?: boolean;
  /** Its picker is open, so the chevron points up. */
  open?: boolean;
}) {
  return (
    <Pressable
      style={[
        styles.filterField,
        active && styles.filterFieldOn,
        flex && { flex: 1 },
        disabled && { opacity: 0.45 },
      ]}
      onPress={disabled ? undefined : onPress}
      disabled={disabled || !onPress}
    >
      <View style={styles.filterFieldTop}>
        <Icon size={12} color={active ? C.violetL : C.muted2} />
        <Text style={[styles.filterFieldLabel, active && { color: C.violetL }]}>
          {label}
        </Text>
      </View>
      <View style={styles.filterFieldRow}>
        <Text
          style={[styles.filterFieldValue, active && styles.filterFieldValueOn]}
          numberOfLines={1}
        >
          {value}
        </Text>
        {/* The chevron is what says "this opens something". Without it these
            were three captions the eye slid straight past. */}
        <ChevronDown
          size={14}
          color={active ? C.violetL : C.muted2}
          style={open ? { transform: [{ rotate: '180deg' }] } : undefined}
        />
      </View>
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
    ...font(700),
    fontSize: 10,
    letterSpacing: 0.8,
    color: C.muted2,
  },
  summaryVal: {
    marginTop: 6,
    ...font(800),
    fontSize: 18,
    color: C.accentL,
  },
  filterHead: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterTitle: {
    ...font(800),
    fontSize: 12,
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
  searchInput: { flex: 1, ...font(), fontSize: 14, color: C.txt, padding: 0 },
  filterRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  filterField: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    // `line2` not `line`: the old border was so close to the card behind it
    // that the control had no visible edge at all.
    borderColor: C.line2,
    borderRadius: 12,
    paddingHorizontal: 12,
    // 8 -> 11: a filter is a TAP TARGET, and these were 30px tall.
    paddingVertical: 11,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  /** Set to something other than "Any" — the same violet the portals use. */
  filterFieldOn: {
    borderColor: 'rgba(183,156,232,0.5)',
    backgroundColor: 'rgba(183,156,232,0.1)',
  },
  filterFieldTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  filterFieldLabel: {
    ...font(800),
    // 9px is below the smallest step the portals allow anything to render at.
    fontSize: 11,
    letterSpacing: 0.6,
    color: C.muted2,
  },
  filterFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  filterFieldValue: {
    marginTop: 4,
    ...font(600),
    fontSize: 14,
    color: C.prMuted,
    flexShrink: 1,
  },
  /** A real choice is stated in the body colour, not left looking like "Any". */
  filterFieldValueOn: { ...font(700), color: C.txt },
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
  selectText: { ...font(600), fontSize: 13, color: C.txt },
  // Deliberately the SAME shape as the Payment screen’s This-week / Last-week
  // tabs: two segmented controls over the same idea of a week, on two screens
  // one tap apart, should not look like two different mechanisms.
  weekTabs: {
    marginTop: 14,
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
  weekTabTitle: {
    ...font(700),
    fontSize: 14,
    color: C.muted,
  },
  weekTabTitleOn: { color: C.txt },
  weekTabSub: {
    marginTop: 4,
    ...font(),
    fontSize: 11,
    color: C.prMuted2,
    textAlign: 'center',
  },
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
  // The company owns the top line; the week is its subtitle.
  weekAgency: {
    ...font(800),
    fontSize: 15,
    color: C.goldL,
  },
  weekTitle: {
    marginTop: 2,
    ...font(700),
    fontSize: 11,
    letterSpacing: 0.6,
    color: C.prMuted,
  },
  weekMetaRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  pvRef: {
    ...font(700),
    fontSize: 11,
    color: C.violetL,
  },
  weekCount: { ...font(), fontSize: 12, color: C.prMuted },
  weekEarn: {
    marginTop: 6,
    ...font(),
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
  outlet: { ...font(700), fontSize: 16, color: C.txt },
  meta: { marginTop: 3, ...font(), fontSize: 12, color: C.prMuted },
  payoutLine: {
    marginTop: 10,
    ...font(800),
    fontSize: 18,
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
    ...font(700),
    fontSize: 10,
    letterSpacing: 0.4,
    color: C.muted2,
  },
  metricVal: {
    marginTop: 4,
    ...font(800),
    fontSize: 14,
    color: C.txt,
  },
  cancelledNote: {
    marginTop: 10,
    ...font(),
    fontSize: 12,
    color: C.red,
  },
  emptyBox: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  emptyText: { ...font(), fontSize: 14, color: C.prMuted, textAlign: 'center' },
});
