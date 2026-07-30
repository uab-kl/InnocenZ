/**
 * PV detail — port of InnocenZ-proto `/host/PaymentVoucher?pvId=`
 * Full week summary (wages/drinks/tips/others/status), linked receipt details, sign + dispute.
 */
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { C, F, GRADIENTS, grad } from '../theme/theme';
import {
  formatRM,
  weekPayGridTotal,
  weekRangeLabel,
  type DemoPv,
  type WeeklyDayPay,
} from '../lib/demo-shifts';
import { buildWeekGridFromLines } from '../lib/week-pay-grid';
import { useAwaitingLastWeekPv } from '../lib/awaiting-pv';
import { usePaymentHistory } from '../lib/payment-history';
import { useSession } from '../lib/session';
import {
  signMyVoucher,
  type PrCurrentWeek,
  type PrReceiptSource,
} from '../lib/api';
import { usePrNav } from '../lib/pr-nav';
import { useSignedPvs } from '../lib/signed-pv';
import { useKeyboardInset } from '../lib/use-keyboard-inset';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pill } from '../components/ui';
import { SignaturePad, type SignatureInk } from '../components/SignaturePad';
import {
  Check,
  ChevronLeft,
  Flag,
  Pencil,
  Shield,
  Wallet,
  XIcon,
} from '../components/icons';

type IncomeKey = 'wages' | 'drinks' | 'tips' | 'others';

const DISPUTE_PRESETS = [
  'Unmatch commission',
  'Missing record',
  'Unmatch wages',
  'Repeated record',
  'Others',
] as const;

const INCOME_ROWS: { key: IncomeKey; label: string }[] = [
  { key: 'wages', label: 'Daily wages' },
  { key: 'drinks', label: 'Drinks' },
  { key: 'tips', label: 'Tips' },
  { key: 'others', label: 'Others' },
];

type LinkedReceipt = {
  id: string;
  ref: string;
  item: string;
  category: 'Drinks' | 'Tips';
  qty: number;
  amount: number;
  commission: number;
  outlet: string;
  at: string;
  matched: boolean;
};

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-07-21' → '21 Jul 2026' for the linked receipt rows. */
/**
 * What the row headline says instead of a receipt number.
 *
 * `payment_voucher_line` carries no receipt_no — the number lives on
 * `payment_voucher_receipt`, which the /mine payloads do not join. Rather than
 * print a shortened row id dressed up as a reference, say where the record came
 * from: that is the fact a PR needs when a line is queried, and it is the same
 * distinction the agency's verify panel acts on.
 */
const SOURCE_LABEL: Record<PrReceiptSource, string> = {
  scan: 'Scanned receipt',
  manual: 'Self-logged',
  checkin: 'Auto-sealed on check-out',
};

function lineDateLabel(iso: string | null): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '—';
  return `${Number(m[3])} ${MONTH_SHORT[Number(m[2]) - 1]} ${m[1]}`;
}

function cellAmount(day: WeeklyDayPay, key: IncomeKey): number {
  if (key === 'wages') return day.wages;
  if (key === 'drinks') return day.drinks ?? 0;
  if (key === 'tips') return day.tips ?? 0;
  return day.others ?? 0;
}

function formatCell(value: number): string {
  if (value <= 0) return '—';
  return value.toFixed(2);
}

export function PvDetailScreen({ pvId }: { pvId: string }) {
  const { goBack, setTab } = usePrNav();
  // Detail screens render outside the tab shell, so the back row must clear
  // the phone's own status bar or it becomes untouchable.
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  const { isSigned, signPv } = useSignedPvs();
  const { weeks: apiWeeks, vouchers: apiVouchers, refresh: refreshHistory } = usePaymentHistory();
  const { token } = useSession();
  // The real last-week voucher — the only PV a PR can still sign ("one week,
  // one PV"). Signed/paid weeks arrive through payment history instead.
  const { lastWeek } = useAwaitingLastWeekPv();

  const hist = apiWeeks.find((p) => p.id === pvId);
  const histVoucher = apiVouchers.find((v) => v.voucherId === pvId) ?? null;

  /** Whatever voucher this page shows, in the shared week-grid shape. */
  const weekForGrid: PrCurrentWeek | null = histVoucher
    ? {
        voucherId: histVoucher.voucherId,
        weekStart: histVoucher.weekStart?.slice(0, 10) ?? '',
        weekEnd: histVoucher.weekEnd?.slice(0, 10) ?? '',
        net: histVoucher.net,
        status: histVoucher.status,
        lines: histVoucher.lines,
      }
    : lastWeek;

  const liveOutlets = useMemo(
    () =>
      [
        ...new Set(
          (weekForGrid?.lines ?? []).map((l) => l.outlet?.trim()).filter(Boolean) as string[],
        ),
      ],
    [weekForGrid],
  );
  const liveOutlet =
    liveOutlets.length === 1
      ? liveOutlets[0]!
      : liveOutlets.length > 1
        ? `Multi-outlet (${liveOutlets.length})`
        : 'Outlet';
  const liveRef = (() => {
    const m = (weekForGrid?.weekEnd ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `PV-${m[1]}${m[2]}${m[3]}` : `PV-${pvId.slice(0, 8).toUpperCase()}`;
  })();

  /** Any unsigned review opens the live last-week PV (same as Payment → Last week). */
  const pv: DemoPv = hist
    ? {
        id: hist.id,
        ref: hist.ref,
        outlet: hist.outlet,
        weekLabel: hist.weekLabel,
        net: hist.net,
        status: hist.status === 'paid' ? ('paid' as const) : ('signed' as const),
        statusLabel: hist.statusMeta,
      }
    : {
        id: lastWeek?.voucherId ?? pvId,
        ref: liveRef,
        outlet: liveOutlet,
        weekLabel: weekRangeLabel(1),
        net: Number(lastWeek?.net) || 0,
        status: 'awaiting_pr',
        statusLabel: 'Awaiting signature',
      };
  const grid = useMemo(() => buildWeekGridFromLines(weekForGrid), [weekForGrid]);
  const gridTotal = useMemo(() => weekPayGridTotal(grid), [grid]);
  /** Net always matches Payment → Last week total. */
  const netDisplay = !hist && gridTotal > 0 ? gridTotal : pv.net;
  const displayWeekLabel = pv.weekLabel;
  const alreadySigned =
    (hist ? true : false) ||
    isSigned(pv.id) ||
    lastWeek?.status === 'signed' ||
    lastWeek?.status === 'paid';

  const [signed, setSigned] = useState(alreadySigned);
  // hist / lastWeek load async, so the seal must follow the data, not the
  // initial render's state snapshot.
  const isSealed = signed || alreadySigned;

  /** The voucher's real drink/tip lines — replaces the demo receipt slips. */
  const linkedReceipts: LinkedReceipt[] = useMemo(
    () =>
      (weekForGrid?.lines ?? [])
        .filter((l) => (l.kind === 'drinks' || l.kind === 'tips') && l.commission > 0)
        .map((l) => ({
          id: l.id,
          ref: SOURCE_LABEL[l.source],
          item: l.item,
          category: l.kind === 'drinks' ? ('Drinks' as const) : ('Tips' as const),
          qty: l.quantity,
          amount: l.sales || l.commission,
          commission: l.commission,
          outlet: l.outlet ?? '—',
          at: lineDateLabel(l.lineDate),
          // `pending` is set only for a manual self-log, which is precisely the
          // "not matched to a receipt" case the agency verifies. Hardcoding this
          // true made the badge say every line was receipt-backed.
          matched: !l.pending,
        })),
    [weekForGrid],
  );
  const [sigName, setSigName] = useState('');
  const [signOpen, setSignOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputePreset, setDisputePreset] = useState<string>(DISPUTE_PRESETS[0]);
  const [disputeNote, setDisputeNote] = useState('');
  const [disputedKeys, setDisputedKeys] = useState<Set<string>>(() => new Set());
  const [disputeTargetLabel, setDisputeTargetLabel] = useState('');
  const [receiptsOpen, setReceiptsOpen] = useState(true);
  const [receiptDetail, setReceiptDetail] = useState<LinkedReceipt | null>(null);

  /**
   * This voucher's id IF it is a real backend row — an archived history
   * voucher OR the live last-week PV awaiting signature. History used to be
   * the only source, so signing an awaiting voucher never reached the server
   * and the "signature" lived on this phone alone.
   */
  const backendPvId =
    histVoucher?.voucherId ?? (lastWeek?.voucherId === pvId ? pvId : null);

  const [signBusy, setSignBusy] = useState(false);
  const [sigInk, setSigInk] = useState<SignatureInk | null>(null);

  const confirmSign = async () => {
    if (sigName.trim().length < 2 || signBusy) return;
    if (!sigInk) {
      Alert.alert('Draw your signature', 'Sign in the pad with your finger before confirming.');
      return;
    }
    if (!backendPvId || !token) {
      Alert.alert(
        'No voucher to sign yet',
        'This voucher is not on the server — go back, refresh Payment, and try again.',
      );
      return;
    }
    setSignBusy(true);
    try {
      // Database first: the signature only counts once payment_voucher.status
      // is 'signed' server-side. The local seal and the History redirect come
      // strictly after the commit, never before.
      await signMyVoucher(token, backendPvId, sigInk);
      signPv({
        pv: { ...pv, net: netDisplay, status: 'signed', statusLabel: 'Signed' },
        net: netDisplay,
        grid,
        sigName: sigName.trim(),
      });
      await refreshHistory();
      setSigned(true);
      setSignOpen(false);
      setTab('history');
    } catch (e: unknown) {
      Alert.alert(
        'Not signed',
        `${e instanceof Error ? e.message : 'Could not reach the agency.'}\n\nNothing was saved — try again when you have signal.`,
      );
    } finally {
      setSignBusy(false);
    }
  };

  const openDispute = (day: WeeklyDayPay, row: (typeof INCOME_ROWS)[number]) => {
    const amount = cellAmount(day, row.key);
    if (amount <= 0 || day.status === 'empty') return;
    const key = `${day.dateIso}-${row.key}`;
    const label = `${day.day} ${day.date} · ${row.label} · ${formatRM(amount)}`;
    setDisputeTargetLabel(`${key}|${label}`);
    setDisputeNote(`${row.label} · ${day.day} ${day.date} · ${formatRM(amount)} — please verify`);
    setDisputePreset(DISPUTE_PRESETS[0]);
    setDisputeOpen(true);
  };

  const submitDispute = () => {
    const key = disputeTargetLabel.split('|')[0];
    if (key) {
      setDisputedKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    }
    setDisputeOpen(false);
  };

  const anyDisputed = disputedKeys.size > 0;
  const disputeModeWithdraw = (() => {
    const key = disputeTargetLabel.split('|')[0];
    return key ? disputedKeys.has(key) : false;
  })();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topRow}>
        <Pressable style={styles.back} onPress={goBack} hitSlop={10}>
          <ChevronLeft size={20} color={C.goldL} />
          <Text style={styles.backText}>Payment</Text>
        </Pressable>
        <Pressable onPress={goBack} hitSlop={10}>
          <XIcon size={18} color={C.muted} />
        </Pressable>
      </View>

      <View style={styles.statusRow}>
        <Pill variant={anyDisputed ? 'red' : isSealed ? (pv.status === 'paid' ? 'green' : 'amber') : 'amber'}>
          {anyDisputed ? 'Dispute open' : isSealed ? pv.statusLabel : 'Pending your review'}
        </Pill>
        <Text style={styles.pvId}>{pv.ref}</Text>
      </View>

      {!isSealed && !anyDisputed && (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>Pending your review</Text>
          <Text style={styles.bannerBody}>Sign-by Sunday · Finance Head already signed</Text>
        </View>
      )}
      {anyDisputed && (
        <View style={[styles.banner, styles.bannerDispute]}>
          <Text style={styles.bannerTitle}>Dispute open</Text>
          <Text style={styles.bannerBody}>
            {disputePreset} — agency will review flagged amounts
          </Text>
        </View>
      )}

      <View style={styles.weekCard}>
        <Text style={styles.sectionLabel}>WEEK SUMMARY</Text>
        <Text style={styles.weekLabel}>{displayWeekLabel}</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          style={{ marginTop: 10 }}
        >
          <View>
            <View style={styles.gridRow}>
              <Text style={[styles.gridLabel, { width: 78 }]}> </Text>
              {grid.map((d) => (
                <View key={d.dateIso} style={styles.gridCol}>
                  <Text style={styles.gridDay}>{d.day}</Text>
                  <Text style={styles.gridDate}>{d.date}</Text>
                </View>
              ))}
              <View style={styles.gridCol}>
                <Text style={styles.gridDay}>TOT</Text>
                <Text style={styles.gridDate}> </Text>
              </View>
            </View>

            {INCOME_ROWS.map((row) => {
              const rowTotal = grid.reduce((s, d) => s + cellAmount(d, row.key), 0);
              return (
                <View key={row.key} style={styles.gridRow}>
                  <Text style={styles.gridLabel}>{row.label}</Text>
                  {grid.map((d) => {
                    const amount = cellAmount(d, row.key);
                    const key = `${d.dateIso}-${row.key}`;
                    const isDisputed = disputedKeys.has(key);
                    const canTap = amount > 0 && d.status !== 'empty';
                    return (
                      <Pressable
                        key={key}
                        style={[
                          styles.gridCol,
                          canTap && styles.gridColTap,
                          isDisputed && styles.gridColDisputed,
                        ]}
                        onPress={() => canTap && openDispute(d, row)}
                        disabled={!canTap}
                      >
                        <Text
                          style={[
                            styles.gridVal,
                            isDisputed && styles.gridValDisputed,
                          ]}
                        >
                          {formatCell(amount)}
                        </Text>
                        {canTap && (
                          <Flag
                            size={9}
                            color={isDisputed ? C.red : C.muted2}
                            style={{ marginTop: 2 }}
                          />
                        )}
                      </Pressable>
                    );
                  })}
                  <View style={styles.gridCol}>
                    <Text style={styles.gridVal}>{formatCell(rowTotal)}</Text>
                  </View>
                </View>
              );
            })}

            <View style={styles.gridRow}>
              <Text style={styles.gridLabel}>Status</Text>
              {grid.map((d) => {
                const dayDisputed = INCOME_ROWS.some((r) =>
                  disputedKeys.has(`${d.dateIso}-${r.key}`),
                );
                const label =
                  d.status === 'empty'
                    ? '—'
                    : dayDisputed
                      ? 'DISPUTED'
                      : 'VERIFIED';
                return (
                  <View key={`st-${d.dateIso}`} style={styles.gridCol}>
                    <Text
                      style={[
                        styles.statusPill,
                        dayDisputed && styles.statusPillDisputed,
                        d.status === 'empty' && { color: C.muted2 },
                      ]}
                    >
                      {label}
                    </Text>
                  </View>
                );
              })}
              <View style={styles.gridCol}>
                <Text style={styles.statusPill}>
                  {grid.filter((d) => d.status === 'verified').length} verified
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>

        <Text style={styles.tapHint}>
          Tap any amount to dispute · tap a{' '}
          <Text style={{ color: C.red }}>red</Text> amount to withdraw a mistaken dispute.
        </Text>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryK}>Net payable</Text>
        <Text style={styles.summaryV}>{formatRM(netDisplay)}</Text>
        <Text style={[styles.summaryK, { marginTop: 10 }]}>Payee</Text>
        <Text style={styles.summaryBody}>PR Personnel · {pv.outlet}</Text>
      </View>

      {linkedReceipts.length > 0 && (
        <Pressable style={styles.collapse} onPress={() => setReceiptsOpen((o) => !o)}>
          {/* Not all of these are scans — a self-log and a check-out seal reach
              this list too, and the demo fallback is gone, so the heading can
              stop claiming a scan for every row. */}
          <Text style={styles.collapseTitle}>DRINK &amp; TIP RECORDS</Text>
          <Text style={styles.collapseAction}>{receiptsOpen ? 'Hide' : 'Details'}</Text>
        </Pressable>
      )}
      {receiptsOpen && linkedReceipts.length > 0 && (
        <View style={styles.receiptBox}>
          {linkedReceipts.map((r) => (
            <Pressable
              key={r.id}
              style={styles.receiptRow}
              onPress={() => setReceiptDetail(r)}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.receiptRef}>{r.ref}</Text>
                <Text style={styles.receiptMeta}>
                  {r.item} · {formatRM(r.amount)}
                </Text>
              </View>
              <View style={styles.receiptRight}>
                <Text style={styles.receiptMatched}>
                  {r.matched ? 'Matched' : 'Pending'}
                </Text>
                <Text style={styles.receiptDetailsLink}>Details</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.sigCard}>
        <Text style={styles.sectionLabel}>YOUR SIGNATURE</Text>
        <Text style={styles.sigRole}>PR Personnel</Text>
        {isSealed ? (
          <View style={styles.signedRow}>
            <Check size={16} color={C.green} />
            <Text style={styles.signedText}>
              Signed{sigName ? ` · ${sigName}` : ''} — Dual-signed · transfer processing
            </Text>
          </View>
        ) : (
          <Text style={styles.pendingSig}>Pending</Text>
        )}
      </View>

      {!isSealed && (
        <Pressable
          style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
          onPress={() => setSignOpen(true)}
        >
          <Pencil size={16} color="#241a08" />
          <Text style={styles.primaryText}>Sign payment voucher</Text>
        </Pressable>
      )}

      {isSealed && pv.status === 'paid' && (
        <View style={styles.paidBox}>
          <Shield size={16} color={C.green} />
          <Text style={styles.paidText}>PAID · {formatRM(netDisplay)} in your bank</Text>
        </View>
      )}

      {isSealed && (
        <Pressable style={styles.soft} onPress={() => setTab('history')}>
          <Text style={styles.softText}>View in History · Payment history</Text>
        </Pressable>
      )}

      {/* Receipt details sheet */}
      <Modal
        visible={receiptDetail != null}
        transparent
        animationType="slide"
        onRequestClose={() => setReceiptDetail(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setReceiptDetail(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.receiptSheetHead}>
              <Wallet size={18} color={C.goldL} />
              <Text style={styles.sheetTitle}>Receipt details</Text>
            </View>
            {receiptDetail && (
              <>
                <Text style={styles.detailK}>DATE &amp; TIME</Text>
                <Text style={styles.detailV}>{receiptDetail.at}</Text>
                <Text style={styles.detailK}>OUTLET</Text>
                <Text style={styles.detailV}>{receiptDetail.outlet}</Text>
                <Text style={styles.detailK}>RECEIPT</Text>
                <Text style={styles.detailV}>{receiptDetail.ref}</Text>
                <Text style={styles.detailK}>COMMISSION</Text>
                <Text style={[styles.detailV, { color: C.accentL }]}>
                  {formatRM(receiptDetail.commission)}
                </Text>
                <View style={styles.detailFoot}>
                  <Text style={styles.detailFootL}>
                    {receiptDetail.qty}× {receiptDetail.category}
                    {receiptDetail.item !== 'Guest tip' ? ` · ${receiptDetail.item}` : ''}
                  </Text>
                  <Text style={styles.detailFootR}>{formatRM(receiptDetail.amount)}</Text>
                </View>
                <View style={styles.matchedBanner}>
                  <Check size={14} color={C.green} />
                  <Text style={styles.matchedBannerText}>
                    {receiptDetail.matched ? 'Matched to this PV' : 'Pending agency verify'}
                  </Text>
                </View>
              </>
            )}
            <Pressable style={styles.sheetCancel} onPress={() => setReceiptDetail(null)}>
              <Text style={styles.sheetCancelText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Signature sheet */}
      <Modal visible={signOpen} transparent animationType="slide" onRequestClose={() => setSignOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSignOpen(false)}>
          <Pressable
            style={[styles.sheet, keyboardInset > 0 && { paddingBottom: keyboardInset + 16 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.sheetTitle}>Sign payment voucher</Text>
            <Text style={styles.sheetHint}>
              Draw your signature with your finger — it is stored on the voucher
              and printed on the PDF.
            </Text>
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              value={sigName}
              onChangeText={setSigName}
              style={styles.input}
              placeholder="Vicky"
              placeholderTextColor={C.muted2}
            />
            <Text style={styles.fieldLabel}>Signature</Text>
            <SignaturePad onChange={setSigInk} />
            <Pressable
              style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
              onPress={confirmSign}
            >
              <Text style={styles.primaryText}>Confirm signature</Text>
            </Pressable>
            <Pressable style={styles.sheetCancel} onPress={() => setSignOpen(false)}>
              <Text style={styles.sheetCancelText}>Back</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Dispute sheet */}
      <Modal
        visible={disputeOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setDisputeOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setDisputeOpen(false)}>
          <Pressable
            style={[styles.sheet, keyboardInset > 0 && { paddingBottom: keyboardInset + 16 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.sheetTitle}>
              {disputeModeWithdraw ? 'Withdraw dispute?' : 'Dispute this amount'}
            </Text>
            {!!disputeTargetLabel.includes('|') && (
              <View style={styles.targetPill}>
                <Text style={styles.targetPillText}>
                  {disputeTargetLabel.split('|')[1]}
                </Text>
              </View>
            )}
            {!disputeModeWithdraw ? (
              <>
                <Text style={styles.fieldLabel}>Quick reason</Text>
                <View style={styles.presetWrap}>
                  {DISPUTE_PRESETS.map((p) => (
                    <Pressable
                      key={p}
                      style={[styles.presetChip, disputePreset === p && styles.presetChipOn]}
                      onPress={() => setDisputePreset(p)}
                    >
                      <Text
                        style={[
                          styles.presetChipText,
                          disputePreset === p && { color: C.violetL },
                        ]}
                      >
                        {p}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.fieldLabel}>Note</Text>
                <TextInput
                  value={disputeNote}
                  onChangeText={setDisputeNote}
                  style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]}
                  multiline
                  placeholderTextColor={C.muted2}
                />
                <Pressable
                  style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
                  onPress={submitDispute}
                >
                  <Text style={styles.primaryText}>Submit dispute</Text>
                </Pressable>
              </>
            ) : (
              <Pressable style={styles.dangerBtn} onPress={submitDispute}>
                <Text style={styles.dangerBtnText}>Withdraw dispute</Text>
              </Pressable>
            )}
            <Pressable style={styles.sheetCancel} onPress={() => setDisputeOpen(false)}>
              <Text style={styles.sheetCancelText}>Back</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 10, paddingHorizontal: 18, paddingBottom: 26 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontFamily: F.sora, fontSize: 16, fontWeight: '700', color: C.txt },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  pvId: { fontFamily: F.sora, fontSize: 13, fontWeight: '700', color: C.prMuted },
  banner: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(232,198,106,0.35)',
    backgroundColor: C.amberBg,
    padding: 12,
  },
  bannerDispute: {
    borderColor: 'rgba(240,138,138,0.4)',
    backgroundColor: C.redBg,
  },
  bannerTitle: { fontFamily: F.sora, fontSize: 14, fontWeight: '700', color: C.txt },
  bannerBody: { marginTop: 2, fontFamily: F.manrope, fontSize: 12, color: C.prMuted },
  weekCard: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 14,
  },
  sectionLabel: {
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: C.muted2,
  },
  weekLabel: { marginTop: 4, fontFamily: F.sora, fontSize: 16, fontWeight: '700', color: C.txt },
  gridRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  gridLabel: {
    width: 78,
    fontFamily: F.manrope,
    fontSize: 11,
    color: C.muted2,
  },
  gridCol: { width: 56, alignItems: 'center', paddingVertical: 2 },
  gridColTap: {
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  gridColDisputed: {
    backgroundColor: 'rgba(240,138,138,0.1)',
  },
  gridDay: { fontFamily: F.sora, fontSize: 10, fontWeight: '700', color: C.muted2 },
  gridDate: { fontFamily: F.manrope, fontSize: 11, color: C.prMuted },
  gridVal: { fontFamily: F.sora, fontSize: 12, fontWeight: '700', color: C.txt },
  gridValDisputed: { color: C.red },
  statusPill: {
    fontFamily: F.sora,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.3,
    color: C.green,
    textAlign: 'center',
  },
  statusPillDisputed: { color: C.red },
  tapHint: {
    marginTop: 4,
    fontFamily: F.manrope,
    fontSize: 11,
    color: C.prMuted2,
    textAlign: 'center',
    lineHeight: 16,
  },
  summaryCard: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line2,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  summaryK: {
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: C.muted2,
  },
  summaryV: {
    marginTop: 4,
    fontFamily: F.sora,
    fontSize: 28,
    fontWeight: '800',
    color: C.accentL,
  },
  summaryBody: { fontFamily: F.manrope, fontSize: 14, color: C.txt },
  collapse: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  collapseTitle: {
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: C.muted2,
  },
  collapseAction: { fontFamily: F.sora, fontSize: 13, fontWeight: '600', color: C.goldL },
  receiptBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    overflow: 'hidden',
  },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  receiptRef: { fontFamily: F.sora, fontSize: 13, fontWeight: '700', color: C.txt },
  receiptMeta: { marginTop: 2, fontFamily: F.manrope, fontSize: 12, color: C.prMuted },
  receiptRight: { alignItems: 'flex-end', gap: 4 },
  receiptMatched: {
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '700',
    color: C.green,
  },
  receiptDetailsLink: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '600',
    color: C.goldL,
  },
  sigCard: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line2,
    padding: 14,
  },
  sigRole: { marginTop: 4, fontFamily: F.manrope, fontSize: 13, color: C.prMuted },
  signedRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  signedText: { flex: 1, fontFamily: F.manrope, fontSize: 13, color: C.green },
  pendingSig: { marginTop: 8, fontFamily: F.sora, fontSize: 14, fontWeight: '700', color: C.amber },
  primary: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
  },
  primaryText: { fontFamily: F.sora, fontSize: 16, fontWeight: '700', color: '#241a08' },
  soft: { marginTop: 12, alignItems: 'center', padding: 10 },
  softText: { fontFamily: F.sora, fontSize: 14, fontWeight: '600', color: C.goldL },
  paidBox: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: C.greenBg,
    borderWidth: 1,
    borderColor: 'rgba(93,217,160,0.35)',
  },
  paidText: { fontFamily: F.sora, fontSize: 14, fontWeight: '700', color: C.green },
  backdrop: {
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
  receiptSheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sheetTitle: { fontFamily: F.sora, fontSize: 20, fontWeight: '800', color: C.txt },
  sheetHint: {
    marginTop: 6,
    marginBottom: 8,
    fontFamily: F.manrope,
    fontSize: 13,
    color: C.prMuted,
  },
  detailK: {
    marginTop: 12,
    fontFamily: F.sora,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: C.muted2,
  },
  detailV: {
    marginTop: 4,
    fontFamily: F.sora,
    fontSize: 15,
    fontWeight: '700',
    color: C.txt,
  },
  detailFoot: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  detailFootL: { fontFamily: F.manrope, fontSize: 13, color: C.prMuted, flex: 1 },
  detailFootR: { fontFamily: F.sora, fontSize: 16, fontWeight: '800', color: C.txt },
  matchedBanner: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: C.greenBg,
    borderWidth: 1,
    borderColor: 'rgba(93,217,160,0.35)',
  },
  matchedBannerText: { fontFamily: F.sora, fontSize: 12, fontWeight: '700', color: C.green },
  fieldLabel: {
    marginTop: 10,
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
  targetPill: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(0,0,0,0.28)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  targetPillText: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '700',
    color: C.goldL,
  },
  presetWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  presetChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  presetChipOn: {
    borderColor: 'rgba(183,156,232,0.5)',
    backgroundColor: 'rgba(183,156,232,0.14)',
  },
  presetChipText: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '600',
    color: C.txt,
  },
  sigPad: {
    marginTop: 12,
    height: 88,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.line2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  sigPadText: {
    fontFamily: F.playfair,
    fontSize: 28,
    fontStyle: 'italic',
    color: C.txt,
  },
  sheetCancel: { marginTop: 10, alignItems: 'center', padding: 10 },
  sheetCancelText: { fontFamily: F.sora, fontSize: 14, fontWeight: '600', color: C.muted },
  dangerBtn: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: C.redBg,
    borderWidth: 1,
    borderColor: 'rgba(240,138,138,0.4)',
  },
  dangerBtnText: { fontFamily: F.sora, fontSize: 16, fontWeight: '700', color: C.red },
});
