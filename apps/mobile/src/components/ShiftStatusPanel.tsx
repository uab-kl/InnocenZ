/**
 * On-duty shift status — port of InnocenZ-proto `PrShiftStatusPanel`
 * Scan / Self-log navigate to `/host/scan` equivalent (ScanScreen).
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, F } from '../theme/theme';
import { formatRM } from '../lib/demo-shifts';
import {
  fmtAttendanceStamp,
  shiftCommissionTotal,
  shiftDurationLabel,
  shiftPayoutTotal,
  useShiftSession,
  type ReceiptLog,
} from '../lib/shift-session';
import { usePrNav } from '../lib/pr-nav';
import {
  Camera,
  Check,
  ChevronDown,
  Clock,
  HelpCircle,
  MapPin,
  Pencil,
  Shield,
  Trash2,
} from './icons';

export function ShiftStatusPanel({ checkedOut }: { checkedOut: boolean }) {
  const { openScan } = usePrNav();
  const {
    checkedInAt,
    checkedOutAt,
    logs,
    tierTargetRm,
    dutyWagesRm,
    prTier,
    deleteReceiptLog,
  } = useShiftSession();

  const [statusOpen, setStatusOpen] = useState(true);

  const salesLogged = useMemo(
    () => logs.reduce((s, l) => s + l.amount, 0),
    [logs],
  );
  const commissionTotal = useMemo(() => shiftCommissionTotal(logs), [logs]);
  const payoutTotal = useMemo(
    () => shiftPayoutTotal(dutyWagesRm, logs),
    [dutyWagesRm, logs],
  );
  const pendingCount = logs.filter((l) => l.pending).length;
  const wagesFinalized = checkedOut;

  const remaining = Math.max(0, tierTargetRm - salesLogged);
  const targetMet = remaining <= 0;
  const targetPct = Math.min(100, tierTargetRm > 0 ? (salesLogged / tierTargetRm) * 100 : 0);
  const durationLabel = checkedOut
    ? shiftDurationLabel(checkedInAt, checkedOutAt)
    : 'In progress';

  const statusHint =
    logs.length === 0
      ? 'Use Scan receipt — each log adds a row below. Tap to collapse.'
      : pendingCount > 0
        ? `${pendingCount} receipt${pendingCount !== 1 ? 's' : ''} pending verification in Payment`
        : `${logs.length} receipt${logs.length !== 1 ? 's' : ''} matched · PV ready`;

  return (
    <View style={styles.root}>
      <View style={styles.times}>
        <TimeCell
          icon={MapPin}
          label="CHECK-IN"
          value={fmtAttendanceStamp(checkedInAt)}
        />
        <TimeCell
          label="CHECK-OUT"
          value={checkedOut ? fmtAttendanceStamp(checkedOutAt) : 'Pending'}
        />
        <TimeCell label="DURATION" value={durationLabel} />
      </View>

      <View style={styles.targets}>
        <Text style={styles.targetsLabel}>
          {targetMet ? 'SHIFT TARGET' : 'TO TARGET'} · {prTier.toUpperCase()}
        </Text>
        <View style={styles.targetPrice}>
          {targetMet ? (
            <>
              <Text style={[styles.targetV, { color: C.green }]}>Met</Text>
              <Text style={styles.targetT}>{formatRM(tierTargetRm)}</Text>
            </>
          ) : (
            <>
              <Text style={styles.targetV}>{formatRM(remaining)}</Text>
              <Text style={styles.targetT}>left · target {formatRM(tierTargetRm)}</Text>
            </>
          )}
        </View>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${targetPct}%` as unknown as number }]} />
        </View>
      </View>

      {!checkedOut && (
        <View style={styles.scanRows}>
          <ScanCategory
            label="Drinks"
            onScan={() => openScan('drinks', 'scan')}
            onSelfLog={() => openScan('drinks', 'selflog')}
          />
          <ScanCategory
            label="Tips"
            onScan={() => openScan('tips', 'scan')}
            onSelfLog={() => openScan('tips', 'selflog')}
          />
        </View>
      )}

      <View style={styles.statusSec}>
        <Pressable style={styles.statusHd} onPress={() => setStatusOpen((o) => !o)}>
          <View style={styles.statusTitleRow}>
            <Text style={styles.statusTitle}>STATUS</Text>
            <HelpCircle size={14} color={C.muted2} />
          </View>
          <ChevronDown
            size={16}
            color={C.goldL}
            style={statusOpen ? { transform: [{ rotate: '180deg' }] } : undefined}
          />
        </Pressable>
        <Text style={styles.statusHint}>{statusHint}</Text>

        {statusOpen && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.table}>
              <View style={styles.trHead}>
                <Text style={[styles.th, styles.colRef]}>REF</Text>
                <Text style={[styles.th, styles.colItem]}>ITEM</Text>
                <Text style={[styles.th, styles.colQty]}>QTY</Text>
                <Text style={[styles.th, styles.colSrc]}>SOURCE</Text>
                <Text style={[styles.th, styles.colComm]}>COMM.</Text>
                <Text style={[styles.th, styles.colVerify]}>VERIFY</Text>
                {!checkedOut && <Text style={[styles.th, styles.colAct]}> </Text>}
              </View>

              <View style={styles.tr}>
                <View style={styles.colRef}>
                  <Text style={styles.tdLabel}>Duty time</Text>
                  <Text style={styles.tdDetail}>{fmtAttendanceStamp(checkedInAt)}</Text>
                  <Text style={styles.tdNote}>
                    − {formatRM(dutyWagesRm)}/shift − paid on shift completion
                  </Text>
                </View>
                <Text style={[styles.td, styles.colItem]}>—</Text>
                <Text style={[styles.td, styles.colQty]}>—</Text>
                <Text style={[styles.td, styles.colSrc]}>Check-in</Text>
                <Text style={[styles.td, styles.colComm]}>—</Text>
                <View style={styles.colVerify}>
                  <View style={styles.badgeSealed}>
                    <Shield size={10} color={C.violetL} />
                    <Text style={styles.badgeSealedText}>Sealed</Text>
                  </View>
                </View>
                {!checkedOut && <View style={styles.colAct} />}
              </View>

              {logs.map((log) => (
                <LogRow
                  key={log.id}
                  log={log}
                  checkedOut={checkedOut}
                  onEdit={() => openScan(log.category, 'selflog', log.id)}
                  onRescan={() => openScan(log.category, 'scan', log.id)}
                  onDelete={() => deleteReceiptLog(log.id)}
                />
              ))}

              <View style={styles.trFoot}>
                <View style={styles.totalsBlock}>
                  <Text style={styles.totalsLabel}>TOTALS</Text>
                  <Text style={styles.totalsHint} numberOfLines={1}>
                    {wagesFinalized
                      ? `Payout ${formatRM(payoutTotal)} · shift pay + commission`
                      : 'Total excluding wages & OT'}
                  </Text>
                </View>
                <Text style={[styles.td, styles.colComm, styles.totalsComm]}>
                  {formatRM(commissionTotal)}
                </Text>
                <View style={styles.colVerify} />
                {!checkedOut && <View style={styles.colAct} />}
              </View>
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

function TimeCell({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: typeof MapPin;
}) {
  return (
    <View style={styles.timeCell}>
      <View style={styles.timeLabelRow}>
        {Icon ? <Icon size={11} color={C.muted2} /> : null}
        <Text style={styles.timeLabel}>{label}</Text>
      </View>
      <Text style={styles.timeValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function ScanCategory({
  label,
  onScan,
  onSelfLog,
}: {
  label: string;
  onScan: () => void;
  onSelfLog: () => void;
}) {
  return (
    <View style={styles.scanCat}>
      <Text style={styles.scanCatLabel}>{label}</Text>
      <Pressable style={styles.scanBtn} onPress={onScan}>
        <Camera size={14} color={C.txt} />
        <Text style={styles.scanBtnText}>Scan</Text>
      </Pressable>
      <Pressable style={[styles.scanBtn, styles.scanBtnSelf]} onPress={onSelfLog}>
        <Pencil size={14} color={C.txt} />
        <Text style={styles.scanBtnText}>Self-log</Text>
      </Pressable>
    </View>
  );
}

function LogRow({
  log,
  checkedOut,
  onEdit,
  onRescan,
  onDelete,
}: {
  log: ReceiptLog;
  checkedOut: boolean;
  onEdit: () => void;
  onRescan: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={[styles.tr, log.pending && styles.trSelflog]}>
      <View style={styles.colRef}>
        <Text style={styles.tdLabel}>
          {log.category === 'tips' ? 'Tip' : 'Drink'} · {formatRM(log.amount)}
        </Text>
        <Text style={styles.tdDetail}>{fmtAttendanceStamp(log.at)}</Text>
      </View>
      <Text style={[styles.td, styles.colItem]} numberOfLines={1}>
        {log.item}
      </Text>
      <Text style={[styles.td, styles.colQty]}>{log.qty}</Text>
      <Text style={[styles.td, styles.colSrc]}>{log.source}</Text>
      <Text style={[styles.td, styles.colComm, { color: C.accentL }]}>
        {formatRM(log.commission)}
      </Text>
      <View style={styles.colVerify}>
        {log.pending ? (
          <View style={styles.badgePending}>
            <Clock size={10} color={C.amber} />
            <Text style={styles.badgePendingText}>Pending</Text>
          </View>
        ) : (
          <View style={styles.badgeMatched}>
            <Check size={10} color={C.green} />
            <Text style={styles.badgeMatchedText}>Matched</Text>
          </View>
        )}
      </View>
      {!checkedOut && (
        <View style={styles.colAct}>
          {log.pending ? (
            <>
              <Pressable onPress={onEdit} hitSlop={6}>
                <Pencil size={13} color={C.goldL} />
              </Pressable>
              <Pressable onPress={onDelete} hitSlop={6}>
                <Trash2 size={13} color={C.red} />
              </Pressable>
            </>
          ) : (
            <Pressable onPress={onRescan} hitSlop={6}>
              <Camera size={13} color={C.goldL} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const COL = {
  ref: 160,
  item: 90,
  qty: 40,
  src: 100,
  comm: 72,
  verify: 88,
  act: 48,
} as const;

const styles = StyleSheet.create({
  root: { marginTop: 14, gap: 12 },
  times: { flexDirection: 'row', gap: 8 },
  timeCell: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 10,
    minHeight: 72,
  },
  timeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeLabel: {
    fontFamily: F.sora,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: C.muted2,
  },
  timeValue: {
    marginTop: 6,
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '700',
    color: C.txt,
    lineHeight: 16,
  },
  targets: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 14,
  },
  targetsLabel: {
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: C.muted,
  },
  targetPrice: { marginTop: 6, flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  targetV: {
    fontFamily: F.sora,
    fontSize: 28,
    fontWeight: '800',
    color: C.violetL,
    letterSpacing: -0.5,
  },
  targetT: { fontFamily: F.manrope, fontSize: 13, color: C.prMuted },
  bar: {
    marginTop: 12,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: C.violet,
  },
  scanRows: { flexDirection: 'row', gap: 10 },
  scanCat: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 12,
    gap: 8,
  },
  scanCatLabel: {
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '700',
    color: C.txt,
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: C.glass2,
  },
  scanBtnSelf: { backgroundColor: 'rgba(183,156,232,0.08)' },
  scanBtnText: { fontFamily: F.sora, fontSize: 13, fontWeight: '600', color: C.txt },
  statusSec: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(255,255,255,0.02)',
    overflow: 'hidden',
  },
  statusHd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  statusTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusTitle: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: C.txt,
  },
  statusHint: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    marginTop: 4,
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.goldL,
  },
  table: { paddingHorizontal: 10, paddingBottom: 12, minWidth: 620 },
  trHead: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line },
  tr: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(232,224,245,0.06)',
  },
  trSelflog: { backgroundColor: 'rgba(232,198,106,0.05)' },
  trFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: C.line2,
    marginTop: 4,
  },
  totalsBlock: {
    width: COL.ref + COL.item + COL.qty + COL.src,
    paddingRight: 8,
    flexShrink: 0,
  },
  totalsLabel: {
    fontFamily: F.sora,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: C.muted,
  },
  totalsHint: {
    marginTop: 2,
    fontFamily: F.manrope,
    fontSize: 11,
    color: C.prMuted2,
  },
  totalsComm: { fontFamily: F.sora, fontWeight: '800', color: C.accentL },
  th: {
    fontFamily: F.sora,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: C.muted2,
  },
  td: { fontFamily: F.manrope, fontSize: 12, color: C.prMuted },
  tdLabel: { fontFamily: F.sora, fontSize: 13, fontWeight: '700', color: C.txt },
  tdDetail: { marginTop: 2, fontFamily: F.manrope, fontSize: 11, color: C.prMuted },
  tdNote: { marginTop: 2, fontFamily: F.manrope, fontSize: 11, color: C.prMuted2 },
  colRef: { width: COL.ref, paddingRight: 8 },
  colItem: { width: COL.item, paddingRight: 6 },
  colQty: { width: COL.qty, paddingRight: 6 },
  colSrc: { width: COL.src, paddingRight: 6 },
  colComm: { width: COL.comm, paddingRight: 6 },
  colVerify: { width: COL.verify, paddingRight: 6 },
  colAct: { width: COL.act, alignItems: 'center', gap: 8 },
  badgeSealed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(183,156,232,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(183,156,232,0.3)',
  },
  badgeSealedText: { fontFamily: F.sora, fontSize: 10, fontWeight: '700', color: C.violetL },
  badgePending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: C.amberBg,
    borderWidth: 1,
    borderColor: 'rgba(232,198,106,0.35)',
  },
  badgePendingText: { fontFamily: F.sora, fontSize: 10, fontWeight: '700', color: C.amber },
  badgeMatched: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: C.greenBg,
    borderWidth: 1,
    borderColor: 'rgba(93,217,160,0.35)',
  },
  badgeMatchedText: { fontFamily: F.sora, fontSize: 10, fontWeight: '700', color: C.green },
});
