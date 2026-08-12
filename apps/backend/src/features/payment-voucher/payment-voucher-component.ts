import { PaymentVoucherComponent } from './payment-voucher.model';

/**
 * Classifies a voucher line into its money bucket.
 *
 * The classification already exists in the data — a PR-logged line packs its
 * `kind` as the first field of `ref` (see encodeRef in the controller) — it was
 * simply never written to the typed column. So this derives rather than guesses,
 * and returns undefined when the ref carries nothing to derive from. NULL means
 * "unclassified", which is honest and distinguishable from a genuine 'other'.
 *
 * REF_SEP is duplicated from payment-voucher.controller.ts on purpose: that
 * module owns encoding and is not importable here without a cycle. Same
 * deliberate duplication as paymentVoucherDisputeComponentValues in the model —
 * if the separator changes, change it in both places.
 */
const REF_SEP = '|';

/** `prReceiptKindValues` -> the PG enum. Anything unlisted stays unclassified. */
const COMPONENT_BY_KIND: Readonly<Record<string, PaymentVoucherComponent>> = {
  wages: 'wages',
  drinks: 'drink_commission',
  tips: 'tip_commission',
  others: 'other',
};

/**
 * A packed ref looks like `kind|source|sales|dedupe|category`. The weekly
 * generator instead writes a bare shift-assignment id, which has no separator —
 * that case returns undefined and the generator sets 'wages' explicitly.
 */
export function componentFromRef(
  ref: string | null | undefined,
): PaymentVoucherComponent | undefined {
  if (!ref || !ref.includes(REF_SEP)) return undefined;
  const [kind, , , dedupe] = ref.split(REF_SEP);
  // Overtime is logged with the coarse kind 'others', so the kind alone would
  // bucket a whole night's OT as 'other'. The phone marks it explicitly —
  // `dedupeRef: ${assignmentId}-ot` in mobile CheckInScreen — and that marker is
  // checked first because it is the more specific fact. 'ot' is a real value of
  // the enum that nothing else writes.
  if (dedupe?.endsWith('-ot')) return 'ot';
  // Same trick, opposite direction of money: a recorded penalty is also logged
  // with the coarse kind 'others', so without this marker every fine would read
  // as 'other' and a voucher's deductions would be indistinguishable from its
  // odds and ends. `penaltyDedupeRef` in penalty-line.ts writes the suffix.
  if (dedupe?.endsWith('-pen')) return 'deduction';
  return COMPONENT_BY_KIND[kind];
}

/**
 * The line's classification as a READER should see it: the typed column when it
 * has one, otherwise derived from the ref.
 *
 * The column is authoritative — `withDerivedComponent` fills it on insert, so
 * every line written since it landed carries one. The ref fallback is for rows
 * predating that, which would otherwise report themselves unclassified and let
 * a real deduction read as ordinary 'other' money. Null stays null: a line with
 * neither is honestly unknown, and a caller must not round that up to 'other'.
 *
 * Pairs with `withDerivedComponent` (the write side) so the two directions
 * cannot disagree about what a `-pen` ref means.
 */
export function resolveComponent(line: {
  component?: PaymentVoucherComponent | null;
  ref?: string | null;
}): PaymentVoucherComponent | null {
  return line.component ?? componentFromRef(line.ref) ?? null;
}

/**
 * The reverse of `COMPONENT_BY_KIND`, for READING a line whose ref carries no
 * packed kind.
 *
 * The weekly generator writes `ref = <shift assignment id>` and sets
 * `component: 'wages'` explicitly, so for those lines the classification lives in
 * the column and nowhere else. Deriving a PR-facing bucket from the ref alone put
 * every generated wage line in "Others" and reported daily wages as RM 0.00 — on
 * the Payment grid, History → Shifts and History → Payment at once.
 *
 * `ot` and `deduction` map to 'others' because the PR-facing split has only four
 * buckets; that is the same coarse bucket the phone already logs overtime under.
 */
const KIND_BY_COMPONENT: Readonly<Record<PaymentVoucherComponent, string>> = {
  wages: 'wages',
  drink_commission: 'drinks',
  tip_commission: 'tips',
  ot: 'others',
  deduction: 'others',
  other: 'others',
};

/**
 * The PR-facing bucket for a classified line, or undefined when the column is
 * NULL (a row written before classification — honestly unknown, not 'others').
 */
export function kindFromComponent(
  component: PaymentVoucherComponent | null | undefined,
): string | undefined {
  return component ? KIND_BY_COMPONENT[component] : undefined;
}

/**
 * The only two buckets a PR may contest.
 *
 * OWNER DECISION (4 Aug 2026): *"the pr only can dispute for the drinks and the
 * tips … Other (OT), Daily wages cannot disputed"*. This REVERSES the 30 Jul
 * rule that wages were always disputable, and the reversal has a cost worth
 * recording: a wrong wage or overtime figure now has no in-app route to contest
 * at all. The reasoning behind the new rule is that wages and OT are not
 * CLAIMED, they are DERIVED — from the check-in/check-out stamps and the shift's
 * rate — so the way to fix one is to fix the attendance record it was computed
 * from, not to argue with the total afterwards.
 *
 * `others` covers OT **and** deductions (see KIND_BY_COMPONENT), so a deduction
 * is not disputable either. That follows the instruction as given; if a
 * deduction ever needs contesting it should get its own bucket rather than
 * quietly re-opening OT.
 */
export const DISPUTABLE_KINDS = ['drinks', 'tips'] as const;

/**
 * May this line be contested?
 *
 * ONE function, called by the DTO the app reads AND by the endpoint that
 * refuses — a client copy of a rule is never the rule, and the two disagreeing
 * is exactly how a PR gets offered a button that 409s.
 *
 * For drinks and tips, approval remains the precondition: until the agency has
 * reviewed the receipt there is no stated figure to argue with, only the PR's
 * own submission. A drinks/tips line with NO receipt (`null`) stays disputable —
 * nothing is pending, and the figure is the agency's own, typed by them.
 */
export function lineDisputable(
  kind: string | undefined,
  receiptStatus: 'pending' | 'approved' | 'verified' | null | undefined,
): boolean {
  if (!kind || !(DISPUTABLE_KINDS as readonly string[]).includes(kind)) return false;
  return receiptStatus !== 'pending';
}

/**
 * Does this ref carry a packed `kind|source|sales|dedupe|category`?
 *
 * The one test that separates a PR self-log or receipt line (packed, so the ref
 * is authoritative) from a generated wage line (a bare assignment id, so the
 * `component` column is).
 */
export function refPacksKind(ref: string | null | undefined): boolean {
  return Boolean(ref?.includes(REF_SEP));
}

/**
 * Fills in `component` on a line about to be inserted, without ever overwriting
 * one the caller set deliberately. Applied in the repository so every write path
 * — weekly generator, agency create/update, PR self-log, receipt import — is
 * classified by one rule instead of four.
 */
export function withComponent<
  T extends { ref?: string | null; component?: PaymentVoucherComponent | null },
>(line: T): T {
  if (line.component) return line;
  const derived = componentFromRef(line.ref);
  return derived ? { ...line, component: derived } : line;
}

/** Commission is only ever earned against a scanned receipt, so these two must
 * carry one. `wages` and `ot` come from the shift and the check-out clock and
 * are correctly receipt-free. */
const RECEIPT_BACKED_COMPONENTS: ReadonlySet<PaymentVoucherComponent> = new Set([
  'drink_commission',
  'tip_commission',
]);

/**
 * Enforces the invariant that a commission line references the receipt it was
 * earned on. The outlet pays commission on ALL sales but a PR earns only on
 * scanned receipts, so an unbacked commission line is money with nothing behind
 * it.
 *
 * This is a tripwire, not a validation path: every commission line written since
 * migration 0053 added `receipt_id` already carries one (verified 28 Jul 2026 —
 * 100% coverage after the column landed, 0% before it). The 12 pre-0053 lines are
 * left as historical data; this only guards new writes. It throws rather than
 * dropping the line, because silently discarding a money row is the worse
 * failure. If a client ever needs this as a user-facing 400 instead of a logged
 * 500, map it in the controller.
 *
 * Known gap it does NOT fix: PaymentVoucherLineSchema carries no `receiptId`, so
 * a PUT that supplies `lines` would strip the FK on every existing line. Nothing
 * sends `lines` today (the only caller patches `{ status }`), and with this guard
 * such a request fails loudly instead of silently orphaning receipts.
 */
export function assertReceiptBacked<
  T extends { component?: PaymentVoucherComponent | null; receiptId?: string | null },
>(line: T): T {
  if (line.component && RECEIPT_BACKED_COMPONENTS.has(line.component) && !line.receiptId) {
    throw new Error(
      `Refusing to write a ${line.component} line with no receipt behind it — ` +
        'commission is earned against a scanned receipt.',
    );
  }
  return line;
}

/**
 * The single rule every voucher-line insert goes through: classify, then check
 * the classification is backed. Applied in the repository so all four write paths
 * — weekly generator, agency create/update, PR self-log, receipt import — share
 * one rule instead of four.
 */
export function prepareLine<
  T extends {
    ref?: string | null;
    component?: PaymentVoucherComponent | null;
    receiptId?: string | null;
  },
>(line: T): T {
  return assertReceiptBacked(withComponent(line));
}
