import type { PaymentVoucherComponent } from './payment-voucher.model';
import { resolveComponent } from './payment-voucher-component';
import { klToday } from './payment-voucher-week';

/**
 * THE CHECK-OUT PROOF RULE, ON THE SERVER.
 *
 * Owner, 4 Aug 2026: *"before check out need upload the receipt picture"* —
 * every drink or tip the PR logged on the shift must carry its picture, or the
 * shift may not close. Until 28 Sep 2026 that rule lived ONLY in the phone
 * (`CheckInScreen.tsx` `linesMissingPhoto` → `checkOutBlock`), so any caller
 * that skipped the screen — an older build, a retried request, a script —
 * closed the shift with photo-less commission on it.
 *
 * Deliberately NO STRICTER than the phone, so an app that passes its own gate
 * is never refused here: the same day window (check-in day through today), the
 * same "written after check-in", the same photo fallback (a line inherits its
 * receipt's picture, as `toReceiptLineDTO` shows it). It is a little more
 * lenient on one point — a deduction line is the agency's entry, not the PR's
 * action, and the phone wrongly asks for its photo (TEST_SCRIPT §9).
 *
 * Pure, so the rule is unit-tested rather than probed against the database.
 */

const REF_SEP = '|';

/** Not a PR action: the shift's own wage, its overtime, the agency's fines. */
const NOT_AN_ACTION: ReadonlySet<PaymentVoucherComponent> = new Set([
  'wages',
  'ot',
  'deduction',
]);

export type ProofCheckLine = {
  id: string;
  ref: string | null;
  component: PaymentVoucherComponent | null;
  proofPhotos: string[] | null;
  receiptPhotos: string[] | null;
};

/** The capture source packed into a line's ref (`kind|source|sales|dedupe|…`). */
function sourceOf(ref: string | null): string {
  return (ref ?? '').split(REF_SEP)[1] ?? '';
}

/** Is this line something the PR logged, and therefore owes a picture for? */
export function lineNeedsProof(line: ProofCheckLine): boolean {
  if (sourceOf(line.ref) === 'checkin') return false;
  const component = resolveComponent(line);
  return !(component && NOT_AN_ACTION.has(component));
}

export function lineHasProof(line: ProofCheckLine): boolean {
  return (line.proofPhotos?.length ?? 0) > 0 || (line.receiptPhotos?.length ?? 0) > 0;
}

/** The ids of the lines that block check-out. */
export function linesMissingProof(lines: readonly ProofCheckLine[]): string[] {
  return lines.filter((l) => lineNeedsProof(l) && !lineHasProof(l)).map((l) => l.id);
}

/**
 * The Kuala Lumpur calendar days a shift has touched: the check-in day through
 * today. An overnight shift checked out after midnight spans two, and its
 * after-midnight drinks are dated the second — the phone's `shiftDayKeysFor`.
 */
export function shiftDayWindow(checkInAt: Date, now: Date = new Date()): {
  fromDate: string;
  toDate: string;
} {
  const fromDate = klToday(checkInAt);
  const toDate = klToday(now);
  return fromDate <= toDate ? { fromDate, toDate } : { fromDate: toDate, toDate: fromDate };
}

/** The refusal, worded for the PR — or null when the shift may close. */
export function checkOutProofRefusal(missing: number): string | null {
  if (missing <= 0) return null;
  return (
    `${missing} logged item${missing === 1 ? ' has' : 's have'} no receipt picture. ` +
    'Re-scan or remove ' +
    (missing === 1 ? 'it' : 'them') +
    ' before checking out — once the shift closes, that commission cannot be claimed.'
  );
}
