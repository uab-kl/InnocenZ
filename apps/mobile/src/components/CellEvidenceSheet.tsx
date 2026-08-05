/**
 * "How come Drinks says RM 7.20?" — the proof behind one Payment-grid cell.
 *
 * Opens on a cell tap and reads top-down the way the money was actually earned:
 *
 *   SHIFT     check-in / shift end / duration / outlet
 *     └ RECEIPT   ORD0389 · RCP-000010 · printed 16 Jun 21:43
 *         └ ITEM  Lemon Drop × 1 → RM 3.60
 *
 * so a PR can hold the paper next to the phone and see the same order number.
 * Chrome, table metrics and stamp helpers are borrowed from the screens that
 * already use them (PvDetailScreen's sheet, ShiftStatusPanel's table,
 * shift-session's stamps) so the same fact is never formatted two ways.
 */
import React from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, F } from '../theme/theme';
import { IzButton } from './ui';
import { fmtAttendanceStamp, shiftDurationLabel } from '../lib/shift-session';
import { evidenceMatchesCell, type CellEvidence, type EvidenceGroup } from '../lib/cell-evidence';
import type { ReceiptClaimState } from '../lib/receipt-review';

const KIND_LABEL: Record<CellEvidence['kind'], string> = {
  wages: 'Daily wages',
  drinks: 'Drinks',
  tips: 'Tips',
  others: 'OT / Other',
};

const SOURCE_LABEL: Record<string, string> = {
  scan: 'Scanned',
  manual: 'Self-logged',
  checkin: 'Sealed at check-out',
};

/** Column widths — same fixed-width table as ShiftStatusPanel's STATUS grid. */
const COL_ITEM = 150;
const COL_QTY = 44;
const COL_COMM = 82;

function money(n: number) {
  return `RM ${n.toFixed(2)}`;
}

/** "Tue 4 Aug" from a YYYY-MM-DD. Parsed as UTC to match the grid's bucketing. */
function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  const mo = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ][d.getUTCMonth()];
  return `${wd} ${d.getUTCDate()} ${mo}`;
}

/** The shift header for one group — or an honest note when there is no link. */
function ShiftHead({ group, shiftsKnown }: { group: EvidenceGroup; shiftsKnown: boolean }) {
  const shift = group.shift;
  if (!shift) {
    return (
      <View style={s.shiftCard}>
        <Text style={s.shiftTitle}>Not linked to a shift</Text>
        <Text style={s.shiftNote}>
          {shiftsKnown
            ? 'This was logged without an open shift, so there is no check-in to show. The receipt below is still the proof.'
            : 'Shift times are unavailable right now. The receipt below is still the proof.'}
        </Text>
      </View>
    );
  }
  /*
   * "Shift end", NOT "you tapped out at".
   *
   * check_out_at is CLAMPED to the shift's scheduled end when the PR taps out
   * late — the overrun survives only as overtime_minutes. Calling the clamped
   * stamp a tap time would be a false statement on a screen whose entire job is
   * proof, so the overtime is printed beside it instead.
   */
  return (
    <View style={s.shiftCard}>
      <Text style={s.shiftTitle}>{shift.outletName ?? 'Shift'}</Text>
      {!!shift.slot && <Text style={s.shiftSlot}>{shift.slot}</Text>}
      <View style={s.stampRow}>
        <View style={s.stampCol}>
          <Text style={s.stampK}>CHECK-IN</Text>
          <Text style={s.stampV}>{fmtAttendanceStamp(shift.checkInAt)}</Text>
        </View>
        <View style={s.stampCol}>
          <Text style={s.stampK}>SHIFT END</Text>
          <Text style={s.stampV}>
            {shift.checkOutAt ? fmtAttendanceStamp(shift.checkOutAt) : 'Still on duty'}
          </Text>
        </View>
      </View>
      <View style={s.stampRow}>
        <View style={s.stampCol}>
          <Text style={s.stampK}>DURATION</Text>
          <Text style={s.stampV}>
            {shiftDurationLabel(shift.checkInAt, shift.checkOutAt)}
            {shift.overtimeMinutes ? ` · +${shift.overtimeMinutes}m OT recorded` : ''}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function CellEvidenceSheet({
  evidence,
  cellAmount,
  claims,
  onClose,
  onDispute,
}: {
  evidence: CellEvidence | null;
  /** The figure printed on the grid, so the sheet can assert it adds up. */
  cellAmount: number;
  /**
   * Which receipts in this cell are already claimed, from `receiptClaimState`.
   * Omitted (or absent `disputes`) simply means nothing is marked.
   */
  claims?: ReceiptClaimState;
  onClose: () => void;
  /** Omitted on This-week, where there is no issued voucher to contest yet. */
  onDispute?: () => void;
}) {
  if (!evidence) return null;
  const balanced = evidenceMatchesCell(evidence, cellAmount);

  /*
   * What has been claimed against this receipt, and how it ended.
   *
   * A whole-day claim TAGS EVERY RECEIPT, because it covered every one of them.
   * I removed that once, when two shifts both reading SETTLED looked like two
   * separate claims — but that fixed the wrong half. The confusion was the
   * missing OUTCOME, not the tags: dropping them left the PR asking which shift
   * was disputed and finding nothing marked at all.
   *
   * OPEN beats settled where both touch one receipt: it is still being argued
   * about, and saying "accepted" there would tell the PR to stop chasing
   * something nobody has finished.
   */
  const claimOf = (r: {
    receiptId: string | null;
    receiptNo: string | null;
    pending: boolean;
  }): 'open' | 'verified' | 'settled' | null => {
    if (!claims) return null;
    // Matched on the receipt ID (the FK a claim stores since 0088) OR its number
    // (what pre-0088 claims recorded as text). Either identifies the same paper.
    const hit = (keys: { has(k: string): boolean }) =>
      (!!r.receiptId && keys.has(r.receiptId)) || (!!r.receiptNo && keys.has(r.receiptNo));
    if (claims.openAll || hit(claims.open)) return 'open';
    /*
     * SETTLED → DISPUTED → VERIFIED, per shift — the same lifecycle the day
     * status uses, applied to one receipt.
     *
     *   SETTLED   the agency approved it and nobody argued
     *   DISPUTED  a claim on THIS shift is open
     *   VERIFIED  a claim on THIS shift was raised and answered
     *
     * The point is the contrast: after one shift's claim is resolved it reads
     * VERIFIED while the untouched shift beside it still reads SETTLED, so the
     * PR can see at a glance which one they took up and how it ended.
     *
     * A receipt still awaiting review is neither — its row already says
     * "waiting on your agency", and calling that settled would claim a decision
     * nobody has made.
     */
    const answered =
      (r.receiptId && claims.settled.get(r.receiptId)) ||
      (r.receiptNo && claims.settled.get(r.receiptNo)) ||
      claims.settledAll;
    if (answered) return 'verified';
    return r.pending ? null : 'settled';
  };

  /*
   * A whole-day claim is announced ONCE, above the list — but only while it is
   * still OPEN. Once answered, each receipt carries its own outcome tag, which
   * says strictly more than a banner could, so repeating it would be noise.
   */
  const cellWide: 'open' | null = claims?.openAll ? 'open' : null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={s.title}>
            {KIND_LABEL[evidence.kind]} · {dayLabel(evidence.dateIso)}
          </Text>
          <Text style={s.total}>{money(evidence.total)}</Text>
          <Text style={s.hint}>
            Everything that added up to this figure. Check the order number against your
            paper receipt.
          </Text>

          {/*
            A mismatch means lines were dropped from this list while the cell
            still counts them — the PR would be looking at an incomplete proof
            that claims to be complete. Say so loudly rather than hide it.
          */}
          {!balanced && (
            <View style={s.warn}>
              <Text style={s.warnText}>
                This list adds up to {money(evidence.total)} but the grid shows{' '}
                {money(cellAmount)}. Report this — do not sign it off.
              </Text>
            </View>
          )}

          {/*
            * A REMINDER that this cell has been argued about before.
            *
            * Shown for answered claims too, not just open ones. The point is not
            * to flag an action — a settled claim needs none — it is to stop a PR
            * re-raising something they already raised and forgot. The wording
            * separates the two cases honestly: a claim that named a shift points
            * at the tagged receipt below; one that did not says so, because that
            * information was never recorded and no amount of UI can invent it.
            */}
          {/*
            * ONLY while a claim is still open.
            *
            * The settled variant is gone: each receipt now carries its own
            * DISPUTE ACCEPTED / DISPUTE REJECTED tag, which says more than a
            * banner ever did — the tags name the outcome per shift, so a
            * sentence repeating "this was settled" above them was noise.
            *
            * An OPEN whole-day claim keeps its banner, because that one is not
            * describing history: it is the reason another claim cannot be filed.
            */}
          {cellWide === 'open' && (
            <View style={[s.cellClaim, s.cellClaimOpen]}>
              <Text style={[s.cellClaimText, s.claimTagOpen]}>
                You have an open dispute covering this WHOLE day — every shift below is part of it.
              </Text>
            </View>
          )}

          <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
            {evidence.groups.length === 0 && (
              <Text style={s.empty}>Nothing was logged for this day.</Text>
            )}

            {evidence.groups.map((group, gi) => (
              <View key={group.shift?.id ?? `unlinked-${gi}`} style={s.group}>
                <ShiftHead group={group} shiftsKnown={evidence.shiftsKnown} />

                {group.receipts.map((receipt, ri) => (
                  <View key={receipt.receiptNo ?? `r-${ri}`} style={s.receipt}>
                    <View style={s.receiptHead}>
                      <Text style={s.orderNo}>{receipt.orderNo ?? 'No order number'}</Text>
                      <Text style={s.receiptNo}>{receipt.receiptNo ?? '—'}</Text>
                      {/*
                        * WHICH shift is under argument.
                        *
                        * The grid can only say a DAY is disputed. On a night with
                        * two shifts that left the PR unable to tell which of them
                        * the claim was about — the same ambiguity the per-receipt
                        * selection exists to remove, reappearing at the point they
                        * go looking for the answer.
                        */}
                      {claimOf(receipt) === 'open' && (
                        <Text style={[s.claimTag, s.claimTagOpen]}>DISPUTED</Text>
                      )}
                      {claimOf(receipt) === 'verified' && (
                        <Text style={[s.claimTag, s.claimTagSettled]}>VERIFIED</Text>
                      )}
                      {claimOf(receipt) === 'settled' && (
                        <Text style={[s.claimTag, s.claimTagPlain]}>SETTLED</Text>
                      )}
                    </View>
                    <Text style={s.receiptMeta}>
                      {SOURCE_LABEL[receipt.source] ?? receipt.source}
                      {receipt.receiptDate
                        ? ` · printed ${receipt.receiptDate}${receipt.receiptTime ? ` ${receipt.receiptTime}` : ''}`
                        : ''}
                      {receipt.pending ? ' · waiting on your agency' : ''}
                    </Text>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View>
                        <View style={s.tr}>
                          <Text style={[s.th, { width: COL_ITEM }]}>ITEM</Text>
                          <Text style={[s.th, { width: COL_QTY }]}>QTY</Text>
                          <Text style={[s.th, { width: COL_COMM, textAlign: 'right' }]}>
                            COMM.
                          </Text>
                        </View>
                        {receipt.lines.map((line) => (
                          <View key={line.id} style={s.tr}>
                            <Text style={[s.td, { width: COL_ITEM }]} numberOfLines={1}>
                              {line.item}
                            </Text>
                            <Text style={[s.td, { width: COL_QTY }]}>{line.quantity}</Text>
                            <Text
                              style={[s.td, s.tdMoney, { width: COL_COMM, textAlign: 'right' }]}
                            >
                              {line.commission.toFixed(2)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </ScrollView>

                    {receipt.photos.length > 0 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={s.thumbs}>
                          {receipt.photos.map((src, i) => (
                            <Image
                              key={`${i}-${src.slice(0, 24)}`}
                              source={{ uri: src }}
                              style={s.thumb}
                            />
                          ))}
                        </View>
                      </ScrollView>
                    )}
                  </View>
                ))}

                <Text style={s.groupTotal}>Shift subtotal · {money(group.subtotal)}</Text>
              </View>
            ))}
          </ScrollView>

          {onDispute && (
            <IzButton label="Dispute this amount" variant="soft" onPress={onDispute} />
          )}
          <IzButton label="Close" variant="soft" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(6,3,12,0.65)', justifyContent: 'flex-end' },
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
  title: { fontFamily: F.sora, fontSize: 18, fontWeight: '800', color: C.txt },
  total: {
    marginTop: 2,
    fontFamily: F.sora,
    fontSize: 26,
    fontWeight: '800',
    color: C.accentL,
  },
  hint: { marginTop: 6, fontFamily: F.manrope, fontSize: 12, color: C.prMuted },
  warn: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: C.redBg,
    borderWidth: 1,
    borderColor: 'rgba(240,138,138,0.35)',
  },
  warnText: { fontFamily: F.manrope, fontSize: 12, color: C.red },
  scroll: { marginTop: 12, maxHeight: 420 },
  empty: {
    fontFamily: F.manrope,
    fontSize: 13,
    color: C.muted2,
    paddingVertical: 16,
    textAlign: 'center',
  },
  group: { marginBottom: 16 },
  shiftCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.glass,
    padding: 12,
  },
  shiftTitle: { fontFamily: F.sora, fontSize: 14, fontWeight: '800', color: C.violetL },
  shiftSlot: { marginTop: 2, fontFamily: F.manrope, fontSize: 12, color: C.prMuted },
  shiftNote: { marginTop: 4, fontFamily: F.manrope, fontSize: 12, color: C.muted2 },
  stampRow: { flexDirection: 'row', marginTop: 10, gap: 12 },
  stampCol: { flex: 1 },
  stampK: {
    fontFamily: F.sora,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: C.muted2,
  },
  stampV: { marginTop: 3, fontFamily: F.sora, fontSize: 13, fontWeight: '700', color: C.txt },
  receipt: {
    marginTop: 10,
    marginLeft: 10,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: C.line2,
  },
  receiptHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  claimTag: {
    fontFamily: F.sora,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  claimTagOpen: {
    color: C.red,
    backgroundColor: C.redBg,
    borderColor: 'rgba(240,138,138,0.35)',
  },
  /*
   * SETTLED is the QUIET state — approved, unargued, nothing to do. It is
   * neutral rather than green so the eye lands on VERIFIED and DISPUTED, which
   * are the two the PR actually acted on.
   */
  claimTagPlain: {
    color: C.muted2,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: C.line,
  },
  claimTagSettled: {
    color: C.green,
    backgroundColor: C.greenBg,
    borderColor: 'rgba(93,217,160,0.35)',
  },
  cellClaim: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  cellClaimOpen: { backgroundColor: C.redBg, borderColor: 'rgba(240,138,138,0.35)' },
  cellClaimSettled: { backgroundColor: C.greenBg, borderColor: 'rgba(93,217,160,0.35)' },
  cellClaimText: {
    fontFamily: F.manrope,
    fontSize: 12,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  orderNo: { fontFamily: F.sora, fontSize: 15, fontWeight: '800', color: C.accentL },
  receiptNo: { fontFamily: F.manrope, fontSize: 12, color: C.muted2 },
  receiptMeta: {
    marginTop: 2,
    marginBottom: 6,
    fontFamily: F.manrope,
    fontSize: 11,
    color: C.prMuted2,
  },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  th: {
    fontFamily: F.sora,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: C.muted2,
  },
  td: { fontFamily: F.manrope, fontSize: 12, color: C.prMuted },
  tdMoney: { fontFamily: F.sora, fontWeight: '700', color: C.accentL },
  thumbs: { flexDirection: 'row', gap: 8, marginTop: 8 },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  groupTotal: {
    marginTop: 8,
    textAlign: 'right',
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '700',
    color: C.prMuted,
  },
});
