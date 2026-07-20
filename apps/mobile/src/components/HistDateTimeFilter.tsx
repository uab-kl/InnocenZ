/**
 * History date calendar + from/to time — mirrors proto `PvDateTimeFilter` / `HistDateCalendar`.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, F } from '../theme/theme';
import { MONTH_LABELS, todayYmd, ymdToIso } from '../lib/demo-shifts';
import {
  calendarNavYears,
  dateFromIsoKey,
  formatHistDateKey,
  isoKeyFromDate,
  isDateSelectableForFilter,
} from '../lib/hist-date-time-filters';
import { Calendar, ChevronDown, Clock } from './icons';
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;
type TimePeriod = 'AM' | 'PM';
type Time12Parts = { hour12: number; minute: number; period: TimePeriod };
const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const PERIODS: TimePeriod[] = ['AM', 'PM'];
function parseTime12(hhmm: string): Time12Parts {
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  const h24 = m ? Math.min(23, Math.max(0, parseInt(m[1], 10))) : 12;
  const minute = m ? Math.min(59, Math.max(0, parseInt(m[2], 10))) : 0;
  const period: TimePeriod = h24 >= 12 ? 'PM' : 'AM';
  let hour12 = h24 % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, minute, period };
}
function formatTime24(parts: Time12Parts): string {
  let h24 = parts.hour12 % 12;
  if (parts.period === 'PM') h24 += 12;
  return `${String(h24).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}
function formatTimeLabel(hhmm: string): string {
  if (!hhmm.trim()) return '';
  const { hour12, minute, period } = parseTime12(hhmm);
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}
function TimePickerColumn<T extends string | number>({
  items,
  value,
  onChange,
  formatItem,
}: {
  items: readonly T[];
  value: T;
  onChange: (v: T) => void;
  formatItem: (v: T) => string;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const selectedIndex = Math.max(0, items.indexOf(value));
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, selectedIndex * 36 - 36), animated: false });
    });
    return () => cancelAnimationFrame(id);
  }, [selectedIndex]);
  return (
    <ScrollView
      ref={scrollRef}
      style={styles.timeCol}
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
    >
      {items.map((item) => {
        const selected = item === value;
        return (
          <Pressable
            key={String(item)}
            style={[styles.timeColBtn, selected && styles.timeColBtnOn]}
            onPress={() => onChange(item)}
          >
            <Text style={[styles.timeColText, selected && styles.timeColTextOn]}>
              {formatItem(item)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
export function HistTimeInput({
  value,
  onChange,
  disabled,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const hasValue = Boolean(value?.trim());
  const draft = useMemo(() => parseTime12(hasValue ? value : '12:00'), [value, hasValue]);
  const apply = (next: Time12Parts) => onChange(formatTime24(next));
  const display = disabled
    ? 'Pick date first'
    : hasValue
      ? formatTimeLabel(value)
      : 'Tap to choose';
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={styles.filterFieldLabel}>{label}</Text>
      <Pressable
        style={[
          styles.filterField,
          open && styles.filterFieldOpen,
          disabled && { opacity: 0.55 },
        ]}
        disabled={disabled}
        onPress={() => !disabled && setOpen((o) => !o)}
      >
        <View style={styles.filterFieldValueRow}>
          <Clock size={12} color={C.muted2} />
          <Text
            style={[styles.filterFieldValue, !hasValue && !disabled && { color: C.muted2 }]}
            numberOfLines={1}
          >
            {display}
          </Text>
          {!disabled ? (
            <ChevronDown
              size={12}
              color={C.muted}
              style={open ? { transform: [{ rotate: '180deg' }] } : undefined}
            />
          ) : null}
        </View>
      </Pressable>
      {open && !disabled && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
            <Pressable style={styles.timeModalCard} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.timeModalTitle}>{label}</Text>
              <View style={styles.timeColumns}>
                <TimePickerColumn
                  items={HOURS_12}
                  value={draft.hour12}
                  onChange={(hour12) => apply({ ...draft, hour12 })}
                  formatItem={(h) => String(h).padStart(2, '0')}
                />
                <TimePickerColumn
                  items={MINUTES}
                  value={draft.minute}
                  onChange={(minute) => apply({ ...draft, minute })}
                  formatItem={(m) => String(m).padStart(2, '0')}
                />
                <TimePickerColumn
                  items={PERIODS}
                  value={draft.period}
                  onChange={(period) => apply({ ...draft, period })}
                  formatItem={(p) => p}
                />
              </View>
              <Pressable style={styles.timeDone} onPress={() => setOpen(false)}>
                <Text style={styles.timeDoneText}>Done</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}
type CalCell = {
  iso: string;
  day: number;
  inMonth: boolean;
  selectable: boolean;
};
function buildMonthGrid(viewMonth: Date, todayIso: string): CalCell[] {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = isoKeyFromDate(d);
    const inMonth = d.getMonth() === month;
    return {
      iso,
      day: d.getDate(),
      inMonth,
      selectable: inMonth && isDateSelectableForFilter(d, todayIso),
    };
  });
}
function CalDayCell({
  cell,
  selectedIso,
  todayIso,
  hasWork,
  onSelect,
}: {
  cell: CalCell;
  selectedIso: string;
  todayIso: string;
  hasWork: boolean;
  onSelect: (iso: string) => void;
}) {
  const isSelected = selectedIso === cell.iso;
  const isToday = cell.iso === todayIso;
  return (
    <Pressable
      style={[
        styles.dayCell,
        !cell.inMonth && styles.dayOutside,
        cell.inMonth && !cell.selectable && styles.dayFuture,
        isSelected && styles.daySelected,
        isToday && !isSelected && cell.inMonth && styles.dayToday,
      ]}
      disabled={!cell.selectable}
      onPress={() => onSelect(cell.iso)}
    >
      <Text
        style={[
          styles.dayNum,
          !cell.inMonth && styles.dayNumOutside,
          cell.inMonth && !cell.selectable && styles.dayNumFuture,
          isSelected && styles.dayNumSelected,
        ]}
      >
        {cell.day}
      </Text>
      {hasWork ? (
        <View style={[styles.workDot, isSelected && styles.workDotOnSelected]} />
      ) : null}
    </Pressable>
  );
}
export function HistDateCalendar({
  selectedIso,
  workDayKeys,
  onSelect,
}: {
  selectedIso: string;
  workDayKeys: string[];
  onSelect: (iso: string) => void;
}) {
  const today = todayYmd();
  const todayIso = ymdToIso(...today);
  const workDays = useMemo(() => new Set(workDayKeys), [workDayKeys]);
  const selected = dateFromIsoKey(selectedIso);
  const defaultMonth =
    selected ??
    dateFromIsoKey(workDayKeys[0] ?? todayIso) ??
    new Date(today[0], today[1] - 1, 1);
  const [viewMonth, setViewMonth] = useState(defaultMonth);
  const [navOpen, setNavOpen] = useState<'month' | 'year' | null>(null);
  useEffect(() => {
    if (selected) setViewMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
  }, [selectedIso]);
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const years = useMemo(() => calendarNavYears(workDayKeys, today[0]), [workDayKeys, today]);
  const cells = useMemo(() => buildMonthGrid(viewMonth, todayIso), [viewMonth, todayIso]);
  const weeks = useMemo(() => {
    const rows: CalCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [cells]);
  return (
    <View style={styles.cal}>
      <View style={styles.calNav}>
        <View style={styles.navField}>
          <Text style={styles.navLabel}>MONTH</Text>
          <Pressable
            style={[styles.select, navOpen === 'month' && styles.selectOpen]}
            onPress={() => setNavOpen((o) => (o === 'month' ? null : 'month'))}
          >
            <Text style={styles.selectText} numberOfLines={1}>
              {MONTH_LABELS[month]}
            </Text>
            <ChevronDown
              size={14}
              color={C.muted}
              style={navOpen === 'month' ? { transform: [{ rotate: '180deg' }] } : undefined}
            />
          </Pressable>
        </View>
        <View style={styles.navField}>
          <Text style={styles.navLabel}>YEAR</Text>
          <Pressable
            style={[styles.select, navOpen === 'year' && styles.selectOpen]}
            onPress={() => setNavOpen((o) => (o === 'year' ? null : 'year'))}
          >
            <Text style={styles.selectText}>{year}</Text>
            <ChevronDown
              size={14}
              color={C.muted}
              style={navOpen === 'year' ? { transform: [{ rotate: '180deg' }] } : undefined}
            />
          </Pressable>
        </View>
      </View>
      {navOpen === 'month' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipRow}
        >
          {MONTH_LABELS.map((label, i) => (
            <Pressable
              key={label}
              style={[styles.chip, i === month && styles.chipOn]}
              onPress={() => {
                setViewMonth(new Date(year, i, 1));
                setNavOpen(null);
              }}
            >
              <Text style={[styles.chipText, i === month && styles.chipTextOn]}>
                {label.slice(0, 3)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {navOpen === 'year' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipRow}
        >
          {years.map((y) => (
            <Pressable
              key={y}
              style={[styles.chip, y === year && styles.chipOn]}
              onPress={() => {
                setViewMonth(new Date(y, month, 1));
                setNavOpen(null);
              }}
            >
              <Text style={[styles.chipText, y === year && styles.chipTextOn]}>{y}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <View style={styles.weekdays}>
        {WEEKDAYS.map((w) => (
          <View key={w} style={styles.weekdayCell}>
            <Text style={styles.weekday}>{w}</Text>
          </View>
        ))}
      </View>
      <View style={styles.grid}>
        {weeks.map((row, ri) => (
          <View key={`w-${ri}`} style={styles.gridRow}>
            {row.map((cell) => (
              <CalDayCell
                key={cell.iso}
                cell={cell}
                selectedIso={selectedIso}
                todayIso={todayIso}
                hasWork={cell.inMonth && workDays.has(cell.iso)}
                onSelect={onSelect}
              />
            ))}
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendRow}>
          <View style={styles.legendDot} />
          <Text style={styles.legendText}>Worked · has record</Text>
        </View>
        <Text style={styles.legendNote}>Any date up to today · empty days show no rows.</Text>
      </View>
    </View>
  );
}

export function HistDateField({
  date,
  workDayKeys,
  calendarOpen,
  onCalendarOpenChange,
  onDateChange,
  onClearSideEffects,
}: {
  date: string;
  workDayKeys: string[];
  calendarOpen: boolean;
  onCalendarOpenChange: (open: boolean) => void;
  onDateChange: (iso: string) => void;
  onClearSideEffects?: () => void;
}) {
  const dateLabel = date ? formatHistDateKey(date) : 'Any date';
  const clearDate = () => {
    onDateChange('');
    onClearSideEffects?.();
    onCalendarOpenChange(false);
  };

  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Pressable
        style={[styles.filterField, calendarOpen && styles.filterFieldOpen]}
        onPress={() => onCalendarOpenChange(!calendarOpen)}
      >
        <Text style={styles.filterFieldLabel}>DATE</Text>
        <View style={styles.filterFieldValueRow}>
          <Calendar size={12} color={C.muted2} />
          <Text style={[styles.filterFieldValue, !date && { color: C.muted2 }]} numberOfLines={1}>
            {dateLabel}
          </Text>
          {date ? (
            <Pressable hitSlop={8} onPress={() => clearDate()}>
              <Text style={styles.clearX}>✕</Text>
            </Pressable>
          ) : (
            <ChevronDown
              size={12}
              color={C.muted}
              style={calendarOpen ? { transform: [{ rotate: '180deg' }] } : undefined}
            />
          )}
        </View>
      </Pressable>

      <Modal
        visible={calendarOpen}
        transparent
        animationType="fade"
        onRequestClose={() => onCalendarOpenChange(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => onCalendarOpenChange(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <HistDateCalendar
              selectedIso={date}
              workDayKeys={workDayKeys}
              onSelect={(iso) => {
                onDateChange(iso);
                onCalendarOpenChange(false);
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export function HistDateTimeFilter({
  date,
  timeFrom,
  timeTo,
  onDateChange,
  onTimeFromChange,
  onTimeToChange,
  workDayKeys,
  calendarOpen,
  onCalendarOpenChange,
  activityKind = 'shift',
}: {
  date: string;
  timeFrom: string;
  timeTo: string;
  onDateChange: (iso: string) => void;
  onTimeFromChange: (v: string) => void;
  onTimeToChange: (v: string) => void;
  workDayKeys: string[];
  calendarOpen: boolean;
  onCalendarOpenChange: (open: boolean) => void;
  activityKind?: 'shift' | 'payment';
}) {
  return (
    <View style={styles.root}>
      <HistDateField
        date={date}
        workDayKeys={workDayKeys}
        calendarOpen={calendarOpen}
        onCalendarOpenChange={onCalendarOpenChange}
        onDateChange={onDateChange}
        onClearSideEffects={() => {
          onTimeFromChange('');
          onTimeToChange('');
        }}
      />

      <View style={styles.timeRow}>
        <HistTimeInput
          label="FROM TIME"
          value={timeFrom}
          onChange={onTimeFromChange}
          disabled={!date}
        />
        <HistTimeInput
          label="TO TIME"
          value={timeTo}
          onChange={onTimeToChange}
          disabled={!date}
        />
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { marginTop: 8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(6,3,12,0.72)',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  modalCard: {
    maxWidth: 360,
    width: '100%',
    alignSelf: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: C.panel,
    padding: 12,
    maxHeight: '85%',
  },
  timeModalCard: {
    maxWidth: 320,
    width: '100%',
    alignSelf: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: C.panel,
    padding: 14,
  },
  timeModalTitle: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: C.muted2,
    marginBottom: 10,
  },
  filterField: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  filterFieldOpen: {
    borderColor: 'rgba(232,194,122,0.45)',
    backgroundColor: 'rgba(232,194,122,0.06)',
  },
  filterFieldLabel: {
    fontFamily: F.sora,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: C.muted2,
  },
  filterFieldValueRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterFieldValue: { flex: 1, fontFamily: F.manrope, fontSize: 12, color: C.txt },
  clearX: { fontFamily: F.sora, fontSize: 14, color: C.muted, paddingHorizontal: 4 },
  cal: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: C.panel,
    padding: 12,
    overflow: 'hidden',
  },
  calNav: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  navField: { flex: 1, minWidth: 0 },
  navLabel: {
    fontFamily: F.sora,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: C.muted2,
    marginBottom: 4,
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  selectOpen: {
    borderColor: 'rgba(183,156,232,0.45)',
  },
  selectText: { flex: 1, fontFamily: F.sora, fontSize: 13, fontWeight: '600', color: C.txt },
  chipScroll: { marginBottom: 10, maxHeight: 44 },
  chipRow: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  chipOn: {
    borderColor: 'rgba(183,156,232,0.55)',
    backgroundColor: 'rgba(183,156,232,0.18)',
  },
  chipText: { fontFamily: F.sora, fontSize: 12, fontWeight: '600', color: C.muted },
  chipTextOn: { color: C.violetL },
  weekdays: { flexDirection: 'row', marginBottom: 6 },
  weekdayCell: { flex: 1, alignItems: 'center' },
  weekday: {
    fontFamily: F.sora,
    fontSize: 10,
    fontWeight: '700',
    color: C.muted2,
  },
  grid: { width: '100%' },
  gridRow: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 2,
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    position: 'relative',
  },
  dayOutside: { opacity: 0.3 },
  dayFuture: { opacity: 0.35 },
  daySelected: { backgroundColor: C.violetL },
  dayToday: { borderWidth: 1, borderColor: 'rgba(183,156,232,0.55)' },
  dayNum: { fontFamily: F.sora, fontSize: 14, fontWeight: '600', color: C.txt },
  dayNumOutside: { color: C.muted2, fontWeight: '500' },
  dayNumFuture: { color: C.muted2 },
  dayNumSelected: { color: '#1a1228', fontWeight: '800' },
  workDot: {
    position: 'absolute',
    bottom: 5,
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: C.goldL,
  },
  workDotOnSelected: { backgroundColor: '#1a1228' },
  legend: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.line,
    gap: 4,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: C.goldL,
  },
  legendText: { fontFamily: F.manrope, fontSize: 11, color: C.prMuted },
  legendNote: { fontFamily: F.manrope, fontSize: 10, color: C.muted2, lineHeight: 14 },
  timeRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  timePopover: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: C.panel,
    padding: 8,
  },
  timeColumns: { flexDirection: 'row', gap: 6, height: 140 },
  timeCol: { flex: 1 },
  timeColBtn: {
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  timeColBtnOn: { backgroundColor: 'rgba(232,194,122,0.15)' },
  timeColText: { fontFamily: F.sora, fontSize: 14, color: C.muted },
  timeColTextOn: { color: C.goldL, fontWeight: '700' },
  timeDone: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(232,194,122,0.12)',
  },
  timeDoneText: { fontFamily: F.sora, fontSize: 13, fontWeight: '700', color: C.goldL },
  hint: {
    marginTop: 6,
    fontFamily: F.manrope,
    fontSize: 11,
    color: C.muted2,
    lineHeight: 15,
  },
});
