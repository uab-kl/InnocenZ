/**
 * Agency schedule — calendar + timetable from real `/shift-assignment/mine`
 * rows. Status follows attendance stamps: On duty (checked in) / Complete
 * (checked out) / Scheduled|Pending (booked).
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, F } from '../theme/theme';
import {
  AlertTriangle,
  Briefcase,
  CalendarDays,
  ChevronDown,
  Clock,
  MapPin,
  Shield,
} from './icons';
import { Pill } from './ui';
import { PhoneSheet } from './PhoneSheet';
import {
  CANCELLATION_RULE_SUMMARY,
  DAY_NAMES,
  MONTH_LABELS,
  MONTH_NAMES,
  buildScheduleDays,
  buildUpcomingWeekTimetable,
  formatRM,
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
import {
  cancelMyShiftAssignment,
  requestMyShiftLeave,
  type ShiftAssignmentRecord,
} from '../lib/api';

/** Backend marker a rejected MC/leave leaves on the assignment notes. */
const LEAVE_REJECTED_PREFIX = '[Leave rejected]';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

const KIND_STYLE: Record<ScheduleDayKind, { bg: string; border: string; color: string }> = {
  past: { bg: 'transparent', border: 'transparent', color: C.muted2 },
  open: { bg: 'rgba(255,255,255,0.03)', border: 'rgba(232,224,245,0.22)', color: C.muted },
  unavailable: { bg: 'rgba(240,138,138,0.12)', border: 'rgba(240,138,138,0.35)', color: C.red },
  assigned: { bg: 'rgba(93,217,160,0.16)', border: 'rgba(93,217,160,0.45)', color: C.green },
  pending: { bg: 'rgba(232,198,106,0.14)', border: 'rgba(232,198,106,0.4)', color: C.amber },
  active: { bg: 'rgba(232,194,122,0.18)', border: 'rgba(232,194,122,0.5)', color: C.accentL },
};

type CancelPenalty = { pct: number; amount: number; tierLabel: string };

/** Parse the shift's start Date from its date + slot ("22:00 - 04:00"). */
function shiftStartDate(shiftDate: string, slot: string | null): Date {
  const [y, m, d] = shiftDate.split('-').map(Number);
  const match = slot?.match(/(\d{1,2}):(\d{2})/);
  return new Date(y, (m || 1) - 1, d || 1, match ? Number(match[1]) : 0, match ? Number(match[2]) : 0);
}

/**
 * Cancellation penalty (mirrors CANCELLATION_RULE_SUMMARY): 24h+ before → free,
 * 2–24h → −25%, <2h → −50% of the shift's daily wage, charged to the next PV.
 */
function cancelPenalty(assignment: ShiftAssignmentRecord, now = new Date()): CancelPenalty {
  const dailyWage = Number(assignment.rate?.wagePerHour) || Number(assignment.payAmount) || 0;
  const hoursUntil =
    (shiftStartDate(assignment.shiftDate, assignment.slot).getTime() - now.getTime()) / 3_600_000;
  if (hoursUntil >= 24) return { pct: 0, amount: 0, tierLabel: '24h+ before — no deduction' };
  if (hoursUntil >= 2) {
    return { pct: 25, amount: Math.round(dailyWage * 25) / 100, tierLabel: 'Short notice (2–24h) — 25% of daily wages' };
  }
  return { pct: 50, amount: Math.round(dailyWage * 50) / 100, tierLabel: 'Late cancel (<2h) — 50% of daily wages' };
}

export function AgencySchedulePanel() {
  const today = todayYmd();
  const { me, agencies, token } = useSession();
  const { assignments, refresh } = useActiveShift();
  const [viewMonth, setViewMonth] = useState(() => new Date(today[0], today[1] - 1, 1));
  const [blocked, setBlocked] = useState<string[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [cancelledIds, setCancelledIds] = useState<string[]>([]);
  // Cancel-shift confirmation (penalty + required reason → backend, agency notified).
  const [cancelTarget, setCancelTarget] = useState<
    { entry: TimetableEntry; penalty: CancelPenalty } | null
  >(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  // MC/Leave request (no penalty — waits for the agency to approve/reject).
  const [leaveTarget, setLeaveTarget] = useState<TimetableEntry | null>(null);
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  const openLeave = (entry: TimetableEntry) => {
    // Demo rows have no live assignment to request leave on.
    if (!assignments.some((a) => a.id === entry.id)) return;
    setLeaveReason('');
    setLeaveError(null);
    setLeaveTarget(entry);
  };

  const confirmLeave = async () => {
    if (!leaveTarget || leaveBusy) return;
    const reason = leaveReason.trim();
    if (!reason) {
      setLeaveError('Please describe your MC / leave reason.');
      return;
    }
    if (!token) {
      setLeaveError('Not signed in.');
      return;
    }
    setLeaveBusy(true);
    setLeaveError(null);
    try {
      await requestMyShiftLeave(token, leaveTarget.id, reason);
      setLeaveTarget(null);
      void refresh();
    } catch (e) {
      setLeaveError(e instanceof Error ? e.message : 'Could not submit. Try again.');
    } finally {
      setLeaveBusy(false);
    }
  };

  const openCancel = (entry: TimetableEntry) => {
    const assignment = assignments.find((a) => a.id === entry.id);
    // No live assignment (demo row) → just hide it locally, nothing to notify.
    if (!assignment) {
      setCancelledIds((ids) => [...ids, entry.id]);
      return;
    }
    setCancelReason('');
    setCancelError(null);
    setCancelTarget({ entry, penalty: cancelPenalty(assignment) });
  };

  const confirmCancel = async () => {
    if (!cancelTarget || cancelBusy) return;
    const reason = cancelReason.trim();
    if (!reason) {
      setCancelError('Please describe why you cannot work this shift.');
      return;
    }
    if (!token) {
      setCancelError('Not signed in.');
      return;
    }
    setCancelBusy(true);
    setCancelError(null);
    try {
      await cancelMyShiftAssignment(token, cancelTarget.entry.id, reason);
      setCancelledIds((ids) => [...ids, cancelTarget.entry.id]);
      setCancelTarget(null);
      void refresh();
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : 'Could not cancel. Try again.');
    } finally {
      setCancelBusy(false);
    }
  };

  const agencyName = agencies[0]?.agencyName ?? me?.username ?? 'Agency';
  const todayIso = ymdToIso(...today);

  const scheduleShifts = useMemo(
    () =>
      assignments
        .filter(
          (a) =>
            a.status !== 'cancelled' &&
            a.status !== 'no_show' &&
            // Excused via approved MC/leave — off the schedule, no penalty.
            a.status !== 'leave_approved',
        )
        .map((a) => ({
          id: a.id,
          dateIso: a.shiftDate,
          outlet: a.outletName ?? 'Outlet',
          address: a.outletAddress,
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
      buildUpcomingWeekTimetable(
        todayIso,
        // Once a shift is checked in (on duty) or checked out (complete) it
        // drops off the agency schedule — it lives in Today's section instead.
        // A not-yet-checked-in shift (incl. today's) stays visible here.
        scheduleShifts.filter(
          (s) => !s.checkInAt && !s.checkOutAt && s.status !== 'completed',
        ),
      ).filter((e) => !cancelledIds.includes(e.id)),
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
            {timetable.map((entry) => {
              const assignment = assignments.find((a) => a.id === entry.id);
              return (
                <TimetableRow
                  key={entry.id}
                  entry={entry}
                  penalty={assignment ? cancelPenalty(assignment) : null}
                  leavePending={assignment?.status === 'leave_pending'}
                  leaveRejected={
                    assignment?.status !== 'leave_pending' &&
                    (assignment?.notes?.startsWith(LEAVE_REJECTED_PREFIX) ?? false)
                  }
                  onCancel={() => openCancel(entry)}
                  onLeave={() => openLeave(entry)}
                />
              );
            })}
          </View>
        )}
      </View>

      <PhoneSheet visible={cancelTarget != null} onRequestClose={() => setCancelTarget(null)}>
        <Pressable style={styles.cancelBackdrop} onPress={() => setCancelTarget(null)}>
          <Pressable style={styles.cancelSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.cancelHandle} />
            <View style={styles.cancelHeaderRow}>
              <Briefcase size={20} color={C.goldL} />
              <Text style={styles.cancelHeaderTitle}>Cancel shift</Text>
            </View>
            {cancelTarget && (
              <Text style={styles.cancelHeaderSub}>
                {cancelTarget.entry.outlet} · {cancelTarget.entry.dateLabel} · {cancelTarget.entry.time}
              </Text>
            )}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ marginTop: 12 }}
            >
              <Text style={styles.cancelNote}>
                Shifts are assigned by your agency — cancelling notifies your agency straight away.
              </Text>
              {cancelTarget && (
                <View
                  style={[
                    styles.penaltyBanner,
                    cancelTarget.penalty.amount > 0
                      ? styles.penaltyBannerWarn
                      : styles.penaltyBannerOk,
                  ]}
                >
                  <Text style={styles.penaltyBannerTitle}>
                    {cancelTarget.penalty.amount > 0
                      ? `Penalty — (−${formatRM(cancelTarget.penalty.amount)}) from next PV`
                      : 'No deduction'}
                  </Text>
                  <Text style={styles.penaltyBannerBody}>{cancelTarget.penalty.tierLabel}</Text>
                </View>
              )}
              <View style={styles.rulesCard}>
                <View style={styles.rulesCardHead}>
                  <AlertTriangle size={14} color={C.amber} />
                  <Text style={styles.rulesCardTitle}>CANCELLATION RULES</Text>
                </View>
                {CANCELLATION_RULE_SUMMARY.map((r) => (
                  <View
                    key={r.label}
                    style={[
                      styles.ruleCardRow,
                      {
                        borderColor:
                          r.tone === 'green'
                            ? 'rgba(93,217,160,0.35)'
                            : r.tone === 'amber'
                              ? 'rgba(232,198,106,0.35)'
                              : 'rgba(240,138,138,0.35)',
                      },
                    ]}
                  >
                    <Text style={styles.ruleCardWhen}>{r.label}</Text>
                    <Text
                      style={[
                        styles.ruleCardOut,
                        {
                          color:
                            r.tone === 'green' ? C.green : r.tone === 'amber' ? C.amber : C.red,
                        },
                      ]}
                    >
                      {r.outcome}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={styles.cancelFieldLabel}>Reason (required)</Text>
              <TextInput
                value={cancelReason}
                onChangeText={setCancelReason}
                style={styles.cancelInput}
                placeholder="Describe why you cannot work this shift"
                placeholderTextColor={C.muted2}
                multiline
              />
              {cancelError && <Text style={styles.cancelErrorText}>{cancelError}</Text>}
              <Pressable
                style={[styles.cancelAcceptBtn, cancelBusy && { opacity: 0.6 }]}
                onPress={confirmCancel}
                disabled={cancelBusy}
              >
                <Text style={styles.cancelAcceptText}>
                  {cancelBusy
                    ? 'Cancelling…'
                    : cancelTarget && cancelTarget.penalty.amount > 0
                      ? `Cancel & accept (−${formatRM(cancelTarget.penalty.amount)})`
                      : 'Cancel & accept'}
                </Text>
              </Pressable>
              <Pressable style={styles.cancelBackBtn} onPress={() => setCancelTarget(null)}>
                <Text style={styles.cancelBackText}>Back</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </PhoneSheet>

      <PhoneSheet visible={leaveTarget != null} onRequestClose={() => setLeaveTarget(null)}>
        <Pressable style={styles.cancelBackdrop} onPress={() => setLeaveTarget(null)}>
          <Pressable style={styles.cancelSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.cancelHandle} />
            <View style={styles.cancelHeaderRow}>
              <CalendarDays size={20} color={C.goldL} />
              <Text style={styles.cancelHeaderTitle}>MC / Leave</Text>
            </View>
            {leaveTarget && (
              <Text style={styles.cancelHeaderSub}>
                {leaveTarget.outlet} · {leaveTarget.dateLabel} · {leaveTarget.time}
              </Text>
            )}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ marginTop: 12 }}
            >
              <Text style={styles.cancelNote}>
                Unable to work this shift due to MC or personal leave? Send the request to your
                agency — you stay scheduled until they approve it.
              </Text>
              <View style={[styles.penaltyBanner, styles.penaltyBannerOk]}>
                <Text style={styles.penaltyBannerTitle}>No penalty when approved</Text>
                <Text style={styles.penaltyBannerBody}>
                  An approved MC / leave excuses this shift with no deduction. If rejected, the
                  shift stays yours — cancelling instead follows the cancellation rules.
                </Text>
              </View>
              <Text style={styles.cancelFieldLabel}>Reason (required)</Text>
              <TextInput
                value={leaveReason}
                onChangeText={setLeaveReason}
                style={styles.cancelInput}
                placeholder="e.g. MC — fever, clinic visit tomorrow morning"
                placeholderTextColor={C.muted2}
                multiline
              />
              {leaveError && <Text style={styles.cancelErrorText}>{leaveError}</Text>}
              <Pressable
                style={[styles.leaveSubmitBtn, leaveBusy && { opacity: 0.6 }]}
                onPress={confirmLeave}
                disabled={leaveBusy}
              >
                <Text style={styles.leaveSubmitText}>
                  {leaveBusy ? 'Submitting…' : 'Submit leave request'}
                </Text>
              </Pressable>
              <Pressable style={styles.cancelBackBtn} onPress={() => setLeaveTarget(null)}>
                <Text style={styles.cancelBackText}>Back</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </PhoneSheet>
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
  penalty,
  leavePending,
  leaveRejected,
  onCancel,
  onLeave,
}: {
  entry: TimetableEntry;
  penalty: CancelPenalty | null;
  /** Backend row is leave_pending — swap the action buttons for a wait note. */
  leavePending: boolean;
  /** Agency rejected the MC/leave — the PR is still expected on this shift. */
  leaveRejected: boolean;
  onCancel: () => void;
  onLeave: () => void;
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
      <View style={styles.ttDateTimeRow}>
        <View style={styles.ttField}>
          <Text style={styles.ttFieldLabel}>DATE</Text>
          <Text style={styles.ttFieldValue}>{dateFriendly}</Text>
        </View>
        <View style={styles.ttField}>
          <Text style={styles.ttFieldLabel}>TIME</Text>
          <Text style={styles.ttFieldValue}>{entry.time}</Text>
        </View>
      </View>
      {entry.address ? (
        <View style={styles.ttAddrBlock}>
          <Text style={styles.ttFieldLabel}>ADDRESS</Text>
          <View style={styles.ttAddrRow}>
            <MapPin size={13} color={C.prMuted2} strokeWidth={2} />
            <Text style={styles.ttAddrValue}>{entry.address}</Text>
          </View>
        </View>
      ) : null}
      {leaveRejected ? (
        <View style={styles.leaveRejectedNote}>
          <AlertTriangle size={13} color={C.red} />
          <Text style={styles.leaveRejectedText}>
            Leave request rejected — you are still on this shift.
          </Text>
        </View>
      ) : null}
      {leavePending ? (
        <View style={styles.leavePendingNote}>
          <Clock size={13} color={C.amber} />
          <Text style={styles.leavePendingText}>
            MC / Leave submitted — awaiting agency review.
          </Text>
        </View>
      ) : !entry.canCancel && !entry.canLeave ? null : (
        <View style={styles.actionRow}>
          {entry.canCancel ? (
            <Pressable onPress={onCancel} style={[styles.cancelBtn, styles.actionBtn]}>
              <Text style={styles.cancelText}>
                Cancel{penalty && penalty.amount > 0 ? ` (−${formatRM(penalty.amount)})` : ''}
              </Text>
            </Pressable>
          ) : null}
          {entry.canLeave ? (
            <Pressable onPress={onLeave} style={[styles.leaveBtn, styles.actionBtn]}>
              <Text style={styles.leaveText}>MC / Leave</Text>
            </Pressable>
          ) : null}
        </View>
      )}
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
  ttDateTimeRow: { flexDirection: 'row', gap: 12 },
  ttField: { flex: 1, minWidth: 0 },
  ttAddrBlock: { marginTop: 8 },
  ttAddrRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
  },
  ttAddrValue: {
    flex: 1,
    fontFamily: F.manrope,
    fontSize: 13,
    color: C.prMuted,
    lineHeight: 18,
  },
  actionRow: { marginTop: 12, flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, marginTop: 0 },
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
  leaveBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(232,198,106,0.4)',
    backgroundColor: 'rgba(232,198,106,0.08)',
  },
  leaveText: { fontFamily: F.sora, fontSize: 14, fontWeight: '700', color: C.amber },
  leavePendingNote: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(232,198,106,0.35)',
    backgroundColor: 'rgba(232,198,106,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  leavePendingText: {
    flex: 1,
    fontFamily: F.manrope,
    fontSize: 12,
    fontWeight: '600',
    color: C.amber,
  },
  leaveRejectedNote: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(240,138,138,0.35)',
    backgroundColor: 'rgba(240,138,138,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  leaveRejectedText: {
    flex: 1,
    fontFamily: F.manrope,
    fontSize: 12,
    fontWeight: '600',
    color: C.red,
  },
  leaveSubmitBtn: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(93,217,160,0.45)',
    backgroundColor: 'rgba(93,217,160,0.12)',
  },
  leaveSubmitText: { fontFamily: F.sora, fontSize: 15, fontWeight: '800', color: C.green },
  cancelBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(6,3,12,0.65)',
    justifyContent: 'flex-end',
  },
  cancelSheet: {
    backgroundColor: C.panel,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: C.line2,
    padding: 18,
    paddingBottom: 28,
    maxWidth: 392,
    maxHeight: '88%',
    width: '100%',
    alignSelf: 'center',
  },
  cancelHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: C.line2,
    marginBottom: 12,
  },
  cancelHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cancelHeaderTitle: { fontFamily: F.sora, fontSize: 20, fontWeight: '800', color: C.txt },
  cancelHeaderSub: {
    marginTop: 4,
    fontFamily: F.sora,
    fontSize: 13,
    fontWeight: '700',
    color: C.prMuted,
  },
  cancelNote: {
    fontFamily: F.manrope,
    fontSize: 12,
    lineHeight: 17,
    color: C.prMuted,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.line,
    borderRadius: 10,
    padding: 10,
  },
  penaltyBanner: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  penaltyBannerWarn: {
    borderColor: 'rgba(240,138,138,0.4)',
    backgroundColor: C.redBg,
  },
  penaltyBannerOk: {
    borderColor: 'rgba(93,217,160,0.35)',
    backgroundColor: C.greenBg,
  },
  penaltyBannerTitle: { fontFamily: F.sora, fontSize: 15, fontWeight: '800', color: C.txt },
  penaltyBannerBody: {
    marginTop: 3,
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.prMuted,
  },
  rulesCard: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line2,
    padding: 12,
    gap: 8,
  },
  rulesCardHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rulesCardTitle: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: C.txt,
  },
  ruleCardRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  ruleCardWhen: { fontFamily: F.sora, fontSize: 13, fontWeight: '700', color: C.txt },
  ruleCardOut: { marginTop: 2, fontFamily: F.manrope, fontSize: 12, fontWeight: '600' },
  cancelFieldLabel: {
    marginTop: 14,
    marginBottom: 4,
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: C.prMuted2,
  },
  cancelInput: {
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '600',
    color: C.txt,
    borderWidth: 1,
    borderColor: C.line2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  cancelErrorText: {
    marginTop: 8,
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.red,
  },
  cancelAcceptBtn: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(240,138,138,0.45)',
    backgroundColor: 'rgba(240,138,138,0.12)',
  },
  cancelAcceptText: { fontFamily: F.sora, fontSize: 15, fontWeight: '800', color: C.red },
  cancelBackBtn: { marginTop: 10, alignItems: 'center', padding: 10 },
  cancelBackText: { fontFamily: F.sora, fontSize: 14, fontWeight: '600', color: C.muted },
});
