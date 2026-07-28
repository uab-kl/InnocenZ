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
  const [kind] = ref.split(REF_SEP);
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
