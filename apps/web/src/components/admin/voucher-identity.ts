import { portalRoleLabel } from "@/lib/portal-i18n/portal-role-label";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/**
 * WHICH DOCUMENT A ROW IS, AND WHO PUT THEIR NAME TO IT — for the admin list.
 *
 * The admin sees every agency at once, and it showed no voucher number at all:
 * rows were told apart by PR name alone. Adding the number is not enough on its
 * own, because numbering is PER AGENCY (0152) — the live list holds two
 * "PV-000001"s that are two different companies' documents. So the number never
 * travels without its agency.
 *
 * Nor did it show when either party signed, which is the first thing an
 * escalation asks: had the agency attested this figure, had the PR agreed to it.
 */

type SignedVoucher = {
	financeHeadName: string | null;
	financeHeadRole: string | null;
	financeHeadSignedAt: string | null;
	prSignedAt: string | null;
};

/** The printed number, or "—" for a voucher that was never numbered. */
export function voucherNumberLabel(voucher: {
	voucherNo: string | null;
}): string {
	return voucher.voucherNo?.trim() || "—";
}

/**
 * "Jane Tan · Owner · 14/09/2026, 10:02" — who signed for the agency, in what
 * capacity, when. Null while the agency has not signed. A voucher signed before
 * the capacity was recorded (0149) names the signer without guessing a title.
 */
export function agencySignLine(
	voucher: SignedVoucher,
	t: PortalTranslations,
	formatWhen: (iso: string) => string,
): string | null {
	if (!voucher.financeHeadSignedAt) return null;
	return [
		voucher.financeHeadName,
		voucher.financeHeadRole
			? portalRoleLabel(voucher.financeHeadRole, t)
			: null,
		formatWhen(voucher.financeHeadSignedAt),
	]
		.filter((part): part is string => Boolean(part?.trim()))
		.join(" · ");
}

/** When the PR counter-signed, or null while they have not. */
export function prSignLine(
	voucher: SignedVoucher,
	formatWhen: (iso: string) => string,
): string | null {
	return voucher.prSignedAt ? formatWhen(voucher.prSignedAt) : null;
}
