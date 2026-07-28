/**
 * Receipt Scan — port of InnocenZ-proto `/host/scan`, now with REAL OCR.
 *
 * Scan flow (build steps 2A–2C): snap the receipt with the camera →
 * ML Kit reads the words on the phone (free, offline) → receipt-parser hunts
 * the date + order number and matches item lines against THIS outlet's menu
 * (drinks page ↔ category 'drink'; tips page ↔ 'service' + 'tip') → the PR
 * adjusts quantities and confirms → each item saves through the SAME
 * self-log door (POST /payment-voucher/mine/lines) marked source 'scan',
 * receipt photo attached, deduped by receipt number so the same receipt
 * can't be logged twice.
 *
 * When OCR isn't available (web preview / Expo Go) or can't match anything,
 * it falls back to the manual self-log tap list — photo kept as proof.
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
import {
  commissionFor as rateCommission,
  drinkMenuFromAssignment,
  menuForScanCategory,
  receiptKindForItem,
  type MenuDrink,
} from '../lib/pr-rate';
import { usePrEarnings } from '../lib/pr-earnings';
import { usePrNav, type ScanCategory, type ScanMode } from '../lib/pr-nav';
import { captureReceiptPhoto, recognizeReceiptText } from '../lib/receipt-ocr';
import { parseReceipt } from '../lib/receipt-parser';
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
import { ScannedReceiptsCard } from '../components/ScannedReceiptsCard';

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
  const { active, phase: attendancePhase, refresh: refreshShift } = useActiveShift();
  const { receiptLines, addLine, submitReceipt, updateLine } = usePrEarnings();
  const onDuty = attendancePhase === 'on_duty';

  // Re-pull `/shift-assignment/mine` from the DATABASE every time this screen
  // opens — it carries the shift outlet's live drink/service/tip catalog
  // (outlet_workspace → outlet_drink_menu via FK), so an item the outlet just
  // added in its Workspace is scannable immediately, no re-login needed.
  useEffect(() => {
    void refreshShift();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // REQUIRED for self-logs: what was unclear on the paper (quantity / price /
  // date…) or a confirmation that everything matches. Starts empty on purpose
  // so the PR must actually write it.
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Proof photo(s) for the self-log — mandatory for a new drink self-log.
  const [proofPhotos, setProofPhotos] = useState<string[]>([]);

  const pvId = useMemo(() => shiftPvId(outlet, dateYmd), [outlet, dateYmd]);
  const drinkMenu = useMemo(() => drinkMenuFromAssignment(active?.drinkMenu), [active?.drinkMenu]);
  // The slice of the outlet catalog this page logs: Drinks page ↔ 'drink'
  // items; Tips page ↔ 'service' + 'tip' items (Booking commission, Havoc, Tip).
  const categoryMenu = useMemo(
    () => menuForScanCategory(drinkMenu, category),
    [drinkMenu, category],
  );
  const categoryLabel = category === 'tips' ? 'Tips' : 'Drinks';
  const itemNoun = category === 'tips' ? 'tip / service item' : 'drink';

  const pageTitle = editId
    ? 'Edit self-log'
    : phase === 'manual' && mode === 'selflog'
      ? `Self-log ${categoryLabel.toLowerCase()}`
      : `Scan ${categoryLabel.toLowerCase()} receipt`;

  const [drinkQtys, setDrinkQtys] = useState<Record<string, number>>({});
  // What the LAST real OCR pass read off the receipt.
  const [detectedIds, setDetectedIds] = useState<string[]>([]);
  // What OCR read off the paper (ORD0389) — sent to the server as orderNo.
  const [receiptNo, setReceiptNo] = useState<string | null>(null);
  const [receiptDate, setReceiptDate] = useState<string | null>(null);
  const [receiptTime, setReceiptTime] = useState<string | null>(null);
  // The database-generated running number (RCP-000001) returned on save.
  const [serverReceiptNo, setServerReceiptNo] = useState<string | null>(null);
  // Downscaled receipt photo — attached to the logged line as proof.
  const [receiptShot, setReceiptShot] = useState<string | null>(null);
  // Why the scan fell back to manual (OCR unavailable / nothing matched).
  const [scanIssue, setScanIssue] = useState<string | null>(null);
  const [showAddMissed, setShowAddMissed] = useState(false);
  // When editing a menu item, show the item picker pre-filled with its
  // previous quantity; free-typed amounts edit the single amount field instead.
  const [editMenuMode, setEditMenuMode] = useState(false);
  const prefilledFor = useRef<string | null>(null);

  useEffect(() => {
    setDrinkQtys((prev) => {
      const next: Record<string, number> = {};
      for (const d of categoryMenu) next[d.id] = prev[d.id] ?? 0;
      return next;
    });
  }, [categoryMenu]);

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
    const menuItem = categoryMenu.find((d) => d.name === existing.item);
    if (menuItem) {
      // Restore which item + how many were logged.
      setDrinkQtys((q) => ({ ...q, [menuItem.id]: existing.quantity || 1 }));
      setEditMenuMode(true);
    } else {
      // A line not on the current menu — edit the amount directly.
      setAmount(String(existing.sales));
      setEditMenuMode(false);
    }
  }, [editId, receiptLines, categoryMenu]);

  // Whether the item tap-list (vs the single amount field) is shown. The
  // outlet's real catalog drives it — drinks AND tips/service both get the
  // tap-don't-type list (build steps 2C-3 + 2C-4); when the outlet hasn't
  // configured one, fall back to the manual amount field.
  const showItemMenu = categoryMenu.length > 0 && (!editId || editMenuMode);

  // The scanned receipt photo IS the proof — runScanDetect auto-attaches it,
  // so the menu flow never asks for a second photo. A separate proof photo is
  // only demanded on the no-menu amount fallback (nothing else captures one).
  const proofRequired =
    mode === 'selflog' && category === 'drinks' && !editId && !showItemMenu;
  const missingProof = proofRequired && proofPhotos.length === 0;

  // Commission at this PR's real tier rate (happy-hour aware); falls back to the
  // prototype flat rates only when the outlet has no rate card configured.
  const commissionFor = (cat: ScanCategory, sales: number) => rateCommission(cat, sales, rate);
  /** Commission for one catalog item: drinks use the drink %, everything else the tip %. */
  const commissionForItem = (d: MenuDrink, sales: number) =>
    commissionFor(receiptKindForItem(d) === 'drinks' ? 'drinks' : 'tips', sales);

  const menuTotal = categoryMenu.reduce(
    (s, d) => s + d.priceRm * (drinkQtys[d.id] ?? 0),
    0,
  );
  const menuCommission = categoryMenu.reduce(
    (s, d) => s + commissionForItem(d, d.priceRm * (drinkQtys[d.id] ?? 0)),
    0,
  );

  // A drink self-log needs BOTH a quantity/amount AND a proof photo before it
  // can be submitted (the user's rule: pick drinks + snap pic, then submit).
  const hasItemAmount = showItemMenu ? menuTotal > 0 : Number(amount) > 0;
  const drinkIncomplete = proofRequired && !hasItemAmount;

  const detected = categoryMenu.filter((d) => detectedIds.includes(d.id));
  const undetected = categoryMenu.filter((d) => !detectedIds.includes(d.id));
  const detectedTotal = detected.reduce((s, d) => s + d.priceRm * (drinkQtys[d.id] ?? 0), 0);
  const detectedUnits = detected.reduce((s, d) => s + (drinkQtys[d.id] ?? 0), 0);
  const detectedCommission = detected.reduce(
    (s, d) => s + commissionForItem(d, d.priceRm * (drinkQtys[d.id] ?? 0)),
    0,
  );

  const keepAsProof = (dataUrl: string | null) => {
    if (dataUrl) setProofPhotos((prev) => [...prev, dataUrl].slice(0, 6));
  };

  // Proto-style self-log: item rows appear only AFTER a scan pass (except in
  // edit mode, where the whole list shows so quantities can be adjusted).
  const manualRows = editId ? categoryMenu : detected;
  const manualScanAttempted = receiptShot != null || detectedIds.length > 0;
  // The agency note is REQUIRED on a fresh self-log: what was unclear on the
  // paper, or a confirmation the items & prices match.
  const manualNoteMissing = !editId && note.trim().length === 0;

  // Today's logged receipt lines — feeds the "what have I scanned" gallery.
  const todayReceiptLines = useMemo(
    () => receiptLines.filter((l) => l.lineDate === todayKey),
    [receiptLines, todayKey],
  );

  /**
   * The REAL scan: camera → ML Kit words → parser match against this page's
   * menu slice. `target` is where a successful read lands: 'review' (scan
   * flow) or 'manual' (the "scan to detect" helper inside self-log).
   */
  const runScanDetect = async (target: 'review' | 'manual') => {
    setSubmitError(null);
    setScanIssue(null);
    const shot = await captureReceiptPhoto();
    if (!shot) return; // PR cancelled the camera
    setReceiptShot(shot.dataUrl);
    setPhase('scanning');
    const text = await recognizeReceiptText(shot.uri);
    if (text == null) {
      // OCR engine not in this build (web preview / Expo Go — needs the dev app).
      setScanIssue(
        'On-phone OCR needs the dev app build. Photo kept as proof — self-log the items instead.',
      );
      keepAsProof(shot.dataUrl);
      setPhase('manual');
      return;
    }
    const parsed = parseReceipt(text, categoryMenu);
    // MERGE with earlier passes: a rescan FILLS what's still missing and never
    // wipes a field an earlier shot already read — so the PR can scan the top
    // half (order no), then the bottom half (date + time), and it adds up.
    const mergedOrderNo = parsed.orderNo ?? receiptNo;
    const mergedDate = parsed.date ?? receiptDate;
    const mergedTime = parsed.time ?? receiptTime;
    setReceiptNo(mergedOrderNo);
    setReceiptDate(mergedDate);
    setReceiptTime(mergedTime);
    if (parsed.matches.length === 0 && detectedIds.length === 0) {
      setScanIssue(
        `OCR read the photo but matched none of ${outlet}'s ${itemNoun}s — blurry or water-damaged? Self-log below, photo kept as proof.`,
      );
      keepAsProof(shot.dataUrl);
      setPhase('manual');
      return;
    }
    // SCAN ONLY: a pure scan must record the SAME order number + date + time
    // printed on the paper — no silent "today" fallback: the PR scans again.
    // Self-log records whatever was read but is never blocked by it.
    if (target === 'review' && (!mergedDate || !mergedOrderNo || !mergedTime)) {
      const missing = [
        !mergedOrderNo ? 'order number' : null,
        !mergedDate ? 'date' : null,
        !mergedTime ? 'time' : null,
      ]
        .filter(Boolean)
        .join(' and ');
      setScanIssue(
        `OCR couldn't read the receipt's ${missing} yet — get closer to that part of the paper (flat, no glare) and scan again. Fields already read are kept.`,
      );
      setPhase('idle');
      return;
    }
    setDetectedIds((prev) => Array.from(new Set([...prev, ...parsed.matches.map((m) => m.id)])));
    setDrinkQtys((prev) => {
      const next = { ...prev };
      for (const m of parsed.matches) next[m.id] = Math.max(next[m.id] ?? 0, m.qty);
      return next;
    });
    if (target === 'manual') keepAsProof(shot.dataUrl);
    setShowAddMissed(false);
    setPhase(target);
  };

  const startScan = () => void runScanDetect('review');

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

  /** The detected/tapped items in the wire shape the receipt endpoint wants. */
  const buildReceiptItems = (source: MenuDrink[]) =>
    source
      .filter((d) => (drinkQtys[d.id] ?? 0) > 0)
      .map((d) => {
        const qty = drinkQtys[d.id] ?? 0;
        const amt = d.priceRm * qty;
        return {
          kind: receiptKindForItem(d),
          category: d.category,
          item: d.name,
          quantity: qty,
          sales: amt,
          commission: commissionForItem(d, amt),
        };
      });

  /**
   * Confirm the OCR review: the WHOLE receipt saves in one call — one
   * payment_voucher_receipt row (unique RCP-… number generated by the
   * database, OCR order number / date / time recorded) plus one FK-linked
   * line per item, photo attached as proof. The same order number can only
   * be logged once — the server answers 409 on a duplicate.
   */
  const confirmOcr = () =>
    void runSubmit(async () => {
      const items = buildReceiptItems(detected);
      if (items.length === 0) throw new Error('Set a quantity for at least one item.');
      const receipt = await submitReceipt({
        source: 'scan',
        assignmentId: active?.id,
        orderNo: receiptNo ?? undefined,
        receiptDate: receiptDate ?? undefined,
        receiptTime: receiptTime ?? undefined,
        outlet: outlet,
        proofPhotos: receiptShot ? [receiptShot] : undefined,
        items,
      });
      setServerReceiptNo(receipt.receiptNo);
    });

  const submitManual = () =>
    void runSubmit(async () => {
      // Editing one existing row — update it in place (fixes the drinks-edit
      // path that used to rebuild the row and lose its detail).
      if (editId) {
        if (editMenuMode) {
          // Menu edit: recompute from the (restored, then adjusted) quantities.
          const items = categoryMenu.filter((d) => (drinkQtys[d.id] ?? 0) > 0);
          if (items.length === 0) throw new Error(`Set a ${itemNoun} quantity first.`);
          const [first, ...rest] = items;
          const firstQty = drinkQtys[first.id] ?? 0;
          const firstAmt = first.priceRm * firstQty;
          await editLine(editId, {
            kind: receiptKindForItem(first),
            source: 'manual',
            item: first.name,
            quantity: firstQty,
            sales: firstAmt,
            commission: commissionForItem(first, firstAmt),
            outlet: outlet,
          });
          // Any extra items the user added during the edit become new rows.
          for (const d of rest) {
            const qty = drinkQtys[d.id] ?? 0;
            const amt = d.priceRm * qty;
            await logLine({
              kind: receiptKindForItem(d),
              source: 'manual',
              item: d.name,
              quantity: qty,
              sales: amt,
              commission: commissionForItem(d, amt),
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
      // Proof photo is mandatory for a fresh drink self-log (the submit button
      // is already gated on this; this is the backstop so it can never persist
      // without it).
      if (proofRequired && proofPhotos.length === 0) {
        throw new Error('Snap a proof photo before you submit.');
      }
      const proof = proofPhotos.length ? proofPhotos : undefined;
      if (showItemMenu) {
        const items = buildReceiptItems(categoryMenu);
        if (items.length === 0) {
          throw new Error(`Set a quantity for at least one ${itemNoun}.`);
        }
        // The whole self-log saves as ONE receipt (source 'manual' — agency
        // verifies it), items FK-linked, scan photo attached as the proof.
        const receipt = await submitReceipt({
          source: 'manual',
          assignmentId: active?.id,
          orderNo: receiptNo ?? undefined,
          receiptDate: receiptDate ?? undefined,
          receiptTime: receiptTime ?? undefined,
          note: note.trim() || undefined,
          outlet: outlet,
          proofPhotos: proof,
          items,
        });
        setServerReceiptNo(receipt.receiptNo);
      } else {
        const amt = Number(amount) || 0;
        if (amt <= 0) throw new Error('Set an amount first.');
        await logLine({
          kind: category,
          source: 'manual',
          item: category === 'tips' ? 'Guest tip' : 'Manual drink total',
          quantity: 1,
          sales: amt,
          commission: commissionFor(category, amt),
          outlet: outlet,
          proofPhotos: proof,
        });
      }
    });

  return (
    <View style={styles.screen}>

      <View style={styles.titleRow}>
        {category === 'drinks' ? (
          <Wine size={22} color={C.goldL} />
        ) : (
          <Camera size={22} color={C.goldL} />
        )}
        <Text style={styles.pageTitle}>{pageTitle}</Text>
      </View>
      <Text style={styles.pageSub}>
        {editId ? 'Edit — agency re-verifies.' : "Scans between Time-In and Time-Out go to this shift's PV."}
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
            {(phase === 'idle' || phase === 'scanning') && (
              <View style={styles.scanBox}>
                {phase === 'idle' && (
                  <>
                    {scanIssue && <Text style={styles.scanIssueText}>{scanIssue}</Text>}
                    <Text style={styles.scanIdleHint}>Point at the receipt and snap</Text>
                  </>
                )}
                {phase === 'scanning' && (
                  <>
                    <ActivityIndicator color={C.violetL} size="large" />
                    <Text style={styles.scanScanning}>Scanning… reading OCR fields</Text>
                  </>
                )}
              </View>
            )}

            {phase === 'review' && (
              <>
                <View style={styles.ocrBlock}>
                  <Text style={styles.ocrHead}>— OCR EXTRACTED —</Text>
                  <Text style={styles.ocrLine}>Order No: {receiptNo}</Text>
                  <Text style={styles.ocrLine}>Date: {receiptDate}</Text>
                  <Text style={styles.ocrLine}>Time: {receiptTime}</Text>
                  <Text style={styles.ocrLine}>Outlet: {outlet}</Text>
                </View>

                {/* A pure OCR scan is untouchable: what the receipt says is what
                    logs — no quantity edits, no manual additions. Wrong read?
                    The PR uses Self-log from Check-In instead. */}
                <Text style={styles.fieldLabel}>OCR detected · as read from the receipt</Text>
                {detected.map((d) => {
                  const qty = drinkQtys[d.id] ?? 0;
                  return (
                    <View key={d.id} style={styles.drinkRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.drinkName}>{d.name}</Text>
                        <Text style={styles.drinkUnit}>
                          {formatRM(d.priceRm)} each
                          {qty > 0
                            ? ` · ${formatRM(d.priceRm)} × ${qty} = ${formatRM(d.priceRm * qty)}`
                            : ''}
                        </Text>
                      </View>
                      <Text style={styles.qtyVal}>× {qty}</Text>
                    </View>
                  );
                })}

                <Text style={styles.cardMeta}>
                  {detectedUnits > 0
                    ? `${detected.filter((d) => (drinkQtys[d.id] ?? 0) > 0).length} ${itemNoun}(s) · ${detectedUnits} unit(s) · ${formatRM(detectedTotal)} · Est. commission ${formatRM(detectedCommission)}`
                    : 'Set a quantity for at least one item.'}
                </Text>
                <Pressable
                  style={[
                    styles.primary,
                    grad(GRADIENTS.accent, C.accent),
                    (submitting || detectedUnits === 0) && { opacity: 0.6 },
                  ]}
                  onPress={confirmOcr}
                  disabled={submitting || detectedUnits === 0}
                >
                  <Camera size={16} color="#241a08" />
                  <Text style={[styles.primaryText, { color: '#241a08' }]}>
                    {submitting ? 'Saving…' : 'Confirm & log receipt'}
                  </Text>
                </Pressable>
                {submitError && <Text style={styles.errorText}>{submitError}</Text>}
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
                {scanIssue && <Text style={styles.scanIssueText}>{scanIssue}</Text>}
                {!showItemMenu && (
                  <Text style={styles.scanIdleHint}>Key in the amount · agency verifies.</Text>
                )}
                {showItemMenu ? (
                  <>
                    <View style={styles.selfLogHead}>
                      <Wine size={16} color={C.goldL} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.selfLogHeadTitle}>{outlet.toUpperCase()}</Text>
                        <Text style={styles.selfLogHeadSub}>
                          OCR reads the receipt & matches this outlet's {categoryMenu.length}{' '}
                          {itemNoun}
                          {categoryMenu.length === 1 ? '' : 's'}
                        </Text>
                      </View>
                    </View>

                    {!editId && manualScanAttempted && (
                      <View style={[styles.ocrBlock, { marginTop: 10 }]}>
                        <Text style={styles.ocrHead}>— OCR EXTRACTED —</Text>
                        <Text style={styles.ocrLine}>Order No: {receiptNo ?? '—'}</Text>
                        <Text style={styles.ocrLine}>Date: {receiptDate ?? '—'}</Text>
                        <Text style={styles.ocrLine}>Time: {receiptTime ?? '—'}</Text>
                        <Text style={styles.ocrLine}>Outlet: {outlet}</Text>
                      </View>
                    )}

                    {!editId && (
                      <View style={styles.selfLogScanbox}>
                        <Camera size={28} color={C.goldL} />
                        <Text style={styles.selfLogScanHint}>
                          {manualRows.length === 0
                            ? `Point at the receipt — OCR lists the ${itemNoun}s it reads`
                            : `Scan again to catch a ${itemNoun} OCR missed`}
                        </Text>
                        <Pressable
                          style={styles.selfLogScanBtn}
                          onPress={() => void runScanDetect('manual')}
                        >
                          <Camera size={14} color="#241a08" />
                          <Text style={styles.selfLogScanBtnText}>
                            {manualRows.length === 0 ? `Scan ${itemNoun}s` : 'Scan again'}
                          </Text>
                        </Pressable>
                      </View>
                    )}

                    {manualRows.length > 0 && (
                      <Text style={styles.fieldLabel}>OCR DETECTED · ADJUST QUANTITY</Text>
                    )}
                    {manualRows.map((d) => (
                      <View key={d.id} style={styles.drinkRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.drinkName}>{d.name}</Text>
                          <Text style={styles.drinkUnit}>
                            {formatRM(d.priceRm)} each
                            {(drinkQtys[d.id] ?? 0) > 0
                              ? ` · × ${drinkQtys[d.id]} = ${formatRM(d.priceRm * (drinkQtys[d.id] ?? 0))}`
                              : ''}
                          </Text>
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
                    {!editId && manualScanAttempted && undetected.length > 0 && !showAddMissed && (
                      <Pressable style={styles.soft} onPress={() => setShowAddMissed(true)}>
                        <Text style={styles.softAmber}>OCR missed one? Add manually</Text>
                      </Pressable>
                    )}
                    {!editId && manualScanAttempted && undetected.length > 0 && showAddMissed && (
                      <>
                        <Text style={styles.fieldLabel}>Add {itemNoun} OCR missed</Text>
                        {undetected.map((d) => (
                          <Pressable
                            key={d.id}
                            style={styles.drinkRow}
                            onPress={() => {
                              setDetectedIds((prev) => [...prev, d.id]);
                              setDrinkQtys((q) => ({ ...q, [d.id]: Math.max(1, q[d.id] ?? 0) }));
                              setShowAddMissed(false);
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={styles.drinkName}>{d.name}</Text>
                              <Text style={styles.drinkUnit}>{formatRM(d.priceRm)} each</Text>
                            </View>
                            <Text style={styles.softAmber}>+ Add</Text>
                          </Pressable>
                        ))}
                      </>
                    )}
                    {menuTotal > 0 && (
                      <View style={styles.selfLogSummary}>
                        <View style={styles.selfLogSummaryRow}>
                          <Text style={styles.selfLogSummaryLabel}>
                            {manualRows.filter((d) => (drinkQtys[d.id] ?? 0) > 0).length} {itemNoun}
                            {manualRows.length === 1 ? '' : 's'} ·{' '}
                            {manualRows.reduce((n, d) => n + (drinkQtys[d.id] ?? 0), 0)} unit(s)
                          </Text>
                          <Text style={styles.selfLogSummaryTotal}>{formatRM(menuTotal)}</Text>
                        </View>
                        <Text style={styles.selfLogSummaryComm}>
                          Commission preview:{' '}
                          <Text style={styles.activeBold}>{formatRM(menuCommission)}</Text>
                        </Text>
                      </View>
                    )}
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
                      Snap the receipt as proof — agency verifies against it.
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
                        ⚠ Snap a photo to enable Submit.
                      </Text>
                    )}
                  </View>
                )}

                <Text style={styles.fieldLabel}>
                  Note for agency {editId ? '(optional)' : '(required)'}
                </Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  style={styles.input}
                  placeholder="Unclear quantity / price / date on the receipt? Explain — or confirm all match."
                  placeholderTextColor={C.muted2}
                />
                <Pressable
                  style={[
                    styles.primary,
                    grad(GRADIENTS.accent, C.accent),
                    (submitting ||
                      missingProof ||
                      drinkIncomplete ||
                      manualNoteMissing ||
                      (showItemMenu && !editId && menuTotal <= 0)) && { opacity: 0.6 },
                  ]}
                  onPress={submitManual}
                  disabled={
                    submitting ||
                    missingProof ||
                    drinkIncomplete ||
                    manualNoteMissing ||
                    (showItemMenu && !editId && menuTotal <= 0)
                  }
                >
                  <Pencil size={16} color="#241a08" />
                  <Text style={[styles.primaryText, { color: '#241a08' }]}>
                    {submitting
                      ? 'Saving…'
                      : editId
                        ? 'Update self-log'
                        : showItemMenu
                          ? menuTotal <= 0
                            ? `Submit self-log · scan ${itemNoun}s`
                            : manualNoteMissing
                              ? 'Write the agency note to submit'
                              : `Submit self-log · ${formatRM(menuTotal)}`
                          : missingProof
                            ? 'Snap proof to submit'
                            : manualNoteMissing
                              ? 'Write the agency note to submit'
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
                  Added to Check-In STATUS · pending until agency verifies.
                </Text>
                <Text style={styles.activeMeta}>
                  Belongs to PV: <Text style={styles.activeBold}>{pvId}</Text>
                  {serverReceiptNo ? ` · Receipt ${serverReceiptNo}` : ''}
                  {receiptNo ? ` · Order ${receiptNo}` : ''}
                </Text>
                <View style={styles.loggedActions}>
                  {!editId && (
                    <Pressable
                      style={styles.softBtn}
                      onPress={() => {
                        setDetectedIds([]);
                        setReceiptNo(null);
                        setReceiptDate(null);
                        setReceiptTime(null);
                        setServerReceiptNo(null);
                        setReceiptShot(null);
                        setDrinkQtys({});
                        setPhase('idle');
                      }}
                    >
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
              Wrong scan? Check-In → <Text style={styles.activeBold}>Scan again</Text> · pending
              self-logs can be edited or deleted.
            </Text>
          </View>

          <ScannedReceiptsCard lines={todayReceiptLines} />

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
  scanIssueText: {
    marginBottom: 8,
    fontFamily: F.manrope,
    fontSize: 12,
    lineHeight: 17,
    color: C.amber,
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
  // Proto-style self-log (host.scan) pieces
  selfLogHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(232,194,122,0.35)',
    backgroundColor: 'rgba(232,194,122,0.05)',
    padding: 12,
  },
  selfLogHeadTitle: {
    fontFamily: F.sora,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    color: C.goldL,
  },
  selfLogHeadSub: {
    marginTop: 3,
    fontFamily: F.manrope,
    fontSize: 11,
    lineHeight: 15,
    color: C.prMuted,
  },
  selfLogScanbox: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.line2,
    backgroundColor: 'rgba(255,255,255,0.02)',
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: 16,
  },
  selfLogScanHint: {
    marginTop: 8,
    fontFamily: F.manrope,
    fontSize: 12,
    lineHeight: 17,
    color: C.prMuted,
    textAlign: 'center',
  },
  selfLogScanBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: C.accent,
  },
  selfLogScanBtnText: {
    fontFamily: F.sora,
    fontSize: 13,
    fontWeight: '700',
    color: '#241a08',
  },
  selfLogSummary: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(232,194,122,0.3)',
    backgroundColor: 'rgba(232,194,122,0.06)',
    padding: 12,
  },
  selfLogSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selfLogSummaryLabel: {
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.prMuted,
  },
  selfLogSummaryTotal: {
    fontFamily: F.sora,
    fontSize: 18,
    fontWeight: '800',
    color: C.txt,
  },
  selfLogSummaryComm: {
    marginTop: 6,
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.prMuted,
  },
});
