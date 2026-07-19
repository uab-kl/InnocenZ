/**
 * Receipt Scan — port of InnocenZ-proto `/host/scan`.
 * Camera/OCR simulated; self-log drinks/tips write into the active shift session.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, F, GRADIENTS, grad } from '../theme/theme';
import { formatRM } from '../lib/demo-shifts';
import { useShiftSession } from '../lib/shift-session';
import { usePrNav, type ScanCategory, type ScanMode } from '../lib/pr-nav';
import { Camera, Check, ChevronLeft, Pencil, Shield } from '../components/icons';

type Phase = 'idle' | 'scanning' | 'review' | 'manual' | 'logged';

const DRINK_MENU = [
  { id: 'hennessy', label: 'Hennessy VSOP', unit: 280 },
  { id: 'moet', label: 'Moët & Chandon', unit: 320 },
  { id: 'grey', label: 'Grey Goose', unit: 250 },
  { id: 'beer', label: 'Premium Beer', unit: 45 },
];

export function ScanScreen({
  category,
  mode,
  editId,
}: {
  category: ScanCategory;
  mode: ScanMode;
  editId?: string;
}) {
  const { goBack } = usePrNav();
  const { phase: attendance, shift, addReceiptLog, logs, deleteReceiptLog } = useShiftSession();
  const onDuty = attendance === 'on_duty';

  const [phase, setPhase] = useState<Phase>(() =>
    mode === 'selflog' || editId ? 'manual' : 'idle',
  );
  const [amount, setAmount] = useState(category === 'tips' ? '50' : '125');
  const [note, setNote] = useState('Receipt water-damaged / OCR unreadable');
  const [drinkQtys, setDrinkQtys] = useState<Record<string, number>>(() =>
    Object.fromEntries(DRINK_MENU.map((d) => [d.id, 0])),
  );
  const [ocrItem, setOcrItem] = useState('Hennessy VSOP');
  const [ocrAmount, setOcrAmount] = useState(125);

  useEffect(() => {
    if (!editId) return;
    const existing = logs.find((l) => l.id === editId);
    if (!existing) return;
    setPhase('manual');
    if (existing.category === 'tips') setAmount(String(existing.amount));
    else setAmount(String(existing.amount));
  }, [editId, logs]);

  if (!onDuty) {
    return (
      <View style={styles.screen}>
        <BackHeader title="Scan receipt" onBack={goBack} />
        <View style={styles.gate}>
          <Shield size={22} color={C.muted} />
          <Text style={styles.gateTitle}>Check in first</Text>
          <Text style={styles.gateBody}>
            Receipt scans only attach to your current on-duty shift.
          </Text>
          <Pressable style={styles.primary} onPress={goBack}>
            <Text style={styles.primaryText}>Back to Check-In</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const drinkTotal = DRINK_MENU.reduce(
    (s, d) => s + d.unit * (drinkQtys[d.id] ?? 0),
    0,
  );
  const drinkCommission = Math.round(drinkTotal * 0.15 * 100) / 100;

  const startScan = () => {
    setPhase('scanning');
    setTimeout(() => {
      // ~demo OCR: always succeed for pass-through
      setOcrItem(category === 'tips' ? 'Guest tip' : 'Hennessy VSOP');
      setOcrAmount(category === 'tips' ? 50 : 125);
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
      const items = DRINK_MENU.filter((d) => (drinkQtys[d.id] ?? 0) > 0);
      if (items.length === 0 && drinkTotal <= 0) {
        // fall back to amount field
        const amt = Number(amount) || 0;
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
          const amt = d.unit * qty;
          addReceiptLog({
            category: 'drinks',
            item: d.label,
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
      <BackHeader
        title={`${mode === 'selflog' ? 'Self-log' : 'Scan'} · ${category === 'tips' ? 'Tips' : 'Drinks'}`}
        onBack={goBack}
      />
      <Text style={styles.outlet}>{shift.outlet}</Text>

      {phase === 'idle' && (
        <View style={styles.scanBox}>
          <Camera size={36} color={C.goldL} />
          <Text style={styles.scanTitle}>Point at the receipt</Text>
          <Text style={styles.scanHint}>
            Camera temporarily bypassed — tap Scan to run demo OCR.
          </Text>
          <Pressable style={[styles.primary, grad(GRADIENTS.accent, C.accent)]} onPress={startScan}>
            <Camera size={16} color="#241a08" />
            <Text style={[styles.primaryText, { color: '#241a08' }]}>Scan</Text>
          </Pressable>
          <Pressable
            style={styles.soft}
            onPress={() => setPhase('manual')}
          >
            <Pencil size={14} color={C.txt} />
            <Text style={styles.softText}>Self-log instead</Text>
          </Pressable>
        </View>
      )}

      {phase === 'scanning' && (
        <View style={styles.scanBox}>
          <ActivityIndicator color={C.gold} size="large" />
          <Text style={styles.scanTitle}>Reading receipt…</Text>
        </View>
      )}

      {phase === 'review' && (
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>OCR REVIEW</Text>
          <Text style={styles.cardTitle}>{ocrItem}</Text>
          <Text style={styles.cardAmt}>{formatRM(ocrAmount)}</Text>
          <Text style={styles.cardMeta}>
            Est. commission{' '}
            {formatRM(
              category === 'tips'
                ? Math.round(ocrAmount * 0.1 * 100) / 100
                : Math.round(ocrAmount * 0.15 * 100) / 100,
            )}
          </Text>
          <Pressable style={[styles.primary, grad(GRADIENTS.accent, C.accent)]} onPress={confirmOcr}>
            <Check size={16} color="#241a08" />
            <Text style={[styles.primaryText, { color: '#241a08' }]}>Confirm &amp; log</Text>
          </Pressable>
          <Pressable style={styles.soft} onPress={() => setPhase('manual')}>
            <Text style={styles.softText}>Looks wrong — self-log</Text>
          </Pressable>
        </View>
      )}

      {phase === 'manual' && (
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>SELF-LOG · PENDING AGENCY</Text>
          {category === 'drinks' ? (
            <>
              <Text style={styles.fieldLabel}>Drink menu · {shift.outlet}</Text>
              {DRINK_MENU.map((d) => (
                <View key={d.id} style={styles.drinkRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.drinkName}>{d.label}</Text>
                    <Text style={styles.drinkUnit}>{formatRM(d.unit)}</Text>
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
                Total {formatRM(drinkTotal)} · Comm {formatRM(drinkCommission)}
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
          <Text style={styles.fieldLabel}>Reason</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            style={styles.input}
            placeholderTextColor={C.muted2}
          />
          <Pressable style={[styles.primary, grad(GRADIENTS.accent, C.accent)]} onPress={submitManual}>
            <Text style={[styles.primaryText, { color: '#241a08' }]}>
              {editId ? 'Update self-log' : 'Submit self-log'}
            </Text>
          </Pressable>
        </View>
      )}

      {phase === 'logged' && (
        <View style={styles.card}>
          <View style={styles.okRow}>
            <Check size={20} color={C.green} />
            <Text style={styles.okTitle}>Logged to shift</Text>
          </View>
          <Text style={styles.scanHint}>
            Row added on Check-In STATUS. Self-logs stay pending until agency verifies.
          </Text>
          <Pressable style={[styles.primary, grad(GRADIENTS.accent, C.accent)]} onPress={goBack}>
            <Text style={[styles.primaryText, { color: '#241a08' }]}>Back to Check-In</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function BackHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <Pressable style={styles.back} onPress={onBack}>
      <ChevronLeft size={20} color={C.goldL} />
      <Text style={styles.backText}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 10, paddingHorizontal: 18, paddingBottom: 26 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  backText: { fontFamily: F.sora, fontSize: 16, fontWeight: '700', color: C.txt },
  outlet: { fontFamily: F.manrope, fontSize: 13, color: C.prMuted, marginBottom: 12 },
  gate: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  gateTitle: { fontFamily: F.sora, fontSize: 20, fontWeight: '800', color: C.txt },
  gateBody: { fontFamily: F.manrope, fontSize: 14, color: C.prMuted, textAlign: 'center' },
  scanBox: {
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.line2,
    borderRadius: 18,
    padding: 28,
    gap: 10,
  },
  scanTitle: { fontFamily: F.sora, fontSize: 18, fontWeight: '800', color: C.txt },
  scanHint: {
    fontFamily: F.manrope,
    fontSize: 13,
    color: C.prMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 16,
  },
  cardEyebrow: {
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: C.muted2,
  },
  cardTitle: {
    marginTop: 8,
    fontFamily: F.sora,
    fontSize: 22,
    fontWeight: '800',
    color: C.txt,
  },
  cardAmt: {
    marginTop: 4,
    fontFamily: F.sora,
    fontSize: 28,
    fontWeight: '800',
    color: C.accentL,
  },
  cardMeta: { marginTop: 8, fontFamily: F.manrope, fontSize: 13, color: C.prMuted },
  primary: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    backgroundColor: C.glass2,
    borderWidth: 1,
    borderColor: C.line2,
  },
  primaryText: { fontFamily: F.sora, fontSize: 16, fontWeight: '700', color: C.txt },
  soft: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  softText: { fontFamily: F.sora, fontSize: 14, fontWeight: '600', color: C.prMuted },
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
  qtyVal: { fontFamily: F.sora, fontSize: 16, fontWeight: '700', color: C.txt, minWidth: 20, textAlign: 'center' },
  okRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  okTitle: { fontFamily: F.sora, fontSize: 20, fontWeight: '800', color: C.txt },
});
