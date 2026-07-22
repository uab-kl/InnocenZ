/**
 * Agency schedule — calendar + timetable from real `/shift-assignment/mine`
 * rows. Status follows attendance stamps: On duty (checked in) / Complete
 * (checked out) / Scheduled|Pending (booked).
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, F } from '../theme/theme';
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  Clock,
  Shield,
} from './icons';
import { Pill } from './ui';
import {
  CANCELLATION_RULE_SUMMARY,
  DAY_NAMES,
  MONTH_LABELS,
  MONTH_NAMES,
  buildScheduleDays,
  buildUpcomingWeekTimetable,
  formatUpcomingWeekLabel,
  getUpcomingWeekRange,
  isoToYmd,
  type ScheduleDayKind,
  type TimetableEntry,
  todayYmd,
  ymdToIso,
} from '../lib/demo-shifts';
import { useActiveShift } from '../lib/active-shift';
import { useSession } from '../lib/session';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

const KIND_STYLE: Record<ScheduleDayKind, { bg: string; border: string; color: string }> = {
  past: { bg: 'transparent', border: 'transparent', color: C.muted2 },
  open: { bg: 'rgba(255,255,255,0.03)', border: 'rgba(232,224,245,0.22)', color: C.muted },
  unavailable: { bg: 'rgba(240,138,138,0.12)', border: 'rgba(240,138,138,0.35)', color: C.red },
  assigned: { bg: 'rgba(93,217,160,0.16)', border: 'rgba(93,217,160,0.45)', color: C.green },
  pending: { bg: 'rgba(232,198,106,0.14)', border: 'rgba(232,198,106,0.4)', color: C.amber },
  active: { bg: 'rgba(232,194,122,0.18)', border: 'rgba(232,194,122,0.5)', color: C.accentL },
};

export function AgencySchedulePanel() {
  const today = todayYmd();
  const { me, agencies } = useSession();
  const { assignments, refresh } = useActiveShift();
  const [viewMonth, setViewMonth] = useState(() => new Date(today[0], today[1] - 1, 1));
  const [blocked, setBlocked] = useState<string[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [cancelledIds, setCancelledIds] = useState<string[]>([]);

  const agencyName = agencies[0]?.agencyName ?? me?.username ?? 'Agency';
  const todayIso = ymdToIso(...today);

  const scheduleShifts = useMemo(
    () =>
      assignments
        .filter((a) => a.status !== 'cancelled' && a.status !== 'no_show')
        .map((a) => ({
          id: a.id,
          dateIso: a.shiftDate,
          outlet: a.outletName ?? 'Outlet',
          time: a.slot ?? '—',
          checkInAt: a.checkInAt,
          checkOutAt: a.checkOutAt,
          status: a.status,
          agencyName,
        })),
    [assignments, agencyName],
  );

  const days = useMemo(
    () => buildScheduleDays(blocked, todayIso, scheduleShifts),
    [blocked, todayIso, scheduleShifts],
  );
  const dayByIso = useMemo(() => new Map(days.map((d) => [d.dateIso, d])), [days]);

  const weekRange = useMemo(() => getUpcomingWeekRange(todayIso), [todayIso]);
  const weekLabel = formatUpcomingWeekLabel(weekRange.fromIso, weekRange.toIso).toUpperCase();
  const timetable = useMemo(
    () =>
      buildUpcomingWeekTimetable(todayIso, scheduleShifts).filter(
        (e) => !cancelledIds.includes(e.id),
      ),
    [cancelledIds, scheduleShifts, todayIso],
  );

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const years = [year - 1, year, year + 1];

  const toggleDay = (iso: string) => {
    const day = dayByIso.get(iso);
    if (
      !day ||
      day.kind === 'past' ||
      day.kind === 'assigned' ||
      day.kind === 'pending' ||
      day.kind === 'active'
    ) {
      return;
    }
    setBlocked((prev) => (prev.includes(iso) ? prev.filter((x) => x !== iso) : [...prev, iso]));
  };

  return (
    <View style={styles.root}>
      <View style={styles.rules}>
        <Pressable style={styles.rulesHd} onPress={() => setRulesOpen((o) => !o)}>
          <AlertTriangle size={16} color={C.amber} />
          <Text style={styles.rulesTitle}>Cancellation rules</Text>
          <ChevronDown
            size={16}
            color={C.muted}
            style={rulesOpen ? { transform: [{ rotate: '180deg' }] } : undefined}
          />
        </Pressable>
        {rulesOpen && (
          <View style={styles.rulesList}>
            {CANCELLATION_RULE_SUMMARY.map((r) => (
              <View key={r.label} style={styles.ruleRow}>
                <Text style={styles.ruleWhen}>{r.label}</Text>
                <Text
                  style={[
                    styles.ruleOut,
                    { color: r.tone === 'green' ? C.green : r.tone === 'amber' ? C.amber : C.red },
                  ]}
                >
                  {r.outcome}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.calWrap}>
        <View style={styles.calNav}>
          <View style={styles.navField}>
            <Text style={styles.navLabel}>MONTH</Text>
            <Pressable
              style={styles.select}
              onPress={() => setViewMonth(new Date(year, (month + 11) % 12, 1))}
            >
              <Text style={styles.selectText}>{MONTH_LABELS[month]}</Text>
              <ChevronDown size={14} color={C.muted} />
            </Pressable>
          </View>
          <View style={styles.navField}>
            <Text style={styles.navLabel}>YEAR</Text>
            <Pressable
              style={styles.select}
              onPress={() => setViewMonth(new Date(year + 1, month, 1))}
            >
              <Text style={styles.selectText}>{year}</Text>
              <ChevronDown size={14} color={C.muted} />
            </Pressable>
          </View>
        </View>

        <View style={styles.yearChips}>
          {years.map((y) => (
            <Pressable
              key={y}
              style={[styles.yearChip, y === year && styles.yearChipOn]}
              onPress={() => setViewMonth(new Date(y, month, 1))}
            >
              <Text style={[styles.yearChipText, y === year && { color: C.txt }]}>{y}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.monthChips}>
          {MONTH_LABELS.map((label, i) => (
            <Pressable
              key={label}
              style={[styles.monthChip, i === month && styles.monthChipOn]}
              onPress={() => setViewMonth(new Date(year, i, 1))}
            >
              <Text style={[styles.monthChipText, i === month && { color: C.txt }]}>
                {label.slice(0, 3)}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.weekdays}>
          {WEEKDAYS.map((w) => (
            <Text key={w} style={styles.weekday}>
              {w}
            </Text>
          ))}
        </View>

        <View style={styles.grid}>
          {cells.map((dayNum, i) => {
            if (dayNum == null) return <View key={`e-${i}`} style={styles.dayCell} />;
            const iso = ymdToIso(year, month + 1, dayNum);
            const day = dayByIso.get(iso);
            const kind = day?.kind ?? 'past';
            const style = KIND_STYLE[kind];
            const isToday = iso === todayIso;
            const canToggle = kind === 'open' || kind === 'unavailable';
            return (
              <Pressable
                key={iso}
                style={[
                  styles.dayCell,
                  styles.dayBtn,
                  { backgroundColor: style.bg, borderColor: style.border },
                  isToday && styles.dayToday,
                ]}
                disabled={!canToggle}
                onPress={() => toggleDay(iso)}
              >
                <Text style={[styles.dayNum, { color: style.color }]}>{dayNum}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.legend}>
          <LegendSwatch color="rgba(232,224,245,0.35)" label="Available" />
          <LegendSwatch color={C.green} label="Scheduled / Complete" />
          <LegendSwatch color={C.accentL} label="On duty" />
          <LegendSwatch color={C.amber} label="Pending" />
          <LegendSwatch color={C.red} label="Not available" />
        </View>
        <Text style={styles.hint}>
          Tap an available day to block it · tap a blocked day to reopen
        </Text>
      </View>

      <View style={styles.timetable}>
        <View style={styles.ttHead}>
          <Clock size={16} color={C.muted2} />
          <Text style={styles.ttTitle}>Timetable · {weekLabel}</Text>
          <Pressable onPress={() => void refresh()} hitSlop={8} style={{ marginLeft: 'auto' }}>
            <Text style={styles.refreshText}>Refresh</Text>
          </Pressable>
        </View>
        {timetable.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No shifts this week</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {timetable.map((entry) => (
              <TimetableRow
                key={entry.id}
                entry={entry}
                onCancel={() => setCancelledIds((ids) => [...ids, entry.id])}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function TimetableRow({
  entry,
  onCancel,
}: {
  entry: TimetableEntry;
  onCancel: () => void;
}) {
  const [y, m, d] = isoToYmd(entry.dateIso);
  const dateFriendly = `${DAY_NAMES[new Date(y, m - 1, d).getDay()]} ${String(d).padStart(2, '0')} ${MONTH_NAMES[m - 1]} ${y}`;

  return (
    <View style={styles.ttRow}>
      <View style={styles.agencyBadge}>
        <Shield size={12} color={C.violetL} />
        <Text style={styles.agencyBadgeText}>AGENCY · {entry.sourceLabel.toUpperCase()}</Text>
      </View>
      <View style={styles.ttTop}>
        <View style={styles.ttTitleRow}>
          <CalendarDays size={14} color={C.muted2} />
          <Text style={styles.ttOutlet}>{entry.outlet}</Text>
          <Pill variant={entry.statusVariant}>{entry.statusLabel}</Pill>
        </View>
      </View>
      <Text style={styles.ttFieldLabel}>DATE</Text>
      <Text style={styles.ttFieldValue}>{dateFriendly}</Text>
      <Text style={[styles.ttFieldLabel, { marginTop: 8 }]}>TIME</Text>
      <Text style={styles.ttFieldValue}>{entry.time}</Text>
      {entry.canCancel ? (
        <Pressable onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14 },
  rules: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(232,198,106,0.25)',
    backgroundColor: 'rgba(232,198,106,0.06)',
    overflow: 'hidden',
  },
  rulesHd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rulesTitle: {
    flex: 1,
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: C.txt,
  },
  rulesList: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(232,198,106,0.2)',
  },
  ruleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingTop: 6 },
  ruleWhen: { fontFamily: F.manrope, fontSize: 13, color: C.prMuted },
  ruleOut: { fontFamily: F.sora, fontSize: 13, fontWeight: '700' },
  calWrap: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 12,
  },
  calNav: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  navField: { flex: 1 },
  navLabel: {
    fontFamily: F.sora,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: C.muted2,
    marginBottom: 4,
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: C.line2,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  selectText: { fontFamily: F.sora, fontSize: 14, fontWeight: '600', color: C.txt },
  yearChips: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  yearChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
  },
  yearChipOn: { borderColor: C.violet, backgroundColor: C.violetInk },
  yearChipText: { fontFamily: F.sora, fontSize: 12, fontWeight: '600', color: C.muted },
  monthChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 10 },
  monthChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  monthChipOn: { borderColor: C.line2, backgroundColor: C.glass2 },
  monthChipText: { fontFamily: F.manrope, fontSize: 11, color: C.muted2 },
  weekdays: { flexDirection: 'row', marginBottom: 4 },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontFamily: F.manrope,
    fontSize: 11,
    fontWeight: '600',
    color: C.muted2,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { flexBasis: '14.28%', maxWidth: '14.28%', aspectRatio: 1, padding: 2 },
  dayBtn: { borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dayToday: { borderWidth: 2, borderColor: C.goldL },
  dayNum: { fontFamily: F.sora, fontSize: 13, fontWeight: '700' },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
    justifyContent: 'center',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 10, height: 10, borderRadius: 999 },
  legendLabel: { fontFamily: F.manrope, fontSize: 11, color: C.prMuted },
  hint: {
    marginTop: 8,
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.prMuted2,
    textAlign: 'center',
  },
  timetable: { marginTop: 2 },
  ttHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  ttTitle: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: C.muted,
  },
  refreshText: {
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '600',
    color: C.goldL,
  },
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.line,
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 12,
  },
  emptyText: {
    fontFamily: F.manrope,
    fontSize: C.fsTiny,
    color: C.prMuted2,
    textAlign: 'center',
  },
  ttRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 12,
  },
  agencyBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(183,156,232,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(183,156,232,0.3)',
    marginBottom: 10,
  },
  agencyBadgeText: {
    fontFamily: F.sora,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: C.violetL,
  },
  ttTop: { marginBottom: 8 },
  ttTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  ttOutlet: { fontFamily: F.sora, fontSize: 16, fontWeight: '700', color: C.txt },
  ttFieldLabel: {
    fontFamily: F.sora,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: C.muted2,
  },
  ttFieldValue: {
    fontFamily: F.manrope,
    fontSize: 14,
    color: C.prMuted,
    marginTop: 2,
  },
  cancelBtn: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(240,138,138,0.4)',
    backgroundColor: 'rgba(240,138,138,0.08)',
  },
  cancelText: { fontFamily: F.sora, fontSize: 14, fontWeight: '700', color: C.red },
});
