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
  return COMPONENT_BY_KIND[kind];
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
