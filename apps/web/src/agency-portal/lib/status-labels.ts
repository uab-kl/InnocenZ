import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/**
 * DATABASE ENUMS, AS WORDS.
 *
 * Three screens printed a backend enum straight into a pill: `agency_pr.tier`
 * as `tier_1`, `outlet.status` as "pending review" (its underscores swapped by
 * a regex), and `collection_invoice.status` as `issued`. A machine value with
 * `.replace(/_/g, " ")` run over it is not a translation — it is still the
 * database's vocabulary, still English, on screens an operator may be reading
 * in Chinese.
 *
 * They live together because they are one habit rather than three bugs, and a
 * fourth enum reaching a screen should land here rather than inline.
 *
 * ⚠️ Each falls back to the raw value rather than to a blank or a guess. A value
 * the backend adds later is then visibly untranslated — which is a prompt to add
 * it — instead of silently disappearing off the pill it belongs on.
 */
export function outletStatusLabel(
	status: string | null | undefined,
	t: PortalTranslations,
): string {
	switch (status) {
		case "pending_review":
			return t.agencyMisc.outletStatusPendingReview;
		case "active":
			return t.agencyMisc.outletStatusActive;
		case "inactive":
			return t.agencyMisc.outletStatusInactive;
		case "suspended":
			return t.agencyMisc.outletStatusSuspended;
		default:
			return status ?? "";
	}
}

export function collectionInvoiceStatusLabel(
	status: string | null | undefined,
	t: PortalTranslations,
): string {
	switch (status) {
		case "draft":
			return t.subscription.invoiceStatusDraft;
		case "issued":
			return t.subscription.invoiceStatusIssued;
		case "settled":
			return t.subscription.invoiceStatusSettled;
		case "void":
			return t.subscription.invoiceStatusVoid;
		default:
			return status ?? "";
	}
}
