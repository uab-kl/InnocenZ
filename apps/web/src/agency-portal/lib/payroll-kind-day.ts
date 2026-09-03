import type {
	AgencyReceipt,
	AgencyReceiptLine,
	DisputeComponent,
} from "@/services/payment-voucher";

/**
 * WHICH MONEY, ON WHICH NIGHT — the two questions the Payroll page's Receipts
 * feed and Dispute queue are both narrowed by, answered in one module.
 *
 * Owner, 3 Sep 2026: *"in the agency payroll page receipt and the disputes
 * section make the user can see and select the drinks or tips or both on which
 * date"*. Five dispute cards for one PR on one night read "· Tips", "· Drinks",
 * "· Tips", "· Drinks", "· Tips" and were otherwise identical; two receipts on
 * the same night each read "3 items" and said nothing about what was in them.
 * Neither screen could be asked "just the tips, just Thursday".
 *
 * It lives here rather than in either panel for the reason `receipt-disputes.ts`
 * and `receipt-status.ts` were pulled out before it: the agency reads both
 * screens while deciding the same money, and two private copies of "does this
 * receipt have tips on it" is how a chip comes to disagree with the list under
 * it.
 */

/**
 * The two buckets that can be selected.
 *
 * Deliberately NOT the four of `DisputeComponent`. Wages and overtime are
 * derived from the check-in stamps and the shift's rate — the agency cannot add
 * them, the PR cannot dispute them, and the fix for a wrong one is the
 * attendance record. They are money you look at, not money you argue about, so
 * they are not offered as a filter; the panels state how many they hide instead
 * of dropping them silently. Same pair, and the same order, as the backend's own
 * `DISPUTABLE_KINDS`.
 */
export const MONEY_KINDS = ["drinks", "tips"] as const;
export type MoneyKind = (typeof MONEY_KINDS)[number];

/**
 * What the reviewer has picked.
 *
 * EMPTY IS NOT "NOTHING" — it is "no kind filter", the screen as it was before
 * this existed. Selecting both is a third, genuinely different answer: it means
 * drinks and tips and NOT wages or others, which is the question "show me every
 * commission line this week" and could not be asked any other way.
 */
export type KindSelection = readonly MoneyKind[];

/** Add or remove one bucket, keeping `MONEY_KINDS` order so the chips never reorder. */
export function toggleKind(
	selection: KindSelection,
	kind: MoneyKind,
): MoneyKind[] {
	return MONEY_KINDS.filter((k) =>
		k === kind ? !selection.includes(k) : selection.includes(k),
	);
}

/**
 * Every day of the payroll week on screen, earliest first — including the ones
 * nobody worked.
 *
 * The empty nights are the point. A row that only listed days with money would
 * re-flow every time a bucket is toggled, and a reviewer scanning for "did
 * anything happen on Tuesday" would have to infer the answer from a gap. Seven
 * chips that never move, some of them plainly empty, answer it by being read.
 *
 * UTC arithmetic, not local: `setDate` on a local Date crossing a DST boundary
 * shifts the clock rather than the calendar, and would return one day twice or
 * skip one. Capped so a malformed range cannot spin.
 */
export function weekDays(weekStartIso: string, weekEndIso: string): string[] {
	const start = new Date(`${weekStartIso}T00:00:00Z`);
	if (Number.isNaN(start.getTime())) return [];
	const days: string[] = [];
	const cursor = new Date(start);
	for (let i = 0; i < 14; i += 1) {
		const iso = cursor.toISOString().slice(0, 10);
		if (iso > weekEndIso) break;
		days.push(iso);
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return days;
}

/**
 * Which buckets this receipt's lines actually sit in.
 *
 * Read off `line.kind`, which the server sets on every line of the feed
 * (`lineKind`, payment-voucher.controller) from the packed ref or the classified
 * `component` column. It is optional on the client type ONLY so a response from
 * a backend that has not restarted still parses — such a line lands in no bucket
 * here, which is honest: an unclassified line is not evidence that it is a drink.
 */
export function receiptKinds(receipt: AgencyReceipt): Set<string> {
	const kinds = new Set<string>();
	for (const line of receipt.lines) if (line.kind) kinds.add(line.kind);
	return kinds;
}

/**
 * Does this feed carry buckets at all?
 *
 * The same shape as `receiptsForDispute`'s `serverAnswered` test, for the same
 * reason: against a backend that predates `line.kind` every receipt would fall
 * out of every bucket, and the filter would read as "this week had no drinks and
 * no tips" rather than "this build cannot tell". The strip says which.
 */
export function anyLineClassified(receipts: AgencyReceipt[]): boolean {
	return receipts.some((r) => r.lines.some((l) => Boolean(l.kind)));
}

/**
 * A receipt is IN when any one of its lines is in a selected bucket.
 *
 * ANY, not every: a receipt is one piece of paper and routinely carries both —
 * two drinks and a tip on one order. Asking for tips has to reach that paper, or
 * the tip on it is unreviewable.
 */
export function receiptMatchesKinds(
	receipt: AgencyReceipt,
	kinds: KindSelection,
): boolean {
	if (kinds.length === 0) return true;
	const own = receiptKinds(receipt);
	return kinds.some((k) => own.has(k));
}

const lineAmount = (line: AgencyReceiptLine) => Number(line.amount || 0);

/** Every line's money — the receipt's own total, whatever is selected. */
export function receiptTotal(receipt: AgencyReceipt): number {
	return receipt.lines.reduce((sum, l) => sum + lineAmount(l), 0);
}

/**
 * What this receipt contributed to the SELECTED buckets — not its whole total.
 *
 * The same shape as the dispute queue's `disputedSubtotal`, and for the same
 * reason: once a reviewer has asked for tips, the number they are checking is
 * the tips number, and printing the receipt total beside a tips question is how
 * a RM 190 receipt gets read as RM 190 of tips.
 */
export function receiptKindTotal(
	receipt: AgencyReceipt,
	kinds: KindSelection,
): number {
	if (kinds.length === 0) return receiptTotal(receipt);
	return receipt.lines
		.filter((l) => l.kind && (kinds as readonly string[]).includes(l.kind))
		.reduce((sum, l) => sum + lineAmount(l), 0);
}

/** A claim is IN when the bucket it contests is selected. */
export function disputeMatchesKinds(
	dispute: { component: DisputeComponent },
	kinds: KindSelection,
): boolean {
	if (kinds.length === 0) return true;
	return (kinds as readonly string[]).includes(dispute.component);
}

/**
 * The order the four buckets are named in everywhere — the `money` namespace's
 * own order, which is also the PR app's. A receipt listing tips above drinks on
 * one screen and below them on another makes two readings of one paper look like
 * two papers.
 */
export const KIND_ORDER = ["drinks", "tips", "wages", "others"] as const;

export interface KindGroup {
	kind: string;
	lines: AgencyReceiptLine[];
	total: number;
}

/**
 * A receipt's lines split into their buckets, in `KIND_ORDER`, with a subtotal
 * each.
 *
 * This is the "see" half of the owner's ask. A flat list under "3 items" cannot
 * be read as "RM 90 of drinks and RM 100 of tips" without adding it up by hand —
 * which is exactly the sum a reviewer is checking against the paper.
 *
 * Lines the server did not classify are grouped under `""` and kept LAST rather
 * than dropped: a line with no bucket is still money on the receipt, and a total
 * that quietly excluded it would not reconcile against the printed one.
 */
export function groupLinesByKind(lines: AgencyReceiptLine[]): KindGroup[] {
	const byKind = new Map<string, AgencyReceiptLine[]>();
	for (const line of lines) {
		const key = line.kind ?? "";
		byKind.set(key, [...(byKind.get(key) ?? []), line]);
	}
	const rank = (k: string) => {
		const i = (KIND_ORDER as readonly string[]).indexOf(k);
		return i === -1 ? KIND_ORDER.length : i;
	};
	return [...byKind.entries()]
		.sort((a, b) => rank(a[0]) - rank(b[0]))
		.map(([kind, group]) => ({
			kind,
			lines: group,
			total: group.reduce((sum, l) => sum + lineAmount(l), 0),
		}));
}
