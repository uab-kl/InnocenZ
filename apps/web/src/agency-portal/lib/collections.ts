import { format, parseISO } from "date-fns";
import type { CollectionInvoice } from "@/services/collection-invoice";

/**
 * Shared between the agency's receivables section and the outlet's payables
 * section. Both render the same table from opposite ends, so the money maths and
 * the labels live in one place — the two sides disagreeing about a total or an
 * aging bucket is exactly the argument this feature exists to prevent.
 */

/**
 * Summed in integer cents rather than by adding the floats.
 *
 * `amount` arrives as the string `numeric(12,2)` serializes to, so the choice is
 * deliberate: this is the same arithmetic the voucher Σ=0 check exists to catch on
 * the other side of the money loop, and a collections figure is one that someone
 * gets chased for.
 */
export function sumCollectionRm(invoices: CollectionInvoice[]): number {
	const cents = invoices.reduce((total, invoice) => {
		const parsed = Math.round(Number(invoice.amount) * 100);
		return total + (Number.isFinite(parsed) ? parsed : 0);
	}, 0);
	return cents / 100;
}

/** `numeric` is a string over the wire; every display path needs a number. */
export function collectionAmountRm(invoice: CollectionInvoice): number {
	const parsed = Number(invoice.amount);
	return Number.isFinite(parsed) ? parsed : 0;
}

/** "20–26 Jul 2026", collapsing the month when both ends share one. */
export function collectionWeekLabel(startIso: string, endIso: string): string {
	const start = parseISO(startIso);
	const end = parseISO(endIso);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
		return `${startIso} – ${endIso}`;
	}
	return start.getMonth() === end.getMonth()
		? `${format(start, "d")}–${format(end, "d MMM yyyy")}`
		: `${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}`;
}

/**
 * "27 Jul" for an `issuedAt` / `settledAt` stamp. Returns "" for a null or
 * unparseable timestamp so a caller can concatenate without guarding — both
 * columns are genuinely null before their transition happens.
 *
 * Deliberately date-only: the exact minute an invoice changed state is noise on a
 * weekly statement, and it is stored if anyone ever needs it.
 */
export function collectionStampLabel(iso: string | null): string {
	if (!iso) return "";
	const at = parseISO(iso);
	return Number.isNaN(at.getTime()) ? "" : format(at, "d MMM");
}

export const COLLECTION_AGING_PILL: Record<
	string,
	{ variant: "green" | "amber" | "red"; label: string }
> = {
	current: { variant: "green", label: "Current" },
	due_soon: { variant: "amber", label: "Due soon" },
	overdue: { variant: "red", label: "Overdue" },
};
