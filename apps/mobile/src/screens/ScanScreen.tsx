/**
 * Receipt Scan — port of InnocenZ-proto `/host/scan`.
 * Camera/OCR simulated; self-log drinks/tips write into the active shift session.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { C, F, GRADIENTS, grad } from '../theme/theme';
import { formatRM } from '../lib/demo-shifts';
import { getDrinkMenuForOutlet } from '../lib/outlet-drink-menu';
import { fmtAttendanceStamp, useShiftSession } from '../lib/shift-session';
import { usePrNav, type ScanCategory, type ScanMode } from '../lib/pr-nav';
import { TopBar } from '../components/TopBar';
import {
  Camera,
  Check,
  Pencil,
  Shield,
  Wine,
} from '../components/icons';

type Phase = 'idle' | 'scanning' | 'review' | 'manual' | 'logged';

function shiftPvId(outlet: string, date: [number, number, number]) {
  const [y, m, d] = date;
  const slug = outlet.replace(/[^a-zA-Z0-9]+/g, '').toUpperCase().slice(0, 10);
  return `PV-SHIFT-${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}-${slug || 'OUTLET'}`;
}

export function ScanScreen({
  category,
  mode,
  editId,
}: {
  category: ScanCategory;
  mode: ScanMode;
  editId?: string;
}) {
  const { goBack, setTab } = usePrNav();
  const {
    phase: attendance,
    shift,
    checkedInAt,
    addReceiptLog,
    logs,
    deleteReceiptLog,
  } = useShiftSession();
  const onDuty = attendance === 'on_duty';

  const [phase, setPhase] = useState<Phase>(() =>
    mode === 'selflog' || editId ? 'manual' : 'idle',
  );
  const [amount, setAmount] = useState(category === 'tips' ? '50' : '125');
  const [note, setNote] = useState('Receipt water-damaged / OCR unreadable');

  const pvId = useMemo(() => shiftPvId(shift.outlet, shift.date), [shift.outlet, shift.date]);
  const drinkMenu = useMemo(() => getDrinkMenuForOutlet(shift.outlet), [shift.outlet]);
  const categoryLabel = category === 'tips' ? 'Tips' : 'Drinks';

  const pageTitle = editId
    ? 'Edit self-log'
    : phase === 'manual' && mode === 'selflog'
      ? `Self-log ${categoryLabel.toLowerCase()}`
      : `Scan ${categoryLabel.toLowerCase()} receipt`;

  const [drinkQtys, setDrinkQtys] = useState<Record<string, number>>({});
  const [ocrItem, setOcrItem] = useState('Cosmo');
  const [ocrAmount, setOcrAmount] = useState(150);

  useEffect(() => {
    setDrinkQtys((prev) => {
      const next: Record<string, number> = {};
      for (const d of drinkMenu) next[d.id] = prev[d.id] ?? 0;
      return next;
    });
  }, [drinkMenu]);

  useEffect(() => {
    if (!editId) return;
    const existing = logs.find((l) => l.id === editId);
    if (!existing) return;
    setPhase('manual');
    setAmount(String(existing.amount));
  }, [editId, logs]);

  const drinkTotal = drinkMenu.reduce(
    (s, d) => s + d.priceRm * (drinkQtys[d.id] ?? 0),
    0,
  );
  const drinkCommission = Math.round(drinkTotal * 0.15 * 100) / 100;

  const startScan = () => {
    setPhase('scanning');
    setTimeout(() => {
      const first = drinkMenu[0];
      setOcrItem(category === 'tips' ? 'Guest tip' : first?.name ?? 'Cosmo');
      setOcrAmount(category === 'tips' ? 50 : first?.priceRm ?? 150);
      setPhase('review');
    }, 900);
  };

  const confirmOcr = () => {
    if (editId) deleteReceiptLog(editId);
    addReceiptLog({
      category,
      item: ocrItem,
      qty: 1,
      amount: ocrAmount,
      commission:
        category === 'tips'
          ? Math.round(ocrAmount * 0.1 * 100) / 100
          : Math.round(ocrAmount * 0.15 * 100) / 100,
      source: 'Receipt scan',
    });
    setPhase('logged');
  };

  const submitManual = () => {
    if (editId) deleteReceiptLog(editId);
    if (category === 'drinks') {
      const items = drinkMenu.filter((d) => (drinkQtys[d.id] ?? 0) > 0);
      if (items.length === 0) {
        const amt = Number(amount) || 0;
        if (amt <= 0) return;
        addReceiptLog({
          category: 'drinks',
          item: 'Manual drink total',
          qty: 1,
          amount: amt,
          commission: Math.round(amt * 0.15 * 100) / 100,
          source: 'Manual entry',
        });
      } else {
        for (const d of items) {
          const qty = drinkQtys[d.id] ?? 0;
          const amt = d.priceRm * qty;
          addReceiptLog({
            category: 'drinks',
            item: d.name,
            qty,
            amount: amt,
            commission: Math.round(amt * 0.15 * 100) / 100,
            source: 'Manual entry',
          });
        }
      }
    } else {
      const amt = Number(amount) || 0;
      addReceiptLog({
        category: 'tips',
        item: 'Guest tip',
        qty: 1,
        amount: amt,
        commission: Math.round(amt * 0.1 * 100) / 100,
        source: 'Manual entry',
      });
    }
    setPhase('logged');
  };

  return (
    <View style={styles.screen}>
      <TopBar onOpenProfile={() => setTab('profile')} />

      <View style={styles.titleRow}>
        {category === 'drinks' ? (
          <Wine size={22} color={C.goldL} />
        ) : (
          <Camera size={22} color={C.goldL} />
        )}
        <Text style={styles.pageTitle}>{pageTitle}</Text>
      </View>
      <Text style={styles.pageSub}>
        {editId
          ? 'Update amount or note — agency is notified again for verification.'
          : 'Receipts scanned between Time-In and Time-Out attach to one PV for that shift only.'}
      </Text>

      {!onDuty ? (
        <View style={styles.gate}>
          <Shield size={22} color={C.muted} />
          <Text style={styles.gateTitle}>Check in first</Text>
          <Text style={styles.gateBody}>
            Check in on Attendance before scanning receipts.
          </Text>
          <Pressable
            style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
            onPress={() => setTab('checkin')}
          >
            <Text style={[styles.primaryText, { color: '#241a08' }]}>Go to Check-In</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.activeCard}>
            <Text style={styles.activeTitle}>Active shift · {shift.outlet}</Text>
            <Text style={styles.activeMeta}>
              Belongs to <Text style={styles.activeBold}>{pvId}</Text>
              {' · '}
              {logs.length} receipt(s) logged
              {' · '}
              Time-In {fmtAttendanceStamp(checkedInAt)}
            </Text>
          </View>

          <View style={styles.card}>
            {(phase === 'idle' || phase === 'scanning' || phase === 'review') && (
              <View style={styles.scanBox}>
                {phase === 'idle' && (
                  <Text style={styles.scanIdleHint}>Tap scan to capture a receipt</Text>
                )}
                {phase === 'scanning' && (
                  <>
                    <ActivityIndicator color={C.violetL} size="large" />
                    <Text style={styles.scanScanning}>Scanning… reading OCR fields</Text>
                  </>
                )}
                {phase === 'review' && (
                  <View style={styles.ocrBlock}>
                    <Text style={styles.ocrHead}>— OCR EXTRACTED —</Text>
                    <Text style={styles.ocrLine}>Item: {ocrItem}</Text>
                    <Text style={styles.ocrLine}>Outlet: {shift.outlet}</Text>
                    <Text style={styles.ocrLine}>
                      Total logged: <Text style={styles.activeBold}>{formatRM(ocrAmount)}</Text>
                    </Text>
                  </View>
                )}
              </View>
            )}

            {phase === 'review' && (
              <>
                <Text style={styles.cardMeta}>
                  Est. commission{' '}
                  {formatRM(
                    category === 'tips'
                      ? Math.round(ocrAmount * 0.1 * 100) / 100
                      : Math.round(ocrAmount * 0.15 * 100) / 100,
                  )}
                </Text>
                <Pressable
                  style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
                  onPress={confirmOcr}
                >
                  <Camera size={16} color="#241a08" />
                  <Text style={[styles.primaryText, { color: '#241a08' }]}>
                    Confirm &amp; log receipt
                  </Text>
                </Pressable>
                <Pressable style={styles.soft} onPress={() => setPhase('manual')}>
                  <Text style={styles.softAmber}>
                    OCR looks wrong? Self-log {category === 'drinks' ? 'drinks' : 'manually'} instead
                  </Text>
                </Pressable>
              </>
            )}

            {(phase === 'idle' || phase === 'scanning') && (
              <Pressable
                style={[
                  styles.primary,
                  grad(GRADIENTS.accent, C.accent),
                  phase === 'scanning' && { opacity: 0.6 },
                ]}
                onPress={startScan}
                disabled={phase === 'scanning'}
              >
                <Camera size={16} color="#241a08" />
                <Text style={[styles.primaryText, { color: '#241a08' }]}>Scan receipt now</Text>
              </Pressable>
            )}

            {phase === 'manual' && (
              <View>
                <View style={styles.manualPill}>
                  <Text style={styles.manualPillText}>Manual self-log</Text>
                </View>
                <Text style={styles.scanIdleHint}>
                  {category === 'drinks'
                    ? `Select the drink sold and quantity — agency must verify before it counts toward your PV.`
                    : 'Key in the amount yourself — agency must verify before it counts toward your PV.'}
                </Text>
                {category === 'drinks' ? (
                  <>
                    <Text style={styles.fieldLabel}>
                      Drink menu · {shift.outlet} · {drinkMenu.length} drinks
                    </Text>
                    <Text style={styles.menuHint}>
                      Tap +/- for each item sold.
                    </Text>
                    {drinkMenu.map((d) => (
                      <View key={d.id} style={styles.drinkRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.drinkName}>{d.name}</Text>
                          <Text style={styles.drinkUnit}>{formatRM(d.priceRm)} each</Text>
                        </View>
                        <View style={styles.qtyCtrl}>
                          <Pressable
                            style={styles.qtyBtn}
                            onPress={() =>
                              setDrinkQtys((q) => ({
                                ...q,
                                [d.id]: Math.max(0, (q[d.id] ?? 0) - 1),
                              }))
                            }
                          >
                            <Text style={styles.qtyBtnText}>−</Text>
                          </Pressable>
                          <Text style={styles.qtyVal}>{drinkQtys[d.id] ?? 0}</Text>
                          <Pressable
                            style={styles.qtyBtn}
                            onPress={() =>
                              setDrinkQtys((q) => ({
                                ...q,
                                [d.id]: (q[d.id] ?? 0) + 1,
                              }))
                            }
                          >
                            <Text style={styles.qtyBtnText}>+</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                    <Text style={styles.cardMeta}>
                      {drinkTotal > 0
                        ? `Total ${formatRM(drinkTotal)} · Comm ${formatRM(drinkCommission)}`
                        : 'Set quantity for at least one drink to submit.'}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.fieldLabel}>Tip amount (RM)</Text>
                    <TextInput
                      value={amount}
                      onChangeText={setAmount}
                      keyboardType="decimal-pad"
                      style={styles.input}
                      placeholderTextColor={C.muted2}
                    />
                  </>
                )}
                <Text style={styles.fieldLabel}>Note for agency (optional)</Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  style={styles.input}
                  placeholderTextColor={C.muted2}
                />
                <Pressable
                  style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
                  onPress={submitManual}
                >
                  <Pencil size={16} color="#241a08" />
                  <Text style={[styles.primaryText, { color: '#241a08' }]}>
                    {editId ? 'Update self-log' : 'Submit self-log'}
                  </Text>
                </Pressable>
              </View>
            )}

            {phase === 'logged' && (
              <View>
                <View style={styles.okRow}>
                  <Check size={20} color={C.green} />
                  <Text style={styles.okTitle}>Receipt logged</Text>
                </View>
                <Text style={styles.scanIdleHint}>
                  Row added on Check-In STATUS. Self-logs stay pending until agency verifies.
                </Text>
                <Text style={styles.activeMeta}>
                  Belongs to PV: <Text style={styles.activeBold}>{pvId}</Text>
                </Text>
                <View style={styles.loggedActions}>
                  {!editId && (
                    <Pressable style={styles.softBtn} onPress={() => setPhase('idle')}>
                      <Text style={styles.softText}>Scan another</Text>
                    </Pressable>
                  )}
                  <Pressable
                    style={[styles.primary, grad(GRADIENTS.accent, C.accent), { flex: 1 }]}
                    onPress={goBack}
                  >
                    <Text style={[styles.primaryText, { color: '#241a08' }]}>Back to Check-In</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>

          <View style={styles.tipCard}>
            <Shield size={12} color={C.muted} />
            <Text style={styles.tipText}>
              Wrong scan? Open the receipt on Check-In and tap{' '}
              <Text style={styles.activeBold}>Scan again</Text>. Pending self-logs can be{' '}
              <Text style={styles.activeBold}>edited</Text> or{' '}
              <Text style={styles.activeBold}>deleted</Text>.
            </Text>
          </View>

          <Pressable style={styles.softBtn} onPress={goBack}>
            <Text style={styles.softText}>Back to attendance</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 6, paddingHorizontal: 18, paddingBottom: 26 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  pageTitle: {
    flex: 1,
    fontFamily: F.sora,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: C.txt,
  },
  pageSub: {
    marginTop: 4,
    fontFamily: F.manrope,
    fontSize: 12,
    lineHeight: 17,
    color: C.prMuted,
  },
  gate: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  gateTitle: { fontFamily: F.sora, fontSize: 20, fontWeight: '800', color: C.txt },
  gateBody: {
    fontFamily: F.manrope,
    fontSize: 14,
    color: C.prMuted,
    textAlign: 'center',
  },
  activeCard: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(232,194,122,0.35)',
    backgroundColor: 'rgba(232,194,122,0.06)',
    padding: 12,
  },
  activeTitle: {
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '700',
    color: C.goldL,
  },
  activeMeta: {
    marginTop: 6,
    fontFamily: F.manrope,
    fontSize: 12,
    lineHeight: 17,
    color: C.prMuted,
  },
  activeBold: {
    fontFamily: F.sora,
    fontWeight: '700',
    color: C.txt,
  },
  card: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 14,
  },
  scanBox: {
    height: 200,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.panel,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  scanIdleHint: {
    fontFamily: F.manrope,
    fontSize: 12,
    lineHeight: 17,
    color: C.prMuted,
    textAlign: 'center',
  },
  scanScanning: {
    marginTop: 12,
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.violetL,
    textAlign: 'center',
  },
  ocrBlock: { alignSelf: 'stretch' },
  ocrHead: {
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '700',
    color: C.violetL,
    marginBottom: 6,
  },
  ocrLine: {
    fontFamily: F.sora,
    fontSize: 11,
    lineHeight: 17,
    color: C.txt,
  },
  cardMeta: { marginTop: 10, fontFamily: F.manrope, fontSize: 13, color: C.prMuted },
  primary: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    width: '100%',
  },
  primaryText: { fontFamily: F.sora, fontSize: 15, fontWeight: '700', color: C.txt },
  soft: { marginTop: 10, alignItems: 'center', paddingVertical: 6 },
  softAmber: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '600',
    color: C.amber,
    textAlign: 'center',
  },
  softBtn: {
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  softText: { fontFamily: F.sora, fontSize: 14, fontWeight: '600', color: C.prMuted },
  tipCard: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  tipText: {
    flex: 1,
    fontFamily: F.manrope,
    fontSize: 12,
    lineHeight: 17,
    color: C.prMuted,
  },
  manualPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(244,183,64,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(244,183,64,0.35)',
    marginBottom: 8,
  },
  manualPillText: {
    fontFamily: F.sora,
    fontSize: 10,
    fontWeight: '700',
    color: C.amber,
  },
  fieldLabel: {
    marginTop: 12,
    marginBottom: 4,
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: C.prMuted2,
  },
  menuHint: {
    marginBottom: 6,
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.prMuted,
  },
  input: {
    fontFamily: F.sora,
    fontSize: 16,
    fontWeight: '600',
    color: C.txt,
    borderWidth: 1,
    borderColor: C.line2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  drinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  drinkName: { fontFamily: F.sora, fontSize: 14, fontWeight: '700', color: C.txt },
  drinkUnit: { fontFamily: F.manrope, fontSize: 12, color: C.prMuted },
  qtyCtrl: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: { fontFamily: F.sora, fontSize: 18, color: C.txt },
  qtyVal: {
    fontFamily: F.sora,
    fontSize: 16,
    fontWeight: '700',
    color: C.txt,
    minWidth: 20,
    textAlign: 'center',
  },
  okRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  okTitle: { fontFamily: F.sora, fontSize: 18, fontWeight: '800', color: C.txt },
  loggedActions: { flexDirection: 'row', gap: 8, marginTop: 4, alignItems: 'stretch' },
});
