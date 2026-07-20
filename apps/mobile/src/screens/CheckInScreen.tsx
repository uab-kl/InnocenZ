/**
 * Check-In — port of InnocenZ-proto `/host/tonight`.
 * GPS + selfie are bypassed so hold-to-check-in / check-out always works.
 */
import React, { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, F, GRADIENTS, grad } from '../theme/theme';
import {
  CANCELLATION_RULE_SUMMARY,
  DEFAULT_AGENCY_NAME,
  GEOFENCE_METERS,
  GPS_BYPASS,
  fmtDFriendly,
  formatRM,
} from '../lib/demo-shifts';
import {
  shiftDurationLabel,
  shiftPayoutTotal,
  useShiftSession,
} from '../lib/shift-session';
import { TopBar } from '../components/TopBar';
import { EmptyDashed, IzButton, Pill } from '../components/ui';
import { ShiftStatusPanel } from '../components/ShiftStatusPanel';
import { MapPin, Sparkles } from '../components/icons';
import type { PrTab } from '../components/BottomNav';

export function CheckInScreen({ onNavigate }: { onNavigate: (tab: PrTab) => void }) {
  const {
    phase,
    shift,
    closedShift,
    checkedInAt,
    checkedOutAt,
    logs,
    dutyWagesRm,
    acceptShift,
    checkIn,
    checkOut,
    cancelShift,
    resetDemo,
  } = useShiftSession();

  const finalPayout =
    closedShift != null ? shiftPayoutTotal(dutyWagesRm, logs) : dutyWagesRm;
  const completeDuration = shiftDurationLabel(checkedInAt, checkedOutAt);

  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [briefOpen, setBriefOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const statusLabel =
    phase === 'on_duty'
      ? 'On duty'
      : phase === 'complete'
        ? 'Complete'
        : phase === 'booked'
          ? 'Booked'
          : 'No shift';

  const startHold = (forCheckout: boolean) => {
    if (holding) return;
    setHolding(true);
    let p = 0;
    timerRef.current = setInterval(() => {
      p += 5;
      setProgress(p);
      if (p >= 100) {
        if (timerRef.current) clearInterval(timerRef.current);
        setHolding(false);
        setProgress(0);
        if (forCheckout) checkOut();
        else checkIn();
      }
    }, 60);
  };

  const confirmCancel = () => {
    if (!cancelReason.trim()) return;
    setCancelOpen(false);
    setCancelReason('');
    cancelShift();
  };

  return (
    <View style={styles.screen}>
      <TopBar onOpenProfile={() => onNavigate('profile')} />

      {phase === 'idle' ? (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.pageLabel}>ATTENDANCE</Text>
          <Text style={styles.pageTitle}>Check in</Text>
          <EmptyDashed>
            Your agency will assign your shift — check in when assigned.
          </EmptyDashed>
          <View style={styles.idleActions}>
            <IzButton
              label="View schedule"
              variant="soft"
              small
              onPress={() => onNavigate('shifts')}
            />
            <IzButton label="Demo shift in" small onPress={acceptShift} />
          </View>
        </View>
      ) : (
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
                <Text style={styles.venueName}>{shift.outlet}</Text>
                <Text style={styles.shiftMeta}>
                  {fmtDFriendly(...shift.date)} · {shift.time}
                </Text>
                <Text style={styles.assign}>
                  AGENCY ASSIGNED · {DEFAULT_AGENCY_NAME.toUpperCase()}
                </Text>
                <View style={styles.vipRow}>
                  <View style={styles.vipPill}>
                    <Sparkles size={12} color={C.amber} />
                    <Text style={styles.vipText}>VIP night</Text>
                  </View>
                </View>
                <Text style={styles.event}>{shift.event}</Text>
                <Text style={styles.tapHint}>{briefOpen ? 'Tap to collapse' : 'Tap to expand'}</Text>
              </View>
              <View style={styles.mark}>
                <Text style={styles.markText}>{shift.outlet.trim()[0]?.toUpperCase()}</Text>
              </View>
            </View>
            {briefOpen && (
              <View style={styles.briefBody}>
                <Text style={styles.briefBodyLabel}>Address</Text>
                <Text style={styles.briefBodyValue}>Bukit Bintang, KL · ~2.4 km away</Text>
                <Text style={[styles.briefBodyLabel, { marginTop: 8 }]}>Dress code</Text>
                <Text style={styles.briefBodyValue}>Black cocktail · heels preferred</Text>
                <Text style={[styles.briefBodyLabel, { marginTop: 8 }]}>Est. payout</Text>
                <Text style={styles.briefBodyValue}>{formatRM(shift.payout)}</Text>
                <Text style={[styles.briefBodyLabel, { marginTop: 8 }]}>Agency note</Text>
                <Text style={styles.briefBodyValue}>
                  Arrive 15 min early · VIP host briefing at door.
                </Text>
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
                Reminder: at the venue, check-in is only allowed within {GEOFENCE_METERS}m of{' '}
                {shift.outlet}
                {GPS_BYPASS ? ' — GPS temporarily bypassed for demo.' : '.'}
              </Text>
              <Pressable style={styles.cancelBtn} onPress={() => setCancelOpen(true)}>
                <Text style={styles.cancelText}>Cancel shift</Text>
              </Pressable>
            </>
          )}

          {phase === 'on_duty' && (
            <>
              <ShiftStatusPanel checkedOut={false} />
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

          {phase === 'complete' && closedShift && (
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
              <ShiftStatusPanel checkedOut />
              <IzButton
                label="Reset attendance demo"
                variant="soft"
                small
                onPress={resetDemo}
                style={{ marginTop: 12 }}
              />
            </>
          )}
        </>
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
              {shift.outlet} · {fmtDFriendly(...shift.date)} · {shift.time}
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
