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
import { kindDisputable, openDisputeKeys, receiptClaimState, weekDisputable } from '../lib/receipt-review';
import { buildCellEvidence } from '../lib/cell-evidence';
import { CellEvidenceSheet } from '../components/CellEvidenceSheet';
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

const INCOME_ROWS: { key: IncomeKey; label: string }[] = [
  { key: 'wages', label: 'Daily wages' },
  { key: 'drinks', label: 'Drinks' },
  { key: 'tips', label: 'Tips' },
  { key: 'others', label: 'Others' },
];

type LinkedReceipt = {
  id: string;
  ref: string;
  /**
   * The receipt's own running number, or null when this line has no receipt
   * behind it (a bare self-logged line, a legacy row).
   *
   * Worth showing even though `ref` already names the ORIGIN: this is the
   * identifier the server quotes back when it refuses the PR — "RCP-000007 has
   * already been reviewed by the agency" — and until now the PR had no way to
   * see it, so the refusal named something invisible to them.
   */
  receiptNo: string | null;
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
  const { token, me } = useSession();
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
        ? `(${liveOutlets.length})-outlet`
        : 'Outlet';
  // The stored voucher number (0075) is what the paper document prints, so the
  // phone shows the same string. The week-derived form below is the pre-0075
  // fallback — it gave every PR's voucher for a week the same number.
  const liveRef = (() => {
    if (weekForGrid?.voucherNo) return weekForGrid.voucherNo;
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
        // Three states, not two. A History voucher used to be signed or paid by
        // definition; since History began carrying every CLOSED week it can also
        // be one the PR has not signed, and calling that 'signed' is what removed
        // the only route to signing a voucher older than last week.
        status:
          hist.status === 'paid'
            ? ('paid' as const)
            : hist.status === 'signed'
              ? ('signed' as const)
              : ('awaiting_pr' as const),
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
  /**
   * Has this voucher actually been signed?
   *
   * This read `hist ? true : false` — being reachable from History WAS proof of a
   * signature, because History only ever held signed and paid vouchers. Once it
   * began carrying every closed week (3 Aug 2026) that stopped being true, and
   * the consequence was severe: a voucher the agency sent LATE appears only in
   * History, so it was sealed on arrival and the PR had nowhere left to sign it.
   * Ask the voucher, never the screen it was opened from.
   */
  const alreadySigned =
    (hist ? hist.status === 'signed' || hist.status === 'paid' : false) ||
    isSigned(pv.id) ||
    lastWeek?.status === 'signed' ||
    lastWeek?.status === 'paid';

  /**
   * Is this voucher actually waiting for THIS PR's signature?
   *
   * "Not signed" is two states, not one: a voucher the agency has not issued yet
   * (`pending_review`) and one it has sent (`sent`). Only the second can be
   * signed — the server answers the first with
   * `400 · "This voucher has not been sent to you yet"` — so offering the pad on a
   * pending voucher makes the PR draw a signature to be told no. That is exactly
   * what happened when the History sign-gate was first widened.
   */
  const awaitingMySignature = histVoucher
    ? histVoucher.status === 'sent'
    : lastWeek?.status === 'sent' || lastWeek?.status === 'awaiting_pr';

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
          receiptNo: l.receiptNo ?? null,
          item: l.item,
          category: l.kind === 'drinks' ? ('Drinks' as const) : ('Tips' as const),
          qty: l.quantity,
          amount: l.sales || l.commission,
          commission: l.commission,
          outlet: l.outlet ?? '—',
          at: lineDateLabel(l.lineDate),
          // `pending` now carries the parent receipt's REAL review state
          // (migration 0074), falling back to the manual-self-log guess only for
          // a line with no receipt behind it. So this badge means "not waiting
          // on the agency" — which is what it always claimed, and only recently
          // became true. Hardcoding it true once made every line assert it was
          // receipt-backed.
          matched: !l.pending,
        })),
    [weekForGrid],
  );
  // The signer IS the signed-in account, so this is derived, not typed.
  const sigName = me?.username?.trim() ?? '';
  const [signOpen, setSignOpen] = useState(false);
  /*
   * Red cells come from the SERVER's open claims, not local state.
   *
   * This screen used to keep its own `disputedKeys` set, toggled by its own
   * dispute sheet — which never called the server at all. A PR could "dispute"
   * here, watch the cell turn red, sign believing the claim was lodged, and the
   * agency would never hear of it. The sheet is gone; the marks are real now.
   */
  const disputedKeys = useMemo(() => openDisputeKeys(weekForGrid), [weekForGrid]);
  /** Which cell's evidence is open — the same sheet the Payment page uses. */
  const [evidenceTarget, setEvidenceTarget] = useState<{
    day: WeeklyDayPay;
    row: (typeof INCOME_ROWS)[number];
    amount: number;
  } | null>(null);
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

  /*
   * ONE dispute flow for the whole app — the Payment page's.
   *
   * This screen had its own sheet, and it was a fake: `submitDispute` toggled a
   * local Set and never called the server, so a claim "raised" while preparing
   * to sign was never lodged anywhere. It also predated every rule the real
   * flow now enforces — wages were tappable, no shift picker, no item picker.
   *
   * Rather than rebuild all of that here (a second copy that would drift), a
   * tap routes to Payment → Last week, where the real evidence sheet, pickers
   * and server call live. The PR reviews here, disputes there, comes back to
   * sign — and the red marks on this grid are the server's own open claims.
   */
  /** Any non-empty cell opens its evidence — wages included. */
  const openEvidence = (day: WeeklyDayPay, row: (typeof INCOME_ROWS)[number]) => {
    const amount = cellAmount(day, row.key);
    if (amount <= 0 || day.status === 'empty') return;
    setEvidenceTarget({ day, row, amount });
  };

  const anyDisputed = disputedKeys.size > 0;

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

      {/*
        * The BODY scrolls; only the back row above stays fixed.
        *
        * The root was a plain View, so this screen had NO vertical scroll at
        * all — everything past one screen height (net payable, records,
        * signature, the Sign button itself) was simply clipped, on the web
        * frame and on device alike. It survived because the content used to be
        * shorter than a phone. Bottom padding is the device inset, per the
        * flexible-UI rule.
        */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
      >
      <View style={styles.statusRow}>
        <Pill variant={anyDisputed ? 'red' : isSealed ? (pv.status === 'paid' ? 'green' : 'amber') : 'amber'}>
          {anyDisputed ? 'Dispute open' : isSealed ? pv.statusLabel : 'Pending your review'}
        </Pill>
        <Text style={styles.pvId}>{pv.ref}</Text>
      </View>

      {!isSealed && !anyDisputed && (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>
            {awaitingMySignature ? 'Pending your review' : 'Waiting for your agency'}
          </Text>
          {/*
           * Was hardcoded "Sign-by Sunday · Finance Head already signed". The
           * second half was simply untrue — no agency signature is captured
           * anywhere in the product, so `finance_head_signed_at` is NULL on every
           * voucher — and a PV screen that invents a counter-signature is telling
           * the PR the money has been approved by someone who never saw it.
           */}
          <Text style={styles.bannerBody}>
            {awaitingMySignature
              ? 'Review each day, then sign to confirm this week’s earnings.'
              : 'Your agency has not issued this voucher yet — you can review it, but there is nothing to sign until they send it.'}
          </Text>
        </View>
      )}
      {anyDisputed && (
        <View style={[styles.banner, styles.bannerDispute]}>
          <Text style={styles.bannerTitle}>Dispute open</Text>
          <Text style={styles.bannerBody}>
            Your agency is reviewing the flagged amounts — see Payment for the details.
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
                    // EVERY non-empty cell opens its details, wages included —
                    // the owner asked to inspect a figure, not only to argue
                    // with one. Whether it can be DISPUTED is decided inside the
                    // sheet, by the same rules the Payment page applies.
                    const canTap = amount > 0 && d.status !== 'empty';
                    return (
                      <Pressable
                        key={key}
                        style={[
                          styles.gridCol,
                          canTap && styles.gridColTap,
                          isDisputed && styles.gridColDisputed,
                        ]}
                        onPress={() => canTap && openEvidence(d, row)}
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
                // From the day's own status, never hardcoded — this row read
                // VERIFIED for every non-empty day, even under a banner saying
                // the voucher had not been issued.
                // 'approved' collapses into VERIFIED here for the same reason as
                // Payment's Last-week row: this document is always a CLOSED week,
                // so the agency's day sign-off is final. Showing APPROVED here
                // while Payment showed VERIFIED for the same day would be two
                // words for one fact, one tap apart.
                const label =
                  d.status === 'empty'
                    ? '—'
                    : dayDisputed
                      ? 'DISPUTED'
                      : d.status === 'pending'
                        ? 'PENDING'
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
          Tap a drinks or tips amount to dispute it on the Payment page — a{' '}
          <Text style={{ color: C.red }}>red</Text> amount already has an open dispute.
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
        ) : awaitingMySignature ? (
          <Text style={styles.pendingSig}>Pending</Text>
        ) : (
          // Names whose move it is. "Pending" alone read as "yours to do" beside a
          // Sign button that the server would have refused.
          <Text style={styles.pendingSig}>
            Not sent to you yet — waiting for your agency
          </Text>
        )}
      </View>

      {!isSealed && awaitingMySignature && (
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
      </ScrollView>

      {/*
        * THE SAME evidence sheet as Payment — one component, one format.
        *
        * Every row opens it, wages included: the PR asked to inspect a figure,
        * not only to argue with one, and wages have a shift and stamps behind
        * them worth reading. The DISPUTE button appears only under the rules
        * Payment applies (drinks/tips, a voucher the server still accepts, at
        * least one shift not already claimed) and hands off to Payment → Last
        * week, where the pickers and the server call live.
        */}
      {evidenceTarget && (
        <CellEvidenceSheet
          evidence={buildCellEvidence(
            weekForGrid,
            evidenceTarget.day.dateIso,
            evidenceTarget.row.key,
          )}
          cellAmount={evidenceTarget.amount}
          claims={receiptClaimState(
            weekForGrid,
            evidenceTarget.day.dateIso,
            evidenceTarget.row.key,
          )}
          onClose={() => setEvidenceTarget(null)}
          onDispute={
            kindDisputable(evidenceTarget.row.key) &&
            weekDisputable(weekForGrid) &&
            buildCellEvidence(weekForGrid, evidenceTarget.day.dateIso, evidenceTarget.row.key)
              .groups.flatMap((g) => g.receipts)
              .some((r) => {
                if (!r.receiptNo) return false;
                const claims = receiptClaimState(
                  weekForGrid,
                  evidenceTarget.day.dateIso,
                  evidenceTarget.row.key,
                );
                const openOnIt =
                  claims.openAll ||
                  (!!r.receiptId && claims.open.has(r.receiptId)) ||
                  claims.open.has(r.receiptNo);
                return !openOnIt;
              })
              ? () => {
                  setEvidenceTarget(null);
                  setTab('payment', { paymentWeek: 'last' });
                }
              : undefined
          }
        />
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
                <Text style={styles.detailV}>
                  {/* The number FIRST when there is one: it is what the agency
                      and the server both call this receipt, so it is the thing
                      a PR quotes when they ask about it. The origin stays
                      beside it rather than being replaced — "RCP-000007" alone
                      does not say whether it was scanned or self-logged. A line
                      with no receipt behind it keeps showing the origin only,
                      which is the honest answer, not a blank. */}
                  {receiptDetail.receiptNo
                    ? `${receiptDetail.receiptNo} · ${receiptDetail.ref}`
                    : receiptDetail.ref}
                </Text>
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
            {/*
             * The name is the signed-in account's, not a field.
             *
             * It used to be an empty TextInput with "Vicky" as a PLACEHOLDER, so
             * the PR had to retype their own name and `confirmSign` refused until
             * they did — a hard blocker made of nothing. It was also editable,
             * which meant the name recorded against a signature need not be the
             * account that gave it. The app already knows who is signed in, so it
             * states that and signs as them.
             */}
            <Text style={styles.fieldLabel}>Signing as</Text>
            <Text style={styles.sigAsName}>{sigName || 'this account'}</Text>
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
  sigAsName: {
    fontFamily: F.sora,
    fontSize: 15,
    fontWeight: '700',
    color: C.txt,
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
