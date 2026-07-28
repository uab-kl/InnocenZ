/**
 * Check-In — port of InnocenZ-proto `/host/tonight`, wired to the backend.
 * The actionable shift, phase, and check-in / check-out are driven by this PR's
 * own shift_assignment rows (scoped server-side). GPS is REAL: the phone reads
 * its position for both stamps and the backend verifies it against the outlet's
 * saved pin (selfie is still bypassed). Receipt logging (the on-duty status
 * panel) and the wages seal write to the backend current-week voucher.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, F, GRADIENTS, grad } from '../theme/theme';
import {
  CANCELLATION_RULE_SUMMARY,
  GEOFENCE_METERS,
  GPS_BYPASS,
  fmtDFriendly,
  formatRM,
  todayYmd,
  ymdToIso,
  type Ymd,
} from '../lib/demo-shifts';
import { shiftDurationLabel, useShiftSession } from '../lib/shift-session';
import { useActiveShift } from '../lib/active-shift';
import { overtimePay } from '../lib/pr-rate';
import { usePrEarnings, receiptCommissionTotal } from '../lib/pr-earnings';
import { useSession } from '../lib/session';
import { usePrNav } from '../lib/pr-nav';
import { checkInShiftAssignment, checkOutShiftAssignment } from '../lib/api';
import { getAttendanceFix } from '../lib/device-location';
import { EmptyDashed, IzButton, Pill } from '../components/ui';
import { ShiftStatusPanel } from '../components/ShiftStatusPanel';
import { ScannedReceiptsCard } from '../components/ScannedReceiptsCard';
import { MapPin } from '../components/icons';
import type { PrTab } from '../components/BottomNav';

function ymdFromIso(iso: string): Ymd {
  const [y, m, d] = iso.split('-').map((n) => Number(n));
  return [y, m, d];
}

/** Device-local calendar day of a Date as [y, m(1-based), d]. */
function localYmd(d: Date): Ymd {
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
}

export function CheckInScreen({ onNavigate }: { onNavigate: (tab: PrTab) => void }) {
  const { token } = useSession();
  const { setTab } = usePrNav();
  // Keep local session in sync so Scan / Shifts don't bounce the PR back to
  // "check in" while they're already on duty from the backend stamp.
  const { checkIn: markLocalOnDuty, checkOut: markLocalComplete, phase: localPhase } =
    useShiftSession();
  // Receipt commission + the wages seal now come from the backend current-week voucher.
  const { receiptLines, addLine } = usePrEarnings();
  // The active assignment (with its resolved rate card + drink menu) is shared
  // with Scan via the provider, so both screens act on the same real shift.
  const { active, current, phase, loading, error: loadError, refresh, patch, dismiss, focus, focusedId } =
    useActiveShift();

  // Re-pull on mount: a new same-day assignment made while the app sat on
  // another tab must renew this page, not leave the old shift on screen.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [briefOpen, setBriefOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // If the backend already has an open check-in (e.g. after reload), mirror that
  // into the local session so Scan self-log stays unlocked without another tap.
  useEffect(() => {
    if (phase === 'on_duty' && localPhase !== 'on_duty') markLocalOnDuty();
  }, [phase, localPhase, markLocalOnDuty]);

  // Attribute wages + receipts to the PR's actual calendar day (device-local
  // "today") — the day the check-out happens. Not the shift's scheduled date
  // (the seed dates some shifts a day ahead, which would push earnings onto
  // tomorrow) and not a UTC day that rolls over at night.
  const todayKey = ymdToIso(...todayYmd());
  const todayReceipts = receiptLines.filter((l) => l.lineDate === todayKey);

  const finalPayout = active
    ? (Number(active.rate?.wagePerHour) || Number(active.payAmount)) +
      receiptCommissionTotal(todayReceipts)
    : 0;
  const completeDuration = active
    ? shiftDurationLabel(active.checkInAt, active.checkOutAt)
    : '—';

  // OT read from the sealed stamps (the server clamps a forgotten check-out to
  // the shift's scheduled end, so these hours are real). Never auto-paid —
  // surfaced below as pending agency approval, outside the payout.
  const otHoursWorked =
    active?.checkInAt && active.checkOutAt
      ? Math.max(
          0,
          (new Date(active.checkOutAt).getTime() - new Date(active.checkInAt).getTime()) /
            3_600_000 -
            6,
        )
      : 0;
  const otPendingAmount = active
    ? overtimePay(otHoursWorked, active.rate, Number(active.payPerHour) || 0)
    : 0;

  const statusLabel =
    phase === 'on_duty'
      ? 'On duty'
      : phase === 'complete'
        ? 'Complete'
        : phase === 'booked'
          ? 'Booked'
          : 'No shift';

  const runAttendance = useCallback(
    async (forCheckout: boolean) => {
      if (!token || !active) return;
      setBusy(true);
      setActionError(null);
      try {
        // Read the phone's position for BOTH stamps. The phone only reports
        // where it is — the backend recomputes the metres from the outlet's
        // own pin and decides. A denied/unavailable fix is surfaced here and
        // stops check-in early, because a check-in with no fix is refused by
        // the server the moment that outlet has a pin; failing here gives the
        // PR a fixable message instead of a bare rejection.
        const located = await getAttendanceFix();
        if (!located.ok && !forCheckout) {
          // `finally` clears busy.
          setActionError(located.message);
          return;
        }
        // Check-out never blocks on location: the shift is already worked.
        const fix = located.ok ? located.fix : undefined;

        if (forCheckout) {
          const sealed = await checkOutShiftAssignment(token, active.id, fix);
          // Flat tier wages from Post Job "Pay by PR tier → Wages" (rate.wagePerHour),
          // falling back to the sealed assignment payAmount.
          const wagesRm =
            Number(active.rate?.wagePerHour) ||
            Number(sealed.payAmount) ||
            Number(active.payAmount) ||
            0;
          await addLine({
            kind: 'wages',
            source: 'checkin',
            item: 'Daily wages',
            quantity: 1,
            sales: wagesRm,
            commission: wagesRm,
            // Seal wages on today (same key the receipts use), so the Payment
            // "This week" column groups wages + drinks + tips together.
            lineDate: todayKey,
            outlet: active.outletName ?? undefined,
            dedupeRef: active.id,
          });
          // Overtime is NOT auto-paid any more. The server clamps a forgotten
          // check-out to the shift's scheduled end (pay locks to the shift
          // window), and genuine OT beyond 6h is only money once the agency
          // approves it — the summary below shows it as pending approval. The
          // OT math itself (overtimePay in pr-rate.ts) is unchanged.
          markLocalComplete();
          // Stay optimistic: patch the row so we don't flash "Check in" again
          // before navigating away.
          patch(sealed);
          // Leave Check-In only on check-out → Payment → This week.
          setTab('payment', { paymentWeek: 'current' });
        } else {
          const stamped = await checkInShiftAssignment(token, active.id, fix);
          markLocalOnDuty();
          // Stay on Check-In for the whole shift — patch the shared list so the
          // UI flips to On duty / Check out without a second Check-in tap.
          patch(stamped);
        }
      } catch (e) {
        setActionError(e instanceof Error ? e.message : 'Attendance failed');
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [token, active, refresh, patch, addLine, markLocalOnDuty, markLocalComplete, setTab, todayKey],
  );

  const startHold = (forCheckout: boolean) => {
    if (holding || busy) return;
    setHolding(true);
    let p = 0;
    timerRef.current = setInterval(() => {
      p += 5;
      setProgress(p);
      if (p >= 100) {
        if (timerRef.current) clearInterval(timerRef.current);
        setHolding(false);
        setProgress(0);
        void runAttendance(forCheckout);
      }
    }, 60);
  };

  const confirmCancel = () => {
    if (!cancelReason.trim() || !active) return;
    // Client-only for now — a PR-cancel endpoint is a later slice. Hides the row
    // from the active pick until reload.
    dismiss(active.id);
    setCancelOpen(false);
    setCancelReason('');
  };

  const outletName = active?.outletName ?? 'Outlet';
  const shiftTime = active?.slot ?? '—';
  // A completed shift shows the day it was actually worked (local check-out day),
  // not its scheduled shift_date — so a shift checked out today never reads as a
  // future date. Booked / on-duty keep showing the scheduled date.
  const shiftDateYmd: Ymd | null = active
    ? active.checkOutAt
      ? localYmd(new Date(active.checkOutAt))
      : ymdFromIso(active.shiftDate)
    : null;

  return (
    <View style={styles.screen}>

      {(actionError || loadError) && (
        <Text style={styles.errorText}>{actionError ?? loadError}</Text>
      )}

      {/* Pinned to an earlier shift's summary while a live shift waits —
          one tap returns to the current check-in. */}
      {active && focusedId === active.id && current && current.id !== active.id && (
        <Pressable style={styles.focusBanner} onPress={() => focus(null)}>
          <Text style={styles.focusBannerText}>
            Viewing an earlier shift · tap to go to your current shift
          </Text>
        </Pressable>
      )}

      {phase === 'idle' ? (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.pageLabel}>ATTENDANCE</Text>
          <Text style={styles.pageTitle}>Check in</Text>
          <EmptyDashed>
            {loading
              ? 'Loading your shift…'
              : 'Your agency will assign your shift — check in when assigned.'}
          </EmptyDashed>
          <View style={styles.idleActions}>
            <IzButton
              label="View schedule"
              variant="soft"
              small
              onPress={() => onNavigate('shifts')}
            />
          </View>
        </View>
      ) : (
        active && (
          <>
            <Pressable
              style={[styles.brief, grad(GRADIENTS.shiftCard, 'rgba(232,194,122,0.1)')]}
              onPress={() => setBriefOpen((o) => !o)}
            >
              <View style={styles.briefHead}>
                <Text style={styles.briefPage}>ATTENDANCE</Text>
                <View style={styles.statusBlock}>
                  <Text style={styles.statusK}>Status</Text>
                  <Text style={styles.statusV}>{statusLabel}</Text>
                </View>
              </View>
              <View style={styles.briefMain}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.venueName}>{outletName}</Text>
                  <Text style={styles.shiftMeta}>
                    {shiftDateYmd ? fmtDFriendly(...shiftDateYmd) : '—'} · {shiftTime}
                  </Text>
                  {active.outletAddress ? (
                    <View style={styles.addrRow}>
                      <MapPin size={13} color={C.prMuted2} strokeWidth={2} />
                      <Text style={styles.addrText}>{active.outletAddress}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.event}>{active.eventName ?? 'Shift'}</Text>
                  <Text style={styles.tapHint}>{briefOpen ? 'Tap to collapse' : 'Tap to expand'}</Text>
                </View>
                <View style={styles.mark}>
                  <Text style={styles.markText}>{outletName.trim()[0]?.toUpperCase()}</Text>
                </View>
              </View>
              {briefOpen && (
                <View style={styles.briefBody}>
                  <Text style={styles.briefBodyLabel}>Est. payout</Text>
                  <Text style={styles.briefBodyValue}>
                    {formatRM(Number(active.rate?.wagePerHour) || Number(active.payAmount))}
                  </Text>
                  <Text style={[styles.briefBodyLabel, { marginTop: 8 }]}>Shift time</Text>
                  <Text style={styles.briefBodyValue}>{shiftTime}</Text>
                </View>
              )}
            </Pressable>

            {phase === 'booked' && (
              <>
                <HoldButton
                  label="Check in"
                  holding={holding}
                  progress={progress}
                  onPress={() => startHold(false)}
                />
                <Text style={styles.gpsNote}>
                  Check-in is only allowed within {GEOFENCE_METERS}m of {outletName}
                  {GPS_BYPASS
                    ? ' — GPS temporarily bypassed for demo.'
                    : '. Your phone shares its location for this stamp only.'}
                </Text>
                <Pressable style={styles.cancelBtn} onPress={() => setCancelOpen(true)}>
                  <Text style={styles.cancelText}>Cancel shift</Text>
                </Pressable>
              </>
            )}

            {phase === 'on_duty' && (
              <>
                <ShiftStatusPanel
                  checkedOut={false}
                  checkInAt={active.checkInAt}
                  checkOutAt={active.checkOutAt}
                  dutyWagesRm={Number(active.rate?.wagePerHour) || Number(active.payAmount)}
                  targetSalesRm={active.rate?.targetSalesRm ? Number(active.rate.targetSalesRm) : null}
                  dayKey={todayKey}
                />
                <ScannedReceiptsCard lines={todayReceipts} />
                <HoldButton
                  label="Check out"
                  holding={holding}
                  progress={progress}
                  onPress={() => startHold(true)}
                />
                <Text style={styles.gpsNote}>
                  Selfie attendance disabled — hold Check out when your shift ends.
                </Text>
              </>
            )}

            {phase === 'complete' && (
              <>
                <View style={styles.completeHero}>
                  <Pill variant="green">Complete</Pill>
                  <View style={styles.completeMoney}>
                    <View>
                      <Text style={styles.onDutyLabel}>Final payout</Text>
                      <Text style={styles.completeDuration}>Duration {completeDuration}</Text>
                    </View>
                    <Text style={styles.completeAmt}>{formatRM(finalPayout)}</Text>
                  </View>
                </View>
                {otPendingAmount > 0 && (
                  <Text style={styles.otPendingNote}>
                    Overtime {otHoursWorked.toFixed(1)}h ({formatRM(otPendingAmount)}) — pending
                    agency approval · not added to payout
                  </Text>
                )}
                <ShiftStatusPanel
                  checkedOut
                  checkInAt={active.checkInAt}
                  checkOutAt={active.checkOutAt}
                  dutyWagesRm={Number(active.rate?.wagePerHour) || Number(active.payAmount)}
                  targetSalesRm={active.rate?.targetSalesRm ? Number(active.rate.targetSalesRm) : null}
                  dayKey={todayKey}
                />
              </>
            )}
          </>
        )
      )}

      <Modal
        visible={cancelOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCancelOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setCancelOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Cancel shift?</Text>
            <Text style={styles.sheetMeta}>
              {outletName} · {shiftDateYmd ? fmtDFriendly(...shiftDateYmd) : '—'} · {shiftTime}
            </Text>
            <Text style={styles.sheetHint}>
              Agency-assigned shift — cancellation may affect wages.
            </Text>
            <Text style={styles.rulesTitle}>Cancellation rules</Text>
            {CANCELLATION_RULE_SUMMARY.map((r) => (
              <View key={r.label} style={styles.ruleRow}>
                <Text style={styles.ruleLabel}>{r.label}</Text>
                <Text
                  style={[
                    styles.ruleOutcome,
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
            <Text style={styles.fieldLabel}>Reason (required)</Text>
            <TextInput
              value={cancelReason}
              onChangeText={setCancelReason}
              style={styles.input}
              placeholder="Why are you cancelling?"
              placeholderTextColor={C.muted2}
            />
            <Pressable style={styles.dangerBtn} onPress={confirmCancel}>
              <Text style={styles.dangerBtnText}>Cancel shift</Text>
            </Pressable>
            <Pressable style={styles.sheetCancel} onPress={() => setCancelOpen(false)}>
              <Text style={styles.sheetCancelText}>Back</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function HoldButton({
  label,
  holding,
  progress,
  onPress,
}: {
  label: string;
  holding: boolean;
  progress: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={holding}
      style={[styles.holdBtn, grad(GRADIENTS.accent, C.accent)]}
    >
      <View style={[styles.holdFill, { width: `${Math.min(100, progress)}%` as unknown as number }]} />
      <View style={styles.holdContent}>
        <MapPin size={16} color="#241a08" strokeWidth={2.2} />
        <Text style={styles.holdText}>{holding ? `Holding ${progress}%` : label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 6, paddingHorizontal: 18, paddingBottom: 26 },
  errorText: {
    marginTop: 10,
    fontFamily: F.manrope,
    fontSize: 13,
    color: C.red,
    textAlign: 'center',
  },
  focusBanner: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(232,198,106,0.4)',
    backgroundColor: 'rgba(232,198,106,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  focusBannerText: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '700',
    color: C.amber,
    textAlign: 'center',
  },
  otPendingNote: {
    marginTop: 8,
    fontFamily: F.manrope,
    fontSize: 12,
    fontWeight: '600',
    color: C.amber,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(232,198,106,0.35)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pageLabel: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.68,
    color: '#c4b4d8',
  },
  pageTitle: {
    marginTop: 6,
    fontFamily: F.sora,
    fontSize: 28,
    fontWeight: '800',
    color: C.txt,
  },
  idleActions: { gap: 10, marginTop: 14 },
  brief: {
    marginTop: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(183,156,232,0.22)',
    overflow: 'hidden',
    padding: 14,
  },
  briefHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  briefPage: {
    fontFamily: F.manrope,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: C.muted2,
  },
  statusBlock: { alignItems: 'flex-end' },
  statusK: {
    fontFamily: F.manrope,
    fontSize: 10,
    color: C.muted2,
    letterSpacing: 0.6,
  },
  statusV: {
    fontFamily: F.sora,
    fontSize: 15,
    fontWeight: '700',
    color: C.violetL,
    marginTop: 2,
  },
  briefMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 14,
  },
  venueName: {
    fontFamily: F.sora,
    fontSize: 26,
    fontWeight: '800',
    color: C.txt,
    letterSpacing: -0.4,
  },
  shiftMeta: {
    marginTop: 4,
    fontFamily: F.manrope,
    fontSize: 14,
    color: C.prMuted,
  },
  addrRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
  },
  addrText: {
    flex: 1,
    fontFamily: F.manrope,
    fontSize: 13,
    color: C.prMuted2,
    lineHeight: 18,
  },
  assign: {
    marginTop: 10,
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: C.muted2,
  },
  vipRow: { marginTop: 8 },
  vipPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: C.amberBg,
    borderWidth: 1,
    borderColor: 'rgba(232,198,106,0.35)',
  },
  vipText: {
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '700',
    color: C.amber,
  },
  event: {
    marginTop: 10,
    fontFamily: F.manrope,
    fontSize: 14,
    color: C.prMuted,
  },
  tapHint: {
    marginTop: 10,
    fontFamily: F.manrope,
    fontSize: 13,
    fontWeight: '600',
    color: C.blue,
  },
  mark: {
    width: 52,
    height: 52,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: C.line2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: {
    fontFamily: F.sora,
    fontSize: 22,
    fontWeight: '800',
    color: C.txt,
  },
  briefBody: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  briefBodyLabel: {
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: C.muted2,
  },
  briefBodyValue: {
    marginTop: 2,
    fontFamily: F.manrope,
    fontSize: 14,
    color: C.txt,
  },
  holdBtn: {
    marginTop: 16,
    borderRadius: 14,
    padding: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  holdFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  holdContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  holdText: {
    fontFamily: F.sora,
    fontSize: 18,
    fontWeight: '700',
    color: '#241a08',
  },
  gpsNote: {
    marginTop: 10,
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.prMuted2,
    textAlign: 'center',
  },
  cancelBtn: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line2,
  },
  cancelText: {
    fontFamily: F.sora,
    fontSize: 15,
    fontWeight: '600',
    color: C.txt,
  },
  onDutyMoney: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  onDutyLabel: { fontFamily: F.manrope, fontSize: 13, color: C.muted },
  onDutyAmt: { fontFamily: F.sora, fontSize: 18, fontWeight: '800', color: C.accentL },
  completeHero: {
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(93,217,160,0.3)',
    backgroundColor: C.greenBg,
    gap: 10,
  },
  completeMoney: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 12,
  },
  completeAmt: {
    fontFamily: F.sora,
    fontSize: 26,
    fontWeight: '800',
    color: C.accentL,
    letterSpacing: -0.4,
  },
  completeDuration: {
    marginTop: 4,
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.prMuted,
  },
  sheetBackdrop: {
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
  sheetMeta: { marginTop: 6, fontFamily: F.manrope, fontSize: 13, color: C.prMuted },
  sheetHint: { marginTop: 8, fontFamily: F.manrope, fontSize: 13, color: C.prMuted2, lineHeight: 18 },
  rulesTitle: {
    marginTop: 14,
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: C.muted2,
  },
  ruleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  ruleLabel: { fontFamily: F.manrope, fontSize: 13, color: C.prMuted },
  ruleOutcome: { fontFamily: F.sora, fontSize: 13, fontWeight: '700' },
  fieldLabel: {
    marginTop: 12,
    marginBottom: 4,
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: C.prMuted2,
  },
  input: {
    fontFamily: F.sora,
    fontSize: 15,
    fontWeight: '600',
    color: C.txt,
    borderWidth: 1,
    borderColor: C.line2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  dangerBtn: {
    marginTop: 14,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: C.redBg,
    borderWidth: 1,
    borderColor: 'rgba(240,138,138,0.4)',
  },
  dangerBtnText: { fontFamily: F.sora, fontSize: 16, fontWeight: '700', color: C.red },
  sheetCancel: { marginTop: 10, alignItems: 'center', padding: 10 },
  sheetCancelText: { fontFamily: F.sora, fontSize: 14, fontWeight: '600', color: C.muted },
});
