/**
 * The PR's side of the receipt lifecycle: PENDING -> APPROVED -> VERIFIED.
 *
 * Two sections read this, and they need opposite things from it. THIS WEEK is
 * where the PR watches the agency work through what they logged, so it wants a
 * count. LAST WEEK is where they contest a figure, and a dispute is only allowed
 * once the agency has stated one — so it wants a per-cell answer.
 *
 * Everything here is ADVISORY. The server refuses a premature dispute with a 409
 * naming the receipt; this only decides whether to offer the control, so that
 * the PR is told why instead of being handed an action that fails.
 */
import type { PrCurrentWeek, PrReceiptLine, PrWeekDispute } from './api';
import type { GridBucket } from './week-pay-grid';
import type { WeeklyDayPay } from './demo-shifts';
import { formatMessage, type AppTranslations } from '../i18n';

/** The grid's own per-day state — see `WeeklyDayPay.status` for what each means. */
type DayGridStatus = WeeklyDayPay['status'];

/** Lines with a receipt behind them, split by where that receipt sits. */
export type ReceiptReviewCounts = {
  /** Logged, and nobody has checked it yet. */
  waiting: number;
  /** The agency has accepted it — and only now may it be disputed. */
  approved: number;
  /** Closed: the week rolled over, or a dispute against it was resolved. */
  verified: number;
};

export function receiptReviewCounts(
  week: PrCurrentWeek | null,
): ReceiptReviewCounts {
  const counts: ReceiptReviewCounts = { waiting: 0, approved: 0, verified: 0 };
  for (const line of week?.lines ?? []) {
    if (line.receiptStatus === 'pending') counts.waiting += 1;
    else if (line.receiptStatus === 'approved') counts.approved += 1;
    else if (line.receiptStatus === 'verified') counts.verified += 1;
  }
  return counts;
}

/**
 * The COLOUR a money cell earns from its receipts' review state — the
 * owner's rule (23 Aug 2026): "all verified will green, approved yellow
 * warning colour same with Pending, if half either some receipts on that
 * day ... will show white". Receipt grain per (day, kind):
 *
 *   'verified' → every receipt-backed line settled at verified (green)
 *   'warning'  → one uniform state that is NOT verified — all pending, or
 *                all approved (amber; the two share the warning colour by
 *                the owner's explicit call — the word carries the
                  difference)
 *   'mixed'    → two or more distinct states (white — the default ink)
 *   null       → no receipt-backed lines here (wages seals); style as before
 *
 * DISPUTED is not decided here: the red comes from the dispute set the
 * screen already holds, and it outranks whatever this returns.
 *
 * Accepts 'deductions' (a grid bucket, not a line kind) and returns null
 * for it — a fine has no receipt to review and keeps its own red.
 */
export function cellReviewTone(
  week: PrCurrentWeek | null,
  dateIso: string,
  kind: PrReceiptLine['kind'] | 'deductions',
): 'verified' | 'warning' | 'mixed' | 'disputed' | null {
  /*
   * AN OPEN CLAIM OUTRANKS THE REVIEW STATE — checked first, and it wins.
   *
   * This read `receiptStatus` alone, and that column says pending → approved →
   * verified: the AGENCY's review, with nowhere in it for what the PR thinks.
   * So the PR raised a claim, the header went DISPUTED, the Status row went
   * DISPUTED — and the contested figure itself stayed settled-GREEN, because
   * the paper behind it had been verified. The one cell the whole argument was
   * about was the one cell that looked fine.
   *
   * Open claims only, and through `openDisputeKeys` rather than a second walk
   * of `week.disputes` — one rule, so the figure and the Status row above it
   * cannot reach different conclusions about the same cell. A claim that was
   * accepted, rejected or withdrawn is history; painting it red forever would
   * leave a permanent warning on a figure nobody is arguing about any more.
   */
  if (openDisputeKeys(week).has(`${dateIso}-${kind}`)) return 'disputed';

  const statuses = new Set<string>();
  for (const line of week?.lines ?? []) {
    if (line.lineDate !== dateIso || line.kind !== kind) continue;
    if (!line.receiptStatus) continue;
    statuses.add(line.receiptStatus);
  }
  if (statuses.size === 0) return null;
  if (statuses.size > 1) return 'mixed';
  return statuses.has('verified') ? 'verified' : 'warning';
}

/** One receipt of a day, aggregated from its lines — what the day sheet lists. */
export type DayReceiptRow = {
  receiptNo: string;
  orderNo: string | null;
  status: 'pending' | 'approved' | 'verified';
  /** RM — the sum of this receipt’s lines dated this day. */
  amount: number;
};

export type DayReceiptSummary = {
  total: number;
  pending: DayReceiptRow[];
  approved: DayReceiptRow[];
  verified: DayReceiptRow[];
};

/**
 * ONE DAY's receipts by review state — the owner's ask (23 Aug 2026):
 * “inside the status row pr can see what receipt still pending, how many is
 * verified, how many is approved / that day total receipt”. Counted at
 * RECEIPT grain, not line grain, because the agency decides receipts; a
 * wages seal or legacy line with no paper behind it is skipped rather than
 * counted as a receipt nobody can find.
 */
export function dayReceiptSummary(
  week: PrCurrentWeek | null,
  dateIso: string,
): DayReceiptSummary {
  const byReceipt = new Map<string, DayReceiptRow>();
  for (const line of week?.lines ?? []) {
    if (line.lineDate !== dateIso) continue;
    const id = line.receiptId;
    const status = line.receiptStatus;
    if (!id || !status) continue;
    const row = byReceipt.get(id) ?? {
      receiptNo: line.receiptNo ?? 'Receipt',
      orderNo: line.orderNo ?? null,
      status,
      amount: 0,
    };
    row.amount += line.commission;
    byReceipt.set(id, row);
  }
  const rows = [...byReceipt.values()];
  return {
    total: rows.length,
    pending: rows.filter((r) => r.status === 'pending'),
    approved: rows.filter((r) => r.status === 'approved'),
    verified: rows.filter((r) => r.status === 'verified'),
  };
}

/**
 * Indexed by `Date#getUTCDay()`, so the ORDER is data and must stay Sun-first.
 * Holds resolvers, not strings: this is module scope, where no hook has run —
 * a plain array would be built once, in whatever locale loaded first.
 */
const CAPTION_DAY_ABBR: ((t: AppTranslations) => string)[] = [
  (t) => t.schedule.daySun,
  (t) => t.schedule.dayMon,
  (t) => t.schedule.dayTue,
  (t) => t.schedule.dayWed,
  (t) => t.schedule.dayThu,
  (t) => t.schedule.dayFri,
  (t) => t.schedule.daySat,
];

/** "Thu 20" from a lineDate — the shift the PR knows the entry by. All-UTC
 * like the grid, so the named day is the column the money sits under. The
 * weekday/number ORDER lives in the template: Chinese puts the number first. */
function captionDay(iso: string | null, t: AppTranslations): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return formatMessage(t.receipt.captionDay, {
    dow: CAPTION_DAY_ABBR[d.getUTCDay()](t),
    d: d.getUTCDate(),
  });
}

/**
 * The numbers the owner asked for (23 Aug 2026): how many entries are
 * verified and approved out of everything receipt-backed, and WHICH shifts
 * are still waiting — "pending just put what shift still pending". Null when
 * the week has no receipt-backed entries at all.
 */
export function receiptReviewCaption(
  week: PrCurrentWeek | null,
  /**
   * The dictionary, LAST and with no default — an exported formatter that
   * defaulted it would pin one locale for every screen that forgot to pass it.
   */
  t: AppTranslations,
): string | null {
  const { waiting, approved, verified } = receiptReviewCounts(week);
  const total = waiting + approved + verified;
  if (total === 0) return null;
  const settledParts: string[] = [];
  if (verified > 0)
    settledParts.push(formatMessage(t.receipt.captionVerified, { n: verified }));
  if (approved > 0)
    settledParts.push(formatMessage(t.receipt.captionApproved, { n: approved }));
  // "of {total} entries" WRAPS the parts in Chinese instead of trailing them,
  // so the whole clause is one key and the joined list goes in as a value.
  const head =
    settledParts.length > 0
      ? formatMessage(
          total === 1 ? t.receipt.captionOfOne : t.receipt.captionOfMany,
          { parts: settledParts.join(' · '), total },
        )
      : null;
  if (waiting === 0) return head;
  const pendingDays = [
    ...new Set(
      (week?.lines ?? [])
        .filter((line) => line.receiptStatus === 'pending')
        .map((line) => captionDay(line.lineDate, t))
        .filter((d): d is string => d !== null),
    ),
  ];
  // Two whole sentences rather than splicing a parenthesised fragment on —
  // the bracket and its spacing are punctuation, and Chinese uses its own.
  const tail =
    pendingDays.length > 0
      ? formatMessage(t.receipt.captionWaitingOn, {
          n: waiting,
          days: pendingDays.join(', '),
        })
      : formatMessage(t.receipt.captionWaiting, { n: waiting });
  return head ? `${head} · ${tail}` : tail;
}

/**
 * May the PR contest this day + income row yet?
 *
 * ONLY DRINKS AND TIPS (owner's decision, 4 Aug 2026). Daily wages and Others
 * (overtime, deductions) are never disputable — they are derived from the
 * check-in/check-out stamps and the shift rate, so the route to fixing one is
 * the attendance record, not a claim against the total. Checked FIRST, before
 * the line lookup, so a day with no lines still refuses rather than falling
 * through to the permissive default below.
 *
 * For drinks and tips, approval stays the precondition: a receipt the agency has
 * not reviewed is still the PR's own claim, with no stated figure to argue with.
 *
 * `disputable` is preferred over reading `receiptStatus` because the server
 * computes it from the same rule it enforces. The status check is the fallback
 * for a response from an older build that predates the field.
 */
const DISPUTABLE_KINDS: PrReceiptLine['kind'][] = ['drinks', 'tips'];

/**
 * Can this KIND of money ever be contested, whatever the day or the receipt?
 *
 * Wages and OT never can: they are DERIVED from the attendance stamps and the
 * shift rate, so the fix for a wrong one is the shift record, not an argument
 * about the total. The server refuses them outright (`DISPUTABLE_KINDS` in
 * payment-voucher-component.ts), so any control offering it is a button that
 * cannot work.
 *
 * Split out from `cellDisputable` because a UI often needs the answer BEFORE it
 * has a day or a week — deciding whether to render a dispute action at all.
 * Do not re-inline the array at a call site; one client-side copy of a
 * server-enforced rule is already one more than ideal.
 */
export function kindDisputable(kind: GridBucket): boolean {
  // Takes a GRID BUCKET, not a kind, so the Deductions row can ask the same
  // question every other row asks and get a plain no. A fine is argued with the
  // agency that recorded it, not through a claim against a voucher line.
  return DISPUTABLE_KINDS.includes(kind as PrReceiptLine['kind']);
}

/**
 * Voucher states a PR may still contest — the exact mirror of the server's
 * `DISPUTABLE_STATUSES` (payment-voucher.controller.ts).
 *
 * NOTE `pending_review`: the CURRENT week qualifies. Disputes are not a
 * last-week-only affair, and gating the button on "which tab am I on" was wrong
 * — a PR whose approved drinks are already wrong today should say so today,
 * while the paper is still in their pocket, not wait for Sunday.
 *
 * `signed` and `paid` are absent on purpose: the PR has put their name to it, or
 * the money has moved.
 */
const DISPUTABLE_VOUCHER_STATUSES = ['pending_review', 'sent', 'disputed'];

/**
 * Is there an issued-enough voucher here to argue with at all?
 *
 * False with no voucher id: nothing exists to attach a claim to, and the server
 * would 404. The kind and the receipt's review state are separate tests —
 * `kindDisputable` and `cellDisputable` — and all three have to pass.
 */
export function weekDisputable(
  week: PrCurrentWeek | null,
  /**
   * Narrow to ONE voucher. Omit it to ask the WEEK — "is any voucher in it still
   * arguable?" — which is the right question for an affordance that has not
   * resolved a cell yet. A cell that HAS resolved must pass its own id, or it
   * inherits the other agency's answer.
   */
  voucherId?: string | null,
): boolean {
  if (!week) return false;
  /*
   * ⚠️ THIS READ `week.status` — the NEWEST voucher's, not this cell's.
   *
   * Since 0129 a PR on two rosters holds one voucher PER AGENCY for one week and
   * `PrCurrentWeek` merges them, so `status` is a HEADLINE (see its doc comment
   * in api.ts: "They are a headline, not the week"). With Atlas `signed`
   * arriving newest and Why We Met still `pending_review`, this answered false
   * for the whole week: the Flag glyph became the inspect glyph on every cell
   * and the evidence sheet's Dispute button vanished — for the agency whose
   * voucher the server would happily have accepted a claim against. It is the
   * same shape as the sign lane's fix, which already carries the note that "the
   * whole week read as un-reviewable and the PR was never offered Atlas's
   * document at all".
   *
   * `some`, never `every`: an affordance must not be withheld because SOME OTHER
   * agency's document is closed. Precision comes one step later, from
   * `voucherOwning` naming the cell's voucher and passing it here.
   */
  const rows = week.vouchers ?? [];
  if (rows.length > 0) {
    const scoped = voucherId ? rows.filter((v) => v.id === voucherId) : rows;
    return scoped.some(
      (v) => !!v.status && DISPUTABLE_VOUCHER_STATUSES.includes(v.status),
    );
  }
  // No `vouchers` at all = a backend that has not restarted, where the headline
  // IS the only voucher and the old behaviour was already right.
  if (!week.voucherId || !week.status) return false;
  return DISPUTABLE_VOUCHER_STATUSES.includes(week.status);
}

/**
 * A `withdrawn` claim is one the PR took back — it never reached a decision, so
 * it must not colour the day either red (still arguing) or green (settled). It
 * is simply gone, and the day goes back to whatever the agency's review says.
 */
function isLive(d: PrWeekDispute): boolean {
  return d.outcome !== 'withdrawn';
}

/** The PR's claims on one day, split by whether anybody has answered them. */
export function disputesForDay(
  week: PrCurrentWeek | null,
  dateIso: string,
): { open: PrWeekDispute[]; settled: PrWeekDispute[] } {
  const all = (week?.disputes ?? []).filter(
    (d) => d.disputeDate === dateIso && isLive(d),
  );
  return {
    open: all.filter((d) => d.outcome === null),
    settled: all.filter((d) => d.outcome !== null),
  };
}

/**
 * The reasons a PR can actually hit — and only those.
 *
 * Lives here, not in a screen, because TWO screens raise disputes (Payment and
 * the voucher document) and each had its own copy. Two lists that must agree is
 * how they drift: the PR would meet different reasons depending on where they
 * tapped, and the agency would receive both vocabularies.
 *
 * The old list predated disputes narrowing to drinks and tips, and it showed —
 * **"Unmatch wages" could never be filed at all**, because wages are not
 * disputable (`kindDisputable`) so the sheet never opens for them. A chip that
 * leads nowhere is worse than a missing one: the PR picks it believing they have
 * described their problem, and they have not.
 *
 * The replacements are failures this app has actually produced:
 *
 * - COUNTED TWICE — the duplicate ORD0389, one paper scanned across two
 *   check-ins, which is why the receipt guard exists at all.
 * - WRONG QUANTITY — OCR reading "2 Havoc" as one, the fault the receipt parser
 *   was rebuilt around. Previously unsayable: a PR could only call it "unmatch
 *   commission" and leave the agency to work out why.
 * - MISSING FROM MY PV — logged, and not on the voucher.
 * - WRONG RATE — right per item, wrong percentage. A rate-card question, not a
 *   receipt one, and it lands somewhere different.
 * - NOT MY SHIFT — money attributed to the wrong person or night.
 *
 * Short enough to read on a chip; the note underneath carries the detail.
 */
export const DISPUTE_PRESETS = [
  'Wrong commission',
  'Wrong quantity',
  'Counted twice',
  'Missing from my PV',
  'Wrong rate',
  'Not my shift',
  'Others',
] as const;

export type DisputePreset = (typeof DISPUTE_PRESETS)[number];

/**
 * The CHIP a PR reads, for each preset they can pick.
 *
 * ⚠️ The record KEYS above are DATA and stay English: the chosen preset is
 * posted verbatim as the dispute's `reason` (PaymentScreen → `reason:
 * disputePreset`), and the agency reads it in the web portal. Translating the
 * VALUE would send the agency a reason in a language they did not pick, and
 * would break any grouping the portal does on it. Only the label moves.
 *
 * Resolvers, not strings — module scope runs before any hook, so a plain map
 * would freeze whichever locale loaded first. Call it as
 * `DISPUTE_PRESET_LABELS[preset](t)` inside a component.
 */
export const DISPUTE_PRESET_LABELS: Record<
  DisputePreset,
  (t: AppTranslations) => string
> = {
  'Wrong commission': (t) => t.receipt.presetWrongCommission,
  'Wrong quantity': (t) => t.receipt.presetWrongQuantity,
  'Counted twice': (t) => t.receipt.presetCountedTwice,
  'Missing from my PV': (t) => t.receipt.presetMissingFromPv,
  'Wrong rate': (t) => t.receipt.presetWrongRate,
  'Not my shift': (t) => t.receipt.presetNotMyShift,
  Others: (t) => t.receipt.presetOthers,
};

/** How a claim ended. `withdrawn` never reaches here — `isLive` drops it. */
export type SettledOutcome = 'accepted' | 'rejected';

/**
 * Per-receipt claim state for one day+bucket.
 *
 * `settled` is a MAP, not a set, because "resolved" is not one state: a PR needs
 * to know whether their claim was ACCEPTED or REJECTED. A single "settled" tag
 * answered "has this been dealt with?" while leaving "and what was decided?"
 * unanswered — which is most of what they wanted to know.
 *
 * `settledAll` carries the outcome for the same reason, and is null when no
 * whole-day claim has been answered.
 */
export type ReceiptClaimState = {
  openAll: boolean;
  settledAll: SettledOutcome | null;
  open: Set<string>;
  settled: Map<string, SettledOutcome>;
};

/**
 * Which RECEIPT on this day+bucket is under argument, and how.
 *
 * A claim that named no receipts covers the whole cell — the PR did not narrow
 * it — so `coversAll` is true and every receipt in the bucket is contested.
 * Otherwise only the named `receiptNo`s are.
 *
 * `open` is what the sheet marks red; `settled` still gets a mark, because "this
 * one was already argued and answered" is exactly what stops a PR raising the
 * same claim twice and wondering why nothing happens.
 */
export function receiptClaimState(
  week: PrCurrentWeek | null,
  dateIso: string,
  // A GRID BUCKET, for the same reason as `kindDisputable`. 'deductions' is
  // never a dispute's `component`, so it matches nothing and the empty state
  // falls out of the existing filter rather than needing a special case.
  component: GridBucket,
): ReceiptClaimState {
  const rows = (week?.disputes ?? []).filter(
    (d) => d.disputeDate === dateIso && d.component === component && isLive(d),
  );
  const state: ReceiptClaimState = {
    openAll: false,
    settledAll: null,
    open: new Set<string>(),
    settled: new Map<string, SettledOutcome>(),
  };
  for (const d of rows) {
    const isOpen = d.outcome === null;
    // FK first; the receipt NUMBERS are the pre-0088 path.
    const refs = d.receiptId ? [d.receiptId] : (d.receiptRefs ?? []);
    if (refs.length === 0) {
      if (isOpen) state.openAll = true;
      else state.settledAll = (d.outcome as SettledOutcome) ?? 'accepted';
      continue;
    }
    for (const ref of refs) {
      if (isOpen) state.open.add(ref);
      else state.settled.set(ref, (d.outcome as SettledOutcome) ?? 'accepted');
    }
  }
  return state;
}

/**
 * `${date}-${component}` for every OPEN claim — the keys the grid paints RED.
 *
 * Derived from the server rather than accumulated in React state, which is why
 * a disputed cell now survives a reload. The in-session set is still merged on
 * top so the cell reddens the instant the PR submits, without waiting for a
 * refetch.
 */
export function openDisputeKeys(week: PrCurrentWeek | null): Set<string> {
  return new Set(
    (week?.disputes ?? [])
      .filter((d) => d.outcome === null)
      .map((d) => `${d.disputeDate}-${d.component}`),
  );
}

/**
 * What the Status cell should read for one day.
 *
 * The lifecycle the owner described, in order of precedence:
 *
 *   PENDING  → nobody has looked
 *   APPROVED → the agency signed the day off
 *   DISPUTED → the PR contested it, and it is still open
 *   VERIFIED → that claim was ANSWERED — the figure was questioned and settled,
 *              which is a stronger statement than merely approved
 *
 * An open claim outranks everything: a day the agency approved on Tuesday and
 * the PR contested on Wednesday is DISPUTED, not APPROVED, because the approval
 * is exactly what is being argued with.
 */
export type DayStatusLabel =
  'PENDING' | 'APPROVED' | 'DISPUTED' | 'VERIFIED' | 'DEDUCTED' | '—';

/**
 * The Status pill's TEXT for each `dayStatusLabel()` answer.
 *
 * ⚠️ The record KEYS — and `dayStatusLabel`'s return — stay English because
 * they are DATA: PaymentScreen tests `label === 'VERIFIED'` / `'DISPUTED'` /
 * `'APPROVED'` / `'DEDUCTED'` to pick the pill's colour, and the project's
 * status colour code (green settled, amber waiting, white mixed, red disputed)
 * is fixed. Translate the pill, never the value it is chosen by.
 *
 * '—' resolves to itself: an em dash is the same glyph in every locale.
 *
 * Resolvers rather than strings, for the module-scope reason above.
 */
export const DAY_STATUS_LABELS: Record<
  DayStatusLabel,
  (t: AppTranslations) => string
> = {
  PENDING: (t) => t.receipt.statusPending,
  APPROVED: (t) => t.receipt.statusApproved,
  DISPUTED: (t) => t.receipt.statusDisputed,
  VERIFIED: (t) => t.receipt.statusVerified,
  DEDUCTED: (t) => t.receipt.statusDeducted,
  '—': () => '—',
};

/**
 * THIS WEEK tops out at APPROVED — VERIFIED is earned, not granted.
 *
 * `buildWeekGridFromLines` calls a day `verified` as soon as the VOUCHER reaches
 * a processed status (`sent`, `awaiting_pr`, `signed`, `paid`). Fine for a closed
 * week; wrong for a live one. Resolving a single dispute SENDS the voucher, so on
 * 5 Aug one settled claim about Tuesday's drinks flipped **Monday** to VERIFIED
 * too — a day the PR had never disputed and nobody had said anything new about.
 *
 * Owner's rule: *"in this week section all approved, after dispute make then only
 * verified"*. On the live week the voucher's own status cannot promote a day: the
 * agency's day sign-off gives APPROVED, and only a claim raised AND answered
 * gives VERIFIED. The Last-week card keeps the opposite mapping
 * (`approved → verified`), because a closed week's sign-off is final.
 */
export function thisWeekDayStatus(gridStatus: DayGridStatus): DayGridStatus {
  // 'deducted' passes straight through: it is not a review stage, so there is
  // no weaker form of it for a live week to fall back to.
  return gridStatus === 'verified' ? 'approved' : gridStatus;
}

export function dayStatusLabel(
  week: PrCurrentWeek | null,
  dateIso: string,
  gridStatus: DayGridStatus,
  extraOpen = false,
): DayStatusLabel {
  if (gridStatus === 'empty') return '—';
  /*
   * Before the dispute tests, because a fine is not disputable here and the
   * charge is already final. Only reached when the day holds nothing BUT
   * deductions (`buildWeekGridFromLines`), so this cannot silence a claim about
   * a worked shift sharing the date.
   */
  if (gridStatus === 'deducted') return 'DEDUCTED';
  const { open, settled } = disputesForDay(week, dateIso);
  if (open.length > 0 || extraOpen) return 'DISPUTED';
  if (settled.length > 0) return 'VERIFIED';
  return gridStatus === 'pending'
    ? 'PENDING'
    : gridStatus === 'approved'
      ? 'APPROVED'
      : 'VERIFIED';
}

export function cellDisputable(
  week: PrCurrentWeek | null,
  dateIso: string,
  kind: PrReceiptLine['kind'],
): boolean {
  if (!DISPUTABLE_KINDS.includes(kind)) return false;
  const lines = (week?.lines ?? []).filter(
    (line) => line.lineDate === dateIso && line.kind === kind,
  );
  if (lines.length === 0) return true;
  return lines.every((line) =>
    line.disputable !== undefined
      ? line.disputable
      : line.receiptStatus !== 'pending',
  );
}

/**
 * True once the agency has reviewed the line — at which point it stops being the
 * PR's to edit or delete. Used to hide those controls rather than let the server
 * refuse them: the buttons were the only thing saying the row was still theirs.
 */
export function isReceiptLocked(line: PrReceiptLine): boolean {
  return line.receiptStatus === 'approved' || line.receiptStatus === 'verified';
}
