/**
 * PR Shifts home — port of InnocenZ-proto `/host?view=shifts`:
 * page header ("AGENCY SHIFTS" / "Hi, <first name>"), Shifts↔Job postings
 * toggle, Today/To-do/Upcoming hub strip, and the collapsible sections with
 * the tonight shift card. Identity comes from the backend; shift data mirrors
 * the prototype seeds until the backend models shifts.
 */
import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { C, F, GRADIENTS, grad } from '../theme/theme';
import {
  fmtDFriendly,
  formatRM,
  shiftEndDate,
  todayYmd,
  ymdToIso,
  type DemoShift,
  type Ymd,
} from '../lib/demo-shifts';
import { useSession } from '../lib/session';
import { assetUrl, type ShiftAssignmentRecord } from '../lib/api';
import { useViewportSize } from '../lib/viewport';
import { useLocale } from '../i18n';
import { Section } from '../components/Section';
import { ImageLightbox, ZoomHint } from '../components/ImageLightbox';
import { AgencySchedulePanel } from '../components/AgencySchedulePanel';
import { OutletSwapRequests } from '../components/OutletSwapRequests';
import { useOutletSwaps } from '../lib/outlet-swaps';
import { Avatar, EmptyDashed, IzButton, LabelWithIcon } from '../components/ui';
import {
  Briefcase,
  Calendar,
  ClipboardList,
  Clock,
  FileText,
  ChevronDown,
  House,
  MapPin,
  Store,
  ZoomIn,
} from '../components/icons';
import type { PrTab } from '../components/BottomNav';
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
    // `event_name` is nullable; an unnamed shift says so rather than borrowing
    // the generic word "Shift", which read as a real event name on the card.
    event: a.eventName?.trim() || 'No event name',
    eventKind: a.eventKind === 'special' ? 'Special event' : 'Normal shift',
    date: ymdFromIso(a.shiftDate),
    time: a.slot ?? '—',
    payout: Number(a.payAmount) || 0,
    // Was hardcoded null, so the Avatar below could only ever draw the venue's
    // first letter — the logo was never missing, it was never asked for. The
    // outlet join has always been in the /mine query; `outlet.logo_image` is
    // simply the one column it did not select.
    logoPath: a.outletLogo ?? null,
    eventPhotoPath: a.templateCoverImage ?? null,
    status,
  };
}

export function ShiftsScreen({ onNavigate }: { onNavigate: (tab: PrTab) => void }) {
  const { t } = useLocale();
  const { me } = useSession();
  const { openPv } = usePrNav();

  // Real shift assignments for this PR — shared with Check-In / timetable so
  // On duty / Complete badges flip as soon as attendance stamps change.
  const { assignments, refresh, focus } = useActiveShift();
  // Re-pull assignments whenever the Today page mounts — the agency may have
  // assigned a new same-day shift while the app sat on another tab.
  useEffect(() => {
    void refresh();
  }, [refresh]);
  // Approving a swap repoints the assignment, so the shift list above is stale
  // the moment it succeeds — re-read it rather than leaving the old outlet on
  // screen.
  const outletSwaps = useOutletSwaps({ onChanged: refresh });
  const { awaiting } = useAwaitingLastWeekPv();
  const todoItems = awaiting ? [awaiting.todo] : [];

  // Forgot-to-check-out caution: still checked in past the shift's scheduled
  // end. The backend clamps the eventual stamp to that end (pay locks to the
  // shift window), so this to-do is the nudge that actually closes the shift.
  const overdueAssignment =
    assignments.find(
      (a) =>
        a.checkInAt &&
        !a.checkOutAt &&
        a.status !== 'cancelled' &&
        a.status !== 'no_show' &&
        a.status !== 'leave_approved',
    ) ?? null;
  const overdueEnd = overdueAssignment
    ? shiftEndDate(overdueAssignment.shiftDate, overdueAssignment.slot)
    : null;
  const overdueCheckout =
    overdueAssignment && overdueEnd && Date.now() > overdueEnd.getTime()
      ? { assignment: overdueAssignment, end: overdueEnd }
      : null;
  const overdueEndHm = overdueCheckout
    ? `${String(overdueCheckout.end.getHours()).padStart(2, '0')}:${String(
        overdueCheckout.end.getMinutes(),
      ).padStart(2, '0')}`
    : '';

  const todayIso = ymdToIso(...todayYmd());
  // Missed check-ins (booked, never checked in, window over) are NOT to-dos —
  // they render as red days on the Agency Schedule calendar instead.

  const todoCount = todoItems.length + outletSwaps.pending.length + (overdueCheckout ? 1 : 0);
  const shifts = assignments
    .filter(
      (a) =>
        a.status !== 'cancelled' &&
        a.status !== 'no_show' &&
        // Excused via approved MC/leave — drops off the upcoming list.
        a.status !== 'leave_approved',
    )
    .map(assignmentToShift);

  // Today lists EVERY shift the PR works today: at most one still
  // pending/on-duty (the check-in target) plus any already checked-out. A
  // finished shift belongs to the day it was CHECKED OUT — night shifts cross
  // midnight (scheduled 27 Jul 22:00, checked out 28 Jul morning), so matching
  // completed rows on shiftDate would lose them. Same rule as pickActive and
  // the Check-In header date.
  const stampDayIso = (stamp: string) => {
    const d = new Date(stamp);
    return ymdToIso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  };
  // EVERY not-yet-complete shift today, earliest first — a PR can work two
  // same-day shifts at different times, and BOTH must sit on Today (.find()
  // used to swallow the second one).
  const todayShifts = shifts
    .filter((s) => ymdToIso(...s.date) === todayIso && s.status !== 'complete')
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  const tonightShift = todayShifts[0] ?? null;
  const completedToday = assignments
    .filter(
      (a) =>
        a.status !== 'cancelled' &&
        a.status !== 'no_show' &&
        a.status !== 'leave_approved' &&
        a.checkOutAt != null &&
        // A night shift checked out just before midnight must not vanish from
        // Today minutes later — the card stays while the check-out is fresh
        // (same 12 h rule as Check-In's pinned summary).
        (stampDayIso(a.checkOutAt) === todayIso ||
          Date.now() - new Date(a.checkOutAt).getTime() < 12 * 60 * 60 * 1000),
    )
    .sort((a, b) => (b.checkOutAt ?? '').localeCompare(a.checkOutAt ?? ''))
    .map((a) => {
      const d = new Date(a.checkOutAt as string);
      return {
        ...assignmentToShift(a),
        // Show the worked (check-out) day on the card, not the seed shift_date.
        date: [d.getFullYear(), d.getMonth() + 1, d.getDate()] as Ymd,
      };
    });
  /**
   * Shifts STILL TO BE WORKED — not "shifts dated today or later".
   *
   * The date test alone counted shifts the PR had already finished: on 4 Aug
   * Victoria checked in and out three times, and the hub strip read **UPCOMING 3**
   * while the Agency Schedule directly below it said *"No shifts this week"* —
   * the same three shifts, described as both pending and gone on one screen.
   *
   * The timetable was the honest one. It drops a shift the moment it is checked
   * in or out (AgencySchedulePanel ~263: `!s.checkInAt && !s.checkOutAt &&
   * s.status !== 'completed'`), because a shift being worked belongs to Today's
   * section and a worked one belongs to Payment. This applies the same test:
   * `assignmentToShift` sets 'complete' from checkOutAt/status and 'on-duty'
   * from checkInAt, so excluding those two IS that predicate, expressed on the
   * mapped shape.
   *
   * Still counted: future days, and today's not-yet-started shifts — which is
   * what a PR reads the number for.
   */
  const upcomingCount = shifts.filter(
    (s) => ymdToIso(...s.date) >= todayIso && s.status !== 'complete' && s.status !== 'on-duty',
  ).length;

  const { width } = useViewportSize();
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    today: true,
    todo: false,
    agency: true,
  });
  // To-do starts collapsed, which would hide a swap request behind a tap — and
  // an unseen request is not a notification. Open it once when one arrives,
  // without fighting the user if they then close it.
  const [swapAlerted, setSwapAlerted] = useState(false);
  useEffect(() => {
    if (outletSwaps.pending.length > 0 && !swapAlerted) {
      setSwapAlerted(true);
      setOpen((prev) => ({ ...prev, todo: true }));
    }
  }, [outletSwaps.pending.length, swapAlerted]);
  // A forgotten check-out is a caution the PR must SEE — pop To-do open once
  // when it appears (same one-shot pattern as swap requests).
  const [overdueAlerted, setOverdueAlerted] = useState(false);
  /** Open by default — a forgotten check-out costs the shift, so it announces itself. */
  const [overdueOpen, setOverdueOpen] = useState(true);
  /*
   * Which PV to-do cards are expanded, keyed by todo id — NOT one shared flag.
   * A PR can be holding more than one unsigned voucher, and one boolean would
   * fold every card the moment they parked a single one.
   * Absent = open: an unsigned voucher is money owed, so it announces itself
   * and the PR chooses to fold it, never the other way round.
   */
  const [pvOpen, setPvOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (overdueCheckout && !overdueAlerted) {
      setOverdueAlerted(true);
      setOpen((prev) => ({ ...prev, todo: true }));
    }
  }, [overdueCheckout, overdueAlerted]);

  const firstName = me?.profile.firstName?.split(' ')[0] ?? me?.username ?? 'PR';
  // .iz-pr-page-header__title: clamp(1.4rem, 5.2vw, 1.75rem)
  const titleSize = Math.min(28, Math.max(22.4, width * 0.052));

  // Scoped to TODAY's shifts only. This screen never borrowed Check-In's
  // phase, which is why it stayed right while Check-In showed a week-old
  // summary; that fallback is now gone (active-shift.tsx, pickActive), but the
  // scoping stays — this header must describe today, not whatever card another
  // screen happens to be holding.
  const todayStatus = tonightShift
    ? tonightShift.status === 'on-duty'
      ? 'On duty'
      : 'Tonight'
    : completedToday.length > 0
      ? 'Complete'
      : 'Off';
  const todayStatusLabel =
    todayStatus === 'On duty'
      ? t.shifts.onDuty
      : todayStatus === 'Tonight'
        ? t.shifts.tonight
        : todayStatus === 'Complete'
          ? t.shifts.complete
          : todayStatus;

  // CTA per card, not per global phase — a completed card always offers its
  // summary even while a fresh same-day shift owns the Check in button.

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
            {t.shifts.hi.split('{name}')[0]}
            <Text style={styles.headerTitleAccent}>{firstName}</Text>
          </Text>
        </View>
      </View>

      {/* Hub strip — Today / To-do / Upcoming */}
          <View style={styles.hubTabs}>
            <HubTab
              label={t.shifts.today}
              value={todayStatusLabel}
              valueColor={todayStatus === 'Complete' ? C.green : C.goldL}
              on={open.today}
              onPress={() => toggleHubSection('today')}
            />
            <HubTab
              label={t.shifts.todo}
              value={String(todoCount)}
              valueColor={todoCount > 0 ? C.amber : C.txt}
              on={open.todo}
              onPress={() => toggleHubSection('todo')}
            />
            <HubTab
              label={t.shifts.upcoming}
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
              {todayShifts.length > 0 || completedToday.length > 0 ? (
                <View style={{ gap: 12 }}>
                  {todayShifts.map((s, i) => (
                    <TonightCard
                      key={s.id}
                      shift={s}
                      eyebrow={
                        s.status === 'on-duty'
                          ? 'ON DUTY'
                          : i === 0
                            ? 'TONIGHT'
                            : 'ALSO TODAY'
                      }
                      cta={s.status === 'on-duty' ? 'Attendance' : 'Check in'}
                      // Cards start collapsed — the PR taps one open to see
                      // the details they want.
                      defaultOpen={false}
                      onCheckIn={() => {
                        // First card owns the live Check-In pick; a second
                        // same-day shift pins Check-In to its own row id.
                        focus(i === 0 ? null : s.id);
                        onNavigate('checkin');
                      }}
                    />
                  ))}
                  {completedToday.map((s) => (
                    <TonightCard
                      key={s.id}
                      shift={s}
                      eyebrow={
                        ymdToIso(...s.date) !== todayIso
                          ? 'LAST NIGHT · COMPLETE'
                          : tonightShift
                            ? 'EARLIER TODAY · COMPLETE'
                            : 'COMPLETE'
                      }
                      cta="View summary"
                      // Collapsed by default while a live shift owns the page;
                      // the lone just-finished shift stays expanded.
                      defaultOpen={false}
                      // Pin Check-In to this finished shift's check-out summary.
                      onCheckIn={() => {
                        focus(s.id);
                        onNavigate('checkin');
                      }}
                    />
                  ))}
                </View>
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
              {/* A swap request has no push transport, so surfacing it here IS
                  the notification — and it sits above the PV to-dos because it
                  is the only item that changes where the PR works tonight. */}
              {overdueCheckout && (
                <View
                  style={[
                    styles.todoCard,
                    {
                      flexDirection: 'column',
                      alignItems: 'stretch',
                      borderColor: 'rgba(232,198,106,0.4)',
                      backgroundColor: 'rgba(232,198,106,0.06)',
                      marginBottom: 10,
                    },
                  ]}
                >
                  {/*
                    * A COLUMN, and collapsible.
                    *
                    * It was one fixed row — icon | text | button — so on a real
                    * phone the button held its width and crushed the message
                    * into a four-line ribbon ("Emhub Testing · / shift ended
                    * 12:00 · / pay locks to the / shift window"). Stacking lets
                    * the text use the full width at any screen size.
                    *
                    * Collapsing matters because this card CANNOT be dismissed —
                    * it stays until the PR checks out, deliberately, since
                    * forgetting costs them the shift's pay. Folding it to its
                    * title lets them park it without losing the warning.
                    */}
                  <Pressable
                    style={styles.overdueHead}
                    onPress={() => setOverdueOpen((o) => !o)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: overdueOpen }}
                  >
                    <View style={styles.todoIcon}>
                      <Clock size={16} color={C.amber} />
                    </View>
                    <Text style={[styles.todoTitle, { flex: 1 }]}>Forgot to check out?</Text>
                    <ChevronDown
                      size={16}
                      color={C.amber}
                      style={overdueOpen ? { transform: [{ rotate: '180deg' }] } : undefined}
                    />
                  </Pressable>
                  {overdueOpen && (
                    <>
                      {/*
                        * THREE facts, three lines — not one dot-separated run.
                        *
                        * "Emhub Testing · shift ended 12:00 · pay locks to the
                        * shift window" wrapped mid-clause on a phone, so the
                        * outlet, the time and the CONSEQUENCE ran together as one
                        * grey ribbon. The consequence is the reason the card
                        * exists — it is money — so it gets its own amber line
                        * rather than being the tail of a sentence.
                        */}
                      <View style={styles.overdueFacts}>
                        <View style={styles.overdueRow}>
                          <Text style={styles.overdueKey}>WHERE</Text>
                          <Text style={styles.overdueVal}>
                            {overdueCheckout.assignment.outletName ?? 'Outlet'}
                          </Text>
                        </View>
                        <View style={styles.overdueRow}>
                          <Text style={styles.overdueKey}>SHIFT ENDED</Text>
                          <Text style={styles.overdueVal}>{overdueEndHm}</Text>
                        </View>
                      </View>
                      <Text style={styles.overdueWarn}>
                        Your pay stops at {overdueEndHm} whenever you tap out — check out now to
                        close the shift.
                      </Text>
                      <IzButton
                        label="Check out"
                        onPress={() => {
                          focus(null);
                          onNavigate('checkin');
                        }}
                        style={{ marginTop: 10 }}
                      />
                    </>
                  )}
                </View>
              )}
              <OutletSwapRequests swaps={outletSwaps} />
              {todoItems.length === 0 && outletSwaps.pending.length === 0 && !overdueCheckout ? (
                <EmptyDashed>Nothing to do</EmptyDashed>
              ) : (
                <View style={{ gap: 10 }}>
                  {todoItems.map((todo) => {
                    const cardOpen = pvOpen[todo.id] ?? true;
                    return (
                      /*
                       * A COLUMN, and collapsible — the same treatment the
                       * overdue-checkout card above already needed, for the
                       * same reason. As a fixed row the "Review PV" button held
                       * its width and squeezed everything else into a gutter:
                       * the title broke over three lines and the outlet, the
                       * voucher number and the amount ran on for three more.
                       *
                       * Collapsing matters because this card cannot be
                       * dismissed — it stays until the PR signs the voucher.
                       * Folding it to its title lets them park it without
                       * losing it. Open by default, so nothing that was on
                       * screen before disappears behind a tap.
                       */
                      <View key={todo.id} style={[styles.todoCard, styles.todoCardStacked]}>
                        <Pressable
                          style={styles.overdueHead}
                          onPress={() =>
                            setPvOpen((prev) => ({
                              ...prev,
                              [todo.id]: !(prev[todo.id] ?? true),
                            }))
                          }
                          accessibilityRole="button"
                          accessibilityState={{ expanded: cardOpen }}
                        >
                          <View style={styles.todoIcon}>
                            <FileText size={16} color={C.goldL} />
                          </View>
                          <Text style={[styles.todoTitle, { flex: 1 }]}>{todo.title}</Text>
                          <ChevronDown
                            size={16}
                            color={C.goldL}
                            style={cardOpen ? { transform: [{ rotate: '180deg' }] } : undefined}
                          />
                        </Pressable>
                        {cardOpen && (
                          <>
                            {/*
                              * Three facts, three rows — not the one
                              * dot-separated run `subtitle` carries. The todo
                              * already holds them apart (`outlet`, `ref`,
                              * `net`), and the amount is what the PR is being
                              * asked to attest to, so it gets its own line
                              * rather than being the tail of a sentence.
                              */}
                            <View style={styles.overdueFacts}>
                              <View style={styles.overdueRow}>
                                <Text style={styles.overdueKey}>WHERE</Text>
                                <Text style={styles.overdueVal}>{todo.outlet}</Text>
                              </View>
                              <View style={styles.overdueRow}>
                                <Text style={styles.overdueKey}>VOUCHER</Text>
                                <Text style={styles.overdueVal}>{todo.ref}</Text>
                              </View>
                              <View style={styles.overdueRow}>
                                <Text style={styles.overdueKey}>NET PAY</Text>
                                <Text style={styles.overdueVal}>{formatRM(todo.net)}</Text>
                              </View>
                            </View>
                            <IzButton
                              label={todo.actionLabel}
                              onPress={() => openPv(todo.pvId)}
                              style={{ marginTop: 10 }}
                            />
                          </>
                        )}
                      </View>
                    );
                  })}
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

/**
 * `TodayShiftCard` — a Today-section shift. The header (eyebrow + outlet) is
 * always visible and taps to collapse/expand the details, so a day holding
 * several shifts stays scannable; the CTA lives in the expanded body.
 */
function TonightCard({
  shift,
  eyebrow,
  cta,
  onCheckIn,
  defaultOpen = true,
}: {
  shift: DemoShift;
  eyebrow: string;
  cta: string;
  onCheckIn: () => void;
  /** "Earlier today" summaries start collapsed; the live shift starts open. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  /** Full-size viewer for the event picture / outlet logo (owner: PR can zoom). */
  const [zoomUri, setZoomUri] = useState<string | null>(null);
  return (
    <View style={[styles.shiftCard, grad(GRADIENTS.shiftCard, 'rgba(232,194,122,0.08)')]}>
      <ImageLightbox uri={zoomUri} onClose={() => setZoomUri(null)} />
      <Pressable onPress={() => setOpen((o) => !o)}>
        <View style={styles.shiftCardHead}>
          <Text style={styles.shiftEyebrow}>{eyebrow}</Text>
          <ChevronDown
            size={16}
            color={C.muted}
            style={open ? { transform: [{ rotate: '180deg' }] } : undefined}
          />
        </View>
        {/* The night's own picture — the event card the outlet posted from.
            Hero, not a footnote: the PR recognises the event before reading. */}
        {shift.eventPhotoPath ? (
          <Pressable
            style={styles.shiftHeroWrap}
            onPress={() => setZoomUri(assetUrl(shift.eventPhotoPath) ?? null)}
          >
            <Image
              source={{ uri: assetUrl(shift.eventPhotoPath) ?? undefined }}
              style={styles.shiftHero}
              resizeMode="cover"
            />
            <View style={styles.shiftHeroBadge}>
              <Text
                style={[
                  styles.shiftHeroBadgeText,
                  shift.eventKind === 'Special event' && styles.shiftHeroBadgeTextSpecial,
                ]}
              >
                {shift.eventKind ?? 'Normal shift'}
              </Text>
            </View>
            <View style={styles.zoomBadge}>
              <ZoomIn size={12} color="#fff" strokeWidth={2.2} />
            </View>
          </Pressable>
        ) : null}
        <View style={styles.shiftVenue}>
          <Pressable
            disabled={!assetUrl(shift.logoPath)}
            onPress={() => setZoomUri(assetUrl(shift.logoPath) ?? null)}
          >
            <Avatar
              size={52}
              radius={16}
              photoPath={shift.logoPath}
              initial={shift.outlet.trim()[0]?.toUpperCase()}
              logo
              style={styles.shiftLogo}
            />
            {assetUrl(shift.logoPath) ? (
              <ZoomHint size={16} style={{ right: -3, bottom: -3 }} />
            ) : null}
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <LabelWithIcon icon={Store} label="Outlet name" />
            <Text style={styles.shiftVenueName}>{shift.outlet}</Text>
            <Text style={styles.shiftEventLine} numberOfLines={1}>
              {shift.event} · {shift.eventKind ?? 'Normal shift'}
            </Text>
            {open && shift.address ? (
              <View style={styles.shiftAddrRow}>
                <MapPin size={12} color={C.prMuted2} strokeWidth={2} />
                <Text style={styles.shiftAddrText}>{shift.address}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
      {open && (
        <>
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
            {/* The event moved up into the header, where it is readable
                without expanding. Repeating it here said the same thing twice
                on one card, so this strip is now just the money. */}
            <Text style={styles.shiftEventText}>
              {formatRM(shift.payout)}
            </Text>
          </View>
          <IzButton label={cta} icon={MapPin} small onPress={onCheckIn} style={{ marginTop: 12 }} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shiftHeroWrap: {
    position: 'relative',
    marginTop: 10,
    borderRadius: 14,
    overflow: 'hidden',
  },
  shiftHero: {
    width: '100%',
    height: 132,
  },
  shiftHeroBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  shiftHeroBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#C9B8F2',
  },
  shiftHeroBadgeTextSpecial: {
    color: '#E8C27A',
  },
  /** Magnifier chip on the hero — "this picture opens bigger". */
  zoomBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
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
  shiftCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
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
  /**
   * Event line, in the card HEADER so it survives collapse. Three shifts at
   * one outlet on one day are indistinguishable by venue alone — the event is
   * the only thing that tells them apart, and it used to appear only after
   * expanding, unlabelled, beside the payout.
   */
  shiftEventLine: {
    marginTop: 3,
    fontFamily: F.manrope,
    fontSize: 12,
    lineHeight: 16,
    color: C.prMuted2,
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
  /** Stacks a todoCard's contents so its button gets the full width, not a gutter. */
  todoCardStacked: { flexDirection: 'column', alignItems: 'stretch' },
  overdueHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  overdueFacts: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  overdueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    // No fixed widths: the label column sizes to its own text and the value
    // takes the rest, so a long outlet name wraps instead of being clipped on
    // a narrow phone.
    gap: 10,
    paddingVertical: 6,
  },
  overdueKey: {
    fontFamily: F.manrope,
    fontSize: C.fsTiny - 1,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: C.prMuted,
    paddingTop: 1,
  },
  overdueVal: {
    flex: 1,
    minWidth: 0,
    fontFamily: F.sora,
    fontSize: C.fsTiny + 1,
    fontWeight: '700',
    color: C.txt,
    textAlign: 'right',
  },
  overdueWarn: {
    fontFamily: F.manrope,
    fontSize: C.fsTiny,
    lineHeight: C.fsTiny * 1.45,
    // The champagne this card is already built from (todoIcon's chip and the
    // Check-out gradient) — NOT C.gold, which is violet in this palette.
    color: '#e8c27a',
    marginTop: 10,
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
  /*
   * `todoBody` and `todoSubtitle` lived here for the old fixed-row card. The
   * card now stacks and prints its facts through `overdueFacts`/`overdueRow`,
   * so both were dead — left behind, they read as the styling this card still
   * uses and invite the flattened row to be rebuilt.
   */
  todoTitle: {
    fontFamily: F.sora,
    fontSize: 18,
    fontWeight: '700',
    color: C.txt,
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
