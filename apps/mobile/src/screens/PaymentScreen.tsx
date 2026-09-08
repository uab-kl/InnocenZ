/**
 * Payment — port of InnocenZ-proto `/host/PaymentVoucher`:
 * Payroll header, week tabs, LAST WEEK card with full pay grid + dispute taps.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
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
  DAY_SHORT,
  MONTH_SHORT,
  formatRM,
  formatUpcomingWeekLabel,
  weekPayGridTotal,
  weekPvIssueDayLabel,
  weekRangeIso,
  type WeeklyDayPay,
} from '../lib/demo-shifts';
import { usePrEarnings } from '../lib/pr-earnings';
import {
  fetchMyLastWeek,
  getMyPenalties,
  raiseMyDispute,
  withdrawMyDispute,
  type MyPenaltiesWeek,
  type PrCurrentWeek,
  type PrDisputeState,
  type PrReceiptLine,
} from '../lib/api';
import { useSession } from '../lib/session';
import { useSignedPvs } from '../lib/signed-pv';
import {
  buildWeekGridFromLines,
  type GridBucket,
  VERIFIED_STATUSES,
} from '../lib/week-pay-grid';
import { buildCellEvidence, receiptDisputable } from '../lib/cell-evidence';
import { CellEvidenceSheet } from '../components/CellEvidenceSheet';
import {
  dayStatusLabel,
  cellReviewTone,
  dayReceiptSummary,
  disputesForDay,
  kindDisputable,
  openDisputeKeys,
  receiptClaimState,
  receiptReviewCaption,
  thisWeekDayStatus,
  weekDisputable,
  type DayStatusLabel,
} from '../lib/receipt-review';
import { pickProofPhotos, resolveProofPhotoUri } from '../lib/proof-photo';
import { useKeyboardInset } from '../lib/use-keyboard-inset';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useViewportSize } from '../lib/viewport';
import { useLocale, formatMessage } from '../i18n';
import type { AppTranslations } from '../i18n';
import { IzButton, Pill } from '../components/ui';
import {
  ChevronDown,
  Flag,
  ImagePlus,
  Search,
  AlertTriangle,
  Wallet,
  XIcon,
} from '../components/icons';
import type { PrTab } from '../components/BottomNav';
import { usePrNav } from '../lib/pr-nav';

type WeekTab = 'last' | 'current';
type IncomeKey = 'wages' | 'drinks' | 'tips' | 'others';

type DisputeTarget = {
  key: string;
  /**
   * The day, as a DATE — no frozen `dayLabel`/`dateNum` beside it. Those were a
   * rendered weekday and day-of-month kept in state, which went stale the
   * moment the PR switched language with the sheet open; the pill derives both
   * from this ISO at render time (`dayAndDateLabel`).
   */
  dateIso: string;
  incomeKey: IncomeKey;
  /**
   * NO `incomeLabel` here on purpose. A rendered label frozen into state goes
   * stale the moment the PR switches language with the sheet open, so the row
   * name is derived from `incomeKey` at render time (`incomeRowLabel`).
   */
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

/*
 * "Attach files (images)" did nothing on a phone.
 *
 * This screen carried its own picker whose first line was
 * `if (Platform.OS !== 'web') return;` — so on a real device the button
 * rendered, took the tap, and returned immediately. Nothing opened, nothing
 * was said. Meanwhile proof-photo.ts already had a working native path; this
 * was a web-only duplicate of it that never grew one.
 *
 * Deleted in favour of the shared helper, asking for the LIBRARY: the photo a
 * PR attaches to a dispute was taken hours ago, so opening the camera would
 * make them cancel out of it first.
 */
const pickDisputeImages = (onPicked: (urls: string[]) => void) =>
  pickProofPhotos(onPicked, { multiple: true, source: 'library' });

/**
 * The four earning buckets.
 *
 * `key` is the STORED value — it is a voucher line's `kind` and a claim's
 * `component`, sent to the server and compared against, so it never moves.
 * `label` is a FUNCTION of the dictionary rather than a string, because this
 * list is built at module scope, before any hook can run.
 *
 * `noteLabel` is the English name, kept for the one place a row name is not
 * rendered but TRANSMITTED: the pre-filled dispute note that lands in the
 * agency's inbox (`openDispute`). That prose is posted to the server, so it
 * stays in one language whatever the PR's phone is set to.
 */
type IncomeRow = {
  key: IncomeKey;
  noteLabel: string;
  label: (t: AppTranslations) => string;
};

const INCOME_ROWS: IncomeRow[] = [
  { key: 'wages', noteLabel: 'Daily wages', label: (t) => t.payment.rowWages },
  { key: 'drinks', noteLabel: 'Drinks', label: (t) => t.payment.rowDrinks },
  { key: 'tips', noteLabel: 'Tips', label: (t) => t.payment.rowTips },
  { key: 'others', noteLabel: 'Others', label: (t) => t.payment.rowOthers },
];

/** One income row's name, resolved from the stored bucket key. */
function incomeRowLabel(key: string, t: AppTranslations): string {
  return INCOME_ROWS.find((r) => r.key === key)?.label(t) ?? key;
}

/**
 * The dispute reasons, worded for the reader — for CLAIMS ALREADY RAISED.
 *
 * The chips that produced these are gone (3 Sep 2026); a new claim now posts
 * the PR's own description as its reason. This map stays because the rows
 * already in the database still hold the old seven strings, and a PR opening
 * "What you disputed" on a claim from last week must still read the words they
 * tapped rather than a raw English token.
 *
 * The KEYS are the stored values verbatim, so they must not move. `presetLabel`
 * falls through to the reason itself for anything unrecognised — which is now
 * the normal case, not the exception, since a free-written reason has no entry
 * here and must render as written.
 */
const PRESET_LABELS: Record<string, (t: AppTranslations) => string> = {
  'Wrong commission': (t) => t.payment.reasonWrongCommission,
  'Wrong quantity': (t) => t.payment.reasonWrongQuantity,
  'Counted twice': (t) => t.payment.reasonCountedTwice,
  'Missing from my PV': (t) => t.payment.reasonMissingFromPv,
  'Wrong rate': (t) => t.payment.reasonWrongRate,
  'Not my shift': (t) => t.payment.reasonNotMyShift,
  Others: (t) => t.payment.reasonOthers,
};

function presetLabel(reason: string, t: AppTranslations): string {
  return PRESET_LABELS[reason]?.(t) ?? reason;
}

/**
 * `payment_voucher_dispute.reason` is `varchar(200)` and the server refuses
 * anything longer. Held here so the text the app WRITES can never be the thing
 * that 400s a claim.
 */
const REASON_MAX = 200;

/**
 * The claim's reason, written from what the PR ticked.
 *
 * Since 3 Sep 2026 this IS the reason posted to the agency — the seven preset
 * chips are gone (owner: "the reason remove this all"). They forced every
 * argument into one of seven words, none of which said WHICH drink was wrong,
 * which is the one thing the reviewer needs.
 *
 * ENGLISH, like everything else posted: the agency reads one wording whatever
 * the PR's phone is set to.
 *
 * Names the ticked lines while they fit. Past that it says how many rather
 * than truncating mid-word — the agency card lists every line separately from
 * `disputedItems`, so the count loses nothing and a sentence cut in half
 * would look like data loss.
 */
function composeDisputeReason(
  base: string,
  itemLabels: string[],
  fallbackAmount: string,
): string {
  const detail = itemLabels.length ? itemLabels.join(' · ') : fallbackAmount;
  const full = `${base} · ${detail} — please verify`;
  if (full.length <= REASON_MAX) return full;
  const counted = `${base} · ${itemLabels.length} items — please verify`;
  return counted.length <= REASON_MAX ? counted : counted.slice(0, REASON_MAX);
}

/**
 * The Status cell's word.
 *
 * `dayStatusLabel` keeps returning its English token because the render below
 * COMPARES on it to pick a colour; this map is only what the PR reads.
 */
const DAY_STATUS_LABELS: Record<DayStatusLabel, (t: AppTranslations) => string> =
  {
    PENDING: (t) => t.payment.statusPending,
    APPROVED: (t) => t.payment.statusApproved,
    DISPUTED: (t) => t.payment.statusDisputed,
    VERIFIED: (t) => t.payment.statusVerified,
    DEDUCTED: (t) => t.payment.statusDeducted,
    '—': () => '—',
  };

/** A receipt's own review state — the stored value stays, the word changes. */
const RECEIPT_STATUS_LABELS: Record<
  'pending' | 'approved' | 'verified',
  (t: AppTranslations) => string
> = {
  pending: (t) => t.payment.statusPending,
  approved: (t) => t.payment.statusApproved,
  verified: (t) => t.payment.statusVerified,
};

/**
 * The penalty rule a charge came from. Keys are the backend enum
 * (`penaltyRuleTypeValues`); an unknown one falls back to its own humanised
 * form rather than disappearing.
 */
const PENALTY_RULE_LABELS: Record<string, (t: AppTranslations) => string> = {
  min_shifts_per_week: (t) => t.payment.ruleMinShifts,
  max_mc_per_month: (t) => t.payment.ruleMaxMc,
  late_per_week: (t) => t.payment.ruleLate,
  cancellation: (t) => t.payment.ruleCancellation,
};

/**
 * Every row the grid DRAWS — the four earning buckets plus Deductions.
 *
 * Kept separate from `INCOME_ROWS`, which stays the four things a PR can earn
 * and contest. Anything asking "was this day's money disputed?" must keep
 * reading INCOME_ROWS: a deduction is not income and is not disputable.
 */
const GRID_ROWS: {
  key: GridBucket;
  noteLabel: string;
  label: (t: AppTranslations) => string;
}[] = [
  ...INCOME_ROWS,
  {
    key: 'deductions',
    noteLabel: 'Deductions',
    label: (t) => t.payment.rowDeductions,
  },
];

/**
 * What a grid column is CALLED, from the column's own date.
 *
 * Deliberately NOT from `WeeklyDayPay.day`: that field is the English
 * abbreviation `lib/week-pay-grid` stores, it is written into the signed-PV
 * snapshot, and PaymentScreen splices it verbatim into the dispute reason it
 * POSTS — so it is data and must stay put. `dateIso` beside it carries the same
 * fact and nothing compares what this returns. Null on an unparseable date, so
 * the caller can fall back to the stored abbreviation rather than render blank.
 */
function weekdayLabel(iso: string, t: AppTranslations): string | null {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : DAY_SHORT[d.getUTCDay()](t);
}

/**
 * "Sun 23" from a YYYY-MM-DD — the weekday beside its day-of-month, in the
 * reader's own order.
 *
 * All-UTC, the same reading the grid's own columns use, so the day this names
 * is the column it points at.
 */
function dayAndDateLabel(iso: string, t: AppTranslations): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return formatMessage(t.payment.dayAndDate, {
    dow: DAY_SHORT[d.getUTCDay()](t),
    d: d.getUTCDate(),
  });
}

/**
 * The week strip over each card, worded for the reader.
 *
 * Same rule as before — the VOUCHER's own `weekStart` names the week whenever
 * the server has sent one, the device clock is only the fallback — but built
 * through `formatUpcomingWeekLabel`. `weekRangeLabel` cannot be used for this:
 * its output is a MATCHING KEY the signed-PV store compares against, so it
 * stays English and would have pinned the header to one language.
 */
function weekStripLabel(
  weekStart: string | null | undefined,
  weeksAgo: number,
  t: AppTranslations,
): string {
  let from = weekStart ?? '';
  let to = '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    const end = new Date(`${from}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 6);
    to = end.toISOString().slice(0, 10);
  } else {
    const range = weekRangeIso(weeksAgo);
    from = range.weekStart;
    to = range.weekEnd;
  }
  return formatUpcomingWeekLabel(from, to, t);
}

/** Minutes as the PR would say them: "45m", "1h", "2h 30m". */
function otMinutesLabel(mins: number, t: AppTranslations): string {
  if (mins < 60) return formatMessage(t.payment.minutes, { m: mins });
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  return r === 0
    ? formatMessage(t.payment.hours, { h })
    : formatMessage(t.payment.hoursMinutes, { h, m: r });
}

function cellAmount(day: WeeklyDayPay, key: GridBucket): number {
  if (key === 'wages') return day.wages;
  if (key === 'drinks') return day.drinks ?? 0;
  if (key === 'tips') return day.tips ?? 0;
  if (key === 'deductions') return day.deductions ?? 0;
  return day.others ?? 0;
}

/**
 * Zero is nothing to report; a NEGATIVE is very much something.
 *
 * This used to dash out anything `<= 0`, so a −RM 20 cancellation fee rendered
 * as an empty cell while still sitting inside the week total: RM 488.00 of
 * visible figures under a footer reading RM 468.00, with the missing RM 20
 * nowhere on the screen. The minus sign IS the message, so it gets printed.
 */
function formatCell(value: number): string {
  if (value === 0) return '—';
  return value < 0 ? `−${Math.abs(value).toFixed(2)}` : value.toFixed(2);
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
  d: {
    disputeDate: string;
    component: IncomeKey;
    receiptId: string | null;
    receiptRefs: string[] | null;
  },
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
        /*
         * The night, not just the venue. The agency's own receipt card names
         * the event and its type, and a claim the PR files about that night
         * has to be readable beside it — "Emhub Testing, special event" is
         * what both sides argue about, and the outlet name alone loses which
         * of two shifts at one venue this was.
         */
        eventName: g.shift?.eventName ?? null,
        eventKind: g.shift?.eventKind ?? null,
        outletName: g.shift?.outletName ?? null,
        slot: g.shift?.slot ?? null,
        checkInAt: g.shift?.checkInAt ?? null,
        checkOutAt: g.shift?.checkOutAt ?? null,
        overtimeMinutes: g.shift?.overtimeMinutes ?? null,
      })),
  );
}

/** "Tue · 4 Aug 2026" — UTC-parsed to match how the grid buckets its days. */
function longDay(iso: string, t: AppTranslations): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  // One template per language, not four fragments joined: Chinese writes the
  // year first and the weekday last.
  return formatMessage(t.schedule.dateFriendly, {
    dow: DAY_SHORT[d.getUTCDay()](t),
    d: d.getUTCDate(),
    mon: MONTH_SHORT[d.getUTCMonth()](t),
    y: d.getUTCFullYear(),
  });
}

/**
 * "6h 30m", with the stored overrun appended when there is one.
 *
 * Deliberately NOT `shiftDurationLabel`: that one derives overtime by
 * subtracting a hardcoded six-hour shift from the elapsed window, and the
 * window it subtracts from is already CLAMPED to the scheduled end — so the
 * overrun it reports is invented twice over. A shift's real overrun is stored
 * on the row as `overtimeMinutes`, and that is the only number quoted here.
 * Null overtime means none was recorded, which is not the same as zero and is
 * therefore simply not mentioned.
 */
function shiftWindowLabel(
  checkInAt: string | null,
  checkOutAt: string | null,
  overtimeMinutes: number | null,
  t: AppTranslations,
): string {
  if (!checkInAt || !checkOutAt) return t.payment.durationUnknown;
  const start = new Date(checkInAt).getTime();
  const end = new Date(checkOutAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start)
    return t.payment.durationUnknown;
  const mins = Math.round((end - start) / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const base =
    m > 0
      ? formatMessage(t.payment.hoursMinutes, { h, m })
      : formatMessage(t.payment.hours, { h });
  return overtimeMinutes && overtimeMinutes > 0
    ? formatMessage(t.payment.withOvertime, { base, m: overtimeMinutes })
    : base;
}

/** "Special event" / "Normal shift" — the outlet's own toggle, worded as the agency words it. */
function eventKindLabel(
  kind: string | null | undefined,
  t: AppTranslations,
): string {
  return kind === 'special' ? t.shifts.specialEvent : t.shifts.normalShift;
}

/** "4 Aug, 11:29 AM" — the stamp, short enough to sit on a claim row. */
function shortStamp(iso: string | null, t: AppTranslations): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const isPm = h >= 12;
  h = h % 12 || 12;
  // The clock reading is one template (Chinese puts 上午/下午 in front of it),
  // and the date wraps that finished string in a second one.
  const time = formatMessage(isPm ? t.jobs.timePm : t.jobs.timeAm, {
    time: `${h}:${m}`,
  });
  return formatMessage(t.payment.stampShort, {
    d: d.getDate(),
    mon: MONTH_SHORT[d.getMonth()](t),
    time,
  });
}

/**
 * WHICH VOUCHER a tapped cell belongs to, or null when it cannot be told.
 *
 * A PR on two rosters holds one voucher PER AGENCY for the same week, and the
 * grid merges them — so "the week's voucher" is not a thing any action on a cell
 * may assume. Resolution narrows fastest-first:
 *
 *   - a chosen RECEIPT names exactly one shift, so its line's voucher is the
 *     answer and nothing else needs consulting;
 *   - failing that, the lines in that day+bucket, IF they all sit on one voucher;
 *   - failing that, the week's single voucher — the one-agency case, where the
 *     old behaviour was already correct.
 *
 * Null means genuinely ambiguous: two agencies in one cell with nothing picked.
 * The caller must ASK rather than choose, because either choice files a claim
 * against an agency the PR did not mean.
 */
function voucherOwning(
  week: PrCurrentWeek | null | undefined,
  /**
   * `component` is a GRID BUCKET, not an `IncomeKey`, for the same reason
   * `kindDisputable` takes one: the Deductions row must be able to ask the same
   * question every other row asks. It resolves to null there — a fine has no
   * receipt line to attribute — and every caller pairs this with
   * `kindDisputable`, which refuses that bucket first anyway.
   */
  sel: { receiptId: string | null; dateIso: string; component: GridBucket },
): string | null {
  if (!week) return null;
  const lines = week.lines ?? [];
  if (sel.receiptId) {
    const byReceipt = lines.find(
      (l) => l.receiptId === sel.receiptId,
    )?.voucherId;
    if (byReceipt) return byReceipt;
  }
  const inCell = lines.filter(
    (l) => l.lineDate === sel.dateIso && l.kind === sel.component,
  );
  const distinct = [
    ...new Set(inCell.map((l) => l.voucherId).filter(Boolean)),
  ] as string[];
  if (distinct.length === 1) return distinct[0]!;
  if (distinct.length > 1) return null;
  // Nothing attributable — a single-voucher week, or a backend that has not
  // restarted yet and stamps no `voucherId` on its lines.
  if ((week.vouchers?.length ?? 0) > 1) return null;
  return week.voucherId ?? null;
}

/**
 * That voucher's OWN status — the companion `voucherOwning` always needed.
 *
 * `voucherOwning` answers with an id, and every caller that then wanted to know
 * what state the cell's money was in reached for `week.status` instead, which is
 * the NEWEST voucher's (`PrCurrentWeek` in api.ts: "They are a headline, not the
 * week"). That is how one agency's `disputed` came to govern the other agency's
 * cells.
 *
 * Falls back to the week's single status ONLY when the id IS the headline — a
 * one-voucher week, or a backend that has not restarted and sends no
 * `vouchers` — where the two are the same fact. Never otherwise: an id we cannot
 * find a row for is an UNKNOWN status, not the week's.
 */
function statusOfVoucher(
  week: PrCurrentWeek | null | undefined,
  voucherId: string | null,
): string | null {
  if (!voucherId) return null;
  const row = week?.vouchers?.find((v) => v.id === voucherId);
  if (row) return row.status ?? null;
  return week?.voucherId === voucherId ? (week.status ?? null) : null;
}

/**
 * The word and the colour ONE voucher gets in a section header.
 *
 * Lifted verbatim out of the LAST WEEK header's own ternary so that the
 * one-voucher and two-voucher renders cannot drift into different vocabularies
 * for the same status — these words are what a PR quotes back at their agency.
 */
function voucherPill(
  status: string | null,
  t: AppTranslations,
): {
  variant: 'green' | 'amber' | 'red';
  label: string;
} {
  if (status === 'disputed')
    return { variant: 'red', label: t.payment.statusDisputed };
  if (status === 'paid')
    return { variant: 'green', label: t.payment.statusPaid };
  if (status === 'signed')
    return { variant: 'green', label: t.payment.statusSigned };
  if (status && VERIFIED_STATUSES.includes(status)) {
    return { variant: 'green', label: t.payment.statusSent };
  }
  return { variant: 'amber', label: t.payment.statusPending };
}

// buildWeekGridFromLines moved to lib/week-pay-grid so PvDetailScreen renders
// the identical grid for the same voucher.

export function PaymentScreen({
  onNavigate,
}: {
  onNavigate: (tab: PrTab) => void;
}) {
  const { t } = useLocale();
  const { openPv, route } = usePrNav();
  const { me, token } = useSession();
  /**
   * Can this PR actually be paid? BOTH halves are required — a bank with no
   * account number is as unpayable as neither, so this is AND-of-present, not
   * "has anything". Checked here rather than only on Profile because this is
   * the screen someone opens when they are wondering where their money is.
   */
  const bankDetailsMissing =
    !me?.profile.bankName?.trim() || !me?.profile.bankAccountNo?.trim();
  const keyboardInset = useKeyboardInset();
  // Device safe-area — pads every sheet past the 3-button / gesture nav bar.
  const insets = useSafeAreaInsets();
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
  const thisReviewCaption = useMemo(
    () => receiptReviewCaption(current, t),
    [current, t],
  );
  /**
   * OVERTIME THE PR HAS EARNED THE RIGHT TO ASK FOR — which this screen used to
   * say nothing about at all.
   *
   * A check-out RECORDS overtime minutes; it never pays them. Only an agency
   * owner or finance user approving the claim writes the `component='ot'` line
   * that lands in the Others row (`overtime-line.ts`: "Overtime is NEVER
   * auto-paid"). Until then Others is a dash — correct, and indistinguishable
   * from nothing-happened. So Check-In told the PR "+1m OT recorded" while
   * Payment, the screen they open to find out what they are owed, showed an
   * empty cell and no explanation.
   *
   * DERIVED, never stored: minutes on the assignment, and no `ot` line on that
   * day yet. The moment the agency approves, the line appears, Others stops
   * being a dash and this caption removes itself — so there is no second place
   * that can disagree about whether the claim is still open.
   *
   * `component`, not the sign or the wording of the line: 'ot', 'deduction' and
   * 'other' all collapse into the PR-facing 'others' bucket, and only
   * `component` can tell overtime from a fine.
   *
   * 🔴 The minutes are READ from the server's `overtimeMinutes`, never recomputed
   * here. The first cut of this caption derived them with `overtimeHours` —
   * worked minus scheduled — and printed nothing at all for the shift that
   * prompted it: booked 20:30-21:00 and stamped 22:12 to 22:12, that formula
   * gives max(0, 1 - 30) = 0, while the server had recorded 1 minute because the
   * whole stamp fell OUTSIDE the window. Two implementations of one rule, and the
   * phone's was wrong on the very case the feature exists for. The sheet one tap
   * away (`CellEvidenceSheet`) already reads `overtimeMinutes`; this reads the
   * same field, so the two cannot drift.
   */
  const pendingOtCaption = useMemo(() => {
    const approvedDays = new Set(
      (current?.lines ?? [])
        .filter((l) => l.component === 'ot' && l.lineDate)
        .map((l) => l.lineDate as string),
    );
    const byDay = new Map<string, number>();
    for (const s of current?.shifts ?? []) {
      const mins = s.overtimeMinutes ?? 0;
      if (mins <= 0 || approvedDays.has(s.shiftDate)) continue;
      byDay.set(s.shiftDate, (byDay.get(s.shiftDate) ?? 0) + mins);
    }
    if (byDay.size === 0) return null;
    const parts = [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([iso, mins]) =>
        formatMessage(t.payment.otOnDay, {
          mins: otMinutesLabel(mins, t),
          day: dayAndDateLabel(iso, t),
        }),
      );
    return formatMessage(t.payment.otPending, { parts: parts.join(' · ') });
  }, [current, t]);

  // Last week's voucher comes from the same backend as this week — real data,
  // no demo grid. Fetched once on mount (it rarely changes mid-session).
  const [lastWeek, setLastWeek] = useState<PrCurrentWeek | null>(null);
  // Same caption, last week: the owner asked for the counts where the money
  // is being read, and after Sunday 00:00 that is the Last week card.
  const lastReviewCaption = useMemo(
    () => receiptReviewCaption(lastWeek, t),
    [lastWeek, t],
  );
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
    route.name === 'tabs' && route.tab === 'payment'
      ? route.paymentWeek
      : undefined;
  const [weekTab, setWeekTab] = useState<WeekTab>(() =>
    focusWeek === 'current' || (!focusWeek && hasThisWeekRows)
      ? 'current'
      : 'last',
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
  const [disputedKeys, setDisputedKeys] = useState<Set<string>>(
    () => new Set(),
  );
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
  const [disputeMode, setDisputeMode] = useState<'dispute' | 'withdraw'>(
    'dispute',
  );
  const [disputeTarget, setDisputeTarget] = useState<DisputeTarget | null>(
    null,
  );
  /** Which day's CLAIMS are open — set by tapping a DISPUTED / VERIFIED status cell. */
  const [claimDay, setClaimDay] = useState<{
    dateIso: string;
    week: WeekTab;
  } | null>(null);
  /** Which cell's evidence is open, and the day/row it came from (to hand on to dispute). */
  const [evidenceTarget, setEvidenceTarget] = useState<{
    dateIso: string;
    /**
     * A GRID BUCKET — the Deductions row opens this sheet too, so a PR can see
     * WHICH shift a fine came from. `DisputeTarget.incomeKey` stays the narrower
     * `IncomeKey`, because a claim can only ever be about earnings.
     */
    incomeKey: GridBucket;
    amount: number;
    week: WeekTab;
    day: WeeklyDayPay;
    row: (typeof GRID_ROWS)[number];
  } | null>(null);
  /**
   * The ONE receipt being contested — a dispute is about a single shift.
   *
   * Was a multi-select. Owner: *"the dispute make is possible will be only one
   * of the shift"*. A claim answers "this shift's drinks are wrong", and the
   * agency settles it against that shift's receipt; letting a PR tick several
   * would produce one claim, one amount and one outcome spanning shifts that
   * may each need a different answer.
   */
  const [disputePickedReceipt, setDisputePickedReceipt] = useState<
    string | null
  >(null);
  const [disputeNote, setDisputeNote] = useState('');
  /**
   * The bucket and day the claim is on, in ENGLISH — "Tips · THU 3".
   *
   * Held as a plain string rather than derived at render like every label on
   * `DisputeTarget`, and that is deliberate rather than an oversight: this is
   * not a label, it is part of the note POSTED to the agency, which must read
   * the same in their inbox whatever language the PR's phone is set to. It
   * carries no amount, because the amount depends on whether the PR narrowed
   * the claim to specific lines.
   */
  const [disputeNoteBase, setDisputeNoteBase] = useState('');
  /**
   * Has the PR typed their own note? Once they have, nothing regenerates it.
   *
   * Without this the auto-clarify below would erase a sentence someone wrote
   * by hand the moment they changed the reason chip — losing the one part of a
   * claim the app did not write itself.
   */
  const [disputeNoteDirty, setDisputeNoteDirty] = useState(false);
  const [disputePhotos, setDisputePhotos] = useState<string[]>([]);
  /** Optional proof kept with submitted disputes (image upload is still local). */
  const [disputePhotoMap, setDisputePhotoMap] = useState<
    Record<string, string[]>
  >({});
  const [disputeBusy, setDisputeBusy] = useState(false);

  /*
   * THE WEEK THE FIGURES ARE FOR, NOT THE WEEK THE PHONE IS IN.
   *
   * These read the device clock while the grid below is built from the
   * voucher's own `weekStart`. One week, two sources — so a
   * header could sit above figures from a different seven days, which is
   * exactly what happened at 01:23 on Sun 23 Aug 2026: "23 Aug – 29 Aug"
   * over columns SUN 16 … SAT 22.
   *
   * The clock stays as the FALLBACK, for the first load and for a week the
   * server has no voucher for — there is nothing else to name it with then,
   * and an empty grid carries no figures to contradict.
   */
  const lastLabel = weekStripLabel(lastWeek?.weekStart, 1, t);
  const thisLabel = weekStripLabel(current?.weekStart, 0, t);
  const issueDay = weekPvIssueDayLabel(0, undefined, t);
  /*
   * Two sentences that carry ONE styled word inside them. Each stays a SINGLE
   * dictionary entry — the placeholder is split apart at render time rather
   * than the sentence being glued back together from fragments, because
   * Chinese puts the coloured word in a different place than English does.
   */
  const tapHintParts = t.payment.tapHint.split('{red}');
  const pvOnDayParts = t.payment.pvOnDay.split('{day}');
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
  /**
   * The week's vouchers, when there is more than one to distinguish.
   *
   * ⚠️ `weekIssued` lived here — `!!lastWeek?.status && VERIFIED_STATUSES.includes(…)`.
   * "Has the agency issued this week's voucher" is not a question the WEEK can
   * answer once there are two agencies and two documents: with Atlas `paid` and
   * Why We Met `awaiting_pr` it said yes, the header went green and read PAID,
   * and the PR stopped looking for the voucher still waiting on their signature
   * two lines further down the same screen.
   *
   * Empty on the ordinary one-agency week AND on a backend that has not been
   * restarted — both of which keep the single-pill render below unchanged, where
   * the headline and the only voucher are the same fact.
   */
  const lastWeekVouchers = lastWeek?.vouchers ?? [];
  const hasLastWeekRows = grid.some((d) => d.status !== 'empty');
  /**
   * EVERY voucher still waiting on this PR — one button each, named by agency.
   *
   * ⚠️ This gated on `lastWeek.status`, the NEWEST voucher's. With Atlas `sent`
   * and a newer Why We Met voucher still `pending_review`, the whole week read as
   * un-reviewable and the PR was never offered Atlas's document at all; the other
   * way round they were offered ONE button carrying both agencies' money.
   */
  const awaitingVouchers = useMemo(() => {
    const rows =
      lastWeek?.vouchers && lastWeek.vouchers.length > 0
        ? lastWeek.vouchers
        : lastWeek?.voucherId
          ? [
              {
                id: lastWeek.voucherId,
                agencyName: null as string | null,
                net: lastWeek.net,
                status: lastWeek.status,
                voucherNo: lastWeek.voucherNo ?? null,
              },
            ]
          : [];
    return rows
      .filter((v) => v.status === 'awaiting_pr' || v.status === 'sent')
      .filter((v) => !isSigned(v.id))
      .map((v) => ({
        id: v.id,
        net: Number(v.net),
        agencyName: v.agencyName ?? null,
      }));
  }, [lastWeek, isSigned]);
  /** The first one, for the single-button callers that have not been widened. */
  const awaiting = awaitingVouchers[0];
  const reviewAmount = weekTotal > 0 ? weekTotal : (awaiting?.net ?? 0);
  /**
   * The vouchers actually under argument — plural, because a week can hold two.
   *
   * ⚠️ This was `lastWeek?.status === 'disputed'`, the NEWEST voucher's flag, and
   * it fed three different things: the header pill, the banner, and the
   * dispute-vs-withdraw decision on every tapped cell. A dispute IS persisted at
   * the voucher grain (`payment_voucher.status`, §3 F) — that part was never
   * wrong. What was wrong is that a merged week has more than one voucher grain,
   * so a claim against Why We Met left Atlas's cells reading DISPUTED, and a
   * claim against the OLDER voucher showed nothing at all.
   *
   * The single-voucher week degrades to exactly the old boolean: one row in, one
   * row out.
   */
  const disputedVouchers =
    lastWeekVouchers.length > 0
      ? lastWeekVouchers.filter((v) => v.status === 'disputed')
      : lastWeek?.status === 'disputed'
        ? [
            {
              id: lastWeek.voucherId ?? '',
              voucherNo: lastWeek.voucherNo ?? null,
              agencyId: '',
              agencyName: null as string | null,
              net: lastWeek.net,
              status: lastWeek.status,
            },
          ]
        : [];

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
    row: (typeof GRID_ROWS)[number],
    week: WeekTab,
  ) => {
    const amount = cellAmount(day, row.key);
    // `!== 0`, not `> 0`: a deduction is a real figure with real evidence behind
    // it (which shift was cancelled, and what the fee was a percentage of). The
    // old `<= 0` test made the one cell a PR would most want to interrogate the
    // one cell that could not be opened.
    if (amount === 0 || day.status === 'empty') return;
    setEvidenceTarget({
      dateIso: day.dateIso,
      incomeKey: row.key,
      amount,
      week,
      day,
      row,
    });
  };

  const openDispute = (
    day: WeeklyDayPay,
    row: (typeof GRID_ROWS)[number],
    week: WeekTab = 'last',
  ) => {
    /*
     * A deduction is never disputed here, so this narrows `row.key` back to an
     * IncomeKey for everything below — including `DisputeTarget`, whose
     * `incomeKey` becomes a claim's `component` and must be a real bucket the
     * server accepts.
     *
     * Unreachable in practice: the Dispute button is gated on `kindDisputable`,
     * which answers no for 'deductions'. It is a return rather than an
     * assertion because an unreachable path that silently does nothing beats
     * one that crashes the payslip if it ever turns out to be reachable.
     */
    if (row.key === 'deductions') return;
    const weekData = week === 'last' ? lastWeek : current;
    /*
     * WHICH VOUCHER OWNS THE TAPPED CELL — the same question `submitDispute` and
     * `cancelClaim` ask, through the same resolver.
     *
     * ⚠️ This read the WEEK's status (`lastWeek.status` / `current.status`),
     * which is the NEWEST voucher's, while the grid it was tapped on merges
     * every voucher in the week. With one agency `disputed` the sheet opened in
     * WITHDRAW mode for EVERY cell, so tapping the other agency's drinks offered
     * to take back a claim that was never filed against it — and the withdraw
     * then posted to whichever voucher `voucherOwning` named, which is not the
     * one the button was describing.
     *
     * `receiptId: null` on purpose: nothing has been picked yet — the picker
     * lives INSIDE the sheet this is about to open. So a two-agency cell
     * resolves to null, and null is "not known", not "not disputed": the sheet
     * opens in the ordinary DISPUTE mode and `submitDispute` refuses with its
     * existing "Pick the shift first" rather than acting on a guess.
     */
    const weekDisputed =
      statusOfVoucher(
        weekData,
        voucherOwning(weekData, {
          receiptId: null,
          dateIso: day.dateIso,
          component: row.key,
        }),
      ) === 'disputed';
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
    /**
     * Is there still a receipt in THIS cell that carries no open claim?
     *
     * ⚠️ THE REASON A SECOND DISPUTE LOOKED IMPOSSIBLE (owner, 3 Sep 2026:
     * "on the same day, or same shift, I can dispute more than one receipt").
     * The database has allowed it since 0088 — the unique index is keyed
     * `(voucher, date, component, coalesce(receipt_id,''))` over OPEN claims
     * only, and one live day already carries six claims across two receipts.
     * The block was HERE: `weekDisputed` asks whether the VOUCHER is disputed,
     * so the first open claim turned every later tap into "Withdraw dispute?",
     * whatever day, bucket or paper it was on — the second receipt had no route
     * to being questioned at all.
     *
     * Withdraw is now offered only when this cell has nothing LEFT to contest,
     * which is the case that sheet was written for. A cell with a free receipt
     * opens the dispute picker, where the claimed ones already grey out with
     * "already disputed". Cancelling a specific claim keeps its own home in the
     * "What you disputed" sheet, so no route is lost.
     */
    const cellClaims = receiptClaimState(weekData, day.dateIso, row.key);
    const freeReceiptInCell =
      !cellClaims.openAll &&
      buildCellEvidence(weekData, day.dateIso, row.key)
        .groups.flatMap((g) => g.receipts)
        .some((r) => {
          if (!r.receiptNo) return false;
          const claimed =
            (!!r.receiptId && cellClaims.open.has(r.receiptId)) ||
            cellClaims.open.has(r.receiptNo);
          return !claimed;
        });
    if (!weekDisputed && !anyShiftToDispute) {
      // Two different refusals, and they must not share a message. "Still being
      // reviewed" tells the PR to wait — useless advice for wages, where waiting
      // changes nothing and the actual route is the attendance record.
      if (!kindDisputable(row.key)) {
        Alert.alert(
          t.payment.notDisputedHereTitle,
          formatMessage(t.payment.notDisputedHereBody, {
            row: row.label(t),
            day: dayAndDateLabel(day.dateIso, t),
          }),
        );
      } else {
        Alert.alert(
          t.payment.notReviewedTitle,
          formatMessage(t.payment.notReviewedBody, {
            row: row.label(t),
            day: dayAndDateLabel(day.dateIso, t),
          }),
        );
      }
      return;
    }
    const key = `${day.dateIso}-${row.key}`;
    const target: DisputeTarget = {
      key,
      dateIso: day.dateIso,
      incomeKey: row.key,
      amount,
      week,
    };
    setDisputeTarget(target);
    // Withdraw only when this cell has nothing left to contest; otherwise the
    // tap raises a NEW claim, even while another is open elsewhere on the week.
    if (weekDisputed && !freeReceiptInCell) {
      setDisputeMode('withdraw');
      setDisputeNote('');
      setDisputePhotos([]);
    } else {
      setDisputeMode('dispute');
      // ENGLISH ON PURPOSE — this is the note POSTED to the agency, not a label.
      // `noteLabel`, not `label(t)`: the claim reads the same in the agency's
      // inbox whatever language the PR's phone is set to.
      //
      // Only the bucket and the day are frozen here. The reason and the lines
      // are appended by the effect below, which re-runs as the PR changes
      // either — so the note keeps describing what is actually selected.
      setDisputeNoteBase(`${row.noteLabel} · ${day.day} ${day.date}`);
      setDisputeNoteDirty(false);
      setDisputeNote(
        composeDisputeReason(
          `${row.noteLabel} · ${day.day} ${day.date}`,
          [],
          formatRM(amount),
        ),
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
    const evidence = buildCellEvidence(
      week,
      disputeTarget.dateIso,
      disputeTarget.incomeKey,
    );
    /*
     * Which shifts already carry a LIVE claim. Matched on the receipt id (the FK
     * a claim stores) or its number (pre-0088 claims), same as the evidence tags.
     * A whole-day open claim blocks every shift beneath it.
     */
    const claims = receiptClaimState(
      week,
      disputeTarget.dateIso,
      disputeTarget.incomeKey,
    );
    const openClaimOn = (r: {
      receiptId: string | null;
      receiptNo: string | null;
    }) =>
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
            ? t.payment.alreadyDisputed
            : receiptDisputable(r)
              ? null
              : t.payment.notReviewedYetShort,
        })),
    );
  }, [disputeTarget, lastWeek, current, t]);

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
    const claims = receiptClaimState(
      week,
      evidenceTarget.dateIso,
      evidenceTarget.incomeKey,
    );
    if (claims.openAll) return 0;
    return buildCellEvidence(
      week,
      evidenceTarget.dateIso,
      evidenceTarget.incomeKey,
    )
      .groups.flatMap((g) => g.receipts)
      .filter((r) => {
        if (!r.receiptNo) return false;
        const openOnIt =
          (r.receiptId && claims.open.has(r.receiptId)) ||
          claims.open.has(r.receiptNo);
        // Review state no longer withholds it — only an open claim does.
        return !openOnIt;
      }).length;
  }, [evidenceTarget, lastWeek, current]);

  /** The item lines on the chosen shift's receipt — what "which item?" offers. */
  const disputeItems = useMemo(() => {
    if (!disputeTarget || !disputePickedReceipt) return [];
    const week = disputeTarget.week === 'last' ? lastWeek : current;
    const evidence = buildCellEvidence(
      week,
      disputeTarget.dateIso,
      disputeTarget.incomeKey,
    );
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

  /**
   * THE NOTE FOLLOWS THE SELECTION (owner, 3 Sep 2026: "this need follow from
   * which items pr selected, then the quick reason and the description of the
   * quick reason need to auto clarify also").
   *
   * It used to be written once, on the tap, as "Tips · THU 3 · RM 230.00 —
   * please verify": the BUCKET and the bucket's whole total. So a PR who then
   * picked "Tips × 4 · RM 30.00" and the reason "Wrong commission" sent the
   * agency a note naming neither — the reviewer read RM 230.00 for a claim
   * about RM 30.00, and had to open the receipt to learn which line was wrong.
   *
   * Now it recomposes as either changes: the reason first, then the exact
   * lines ticked, falling back to the bucket total when the PR is contesting
   * the whole cell (no picker shown, or nothing ticked). Left alone the moment
   * the PR types — see `disputeNoteDirty`.
   *
   * ENGLISH throughout, like the base: the agency reads one wording whatever
   * the phone's language.
   */
  useEffect(() => {
    if (disputeMode !== 'dispute' || disputeNoteDirty || !disputeNoteBase) {
      return;
    }
    const picked = disputeItems.filter((i) => disputePickedItems.includes(i.id));
    setDisputeNote(
      composeDisputeReason(
        disputeNoteBase,
        picked.map((i) => i.label),
        formatRM(disputeTarget?.amount ?? 0),
      ),
    );
  }, [
    disputeMode,
    disputeNoteDirty,
    disputeNoteBase,
    disputeItems,
    disputePickedItems,
    disputeTarget,
  ]);

  /** A chooser was shown and the PR has not answered it yet. */
  const noReceiptPicked =
    (disputeReceipts.length > 0 && disputePickedReceipt === null) ||
    (disputeItems.length > 1 && disputePickedItems.length === 0);

  const disputePickedSubtotal = useMemo(
    () =>
      disputeReceipts.find((r) => r.receiptNo === disputePickedReceipt)
        ?.subtotal ?? 0,
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
    // Withdraw where it was RAISED. The claim carries its own receipt, so the
    // owning voucher is knowable — routing this by "the week's voucher" would
    // aim a withdrawal at the other agency's document, where it matches nothing.
    const claimWeek = claimDay.week === 'last' ? lastWeek : current;
    const voucherId = voucherOwning(claimWeek, {
      receiptId: d.receiptId,
      dateIso: d.disputeDate,
      component: d.component,
    });
    if (!voucherId) {
      // ⚠️ SAY SOMETHING. The old line here was a bare `return`, which was survivable
      // while the id came from the week and was therefore always present. Now that it
      // is RESOLVED, it can legitimately come back null — a legacy claim carrying no
      // receiptId, on a day two agencies both have money in — and a Withdraw button
      // that silently does nothing reads as a broken app, not as a refusal.
      Alert.alert(t.payment.openDayFirstTitle, t.payment.openDayFirstBody);
      return;
    }
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
        Alert.alert(
          t.payment.couldNotCancel,
          e instanceof Error ? e.message : t.payment.tryAgain,
        );
      } finally {
        setDisputeBusy(false);
      }
    };
    Alert.alert(t.payment.cancelConfirmTitle, t.payment.cancelConfirmBody, [
      { text: t.payment.keepIt, style: 'cancel' },
      {
        text: t.payment.cancelDispute,
        style: 'destructive',
        onPress: () => void go(),
      },
    ]);
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
    const disputeWeek = forLast ? lastWeek : current;
    const pickedReceiptId =
      disputeReceipts.find((r) => r.receiptNo === disputePickedReceipt)
        ?.receiptId ?? null;
    /*
     * WHICH VOUCHER OWNS THE TAPPED CELL.
     *
     * ⚠️ This was `week.voucherId` — the NEWEST voucher — while the grid it was
     * tapped on MERGES every voucher in the week. So a PR disputing a RM 3.60
     * drink on Why We Met's receipt posted the claim to ATLAS's voucher, and it
     * failed SILENTLY rather than loudly: the server's own reads are
     * voucher-scoped, so the foreign receipt matched no line, the claim priced
     * itself at RM 0.00, and Atlas's voucher flipped to `disputed` over money it
     * never owed — while Why We Met never heard about the argument at all.
     *
     * The backend now refuses a receipt that is not on the named voucher, so
     * getting this wrong is at least visible. Getting it RIGHT is here.
     */
    const voucherId = voucherOwning(disputeWeek, {
      receiptId: pickedReceiptId,
      dateIso: disputeTarget.dateIso,
      component: disputeTarget.incomeKey,
    });
    if (
      token &&
      disputeWeek &&
      !voucherId &&
      (disputeWeek.vouchers?.length ?? 0) > 1
    ) {
      // Two agencies hold money in that cell and nothing narrows it to one. The
      // claim is genuinely ambiguous, and picking either would file it against an
      // agency the PR did not mean.
      Alert.alert(t.payment.pickShiftFirstTitle, t.payment.pickShiftFirstBody);
      return;
    }
    if (!token || !voucherId) {
      Alert.alert(
        t.payment.noVoucherTitle,
        forLast ? t.payment.noVoucherLast : t.payment.noVoucherThis,
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
              /*
               * THE BOX IS THE REASON (owner, 3 Sep 2026). It replaced the
               * seven preset chips, so what the agency reads under "Reason" is
               * the sentence the PR saw and could edit — no second, vaguer
               * word in front of it.
               *
               * `slice` is a floor, not the plan: `composeDisputeReason` keeps
               * what the app writes inside the column, and the input is capped
               * too, so this only catches a value that arrived some other way.
               * An empty box would fail the server's `min(1)`, so it falls
               * back rather than posting a claim that cannot be filed.
               */
              reason:
                disputeNote.trim().slice(0, REASON_MAX) || 'Please verify',
              // No separate note: one field, one thing to read.
              note: undefined,
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
                disputeReceipts.find(
                  (r) => r.receiptNo === disputePickedReceipt,
                )?.receiptId ?? undefined,
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
                /*
                 * ⚠️ AND THE MATCHING ROW IN `vouchers`, or this patch is
                 * invisible.
                 *
                 * This used to write the headline alone, which was enough while
                 * the pill and the banner read `lastWeek.status`. They now read
                 * `vouchers[]` — it is the only thing that can say WHICH agency
                 * is being argued with — so patching the headline and not the
                 * array left the screen showing the pre-dispute state until the
                 * next full refresh. Patched BY ID: `PrDisputeState.voucherId`
                 * names the document the server actually moved, and the other
                 * agency's row must not be touched by it.
                 */
                vouchers: prev.vouchers?.map((v) =>
                  v.id === next.voucherId ? { ...v, status: next.status } : v,
                ),
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
        t.payment.disputeFailed,
        error instanceof Error ? error.message : t.payment.tryAgain,
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
          <Text style={[styles.headerTitle, { fontSize: titleSize }]}>
            {t.payment.title}
          </Text>
        </View>
      </View>

      {/*
        NO BANK DETAILS, NO TRANSFER.
        Sits above the week tabs, not at the bottom of a scroll: on 27 Aug 2026
        every one of the 71 profiles on the live database had this empty, and a
        PR whose voucher is signed but unpaid has no other way to find out that
        the missing piece is on their own profile. Amber, not red — nothing has
        gone wrong yet, something is WAITING, which is what amber means on every
        other money surface here.
      */}
      {bankDetailsMissing ? (
        <Pressable
          style={styles.bankNudge}
          onPress={() => onNavigate('profile')}
          accessibilityRole="button"
          accessibilityLabel={t.payment.bankNudgeTitle}
          accessibilityHint={t.payment.bankNudgeBody}
        >
          <AlertTriangle size={18} color={C.amber} />
          <View style={styles.bankNudgeBody}>
            <Text style={styles.bankNudgeTitle}>{t.payment.bankNudgeTitle}</Text>
            <Text style={styles.bankNudgeText}>{t.payment.bankNudgeBody}</Text>
            <Text style={styles.bankNudgeAction}>{t.payment.bankNudgeAction}</Text>
          </View>
        </Pressable>
      ) : null}

      <View style={styles.weekTabs}>
        <Pressable
          style={[styles.weekTab, weekTab === 'last' && styles.weekTabOn]}
          onPress={() => setWeekTab('last')}
        >
          <Text
            style={[
              styles.weekTabTitle,
              weekTab === 'last' && { color: C.txt },
            ]}
          >
            {t.payment.lastWeek}
          </Text>
          <Text style={styles.weekTabSub}>{lastLabel}</Text>
        </Pressable>
        <Pressable
          style={[styles.weekTab, weekTab === 'current' && styles.weekTabOn]}
          onPress={() => setWeekTab('current')}
        >
          <Text
            style={[
              styles.weekTabTitle,
              weekTab === 'current' && { color: C.txt },
            ]}
          >
            {t.payment.thisWeek}
          </Text>
          <Text style={styles.weekTabSub}>{thisLabel}</Text>
        </Pressable>
      </View>

      {weekTab === 'last' ? (
        <View style={styles.section}>
          <Pressable
            style={styles.sectionHd}
            onPress={() => setLastOpen((o) => !o)}
          >
            <View style={{ flex: 1 }}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>
                  {t.payment.lastWeekTitle}
                </Text>
                {/*
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
                 *
                 * ⚠️ AND ONE PILL PER VOUCHER once there are two. This printed a
                 * single pill from `lastWeek.status` — the NEWEST voucher's — so
                 * a week with Atlas `paid` and Why We Met `awaiting_pr` read
                 * PAID in green, over money one agency had not even issued. A
                 * merged total is not a document anybody can sign, and neither
                 * is a merged status. Named by agency, in the same vocabulary
                 * and with the same `?? 'Agency'` fallback as the Review & sign
                 * buttons below, which are already one per voucher.
                 */}
                {lastWeekVouchers.length > 1 ? (
                  lastWeekVouchers.map((v) => {
                    const pill = voucherPill(v.status, t);
                    return (
                      <Pill key={v.id} variant={pill.variant}>
                        {`${(v.agencyName ?? t.payment.agencyFallback).toUpperCase()} · ${pill.label}`}
                      </Pill>
                    );
                  })
                ) : lastWeek?.status ? (
                  <Pill variant={voucherPill(lastWeek.status, t).variant}>
                    {voucherPill(lastWeek.status, t).label}
                  </Pill>
                ) : null}
                <Text style={styles.sectionFrac}>{verifiedDays}/7</Text>
              </View>
              <Text style={styles.sectionAction}>
                {lastOpen ? t.common.tapToCollapse : t.common.tapToExpand}
              </Text>
            </View>
            <ChevronDown
              size={16}
              color={C.goldL}
              style={
                lastOpen ? { transform: [{ rotate: '180deg' }] } : undefined
              }
            />
          </Pressable>

          {lastOpen && (
            <View style={styles.sectionBody}>
              <Text style={styles.weekCaption}>
                {formatMessage(t.payment.lastWeekRange, { range: lastLabel })}
              </Text>
              <Text style={styles.verified}>
                {formatMessage(t.payment.verifiedDays, { n: verifiedDays })}
              </Text>

              {/* Receipt-level counts — what is verified, what is approved,
                  and WHICH shifts still wait. The grid chips are day-grain;
                  this is the receipt-grain answer the owner asked for. */}
              {lastReviewCaption && (
                <Text style={styles.reviewCaption}>{lastReviewCaption}</Text>
              )}

              {/* Which agencies owe last week, when there is more than one. */}
              <WeekVouchers week={lastWeek} />

              {/* Last week matters more than this one for penalties: the weekly
                  rules are evaluated against a COMPLETE week, so a charge
                  usually appears only once the week has closed. */}
              <PenaltiesForWeek weeksAgo={1} />

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
                        <Text style={styles.gridDay}>
                          {weekdayLabel(d.dateIso, t) ?? d.day}
                        </Text>
                        <Text style={styles.gridDate}>{d.date}</Text>
                      </View>
                    ))}
                    <View style={styles.gridCol}>
                      {/*
                       * "TOT" meant nothing to the PR reading it. The column
                       * is each row's seven days added up, so it says so —
                       * and it keeps the two-line shape of the day columns
                       * (WED / 5) instead of a lone abbreviation. 5 chars at
                       * 10px bold clears the 56px column.
                       */}
                      <Text style={styles.gridDay}>{t.payment.gridTotal}</Text>
                      <Text style={styles.gridDate}>
                        {t.payment.gridTotalSub}
                      </Text>
                    </View>
                  </View>

                  {GRID_ROWS.map((row) => {
                    const rowTotal = grid.reduce(
                      (s, d) => s + cellAmount(d, row.key),
                      0,
                    );
                    const isDeduction = row.key === 'deductions';
                    /*
                     * Deductions is NOT dropped at zero — see the note on This
                     * week. A row of dashes IS the answer; an absent row is not.
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
                          const isDisputed = disputedCells.has(key);
                          const canTap = amount !== 0 && d.status !== 'empty';
                          return (
                            <Pressable
                              key={key}
                              style={[
                                styles.gridCol,
                                canTap && styles.gridColTap,
                                isDisputed && styles.gridColDisputed,
                              ]}
                              onPress={() =>
                                canTap && openEvidence(d, row, 'last')
                              }
                              disabled={!canTap}
                            >
                              <Text
                                style={[
                                  styles.gridVal,
                                  // Wages are a sealed system fact — no
                                  // review step exists for them, so they
                                  // read settled-green whenever real
                                  // (owner: "the total and the wages
                                  // always green").
                                  row.key === 'wages' &&
                                    amount > 0 &&
                                    styles.gridValVerified,
                                  // The receipts' own state colours the
                                  // figure: green when every one is
                                  // verified, amber when they all sit in
                                  // one unsettled state, white when mixed
                                  // (owner's rule, 23 Aug 2026). Disputed
                                  // red below still outranks.
                                  cellReviewTone(lastWeek, d.dateIso, row.key) ===
                                    'verified' && styles.gridValVerified,
                                  cellReviewTone(lastWeek, d.dateIso, row.key) ===
                                    'warning' && styles.gridValPending,
                                  isDisputed && styles.gridValDisputed,
                                  // Only the real figure goes red. Colouring the
                                  // whole row painted the empty days' dashes red
                                  // too, so a week with one fine looked like six.
                                  // Whole row red, dashes included: the row reads
                                  // as one thing rather than a red word with grey
                                  // figures under it. Owner's call, 20 Aug.
                                  isDeduction && styles.gridValDeduction,
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
                              {/*
                               * ⚠️ `weekDisputable(lastWeek)` asked the NEWEST
                               * voucher. One agency signing its document took
                               * the flag off the OTHER agency's cells too,
                               * which is a promise withdrawn from a PR who
                               * still had every right to argue. The cell names
                               * its own voucher through the same resolver the
                               * write paths use; a cell that cannot be
                               * attributed falls back to the week, where
                               * `weekDisputable` now answers "is ANY of them
                               * still arguable" rather than "is the newest".
                               */}
                              {canTap &&
                                (kindDisputable(row.key) &&
                                weekDisputable(
                                  lastWeek,
                                  voucherOwning(lastWeek, {
                                    receiptId: null,
                                    dateIso: d.dateIso,
                                    component: row.key,
                                  }),
                                ) ? (
                                  <Flag
                                    size={9}
                                    color={isDisputed ? C.red : C.muted2}
                                    style={{ marginTop: 2 }}
                                  />
                                ) : (
                                  <Search
                                    size={9}
                                    color={C.muted2}
                                    style={{ marginTop: 2 }}
                                  />
                                ))}
                            </Pressable>
                          );
                        })}
                        <View style={styles.gridCol}>
                          {/* The week TOTAL is a cell in this row too — leaving it
                              the default colour was the one grey figure in a red
                              line, which reads as a mistake rather than a total. */}
                          <Text
                            style={[
                              styles.gridVal,
                              // Totals are arithmetic, not claims —
                              // always green when real (owner's call);
                              // the deductions row keeps its red.
                              !isDeduction &&
                                rowTotal !== 0 &&
                                styles.gridValVerified,
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
                      // A day with RECEIPTS opens too, not only a day with
                      // claims — the sheet answers “what state is this
                      // day’s paper in”, which every non-empty day can ask.
                      const openable =
                        claims.open.length + claims.settled.length > 0 ||
                        dayReceiptSummary(lastWeek, d.dateIso).total > 0;
                      return (
                        <Pressable
                          key={`st-${d.dateIso}`}
                          style={styles.gridCol}
                          onPress={() =>
                            openable &&
                            setClaimDay({ dateIso: d.dateIso, week: 'last' })
                          }
                          disabled={!openable}
                        >
                          <Text
                            style={[
                              styles.statusPill,
                              d.status === 'pending' &&
                                styles.statusPillPending,
                              // Last week collapses 'approved' into VERIFIED
                              // (see the label above), so this row's green is
                              // real settlement — but it used to arrive by
                              // inheriting the base. Named explicitly now that
                              // the base is amber; there is deliberately no
                              // APPROVED branch here, because no day in a
                              // closed week can carry that label.
                              label === 'VERIFIED' && styles.statusPillVerified,
                              label === 'DISPUTED' && styles.statusPillDisputed,
                              label === 'DEDUCTED' && styles.statusPillDeducted,
                              d.status === 'empty' && { color: C.muted2 },
                            ]}
                          >
                            {DAY_STATUS_LABELS[label](t)}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <View style={styles.gridCol}>
                      {/* Counts settled days in a closed week — green, and now
                          said out loud rather than inherited from the base. */}
                      <Text style={[styles.statusPill, styles.statusPillVerified]}>
                        {formatMessage(t.payment.nVerified, {
                          n: verifiedDays,
                        })}
                      </Text>
                    </View>
                  </View>
                </View>
              </ScrollView>

              {/*
               * ONE BANNER PER DISPUTED VOUCHER, named — for the same reason as
               * the pills above. A single banner off `lastWeek.status` said
               * "Dispute open" over a week where only one of two agencies was
               * being argued with, and said nothing at all when the claim was
               * against the older voucher.
               */}
              {disputedVouchers.map((v) => (
                <View key={v.id || 'headline'} style={styles.disputeBanner}>
                  <Text style={styles.disputeBannerTitle}>
                    {disputedVouchers.length > 1 || lastWeekVouchers.length > 1
                      ? formatMessage(t.payment.disputeOpenNamed, {
                          agency: v.agencyName ?? t.payment.agencyFallback,
                        })
                      : t.payment.disputeOpen}
                  </Text>
                  {lastWeek?.disputeReason ? (
                    <Text style={styles.disputeBannerBody}>
                      {lastWeek.disputeReason}
                      {lastWeek.disputeNote ? ` — ${lastWeek.disputeNote}` : ''}
                    </Text>
                  ) : null}
                  <Text style={styles.disputeBannerHint}>
                    {t.payment.disputeBannerHint}
                  </Text>
                </View>
              ))}

              {hasLastWeekRows ? (
                <>
                  <Text style={styles.disputeHint}>
                    {tapHintParts[0]}
                    <Text style={{ color: C.red }}>{t.payment.redWord}</Text>
                    {tapHintParts[1] ?? ''}
                  </Text>

                  <Text style={styles.footNote}>
                    {t.payment.pvIssuedSunday}{' '}
                    <Text style={styles.footTotal}>
                      {formatRM(reviewAmount)}
                    </Text>
                  </Text>
                </>
              ) : (
                <Text style={styles.emptyWeekHint}>
                  {t.payment.noLastWeekPv}
                </Text>
              )}

              {/*
               * ONE BUTTON PER VOUCHER. With two agencies in a week there are two
               * documents to sign, and a single button could only ever open one of
               * them while quoting the other's money — `reviewAmount` is the whole
               * week's total, which is not what either voucher says.
               *
               * The agency NAMES each button, and the amount is that voucher's own
               * net. On the ordinary one-voucher week this renders exactly as
               * before, with the week total, because there the two are the same.
               */}
              {awaitingVouchers.map((v) => (
                <IzButton
                  key={v.id}
                  label={
                    awaitingVouchers.length > 1
                      ? formatMessage(t.payment.reviewSignNamed, {
                          agency: v.agencyName ?? t.payment.agencyFallback,
                          amount: formatRM(v.net),
                        })
                      : formatMessage(t.payment.reviewSign, {
                          amount: formatRM(reviewAmount),
                        })
                  }
                  small
                  onPress={() => openPv(v.id)}
                  style={{ marginTop: 10 }}
                />
              ))}
            </View>
          )}
        </View>
      ) : (
        <View style={styles.section}>
          <Pressable
            style={styles.sectionHd}
            onPress={() => setThisOpen((o) => !o)}
          >
            <View style={{ flex: 1 }}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>
                  {t.payment.thisWeekTitle}
                </Text>
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
                {/*
                 * ⚠️ SAME HEADLINE READ AS LAST WEEK — this is This-week's copy
                 * of it. `current.status` is the newest voucher's, so a claim
                 * against one agency branded the whole live week, and a claim
                 * against the older voucher showed nothing at all. One pill per
                 * disputed voucher, named, exactly as Last week does.
                 */}
                {(current?.vouchers ?? []).length > 1
                  ? (current?.vouchers ?? [])
                      .filter((v) => v.status === 'disputed')
                      .map((v) => (
                        <Text key={v.id} style={styles.disputePill}>
                          {`${(v.agencyName ?? t.payment.agencyFallback).toUpperCase()} · ${t.payment.statusDisputed}`}
                        </Text>
                      ))
                  : current?.status === 'disputed' && (
                      <Text style={styles.disputePill}>
                        {t.payment.statusDisputed}
                      </Text>
                    )}
                <Text style={styles.sectionFrac}>{thisApprovedDays}/7</Text>
              </View>
              <Text style={styles.sectionAction}>
                {thisOpen ? t.common.tapToCollapse : t.common.tapToExpand}
              </Text>
            </View>
            <ChevronDown
              size={16}
              color={C.goldL}
              style={
                thisOpen ? { transform: [{ rotate: '180deg' }] } : undefined
              }
            />
          </Pressable>

          {thisOpen && (
            <View style={styles.sectionBody}>
              <View style={styles.thisHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.weekCaption}>{t.payment.thisWeek}</Text>
                  <Text style={styles.weekCaptionRange}>{thisLabel}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {/* "Approved", not "Verified": verification is the Monday
                      rollover, and this week has not had one. */}
                  <Text style={styles.verifiedTiny}>
                    {t.payment.approvedDays}
                  </Text>
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

              {/* Amber, because this is money that is WAITING — the same colour
                  the Status pills use for pending and approved, and deliberately
                  not green: nothing here is settled. */}
              {pendingOtCaption && (
                <Text style={[styles.reviewCaption, styles.otCaption]}>
                  {pendingOtCaption}
                </Text>
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
                        <Text style={styles.gridDay}>
                          {weekdayLabel(d.dateIso, t) ?? d.day}
                        </Text>
                        <Text style={styles.gridDate}>{d.date}</Text>
                      </View>
                    ))}
                    <View style={styles.gridCol}>
                      {/*
                       * "TOT" meant nothing to the PR reading it. The column
                       * is each row's seven days added up, so it says so —
                       * and it keeps the two-line shape of the day columns
                       * (WED / 5) instead of a lone abbreviation. 5 chars at
                       * 10px bold clears the 56px column.
                       */}
                      <Text style={styles.gridDay}>{t.payment.gridTotal}</Text>
                      <Text style={styles.gridDate}>
                        {t.payment.gridTotalSub}
                      </Text>
                    </View>
                  </View>

                  {GRID_ROWS.map((row) => {
                    const rowTotal = thisGrid.reduce(
                      (s, d) => s + cellAmount(d, row.key),
                      0,
                    );
                    const isDeduction = row.key === 'deductions';
                    /*
                     * Deductions stays drawn at zero, exactly like the four
                     * earning rows.
                     *
                     * It used to be dropped as "noise on a payslip". But an
                     * ABSENT row does not say "you were not docked" — it says
                     * nothing, and a PR checking whether a fine landed cannot
                     * tell "no deductions" from "this screen does not show
                     * deductions". The reassuring answer and the missing feature
                     * looked identical. Five rows are the shape of the week, and
                     * the grid keeps one height whatever the week did.
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
                        {thisGrid.map((d) => {
                          const amount = cellAmount(d, row.key);
                          const key = `${d.dateIso}-${row.key}`;
                          /*
                           * THE SAME SET the Last-week grid and the Status row
                           * read — it was simply never consulted here, so a
                           * contested figure on THIS week stayed settled-green
                           * while the Status cell under it read DISPUTED and
                           * the header said DISPUTED. Two surfaces out of three
                           * agreed and the third was the money.
                           *
                           * `disputedCells`, not `cellReviewTone`, because it
                           * also holds the claim the PR raised SECONDS ago,
                           * before any refetch — the cell has to turn red on
                           * submit, not on the next poll.
                           */
                          const isDisputed = disputedCells.has(key);
                          const canTap = amount !== 0 && d.status !== 'empty';
                          return (
                            <Pressable
                              key={key}
                              style={[
                                styles.gridCol,
                                canTap && styles.gridColTap,
                                isDisputed && styles.gridColDisputed,
                              ]}
                              onPress={() =>
                                canTap && openEvidence(d, row, 'current')
                              }
                              disabled={!canTap}
                            >
                              <Text
                                style={[
                                  styles.gridVal,
                                  // Wages are a sealed system fact — no
                                  // review step exists for them, so they
                                  // read settled-green whenever real
                                  // (owner: "the total and the wages
                                  // always green").
                                  row.key === 'wages' &&
                                    amount > 0 &&
                                    styles.gridValVerified,
                                  // Receipt-grain tone, replacing the old
                                  // whole-day amber: one cell answers for
                                  // ITS receipts, not the day's (owner's
                                  // rule, 23 Aug 2026 — same map as the
                                  // Last-week grid).
                                  cellReviewTone(current, d.dateIso, row.key) ===
                                    'verified' && styles.gridValVerified,
                                  cellReviewTone(current, d.dateIso, row.key) ===
                                    'warning' && styles.gridValPending,
                                  // LAST of the tones, so red wins: an open
                                  // claim outranks whatever the agency's review
                                  // said about the paper behind it.
                                  isDisputed && styles.gridValDisputed,
                                  // Only the real figure goes red. Colouring the
                                  // whole row painted the empty days' dashes red
                                  // too, so a week with one fine looked like six.
                                  // Whole row red, dashes included: the row reads
                                  // as one thing rather than a red word with grey
                                  // figures under it. Owner's call, 20 Aug.
                                  isDeduction && styles.gridValDeduction,
                                ]}
                              >
                                {formatCell(amount)}
                              </Text>
                              {/*
                               * Same honesty rule as Last week: a flag where a
                               * dispute is actually possible, the inspect glyph
                               * where tapping only opens the evidence.
                               */}
                              {/* Same per-cell resolution as Last week — and the
                               * duplicated `weekDisputable(current) &&
                               * weekDisputable(current)` goes with it. It was a
                               * copy-paste, harmless, and exactly the kind of
                               * thing that survives because nothing reads a
                               * condition twice. */}
                              {canTap &&
                                (kindDisputable(row.key) &&
                                weekDisputable(
                                  current,
                                  voucherOwning(current, {
                                    receiptId: null,
                                    dateIso: d.dateIso,
                                    component: row.key,
                                  }),
                                ) ? (
                                  <Flag
                                    size={9}
                                    // Red once the claim is live, matching the
                                    // Last-week grid — the flag is the control
                                    // that raised it, so it should not stay
                                    // grey beside a figure it turned red.
                                    color={isDisputed ? C.red : C.muted2}
                                    style={{ marginTop: 2 }}
                                  />
                                ) : (
                                  <Search
                                    size={9}
                                    color={C.muted2}
                                    style={{ marginTop: 2 }}
                                  />
                                ))}
                            </Pressable>
                          );
                        })}
                        <View style={styles.gridCol}>
                          {/* The week TOTAL is a cell in this row too — leaving it
                              the default colour was the one grey figure in a red
                              line, which reads as a mistake rather than a total. */}
                          <Text
                            style={[
                              styles.gridVal,
                              // Totals are arithmetic, not claims —
                              // always green when real (owner's call);
                              // the deductions row keeps its red.
                              !isDeduction &&
                                rowTotal !== 0 &&
                                styles.gridValVerified,
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
                      // Same widening as the Last-week row above.
                      const openable =
                        claims.open.length + claims.settled.length > 0 ||
                        dayReceiptSummary(current, d.dateIso).total > 0;
                      return (
                        <Pressable
                          key={`st-${d.dateIso}`}
                          style={styles.gridCol}
                          onPress={() =>
                            openable &&
                            setClaimDay({ dateIso: d.dateIso, week: 'current' })
                          }
                          disabled={!openable}
                        >
                          <Text
                            style={[
                              styles.statusPill,
                              d.status === 'pending' &&
                                styles.statusPillPending,
                              // APPROVED is amber like PENDING, by the owner's
                              // rule: mid-week sign-off is a checkpoint, not
                              // settlement — the Dispute button on this very
                              // day is still live. Without this branch it fell
                              // to the base colour, which was green.
                              label === 'APPROVED' && styles.statusPillApproved,
                              label === 'DISPUTED' && styles.statusPillDisputed,
                              label === 'VERIFIED' && styles.statusPillVerified,
                              label === 'DEDUCTED' && styles.statusPillDeducted,
                              d.status === 'empty' && { color: C.muted2 },
                            ]}
                          >
                            {DAY_STATUS_LABELS[label](t)}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <View style={styles.gridCol}>
                      {/* PENDING ONLY (owner, 3 Sep 2026: "status of that week,
                          remove this '1 approved'").

                          The approved count was already on this card — the
                          header reads "Approved days 1/7" — so the cell restated
                          it in the one column that is supposed to summarise the
                          week, and read as a second, smaller answer to a
                          question already answered above.

                          What is left says something the header does not: how
                          many days the agency has still to look at. Amber, and
                          absent at zero — an open week's days top out at
                          APPROVED, which is a checkpoint, not settlement, so no
                          green belongs in this column either way. */}
                      {thisPendingDays > 0 && (
                        <Text style={styles.statusPill}>
                          {formatMessage(t.payment.nPending, {
                            n: thisPendingDays,
                          })}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              </ScrollView>

              <Text style={styles.footNote} numberOfLines={1}>
                {pvOnDayParts[0]}
                <Text style={styles.footBold}>{issueDay}</Text>
                {pvOnDayParts[1] ?? ''} · {t.payment.totalLower}{' '}
                <Text style={styles.footTotal}>{formatRM(thisWeekTotal)}</Text>
              </Text>

              {/* Directly under the total, because that total is the thing it
                  qualifies: with two agencies it is the sum of two documents,
                  not one voucher's figure. */}
              <WeekVouchers week={current} />

              <PenaltiesForWeek weeksAgo={0} />

              {!hasThisWeekRows && (
                <Text style={styles.emptyWeekHint}>
                  {t.payment.checkOutToSeal}
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
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={() => setClaimDay(null)}
        >
          {/*
           * Dismiss target is a SIBLING above the sheet, not a Pressable
           * parent — a Pressable ancestor competes with the ScrollView for the
           * touch responder on Android, which is why scrolling sometimes
           * failed. Same fix as CellEvidenceSheet.
           */}
          <View style={styles.backdrop}>
            <Pressable
              style={styles.backdropTap}
              onPress={() => setClaimDay(null)}
            />
            <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
              {(() => {
                const week = claimDay.week === 'last' ? lastWeek : current;
                const { open, settled } = disputesForDay(
                  week,
                  claimDay.dateIso,
                );
                const rows = [...open, ...settled];
                const dayReceipts = dayReceiptSummary(
                  week,
                  claimDay.dateIso,
                );
                return (
                  <>
                    <Text style={styles.claimTitle}>
                      {rows.length > 0
                        ? t.payment.whatYouDisputed
                        : t.payment.receiptsThisDay}
                    </Text>
                    <Text style={styles.claimDay}>
                      {longDay(claimDay.dateIso, t)}
                    </Text>
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
                    <ScrollView
                      style={styles.claimScroll}
                      showsVerticalScrollIndicator={false}
                    >
                      {/*
                       * THE DAY’S PAPER, before the arguments about it
                       * (owner: “beside the accepted disputed”). Receipt
                       * grain: how many are settled out of the day’s total,
                       * and WHICH ones still wait — pending listed first
                       * because that is the one the PR is chasing.
                       */}
                      {dayReceipts.total > 0 && (
                        <View style={styles.claimRow}>
                          <View style={styles.claimHead}>
                            <Text style={styles.claimComponent}>
                              {t.payment.receiptsThisDay}
                            </Text>
                            {/* claimState carries no colour of its own —
                                the dispute rows always pair it with a status
                                colour, and without one this printed near-black
                                on the dark card (owner: "this in white"). */}
                            <Text style={[styles.claimState, { color: C.txt }]}>
                              {formatMessage(t.payment.nTotal, {
                                n: dayReceipts.total,
                              })}
                            </Text>
                          </View>
                          <Text style={styles.claimMeta}>
                            {formatMessage(t.payment.receiptCounts, {
                              v: dayReceipts.verified.length,
                              a: dayReceipts.approved.length,
                              p: dayReceipts.pending.length,
                            })}
                          </Text>
                          {[
                            ...dayReceipts.pending,
                            ...dayReceipts.approved,
                            ...dayReceipts.verified,
                          ].map((r) => (
                            <View key={r.receiptNo} style={styles.claimShift}>
                              <View style={styles.claimShiftTitleRow}>
                                <Text style={styles.claimShiftHead}>
                                  {r.orderNo ?? r.receiptNo}
                                </Text>
                                <Text
                                  style={[
                                    styles.claimState,
                                    // Approved shares the warning colour
                                    // with pending (owner's call) — the
                                    // word carries the difference.
                                    (r.status === 'pending' ||
                                      r.status === 'approved') &&
                                      styles.statusPillPending,
                                    r.status === 'verified' &&
                                      styles.statusPillVerified,
                                  ]}
                                >
                                  {RECEIPT_STATUS_LABELS[r.status](t)}
                                </Text>
                              </View>
                              <Text style={styles.claimShiftMeta}>
                                {r.receiptNo} · {formatRM(r.amount)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                      {rows.map((d) => {
                        const shifts = claimShifts(week, d);
                        return (
                          <View key={d.id} style={styles.claimRow}>
                            <View style={styles.claimHead}>
                              <Text style={styles.claimComponent}>
                                {incomeRowLabel(d.component, t)}
                              </Text>
                              <Text
                                style={[
                                  styles.claimState,
                                  d.outcome === null &&
                                    styles.statusPillDisputed,
                                  d.outcome === 'accepted' &&
                                    styles.statusPillVerified,
                                ]}
                              >
                                {d.outcome === null
                                  ? t.payment.claimOpen
                                  : d.outcome === 'accepted'
                                    ? t.payment.claimAccepted
                                    : d.outcome === 'rejected'
                                      ? t.payment.claimRejected
                                      : t.payment.claimWithdrawn}
                              </Text>
                            </View>
                            <Text style={styles.claimMeta}>
                              {formatMessage(t.payment.voucherSaid, {
                                amount: formatRM(
                                  Number(d.disputedAmount ?? 0),
                                ),
                              })}
                              {/* A claim raised since 3 Sep carries the PR's own
                                  description here and renders as written; an
                                  older one holds one of the seven retired
                                  preset strings, which `presetLabel` still
                                  translates so it reads as it always did. */}
                              {d.reason ? ` · ${presetLabel(d.reason, t)}` : ''}
                            </Text>
                            {/*
                             * WHEN it was raised. An open claim with no date on it
                             * gives the PR no way to tell a dispute filed this
                             * morning from one the agency has been sitting on for
                             * a week — which is the whole question they open this
                             * sheet to answer.
                             */}
                            <Text style={styles.claimMeta}>
                              {formatMessage(t.payment.raisedAt, {
                                when: shortStamp(d.raisedAt, t),
                              })}
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
                                {t.payment.filedWholeDay}
                              </Text>
                            )}
                            {shifts.length > 0 ? (
                              shifts.map((s) => (
                                <View
                                  key={s.receiptNo}
                                  style={styles.claimShift}
                                >
                                  {/*
                                   * The night first, the paper second. The agency
                                   * reads this claim beside its own receipt card,
                                   * which leads with the event — so this does too,
                                   * and the venue drops to the line below where it
                                   * belongs. `eventName` is null on shifts the
                                   * outlet never named, and the venue then carries
                                   * the heading on its own.
                                   */}
                                  <View style={styles.claimShiftTitleRow}>
                                    <Text style={styles.claimShiftHead}>
                                      {s.eventName ??
                                        s.outletName ??
                                        t.payment.shiftFallback}
                                    </Text>
                                    <Text style={styles.claimEventTag}>
                                      {eventKindLabel(s.eventKind, t)}
                                    </Text>
                                  </View>
                                  <Text style={styles.claimShiftMeta}>
                                    {s.eventName && s.outletName
                                      ? `${s.outletName} · `
                                      : ''}
                                    {s.slot ?? t.payment.shiftTimeUnknown}
                                  </Text>
                                  <Text style={styles.claimShiftMeta}>
                                    {formatMessage(t.payment.inOutWindow, {
                                      inAt: shortStamp(s.checkInAt, t),
                                      outAt: shortStamp(s.checkOutAt, t),
                                      window: shiftWindowLabel(
                                        s.checkInAt,
                                        s.checkOutAt,
                                        s.overtimeMinutes,
                                        t,
                                      ),
                                    })}
                                  </Text>
                                  <Text style={styles.claimShiftMeta}>
                                    {s.orderNo ?? t.payment.noOrderNo} ·{' '}
                                    {s.receiptNo}
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
                                      <Text
                                        key={it.lineId}
                                        style={styles.claimItem}
                                      >
                                        {it.description} × {it.quantity} ·{' '}
                                        {formatRM(Number(it.amount ?? 0))}
                                      </Text>
                                    ))
                                  ) : (
                                    <Text style={styles.claimShiftMeta}>
                                      {t.payment.wholeReceipt}
                                    </Text>
                                  )}
                                </View>
                              ))
                            ) : (
                              // Only when the day has no receipts at all to point at
                              // — a wages/OT claim, which is derived from the
                              // attendance stamps and has no paper behind it.
                              <Text style={styles.claimNote}>
                                {t.payment.noReceiptBehind}
                              </Text>
                            )}

                            {!!d.note && (
                              <Text style={styles.claimNote}>{d.note}</Text>
                            )}
                            {/*
                             * The agency's answer, verbatim. A rejected claim
                             * without its reason is the PR asked to accept "no"
                             * and given nothing to act on.
                             */}
                            {!!d.resolutionNote && (
                              <Text style={styles.claimAnswer}>
                                {formatMessage(t.payment.agencyAnswer, {
                                  note: d.resolutionNote,
                                })}
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
                                  {disputeBusy
                                    ? t.payment.cancelling
                                    : t.payment.cancelThisDispute}
                                </Text>
                              </Pressable>
                            )}
                          </View>
                        );
                      })}
                    </ScrollView>
                    {/* Close is RED, app-wide (owner's colour code) — same as
                     * dangerBtn and the evidence sheet's Close. */}
                    <Pressable
                      style={styles.sheetCloseBtn}
                      onPress={() => setClaimDay(null)}
                    >
                      <Text style={styles.sheetCloseText}>
                        {t.common.close}
                      </Text>
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
            /*
             * The sheet is open on ONE cell, so it can name its voucher — and it
             * must: this gate decides whether `onDispute` exists at all, and
             * reading the week's headline meant one agency's signed voucher
             * removed the Dispute button from the OTHER agency's evidence.
             */
            weekDisputable(
              evidenceTarget.week === 'last' ? lastWeek : current,
              voucherOwning(
                evidenceTarget.week === 'last' ? lastWeek : current,
                {
                  receiptId: null,
                  dateIso: evidenceTarget.dateIso,
                  component: evidenceTarget.incomeKey,
                },
              ),
            ) &&
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
            style={[
              styles.sheet,
              // Keyboard open: it already clears the nav bar, so its inset wins.
              {
                paddingBottom:
                  keyboardInset > 0 ? keyboardInset + 16 : 16 + insets.bottom,
              },
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <Text style={styles.sheetTitle}>
                {disputeMode === 'withdraw'
                  ? t.payment.withdrawDisputeTitle
                  : t.payment.disputeThisAmount}
              </Text>
              {disputeTarget && (
                <View style={styles.targetPill}>
                  <Text style={styles.targetPillText}>
                    {dayAndDateLabel(disputeTarget.dateIso, t)} ·{' '}
                    {incomeRowLabel(disputeTarget.incomeKey, t)} ·{' '}
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
                      <Text style={styles.fieldLabel}>
                        {t.payment.whichOneWrong}
                      </Text>
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
                              onPress={() =>
                                r.disputable &&
                                setDisputePickedReceipt(r.receiptNo)
                              }
                              disabled={!r.disputable}
                              accessibilityRole="radio"
                              accessibilityState={{
                                selected: on,
                                disabled: !r.disputable,
                              }}
                              accessibilityLabel={`${r.label}${
                                on ? `, ${t.payment.selected}` : ''
                              }${r.blockedNote ? `, ${r.blockedNote}` : ''}`}
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
                              <View
                                style={[styles.rcptBox, on && styles.rcptBoxOn]}
                              >
                                {on && <View style={styles.rcptDot} />}
                              </View>
                              {/*
                               * NO numberOfLines — the note is the point.
                               * Clamping to one line turned "waiting on your
                               * agency" into "waiting on yo…", which reads as a
                               * glitch rather than a reason. It wraps instead.
                               */}
                              <Text
                                style={[
                                  styles.rcptChipText,
                                  on && styles.rcptChipTextOn,
                                ]}
                              >
                                {r.label}
                                {r.blockedNote ? ` · ${r.blockedNote}` : ''}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <Text style={styles.pickedHint}>
                        {disputePickedReceipt === null
                          ? t.payment.pickShift
                          : formatMessage(t.payment.disputingOf, {
                              picked: formatRM(disputePickedSubtotal),
                              day: formatRM(disputeTarget?.amount ?? 0),
                            })}
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
                      <Text style={styles.fieldLabel}>
                        {t.payment.whichItem}
                      </Text>
                      <View style={styles.presetWrap}>
                        {disputeItems.map((it) => {
                          const on = disputePickedItems.includes(it.id);
                          return (
                            <Pressable
                              key={it.id}
                              style={[
                                styles.rcptChip,
                                on ? styles.rcptChipOn : styles.rcptChipOff,
                              ]}
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
                              <View
                                style={[
                                  styles.rcptSquare,
                                  on && styles.rcptSquareOn,
                                ]}
                              />
                              <Text
                                style={[
                                  styles.rcptChipText,
                                  on && styles.rcptChipTextOn,
                                ]}
                                numberOfLines={1}
                              >
                                {it.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      {disputePickedItems.length === 0 && (
                        <Text style={styles.pickedHint}>
                          {t.payment.pickOneItem}
                        </Text>
                      )}
                    </>
                  )}

                  {/*
                   * ONE FIELD, not chips + a note (owner, 3 Sep 2026: "the
                   * reason remove this all, the small selection buttons" and
                   * "the reason will always get the reason description").
                   *
                   * The seven preset chips forced every claim into one of seven
                   * words, and the words did not say which drink was wrong — the
                   * thing the agency actually needs. What is posted as `reason`
                   * is now this box: written for the PR from the lines they
                   * ticked, and theirs to edit. The agency reads exactly what
                   * the PR sees, and the ticked lines still ride along
                   * separately as `disputedItems`.
                   */}
                  <Text style={styles.fieldLabel}>
                    {t.payment.quickReason}
                  </Text>
                  {/* Why the box below fills itself in. Shown only while it
                      still does — once the PR has typed, the note is theirs and
                      the hint would be describing behaviour that has stopped. */}
                  {!disputeNoteDirty && (
                    <Text style={[styles.pickedHint, { marginTop: 8 }]}>
                      {t.payment.noteFollowsItems}
                    </Text>
                  )}
                  <TextInput
                    value={disputeNote}
                    // Typing takes ownership: from here the reason and item
                    // chips stop rewriting what the PR wrote.
                    onChangeText={(next) => {
                      setDisputeNoteDirty(true);
                      setDisputeNote(next);
                    }}
                    // The column this posts to is varchar(200). Capping the
                    // input is how the PR finds that out while typing, rather
                    // than from a rejected submit after writing a paragraph.
                    maxLength={REASON_MAX}
                    style={[
                      styles.input,
                      {
                        minHeight: 88,
                        textAlignVertical: 'top',
                        marginTop: 10,
                      },
                    ]}
                    multiline
                    placeholder={t.payment.notePlaceholder}
                    placeholderTextColor={C.muted2}
                  />

                  <Pressable
                    style={styles.attachBtn}
                    onPress={() =>
                      pickDisputeImages((urls) =>
                        setDisputePhotos((prev) =>
                          [...prev, ...urls].slice(0, 6),
                        ),
                      )
                    }
                  >
                    <ImagePlus size={14} color={C.txt} />
                    <Text style={styles.attachBtnText}>
                      {t.payment.attachImages}
                    </Text>
                    <Text style={styles.attachOptional}>
                      {t.payment.optional}
                    </Text>
                  </Pressable>

                  {disputePhotos.length > 0 && (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.photoRow}
                      contentContainerStyle={{ gap: 8 }}
                    >
                      {disputePhotos.map((src, index) => (
                        <View
                          key={`${index}-${src.slice(0, 24)}`}
                          style={styles.photoThumb}
                        >
                          {/* Fresh picks are data URLs; entries may be R2 keys if
                            ever seeded from a saved dispute — resolve for display,
                            submit still sends the raw strings. */}
                          <Image
                            source={{ uri: resolveProofPhotoUri(src) }}
                            style={styles.photoImg}
                          />
                          <Pressable
                            style={styles.photoRemove}
                            onPress={() =>
                              setDisputePhotos((prev) =>
                                prev.filter((_, i) => i !== index),
                              )
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
                    {/* Two spelled-out keys rather than an appended "s":
                        Chinese has no plural form to build. */}
                    {disputePhotos.length > 0
                      ? formatMessage(
                          disputePhotos.length === 1
                            ? t.payment.imagesAttachedOne
                            : t.payment.imagesAttachedMany,
                          { n: disputePhotos.length },
                        )
                      : t.payment.proofOptional}
                  </Text>

                  <View style={styles.sheetActions}>
                    <Pressable style={styles.backBtn} onPress={closeDispute}>
                      <Text style={styles.backBtnText}>{t.common.back}</Text>
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
                        {disputeBusy
                          ? t.payment.submitting
                          : t.payment.submitDispute}
                      </Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.sheetSub}>
                    {t.payment.withdrawSub}
                    {disputeTarget && disputePhotoMap[disputeTarget.key]?.length
                      ? ` · ${formatMessage(t.payment.proofCleared, {
                          n: disputePhotoMap[disputeTarget.key].length,
                        })}`
                      : ''}
                  </Text>
                  <Pressable
                    style={[styles.dangerBtn, disputeBusy && { opacity: 0.6 }]}
                    onPress={submitDispute}
                    disabled={disputeBusy}
                  >
                    <Text style={styles.dangerBtnText}>
                      {disputeBusy
                        ? t.payment.withdrawing
                        : t.payment.withdrawDispute}
                    </Text>
                  </Pressable>
                  <Pressable style={styles.cancel} onPress={closeDispute}>
                    <Text style={styles.cancelText}>{t.common.back}</Text>
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

/**
 * "Who is paying me this week?" — one row per AGENCY voucher.
 *
 * A PR who worked for two agencies in one week holds TWO vouchers (0129), one
 * per agency, because each agency signs and pays its own. The grid above stays
 * a single merged week — the person worked one week and wants to see one week's
 * money — so this is the only place the split is visible, and without it the
 * footer's single total would look like one document that does not exist.
 *
 * Renders NOTHING for the ordinary one-agency week: a lone row restating the
 * total the footer already gives is noise, and the week it matters is the week
 * it must stand out. Same reasoning as PenaltiesForWeek below.
 *
 * Absent `vouchers` (a backend that has not restarted) also renders nothing,
 * which is the single-voucher behaviour that shipped before — never a claim
 * that the PR has no vouchers.
 */
function WeekVouchers({ week }: { week: PrCurrentWeek | null }) {
  const { t } = useLocale();
  const vouchers = week?.vouchers ?? [];
  if (vouchers.length < 2) return null;

  return (
    <View style={voucherStyles.card}>
      <Text style={voucherStyles.title}>
        {formatMessage(t.payment.nVouchersThisWeek, { n: vouchers.length })}
      </Text>
      <Text style={voucherStyles.hint}>{t.payment.multiAgencyHint}</Text>
      {vouchers.map((v) => (
        <View key={v.id} style={voucherStyles.row}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={voucherStyles.agency} numberOfLines={1}>
              {v.agencyName ?? t.payment.agencyFallback}
            </Text>
            <Text style={voucherStyles.no}>
              {v.voucherNo ?? t.payment.notYetNumbered}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={voucherStyles.amount}>
              {formatRM(Number(v.net ?? 0))}
            </Text>
            {/*
             * The stored status, said in the same words the header pills use.
             * It used to print the raw enum with its underscores swapped for
             * spaces, which cannot be translated at all — and left one screen
             * calling `awaiting_pr` two different things.
             */}
            <Text style={voucherStyles.state}>
              {voucherPill(v.status ?? null, t).label}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const voucherStyles = StyleSheet.create({
  card: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(139,124,246,0.35)',
    backgroundColor: 'rgba(139,124,246,0.06)',
    borderRadius: 12,
    padding: 12,
  },
  title: {
    color: '#c4b5fd',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  hint: { color: '#9b93b8', fontSize: 11, marginTop: 3 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  agency: { color: '#e9e6f5', fontSize: 13, fontWeight: '700' },
  no: { color: '#9b93b8', fontSize: 11, marginTop: 2 },
  amount: { color: '#e9e6f5', fontSize: 13, fontWeight: '800' },
  state: {
    color: '#9b93b8',
    fontSize: 10,
    marginTop: 2,
    textTransform: 'uppercase',
  },
});

/**
 * "Was I penalised this week?" — the PR's own SEALED charges.
 *
 * Renders nothing when there is none, which is the common case: a permanent
 * "Penalties RM 0.00" row on a payslip trains people to stop reading it, and
 * the one week it is not zero is the week it must be noticed.
 *
 * Deliberately shows only what the agency has ACCEPTED. The proposal endpoint
 * can say a week would cost RM 50 before anyone decides to charge it; putting
 * that in front of the worker would announce money they may never lose.
 */
function PenaltiesForWeek({ weeksAgo }: { weeksAgo: number }) {
  const { t } = useLocale();
  const { token } = useSession();
  const [data, setData] = useState<MyPenaltiesWeek | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const { weekStart, weekEnd } = weekRangeIso(weeksAgo);
    getMyPenalties(token, weekStart, weekEnd)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        // A failed read must not invent "no penalties" — leaving `data` null
        // renders nothing, which is silence, not a false all-clear.
      });
    return () => {
      cancelled = true;
    };
  }, [token, weeksAgo]);

  if (!data || data.count === 0) return null;

  return (
    <View style={penaltyStyles.card}>
      <View style={penaltyStyles.head}>
        <Text style={penaltyStyles.title}>{t.payment.penaltiesThisWeek}</Text>
        <Text style={penaltyStyles.total}>
          −{formatRM(Number(data.totalRm))}
        </Text>
      </View>
      {data.penalties.map((p) => (
        <View key={p.id} style={penaltyStyles.row}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={penaltyStyles.label}>
              {PENALTY_RULE_LABELS[p.ruleType]?.(t) ??
                p.ruleType.replace(/_/g, ' ')}
            </Text>
            <Text style={penaltyStyles.detail}>{p.detail}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={penaltyStyles.amount}>
              −{formatRM(Number(p.fineRm))}
            </Text>
            <Text style={penaltyStyles.state}>
              {p.chargedAt
                ? t.payment.statusDeducted
                : t.payment.statusPending}
            </Text>
          </View>
        </View>
      ))}
      {data.cancellations.map((c) => (
        <View key={c.assignmentId} style={penaltyStyles.row}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={penaltyStyles.label}>{t.payment.cancelledShift}</Text>
            <Text style={penaltyStyles.detail}>
              {String(c.shiftDate ?? '').slice(0, 10)}
              {c.outletName ? ` · ${c.outletName}` : ''} ·{' '}
              {formatMessage(t.payment.pctOfDailyWage, { pct: c.feePct ?? 0 })}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={penaltyStyles.amount}>
              −{formatRM(Number(c.feeRm ?? 0))}
            </Text>
            <Text style={penaltyStyles.state}>
              {c.chargedAt
                ? t.payment.statusDeducted
                : t.payment.statusPending}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const penaltyStyles = StyleSheet.create({
  card: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(240,113,113,0.35)',
    backgroundColor: 'rgba(240,113,113,0.06)',
    borderRadius: 12,
    padding: 10,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#f07171',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  total: { color: '#f07171', fontSize: 13, fontWeight: '800' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  label: {
    color: C.txt,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  detail: { color: C.muted2, fontSize: 11, marginTop: 1 },
  amount: { color: '#f07171', fontSize: 12, fontWeight: '800' },
  state: { color: C.muted2, fontSize: 10, marginTop: 1 },
});

const styles = StyleSheet.create({
  bankNudge: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    marginHorizontal: 14,
    marginBottom: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(232,198,106,0.35)',
    backgroundColor: C.amberBg,
  },
  bankNudgeBody: { flex: 1 },
  bankNudgeTitle: { ...font(700), fontSize: 14, color: C.txt },
  bankNudgeText: { marginTop: 3, ...font(), fontSize: 12, color: C.prMuted },
  // Looks like the link it is — the whole card is the tap target, but a card
  // with no visible action reads as a notice you cannot act on.
  bankNudgeAction: {
    marginTop: 6,
    ...font(700),
    fontSize: 12,
    color: C.amber,
    textDecorationLine: 'underline',
  },
  screen: { paddingTop: 6, paddingHorizontal: 18, paddingBottom: 26 },
  pageHeader: { paddingTop: 2 },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  headerTitle: {
    ...font(800),
    letterSpacing: -0.45,
    color: C.txt,
  },
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
  weekTabTitle: {
    ...font(700),
    fontSize: 14,
    color: C.muted,
  },
  weekTabSub: {
    marginTop: 4,
    ...font(),
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
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  sectionTitle: {
    ...font(800),
    fontSize: 12,
    letterSpacing: 1.2,
    color: C.txt,
  },
  sectionFrac: {
    ...font(700),
    fontSize: 13,
    color: C.goldL,
  },
  sectionAction: {
    marginTop: 4,
    ...font(600),
    fontSize: 12,
    color: C.goldL,
  },
  sectionBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  weekCaption: {
    marginTop: 12,
    ...font(700),
    fontSize: 14,
    color: C.txt,
  },
  weekCaptionRange: {
    marginTop: 2,
    ...font(700),
    fontSize: 14,
    color: C.txt,
  },
  thisHead: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  verified: {
    marginTop: 4,
    ...font(),
    fontSize: 13,
    color: C.prMuted,
  },
  /** Waiting money, so it wears the waiting colour — see the Status pills. */
  otCaption: { color: C.amber },
  reviewCaption: {
    marginTop: 8,
    ...font(),
    fontSize: 12,
    lineHeight: 17,
    color: C.prMuted,
  },
  verifiedTiny: {
    ...font(),
    fontSize: 11,
    color: C.prMuted2,
  },
  emptyWeekHint: {
    marginTop: 10,
    ...font(),
    fontSize: 12,
    lineHeight: 17,
    color: C.prMuted,
    textAlign: 'center',
  },
  gridRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  gridCorner: { width: 78 },
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
  gridValPending: { color: C.amber },
  gridValVerified: { color: C.green },
  gridValDisputed: { color: C.red },
  // Money going the other way. Red is already the app's colour for "this needs
  // your attention" (disputed cells, Close buttons), and a fine qualifies.
  // Applied to EVERY cell in the row — day figures, dashes and the week total
  // alike, whatever the amount. Half a red row reads as a rendering fault.
  gridValDeduction: { color: C.red },
  /*
   * The row label, same red as its cells, so the line reads as one thing.
   *
   * Red here names a CATEGORY — money going the other way — not an event. A
   * week of dashes is therefore still red, and it should be read as "nothing
   * was taken from you" rather than as an alarm. That is a deliberate trade the
   * owner made on 20 Aug: one unmistakable row beats a colour that only appears
   * once you have already been fined.
   */
  gridLabelDeduction: { color: C.red },
  // DEDUCTED is a settled state, not a warning — but it is still money off, so
  // it keeps the deduction colour rather than borrowing VERIFIED's green.
  statusPillDeducted: { color: C.red },
  /*
   * THE BASE IS AMBER — waiting — and green is never inherited.
   *
   * Green is the owner's rule for settled money only (23 Aug 2026: "all
   * verified will green, approved yellow warning colour same with Pending").
   * Green used to be the base here, and This week's chain has no branch of its
   * own for APPROVED — so an approved day inherited VERIFIED's green and read
   * as settled money while its Dispute button was still live. The redundant
   * `statusPillVerified` in that same chain is what hid the miss: the explicit
   * green and the inherited one looked identical on screen.
   *
   * Every green is now claimed by name — including Last week's, which had been
   * riding the base. Anything unhandled falls to waiting, which is the safe
   * direction to fail: a settled day shown as waiting is a question, a waiting
   * day shown as settled is a wrong answer about money.
   */
  statusPill: {
    ...font(800),
    fontSize: 8,
    letterSpacing: 0.3,
    color: C.amber,
    textAlign: 'center',
  },
  statusPillPending: { color: C.amber },
  /**
   * Signed off mid-week, but more receipts can still land on that day and the
   * PR can still contest it — waiting, deliberately the same amber as PENDING.
   */
  statusPillApproved: { color: C.amber },
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
    ...font(600),
    fontSize: 12,
    color: C.muted2,
  },
  rcptChipTextOn: {
    color: C.accentL,
    fontWeight: '800',
  },
  pickedHint: {
    marginTop: 6,
    ...font(),
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
  sheetCloseText: {
    ...font(700),
    fontSize: 15,
    color: C.red,
  },
  claimTitle: {
    ...font(800),
    fontSize: 18,
    color: C.txt,
  },
  claimDay: {
    marginTop: 2,
    ...font(),
    fontSize: 12,
    color: C.prMuted,
  },
  claimRow: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.glass,
  },
  claimHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  claimComponent: {
    ...font(800),
    fontSize: 14,
    color: C.txt,
  },
  claimState: {
    ...font(800),
    fontSize: 10,
    letterSpacing: 0.6,
  },
  claimMeta: {
    marginTop: 4,
    ...font(),
    fontSize: 12,
    color: C.prMuted,
  },
  claimShift: {
    marginTop: 8,
    paddingLeft: 9,
    borderLeftWidth: 2,
    borderLeftColor: C.line2,
  },
  claimShiftTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  claimShiftHead: {
    ...font(800),
    fontSize: 12,
    color: C.accentL,
  },
  /* Champagne, matching the evidence sheet's tag exactly — the PR sees the
     same event on both surfaces and should not have to check it is the same. */
  claimEventTag: {
    ...font(800),
    fontSize: 9,
    letterSpacing: 0.4,
    color: '#e8c27a',
    borderWidth: 1,
    borderColor: 'rgba(232,194,122,0.45)',
    backgroundColor: 'rgba(232,194,122,0.1)',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  claimShiftMeta: {
    marginTop: 2,
    ...font(),
    fontSize: 11,
    color: C.prMuted2,
  },
  claimItem: {
    marginTop: 3,
    ...font(700),
    fontSize: 12,
    color: C.txt,
  },
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
  claimCancelText: {
    ...font(800),
    fontSize: 12,
    color: C.red,
  },
  claimNote: {
    marginTop: 4,
    ...font(),
    fontSize: 12,
    color: C.muted2,
  },
  claimAnswer: {
    marginTop: 6,
    ...font(),
    fontSize: 12,
    color: C.goldL,
  },
  /** Voucher-level DISPUTED chip in the This-week card header. */
  disputePill: {
    ...font(800),
    fontSize: 9,
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
    ...font(),
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
    ...font(800),
    fontSize: 13,
    color: C.red,
  },
  disputeBannerBody: {
    marginTop: 4,
    ...font(),
    fontSize: 12,
    lineHeight: 17,
    color: C.txt,
  },
  disputeBannerHint: {
    marginTop: 6,
    ...font(),
    fontSize: 11,
    color: C.prMuted,
  },

  footNote: {
    marginTop: 10,
    ...font(),
    fontSize: 12,
    color: C.muted2,
    textAlign: 'center',
  },
  footBold: {
    ...font(800),
    color: C.txt,
  },
  footTotal: {
    ...font(800),
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
  sheetTitle: {
    ...font(800),
    fontSize: 20,
    color: C.txt,
  },
  sheetSub: {
    marginTop: 6,
    ...font(),
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
    ...font(700),
    fontSize: 12,
    color: C.goldL,
  },
  fieldLabel: {
    marginTop: 12,
    marginBottom: 4,
    ...font(600),
    fontSize: 11,
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
    ...font(600),
    fontSize: 12,
    color: C.txt,
  },
  input: {
    ...font(600),
    fontSize: 14,
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
    ...font(600),
    fontSize: 13,
    color: C.txt,
  },
  attachOptional: {
    ...font(),
    fontSize: 11,
    color: C.muted2,
  },
  attachHint: {
    marginTop: 8,
    ...font(),
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
    ...font(700),
    fontSize: 15,
    color: C.prMuted,
  },
  submitBtn: {
    flex: 1.4,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: {
    ...font(700),
    fontSize: 15,
    color: '#241a08',
  },
  dangerBtn: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(240,138,138,0.45)',
    backgroundColor: 'rgba(240,138,138,0.12)',
  },
  dangerBtnText: {
    ...font(700),
    fontSize: 15,
    color: C.red,
  },
  cancel: { marginTop: 10, alignItems: 'center', padding: 10 },
  cancelText: {
    ...font(600),
    fontSize: 14,
    color: C.muted,
  },
});
