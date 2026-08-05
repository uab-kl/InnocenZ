/**
 * Payment — port of InnocenZ-proto `/host/PaymentVoucher`:
 * Payroll header, week tabs, LAST WEEK card with full pay grid + dispute taps.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
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
  weekPvIssueDayLabel,
  weekRangeLabel,
  type WeeklyDayPay,
} from '../lib/demo-shifts';
import { usePrEarnings } from '../lib/pr-earnings';
import {
  fetchMyLastWeek,
  raiseMyDispute,
  withdrawMyDispute,
  type PrCurrentWeek,
  type PrDisputeState,
  type PrReceiptLine,
} from '../lib/api';
import { useSession } from '../lib/session';
import { useSignedPvs } from '../lib/signed-pv';
import { buildWeekGridFromLines, VERIFIED_STATUSES } from '../lib/week-pay-grid';
import { buildCellEvidence, receiptDisputable } from '../lib/cell-evidence';
import { CellEvidenceSheet } from '../components/CellEvidenceSheet';
import {
  dayStatusLabel,
  disputesForDay,
  kindDisputable,
  openDisputeKeys,
  DISPUTE_PRESETS,
  receiptClaimState,
  receiptReviewCaption,
  thisWeekDayStatus,
  weekDisputable,
} from '../lib/receipt-review';
import { useKeyboardInset } from '../lib/use-keyboard-inset';
import { useViewportSize } from '../lib/viewport';
import { IzButton, Pill } from '../components/ui';
import { ChevronDown, Flag, ImagePlus, Search, Wallet, XIcon } from '../components/icons';
import type { PrTab } from '../components/BottomNav';
import { usePrNav } from '../lib/pr-nav';

type WeekTab = 'last' | 'current';
type IncomeKey = 'wages' | 'drinks' | 'tips' | 'others';

type DisputeTarget = {
  key: string;
  dateIso: string;
  dayLabel: string;
  dateNum: number;
  incomeKey: IncomeKey;
  incomeLabel: string;
  amount: number;
  /**
   * WHICH WEEK's voucher this claim is against.
   *
   * Carried on the target because the whole flow used to assume `lastWeek` — it
   * posted to `lastWeek.voucherId` and wrote the response back into last week's
   * state. That silently made This-week undisputable even though the server
   * accepts `pending_review`, which is exactly what the current week is.
   */
  week: WeekTab;
};

type HtmlFileInput = {
  type: string;
  accept: string;
  multiple: boolean;
  files: FileList | null;
  onchange: ((ev: Event) => void) | null;
  click: () => void;
};

function readImageFiles(files: FileList | null): Promise<string[]> {
  if (!files?.length) return Promise.resolve([]);
  const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
  return Promise.all(
    imageFiles.map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        }),
    ),
  );
}

function pickDisputeImages(onPicked: (urls: string[]) => void) {
  if (Platform.OS !== 'web') return;
  const doc = (globalThis as { document?: { createElement: (tag: string) => HtmlFileInput } })
    .document;
  if (!doc) return;
  const input = doc.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = () => {
    void readImageFiles(input.files).then((urls) => {
      if (urls.length) onPicked(urls);
    });
  };
  input.click();
}

const INCOME_ROWS: { key: IncomeKey; label: string }[] = [
  { key: 'wages', label: 'Daily wages' },
  { key: 'drinks', label: 'Drinks' },
  { key: 'tips', label: 'Tips' },
  { key: 'others', label: 'Others' },
];

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

/**
 * The shift(s) a claim actually names — receiptRefs resolved back through the
 * day's evidence to the outlet, slot and attendance stamps behind each receipt.
 *
 * Returns [] when the claim named nothing, which is every claim raised before
 * the shift picker existed. The caller says so out loud rather than rendering
 * an empty space that reads as "still loading".
 */
function claimShifts(
  week: PrCurrentWeek | null,
  d: { disputeDate: string; component: IncomeKey; receiptId: string | null; receiptRefs: string[] | null },
) {
  const refs = d.receiptRefs ?? [];
  const evidence = buildCellEvidence(week, d.disputeDate, d.component);
  return evidence.groups.flatMap((g) =>
    g.receipts
      /*
       * The FK first, the old receipt NUMBERS second, and neither = the claim
       * covered the WHOLE cell, so every shift in it was part of that one
       * argument. Listing them answers "which shift?" with the truth — "all of
       * them" — instead of a dead end saying nothing was recorded.
       */
      .filter((r) =>
        d.receiptId
          ? r.receiptId === d.receiptId
          : r.receiptNo && (refs.length === 0 || refs.includes(r.receiptNo)),
      )
      .map((r) => ({
        receiptNo: r.receiptNo as string,
        orderNo: r.orderNo,
        outletName: g.shift?.outletName ?? null,
        slot: g.shift?.slot ?? null,
        checkInAt: g.shift?.checkInAt ?? null,
        checkOutAt: g.shift?.checkOutAt ?? null,
      })),
  );
}

/** "Tue 4 Aug 2026" — UTC-parsed to match how the grid buckets its days. */
function longDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getUTCMonth()
  ];
  return `${wd} ${d.getUTCDate()} ${mo} ${d.getUTCFullYear()}`;
}

/** "4 Aug, 11:29 am" — the stamp, short enough to sit on a claim row. */
function shortStamp(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getMonth()
  ];
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${d.getDate()} ${mo}, ${h}:${m} ${ampm}`;
}

// buildWeekGridFromLines moved to lib/week-pay-grid so PvDetailScreen renders
// the identical grid for the same voucher.

export function PaymentScreen({ onNavigate }: { onNavigate: (tab: PrTab) => void }) {
  const { openPv, route } = usePrNav();
  const { token } = useSession();
  const keyboardInset = useKeyboardInset();
  const { current, refresh: refreshEarnings } = usePrEarnings();
  const { isSigned } = useSignedPvs();
  const { width } = useViewportSize();
  const titleSize = Math.min(28, Math.max(22.4, width * 0.052));
  const thisGrid = useMemo(() => buildWeekGridFromLines(current), [current]);
  const thisWeekTotal = useMemo(() => weekPayGridTotal(thisGrid), [thisGrid]);
  const thisPendingDays = thisGrid.filter((d) => d.status === 'pending').length;
  // Days the agency has signed off. Counted separately from `thisPendingDays`
  // rather than as `worked - pending`: those two used to be the same number, and
  // the header read "Verified days 2/7" off the PENDING count — so a week where
  // the agency had approved nothing still showed 2 as if it had.
  const thisApprovedDays = thisGrid.filter(
    (d) => d.status === 'approved' || d.status === 'verified',
  ).length;
  // Any day with money on it, whatever the agency has done with it. Was derived
  // from the pending count, which meant the whole section emptied itself out the
  // moment every day got approved.
  const hasThisWeekRows = thisGrid.some((d) => d.status !== 'empty');
  const thisReviewCaption = useMemo(() => receiptReviewCaption(current), [current]);

  // Last week's voucher comes from the same backend as this week — real data,
  // no demo grid. Fetched once on mount (it rarely changes mid-session).
  const [lastWeek, setLastWeek] = useState<PrCurrentWeek | null>(null);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    void fetchMyLastWeek(token)
      .then((w) => {
        if (alive) setLastWeek(w);
      })
      .catch(() => {
        if (alive) setLastWeek(null);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  // Check-out lands here with paymentWeek: 'current' so This week (sealed
  // shift) is visible immediately — not Last week.
  const focusWeek =
    route.name === 'tabs' && route.tab === 'payment' ? route.paymentWeek : undefined;
  const [weekTab, setWeekTab] = useState<WeekTab>(() =>
    focusWeek === 'current' || (!focusWeek && hasThisWeekRows) ? 'current' : 'last',
  );
  const [lastOpen, setLastOpen] = useState(true);
  const [thisOpen, setThisOpen] = useState(true);

  useEffect(() => {
    if (focusWeek === 'current') {
      setWeekTab('current');
      setThisOpen(true);
      void refreshEarnings();
    } else if (focusWeek === 'last') {
      setWeekTab('last');
      setLastOpen(true);
    }
  }, [focusWeek, refreshEarnings]);
  const [disputedKeys, setDisputedKeys] = useState<Set<string>>(() => new Set());
  /**
   * Cells to paint RED — the server's open claims, plus anything raised in this
   * session.
   *
   * The in-session set alone was why a disputed cell went back to looking normal
   * after a reload: React state is not where a claim lives. The union keeps the
   * cell red the instant it is submitted AND after the app restarts, and the two
   * agree as soon as the next refetch lands.
   */
  const disputedCells = useMemo(() => {
    const keys = new Set<string>(disputedKeys);
    for (const k of openDisputeKeys(lastWeek)) keys.add(k);
    for (const k of openDisputeKeys(current)) keys.add(k);
    return keys;
  }, [disputedKeys, lastWeek, current]);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeMode, setDisputeMode] = useState<'dispute' | 'withdraw'>('dispute');
  const [disputeTarget, setDisputeTarget] = useState<DisputeTarget | null>(null);
  /** Which day's CLAIMS are open — set by tapping a DISPUTED / VERIFIED status cell. */
  const [claimDay, setClaimDay] = useState<{ dateIso: string; week: WeekTab } | null>(null);
  /** Which cell's evidence is open, and the day/row it came from (to hand on to dispute). */
  const [evidenceTarget, setEvidenceTarget] = useState<{
    dateIso: string;
    incomeKey: IncomeKey;
    amount: number;
    week: WeekTab;
    day: WeeklyDayPay;
    row: (typeof INCOME_ROWS)[number];
  } | null>(null);
  const [disputePreset, setDisputePreset] = useState<string>(DISPUTE_PRESETS[0]);
  /**
   * The ONE receipt being contested — a dispute is about a single shift.
   *
   * Was a multi-select. Owner: *"the dispute make is possible will be only one
   * of the shift"*. A claim answers "this shift's drinks are wrong", and the
   * agency settles it against that shift's receipt; letting a PR tick several
   * would produce one claim, one amount and one outcome spanning shifts that
   * may each need a different answer.
   */
  const [disputePickedReceipt, setDisputePickedReceipt] = useState<string | null>(null);
  const [disputeNote, setDisputeNote] = useState('');
  const [disputePhotos, setDisputePhotos] = useState<string[]>([]);
  /** Optional proof kept with submitted disputes (image upload is still local). */
  const [disputePhotoMap, setDisputePhotoMap] = useState<Record<string, string[]>>({});
  const [disputeBusy, setDisputeBusy] = useState(false);

  const lastLabel = weekRangeLabel(1);
  const thisLabel = weekRangeLabel(0);
  const issueDay = weekPvIssueDayLabel(0);
  const grid = useMemo(() => buildWeekGridFromLines(lastWeek), [lastWeek]);
  const weekTotal = useMemo(() => weekPayGridTotal(grid), [grid]);
  /*
   * AN AGENCY-APPROVED DAY IS A VERIFIED DAY — same definition This week uses
   * (`thisApprovedDays`, above), which is the whole point of touching this.
   *
   * Counting only `'verified'` here meant the two halves of one screen used the
   * same word for different things: last week showed **APPROVED** on Thu 30
   * above a header reading **"Verified days 0/7"** and a footer reading
   * **"0 verified"**. Both were "right" — the agency had approved that day, but
   * the voucher itself was still `pending_review`, so it never reached
   * VERIFIED_STATUSES — and together they were nonsense.
   *
   * A day review is an explicit human decision about THAT DAY's money; the
   * voucher status is paperwork about the week. For a week that is over, the
   * former is the stronger statement, not the weaker one.
   */
  const verifiedDays = grid.filter(
    (d) => d.status === 'approved' || d.status === 'verified',
  ).length;
  /** Has the AGENCY issued this week's voucher? The paperwork, not the days. */
  const weekIssued = !!lastWeek?.status && VERIFIED_STATUSES.includes(lastWeek.status);
  const hasLastWeekRows = grid.some((d) => d.status !== 'empty');
  // Only a real, agency-sent voucher the PR hasn't signed yet is reviewable.
  const awaiting =
    lastWeek?.voucherId &&
    (lastWeek.status === 'awaiting_pr' || lastWeek.status === 'sent') &&
    !isSigned(lastWeek.voucherId)
      ? { id: lastWeek.voucherId, net: Number(lastWeek.net) }
      : undefined;
  const reviewAmount = weekTotal > 0 ? weekTotal : awaiting?.net ?? 0;
  // The dispute is persisted at the voucher grain (payment_voucher.status), so
  // the whole "Last week" PV is either under dispute or not (§3 F).
  const voucherDisputed = lastWeek?.status === 'disputed';

  /*
   * PROOF FIRST, DISPUTE SECOND.
   *
   * Tapping a Last-week cell used to open the dispute sheet straight away, which
   * asked the PR to contest a number they had no way to inspect: the order
   * number off the paper never reached this app at all, so "Drinks 7.20" was a
   * figure to be believed or challenged blind. The cell now opens its evidence,
   * and the dispute is one button INSIDE that — same `openDispute`, unchanged,
   * including the withdraw variant for a voucher already under dispute.
   *
   * This-week cells are tappable too, and deliberately have no dispute button:
   * nothing is issued yet, so there is nothing to contest — but a PR should be
   * able to check tonight's takings against the papers still in their pocket,
   * which is the moment a wrong figure is cheapest to fix.
   */
  const openEvidence = (
    day: WeeklyDayPay,
    row: (typeof INCOME_ROWS)[number],
    week: WeekTab,
  ) => {
    const amount = cellAmount(day, row.key);
    if (amount <= 0 || day.status === 'empty') return;
    setEvidenceTarget({ dateIso: day.dateIso, incomeKey: row.key, amount, week, day, row });
  };

  const openDispute = (
    day: WeeklyDayPay,
    row: (typeof INCOME_ROWS)[number],
    week: WeekTab = 'last',
  ) => {
    const weekData = week === 'last' ? lastWeek : current;
    const weekDisputed =
      week === 'last' ? voucherDisputed : current?.status === 'disputed';
    const amount = cellAmount(day, row.key);
    if (amount <= 0 || day.status === 'empty') return;
    // A receipt the agency has not reviewed is still the PR's own claim, not a
    // figure anybody has stated back to them — there is nothing to contest yet.
    // Withdrawing an existing dispute is never blocked: that would trap a claim
    // already raised. Wages and OT are refused outright by `kindDisputable`,
    // server-side too (DISPUTABLE_KINDS), so they never reach the dispute sheet.
    /*
     * REVIEW STATE NO LONGER REFUSES — only the KIND does.
     *
     * This guard used to turn the sheet away whenever the day's receipts were
     * unreviewed. The owner reversed that on 5 Aug, and the server's precondition
     * moved with it, so refusing here would put the old rule back in the one
     * place nobody would think to look.
     *
     * A cell with no receipt at all (wages, OT) still has nothing to contest, and
     * `kindDisputable` already refuses those with the message that fits them.
     */
    const anyShiftToDispute = buildCellEvidence(weekData, day.dateIso, row.key)
      .groups.flatMap((g) => g.receipts)
      .some((r) => !!r.receiptNo);
    if (!weekDisputed && !anyShiftToDispute) {
      // Two different refusals, and they must not share a message. "Still being
      // reviewed" tells the PR to wait — useless advice for wages, where waiting
      // changes nothing and the actual route is the attendance record.
      if (!kindDisputable(row.key)) {
        Alert.alert(
          'Not disputed here',
          `${row.label} is calculated from your check-in and check-out times, not from a receipt. If it looks wrong, ask your agency to correct the shift record for ${day.day} ${day.date}.`,
        );
      } else {
        Alert.alert(
          'Not reviewed yet',
          `Your agency is still checking the receipt behind ${row.label.toLowerCase()} on ${day.day} ${day.date}. Once they approve it you can dispute the amount here.`,
        );
      }
      return;
    }
    const key = `${day.dateIso}-${row.key}`;
    const target: DisputeTarget = {
      key,
      dateIso: day.dateIso,
      dayLabel: day.day,
      dateNum: day.date,
      incomeKey: row.key,
      incomeLabel: row.label,
      amount,
      week,
    };
    setDisputeTarget(target);
    // A PV already under dispute → tapping any amount offers to withdraw it.
    if (weekDisputed) {
      setDisputeMode('withdraw');
      setDisputeNote('');
      setDisputePhotos([]);
    } else {
      setDisputeMode('dispute');
      setDisputePreset(DISPUTE_PRESETS[0]);
      setDisputeNote(
        `${row.label} · ${day.day} ${day.date} · ${formatRM(amount)} — please verify`,
      );
      setDisputePhotos([]);
    }
    setDisputeOpen(true);
  };

  /**
   * The receipts behind the cell being disputed, one chip each.
   *
   * Built from the SAME `buildCellEvidence` the proof sheet renders, so the
   * chips are the very rows the PR just looked at — a different derivation here
   * could offer a receipt the evidence sheet never showed them.
   *
   * Wage seals have no receipt and are excluded by construction: they group
   * under a null receiptNo, and wages are not disputable anyway.
   */
  const disputeReceipts = useMemo(() => {
    if (!disputeTarget) return [];
    const week = disputeTarget.week === 'last' ? lastWeek : current;
    const evidence = buildCellEvidence(week, disputeTarget.dateIso, disputeTarget.incomeKey);
    /*
     * Which shifts already carry a LIVE claim. Matched on the receipt id (the FK
     * a claim stores) or its number (pre-0088 claims), same as the evidence tags.
     * A whole-day open claim blocks every shift beneath it.
     */
    const claims = receiptClaimState(week, disputeTarget.dateIso, disputeTarget.incomeKey);
    const openClaimOn = (r: { receiptId: string | null; receiptNo: string | null }) =>
      claims.openAll ||
      (!!r.receiptId && claims.open.has(r.receiptId)) ||
      (!!r.receiptNo && claims.open.has(r.receiptNo));
    /*
     * ⚠️ A SETTLED CLAIM DOES NOT MAKE AN UNREVIEWED RECEIPT DISPUTABLE.
     *
     * I briefly let one through, on the theory that a receipt reading `pending`
     * had been APPROVED and then edited back by the agency — in which case the
     * figure would be the agency's and fair to contest. The database says
     * otherwise for the case that prompted it: RCP-000012 carries
     * `reviewed_at = NULL`, so it was never approved at all. It is a receipt the
     * agency has not looked at yet, and "waiting on your agency" is the truth.
     *
     * The old whole-day claim tagged it VERIFIED only because a claim covering
     * the entire cell marked every receipt in it — behaviour `d373e94` removed.
     * If a genuinely re-opened receipt ever needs to be disputable, the signal
     * is `reviewed_at` being non-null, not the presence of a settled claim.
     */
    return evidence.groups.flatMap((g) =>
      g.receipts
        .filter((r): r is typeof r & { receiptNo: string } => !!r.receiptNo)
        /*
         * EVERY shift in the cell is listed — including ones that cannot be
         * chosen yet.
         *
         * Filtering them out was wrong: on a day where one drinks receipt was
         * approved and the other still awaiting review, the picker collapsed to
         * a single option and DISAPPEARED, so Drinks jumped straight to Quick
         * reason while Tips showed two shifts. The PR could not tell whether the
         * second shift was missing, merged, or simply not offered.
         *
         * Shown-but-unavailable states why. Hidden states nothing.
         */
        .map((r) => ({
          receiptNo: r.receiptNo,
          // The FK the claim is actually filed against. `receiptNo` stays as the
          // key the chips render and compare on, because it is what the PR reads
          // off the paper — but it is never what gets stored.
          receiptId: r.receiptId,
          subtotal: r.subtotal,
          /**
           * Choosable?
           *
           * TWO reasons it may not be, and they are different states:
           * - the receipt is still awaiting review — no stated figure to argue
           *   with yet;
           * - a claim on it is ALREADY OPEN — the server allows one open claim
           *   per shift (0086), so a second would come straight back a 409.
           *
           * An ANSWERED claim does NOT block: resolving a claim ends that claim,
           * not the right to disagree again.
           */
          /*
           * Selectable unless a claim on it is ALREADY OPEN.
           *
           * Review state no longer blocks — the owner reversed that on 5 Aug
           * ("make the already verified or dispute still can make disputed
           * again") and the server's precondition moved with it. An open claim
           * still blocks, because that is the DB refusing a second row (0086),
           * not a policy: offering it would be a guaranteed 409.
           */
          disputable: !openClaimOn(r),
          // Order number first — it is what is printed on the paper in their
          // hand. The shift time disambiguates two logs of the same paper.
          label: `${r.orderNo ?? r.receiptNo} · ${formatRM(r.subtotal)}${
            g.shift?.slot ? ` · ${g.shift.slot}` : ''
          }`,
          /** Why it cannot be chosen — shown on the chip, never left to guess. */
          /*
           * The state, said in full — never truncated to "waiting on yo…".
           *
           * "already disputed" is the only one that BLOCKS. "waiting on your
           * agency" is now information, not a refusal: the shift is choosable
           * and the note explains that the agency has not looked at that paper
           * yet, which is worth knowing before arguing about the figure on it.
           */
          blockedNote: openClaimOn(r)
            ? 'already disputed'
            : receiptDisputable(r)
              ? null
              : 'not reviewed yet',
        })),
    );
  }, [disputeTarget, lastWeek, current]);

  /*
   * Default to ALL of them — narrowing is the exception, and a chooser that
   * starts empty would make the common "this whole day is wrong" claim need
   * extra taps to say what it already meant.
   */
  useEffect(() => {
    // ONE choosable shift = nothing to decide, so choose it. Two or more and the
    // PR must say which — pre-selecting would put words in their mouth about
    // money. Counted over the CHOOSABLE ones: a shift that cannot be picked is
    // listed for explanation, not as an option.
    const usable = disputeReceipts.filter((r) => r.disputable);
    setDisputePickedReceipt(usable.length === 1 ? usable[0].receiptNo : null);
  }, [disputeReceipts]);

  /**
   * How many shifts in the OPEN evidence sheet could be contested.
   *
   * Derived from `evidenceTarget`, not `disputeTarget`: the Dispute button has
   * to decide whether to appear BEFORE the dispute sheet exists, so it cannot
   * read the picker's own list.
   */
  const evidenceDisputableCount = useMemo(() => {
    if (!evidenceTarget) return 0;
    const week = evidenceTarget.week === 'last' ? lastWeek : current;
    // Excludes shifts already carrying an OPEN claim, exactly as the picker
    // does — otherwise the button opens a sheet where nothing can be selected.
    const claims = receiptClaimState(week, evidenceTarget.dateIso, evidenceTarget.incomeKey);
    if (claims.openAll) return 0;
    return buildCellEvidence(week, evidenceTarget.dateIso, evidenceTarget.incomeKey)
      .groups.flatMap((g) => g.receipts)
      .filter((r) => {
        if (!r.receiptNo) return false;
        const openOnIt =
          (r.receiptId && claims.open.has(r.receiptId)) || claims.open.has(r.receiptNo);
        // Review state no longer withholds it — only an open claim does.
        return !openOnIt;
      }).length;
  }, [evidenceTarget, lastWeek, current]);

  /** The item lines on the chosen shift's receipt — what "which item?" offers. */
  const disputeItems = useMemo(() => {
    if (!disputeTarget || !disputePickedReceipt) return [];
    const week = disputeTarget.week === 'last' ? lastWeek : current;
    const evidence = buildCellEvidence(week, disputeTarget.dateIso, disputeTarget.incomeKey);
    const receipt = evidence.groups
      .flatMap((g) => g.receipts)
      .find((r) => r.receiptNo === disputePickedReceipt);
    return (receipt?.lines ?? []).map((l) => ({
      id: l.id,
      label: `${l.item} × ${l.quantity} · ${formatRM(l.commission)}`,
    }));
  }, [disputeTarget, disputePickedReceipt, lastWeek, current]);

  const [disputePickedItems, setDisputePickedItems] = useState<string[]>([]);
  /*
   * Every item ticked when the shift changes. Disputing a whole receipt is the
   * common case and should cost nothing; narrowing to one line is the exception.
   */
  useEffect(() => {
    setDisputePickedItems(disputeItems.map((i) => i.id));
  }, [disputeItems]);

  /** A chooser was shown and the PR has not answered it yet. */
  const noReceiptPicked =
    (disputeReceipts.length > 0 && disputePickedReceipt === null) ||
    (disputeItems.length > 1 && disputePickedItems.length === 0);

  const disputePickedSubtotal = useMemo(
    () => disputeReceipts.find((r) => r.receiptNo === disputePickedReceipt)?.subtotal ?? 0,
    [disputeReceipts, disputePickedReceipt],
  );

  /**
   * Take back ONE open claim, named exactly.
   *
   * `receiptId` is sent so the server withdraws the claim the PR is looking at:
   * since one open claim per SHIFT is allowed, day+component alone would let it
   * cancel the wrong argument. Confirmed first — a withdrawn claim cannot be
   * un-withdrawn, only raised again from scratch.
   */
  const cancelClaim = async (d: {
    disputeDate: string;
    component: IncomeKey;
    receiptId: string | null;
  }) => {
    if (!token || !claimDay || disputeBusy) return;
    const voucherId = claimDay.week === 'last' ? lastWeek?.voucherId : current?.voucherId;
    if (!voucherId) return;
    const go = async () => {
      setDisputeBusy(true);
      try {
        await withdrawMyDispute(token, voucherId, {
          disputeDate: d.disputeDate,
          component: d.component,
          ...(d.receiptId ? { receiptId: d.receiptId } : {}),
        });
        // Re-read rather than patch: the voucher may have left 'disputed' if
        // that was the last open claim, and the grid reads off both.
        if (claimDay.week === 'last') {
          const fresh = await fetchMyLastWeek(token);
          setLastWeek(fresh);
        } else {
          await refreshEarnings();
        }
        setDisputedKeys((prev) => {
          const next = new Set(prev);
          next.delete(`${d.disputeDate}-${d.component}`);
          return next;
        });
        setClaimDay(null);
      } catch (e) {
        Alert.alert('Could not cancel', e instanceof Error ? e.message : 'Please try again.');
      } finally {
        setDisputeBusy(false);
      }
    };
    Alert.alert(
      'Cancel this dispute?',
      'Your agency will stop reviewing it. You can raise it again later if you still disagree.',
      [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Cancel dispute', style: 'destructive', onPress: () => void go() },
      ],
    );
  };

  const closeDispute = () => {
    setDisputeOpen(false);
    setDisputeTarget(null);
    setDisputePhotos([]);
  };

  const submitDispute = async () => {
    if (!disputeTarget || disputeBusy) return;
    // The claim goes to the voucher of the week the tapped cell belongs to.
    // Reading `lastWeek` unconditionally is what made a This-week dispute post
    // against last week's voucher — or, with no last-week voucher, refuse.
    const forLast = disputeTarget.week === 'last';
    const voucherId = forLast ? lastWeek?.voucherId : current?.voucherId;
    if (!token || !voucherId) {
      Alert.alert(
        'No voucher to dispute yet',
        forLast
          ? 'Last week’s payment voucher hasn’t been issued yet — there’s nothing to dispute.'
          : 'This week’s voucher hasn’t been opened yet — log a shift first, then you can dispute an amount on it.',
      );
      return;
    }
    setDisputeBusy(true);
    try {
      // The tapped cell already knows its day and its income row, so both are
      // sent as structured fields. They used to be flattened into the note's
      // prose, which meant the server had to take the PR's word for what was
      // being disputed and could not price the claim.
      const result =
        disputeMode === 'withdraw'
          ? await withdrawMyDispute(token, voucherId, {
              disputeDate: disputeTarget.dateIso,
              component: disputeTarget.incomeKey,
            })
          : await raiseMyDispute(token, voucherId, {
              disputeDate: disputeTarget.dateIso,
              component: disputeTarget.incomeKey,
              reason: disputePreset,
              note: disputeNote.trim() || undefined,
              proofPhotos: disputePhotos.length ? disputePhotos : undefined,
              /*
               * ALWAYS the one shift, when the cell has a receipt at all.
               *
               * Sent even on a single-receipt day, so every claim from here on
               * records WHICH shift it was about. A null `receipt_refs` now
               * means only "raised before the picker existed" — a legacy row,
               * not a deliberate claim against the whole day.
               */
              receiptId:
                disputeReceipts.find((r) => r.receiptNo === disputePickedReceipt)?.receiptId ??
                undefined,
              /*
               * Sent only when the PR NARROWED to some of the receipt's items.
               * Ticking them all means "this whole receipt", which the row
               * records as a null `disputed_items` — the same statement, stored
               * without pretending a selection was made.
               */
              items:
                disputePickedItems.length > 0 &&
                disputePickedItems.length < disputeItems.length
                  ? disputePickedItems.map((lineId) => ({ lineId }))
                  : undefined,
            });
      const next = result.voucher;
      // Reflect the persisted state so the grid + header pill update immediately
      // and survive a reload (getMyLastWeek returns these fields).
      //
      // Only LAST week is local state here. This week lives in the shared
      // earnings context, so it is re-read rather than patched in place —
      // Check-In renders off the same object and would otherwise keep showing a
      // voucher that is no longer what the server holds.
      if (forLast) {
        setLastWeek((prev) =>
          prev
            ? {
                ...prev,
                status: next.status,
                disputeReason: next.disputeReason,
                disputeNote: next.disputeNote,
                disputedAt: next.disputedAt,
              }
            : prev,
        );
      } else {
        void refreshEarnings();
      }
      setDisputedKeys((prev) => {
        // Withdraw clears the whole voucher dispute; raise echoes the tapped cell.
        if (disputeMode === 'withdraw') return new Set();
        const nextSet = new Set(prev);
        nextSet.add(disputeTarget.key);
        return nextSet;
      });
      setDisputePhotoMap((prev) => {
        if (disputeMode === 'withdraw') return {};
        if (!disputePhotos.length) return prev;
        return { ...prev, [disputeTarget.key]: disputePhotos };
      });
      closeDispute();
    } catch (error) {
      Alert.alert(
        'Dispute failed',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setDisputeBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.pageHeader}>
        <View style={styles.headerTitleRow}>
          <Wallet size={22} color={C.accent} />
          <Text style={[styles.headerTitle, { fontSize: titleSize }]}>Payment</Text>
        </View>
      </View>

      <View style={styles.weekTabs}>
        <Pressable
          style={[styles.weekTab, weekTab === 'last' && styles.weekTabOn]}
          onPress={() => setWeekTab('last')}
        >
          <Text style={[styles.weekTabTitle, weekTab === 'last' && { color: C.txt }]}>
            Last week
          </Text>
          <Text style={styles.weekTabSub}>{lastLabel}</Text>
        </Pressable>
        <Pressable
          style={[styles.weekTab, weekTab === 'current' && styles.weekTabOn]}
          onPress={() => setWeekTab('current')}
        >
          <Text style={[styles.weekTabTitle, weekTab === 'current' && { color: C.txt }]}>
            This week
          </Text>
          <Text style={styles.weekTabSub}>{thisLabel}</Text>
        </Pressable>
      </View>

      {weekTab === 'last' ? (
        <View style={styles.section}>
          <Pressable style={styles.sectionHd} onPress={() => setLastOpen((o) => !o)}>
            <View style={{ flex: 1 }}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>LAST WEEK</Text>
                {lastWeek?.status && (
                  /*
                   * THE PILL IS THE VOUCHER'S STATE, NOT THE DAY COUNT.
                   *
                   * It keyed off `verifiedDays`, which was safe only while that
                   * counted `'verified'` alone. Now that an agency-approved day
                   * counts too, the old test would have printed **SENT** over a
                   * voucher still sitting at `pending_review` — telling a PR
                   * their week had gone out when nobody had issued it.
                   *
                   * Days are verified by day review; the WEEK is issued by the
                   * agency. Two different facts, two different sources.
                   */
                  <Pill variant={voucherDisputed ? 'red' : weekIssued ? 'green' : 'amber'}>
                    {voucherDisputed
                      ? 'DISPUTED'
                      : lastWeek.status === 'paid'
                        ? 'PAID'
                        : lastWeek.status === 'signed'
                          ? 'SIGNED'
                          : weekIssued
                            ? 'SENT'
                            : 'PENDING'}
                  </Pill>
                )}
                <Text style={styles.sectionFrac}>
                  {verifiedDays}/7
                </Text>
              </View>
              <Text style={styles.sectionAction}>
                {lastOpen ? 'Tap to collapse' : 'Tap to expand'}
              </Text>
            </View>
            <ChevronDown
              size={16}
              color={C.goldL}
              style={lastOpen ? { transform: [{ rotate: '180deg' }] } : undefined}
            />
          </Pressable>

          {lastOpen && (
            <View style={styles.sectionBody}>
              <Text style={styles.weekCaption}>Last week {lastLabel}</Text>
              <Text style={styles.verified}>Verified days {verifiedDays}/7</Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator
                style={{ marginTop: 12 }}
              >
                <View>
                  <View style={styles.gridRow}>
                    <Text style={[styles.gridCorner, styles.gridLabel]}> </Text>
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
                          const isDisputed = disputedCells.has(key);
                          const canTap = amount > 0 && d.status !== 'empty';
                          return (
                            <Pressable
                              key={key}
                              style={[
                                styles.gridCol,
                                canTap && styles.gridColTap,
                                isDisputed && styles.gridColDisputed,
                              ]}
                              onPress={() => canTap && openEvidence(d, row, 'last')}
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
                              {/*
                                * A FLAG PROMISES A DISPUTE — only draw it where
                                * one is possible. Wages and OT can never be
                                * contested, so a flag on them advertised an
                                * action that ends in a 400; they get the same
                                * inspect glyph as This-week, because tapping
                                * still opens the evidence.
                                */}
                              {canTap &&
                                (kindDisputable(row.key) &&
                                weekDisputable(lastWeek) ? (
                                  <Flag
                                    size={9}
                                    color={isDisputed ? C.red : C.muted2}
                                    style={{ marginTop: 2 }}
                                  />
                                ) : (
                                  <Search size={9} color={C.muted2} style={{ marginTop: 2 }} />
                                ))}
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
                        disputedCells.has(`${d.dateIso}-${r.key}`),
                      );
                      // Read from the day, not hardcoded. This row printed
                      // VERIFIED for every non-empty day regardless of what the
                      // agency had actually decided — including days it had
                      // held, and days the server downgraded because a receipt
                      // on them is still pending.
                      //
                      // LAST WEEK collapses 'approved' into VERIFIED: the week
                      // is closed, so the agency's day sign-off is final and
                      // nothing further will land on it. This week keeps the two
                      // apart (see its own Status row) because a mid-week
                      // approval is a checkpoint — more receipts can still
                      // arrive on that day. Same reason `verifiedDays` counts it.
                      const label = dayStatusLabel(
                        lastWeek,
                        d.dateIso,
                        d.status === 'approved' ? 'verified' : d.status,
                        dayDisputed,
                      );
                      const claims = disputesForDay(lastWeek, d.dateIso);
                      const openable = claims.open.length + claims.settled.length > 0;
                      return (
                        <Pressable
                          key={`st-${d.dateIso}`}
                          style={styles.gridCol}
                          onPress={() =>
                            openable && setClaimDay({ dateIso: d.dateIso, week: 'last' })
                          }
                          disabled={!openable}
                        >
                          <Text
                            style={[
                              styles.statusPill,
                              d.status === 'pending' && styles.statusPillPending,
                              label === 'DISPUTED' && styles.statusPillDisputed,
                              d.status === 'empty' && { color: C.muted2 },
                            ]}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <View style={styles.gridCol}>
                      <Text style={styles.statusPill}>{verifiedDays} verified</Text>
                    </View>
                  </View>
                </View>
              </ScrollView>

              {voucherDisputed && (
                <View style={styles.disputeBanner}>
                  <Text style={styles.disputeBannerTitle}>Dispute open · agency reviewing</Text>
                  {lastWeek?.disputeReason ? (
                    <Text style={styles.disputeBannerBody}>
                      {lastWeek.disputeReason}
                      {lastWeek.disputeNote ? ` — ${lastWeek.disputeNote}` : ''}
                    </Text>
                  ) : null}
                  <Text style={styles.disputeBannerHint}>
                    Tap any amount to see its receipts, then withdraw this dispute.
                  </Text>
                </View>
              )}

              {hasLastWeekRows ? (
                <>
                  <Text style={styles.disputeHint}>
                    Tap any amount to see the order number, shift and items behind it —
                    dispute it from there · tap a{' '}
                    <Text style={{ color: C.red }}>red</Text> amount to withdraw a mistaken dispute.
                  </Text>

                  <Text style={styles.footNote}>
                    PV issued every Sunday · Total{' '}
                    <Text style={styles.footTotal}>{formatRM(reviewAmount)}</Text>
                  </Text>
                </>
              ) : (
                <Text style={styles.emptyWeekHint}>
                  No PV for last week yet — this week’s PV is issued next Sunday.
                </Text>
              )}

              {awaiting && (
                <IzButton
                  label={`Review & sign · ${formatRM(reviewAmount)}`}
                  small
                  onPress={() => openPv(awaiting.id)}
                  style={{ marginTop: 10 }}
                />
              )}
            </View>
          )}
        </View>
      ) : (
        <View style={styles.section}>
          <Pressable style={styles.sectionHd} onPress={() => setThisOpen((o) => !o)}>
            <View style={{ flex: 1 }}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>THIS WEEK</Text>
                {/*
                  * The voucher-level fact, stated once.
                  *
                  * A dispute moves `payment_voucher.status` to 'disputed' for the
                  * WHOLE voucher, and that used to be invisible here — the week
                  * simply went blank, because the reader could not find a
                  * non-`pending_review` voucher at all. It reads correctly now,
                  * so the state it is in has to be legible: an open claim on a
                  * week the PR is still working is not an error, and saying so
                  * beats a silently normal-looking grid.
                  */}
                {current?.status === 'disputed' && (
                  <Text style={styles.disputePill}>DISPUTED</Text>
                )}
                <Text style={styles.sectionFrac}>{thisApprovedDays}/7</Text>
              </View>
              <Text style={styles.sectionAction}>
                {thisOpen ? 'Tap to collapse' : 'Tap to expand'}
              </Text>
            </View>
            <ChevronDown
              size={16}
              color={C.goldL}
              style={thisOpen ? { transform: [{ rotate: '180deg' }] } : undefined}
            />
          </Pressable>

          {thisOpen && (
            <View style={styles.sectionBody}>
              <View style={styles.thisHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.weekCaption}>This week</Text>
                  <Text style={styles.weekCaptionRange}>{thisLabel}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {/* "Approved", not "Verified": verification is the Monday
                      rollover, and this week has not had one. */}
                  <Text style={styles.verifiedTiny}>Approved days</Text>
                  <Text style={styles.sectionFrac}>{thisApprovedDays}/7</Text>
                </View>
              </View>

              {/* Where the agency has got to with what was logged. This is the
                  half of the lifecycle the PR can see: approval is what turns
                  their own claim into the agency's figure, and it is what lets
                  them dispute it next week. Absent when there are no receipts —
                  a line about nothing is worse than no line. */}
              {thisReviewCaption && (
                <Text style={styles.reviewCaption}>{thisReviewCaption}</Text>
              )}

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator
                style={{ marginTop: 12 }}
              >
                <View>
                  <View style={styles.gridRow}>
                    <Text style={[styles.gridCorner, styles.gridLabel]}> </Text>
                    {thisGrid.map((d) => (
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
                    const rowTotal = thisGrid.reduce(
                      (s, d) => s + cellAmount(d, row.key),
                      0,
                    );
                    return (
                      <View key={row.key} style={styles.gridRow}>
                        <Text style={styles.gridLabel}>{row.label}</Text>
                        {thisGrid.map((d) => {
                          const amount = cellAmount(d, row.key);
                          const canTap = amount > 0 && d.status !== 'empty';
                          return (
                            <Pressable
                              key={`${d.dateIso}-${row.key}`}
                              style={[styles.gridCol, canTap && styles.gridColTap]}
                              onPress={() => canTap && openEvidence(d, row, 'current')}
                              disabled={!canTap}
                            >
                              <Text
                                style={[
                                  styles.gridVal,
                                  d.status === 'pending' && amount > 0 && styles.gridValPending,
                                ]}
                              >
                                {formatCell(amount)}
                              </Text>
                              {/*
                                * Same honesty rule as Last week: a flag where a
                                * dispute is actually possible, the inspect glyph
                                * where tapping only opens the evidence.
                                */}
                              {canTap &&
                                (kindDisputable(row.key) &&
                                weekDisputable(current) &&
                                weekDisputable(current) ? (
                                  <Flag size={9} color={C.muted2} style={{ marginTop: 2 }} />
                                ) : (
                                  <Search size={9} color={C.muted2} style={{ marginTop: 2 }} />
                                ))}
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
                    {thisGrid.map((d) => {
                      /*
                       * Marked from the DAY's own claims, not the voucher flag.
                       *
                       * Last week paints every day DISPUTED off
                       * `payment_voucher.status`, which is a voucher-grain
                       * summary. Doing that here would brand all seven days
                       * over one contested drinks cell — on the week the PR is
                       * still working. `disputedKeys` holds the cells actually
                       * claimed, so only those say so; the card header carries
                       * the voucher-level fact.
                       */
                      const dayDisputed = INCOME_ROWS.some((r) =>
                        disputedCells.has(`${d.dateIso}-${r.key}`),
                      );
                      /*
                       * PENDING → APPROVED → DISPUTED → VERIFIED.
                       *
                       * APPROVED is the state this week reaches on its own: the
                       * agency signs a day off mid-week. A claim then outranks
                       * it — the approval is the very thing being argued with —
                       * and once that claim is ANSWERED the day reads VERIFIED,
                       * a stronger statement than approved: the figure was
                       * questioned and settled (owner, 4 Aug 2026).
                       */
                      const label = dayStatusLabel(
                        current,
                        d.dateIso,
                        thisWeekDayStatus(d.status),
                        dayDisputed,
                      );
                      const claims = disputesForDay(current, d.dateIso);
                      const openable = claims.open.length + claims.settled.length > 0;
                      return (
                        <Pressable
                          key={`st-${d.dateIso}`}
                          style={styles.gridCol}
                          onPress={() =>
                            openable && setClaimDay({ dateIso: d.dateIso, week: 'current' })
                          }
                          disabled={!openable}
                        >
                          <Text
                            style={[
                              styles.statusPill,
                              d.status === 'pending' && styles.statusPillPending,
                              label === 'DISPUTED' && styles.statusPillDisputed,
                              label === 'VERIFIED' && styles.statusPillVerified,
                              d.status === 'empty' && { color: C.muted2 },
                            ]}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <View style={styles.gridCol}>
                      <Text
                        style={[
                          styles.statusPill,
                          thisPendingDays > 0 && styles.statusPillPending,
                        ]}
                      >
                        {thisPendingDays > 0
                          ? `${thisPendingDays} pending`
                          : `${thisApprovedDays} approved`}
                      </Text>
                    </View>
                  </View>
                </View>
              </ScrollView>

              <Text style={styles.footNote} numberOfLines={1}>
                PV on <Text style={styles.footBold}>{issueDay}</Text> · total{' '}
                <Text style={styles.footTotal}>{formatRM(thisWeekTotal)}</Text>
              </Text>

              {!hasThisWeekRows && (
                <Text style={styles.emptyWeekHint}>
                  Check out from Attendance to seal today’s wages and commissions here for this
                  week’s PV.
                </Text>
              )}
            </View>
          )}
        </View>
      )}

      {/*
        * WHAT was disputed on this day — the answer to "it says DISPUTED, but
        * which of my four rows?". Reachable by tapping the status cell, and fed
        * by the server's own dispute rows, so it is the same record the agency
        * is working from rather than a client-side echo of it.
        */}
      {claimDay && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setClaimDay(null)}>
          {/*
            * Dismiss target is a SIBLING above the sheet, not a Pressable
            * parent — a Pressable ancestor competes with the ScrollView for the
            * touch responder on Android, which is why scrolling sometimes
            * failed. Same fix as CellEvidenceSheet.
            */}
          <View style={styles.backdrop}>
            <Pressable style={styles.backdropTap} onPress={() => setClaimDay(null)} />
            <View style={styles.sheet}>
              {(() => {
                const week = claimDay.week === 'last' ? lastWeek : current;
                const { open, settled } = disputesForDay(week, claimDay.dateIso);
                const rows = [...open, ...settled];
                const labelOf = (k: string) =>
                  INCOME_ROWS.find((r) => r.key === k)?.label ?? k;
                return (
                  <>
                    <Text style={styles.claimTitle}>What you disputed</Text>
                    <Text style={styles.claimDay}>{longDay(claimDay.dateIso)}</Text>
                    {/*
                      * SCROLLS, and shrinks so Close stays reachable — a day
                      * with two claims, each listing its shift and items, ran
                      * off the bottom of the sheet with no way down.
                      *
                      * `claimShifts` walks the WHOLE week to rebuild the day's
                      * evidence, and it was called three times per row — once
                      * for the heading, once to test emptiness, once to map.
                      * Hoisted to one call per claim.
                      */}
                    <ScrollView style={styles.claimScroll} showsVerticalScrollIndicator={false}>
                    {rows.map((d) => {
                      const shifts = claimShifts(week, d);
                      return (
                      <View key={d.id} style={styles.claimRow}>
                        <View style={styles.claimHead}>
                          <Text style={styles.claimComponent}>{labelOf(d.component)}</Text>
                          <Text
                            style={[
                              styles.claimState,
                              d.outcome === null && styles.statusPillDisputed,
                              d.outcome === 'accepted' && styles.statusPillVerified,
                            ]}
                          >
                            {d.outcome === null
                              ? 'OPEN'
                              : d.outcome === 'accepted'
                                ? 'ACCEPTED'
                                : d.outcome === 'rejected'
                                  ? 'REJECTED'
                                  : 'WITHDRAWN'}
                          </Text>
                        </View>
                        <Text style={styles.claimMeta}>
                          Voucher said {formatRM(Number(d.disputedAmount ?? 0))}
                          {d.reason ? ` · ${d.reason}` : ''}
                        </Text>

                        {/*
                          * WHICH SHIFT — resolved from the claim's own
                          * `receiptRefs` back through the day's evidence, so the
                          * PR reads the same outlet, slot and stamps the proof
                          * sheet shows for that receipt.
                          *
                          * A claim with no refs predates the shift picker and
                          * genuinely records no shift. That is stated rather
                          * than left blank: an empty space reads as "not loaded
                          * yet", which would have the PR waiting for something
                          * that is never coming.
                          */}
                        {/*
                          * A claim with no `receiptRefs` covered the whole cell,
                          * so `claimShifts` returns EVERY shift on it. Saying so
                          * above the list is what stops the PR reading two rows
                          * as two separate claims.
                          */}
                        {!d.receiptRefs?.length && shifts.length > 1 && (
                          <Text style={styles.claimNote}>
                            Filed against the whole day — it covered both shifts below.
                          </Text>
                        )}
                        {shifts.length > 0 ? (
                          shifts.map((s) => (
                            <View key={s.receiptNo} style={styles.claimShift}>
                              <Text style={styles.claimShiftHead}>
                                {s.orderNo ?? 'No order no'} · {s.receiptNo}
                              </Text>
                              <Text style={styles.claimShiftMeta}>
                                {s.outletName ? `${s.outletName} · ` : ''}
                                {s.slot ?? 'shift time unknown'}
                              </Text>
                              <Text style={styles.claimShiftMeta}>
                                In {shortStamp(s.checkInAt)} · Out {shortStamp(s.checkOutAt)}
                              </Text>
                              {/*
                                * WHAT was claimed, from the snapshot taken when
                                * it was raised — so it still reads correctly
                                * after the agency corrects the receipt. Absent
                                * means the whole receipt, which is said out loud
                                * rather than left to be inferred from silence.
                                */}
                              {d.disputedItems?.length ? (
                                d.disputedItems.map((it) => (
                                  <Text key={it.lineId} style={styles.claimItem}>
                                    {it.description} × {it.quantity} ·{' '}
                                    {formatRM(Number(it.amount ?? 0))}
                                  </Text>
                                ))
                              ) : (
                                <Text style={styles.claimShiftMeta}>
                                  The whole receipt
                                </Text>
                              )}
                            </View>
                          ))
                        ) : (
                          // Only when the day has no receipts at all to point at
                          // — a wages/OT claim, which is derived from the
                          // attendance stamps and has no paper behind it.
                          <Text style={styles.claimNote}>
                            No receipt behind this — it is calculated from your check-in and
                            check-out times.
                          </Text>
                        )}

                        {!!d.note && <Text style={styles.claimNote}>{d.note}</Text>}
                        {/*
                          * The agency's answer, verbatim. A rejected claim
                          * without its reason is the PR asked to accept "no"
                          * and given nothing to act on.
                          */}
                        {!!d.resolutionNote && (
                          <Text style={styles.claimAnswer}>
                            Agency: {d.resolutionNote}
                          </Text>
                        )}

                        {/*
                          * CANCEL, where the PR can see WHAT they are cancelling.
                          *
                          * Withdrawing was only reachable by tapping a red grid
                          * cell, where the button still read "Dispute this
                          * amount" and silently became a withdraw — so the one
                          * action that takes a claim back was both hidden and
                          * mislabelled. Here it sits under the claim itself.
                          *
                          * Only on an OPEN claim: an answered one is a decision
                          * the agency has made, and retracting it afterwards
                          * would rewrite the outcome of a money decision.
                          */}
                        {d.outcome === null && (
                          <Pressable
                            style={styles.claimCancel}
                            disabled={disputeBusy}
                            onPress={() => void cancelClaim(d)}
                          >
                            <Text style={styles.claimCancelText}>
                              {disputeBusy ? 'Cancelling…' : 'Cancel this dispute'}
                            </Text>
                          </Pressable>
                        )}
                      </View>
                      );
                    })}
                    </ScrollView>
                    {/* Close is RED, app-wide (owner's colour code) — same as
                      * dangerBtn and the evidence sheet's Close. */}
                    <Pressable style={styles.sheetCloseBtn} onPress={() => setClaimDay(null)}>
                      <Text style={styles.sheetCloseText}>Close</Text>
                    </Pressable>
                  </>
                );
              })()}
            </View>
          </View>
        </Modal>
      )}

      {evidenceTarget && (
        <CellEvidenceSheet
          evidence={buildCellEvidence(
            evidenceTarget.week === 'last' ? lastWeek : current,
            evidenceTarget.dateIso,
            evidenceTarget.incomeKey,
          )}
          cellAmount={evidenceTarget.amount}
          claims={receiptClaimState(
            evidenceTarget.week === 'last' ? lastWeek : current,
            evidenceTarget.dateIso,
            evidenceTarget.incomeKey,
          )}
          onClose={() => setEvidenceTarget(null)}
          /*
           * Dispute only exists for an ISSUED voucher. On This-week there is no
           * figure the agency has stated back to the PR yet, so offering to
           * contest one would promise an action the server would refuse.
           */
          onDispute={
            /*
             * DRINKS AND TIPS, on a voucher the server will still accept.
             *
             * Both halves are the SERVER's rules mirrored, not a guess about
             * which tab we are on — and each half was got wrong once:
             *
             * - `week === 'last'` alone offered Dispute on Daily wages, which
             *   `DISPUTABLE_KINDS` rejects with a 400. Hence `kindDisputable`.
             * - Then `week === 'last'` was itself wrong. `DISPUTABLE_STATUSES`
             *   is ['pending_review','sent','disputed'] — the CURRENT week is
             *   `pending_review`, so it was disputable all along and the tab
             *   test was hiding a button the PR was entitled to. Hence
             *   `weekDisputable`, which reads the voucher's own status.
             *
             * - Then the third test was missing here too. A PENDING day is one
             *   the agency has NOT approved, so there is no stated figure to
             *   argue with — `cellDisputable` says so, `openDispute` enforced it,
             *   but the button was still offered and answered with an alert.
             *   Owner: *"pending is the agency havent approved, then how can
             *   dispute"*. Quite so.
             *
             * `openDispute` keeps its own copy of that last check, because it
             * also decides WHICH refusal message to show — but it should now
             * never be reached through this button.
             */
            /*
             * - The third test is now PER SHIFT, not per cell. `cellDisputable`
             *   demanded every line in the day+bucket be reviewed, so ONE
             *   pending receipt silenced an argument about an approved shift
             *   beside it. A shift that can be contested is enough to offer the
             *   button; the picker then lists only those shifts.
             *
             * A shift already VERIFIED (its earlier claim answered) still counts:
             * resolving a claim ends that claim, not the right to disagree
             * again, and 0086's partial index is what permits the second one.
             */
            kindDisputable(evidenceTarget.incomeKey) &&
            weekDisputable(evidenceTarget.week === 'last' ? lastWeek : current) &&
            evidenceDisputableCount > 0
              ? () => {
                  const { day, row, week } = evidenceTarget;
                  setEvidenceTarget(null);
                  openDispute(day, row, week);
                }
              : undefined
          }
        />
      )}

      <Modal
        visible={disputeOpen}
        transparent
        animationType="slide"
        onRequestClose={closeDispute}
      >
        {/* Same responder fix as the other sheets: dismiss is a sibling. */}
        <View style={styles.backdrop}>
          <Pressable style={styles.backdropTap} onPress={closeDispute} />
          <View
            style={[styles.sheet, keyboardInset > 0 && { paddingBottom: keyboardInset + 16 }]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
            <Text style={styles.sheetTitle}>
              {disputeMode === 'withdraw' ? 'Withdraw dispute?' : 'Dispute this amount'}
            </Text>
            {disputeTarget && (
              <View style={styles.targetPill}>
                <Text style={styles.targetPillText}>
                  {disputeTarget.dayLabel} {disputeTarget.dateNum} · {disputeTarget.incomeLabel} ·{' '}
                  {formatRM(disputeTarget.amount)}
                </Text>
              </View>
            )}

            {disputeMode === 'dispute' ? (
              <>
                {/*
                  * WHICH SHIFT? Only asked when the day holds more than one
                  * receipt in this bucket — a single-receipt day has nothing to
                  * choose and a chooser there would be noise.
                  *
                  * A dispute is filed per day + component, so a PR working two
                  * shifts on one night could previously only contest BOTH at
                  * once: the claim was recorded against the day's full total,
                  * and accepting it settled money nobody had questioned. The
                  * selection rides in `receiptRefs` and narrows the server's
                  * `disputedAmount` to exactly what was picked.
                  *
                  * Keyed by receiptNo because the order number is NOT unique —
                  * the same paper logged twice on one night reads ORD0389 on
                  * both, which is precisely the pair a PR needs to separate.
                  */}
                {disputeReceipts.length > 1 && (
                  <>
                    <Text style={styles.fieldLabel}>Which one is wrong?</Text>
                    <View style={styles.presetWrap}>
                      {disputeReceipts.map((r) => {
                        const on = disputePickedReceipt === r.receiptNo;
                        return (
                          <Pressable
                            key={r.receiptNo}
                            style={[
                              styles.rcptChip,
                              on ? styles.rcptChipOn : styles.rcptChipOff,
                              !r.disputable && styles.rcptChipBlocked,
                            ]}
                            // Tapping the chosen one again does NOT clear it: a
                            // dispute needs a shift, and an empty selection is
                            // not a state the PR can usefully be left in.
                            onPress={() => r.disputable && setDisputePickedReceipt(r.receiptNo)}
                            disabled={!r.disputable}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: on, disabled: !r.disputable }}
                            accessibilityLabel={`${r.label}${on ? ', selected' : ''}${
                              r.blockedNote ? `, ${r.blockedNote}` : ''
                            }`}
                          >
                            {/*
                              * A TICKED BOX, not a tinted outline.
                              *
                              * These chips reused the "quick reason" style, which
                              * is a single-select — so multi-select read as a
                              * radio group, and the only difference between on
                              * and off was a faint border tint. Worse, the label
                              * referenced `styles.presetText`, which does not
                              * exist, so it rendered with NO style at all.
                              *
                              * Selection now carries three independent signals —
                              * the box, the fill, and the text weight/colour — so
                              * it survives a dim screen and does not depend on
                              * colour perception alone.
                              */}
                            {/*
                              * A filled DOT, drawn with a View — not an icon.
                              *
                              * This held `<Check />`, which was never imported,
                              * so the first render of the picker threw a
                              * ReferenceError and the whole screen went blank on
                              * tapping Dispute. A dot is also the right mark for
                              * an exclusive choice, so nothing is lost by it.
                              */}
                            <View style={[styles.rcptBox, on && styles.rcptBoxOn]}>
                              {on && <View style={styles.rcptDot} />}
                            </View>
                            {/*
                              * NO numberOfLines — the note is the point.
                              * Clamping to one line turned "waiting on your
                              * agency" into "waiting on yo…", which reads as a
                              * glitch rather than a reason. It wraps instead.
                              */}
                            <Text style={[styles.rcptChipText, on && styles.rcptChipTextOn]}>
                              {r.label}
                              {r.blockedNote ? ` · ${r.blockedNote}` : ''}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={styles.pickedHint}>
                      {disputePickedReceipt === null
                        ? 'Pick the shift you are disputing.'
                        : `Disputing ${formatRM(disputePickedSubtotal)} of this day's ${formatRM(disputeTarget?.amount ?? 0)}.`}
                    </Text>
                  </>
                )}

                {/*
                  * WHICH ITEM on that shift's receipt.
                  *
                  * Shown once a shift is chosen and it carries more than one
                  * item. A tips receipt holds Tips, Booking commission and Havoc
                  * together, so "tips on Tue 4 is wrong" left the agency to guess
                  * which of the three — and the PR with no way to say.
                  *
                  * MULTI-select here, unlike the shift above: one paper can
                  * genuinely have two wrong lines, and they are one argument
                  * about one receipt. All start ticked, so the common "this whole
                  * receipt is wrong" needs no extra taps.
                  */}
                {disputeItems.length > 1 && (
                  <>
                    <Text style={styles.fieldLabel}>Which item?</Text>
                    <View style={styles.presetWrap}>
                      {disputeItems.map((it) => {
                        const on = disputePickedItems.includes(it.id);
                        return (
                          <Pressable
                            key={it.id}
                            style={[styles.rcptChip, on ? styles.rcptChipOn : styles.rcptChipOff]}
                            onPress={() =>
                              setDisputePickedItems((prev) =>
                                prev.includes(it.id)
                                  ? prev.filter((x) => x !== it.id)
                                  : [...prev, it.id],
                              )
                            }
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: on }}
                          >
                            <View style={[styles.rcptSquare, on && styles.rcptSquareOn]} />
                            <Text
                              style={[styles.rcptChipText, on && styles.rcptChipTextOn]}
                              numberOfLines={1}
                            >
                              {it.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {disputePickedItems.length === 0 && (
                      <Text style={styles.pickedHint}>Pick at least one item.</Text>
                    )}
                  </>
                )}

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
                <TextInput
                  value={disputeNote}
                  onChangeText={setDisputeNote}
                  style={[styles.input, { minHeight: 88, textAlignVertical: 'top', marginTop: 10 }]}
                  multiline
                  placeholder="Add detail for your agency…"
                  placeholderTextColor={C.muted2}
                />

                <Pressable
                  style={styles.attachBtn}
                  onPress={() =>
                    pickDisputeImages((urls) =>
                      setDisputePhotos((prev) => [...prev, ...urls].slice(0, 6)),
                    )
                  }
                >
                  <ImagePlus size={14} color={C.txt} />
                  <Text style={styles.attachBtnText}>Attach files (images)</Text>
                  <Text style={styles.attachOptional}>optional</Text>
                </Pressable>

                {disputePhotos.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.photoRow}
                    contentContainerStyle={{ gap: 8 }}
                  >
                    {disputePhotos.map((src, index) => (
                      <View key={`${index}-${src.slice(0, 24)}`} style={styles.photoThumb}>
                        <Image source={{ uri: src }} style={styles.photoImg} />
                        <Pressable
                          style={styles.photoRemove}
                          onPress={() =>
                            setDisputePhotos((prev) => prev.filter((_, i) => i !== index))
                          }
                          hitSlop={6}
                        >
                          <XIcon size={12} color={C.txt} />
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                )}

                <Text style={styles.attachHint}>
                  {disputePhotos.length > 0
                    ? `${disputePhotos.length} image${disputePhotos.length === 1 ? '' : 's'} attached as proof`
                    : 'Proof images are optional — attach a receipt photo if you have one.'}
                </Text>

                <View style={styles.sheetActions}>
                  <Pressable style={styles.backBtn} onPress={closeDispute}>
                    <Text style={styles.backBtnText}>Back</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.submitBtn,
                      grad(GRADIENTS.accent, C.accent),
                      (disputeBusy || noReceiptPicked) && { opacity: 0.6 },
                    ]}
                    onPress={submitDispute}
                    /*
                     * Deselecting every receipt is not "dispute the whole day" —
                     * it is an unfinished sentence. Blocked rather than silently
                     * widened back to the full cell, which would file a claim
                     * about money the PR had just deselected.
                     */
                    disabled={disputeBusy || noReceiptPicked}
                  >
                    <Text style={styles.primaryText}>
                      {disputeBusy ? 'Submitting…' : 'Submit dispute'}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.sheetSub}>
                  Flagged this amount by mistake? Withdraw and it returns to verified.
                  {(disputeTarget && disputePhotoMap[disputeTarget.key]?.length)
                    ? ` · ${disputePhotoMap[disputeTarget.key].length} proof image(s) will be cleared.`
                    : ''}
                </Text>
                <Pressable
                  style={[styles.dangerBtn, disputeBusy && { opacity: 0.6 }]}
                  onPress={submitDispute}
                  disabled={disputeBusy}
                >
                  <Text style={styles.dangerBtnText}>
                    {disputeBusy ? 'Withdrawing…' : 'Withdraw dispute'}
                  </Text>
                </Pressable>
                <Pressable style={styles.cancel} onPress={closeDispute}>
                  <Text style={styles.cancelText}>Back</Text>
                </Pressable>
              </>
            )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 6, paddingHorizontal: 18, paddingBottom: 26 },
  pageHeader: { paddingTop: 2 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  headerTitle: { fontFamily: F.sora, fontWeight: '800', letterSpacing: -0.45, color: C.txt },
  weekTabs: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  weekTab: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: 'rgba(255,255,255,0.02)',
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  weekTabOn: {
    borderColor: 'rgba(183,156,232,0.45)',
    backgroundColor: 'rgba(183,156,232,0.1)',
  },
  weekTabTitle: { fontFamily: F.sora, fontSize: 14, fontWeight: '700', color: C.muted },
  weekTabSub: {
    marginTop: 4,
    fontFamily: F.manrope,
    fontSize: 11,
    color: C.prMuted2,
    textAlign: 'center',
  },
  section: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  sectionHd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  sectionTitle: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: C.txt,
  },
  sectionFrac: { fontFamily: F.sora, fontSize: 13, fontWeight: '700', color: C.goldL },
  sectionAction: {
    marginTop: 4,
    fontFamily: F.manrope,
    fontSize: 12,
    fontWeight: '600',
    color: C.goldL,
  },
  sectionBody: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: C.line },
  weekCaption: {
    marginTop: 12,
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '700',
    color: C.txt,
  },
  weekCaptionRange: {
    marginTop: 2,
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '700',
    color: C.txt,
  },
  thisHead: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  verified: { marginTop: 4, fontFamily: F.manrope, fontSize: 13, color: C.prMuted },
  reviewCaption: {
    marginTop: 8,
    fontFamily: F.manrope,
    fontSize: 12,
    lineHeight: 17,
    color: C.prMuted,
  },
  verifiedTiny: {
    fontFamily: F.manrope,
    fontSize: 11,
    color: C.prMuted2,
  },
  emptyWeekHint: {
    marginTop: 10,
    fontFamily: F.manrope,
    fontSize: 12,
    lineHeight: 17,
    color: C.prMuted,
    textAlign: 'center',
  },
  gridRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  gridCorner: { width: 78 },
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
  gridValPending: { color: C.amber },
  gridValDisputed: { color: C.red },
  statusPill: {
    fontFamily: F.sora,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.3,
    color: C.green,
    textAlign: 'center',
  },
  statusPillPending: { color: C.amber },
  statusPillDisputed: { color: C.red },
  /** A day whose claim has been ANSWERED — settled, not merely approved. */
  statusPillVerified: { color: C.green },
  /* Receipt picker — MULTI-select, so it reads as ticked boxes, not chips. */
  rcptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    width: '100%',
  },
  rcptChipOn: {
    borderColor: C.accent,
    backgroundColor: 'rgba(227,184,119,0.14)',
  },
  /* Unselected is deliberately RECESSIVE — the eye should land on what is in. */
  rcptChipOff: {
    borderColor: C.line,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  /* Listed but not choosable: visibly inert, and the chip says why. */
  rcptChipBlocked: { opacity: 0.45 },
  /* Round, because the choice is exclusive — a square reads as "tick many". */
  rcptBox: {
    width: 17,
    height: 17,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: C.muted2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rcptBoxOn: {
    borderColor: C.accent,
    backgroundColor: 'transparent',
  },
  rcptDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: C.accent,
  },
  /* SQUARE for items — they are multi-select, unlike the round shift radio. */
  rcptSquare: {
    width: 15,
    height: 15,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: C.muted2,
  },
  rcptSquareOn: { borderColor: C.accent, backgroundColor: C.accent },
  rcptChipText: {
    flex: 1,
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '600',
    color: C.muted2,
  },
  rcptChipTextOn: {
    color: C.accentL,
    fontWeight: '800',
  },
  pickedHint: {
    marginTop: 6,
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.prMuted,
  },
  /** Gives way to the header and Close button, so the sheet never overflows. */
  claimScroll: { marginTop: 4, flexShrink: 1 },
  /** The dismiss area above a sheet — a sibling, never a Pressable parent. */
  backdropTap: { flex: 1 },
  /** Close is red app-wide — mirrors dangerBtn. */
  sheetCloseBtn: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(240,138,138,0.45)',
    backgroundColor: 'rgba(240,138,138,0.12)',
  },
  sheetCloseText: { fontFamily: F.sora, fontSize: 15, fontWeight: '700', color: C.red },
  claimTitle: { fontFamily: F.sora, fontSize: 18, fontWeight: '800', color: C.txt },
  claimDay: { marginTop: 2, fontFamily: F.manrope, fontSize: 12, color: C.prMuted },
  claimRow: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.glass,
  },
  claimHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  claimComponent: { fontFamily: F.sora, fontSize: 14, fontWeight: '800', color: C.txt },
  claimState: { fontFamily: F.sora, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  claimMeta: { marginTop: 4, fontFamily: F.manrope, fontSize: 12, color: C.prMuted },
  claimShift: {
    marginTop: 8,
    paddingLeft: 9,
    borderLeftWidth: 2,
    borderLeftColor: C.line2,
  },
  claimShiftHead: { fontFamily: F.sora, fontSize: 12, fontWeight: '800', color: C.accentL },
  claimShiftMeta: { marginTop: 2, fontFamily: F.manrope, fontSize: 11, color: C.prMuted2 },
  claimItem: { marginTop: 3, fontFamily: F.sora, fontSize: 12, fontWeight: '700', color: C.txt },
  claimCancel: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(240,138,138,0.35)',
    backgroundColor: C.redBg,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  claimCancelText: { fontFamily: F.sora, fontSize: 12, fontWeight: '800', color: C.red },
  claimNote: { marginTop: 4, fontFamily: F.manrope, fontSize: 12, color: C.muted2 },
  claimAnswer: { marginTop: 6, fontFamily: F.manrope, fontSize: 12, color: C.goldL },
  /** Voucher-level DISPUTED chip in the This-week card header. */
  disputePill: {
    fontFamily: F.sora,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: C.red,
    backgroundColor: C.redBg,
    borderWidth: 1,
    borderColor: 'rgba(240,138,138,0.35)',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  disputeHint: {
    marginTop: 10,
    fontFamily: F.manrope,
    fontSize: 12,
    lineHeight: 17,
    color: C.prMuted,
    textAlign: 'center',
  },
  disputeBanner: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(240,138,138,0.4)',
    backgroundColor: C.redBg,
    padding: 12,
  },
  disputeBannerTitle: {
    fontFamily: F.sora,
    fontSize: 13,
    fontWeight: '800',
    color: C.red,
  },
  disputeBannerBody: {
    marginTop: 4,
    fontFamily: F.manrope,
    fontSize: 12,
    lineHeight: 17,
    color: C.txt,
  },
  disputeBannerHint: {
    marginTop: 6,
    fontFamily: F.manrope,
    fontSize: 11,
    color: C.prMuted,
  },

  footNote: {
    marginTop: 10,
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.muted2,
    textAlign: 'center',
  },
  footBold: {
    fontFamily: F.sora,
    fontWeight: '800',
    color: C.txt,
  },
  footTotal: {
    fontFamily: F.sora,
    fontWeight: '800',
    color: C.accent,
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
    // Fills a real phone edge to edge and only caps on a tablet. 392 was the
    // WEB phone-frame width, so on a 411dp handset it left dead margins either
    // side; the frame itself is narrower than this, so web is unaffected.
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
    /*
     * Never taller than the screen. Shared by the dispute sheet and the claim
     * sheet, both of which grow with the data — two shifts, seven reasons, a
     * note box and a keyboard — and both of which put their primary button at
     * the BOTTOM. Unbounded, that button leaves the viewport and the sheet
     * becomes a dead end.
     */
    maxHeight: '90%',
  },
  sheetTitle: { fontFamily: F.sora, fontSize: 20, fontWeight: '800', color: C.txt },
  sheetSub: {
    marginTop: 6,
    fontFamily: F.manrope,
    fontSize: 13,
    color: C.prMuted,
    lineHeight: 18,
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
  fieldLabel: {
    marginTop: 12,
    marginBottom: 4,
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: C.prMuted2,
  },
  presetWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
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
  input: {
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '600',
    color: C.txt,
    borderWidth: 1,
    borderColor: C.line2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  attachBtn: {
    marginTop: 12,
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
  attachBtnText: {
    fontFamily: F.sora,
    fontSize: 13,
    fontWeight: '600',
    color: C.txt,
  },
  attachOptional: {
    fontFamily: F.manrope,
    fontSize: 11,
    color: C.muted2,
  },
  attachHint: {
    marginTop: 8,
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.prMuted,
    lineHeight: 16,
  },
  photoRow: {
    marginTop: 10,
    maxHeight: 78,
  },
  photoThumb: {
    width: 68,
    height: 68,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  photoImg: {
    width: '100%',
    height: '100%',
  },
  photoRemove: {
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
  sheetActions: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 8,
  },
  backBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  backBtnText: {
    fontFamily: F.sora,
    fontSize: 15,
    fontWeight: '700',
    color: C.prMuted,
  },
  submitBtn: {
    flex: 1.4,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { fontFamily: F.sora, fontSize: 15, fontWeight: '700', color: '#241a08' },
  dangerBtn: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(240,138,138,0.45)',
    backgroundColor: 'rgba(240,138,138,0.12)',
  },
  dangerBtnText: { fontFamily: F.sora, fontSize: 15, fontWeight: '700', color: C.red },
  cancel: { marginTop: 10, alignItems: 'center', padding: 10 },
  cancelText: { fontFamily: F.sora, fontSize: 14, fontWeight: '600', color: C.muted },
});
