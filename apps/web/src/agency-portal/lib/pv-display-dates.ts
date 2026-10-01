import {
	type PrPaymentVoucher,
	resolvePvPayByDue,
} from "@agency-portal/lib/pr-demo";
import { dayMonthLabel } from "@/lib/portal-i18n/date-label";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-09-20" → "20 Sep 2026" in the reader's language; null for anything else. */
function isoDayLabel(value: string, t: PortalTranslations): string | null {
	const m = ISO_DAY.exec(value.trim());
	if (!m) return null;
	// Built from the parts as a LOCAL date: a bare `new Date("2026-09-20")` is
	// UTC midnight, which Kuala Lumpur reads as the day before.
	const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
	if (Number.isNaN(date.getTime())) return null;
	return `${dayMonthLabel(date, t)} ${m[1]}`;
}

/**
 * THE ISSUED AND PAY-BY DATES A VOUCHER PRINTS — "—" when it has none.
 *
 * A BACKEND voucher carries both as `YYYY-MM-DD` columns, and the card printed
 * them raw, or as nothing at all: `issued` blank beside the word "Issued", and
 * `resolvePvPayByDue` — a DEMO formula (pay-by Wednesday, 14 days after issue)
 * that can only parse the demo's own "10 May 2026" strings — silently falling
 * through to an empty `due`. So a real voucher read "Issued · Pay by" with
 * nothing after either word.
 *
 * The stored date is the answer whenever there is one; the demo formula is
 * reached only by the demo strings it was written for, so a demo voucher reads
 * exactly as before. A date a real voucher does not carry is "—", never a
 * guess — the server stamps both when the voucher is sent.
 */
export function pvDisplayDates(
	pv: Pick<PrPaymentVoucher, "issued" | "due">,
	t: PortalTranslations,
): { issued: string; payBy: string } {
	return {
		issued: isoDayLabel(pv.issued, t) ?? (pv.issued.trim() || "—"),
		payBy: isoDayLabel(pv.due, t) ?? (resolvePvPayByDue(pv).trim() || "—"),
	};
}
