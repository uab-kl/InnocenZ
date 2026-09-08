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
import { font } from '../theme/fonts';
import {
  formatRM,
  weekPayGridTotal,
  weekRangeLabel,
  type DemoPv,
  type WeeklyDayPay,
} from '../lib/demo-shifts';
import { buildWeekGridFromLines, type GridBucket } from '../lib/week-pay-grid';
import {
  kindDisputable,
  openDisputeKeys,
  receiptClaimState,
  weekDisputable,
} from '../lib/receipt-review';
import { buildCellEvidence } from '../lib/cell-evidence';
import { CellEvidenceSheet } from '../components/CellEvidenceSheet';
import { useAwaitingLastWeekPv } from '../lib/awaiting-pv';
import { usePaymentHistory } from '../lib/payment-history';
import { useSession } from '../lib/session';
import {
  signMyVoucher,
  type PrCurrentWeek,
  type PrReceiptLine,
  type PrReceiptSource,
} from '../lib/api';
import { usePrNav } from '../lib/pr-nav';
import { formatMessage, useLocale, type AppTranslations } from '../i18n';
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

/**
 * `key` is the DATA — a `GridBucket`, matched against `l.kind` and the cell
 * lookups, so it stays English. `label` is what the PR reads, and it has to be
 * a FUNCTION: this map is module scope, evaluated before any hook can run, so
 * it cannot hold a resolved string from the active locale.
 */
const INCOME_ROWS: {
  key: IncomeKey;
  label: (t: AppTranslations) => string;
}[] = [
  { key: 'wages', label: (t) => t.pv.rowWages },
  { key: 'drinks', label: (t) => t.shiftStatus.drinks },
  { key: 'tips', label: (t) => t.shiftStatus.tips },
  { key: 'others', label: (t) => t.pv.rowOthers },
];

/**
 * The rows this document DRAWS. Same split as the Payment grid — Deductions is
 * a fifth row, not a fifth kind of income — and it must stay the same split:
 * both screens render the SAME voucher, and a PR shown two different
 * breakdowns of one week has no way to tell which one is their payslip.
 */
const GRID_ROWS: {
  key: GridBucket;
  label: (t: AppTranslations) => string;
}[] = [...INCOME_ROWS, { key: 'deductions', label: (t) => t.pv.rowDeductions }];

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
  /**
   * A DISCRIMINANT, not copy. It is derived from `l.kind` and compared, so both
   * members stay English; `categoryLabel()` below is what the PR reads.
   */
  category: 'Drinks' | 'Tips';
  qty: number;
  amount: number;
  commission: number;
  outlet: string;
  at: string;
  matched: boolean;
};

/** Same resolver shape as the schedule panel's — module scope, so no hooks. */
const MONTH_SHORT: ((t: AppTranslations) => string)[] = [
  (t) => t.schedule.monShortJan,
  (t) => t.schedule.monShortFeb,
  (t) => t.schedule.monShortMar,
  (t) => t.schedule.monShortApr,
  (t) => t.schedule.monShortMay,
  (t) => t.schedule.monShortJun,
  (t) => t.schedule.monShortJul,
  (t) => t.schedule.monShortAug,
  (t) => t.schedule.monShortSep,
  (t) => t.schedule.monShortOct,
  (t) => t.schedule.monShortNov,
  (t) => t.schedule.monShortDec,
];

/**
 * The label for a `LinkedReceipt.category`. The stored value stays English —
 * translating the union would break both the type and the comparison.
 */
function categoryLabel(
  category: LinkedReceipt['category'],
  t: AppTranslations,
): string {
  return category === 'Drinks' ? t.shiftStatus.drinks : t.shiftStatus.tips;
}

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
//
// The RECORD KEYS are the server's `PrReceiptSource` values and never change;
// only the labels do, so they are resolvers rather than strings.
const SOURCE_LABEL: Record<PrReceiptSource, (t: AppTranslations) => string> = {
  scan: (t) => t.pv.sourceScan,
  manual: (t) => t.pv.sourceManual,
  checkin: (t) => t.pv.sourceCheckin,
};

function lineDateLabel(iso: string | null, t: AppTranslations): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '—';
  // One template, not three glued pieces — Chinese writes the year first.
  return formatMessage(t.pv.lineDate, {
    d: Number(m[3]),
    mon: MONTH_SHORT[Number(m[2]) - 1](t),
    y: m[1],
  });
}

function cellAmount(day: WeeklyDayPay, key: GridBucket): number {
  if (key === 'wages') return day.wages;
  if (key === 'drinks') return day.drinks ?? 0;
  if (key === 'tips') return day.tips ?? 0;
  if (key === 'deductions') return day.deductions ?? 0;
  return day.others ?? 0;
}

/** Zero is nothing to report, a negative is — see the note in PaymentScreen. */
function formatCell(value: number): string {
  if (value === 0) return '—';
  return value < 0 ? `−${Math.abs(value).toFixed(2)}` : value.toFixed(2);
}

export function PvDetailScreen({ pvId }: { pvId: string }) {
  const { t } = useLocale();
  const { goBack, setTab } = usePrNav();
  // Detail screens render outside the tab shell, so the back row must clear
  // the phone's own status bar or it becomes untouchable.
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  const { isSigned, signPv } = useSignedPvs();
  const {
    weeks: apiWeeks,
    vouchers: apiVouchers,
    refresh: refreshHistory,
  } = usePaymentHistory();
  const { token, me } = useSession();
  // The real last-week voucher — the only PV a PR can still sign ("one week,
  // one PV"). Signed/paid weeks arrive through payment history instead.
  const { lastWeek } = useAwaitingLastWeekPv();

  const hist = apiWeeks.find((p) => p.id === pvId);
  const histVoucher = apiVouchers.find((v) => v.voucherId === pvId) ?? null;

  /**
   * WHICH voucher this page is about — the id it was OPENED with, never "the
   * newest one in the week".
   *
   * ⚠️ A PR on two rosters holds one voucher PER AGENCY for the same week, and
   * `lastWeek` MERGES them: its `lines` are both agencies' lines and its `net` is
   * both agencies' money. This page used to take `lastWeek.voucherId` — the
   * newest — as its identity while rendering that merged total, so a PR opening
   * Atlas's RM 1,000 voucher saw Why We Met's PV number, a RM 1,500 net and both
   * agencies' receipts on one document, and signing sent RM 1,500 against a
   * RM 500 voucher. The other voucher then had no route in at all.
   *
   * `vouchers[]` is the per-voucher truth (id, number, agency, net, status). The
   * fallback to the merged week is for one-voucher weeks and for a backend that
   * has not restarted yet — where "the week" and "this voucher" ARE the same
   * thing and the old behaviour was already right.
   */
  const liveVoucher = lastWeek?.vouchers?.find((v) => v.id === pvId) ?? null;

  /** Whose voucher this is — history row first, then the live week's own entry. */
  const pvAgencyName =
    histVoucher?.agencyName ?? liveVoucher?.agencyName ?? null;

  /**
   * This voucher's OWN lines out of the merged week.
   *
   * Falls back to the whole set only when nothing can be attributed — an older
   * backend that does not stamp `voucherId` on a line. It must never filter to
   * empty on that path: showing no money at all is a worse lie than showing the
   * week's.
   */
  const scopeLines = (
    lines: PrReceiptLine[],
    voucherId: string | null | undefined,
  ) => {
    if (!voucherId) return lines;
    const owned = lines.filter((l) => l.voucherId === voucherId);
    return owned.length > 0 || lines.every((l) => l.voucherId) ? owned : lines;
  };

  /**
   * ⚠️ THE CLAIMS MUST BE SCOPED TOO, not just the lines.
   *
   * `openDisputeKeys` reads `week.disputes`, and the merged week carries BOTH
   * agencies' claims. Scoping only the lines left this document lighting up
   * "Dispute open" — header pill, banner, and the disputable gating — because the
   * OTHER agency's voucher had a claim on it. The PR would be told their Atlas
   * payslip was under argument when the argument was with Why We Met.
   *
   * Same fallback shape as `scopeLines`: a backend that does not stamp
   * `voucherId` on a dispute yet keeps the old week-wide behaviour rather than
   * silently hiding a real open claim.
   */
  const scopeDisputes = (
    disputes: NonNullable<PrCurrentWeek['disputes']>,
    voucherId: string | null | undefined,
  ) => {
    if (!voucherId) return disputes;
    return disputes.every((d) => d.voucherId)
      ? disputes.filter((d) => d.voucherId === voucherId)
      : disputes;
  };

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
    : lastWeek
      ? {
          ...lastWeek,
          voucherId: liveVoucher?.id ?? lastWeek.voucherId,
          voucherNo: liveVoucher?.voucherNo ?? lastWeek.voucherNo,
          // THIS agency's share, never the week's sum.
          net: liveVoucher?.net ?? lastWeek.net,
          status: liveVoucher?.status ?? lastWeek.status,
          lines: scopeLines(lastWeek.lines ?? [], liveVoucher?.id),
          disputes: scopeDisputes(lastWeek.disputes ?? [], liveVoucher?.id),
          /*
           * ⚠️ AND THE VOUCHER LIST — the third thing that must be scoped, for
           * the third time, for the same reason as `scopeLines` and
           * `scopeDisputes` above.
           *
           * `...lastWeek` carried the WHOLE week's `vouchers[]` onto an object
           * that claims to be ONE document. Nothing read it here until
           * `weekDisputable` learned to prefer the array, at which point this
           * page would have gone straight back to answering "is ANY voucher in
           * the week disputable" while rendering Atlas's payslip — the exact bug
           * the two scopers above exist to close.
           */
          vouchers: liveVoucher ? [liveVoucher] : lastWeek.vouchers,
        }
      : null;

  const liveOutlets = useMemo(
    () => [
      ...new Set(
        (weekForGrid?.lines ?? [])
          .map((l) => l.outlet?.trim())
          .filter(Boolean) as string[],
      ),
    ],
    [weekForGrid],
  );
  const liveOutlet =
    liveOutlets.length === 1
      ? // A real venue name — the outlet's own record, never translated.
        liveOutlets[0]!
      : liveOutlets.length > 1
        ? formatMessage(t.shiftLib.multiOutlet, { n: liveOutlets.length })
        : t.common.outlet;
  // The stored voucher number (0075) is what the paper document prints, so the
  // phone shows the same string. The week-derived form below is the pre-0075
  // fallback — it gave every PR's voucher for a week the same number.
  const liveRef = (() => {
    if (weekForGrid?.voucherNo) return weekForGrid.voucherNo;
    const m = (weekForGrid?.weekEnd ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m
      ? `PV-${m[1]}${m[2]}${m[3]}`
      : `PV-${pvId.slice(0, 8).toUpperCase()}`;
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
        // The id this page was OPENED with wins. `lastWeek.voucherId` is the
        // week's NEWEST voucher, so on a two-agency week it renamed whichever
        // document the PR actually tapped.
        id: liveVoucher?.id ?? lastWeek?.voucherId ?? pvId,
        ref: liveRef,
        outlet: liveOutlet,
        weekLabel: weekRangeLabel(1),
        // This voucher's own net, not the week's sum across agencies.
        net: Number(liveVoucher?.net ?? lastWeek?.net) || 0,
        status: 'awaiting_pr',
        // A RENDERED label — `status` above is the field anything compares.
        statusLabel: t.pv.awaitingSignature,
      };
  const grid = useMemo(
    () => buildWeekGridFromLines(weekForGrid),
    [weekForGrid],
  );
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
  //
  // ⚠️ ASK THIS VOUCHER, not the week. `lastWeek.status` is the NEWEST voucher's,
  // so on a two-agency week one agency signing sealed the other agency's document
  // on screen — the PR was shown "Signed" over a voucher nobody had signed, and
  // the pad was withdrawn.
  const liveStatus = liveVoucher?.status ?? lastWeek?.status;
  const alreadySigned =
    (hist ? hist.status === 'signed' || hist.status === 'paid' : false) ||
    isSigned(pv.id) ||
    liveStatus === 'signed' ||
    liveStatus === 'paid';

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
    : // Per voucher, same reason as `alreadySigned`: with one agency `sent` and
      // the other still `pending_review`, the week's status answered for both.
      liveStatus === 'sent' || liveStatus === 'awaiting_pr';

  const [signed, setSigned] = useState(alreadySigned);
  // hist / lastWeek load async, so the seal must follow the data, not the
  // initial render's state snapshot.
  const isSealed = signed || alreadySigned;

  /** The voucher's real drink/tip lines — replaces the demo receipt slips. */
  const linkedReceipts: LinkedReceipt[] = useMemo(
    () =>
      (weekForGrid?.lines ?? [])
        .filter(
          (l) => (l.kind === 'drinks' || l.kind === 'tips') && l.commission > 0,
        )
        .map((l) => ({
          id: l.id,
          ref: SOURCE_LABEL[l.source](t),
          receiptNo: l.receiptNo ?? null,
          item: l.item,
          category:
            l.kind === 'drinks' ? ('Drinks' as const) : ('Tips' as const),
          qty: l.quantity,
          amount: l.sales || l.commission,
          commission: l.commission,
          outlet: l.outlet ?? '—',
          at: lineDateLabel(l.lineDate, t),
          // `pending` now carries the parent receipt's REAL review state
          // (migration 0074), falling back to the manual-self-log guess only for
          // a line with no receipt behind it. So this badge means "not waiting
          // on the agency" — which is what it always claimed, and only recently
          // became true. Hardcoding it true once made every line assert it was
          // receipt-backed.
          matched: !l.pending,
        })),
    // `t` is a dependency now: the row's origin label and its date are both
    // rendered from the dictionary, so they must re-resolve on a language swap.
    [weekForGrid, t],
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
  const disputedKeys = useMemo(
    () => openDisputeKeys(weekForGrid),
    [weekForGrid],
  );
  /** Which cell's evidence is open — the same sheet the Payment page uses. */
  const [evidenceTarget, setEvidenceTarget] = useState<{
    day: WeeklyDayPay;
    row: (typeof GRID_ROWS)[number];
    amount: number;
  } | null>(null);
  const [receiptsOpen, setReceiptsOpen] = useState(true);
  const [receiptDetail, setReceiptDetail] = useState<LinkedReceipt | null>(
    null,
  );

  /**
   * This voucher's id IF it is a real backend row — an archived history
   * voucher OR the live last-week PV awaiting signature. History used to be
   * the only source, so signing an awaiting voucher never reached the server
   * and the "signature" lived on this phone alone.
   */
  //
  // ⚠️ `lastWeek.voucherId === pvId` is the NEWEST voucher's id. On a two-agency
  // week that made every OTHER voucher unreachable: the page opened, rendered,
  // and then answered "This voucher is not on the server" — the only route in
  // was the headline, so one agency's PV could never be signed at all. Matching
  // against `vouchers[]` accepts any voucher the week actually holds.
  const backendPvId =
    histVoucher?.voucherId ??
    liveVoucher?.id ??
    (lastWeek?.voucherId === pvId ? pvId : null);

  const [signBusy, setSignBusy] = useState(false);
  const [sigInk, setSigInk] = useState<SignatureInk | null>(null);

  const confirmSign = async () => {
    if (sigName.trim().length < 2 || signBusy) return;
    if (!sigInk) {
      Alert.alert(t.pv.drawSignatureTitle, t.pv.drawSignatureBody);
      return;
    }
    if (!backendPvId || !token) {
      Alert.alert(t.pv.noVoucherTitle, t.pv.noVoucherBody);
      return;
    }
    setSignBusy(true);
    try {
      // Database first: the signature only counts once payment_voucher.status
      // is 'signed' server-side. The local seal and the History redirect come
      // strictly after the commit, never before.
      await signMyVoucher(token, backendPvId, sigInk);
      signPv({
        pv: {
          ...pv,
          net: netDisplay,
          status: 'signed',
          // Rendered only — `status: 'signed'` beside it is the compared value.
          statusLabel: t.pv.signed,
        },
        net: netDisplay,
        grid,
        sigName: sigName.trim(),
      });
      await refreshHistory();
      setSigned(true);
      setSignOpen(false);
      setTab('history');
    } catch (e: unknown) {
      // The server's own refusal is shown RAW (backend English); only our
      // fallback and the reassurance around it come from the dictionary — and
      // they come as ONE template, because Chinese would not take the tail
      // sentence in the same place.
      Alert.alert(
        t.pv.notSignedTitle,
        formatMessage(t.pv.notSignedBody, {
          reason: e instanceof Error ? e.message : t.pv.couldNotReachAgency,
        }),
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
  const openEvidence = (day: WeeklyDayPay, row: (typeof GRID_ROWS)[number]) => {
    const amount = cellAmount(day, row.key);
    if (amount <= 0 || day.status === 'empty') return;
    setEvidenceTarget({ day, row, amount });
  };

  const anyDisputed = disputedKeys.size > 0;

  /*
   * The tap hint is ONE sentence in the dictionary, with `{red}` marking where
   * the red-inked word sits — split here rather than stored as three
   * fragments, so each language keeps its own word order around it.
   */
  const tapHintParts = t.pv.tapHint.split('{red}');

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topRow}>
        <Pressable style={styles.back} onPress={goBack} hitSlop={10}>
          <ChevronLeft size={20} color={C.goldL} />
          <Text style={styles.backText}>{t.nav.payment}</Text>
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
          <Pill
            variant={
              anyDisputed
                ? 'red'
                : isSealed
                  ? pv.status === 'paid'
                    ? 'green'
                    : 'amber'
                  : 'amber'
            }
          >
            {anyDisputed
              ? t.pv.disputeOpen
              : isSealed
                ? pv.statusLabel
                : t.pv.pendingYourReview}
          </Pill>
          {/*
           * WHO IS PAYING THIS. A PR on two rosters gets one voucher per agency for
           * the same week, and the two documents are otherwise near-identical —
           * same week label, often the same venue — so without the agency the PR
           * cannot tell which of them they are about to sign. Falls back to the PV
           * number alone when the backend has not restarted yet.
           */}
          <Text style={styles.pvId}>
            {pvAgencyName ? `${pvAgencyName} · ${pv.ref}` : pv.ref}
          </Text>
        </View>

        {!isSealed && !anyDisputed && (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>
              {awaitingMySignature
                ? t.pv.pendingYourReview
                : t.pv.waitingForAgency}
            </Text>
            {/*
             * Was hardcoded "Sign-by Sunday · Finance Head already signed". The
             * second half was simply untrue — no agency signature is captured
             * anywhere in the product, so `finance_head_signed_at` is NULL on every
             * voucher — and a PV screen that invents a counter-signature is telling
             * the PR the money has been approved by someone who never saw it.
             */}
            <Text style={styles.bannerBody}>
              {awaitingMySignature ? t.pv.reviewThenSign : t.pv.notIssuedYet}
            </Text>
          </View>
        )}
        {anyDisputed && (
          <View style={[styles.banner, styles.bannerDispute]}>
            <Text style={styles.bannerTitle}>{t.pv.disputeOpen}</Text>
            <Text style={styles.bannerBody}>{t.pv.disputeBannerBody}</Text>
          </View>
        )}

        <View style={styles.weekCard}>
          <Text style={styles.sectionLabel}>{t.pv.weekSummary}</Text>
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
                  <Text style={styles.gridDay}>{t.pv.total}</Text>
                  <Text style={styles.gridDate}> </Text>
                </View>
              </View>

              {GRID_ROWS.map((row) => {
                const rowTotal = grid.reduce(
                  (s, d) => s + cellAmount(d, row.key),
                  0,
                );
                const isDeduction = row.key === 'deductions';
                /*
                 * Always drawn, even at zero — same rule as the Payment grid,
                 * which stopped hiding it for the reason spelled out there: an
                 * absent row cannot say "you were not docked". On a signed voucher
                 * that matters more, not less; this IS the document.
                 */
                return (
                  <View key={row.key} style={styles.gridRow}>
                    <Text
                      style={[
                        styles.gridLabel,
                        isDeduction && styles.gridLabelDeduction,
                      ]}
                    >
                      {row.label(t)}
                    </Text>
                    {grid.map((d) => {
                      const amount = cellAmount(d, row.key);
                      const key = `${d.dateIso}-${row.key}`;
                      const isDisputed = disputedKeys.has(key);
                      // EVERY non-empty cell opens its details, wages included —
                      // the owner asked to inspect a figure, not only to argue
                      // with one. Whether it can be DISPUTED is decided inside the
                      // sheet, by the same rules the Payment page applies.
                      // `!== 0` so a deduction can be inspected too: "which shift
                      // was this fine for" is exactly the question it raises.
                      const canTap = amount !== 0 && d.status !== 'empty';
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
                              // Whole row red, dashes included — see PaymentScreen.
                              isDeduction && styles.gridValDeduction,
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
                      {/* The week TOTAL is a cell in this row too — see PaymentScreen. */}
                      <Text
                        style={[
                          styles.gridVal,
                          isDeduction && styles.gridValDeduction,
                        ]}
                      >
                        {formatCell(rowTotal)}
                      </Text>
                    </View>
                  </View>
                );
              })}

              <View style={styles.gridRow}>
                <Text style={styles.gridLabel}>{t.checkin.status}</Text>
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
                  // A day of nothing but a charged fine is DEDUCTED — settled, and
                  // never "waiting on the agency" that charged it. Ahead of the
                  // dispute test because a fine is not disputable here; it is only
                  // reached when the day holds no earnings at all.
                  // `d.status` is the DATA and stays English; only `label` is read.
                  const label =
                    d.status === 'empty'
                      ? '—'
                      : d.status === 'deducted'
                        ? t.pv.dayDeducted
                        : dayDisputed
                          ? t.pv.dayDisputed
                          : d.status === 'pending'
                            ? t.pv.dayPending
                            : t.pv.dayVerified;
                  return (
                    <View key={`st-${d.dateIso}`} style={styles.gridCol}>
                      <Text
                        style={[
                          styles.statusPill,
                          dayDisputed && styles.statusPillDisputed,
                          d.status === 'deducted' && styles.gridValDeduction,
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
                    {formatMessage(t.pv.verifiedCount, {
                      n: grid.filter((d) => d.status === 'verified').length,
                    })}
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>

          <Text style={styles.tapHint}>
            {tapHintParts[0]}
            <Text style={{ color: C.red }}>{t.pv.tapHintRed}</Text>
            {tapHintParts[1]}
          </Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryK}>{t.pv.netPayable}</Text>
          <Text style={styles.summaryV}>{formatRM(netDisplay)}</Text>
          <Text style={[styles.summaryK, { marginTop: 10 }]}>{t.pv.payee}</Text>
          <Text style={styles.summaryBody}>
            {t.pv.prPersonnel} · {pv.outlet}
          </Text>
        </View>

        {linkedReceipts.length > 0 && (
          <Pressable
            style={styles.collapse}
            onPress={() => setReceiptsOpen((o) => !o)}
          >
            {/* Not all of these are scans — a self-log and a check-out seal reach
              this list too, and the demo fallback is gone, so the heading can
              stop claiming a scan for every row. */}
            <Text style={styles.collapseTitle}>{t.pv.drinkTipRecords}</Text>
            <Text style={styles.collapseAction}>
              {receiptsOpen ? t.pv.hide : t.pv.details}
            </Text>
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
                    {r.matched ? t.shiftStatus.matched : t.shiftStatus.pending}
                  </Text>
                  <Text style={styles.receiptDetailsLink}>{t.pv.details}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.sigCard}>
          <Text style={styles.sectionLabel}>{t.pv.yourSignature}</Text>
          <Text style={styles.sigRole}>{t.pv.prPersonnel}</Text>
          {isSealed ? (
            <View style={styles.signedRow}>
              <Check size={16} color={C.green} />
              {/* Two whole sentences, not one with a fragment spliced in — the
                  name sits in a different place in Chinese. */}
              <Text style={styles.signedText}>
                {sigName
                  ? formatMessage(t.pv.signedWithName, { name: sigName })
                  : t.pv.signedSealed}
              </Text>
            </View>
          ) : awaitingMySignature ? (
            // NOT t.shiftStatus.pending — that one is "waiting on the agency to
            // review a receipt". This says the signature is the thing missing.
            <Text style={styles.pendingSig}>{t.pv.signaturePending}</Text>
          ) : (
            // Names whose move it is. "Pending" alone read as "yours to do" beside a
            // Sign button that the server would have refused.
            <Text style={styles.pendingSig}>{t.pv.notSentYet}</Text>
          )}
        </View>

        {!isSealed && awaitingMySignature && (
          <Pressable
            style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
            onPress={() => setSignOpen(true)}
          >
            <Pencil size={16} color="#241a08" />
            <Text style={styles.primaryText}>{t.pv.signVoucher}</Text>
          </Pressable>
        )}

        {isSealed && pv.status === 'paid' && (
          <View style={styles.paidBox}>
            <Shield size={16} color={C.green} />
            <Text style={styles.paidText}>
              {formatMessage(t.pv.paidInBank, {
                amount: formatRM(netDisplay),
              })}
            </Text>
          </View>
        )}

        {isSealed && (
          <Pressable style={styles.soft} onPress={() => setTab('history')}>
            <Text style={styles.softText}>{t.pv.viewInHistory}</Text>
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
            buildCellEvidence(
              weekForGrid,
              evidenceTarget.day.dateIso,
              evidenceTarget.row.key,
            )
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
        <Pressable
          style={styles.backdrop}
          onPress={() => setReceiptDetail(null)}
        >
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.receiptSheetHead}>
              <Wallet size={18} color={C.goldL} />
              <Text style={styles.sheetTitle}>{t.pv.receiptDetails}</Text>
            </View>
            {receiptDetail && (
              <>
                <Text style={styles.detailK}>{t.pv.detailDateTime}</Text>
                <Text style={styles.detailV}>{receiptDetail.at}</Text>
                <Text style={styles.detailK}>{t.pv.detailOutlet}</Text>
                <Text style={styles.detailV}>{receiptDetail.outlet}</Text>
                <Text style={styles.detailK}>{t.pv.detailReceipt}</Text>
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
                <Text style={styles.detailK}>{t.pv.detailCommission}</Text>
                <Text style={[styles.detailV, { color: C.accentL }]}>
                  {formatRM(receiptDetail.commission)}
                </Text>
                <View style={styles.detailFoot}>
                  <Text style={styles.detailFootL}>
                    {/* `category` and 'Guest tip' are both DATA — the union is a
                        discriminant and the item name is the server's own text;
                        only the category's label is resolved for reading. */}
                    {receiptDetail.qty}×{' '}
                    {categoryLabel(receiptDetail.category, t)}
                    {receiptDetail.item !== 'Guest tip'
                      ? ` · ${receiptDetail.item}`
                      : ''}
                  </Text>
                  <Text style={styles.detailFootR}>
                    {formatRM(receiptDetail.amount)}
                  </Text>
                </View>
                <View style={styles.matchedBanner}>
                  <Check size={14} color={C.green} />
                  <Text style={styles.matchedBannerText}>
                    {receiptDetail.matched
                      ? t.pv.matchedToThisPv
                      : t.pv.pendingAgencyVerify}
                  </Text>
                </View>
              </>
            )}
            <Pressable
              style={styles.sheetCancel}
              onPress={() => setReceiptDetail(null)}
            >
              <Text style={styles.sheetCancelText}>{t.common.close}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Signature sheet */}
      <Modal
        visible={signOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSignOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSignOpen(false)}>
          <Pressable
            style={[
              styles.sheet,
              keyboardInset > 0 && { paddingBottom: keyboardInset + 16 },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.sheetTitle}>{t.pv.signVoucher}</Text>
            <Text style={styles.sheetHint}>{t.pv.signSheetHint}</Text>
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
            <Text style={styles.fieldLabel}>{t.pv.signingAs}</Text>
            {/* The account's own username when there is one — never translated. */}
            <Text style={styles.sigAsName}>{sigName || t.pv.thisAccount}</Text>
            <Text style={styles.fieldLabel}>{t.pv.signatureField}</Text>
            <SignaturePad onChange={setSigInk} />
            <Pressable
              style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
              onPress={confirmSign}
            >
              <Text style={styles.primaryText}>{t.pv.confirmSignature}</Text>
            </Pressable>
            <Pressable
              style={styles.sheetCancel}
              onPress={() => setSignOpen(false)}
            >
              <Text style={styles.sheetCancelText}>{t.common.back}</Text>
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
  backText: {
    ...font(700),
    fontSize: 16,
    color: C.txt,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  pvId: {
    ...font(700),
    fontSize: 13,
    color: C.prMuted,
  },
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
  bannerTitle: {
    ...font(700),
    fontSize: 14,
    color: C.txt,
  },
  bannerBody: {
    marginTop: 2,
    ...font(),
    fontSize: 12,
    color: C.prMuted,
  },
  weekCard: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 14,
  },
  sectionLabel: {
    ...font(700),
    fontSize: 11,
    letterSpacing: 1,
    color: C.muted2,
  },
  weekLabel: {
    marginTop: 4,
    ...font(700),
    fontSize: 16,
    color: C.txt,
  },
  gridRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  gridLabel: {
    width: 78,
    ...font(),
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
  gridDay: {
    ...font(700),
    fontSize: 10,
    color: C.muted2,
  },
  gridDate: { ...font(), fontSize: 11, color: C.prMuted },
  gridVal: {
    ...font(700),
    fontSize: 12,
    color: C.txt,
  },
  gridValDisputed: { color: C.red },
  /** Every cell in the row, any amount — same red as the Payment grid. */
  gridValDeduction: { color: C.red },
  /** The label, same red as its cells: the whole line reads as one thing. */
  gridLabelDeduction: { color: C.red },
  statusPill: {
    ...font(800),
    fontSize: 8,
    letterSpacing: 0.3,
    color: C.green,
    textAlign: 'center',
  },
  statusPillDisputed: { color: C.red },
  tapHint: {
    marginTop: 4,
    ...font(),
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
    ...font(700),
    fontSize: 11,
    letterSpacing: 0.8,
    color: C.muted2,
  },
  summaryV: {
    marginTop: 4,
    ...font(800),
    fontSize: 28,
    color: C.accentL,
  },
  summaryBody: { ...font(), fontSize: 14, color: C.txt },
  collapse: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  collapseTitle: {
    ...font(700),
    fontSize: 11,
    letterSpacing: 1,
    color: C.muted2,
  },
  collapseAction: {
    ...font(600),
    fontSize: 13,
    color: C.goldL,
  },
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
  receiptRef: {
    ...font(700),
    fontSize: 13,
    color: C.txt,
  },
  receiptMeta: {
    marginTop: 2,
    ...font(),
    fontSize: 12,
    color: C.prMuted,
  },
  receiptRight: { alignItems: 'flex-end', gap: 4 },
  receiptMatched: {
    ...font(700),
    fontSize: 11,
    color: C.green,
  },
  receiptDetailsLink: {
    ...font(600),
    fontSize: 12,
    color: C.goldL,
  },
  sigCard: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line2,
    padding: 14,
  },
  sigRole: {
    marginTop: 4,
    ...font(),
    fontSize: 13,
    color: C.prMuted,
  },
  signedRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  signedText: { flex: 1, ...font(), fontSize: 13, color: C.green },
  pendingSig: {
    marginTop: 8,
    ...font(700),
    fontSize: 14,
    color: C.amber,
  },
  primary: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
  },
  primaryText: {
    ...font(700),
    fontSize: 16,
    color: '#241a08',
  },
  soft: { marginTop: 12, alignItems: 'center', padding: 10 },
  softText: {
    ...font(600),
    fontSize: 14,
    color: C.goldL,
  },
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
  paidText: {
    ...font(700),
    fontSize: 14,
    color: C.green,
  },
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
  sheetTitle: {
    ...font(800),
    fontSize: 20,
    color: C.txt,
  },
  sheetHint: {
    marginTop: 6,
    marginBottom: 8,
    ...font(),
    fontSize: 13,
    color: C.prMuted,
  },
  detailK: {
    marginTop: 12,
    ...font(700),
    fontSize: 10,
    letterSpacing: 0.8,
    color: C.muted2,
  },
  detailV: {
    marginTop: 4,
    ...font(700),
    fontSize: 15,
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
  detailFootL: {
    ...font(),
    fontSize: 13,
    color: C.prMuted,
    flex: 1,
  },
  detailFootR: {
    ...font(800),
    fontSize: 16,
    color: C.txt,
  },
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
  matchedBannerText: {
    ...font(700),
    fontSize: 12,
    color: C.green,
  },
  fieldLabel: {
    marginTop: 10,
    marginBottom: 4,
    ...font(600),
    fontSize: 11,
    letterSpacing: 0.8,
    color: C.prMuted2,
  },
  sigAsName: {
    ...font(700),
    fontSize: 15,
    color: C.txt,
  },
  input: {
    ...font(600),
    fontSize: 16,
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
    ...font(700),
    fontSize: 12,
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
    ...font(600),
    fontSize: 12,
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
  sheetCancelText: {
    ...font(600),
    fontSize: 14,
    color: C.muted,
  },
  dangerBtn: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: C.redBg,
    borderWidth: 1,
    borderColor: 'rgba(240,138,138,0.4)',
  },
  dangerBtnText: {
    ...font(700),
    fontSize: 16,
    color: C.red,
  },
});
