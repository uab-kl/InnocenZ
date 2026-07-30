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
  buildLastWeekPayGrid,
  formatRM,
  getLastWeekAwaitingPv,
  weekPayGridTotal,
  type WeeklyDayPay,
} from '../lib/demo-shifts';
import { PAYMENT_HISTORY_WEEKS } from '../lib/demo-payment-history';
import { usePaymentHistory } from '../lib/payment-history';
import { useSession } from '../lib/session';
import {
  type PrReceiptLine,
  type PrReceiptSource,
  signMyVoucher,
} from '../lib/api';
import { usePrNav } from '../lib/pr-nav';
import { useSignedPvs } from '../lib/signed-pv';
import { Pill } from '../components/ui';
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

const DEMO_RECEIPTS: LinkedReceipt[] = [
  {
    id: 'r1',
    ref: 'RSV-0712-A',
    item: 'Hennessy VSOP',
    category: 'Drinks',
    qty: 1,
    amount: 125,
    commission: 18.75,
    outlet: 'Velvet 23',
    at: '12 Jul 2026 · 11:42 pm',
    matched: true,
  },
  {
    id: 'r2',
    ref: 'RSV-0712-B',
    item: 'Guest tip',
    category: 'Tips',
    qty: 1,
    amount: 40,
    commission: 4,
    outlet: 'Velvet 23',
    at: '12 Jul 2026 · 12:08 am',
    matched: true,
  },
  {
    id: 'r3',
    ref: 'RSV-0713-A',
    item: 'Moët & Chandon',
    category: 'Drinks',
    qty: 1,
    amount: 96,
    commission: 14.4,
    outlet: 'Velvet 23',
    at: '13 Jul 2026 · 11:55 pm',
    matched: true,
  },
  {
    id: 'r4',
    ref: 'RSV-0714-A',
    item: 'Cosmo',
    category: 'Drinks',
    qty: 1,
    amount: 109,
    commission: 16.35,
    outlet: 'Velvet 23',
    at: '14 Jul 2026 · 10:40 pm',
    matched: true,
  },
];

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

/**
 * Date only, from the shift day rather than the logging timestamp. The exact
 * minute a line was typed is not what a PR is checking, and inventing a time for
 * an auto-sealed line would read as precision the row does not have.
 */
function formatReceiptDay(line: PrReceiptLine): string {
  const iso = line.lineDate ?? line.at.slice(0, 10);
  const at = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
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
  const { isSigned, signPv } = useSignedPvs();
  const {
    weeks: apiWeeks,
    vouchers: apiVouchers,
    refresh: refreshHistory,
  } = usePaymentHistory();
  const { token } = useSession();
  const lastWeekPv = useMemo(() => getLastWeekAwaitingPv(), []);
  const hist =
    apiWeeks.find((p) => p.id === pvId) ?? PAYMENT_HISTORY_WEEKS.find((p) => p.id === pvId);
  /** Any unsigned review opens the live last-week PV (same as Payment → Last week). */
  const pv = hist
    ? {
        id: hist.id,
        ref: hist.ref,
        outlet: hist.outlet,
        weekLabel: hist.weekLabel,
        net: hist.net,
        status: hist.status === 'paid' ? ('paid' as const) : ('signed' as const),
        statusLabel: hist.statusMeta,
      }
    : lastWeekPv;
  const grid = useMemo(() => buildLastWeekPayGrid(), []);
  const gridTotal = useMemo(() => weekPayGridTotal(grid), [grid]);
  /** Net always matches Payment → Last week total. */
  const netDisplay = !hist && gridTotal > 0 ? gridTotal : pv.net;
  const displayWeekLabel = !hist ? lastWeekPv.weekLabel : pv.weekLabel;
  const alreadySigned =
    isSigned(lastWeekPv.id) || isSigned(pv.id) || (hist ? true : false);

  const [signed, setSigned] = useState(alreadySigned);
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
   * This voucher's id IF it is a real backend row. Demo vouchers come from
   * PAYMENT_HISTORY_WEEKS and there is no server to tell.
   */
  const backendPvId = useMemo(
    () => apiWeeks.find((p) => p.id === pvId)?.id ?? null,
    [apiWeeks, pvId],
  );

  /**
   * The commission evidence behind this voucher — real lines for a real voucher,
   * the demo list only for a demo one.
   *
   * This panel was hardcoded while the rest of the screen was already live, so
   * the fake rows read as genuine: a PR could open a real voucher and be shown
   * three drinks nobody sold. The lines were being served all along — no endpoint
   * needed adding, only reading.
   *
   * Drinks and tips only. Wages are not receipt-backed (they seal off the shift
   * clock) and belong to the grid above, not to evidence of a sale.
   *
   * An empty array is a real answer for a real voucher with no commission that
   * week, so it must NOT fall through to the demo rows — that is the exact
   * substitution this change exists to remove.
   */
  const linkedReceipts = useMemo<LinkedReceipt[]>(() => {
    const voucher = apiVouchers.find((v) => v.voucherId === pvId);
    if (!voucher) return DEMO_RECEIPTS;
    return voucher.lines
      .filter((line) => line.kind === 'drinks' || line.kind === 'tips')
      .map((line) => ({
        id: line.id,
        ref: SOURCE_LABEL[line.source],
        item: line.item,
        category: line.kind === 'tips' ? ('Tips' as const) : ('Drinks' as const),
        qty: line.quantity,
        amount: line.sales,
        commission: line.commission,
        outlet: line.outlet ?? '—',
        at: formatReceiptDay(line),
        // `pending` is set only for a manual self-log, which is precisely the
        // "not matched to a receipt" case the agency verifies.
        matched: !line.pending,
      }));
  }, [apiVouchers, pvId]);

  /** True when the rows above are this voucher's own, not the demo placeholder. */
  const receiptsAreReal = useMemo(
    () => apiVouchers.some((v) => v.voucherId === pvId),
    [apiVouchers, pvId],
  );

  const confirmSign = () => {
    if (sigName.trim().length < 2) return;
    const sealed = {
      ...lastWeekPv,
      net: netDisplay,
      status: 'signed' as const,
      statusLabel: 'Signed',
    };
    signPv({
      pv: sealed,
      net: netDisplay,
      grid,
      sigName: sigName.trim(),
    });

    // Tell the agency. Until this call existed the signature lived only in
    // AsyncStorage, so nobody but this phone ever knew the PV was accepted.
    if (backendPvId && token) {
      signMyVoucher(token, backendPvId)
        .then(() => refreshHistory())
        .catch((e: unknown) => {
          // Not swallowed: the PR has to know the agency was not told, because
          // the local seal above makes it look like it was. The endpoint is
          // idempotent, so signing again is the fix.
          Alert.alert(
            'Signed on this device only',
            `${e instanceof Error ? e.message : 'Could not reach the agency.'}\n\nOpen this voucher and sign again when you have signal.`,
          );
        });
    }

    setSigned(true);
    setSignOpen(false);
    setTab('history');
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
    <View style={styles.screen}>
      <View style={styles.topRow}>
        <Pressable style={styles.back} onPress={goBack}>
          <ChevronLeft size={20} color={C.goldL} />
          <Text style={styles.backText}>Payment</Text>
        </Pressable>
        <Pressable onPress={goBack} hitSlop={8}>
          <XIcon size={18} color={C.muted} />
        </Pressable>
      </View>

      <View style={styles.statusRow}>
        <Pill variant={anyDisputed ? 'red' : signed ? (pv.status === 'paid' ? 'green' : 'amber') : 'amber'}>
          {anyDisputed ? 'Dispute open' : signed ? pv.statusLabel : 'Pending your review'}
        </Pill>
        <Text style={styles.pvId}>{lastWeekPv.ref}</Text>
      </View>

      {!signed && !anyDisputed && (
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
        <Text style={styles.summaryBody}>PR Personnel · {lastWeekPv.outlet}</Text>
      </View>

      <Pressable style={styles.collapse} onPress={() => setReceiptsOpen((o) => !o)}>
        {/* Not all real rows are scans — a self-log and a check-out seal reach
            this list too, so the heading only claims "scans" for the demo set. */}
        <Text style={styles.collapseTitle}>
          {receiptsAreReal ? 'DRINK & TIP RECORDS' : 'LINKED RECEIPT SCANS'}
        </Text>
        <Text style={styles.collapseAction}>{receiptsOpen ? 'Hide' : 'Details'}</Text>
      </Pressable>
      {receiptsOpen && (
        <View style={styles.receiptBox}>
          {linkedReceipts.length === 0 ? (
            <Text style={styles.receiptMeta}>
              No drink or tip records for this week — this voucher is wages only.
            </Text>
          ) : (
            linkedReceipts.map((r) => (
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
            ))
          )}
        </View>
      )}

      <View style={styles.sigCard}>
        <Text style={styles.sectionLabel}>YOUR SIGNATURE</Text>
        <Text style={styles.sigRole}>PR Personnel</Text>
        {signed ? (
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

      {!signed && (
        <Pressable
          style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
          onPress={() => setSignOpen(true)}
        >
          <Pencil size={16} color="#241a08" />
          <Text style={styles.primaryText}>Sign payment voucher</Text>
        </Pressable>
      )}

      {signed && pv.status === 'paid' && (
        <View style={styles.paidBox}>
          <Shield size={16} color={C.green} />
          <Text style={styles.paidText}>PAID · {formatRM(netDisplay)} in your bank</Text>
        </View>
      )}

      {signed && (
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
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Sign payment voucher</Text>
            <Text style={styles.sheetHint}>
              Type your floor nickname as signature (demo pad).
            </Text>
            <Text style={styles.fieldLabel}>Signature</Text>
            <TextInput
              value={sigName}
              onChangeText={setSigName}
              style={styles.input}
              placeholder="Vicky"
              placeholderTextColor={C.muted2}
            />
            <View style={styles.sigPad}>
              <Text style={styles.sigPadText}>{sigName || 'Sign here'}</Text>
            </View>
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
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
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
