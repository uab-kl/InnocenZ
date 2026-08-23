/**
 * Agency schedule — calendar + timetable from real `/shift-assignment/mine`
 * rows. Status follows attendance stamps: On duty (checked in) / Complete
 * (checked out) / Scheduled|Pending (booked).
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { C, F } from '../theme/theme';
import {
  AlertTriangle,
  Briefcase,
  CalendarDays,
  ChevronDown,
  Clock,
  ImagePlus,
  MapPin,
  Shield,
} from './icons';
import { Avatar, Pill } from './ui';
import { ImageLightbox, ZoomHint } from './ImageLightbox';
import { PhoneSheet } from './PhoneSheet';
import {
  DEFAULT_CANCELLATION_BANDS,
  type CancellationBands,
  cancellationBandsFrom,
  cancellationRuleSummary,
  DAY_NAMES,
  MONTH_LABELS,
  MONTH_NAMES,
  buildScheduleDays,
  buildUpcomingWeekTimetable,
  fmtDFriendly,
  formatRM,
  formatUpcomingWeekLabel,
  getUpcomingWeekRange,
  isoToYmd,
  shiftEndDate,
  type ScheduleDayKind,
  type TimetableEntry,
  todayYmd,
  ymdToIso,
} from '../lib/demo-shifts';
import { shiftStartDate } from '../lib/venue-time';
import { useActiveShift } from '../lib/active-shift';
import { pickProofPhotos, resolveProofPhotoUri } from '../lib/proof-photo';
import { useSession } from '../lib/session';
import {
  assetUrl,
  blockMyDay,
  cancelMyShiftAssignment,
  fetchMyUnavailableDays,
  getMyPenaltyRules,
  requestMyShiftLeave,
  unblockMyDay,
  type ShiftAssignmentRecord,
} from '../lib/api';

/** Backend marker a rejected MC/leave leaves on the assignment notes. */
const LEAVE_REJECTED_PREFIX = '[Leave rejected]';

/** Matches the server's cap on shift_assignment.leave_proof_photos. */
const MAX_MC_PHOTOS = 5;

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

const KIND_STYLE: Record<
  ScheduleDayKind,
  { bg: string; border: string; color: string }
> = {
  past: { bg: 'transparent', border: 'transparent', color: C.muted2 },
  open: {
    bg: 'rgba(255,255,255,0.03)',
    border: 'rgba(232,224,245,0.22)',
    color: C.muted,
  },
  unavailable: {
    bg: 'rgba(240,138,138,0.12)',
    border: 'rgba(240,138,138,0.35)',
    color: C.red,
  },
  assigned: {
    bg: 'rgba(93,217,160,0.16)',
    border: 'rgba(93,217,160,0.45)',
    color: C.green,
  },
  pending: {
    bg: 'rgba(232,198,106,0.14)',
    border: 'rgba(232,198,106,0.4)',
    color: C.amber,
  },
  active: {
    bg: 'rgba(232,194,122,0.18)',
    border: 'rgba(232,194,122,0.5)',
    color: C.accentL,
  },
};

/** Overlay for a past day whose booked shift ended with NO check-in (missed). */
/**
 * What happened to this shift's check-in, in the PR's own terms.
 *
 * `missed` is passed in rather than recomputed: the calendar already decides it
 * (a booked shift whose window ended with no check-in), and a second opinion
 * here is how a row would end up contradicting the colour of the day it sits on.
 *
 * Leave and cancellation are named before check-in state, because "you did not
 * check in" is a false accusation on a day the agency approved her absence —
 * which is exactly why `missedByIso` excludes those statuses too.
 */
function checkInOutcome(
  a: ShiftAssignmentRecord,
  missed: boolean,
): string {
  if (a.status === 'cancelled') return 'Cancelled';
  if (a.status === 'no_show') return 'Marked no-show';
  if (a.status === 'leave_approved') return 'Leave approved';
  if (a.status === 'leave_pending') return 'Leave requested';
  if (missed) return 'No check-in recorded';
  if (a.checkOutAt) return 'Checked in and out';
  if (a.checkInAt) return 'Checked in';
  return 'Scheduled — not started';
}

const MISSED_STYLE = {
  bg: 'rgba(240,113,113,0.2)',
  border: 'rgba(240,113,113,0.6)',
  color: '#f07171',
};

type CancelPenalty = { pct: number; amount: number; tierLabel: string };

/*
 * ⚠️ `shiftStartDate` USED TO LIVE HERE, built with `new Date(y, m, d, hh, mm)`.
 *
 * That reads the wall clock in the DEVICE's timezone, so the fee this screen
 * quotes matched the one the server seals only while the phone was set to
 * Malaysia — and the server, on a UTC container, was eight hours out in the
 * other direction. `cancel-fee.ts` requires the two to "agree exactly — a PR who
 * is shown -RM 27.50 and sealed at -RM 41.25 has been lied to". Both sides now
 * read the VENUE's clock: `lib/venue-time` here, `util/slot-window` there.
 *
 * It also carried its own `/(\d{1,2}):(\d{2})/`, which read "8pm - 2am" as
 * midnight. The shared parser resolves meridiem slots.
 */

/**
 * Cancellation penalty, computed from CANCELLATION_BANDS — the same numbers
 * cancellationRuleSummary() renders.
 *
 * It previously carried its own literals under a comment claiming to mirror
 * that summary, and the two had drifted: the summary advertised a 12h boundary
 * while this charged against 2h. Deriving both from one object is what makes
 * the claim true instead of aspirational.
 */
function cancelPenalty(
  assignment: ShiftAssignmentRecord,
  b: CancellationBands = DEFAULT_CANCELLATION_BANDS,
  now = new Date(),
): CancelPenalty {
  const dailyWage =
    Number(assignment.rate?.wagePerHour) || Number(assignment.payAmount) || 0;
  const start = shiftStartDate(assignment.shiftDate, assignment.slot);
  // A disabled rule is no cancellation charge at all — not 0% of the bands.
  if (!b.enabled)
    return { pct: 0, amount: 0, tierLabel: 'No cancellation fee' };
  // No readable window, no quoted fee — matching the server, which returns
  // RM 0.00 rather than pricing an unknown schedule at the late band.
  if (!start) return { pct: 0, amount: 0, tierLabel: 'No cancellation fee' };
  const hoursUntil = (start.getTime() - now.getTime()) / 3_600_000;
  if (hoursUntil >= b.freeCancelHours) {
    return {
      pct: 0,
      amount: 0,
      tierLabel: `${b.freeCancelHours}h+ before — no deduction`,
    };
  }
  if (hoursUntil >= b.shortNoticeHours) {
    return {
      pct: b.shortNoticePct,
      amount: Math.round(dailyWage * b.shortNoticePct) / 100,
      tierLabel: `Short notice (${b.shortNoticeHours}–${b.freeCancelHours}h) — ${b.shortNoticePct}% of daily wages`,
    };
  }
  return {
    pct: b.lateCancelPct,
    amount: Math.round(dailyWage * b.lateCancelPct) / 100,
    tierLabel: `Late cancel (<${b.shortNoticeHours}h) — ${b.lateCancelPct}% of daily wages`,
  };
}

export function AgencySchedulePanel() {
  const today = todayYmd();
  const { me, agencies, token } = useSession();
  const { assignments, refresh } = useActiveShift();
  const [viewMonth, setViewMonth] = useState(
    () => new Date(today[0], today[1] - 1, 1),
  );
  // Days this PR has marked unavailable, mirroring `main.pr_availability`.
  // Server-owned, not local UI state: the agency's roster reads the same rows,
  // and the assign guard refuses a shift on any of them. Held as an array only
  // because `buildScheduleDays` takes one.
  const [blocked, setBlocked] = useState<string[]>([]);
  // Which day is mid-flight, so a second tap on the same cell is ignored while
  // the first is still in the air.
  const [blockingIso, setBlockingIso] = useState<string | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);
  // The day awaiting a reason, and the text so far. The reason is OPTIONAL —
  // the sheet's primary action blocks the day either way — but it is what the
  // agency's roster cell shows, so it is asked for rather than assumed absent.
  const [reasonTarget, setReasonTarget] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);
  // The agency's cancellation bands. Seeded with the defaults rather than null
  // so the Cancel button always shows a number — and they are the same numbers
  // the app charged before this was configurable, so a slow fetch does not make
  // the price jump once it lands.
  const [cancelBands, setCancelBands] = useState<CancellationBands>(
    DEFAULT_CANCELLATION_BANDS,
  );
  const [cancelledIds, setCancelledIds] = useState<string[]>([]);
  // Cancel-shift confirmation (penalty + required reason → backend, agency notified).
  const [cancelTarget, setCancelTarget] = useState<{
    entry: TimetableEntry;
    penalty: CancelPenalty;
  } | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  // MC/Leave request (no penalty — waits for the agency to approve/reject).
  const [leaveTarget, setLeaveTarget] = useState<TimetableEntry | null>(null);
  const [leaveReason, setLeaveReason] = useState('');
  // MC photo(s) attached to the request — required before Submit.
  const [leavePhotos, setLeavePhotos] = useState<string[]>([]);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  // Load the agency's cancellation bands. A failure keeps the defaults rather
  // than blanking the price: the PR still needs to see what cancelling costs,
  // and the defaults are what the server would charge anyway.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getMyPenaltyRules(token)
      .then((rules) => {
        if (!cancelled) setCancelBands(cancellationBandsFrom(rules));
      })
      .catch(() => {
        /* keep DEFAULT_CANCELLATION_BANDS */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // The days already blocked, from the server. Without this the calendar opens
  // blank every launch and the PR re-blocks days that are in fact already
  // blocked — which is exactly what the old local-only state did.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchMyUnavailableDays(token)
      .then((rows) => {
        if (!cancelled) setBlocked(rows.map((r) => r.unavailableDate));
      })
      .catch(() => {
        // Leave the calendar as-is rather than clearing it: showing a day as
        // open because the fetch failed would invite a duplicate block.
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const openLeave = (entry: TimetableEntry) => {
    // Demo rows have no live assignment to request leave on.
    if (!assignments.some((a) => a.id === entry.id)) return;
    setLeaveReason('');
    setLeavePhotos([]);
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
    // The agency approves an excused absence off this picture — no photo, no
    // request (the server enforces the same rule).
    if (leavePhotos.length === 0) {
      setLeaveError('Please attach a photo of your MC / supporting document.');
      return;
    }
    if (!token) {
      setLeaveError('Not signed in.');
      return;
    }
    setLeaveBusy(true);
    setLeaveError(null);
    try {
      await requestMyShiftLeave(token, leaveTarget.id, reason, leavePhotos);
      setLeaveTarget(null);
      setLeavePhotos([]);
      void refresh();
    } catch (e) {
      setLeaveError(
        e instanceof Error ? e.message : 'Could not submit. Try again.',
      );
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
    setCancelTarget({ entry, penalty: cancelPenalty(assignment, cancelBands) });
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
      setCancelError(
        e instanceof Error ? e.message : 'Could not cancel. Try again.',
      );
    } finally {
      setCancelBusy(false);
    }
  };

  /**
   * The label for a shift nobody named — NOT a guess at who booked it.
   *
   * ⚠️ This used to be `agencies[0]?.agencyName`, hoisted once and stamped on
   * every card below. A PR can be on several agencies' rosters at the same time
   * (four of them, live, for one PR today), and this schedule merges all of their
   * bookings into one list — so the first membership of an arbitrarily-ordered
   * array named every shift on the screen, including the ones a DIFFERENT agency
   * sold. The agency is a property of the ASSIGNMENT, and is now read off each
   * row; see `agencyName` on the `/mine` payload.
   *
   * First-of-array survives only where it is not a coin toss: with exactly one
   * membership, first-of-one is the answer. With two it was never a fallback,
   * it was a wrong answer wearing a fallback's clothes.
   */
  const soleAgencyName = agencies.length === 1 ? agencies[0]?.agencyName : null;
  const fallbackAgencyName = soleAgencyName ?? me?.username ?? 'Agency';
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
          // WHO BOOKED THIS ONE — off the assignment, not off the PR. Two agencies
          // can appear in a single week of this list and each night belongs to the
          // one that sold it.
          agencyName: a.agencyName ?? fallbackAgencyName,
          // The night's identity — the timetable card renders it like the
          // Today section (picture + venue mark), owner's ask 20 Aug 2026.
          event: a.eventName ?? null,
          eventKind: a.eventKind ?? null,
          logoPath: a.outletLogo ?? null,
          eventPhotoPath: a.templateCoverImage ?? null,
        })),
    [assignments, fallbackAgencyName],
  );

  const days = useMemo(
    () => buildScheduleDays(blocked, todayIso, scheduleShifts),
    [blocked, todayIso, scheduleShifts],
  );
  const dayByIso = useMemo(
    () => new Map(days.map((d) => [d.dateIso, d])),
    [days],
  );

  // A booked shift whose window ended with NO check-in is a missed check-in —
  // see `checkInOutcome` below for how each row reports itself.
  // marked red on the calendar. Requiring status 'assigned' means MC/leave
  // (leave_pending/approved), cancellations and no-shows never count as missed.
  const missedByIso = useMemo(() => {
    const map = new Map<string, ShiftAssignmentRecord[]>();
    for (const a of assignments) {
      if (a.status !== 'assigned' || a.checkInAt || a.checkOutAt) continue;
      const end = shiftEndDate(a.shiftDate, a.slot);
      // Unparseable slot: count it missed once its calendar day is over.
      const missed = end ? end.getTime() < Date.now() : a.shiftDate < todayIso;
      if (!missed) continue;
      const list = map.get(a.shiftDate) ?? [];
      list.push(a);
      map.set(a.shiftDate, list);
    }
    return map;
  }, [assignments, todayIso]);
  /**
   * EVERY day that has shifts, not just the failed ones.
   *
   * The calendar could only be interrogated about days that went wrong: a red
   * day opened a detail sheet, and a green "Scheduled / Complete" day was
   * `disabled` — so a PR could inspect a check-in she missed but not one she
   * made. "Did I work the 22nd, and did my check-in register?" is the same
   * question in both directions, and the answer existed for only one of them.
   */
  const shiftsByIso = useMemo(() => {
    const map = new Map<string, ShiftAssignmentRecord[]>();
    for (const a of assignments) {
      const list = map.get(a.shiftDate) ?? [];
      list.push(a);
      map.set(a.shiftDate, list);
    }
    // Earliest first, so a two-shift day reads in the order she worked it.
    for (const list of map.values()) {
      list.sort((x, y) => (x.slot ?? '').localeCompare(y.slot ?? ''));
    }
    return map;
  }, [assignments]);

  /** The ids the red marking is based on, so a row can say so in words. */
  const missedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const rows of missedByIso.values()) for (const a of rows) ids.add(a.id);
    return ids;
  }, [missedByIso]);

  // Tap a red day → which outlet the missed shift was at.
  const [missedTarget, setMissedTarget] = useState<{
    iso: string;
    rows: ShiftAssignmentRecord[];
  } | null>(null);
  // Which picker (month/year chip row) the MONTH / YEAR fields have open.
  const [navOpen, setNavOpen] = useState<'month' | 'year' | null>(null);

  const weekRange = useMemo(() => getUpcomingWeekRange(todayIso), [todayIso]);
  const weekLabel = formatUpcomingWeekLabel(
    weekRange.fromIso,
    weekRange.toIso,
  ).toUpperCase();
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

  const years = Array.from({ length: 7 }, (_, i) => year - 3 + i);

  /**
   * Block or reopen a day, and PERSIST it — this is what the agency reads.
   *
   * Optimistic: the cell flips immediately and rolls back if the write fails,
   * so a refusal cannot leave the calendar claiming a block the server does not
   * have. The server re-checks the same rule (it refuses a day the PR is
   * already rostered on), so the guard below is the fast path, not the
   * guarantee.
   */
  const toggleDay = async (iso: string) => {
    if (!token || blockingIso) return;
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
    // Reopening is immediate — taking a block back needs no explanation, and a
    // sheet in the way would make undoing a mistap harder than making it.
    // Blocking asks for a reason first: the agency has to re-staff the shift,
    // and "not available" with a why is a different message to plain absence.
    if (blocked.includes(iso)) {
      await writeDay(iso, { block: false });
      return;
    }
    setReasonDraft('');
    setBlockError(null);
    setReasonTarget(iso);
  };

  /**
   * Persist one day's availability — this is what the agency reads.
   *
   * Optimistic: the cell flips immediately and rolls back if the write fails,
   * so a refusal cannot leave the calendar claiming a block the server does not
   * have. The server re-checks the same rule (it refuses a day the PR is
   * already rostered on), so the guard in `toggleDay` is the fast path, not the
   * guarantee.
   */
  const writeDay = async (
    iso: string,
    opts: { block: boolean; reason?: string },
  ) => {
    if (!token) return;
    const { block, reason } = opts;
    setBlockingIso(iso);
    setBlockError(null);
    setBlocked((prev) =>
      block ? [...prev, iso] : prev.filter((x) => x !== iso),
    );
    try {
      if (block) await blockMyDay(token, iso, reason);
      else await unblockMyDay(token, iso);
      setReasonTarget(null);
    } catch (e) {
      setBlocked((prev) =>
        block ? prev.filter((x) => x !== iso) : [...prev, iso],
      );
      setBlockError(
        e instanceof Error
          ? e.message
          : 'Could not update that day. Try again.',
      );
      // Keep the sheet open on failure so the typed reason is not lost — the
      // commonest refusal here ("you are already rostered that day") is one the
      // PR reads and then closes deliberately.
    } finally {
      setBlockingIso(null);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.rules}>
        <Pressable
          style={styles.rulesHd}
          onPress={() => setRulesOpen((o) => !o)}
        >
          <AlertTriangle size={16} color={C.amber} />
          <Text style={styles.rulesTitle}>Cancellation rules</Text>
          <ChevronDown
            size={16}
            color={C.muted}
            style={
              rulesOpen ? { transform: [{ rotate: '180deg' }] } : undefined
            }
          />
        </Pressable>
        {rulesOpen && (
          <View style={styles.rulesList}>
            {cancellationRuleSummary(cancelBands).map((r) => (
              <View key={r.label} style={styles.ruleRow}>
                <Text style={styles.ruleWhen}>{r.label}</Text>
                <Text
                  style={[
                    styles.ruleOut,
                    {
                      color:
                        r.tone === 'green'
                          ? C.green
                          : r.tone === 'amber'
                            ? C.amber
                            : C.red,
                    },
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
              onPress={() =>
                setNavOpen((o) => (o === 'month' ? null : 'month'))
              }
            >
              <Text style={styles.selectText}>{MONTH_LABELS[month]}</Text>
              <ChevronDown size={14} color={C.muted} />
            </Pressable>
          </View>
          <View style={styles.navField}>
            <Text style={styles.navLabel}>YEAR</Text>
            <Pressable
              style={styles.select}
              onPress={() => setNavOpen((o) => (o === 'year' ? null : 'year'))}
            >
              <Text style={styles.selectText}>{year}</Text>
              <ChevronDown size={14} color={C.muted} />
            </Pressable>
          </View>
        </View>

        {navOpen === 'year' && (
          <View style={styles.yearChips}>
            {years.map((y) => (
              <Pressable
                key={y}
                style={[styles.yearChip, y === year && styles.yearChipOn]}
                onPress={() => {
                  setViewMonth(new Date(y, month, 1));
                  setNavOpen(null);
                }}
              >
                <Text
                  style={[styles.yearChipText, y === year && { color: C.txt }]}
                >
                  {y}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {navOpen === 'month' && (
          <View style={styles.monthChips}>
            {MONTH_LABELS.map((label, i) => (
              <Pressable
                key={label}
                style={[styles.monthChip, i === month && styles.monthChipOn]}
                onPress={() => {
                  setViewMonth(new Date(year, i, 1));
                  setNavOpen(null);
                }}
              >
                <Text
                  style={[
                    styles.monthChipText,
                    i === month && { color: C.txt },
                  ]}
                >
                  {label.slice(0, 3)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.weekdays}>
          {WEEKDAYS.map((w) => (
            <Text key={w} style={styles.weekday}>
              {w}
            </Text>
          ))}
        </View>

        <View style={styles.grid}>
          {cells.map((dayNum, i) => {
            if (dayNum == null)
              return <View key={`e-${i}`} style={styles.dayCell} />;
            const iso = ymdToIso(year, month + 1, dayNum);
            const day = dayByIso.get(iso);
            const kind = day?.kind ?? 'past';
            const missedRows = missedByIso.get(iso);
            const dayRows = shiftsByIso.get(iso);
            // Red still means missed — widening what is TAPPABLE must not widen
            // what is marked, or every worked day would read as a failure.
            //
            // A WORKED day marks GREEN (owner, 23 Aug 2026: "that day for pr
            // got works why no marking? in green"). Completed shifts leave the
            // schedule feed for the Today section, so their day came through
            // as a neutral 'past' and Saturday's checked-in-and-out shift
            // left no trace on the calendar. Only the NEUTRAL kinds upgrade —
            // unavailable, pending and on-duty are stronger truths and keep
            // their own colour.
            const style = missedRows
              ? MISSED_STYLE
              : dayRows && (kind === 'past' || kind === 'open')
                ? KIND_STYLE.assigned
                : KIND_STYLE[kind];
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
                // A day with shifts OPENS; a day without them toggles her
                // availability. Shifts win when both could apply, because a day
                // she is already rostered on is not a day she can mark free —
                // and the server refuses that anyway.
                disabled={(!canToggle && !dayRows) || blockingIso === iso}
                onPress={() =>
                  dayRows
                    ? setMissedTarget({ iso, rows: dayRows })
                    : void toggleDay(iso)
                }
              >
                <Text style={[styles.dayNum, { color: style.color }]}>
                  {dayNum}
                </Text>
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
          <LegendSwatch color="#f07171" label="Missed check-in" />
        </View>

        {/* The server refused the change — most often "you are already rostered
            that day". Shown here rather than swallowed, because the cell has
            already rolled back and the PR would otherwise see the tap simply
            do nothing. */}
        {blockError && <Text style={styles.blockError}>{blockError}</Text>}
      </View>

      <View style={styles.timetable}>
        <View style={styles.ttHead}>
          <Clock size={16} color={C.muted2} />
          <Text style={styles.ttTitle}>Timetable · {weekLabel}</Text>
          <Pressable
            onPress={() => void refresh()}
            hitSlop={8}
            style={{ marginLeft: 'auto' }}
          >
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
                  penalty={
                    assignment ? cancelPenalty(assignment, cancelBands) : null
                  }
                  leavePending={assignment?.status === 'leave_pending'}
                  leaveRejected={
                    assignment?.status !== 'leave_pending' &&
                    (assignment?.notes?.startsWith(LEAVE_REJECTED_PREFIX) ??
                      false)
                  }
                  onCancel={() => openCancel(entry)}
                  onLeave={() => openLeave(entry)}
                />
              );
            })}
          </View>
        )}
      </View>

      {/* Mark a day unavailable, with an optional reason. The reason is what the
          agency's roster cell shows, so it is asked for — but never required:
          a PR does not owe anyone an explanation for a day they cannot work,
          and demanding one would just produce junk text. */}
      <PhoneSheet
        visible={reasonTarget != null}
        onRequestClose={() => setReasonTarget(null)}
      >
        <Pressable
          style={styles.cancelBackdrop}
          onPress={() => setReasonTarget(null)}
        >
          <Pressable
            style={styles.cancelSheet}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.cancelHandle} />
            <View style={styles.cancelHeaderRow}>
              <CalendarDays size={20} color={C.goldL} />
              <Text style={styles.cancelHeaderTitle}>Mark unavailable</Text>
            </View>
            {reasonTarget && (
              <Text style={styles.cancelHeaderSub}>
                {fmtDFriendly(...isoToYmd(reasonTarget))}
              </Text>
            )}
            <Text style={[styles.cancelNote, { marginTop: 12 }]}>
              Your agency sees this day blocked on their roster and will not put
              you on a shift. Adding a reason is optional.
            </Text>
            <TextInput
              style={styles.reasonInput}
              value={reasonDraft}
              onChangeText={setReasonDraft}
              placeholder="Reason (optional) — e.g. family event"
              placeholderTextColor={C.prMuted2}
              maxLength={200}
              multiline
            />
            {blockError && <Text style={styles.blockError}>{blockError}</Text>}
            <View style={styles.reasonActions}>
              <Pressable
                style={styles.reasonCancelBtn}
                onPress={() => setReasonTarget(null)}
                disabled={blockingIso != null}
              >
                <Text style={styles.reasonCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.reasonConfirmBtn}
                disabled={blockingIso != null}
                onPress={() =>
                  reasonTarget &&
                  void writeDay(reasonTarget, {
                    block: true,
                    reason: reasonDraft.trim() || undefined,
                  })
                }
              >
                <Text style={styles.reasonConfirmText}>
                  {blockingIso != null ? 'Saving…' : 'Mark unavailable'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </PhoneSheet>

      <PhoneSheet
        visible={cancelTarget != null}
        onRequestClose={() => setCancelTarget(null)}
      >
        <Pressable
          style={styles.cancelBackdrop}
          onPress={() => setCancelTarget(null)}
        >
          <Pressable
            style={styles.cancelSheet}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.cancelHandle} />
            <View style={styles.cancelHeaderRow}>
              <Briefcase size={20} color={C.goldL} />
              <Text style={styles.cancelHeaderTitle}>Cancel shift</Text>
            </View>
            {cancelTarget && (
              <Text style={styles.cancelHeaderSub}>
                {cancelTarget.entry.outlet} · {cancelTarget.entry.dateLabel} ·{' '}
                {cancelTarget.entry.time}
              </Text>
            )}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ marginTop: 12 }}
            >
              <Text style={styles.cancelNote}>
                Shifts are assigned by your agency — cancelling notifies your
                agency straight away.
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
                  <Text style={styles.penaltyBannerBody}>
                    {cancelTarget.penalty.tierLabel}
                  </Text>
                </View>
              )}
              <View style={styles.rulesCard}>
                <View style={styles.rulesCardHead}>
                  <AlertTriangle size={14} color={C.amber} />
                  <Text style={styles.rulesCardTitle}>CANCELLATION RULES</Text>
                </View>
                {cancellationRuleSummary(cancelBands).map((r) => (
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
                            r.tone === 'green'
                              ? C.green
                              : r.tone === 'amber'
                                ? C.amber
                                : C.red,
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
              {cancelError && (
                <Text style={styles.cancelErrorText}>{cancelError}</Text>
              )}
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
              <Pressable
                style={styles.cancelBackBtn}
                onPress={() => setCancelTarget(null)}
              >
                <Text style={styles.cancelBackText}>Back</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </PhoneSheet>

      <PhoneSheet
        visible={leaveTarget != null}
        onRequestClose={() => setLeaveTarget(null)}
      >
        <Pressable
          style={styles.cancelBackdrop}
          onPress={() => setLeaveTarget(null)}
        >
          <Pressable
            style={styles.cancelSheet}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.cancelHandle} />
            <View style={styles.cancelHeaderRow}>
              <CalendarDays size={20} color={C.goldL} />
              <Text style={styles.cancelHeaderTitle}>MC / Leave</Text>
            </View>
            {leaveTarget && (
              <Text style={styles.cancelHeaderSub}>
                {leaveTarget.outlet} · {leaveTarget.dateLabel} ·{' '}
                {leaveTarget.time}
              </Text>
            )}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ marginTop: 12 }}
            >
              <Text style={styles.cancelNote}>
                Unable to work this shift due to MC or personal leave? Send the
                request to your agency — you stay scheduled until they approve
                it.
              </Text>
              <View style={[styles.penaltyBanner, styles.penaltyBannerOk]}>
                <Text style={styles.penaltyBannerTitle}>
                  No penalty when approved
                </Text>
                <Text style={styles.penaltyBannerBody}>
                  An approved MC / leave excuses this shift with no deduction.
                  If rejected, the shift stays yours — cancelling instead
                  follows the cancellation rules.
                </Text>
              </View>
              <Text style={styles.cancelFieldLabel}>
                MC / document photo (required)
              </Text>
              <Pressable
                style={styles.mcPickBtn}
                onPress={() =>
                  pickProofPhotos((urls) =>
                    setLeavePhotos((prev) =>
                      [...prev, ...urls].slice(0, MAX_MC_PHOTOS),
                    ),
                  )
                }
              >
                <ImagePlus size={16} color={C.goldL} />
                <Text style={styles.mcPickText}>
                  {leavePhotos.length === 0
                    ? 'Snap / upload MC photo'
                    : 'Add another photo'}
                </Text>
              </Pressable>
              {leavePhotos.length > 0 && (
                <View style={styles.mcThumbRow}>
                  {leavePhotos.map((uri, i) => (
                    <View
                      key={`${i}-${uri.slice(-16)}`}
                      style={styles.mcThumbWrap}
                    >
                      {/* Entries may be data URLs (fresh snaps) or R2 keys (server
                          leave_proof_photos) — resolve for display only. */}
                      <Image
                        source={{ uri: resolveProofPhotoUri(uri) }}
                        style={styles.mcThumb}
                        resizeMode="cover"
                      />
                      <Pressable
                        style={styles.mcThumbX}
                        hitSlop={6}
                        onPress={() =>
                          setLeavePhotos((prev) =>
                            prev.filter((_, idx) => idx !== i),
                          )
                        }
                      >
                        <Text style={styles.mcThumbXText}>×</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
              {leavePhotos.length === 0 && (
                <Text style={styles.mcHint}>
                  Your agency reviews this photo before approving the leave.
                </Text>
              )}

              <Text style={styles.cancelFieldLabel}>Reason (required)</Text>
              <TextInput
                value={leaveReason}
                onChangeText={setLeaveReason}
                style={styles.cancelInput}
                placeholder="e.g. MC — fever, clinic visit tomorrow morning"
                placeholderTextColor={C.muted2}
                multiline
              />
              {leaveError && (
                <Text style={styles.cancelErrorText}>{leaveError}</Text>
              )}
              <Pressable
                style={[
                  styles.leaveSubmitBtn,
                  (leaveBusy || leavePhotos.length === 0) && { opacity: 0.6 },
                ]}
                onPress={confirmLeave}
                disabled={leaveBusy}
              >
                <Text style={styles.leaveSubmitText}>
                  {leaveBusy
                    ? 'Submitting…'
                    : leavePhotos.length === 0
                      ? 'Attach MC photo to submit'
                      : 'Submit leave request'}
                </Text>
              </Pressable>
              <Pressable
                style={styles.cancelBackBtn}
                onPress={() => setLeaveTarget(null)}
              >
                <Text style={styles.cancelBackText}>Back</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </PhoneSheet>

      {/* Missed check-in day detail — tap a red day on the calendar. */}
      <PhoneSheet
        visible={missedTarget != null}
        onRequestClose={() => setMissedTarget(null)}
      >
        <Pressable
          style={styles.cancelBackdrop}
          onPress={() => setMissedTarget(null)}
        >
          <Pressable
            style={styles.cancelSheet}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.cancelHandle} />
            <View style={styles.cancelHeaderRow}>
              {/* The header follows the DAY, not the sheet's history. It said
                  "Missed check-in" unconditionally back when only red days could
                  open it; now that any day with shifts opens, that title on a
                  day she worked would accuse her of a failure that did not
                  happen. */}
              <Clock
                size={20}
                color={
                  missedTarget?.rows.some((a) => missedIds.has(a.id))
                    ? '#f07171'
                    : C.accentL
                }
              />
              <Text style={styles.cancelHeaderTitle}>
                {missedTarget?.rows.some((a) => missedIds.has(a.id))
                  ? 'Missed check-in'
                  : 'Shifts this day'}
              </Text>
            </View>
            {missedTarget && (
              <>
                <Text style={styles.missedDate}>
                  {fmtDFriendly(...isoToYmd(missedTarget.iso))}
                </Text>
                {missedTarget.rows.map((a) => (
                  <View key={a.id} style={styles.missedRow}>
                    <Text style={styles.missedOutlet}>
                      {a.outletName ?? 'Outlet'}
                    </Text>
                    <Text style={styles.missedMeta}>{a.slot ?? '—'}</Text>
                    {/* WHAT HAPPENED, per shift. A day can hold one shift she
                        checked into and another she missed, and colouring the
                        whole day red said only that something went wrong
                        somewhere in it. */}
                    <Text
                      style={[
                        styles.missedMeta,
                        {
                          color: missedIds.has(a.id)
                            ? '#f07171'
                            : a.checkInAt
                              ? C.green
                              : C.prMuted,
                        },
                      ]}
                    >
                      {checkInOutcome(a, missedIds.has(a.id))}
                    </Text>
                    {a.outletAddress ? (
                      <Text style={styles.missedMeta}>{a.outletAddress}</Text>
                    ) : null}
                  </View>
                ))}
                {/* ONLY when something was actually missed. This footer printed
                    unconditionally, which was harmless while red days were the
                    only ones that could open the sheet — and became a flat
                    contradiction the moment any day could: "No check-in was
                    recorded for this shift" sitting directly under a row reading
                    "Checked in and out", on the screen a PR opens to find out
                    which of the two is true. */}
                {missedTarget.rows.some((a) => missedIds.has(a.id)) && (
                  <Text style={styles.missedNote}>
                    No check-in was recorded for{' '}
                    {missedTarget.rows.length > 1
                      ? 'the shift marked above'
                      : 'this shift'}
                    , and no MC / leave or cancellation is on file. Contact your
                    agency if this is wrong.
                  </Text>
                )}
              </>
            )}
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
  // No collapse here (owner, 20 Aug 2026): Cancel and MC/Leave are the card's
  // point — money actions a PR must never have to discover behind a tap.
  const [zoomUri, setZoomUri] = useState<string | null>(null);
  const heroUri = assetUrl(entry.eventPhotoPath);
  const logoUri = assetUrl(entry.logoPath);
  const isSpecial = (entry.eventKind ?? '').toLowerCase() === 'special';

  return (
    <View style={styles.ttRow}>
      <ImageLightbox uri={zoomUri} onClose={() => setZoomUri(null)} />
      {/* COMPACT by design (owner: "many shift will be very messy — minimise").
          One thumbnail-led row per shift, everything visible, no fold. */}
      <View style={styles.ttHeadRow}>
        <View style={styles.agencyBadge}>
          <Shield size={12} color={C.violetL} />
          <Text style={styles.agencyBadgeText}>
            AGENCY · {entry.sourceLabel.toUpperCase()}
          </Text>
        </View>
        <Pill variant={entry.statusVariant}>{entry.statusLabel}</Pill>
      </View>
      <View style={styles.ttMainRow}>
        {heroUri ? (
          <Pressable
            style={styles.ttThumbWrap}
            onPress={() => setZoomUri(heroUri)}
          >
            <Image
              source={{ uri: heroUri }}
              style={styles.ttThumb}
              resizeMode="cover"
            />
            <ZoomHint size={14} style={{ right: 3, bottom: 3 }} />
          </Pressable>
        ) : logoUri ? (
          <Pressable
            style={styles.ttThumbWrap}
            onPress={() => setZoomUri(logoUri)}
          >
            <Avatar
              size={64}
              radius={12}
              photoPath={entry.logoPath}
              initial={entry.outlet.trim()[0]?.toUpperCase()}
              logo
            />
            <ZoomHint size={14} style={{ right: 3, bottom: 3 }} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.ttOutlet} numberOfLines={1}>
            {entry.outlet}
          </Text>
          {entry.event ? (
            <Text style={styles.ttEventLine} numberOfLines={1}>
              {entry.event} · {isSpecial ? 'Special event' : 'Normal shift'}
            </Text>
          ) : null}
          <Text style={styles.ttWhenLine} numberOfLines={1}>
            {dateFriendly} · {entry.time}
          </Text>
        </View>
      </View>
      {/* The WHOLE address (owner: "dont hide the address") — its own
          full-width line so the thumbnail never squeezes it. */}
      {entry.address ? (
        <View style={[styles.ttAddrRow, { marginTop: 8 }]}>
          <MapPin size={11} color={C.prMuted2} strokeWidth={2} />
          <Text style={styles.ttAddrCompact}>{entry.address}</Text>
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
            <Pressable
              onPress={onCancel}
              style={[styles.cancelBtn, styles.actionBtn]}
            >
              <Text style={styles.cancelText} numberOfLines={1}>
                Cancel
              </Text>
              {penalty && penalty.amount > 0 ? (
                <Text style={styles.cancelPenaltyText} numberOfLines={1}>
                  −{formatRM(penalty.amount)}
                </Text>
              ) : null}
            </Pressable>
          ) : null}
          {entry.canLeave ? (
            <Pressable
              onPress={onLeave}
              style={[styles.leaveBtn, styles.actionBtn]}
            >
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
  ruleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    paddingTop: 6,
  },
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
  selectText: {
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '600',
    color: C.txt,
  },
  yearChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  yearChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
  },
  yearChipOn: { borderColor: C.violet, backgroundColor: C.violetInk },
  yearChipText: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
  },
  monthChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 10,
  },
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
  dayCell: {
    flexBasis: '14.28%',
    maxWidth: '14.28%',
    aspectRatio: 1,
    padding: 2,
  },
  dayBtn: {
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  blockError: {
    fontFamily: F.manrope,
    fontSize: C.fsTiny,
    color: C.red,
    textAlign: 'center',
    marginTop: 10,
  },
  reasonInput: {
    marginTop: 12,
    minHeight: 72,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    padding: 12,
    fontFamily: F.manrope,
    fontSize: C.fsSm,
    color: C.txt,
    textAlignVertical: 'top',
  },
  reasonActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    marginBottom: 4,
  },
  reasonCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
  },
  reasonCancelText: { fontFamily: F.sora, fontSize: C.fsSm, color: C.prMuted },
  reasonConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(240,138,138,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(240,138,138,0.4)',
    alignItems: 'center',
  },
  reasonConfirmText: {
    fontFamily: F.sora,
    fontSize: C.fsSm,
    fontWeight: '600',
    color: C.red,
  },
  mcPickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(232,194,122,0.45)',
    backgroundColor: 'rgba(232,194,122,0.06)',
  },
  mcPickText: {
    fontFamily: F.sora,
    fontSize: 13,
    fontWeight: '700',
    color: C.goldL,
  },
  mcThumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  mcThumbWrap: { position: 'relative' },
  mcThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  mcThumbX: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line2,
  },
  mcThumbXText: {
    fontFamily: F.sora,
    fontSize: 13,
    fontWeight: '800',
    color: C.red,
  },
  mcHint: {
    marginTop: 6,
    fontFamily: F.manrope,
    fontSize: 11,
    color: C.prMuted2,
  },
  missedDate: {
    marginTop: 4,
    fontFamily: F.sora,
    fontSize: 13,
    fontWeight: '700',
    color: C.txt,
  },
  missedRow: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(240,113,113,0.35)',
    backgroundColor: 'rgba(240,113,113,0.08)',
    borderRadius: 12,
    padding: 12,
  },
  missedOutlet: {
    fontFamily: F.sora,
    fontSize: 15,
    fontWeight: '700',
    color: C.txt,
  },
  missedMeta: {
    marginTop: 3,
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.prMuted,
  },
  missedNote: {
    marginTop: 12,
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.prMuted2,
  },
  timetable: { marginTop: 2 },
  ttHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
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
  /* Compact card: badge+status row, then a thumbnail-led main row. */
  ttHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  ttMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  ttThumbWrap: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    flexShrink: 0,
  },
  ttThumb: { width: 76, height: 76 },
  ttEventLine: {
    marginTop: 2,
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.muted,
  },
  ttWhenLine: {
    marginTop: 2,
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '700',
    color: C.txt,
  },
  ttAddrCompact: {
    flex: 1,
    minWidth: 0,
    fontFamily: F.manrope,
    fontSize: 11,
    color: C.prMuted2,
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
  ttTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  ttOutlet: {
    fontFamily: F.sora,
    fontSize: 16,
    fontWeight: '700',
    color: C.txt,
  },
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
  actionBtn: {
    flex: 1,
    minWidth: 0,
    marginTop: 0,
    minHeight: 46,
    justifyContent: 'center',
  },
  cancelBtn: {
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(240,138,138,0.4)',
    backgroundColor: 'rgba(240,138,138,0.08)',
  },
  cancelText: {
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '700',
    color: C.red,
  },
  cancelPenaltyText: {
    marginTop: 2,
    fontFamily: F.manrope,
    fontSize: 11,
    fontWeight: '700',
    color: C.red,
    opacity: 0.85,
  },
  leaveBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(232,198,106,0.4)',
    backgroundColor: 'rgba(232,198,106,0.08)',
  },
  leaveText: {
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '700',
    color: C.amber,
  },
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
  leaveSubmitText: {
    fontFamily: F.sora,
    fontSize: 15,
    fontWeight: '800',
    color: C.green,
  },
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
  cancelHeaderTitle: {
    fontFamily: F.sora,
    fontSize: 20,
    fontWeight: '800',
    color: C.txt,
  },
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
  penaltyBannerTitle: {
    fontFamily: F.sora,
    fontSize: 15,
    fontWeight: '800',
    color: C.txt,
  },
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
  ruleCardWhen: {
    fontFamily: F.sora,
    fontSize: 13,
    fontWeight: '700',
    color: C.txt,
  },
  ruleCardOut: {
    marginTop: 2,
    fontFamily: F.manrope,
    fontSize: 12,
    fontWeight: '600',
  },
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
  cancelAcceptText: {
    fontFamily: F.sora,
    fontSize: 15,
    fontWeight: '800',
    color: C.red,
  },
  cancelBackBtn: { marginTop: 10, alignItems: 'center', padding: 10 },
  cancelBackText: {
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '600',
    color: C.muted,
  },
});
