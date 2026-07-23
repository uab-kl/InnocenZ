/**
 * PR Shifts home — port of InnocenZ-proto `/host?view=shifts`:
 * page header ("AGENCY SHIFTS" / "Hi, <first name>"), Shifts↔Job postings
 * toggle, Today/To-do/Upcoming hub strip, and the collapsible sections with
 * the tonight shift card. Identity comes from the backend; shift data mirrors
 * the prototype seeds until the backend models shifts.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, F, GRADIENTS, grad } from '../theme/theme';
import {
  fmtDFriendly,
  formatRM,
  todayYmd,
  ymdToIso,
  type DemoShift,
  type Ymd,
} from '../lib/demo-shifts';
import { useSession } from '../lib/session';
import { type ShiftAssignmentRecord } from '../lib/api';
import { useViewportSize } from '../lib/viewport';
import { Section } from '../components/Section';
import { AgencySchedulePanel } from '../components/AgencySchedulePanel';
import { Avatar, EmptyDashed, IzButton, LabelWithIcon } from '../components/ui';
import {
  Briefcase,
  Calendar,
  ClipboardList,
  Clock,
  FileText,
  House,
  MapPin,
  Store,
} from '../components/icons';
import type { PrTab } from '../components/BottomNav';
import { useShiftSession } from '../lib/shift-session';
import { useActiveShift } from '../lib/active-shift';
import { useAwaitingLastWeekPv } from '../lib/awaiting-pv';
import { usePrNav } from '../lib/pr-nav';

type SectionKey = 'today' | 'todo' | 'agency';

function ymdFromIso(iso: string): Ymd {
  const [y, m, d] = iso.split('-').map((n) => Number(n));
  return [y, m, d];
}

/** Backend shift assignment -> the DemoShift shape the cards render. */
function assignmentToShift(a: ShiftAssignmentRecord): DemoShift {
  // Attendance stamps win: checked out → Complete, checked in → On duty.
  const status: DemoShift['status'] =
    a.checkOutAt || a.status === 'completed'
      ? 'complete'
      : a.checkInAt
        ? 'on-duty'
        : a.status === 'assigned'
          ? 'pending'
          : 'scheduled';
  return {
    id: a.id,
    outlet: a.outletName ?? 'Outlet',
    address: a.outletAddress,
    event: a.eventName ?? 'Shift',
    date: ymdFromIso(a.shiftDate),
    time: a.slot ?? '—',
    payout: Number(a.payAmount) || 0,
    logoPath: null,
    status,
  };
}

export function ShiftsScreen({ onNavigate }: { onNavigate: (tab: PrTab) => void }) {
  const { me } = useSession();
  const { openPv } = usePrNav();

  // Real shift assignments for this PR — shared with Check-In / timetable so
  // On duty / Complete badges flip as soon as attendance stamps change.
  const { assignments, phase: attendancePhase } = useActiveShift();
  const { awaiting } = useAwaitingLastWeekPv();
  const todoItems = awaiting ? [awaiting.todo] : [];
  const shifts = assignments
    .filter((a) => a.status !== 'cancelled' && a.status !== 'no_show')
    .map(assignmentToShift);

  const todayIso = ymdToIso(...todayYmd());
  // Today shows the shift up to check-out; once completed it drops off and the
  // section waits for the next shift.
  const tonightShift =
    shifts.find((s) => ymdToIso(...s.date) === todayIso && s.status !== 'complete') ?? null;
  const upcomingCount = shifts.filter((s) => ymdToIso(...s.date) >= todayIso).length;

  const { phase: localPhase } = useShiftSession();
  // Prefer live assignment stamps; fall back to local session for offline demo.
  const phase = attendancePhase !== 'idle' ? attendancePhase : localPhase;
  const { width } = useViewportSize();
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    today: true,
    todo: false,
    agency: true,
  });

  const firstName = me?.profile.firstName?.split(' ')[0] ?? me?.username ?? 'PR';
  // .iz-pr-page-header__title: clamp(1.4rem, 5.2vw, 1.75rem)
  const titleSize = Math.min(28, Math.max(22.4, width * 0.052));

  const todayStatus =
    phase === 'complete'
      ? 'Complete'
      : phase === 'on_duty'
        ? 'On duty'
        : phase === 'booked'
          ? 'Tonight'
          : 'Off';

  const todayCta =
    phase === 'complete'
      ? 'View summary'
      : phase === 'on_duty'
        ? 'Attendance'
        : 'Check in';

  /** Hub strip tap: open the matching section, or close it if already open. */
  const toggleHubSection = (key: SectionKey) =>
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  const toggleSection = (key: SectionKey, next: boolean) =>
    setOpen((prev) => ({ ...prev, [key]: next }));

  return (
    <View style={styles.screen}>

      {/* PrPageHeader */}
      <View style={styles.pageHeader}>
        <View style={styles.headerTitleRow}>
          <Briefcase size={22} color={C.accent} />
          <Text style={[styles.headerTitle, { fontSize: titleSize }]}>
            Hi, <Text style={styles.headerTitleAccent}>{firstName}</Text>
          </Text>
        </View>
      </View>

      {/* Hub strip — Today / To-do / Upcoming */}
          <View style={styles.hubTabs}>
            <HubTab
              label="TODAY"
              value={todayStatus}
              valueColor={phase === 'complete' ? C.green : C.goldL}
              on={open.today}
              onPress={() => toggleHubSection('today')}
            />
            <HubTab
              label="TO-DO"
              value={String(todoItems.length)}
              valueColor={todoItems.length > 0 ? C.amber : C.txt}
              on={open.todo}
              onPress={() => toggleHubSection('todo')}
            />
            <HubTab
              label="UPCOMING"
              value={String(upcomingCount)}
              valueColor={C.txt}
              on={open.agency}
              onPress={() => toggleHubSection('agency')}
            />
          </View>

          <View style={styles.sections}>
            <Section
              title="Today"
              icon={House}
              open={open.today}
              onToggle={(next) => toggleSection('today', next)}
            >
              {tonightShift ? (
                <TonightCard
                  shift={tonightShift}
                  eyebrow={
                    tonightShift.status === 'complete'
                      ? 'COMPLETE'
                      : tonightShift.status === 'on-duty'
                        ? 'ON DUTY'
                        : 'TONIGHT'
                  }
                  cta={todayCta}
                  onCheckIn={() => onNavigate('checkin')}
                />
              ) : (
                <EmptyDashed>No shift scheduled for today.</EmptyDashed>
              )}
            </Section>

            <Section
              title="To-do"
              icon={ClipboardList}
              open={open.todo}
              onToggle={(next) => toggleSection('todo', next)}
            >
              {todoItems.length === 0 ? (
                <EmptyDashed>Nothing to do</EmptyDashed>
              ) : (
                <View style={{ gap: 10 }}>
                  {todoItems.map((todo) => (
                    <View key={todo.id} style={styles.todoCard}>
                      <View style={styles.todoIcon}>
                        <FileText size={16} color={C.goldL} />
                      </View>
                      <View style={styles.todoBody}>
                        <Text style={styles.todoTitle}>{todo.title}</Text>
                        <Text style={styles.todoSubtitle}>{todo.subtitle}</Text>
                      </View>
                      <IzButton
                        label={todo.actionLabel}
                        small
                        fullWidth={false}
                        onPress={() => openPv(todo.pvId)}
                      />
                    </View>
                  ))}
                </View>
              )}
            </Section>

            <Section
              title="Agency schedule"
              icon={Calendar}
              open={open.agency}
              onToggle={(next) => toggleSection('agency', next)}
            >
              <AgencySchedulePanel />
            </Section>
          </View>
    </View>
  );
}

/** `.iz-agency-home-tab` (pr-home-tabs sizing). */
function HubTab({
  label,
  value,
  valueColor,
  on,
  onPress,
}: {
  label: string;
  value: string;
  valueColor: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.hubTab, on && styles.hubTabOn]} onPress={onPress}>
      <Text style={[styles.hubTabLabel, on && { color: C.txt }]}>{label}</Text>
      <Text style={[styles.hubTabValue, { color: valueColor }]} numberOfLines={1}>
        {value}
      </Text>
    </Pressable>
  );
}

/** `TodayShiftCard` — tonight's confirmed shift with the gold Check in CTA. */
function TonightCard({
  shift,
  eyebrow,
  cta,
  onCheckIn,
}: {
  shift: DemoShift;
  eyebrow: string;
  cta: string;
  onCheckIn: () => void;
}) {
  return (
    <View style={[styles.shiftCard, grad(GRADIENTS.shiftCard, 'rgba(232,194,122,0.08)')]}>
      <Text style={styles.shiftEyebrow}>{eyebrow}</Text>
      <View style={styles.shiftVenue}>
        <Avatar
          size={52}
          radius={16}
          photoPath={shift.logoPath}
          initial={shift.outlet.trim()[0]?.toUpperCase()}
          logo
          style={styles.shiftLogo}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <LabelWithIcon icon={Store} label="Outlet name" />
          <Text style={styles.shiftVenueName}>{shift.outlet}</Text>
          {shift.address ? (
            <View style={styles.shiftAddrRow}>
              <MapPin size={12} color={C.prMuted2} strokeWidth={2} />
              <Text style={styles.shiftAddrText}>{shift.address}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.shiftFacts}>
        <View style={styles.shiftFact}>
          <LabelWithIcon icon={Calendar} label="Date" />
          <Text style={styles.shiftFactValue}>{fmtDFriendly(...shift.date)}</Text>
        </View>
        <View style={styles.shiftFact}>
          <LabelWithIcon icon={Clock} label="Time" />
          <Text style={styles.shiftFactValue}>{shift.time}</Text>
        </View>
      </View>
      <View style={styles.shiftEvent}>
        <Text style={styles.shiftEventText}>
          {shift.event} · {formatRM(shift.payout)}
        </Text>
      </View>
      <IzButton label={cta} icon={MapPin} small onPress={onCheckIn} style={{ marginTop: 12 }} />
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
  headerTitleAccent: {
    color: C.goldL,
  },
  hubToggle: {
    flexDirection: 'row',
    width: '100%',
    marginTop: 12,
    padding: 3,
    gap: 3,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  hubToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 38,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 11,
  },
  hubToggleBtnOnShifts: {
    backgroundColor: 'rgba(232,194,122,0.14)',
  },
  hubToggleBtnOnServices: {
    backgroundColor: 'rgba(167,139,250,0.16)',
  },
  hubToggleText: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 14,
    color: C.prMuted,
  },
  hubBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: C.violet,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  hubBadgeText: {
    fontFamily: F.sora,
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
  },
  hubTabs: {
    flexDirection: 'row',
    marginTop: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  hubTab: {
    flex: 1,
    minWidth: 0,
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  hubTabOn: {
    borderBottomColor: C.violet,
  },
  hubTabLabel: {
    fontFamily: F.manrope,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.66,
    color: C.muted,
    lineHeight: 14,
  },
  hubTabValue: {
    marginTop: 6,
    fontFamily: F.sora,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 20,
  },
  sections: {
    gap: 12,
    marginTop: 16,
    paddingBottom: 12,
  },
  shiftCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(183,156,232,0.22)',
  },
  shiftEyebrow: {
    fontFamily: F.manrope,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    color: C.muted2,
  },
  shiftVenue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  shiftLogo: {
    borderWidth: 1,
    borderColor: 'rgba(216,171,87,0.28)',
  },
  shiftVenueName: {
    marginTop: 2,
    fontFamily: F.sora,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
    color: C.txt,
  },
  shiftAddrRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
  },
  shiftAddrText: {
    flex: 1,
    fontFamily: F.manrope,
    fontSize: 12,
    lineHeight: 17,
    color: C.prMuted2,
  },
  shiftFacts: {
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderTopColor: 'rgba(183,156,232,0.2)',
  },
  shiftFact: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  shiftFactValue: {
    fontFamily: F.sora,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    color: C.txt,
    textAlign: 'right',
  },
  shiftEvent: {
    marginTop: 12,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(183,156,232,0.18)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  shiftEventText: {
    fontFamily: F.manrope,
    fontSize: 12,
    lineHeight: 17,
    color: C.muted,
  },
  todoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: C.line,
  },
  todoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(232,194,122,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(232,194,122,0.18)',
  },
  todoBody: {
    flex: 1,
    minWidth: 0,
  },
  todoTitle: {
    fontFamily: F.sora,
    fontSize: 18,
    fontWeight: '700',
    color: C.txt,
  },
  todoSubtitle: {
    fontFamily: F.manrope,
    fontSize: C.fsTiny,
    lineHeight: C.fsTiny * 1.4,
    color: C.prMuted,
    marginTop: 2,
  },
  servicesBlurb: {
    fontFamily: F.manrope,
    fontSize: 13,
    color: C.prMuted,
    lineHeight: 18,
  },
  servicesToast: {
    fontFamily: F.manrope,
    fontSize: 13,
    color: C.green,
  },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  serviceTitle: {
    fontFamily: F.sora,
    fontSize: 15,
    fontWeight: '700',
    color: C.txt,
  },
  serviceSub: {
    marginTop: 2,
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.prMuted,
  },
  ordersTitle: {
    marginTop: 8,
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: C.muted2,
  },
  scheduleMeta: {
    fontFamily: F.manrope,
    fontSize: C.fsTiny,
    lineHeight: C.fsTiny * 1.4,
    color: C.prMuted,
    marginTop: 2,
  },
});
