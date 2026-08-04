/**
 * On-duty shift status — port of InnocenZ-proto `PrShiftStatusPanel`
 * Scan / Self-log navigate to `/host/scan` equivalent (ScanScreen).
 */
import React, { useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, F } from '../theme/theme';
import { formatRM } from '../lib/demo-shifts';
import { fmtAttendanceStamp, shiftDurationLabel } from '../lib/shift-session';
import { usePrEarnings, receiptCommissionTotal } from '../lib/pr-earnings';
import { assetUrl, type PrReceiptLine } from '../lib/api';
import { usePrNav } from '../lib/pr-nav';
import { pickProofPhotos } from '../lib/proof-photo';
import { isReceiptLocked } from '../lib/receipt-review';
import {
  Camera,
  Check,
  ChevronDown,
  Clock,
  HelpCircle,
  ImagePlus,
  MapPin,
  Pencil,
  Shield,
  Trash2,
  XIcon,
} from './icons';

export function ShiftStatusPanel({
  checkedOut,
  checkInAt,
  checkOutAt,
  dutyWagesRm,
  targetSalesRm,
  dayKey,
}: {
  checkedOut: boolean;
  /** Real attendance stamps from the backend assignment. */
  checkInAt?: string | null;
  checkOutAt?: string | null;
  /** This shift's real daily wage (the assignment's payAmount). */
  dutyWagesRm: number;
  /** This tier's real sales target (RM) at this outlet, or null when unset. */
  targetSalesRm?: number | null;
  /** Scope the receipt rows to this day (YYYY-MM-DD) so the panel shows only
   * THIS shift's earnings — and its total reconciles with the Payment
   * "This week" column for the same day. */
  dayKey?: string;
}) {
  const { openScan } = usePrNav();
  // Receipt rows come from the backend current-week draft voucher, scoped to
  // this shift's day so Check-In and Payment never disagree on the amount.
  const { receiptLines: allLogs, deleteLine, updateLine } = usePrEarnings();
  /**
   * THIS SHIFT's rows. The day filter alone was not enough: a PR can work twice
   * in one date, and the second check-in inherited the first shift's items,
   * totals and proof photos — under headings that say "this shift".
   *
   * `checkInAt` is what separates two sessions on one day, so anything logged
   * before it belongs to the shift before it. With no check-in stamp, the day is
   * all there is to go on.
   */
  const logs = useMemo(() => {
    const byDay = dayKey ? allLogs.filter((l) => l.lineDate === dayKey) : allLogs;
    const startedAt = checkInAt ? new Date(checkInAt).getTime() : null;
    if (startedAt === null || Number.isNaN(startedAt)) return byDay;
    return byDay.filter((l) => {
      const loggedAt = new Date(l.at).getTime();
      return Number.isNaN(loggedAt) ? true : loggedAt >= startedAt;
    });
  }, [allLogs, dayKey, checkInAt]);
  // Every proof photo the PR snapped for this shift's self-logs, each carrying
  // its owning line + index so it can be removed. Shown as an editable gallery
  // under the totals so the PR can confirm / add / remove what they uploaded.
  const proofItems = useMemo(() => {
    /*
     * ONE THUMBNAIL PER PICTURE, not per line.
     *
     * Three items scanned off one receipt all carry that receipt's photo, so
     * the gallery showed the same paper three times and the count read
     * "PROOF PHOTOS · 3" for a single picture. The PR cannot tell whether they
     * uploaded one or three, which is the only question the gallery answers.
     *
     * The kept entry keeps its real lineId + index, so removing it still deletes
     * a photo that actually exists rather than a display-only copy.
     */
    const seen = new Set<string>();
    const items: { lineId: string; idx: number; src: string }[] = [];
    for (const l of logs) {
      (l.proofPhotos ?? []).forEach((src, idx) => {
        if (seen.has(src)) return;
        seen.add(src);
        items.push({ lineId: l.id, idx, src });
      });
    }
    return items;
  }, [logs]);
  // New photos append to the first self-log that already carries proof.
  const proofTargetLineId = proofItems[0]?.lineId;
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  // Photos are editable only while on duty (same rule as row edit/delete).
  const canEditPhotos = !checkedOut;

  const applyPhotos = async (lineId: string, next: string[]) => {
    if (photoBusy) return;
    setPhotoBusy(true);
    try {
      await updateLine(lineId, { proofPhotos: next });
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = (lineId: string, idx: number) => {
    const line = logs.find((l) => l.id === lineId);
    if (!line) return;
    void applyPhotos(
      lineId,
      (line.proofPhotos ?? []).filter((_, i) => i !== idx),
    );
  };

  /**
   * “Scan again” on a row: straight to the camera (no picker, no edit form) —
   * the single new shot REPLACES that action's saved picture.
   */
  const rescanPhoto = (lineId: string) => {
    if (photoBusy) return;
    pickProofPhotos(
      (urls) => {
        if (urls[0]) void applyPhotos(lineId, [urls[0]]);
      },
      { multiple: false },
    );
  };

  const addPhotos = () => {
    if (!proofTargetLineId) return;
    pickProofPhotos((urls) => {
      const line = logs.find((l) => l.id === proofTargetLineId);
      if (!line) return;
      void applyPhotos(proofTargetLineId, [...(line.proofPhotos ?? []), ...urls].slice(0, 6));
    });
  };

  const checkedInAt = checkInAt ?? null;
  const checkedOutAt = checkOutAt ?? null;

  const [statusOpen, setStatusOpen] = useState(true);

  const commissionTotal = useMemo(() => receiptCommissionTotal(logs), [logs]);
  // Real sales logged this shift (drink/tip sales), for the tier's target bar.
  const salesLogged = useMemo(() => logs.reduce((s, l) => s + l.sales, 0), [logs]);
  const targetPct =
    targetSalesRm && targetSalesRm > 0
      ? Math.min(100, Math.round((salesLogged / targetSalesRm) * 100))
      : 0;
  const pendingCount = logs.filter((l) => l.pending).length;

  const durationLabel = checkedOut
    ? shiftDurationLabel(checkedInAt, checkedOutAt)
    : 'In progress';

  const statusHint =
    logs.length === 0
      ? null
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

      {targetSalesRm != null && targetSalesRm > 0 && (
        <View style={styles.targets}>
          <Text style={styles.targetsLabel}>SALES TARGET</Text>
          <View style={styles.targetPrice}>
            <Text style={styles.targetV}>{formatRM(salesLogged)}</Text>
            <Text style={styles.targetT}>
              of {formatRM(targetSalesRm)} · {targetPct}%
            </Text>
          </View>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${targetPct}%` as unknown as number }]} />
          </View>
        </View>
      )}

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
        {statusHint ? <Text style={styles.statusHint}>{statusHint}</Text> : null}

        {statusOpen && (
          <>
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

              {logs.map((log) => {
                const cat = log.kind === 'tips' ? 'tips' : 'drinks';
                return (
                  <LogRow
                    key={log.id}
                    log={log}
                    checkedOut={checkedOut}
                    missingPhoto={
                      log.source !== 'checkin' && (log.proofPhotos ?? []).length === 0
                    }
                    onEdit={() => openScan(cat, 'selflog', log.id)}
                    // A scanned row is corrected by SCANNING again (camera →
                    // OCR → replaces row + receipt + snap). Self-log rows just
                    // replace their proof picture.
                    onRescan={() =>
                      log.source === 'scan'
                        ? openScan(cat, 'scan', log.id)
                        : rescanPhoto(log.id)
                    }
                    onDelete={() => void deleteLine(log.id)}
                  />
                );
              })}

              <View style={styles.trFoot}>
                <View style={styles.totalsBlock}>
                  <Text style={styles.totalsLabel}>TOTALS</Text>
                  <Text style={styles.totalsHint} numberOfLines={1}>
                    wage {formatRM(dutyWagesRm)} + comm
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

          {proofItems.length > 0 && (
            <View style={styles.gallery}>
              <View style={styles.galleryHead}>
                <Camera size={13} color={C.goldL} />
                <Text style={styles.galleryLabel}>PROOF PHOTOS · {proofItems.length}</Text>
              </View>
              <Text style={styles.gallerySub}>
                {canEditPhotos
                  ? 'Tap to view · ✕ to remove · add another below'
                  : 'Pictures you uploaded for this shift'}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.galleryRow}
              >
                {proofItems.map((it) => {
                  const uri =
                    it.src.startsWith('data:') || it.src.startsWith('http')
                      ? it.src
                      : assetUrl(it.src) ?? it.src;
                  return (
                    <View key={`${it.lineId}-${it.idx}`} style={styles.galleryItem}>
                      <Pressable onPress={() => setLightbox(uri)}>
                        <Image source={{ uri }} style={styles.galleryThumb} />
                      </Pressable>
                      {canEditPhotos && (
                        <Pressable
                          style={styles.galleryRemove}
                          onPress={() => removePhoto(it.lineId, it.idx)}
                          disabled={photoBusy}
                          hitSlop={6}
                        >
                          <XIcon size={11} color={C.txt} />
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
              {canEditPhotos && proofTargetLineId && (
                <Pressable style={styles.galleryAddBtn} onPress={addPhotos} disabled={photoBusy}>
                  <ImagePlus size={14} color={C.txt} />
                  <Text style={styles.galleryAddText}>
                    {photoBusy ? 'Saving…' : 'Add another photo'}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
          </>
        )}
      </View>

      <Modal
        visible={lightbox != null}
        transparent
        animationType="fade"
        onRequestClose={() => setLightbox(null)}
      >
        <Pressable style={styles.lightboxBackdrop} onPress={() => setLightbox(null)}>
          {lightbox && (
            <Image source={{ uri: lightbox }} style={styles.lightboxImg} resizeMode="contain" />
          )}
        </Pressable>
      </Modal>
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
  missingPhoto,
  onEdit,
  onRescan,
  onDelete,
}: {
  log: PrReceiptLine;
  checkedOut: boolean;
  missingPhoto: boolean;
  onEdit: () => void;
  onRescan: () => void;
  onDelete: () => void;
}) {
  // Check-out seals (overtime) aren't receipts — no edit/scan, shown as Sealed.
  const isSeal = log.source === 'checkin';
  const sourceLabel = isSeal
    ? 'Check-in'
    : log.source === 'manual'
      ? 'Manual entry'
      : 'Receipt scan';
  const refLabel = log.kind === 'tips' ? 'Tip' : log.kind === 'others' ? 'OT' : 'Drink';
  // Once the agency has approved the receipt, this row is no longer the PR's to
  // change — the server refuses the edit and the delete, and the way back is a
  // dispute. Hiding the controls is the honest form of that: leaving them would
  // offer three actions that all fail, and the buttons were the only thing on
  // the row saying it was still theirs.
  const reviewed = isReceiptLocked(log);
  return (
    <View style={[styles.tr, log.pending && styles.trSelflog]}>
      <View style={styles.colRef}>
        <Text style={styles.tdLabel}>
          {refLabel} · {formatRM(log.sales)}
        </Text>
        <Text style={styles.tdDetail}>{fmtAttendanceStamp(log.at)}</Text>
      </View>
      <Text style={[styles.td, styles.colItem]} numberOfLines={1}>
        {log.item}
      </Text>
      <Text style={[styles.td, styles.colQty]}>{log.quantity}</Text>
      <Text style={[styles.td, styles.colSrc]}>{sourceLabel}</Text>
      <Text style={[styles.td, styles.colComm, { color: C.accentL }]}>
        {formatRM(log.commission)}
      </Text>
      <View style={styles.colVerify}>
        {isSeal ? (
          <View style={styles.badgeSealed}>
            <Shield size={10} color={C.violetL} />
            <Text style={styles.badgeSealedText}>Sealed</Text>
          </View>
        ) : log.pending ? (
          <View style={styles.badgePending}>
            <Clock size={10} color={C.amber} />
            <Text style={styles.badgePendingText}>Pending</Text>
          </View>
        ) : (
          <View style={styles.badgeMatched}>
            <Check size={10} color={C.green} />
            {/* "Approved" only when a receipt actually carries that state.
                Everything else keeps saying "Matched", which claims less: that
                the line has a receipt behind it, not that anybody signed it
                off. A row with no receipt has nothing to approve. */}
            <Text style={styles.badgeMatchedText}>
              {reviewed ? 'Approved' : 'Matched'}
            </Text>
          </View>
        )}
      </View>
      {!checkedOut && (
        <View style={styles.colAct}>
          {isSeal || reviewed ? null : log.pending ? (
            <>
              <Pressable onPress={onEdit} hitSlop={6}>
                <Pencil size={13} color={C.goldL} />
              </Pressable>
              <Pressable onPress={onDelete} hitSlop={6}>
                <Trash2 size={13} color={C.red} />
              </Pressable>
            </>
          ) : (
            <>
              {/* Pencil (self-logs only) = this row's edit form: quantity,
                  item, retake photo. Scanned rows have no manual edit —
                  everything about a scan is fixed by scanning again. */}
              {log.source === 'manual' && (
                <Pressable onPress={onEdit} hitSlop={6}>
                  <Pencil size={13} color={C.goldL} />
                </Pressable>
              )}
              {/* Camera: scan rows → full re-scan (camera → OCR → replaces
                  row + receipt + snap); self-log rows → replace the proof
                  picture. Red = no picture yet, blocks check-out. */}
              <Pressable onPress={onRescan} hitSlop={6}>
                <Camera size={13} color={missingPhoto ? C.red : C.goldL} />
              </Pressable>
              {/* A wrong scan can be removed whole — picture + details go
                  together (the backend drops the receipt with its last line). */}
              <Pressable onPress={onDelete} hitSlop={6}>
                <Trash2 size={13} color={C.red} />
              </Pressable>
            </>
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
  gallery: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: C.line2,
  },
  galleryHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  galleryLabel: {
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: C.goldL,
  },
  gallerySub: {
    marginTop: 2,
    fontFamily: F.manrope,
    fontSize: 11,
    color: C.prMuted2,
  },
  galleryRow: { gap: 8, paddingTop: 10 },
  galleryItem: { position: 'relative' },
  galleryThumb: {
    width: 76,
    height: 76,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  galleryRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6,3,12,0.78)',
    borderWidth: 1,
    borderColor: C.line2,
  },
  galleryAddBtn: {
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
    paddingVertical: 9,
  },
  galleryAddText: { fontFamily: F.sora, fontSize: 13, fontWeight: '600', color: C.txt },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(6,3,12,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  lightboxImg: { width: '100%', height: '80%' },
});
