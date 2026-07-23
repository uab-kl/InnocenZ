/**
 * Receipt Scan — port of InnocenZ-proto `/host/scan`.
 * Camera/OCR simulated; self-log drinks/tips write into the active shift session.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { C, F, GRADIENTS, grad } from '../theme/theme';
import { formatRM, todayYmd, ymdToIso } from '../lib/demo-shifts';
import { fmtAttendanceStamp } from '../lib/shift-session';
import { useActiveShift } from '../lib/active-shift';
import { commissionFor as rateCommission, drinkMenuFromAssignment } from '../lib/pr-rate';
import { usePrEarnings } from '../lib/pr-earnings';
import { usePrNav, type ScanCategory, type ScanMode } from '../lib/pr-nav';
import { TopBar } from '../components/TopBar';
import {
  Camera,
  Check,
  ImagePlus,
  Pencil,
  Shield,
  Wine,
  XIcon,
} from '../components/icons';
import { pickProofPhotos } from '../lib/proof-photo';

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
  const { active, phase: attendancePhase } = useActiveShift();
  const { receiptLines, addLine, updateLine } = usePrEarnings();
  const onDuty = attendancePhase === 'on_duty';

  // Stamp every self-logged line with the PR's actual calendar day (device-local
  // "today"), so a receipt logged today counts today — never the shift's
  // scheduled date (the seed dates some shifts a day ahead) and never a UTC day
  // that rolls over at night.
  const todayKey = ymdToIso(...todayYmd());
  const logLine = (input: Parameters<typeof addLine>[0]) =>
    addLine({ lineDate: todayKey, ...input });
  const editLine = (id: string, input: Parameters<typeof updateLine>[1]) =>
    updateLine(id, { lineDate: todayKey, ...input });

  // Real shift context from the active assignment: outlet, its drink menu, and
  // this PR's resolved rate card (drink/tip %, happy-hour window).
  const outlet = active?.outletName ?? 'Outlet';
  const rate = active?.rate ?? null;
  const checkedInAt = active?.checkInAt ?? null;
  const dateYmd = useMemo<[number, number, number]>(() => {
    if (active?.shiftDate) {
      const [y, m, d] = active.shiftDate.split('-').map((n) => Number(n));
      return [y, m, d];
    }
    const now = new Date();
    return [now.getFullYear(), now.getMonth() + 1, now.getDate()];
  }, [active?.shiftDate]);

  const [phase, setPhase] = useState<Phase>(() =>
    mode === 'selflog' || editId ? 'manual' : 'idle',
  );
  const [amount, setAmount] = useState(category === 'tips' ? '50' : '125');
  const [editItem, setEditItem] = useState('');
  const [note, setNote] = useState('Receipt water-damaged / OCR unreadable');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Proof photo(s) for the self-log — mandatory for a new drink self-log.
  const [proofPhotos, setProofPhotos] = useState<string[]>([]);

  const pvId = useMemo(() => shiftPvId(outlet, dateYmd), [outlet, dateYmd]);
  const drinkMenu = useMemo(() => drinkMenuFromAssignment(active?.drinkMenu), [active?.drinkMenu]);
  const categoryLabel = category === 'tips' ? 'Tips' : 'Drinks';

  const pageTitle = editId
    ? 'Edit self-log'
    : phase === 'manual' && mode === 'selflog'
      ? `Self-log ${categoryLabel.toLowerCase()}`
      : `Scan ${categoryLabel.toLowerCase()} receipt`;

  const [drinkQtys, setDrinkQtys] = useState<Record<string, number>>({});
  // When editing a menu drink, show the drink picker pre-filled with its
  // previous quantity; tips (and free-typed "manual total" drinks) edit the
  // single amount field instead.
  const [editMenuMode, setEditMenuMode] = useState(false);
  const [ocrItem, setOcrItem] = useState('Cosmo');
  const [ocrAmount, setOcrAmount] = useState(150);
  const prefilledFor = useRef<string | null>(null);

  useEffect(() => {
    setDrinkQtys((prev) => {
      const next: Record<string, number> = {};
      for (const d of drinkMenu) next[d.id] = prev[d.id] ?? 0;
      return next;
    });
  }, [drinkMenu]);

  // Prefill the edit form from the existing line — ONCE per editId, so a later
  // provider refresh doesn't clobber the quantities the user is adjusting.
  useEffect(() => {
    if (!editId) return;
    if (prefilledFor.current === editId) return;
    const existing = receiptLines.find((l) => l.id === editId);
    if (!existing) return;
    prefilledFor.current = editId;
    setPhase('manual');
    setEditItem(existing.item);
    const menuDrink =
      existing.kind === 'drinks'
        ? drinkMenu.find((d) => d.name === existing.item)
        : undefined;
    if (menuDrink) {
      // Restore which drink + how many were logged.
      setDrinkQtys((q) => ({ ...q, [menuDrink.id]: existing.quantity || 1 }));
      setEditMenuMode(true);
    } else {
      // Tips, or a drink not on the current menu — edit the amount directly.
      setAmount(String(existing.sales));
      setEditMenuMode(false);
    }
  }, [editId, receiptLines, drinkMenu]);

  // Whether the drink picker (vs the single amount field) is shown. The outlet's
  // real drink menu drives it; when the outlet hasn't configured one, fall back
  // to the manual amount field so the PR can still self-log a drink total.
  const showDrinkMenu =
    category === 'drinks' && drinkMenu.length > 0 && (!editId || editMenuMode);

  // A drink self-log needs photo proof BEFORE it can be submitted (agency
  // verifies against it). Not required for OCR scans, tips, or edits.
  const proofRequired = mode === 'selflog' && category === 'drinks' && !editId;
  const missingProof = proofRequired && proofPhotos.length === 0;

  // Commission at this PR's real tier rate (happy-hour aware); falls back to the
  // prototype flat rates only when the outlet has no rate card configured.
  const commissionFor = (cat: ScanCategory, sales: number) => rateCommission(cat, sales, rate);

  const drinkTotal = drinkMenu.reduce(
    (s, d) => s + d.priceRm * (drinkQtys[d.id] ?? 0),
    0,
  );
  const drinkCommission = commissionFor('drinks', drinkTotal);

  // A drink self-log needs BOTH a quantity/amount AND a proof photo before it
  // can be submitted (the user's rule: pick drinks + snap pic, then submit).
  const hasDrinkAmount = showDrinkMenu ? drinkTotal > 0 : Number(amount) > 0;
  const drinkIncomplete = proofRequired && !hasDrinkAmount;

  const startScan = () => {
    setPhase('scanning');
    setTimeout(() => {
      const first = drinkMenu[0];
      setOcrItem(category === 'tips' ? 'Guest tip' : first?.name ?? 'Cosmo');
      setOcrAmount(category === 'tips' ? 50 : first?.priceRm ?? 150);
      setPhase('review');
    }, 900);
  };

  // Persist to the current-week draft voucher; only flip to `logged` on success.
  const runSubmit = async (fn: () => Promise<void>) => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await fn();
      setPhase('logged');
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Could not save. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmOcr = () =>
    void runSubmit(async () => {
      const input = {
        kind: category,
        source: 'scan' as const,
        item: ocrItem,
        quantity: 1,
        sales: ocrAmount,
        commission: commissionFor(category, ocrAmount),
        outlet: outlet,
      };
      if (editId) await editLine(editId, input);
      else await logLine(input);
    });

  const submitManual = () =>
    void runSubmit(async () => {
      // Editing one existing row — update it in place (fixes the drinks-edit
      // path that used to rebuild the row and lose its detail).
      if (editId) {
        if (editMenuMode) {
          // Drink edit: recompute from the (restored, then adjusted) quantities.
          const items = drinkMenu.filter((d) => (drinkQtys[d.id] ?? 0) > 0);
          if (items.length === 0) throw new Error('Set a drink quantity first.');
          const [first, ...rest] = items;
          const firstQty = drinkQtys[first.id] ?? 0;
          const firstAmt = first.priceRm * firstQty;
          await editLine(editId, {
            kind: 'drinks',
            source: 'manual',
            item: first.name,
            quantity: firstQty,
            sales: firstAmt,
            commission: commissionFor('drinks', firstAmt),
            outlet: outlet,
          });
          // Any extra drinks the user added during the edit become new rows.
          for (const d of rest) {
            const qty = drinkQtys[d.id] ?? 0;
            const amt = d.priceRm * qty;
            await logLine({
              kind: 'drinks',
              source: 'manual',
              item: d.name,
              quantity: qty,
              sales: amt,
              commission: commissionFor('drinks', amt),
              outlet: outlet,
            });
          }
          return;
        }
        const amt = Number(amount) || 0;
        await editLine(editId, {
          kind: category,
          source: 'manual',
          item: editItem || (category === 'tips' ? 'Guest tip' : 'Manual drink total'),
          quantity: 1,
          sales: amt,
          commission: commissionFor(category, amt),
          outlet: outlet,
        });
        return;
      }
      if (category === 'drinks') {
        // Proof photo is mandatory (the submit button is already gated on this;
        // this is the backstop so a drink self-log can never persist without it).
        if (proofRequired && proofPhotos.length === 0) {
          throw new Error('Snap a proof photo before you submit.');
        }
        // The proof belongs to the whole self-log — attach it to the first line
        // created; the agency verifies the receipt against that row.
        const proof = proofPhotos.length ? proofPhotos : undefined;
        const items = drinkMenu.filter((d) => (drinkQtys[d.id] ?? 0) > 0);
        if (items.length === 0) {
          const amt = Number(amount) || 0;
          if (amt <= 0) throw new Error('Set a drink quantity or amount first.');
          await logLine({
            kind: 'drinks',
            source: 'manual',
            item: 'Manual drink total',
            quantity: 1,
            sales: amt,
            commission: commissionFor('drinks', amt),
            outlet: outlet,
            proofPhotos: proof,
          });
        } else {
          for (let i = 0; i < items.length; i++) {
            const d = items[i];
            const qty = drinkQtys[d.id] ?? 0;
            const amt = d.priceRm * qty;
            await logLine({
              kind: 'drinks',
              source: 'manual',
              item: d.name,
              quantity: qty,
              sales: amt,
              commission: commissionFor('drinks', amt),
              outlet: outlet,
              proofPhotos: i === 0 ? proof : undefined,
            });
          }
        }
      } else {
        const amt = Number(amount) || 0;
        await logLine({
          kind: 'tips',
          source: 'manual',
          item: 'Guest tip',
          quantity: 1,
          sales: amt,
          commission: commissionFor('tips', amt),
          outlet: outlet,
        });
      }
    });

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
            <Text style={styles.activeTitle}>Active shift · {outlet}</Text>
            <Text style={styles.activeMeta}>
              Belongs to <Text style={styles.activeBold}>{pvId}</Text>
              {' · '}
              {receiptLines.length} receipt(s) logged
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
                    <Text style={styles.ocrLine}>Outlet: {outlet}</Text>
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
                  Est. commission {formatRM(commissionFor(category, ocrAmount))}
                </Text>
                <Pressable
                  style={[styles.primary, grad(GRADIENTS.accent, C.accent), submitting && { opacity: 0.6 }]}
                  onPress={confirmOcr}
                  disabled={submitting}
                >
                  <Camera size={16} color="#241a08" />
                  <Text style={[styles.primaryText, { color: '#241a08' }]}>
                    {submitting ? 'Saving…' : 'Confirm & log receipt'}
                  </Text>
                </Pressable>
                {submitError && <Text style={styles.errorText}>{submitError}</Text>}
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
                  {showDrinkMenu
                    ? `Select the drink sold and quantity — agency must verify before it counts toward your PV.`
                    : 'Key in the amount yourself — agency must verify before it counts toward your PV.'}
                </Text>
                {showDrinkMenu ? (
                  <>
                    <Text style={styles.fieldLabel}>
                      Drink menu · {outlet} · {drinkMenu.length} drinks
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
                    <Text style={styles.fieldLabel}>
                      {category === 'tips' ? 'Tip amount (RM)' : 'Drink amount (RM)'}
                    </Text>
                    <TextInput
                      value={amount}
                      onChangeText={setAmount}
                      keyboardType="decimal-pad"
                      style={styles.input}
                      placeholderTextColor={C.muted2}
                    />
                  </>
                )}
                {proofRequired && (
                  <View style={styles.proofBox}>
                    <View style={styles.proofHeadRow}>
                      <Camera size={16} color={C.goldL} />
                      <Text style={styles.proofTitle}>Proof photo · required</Text>
                    </View>
                    <Text style={styles.proofHint}>
                      Snap the receipt / drinks as proof before you submit — the agency verifies
                      your self-log against it. You can attach more than one.
                    </Text>
                    <Pressable
                      style={styles.proofBtn}
                      onPress={() =>
                        pickProofPhotos((urls) =>
                          setProofPhotos((prev) => [...prev, ...urls].slice(0, 6)),
                        )
                      }
                    >
                      <ImagePlus size={16} color={C.txt} />
                      <Text style={styles.proofBtnText}>
                        {proofPhotos.length ? 'Add another photo' : 'Take / attach photo'}
                      </Text>
                    </Pressable>
                    {proofPhotos.length > 0 ? (
                      <View style={styles.proofThumbs}>
                        {proofPhotos.map((src, i) => (
                          <View key={`${i}-${src.slice(0, 24)}`} style={styles.proofThumb}>
                            <Image source={{ uri: src }} style={styles.proofImg} />
                            <Pressable
                              style={styles.proofRemove}
                              onPress={() =>
                                setProofPhotos((prev) => prev.filter((_, idx) => idx !== i))
                              }
                              hitSlop={6}
                            >
                              <XIcon size={12} color={C.txt} />
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.proofReminder}>
                        ⚠ No photo yet — snap one to enable Submit.
                      </Text>
                    )}
                  </View>
                )}

                <Text style={styles.fieldLabel}>Note for agency (optional)</Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  style={styles.input}
                  placeholderTextColor={C.muted2}
                />
                <Pressable
                  style={[
                    styles.primary,
                    grad(GRADIENTS.accent, C.accent),
                    (submitting || missingProof || drinkIncomplete) && { opacity: 0.6 },
                  ]}
                  onPress={submitManual}
                  disabled={submitting || missingProof || drinkIncomplete}
                >
                  <Pencil size={16} color="#241a08" />
                  <Text style={[styles.primaryText, { color: '#241a08' }]}>
                    {submitting
                      ? 'Saving…'
                      : drinkIncomplete && missingProof
                        ? 'Add drinks + proof to submit'
                        : drinkIncomplete
                          ? 'Set a drink quantity'
                          : missingProof
                            ? 'Snap proof to submit'
                            : editId
                              ? 'Update self-log'
                              : 'Submit self-log'}
                  </Text>
                </Pressable>
                {submitError && <Text style={styles.errorText}>{submitError}</Text>}
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
  errorText: {
    marginTop: 10,
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.red,
    textAlign: 'center',
  },
  proofBox: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(232,194,122,0.35)',
    backgroundColor: 'rgba(232,194,122,0.06)',
    padding: 12,
  },
  proofHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  proofTitle: {
    fontFamily: F.sora,
    fontSize: 13,
    fontWeight: '800',
    color: C.goldL,
  },
  proofHint: {
    marginTop: 6,
    fontFamily: F.manrope,
    fontSize: 12,
    lineHeight: 17,
    color: C.prMuted,
  },
  proofBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  proofBtnText: { fontFamily: F.sora, fontSize: 13, fontWeight: '600', color: C.txt },
  proofThumbs: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  proofThumb: {
    width: 68,
    height: 68,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  proofImg: { width: '100%', height: '100%' },
  proofRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6,3,12,0.72)',
    borderWidth: 1,
    borderColor: C.line2,
  },
  proofReminder: {
    marginTop: 10,
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '600',
    color: C.amber,
  },
});
