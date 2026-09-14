import { formatRM } from "@agency-portal/components/iz/ui";
import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";
import { resolvePvPrLabel } from "@agency-portal/lib/agency-payroll";
import {
	getPvSalesTotal,
	type PrPaymentVoucher,
	parsePvIssuedMs,
	resolvePvPayByDue,
} from "@agency-portal/lib/pr-demo";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { dayMonthLabel } from "@/lib/portal-i18n/date-label";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/**
 * A day as `6 Sep`, with the month word out of the dictionary rather than a
 * hardcoded `"en-GB"` — which pinned English regardless of the language switch.
 * `t` is a PARAMETER, last and with no default: module scope cannot call a hook,
 * and a default would pin the label to one language just as firmly.
 */
function shortIsoDay(iso: string, t: PortalTranslations): string {
	const d = new Date(`${iso}T00:00:00`);
	if (Number.isNaN(d.getTime())) return iso;
	return dayMonthLabel(d, t);
}

/**
 * The week a BACKEND voucher itself covers, or null for a demo one (whose
 * `cycle` string already is a date range).
 *
 * Still needed after the weeks were aligned to Sun–Sat (3 Aug 2026): the
 * backend's `cycle` column holds a CADENCE ("Weekly"), not a range, so without
 * this the row shows no dates at all and the only week on screen is the tab's.
 */
export function pvOwnWeekLabel(
	pv: PrPaymentVoucher,
	t: PortalTranslations,
): string | null {
	if (!pv.weekStartIso || !pv.weekEndIso) return null;
	const year = pv.weekEndIso.slice(0, 4);
	return `${shortIsoDay(pv.weekStartIso, t)} – ${shortIsoDay(pv.weekEndIso, t)} ${year}`;
}

/**
 * WHAT A VOUCHER CARD SAYS ABOUT ITSELF — the identity half, shared by every
 * list that shows one.
 *
 * Payroll and History each hand-rolled this, and they had drifted: History led
 * with `pv.id`, so a backed voucher announced itself as
 * `7bf3962e-591e-452f-b781-edbe1cbe6ef0` where Payroll printed `PV-000009`. It
 * also named the payee with `resolvePvPrName` instead of `resolvePvPrLabel`,
 * dropping the nickname the owner's format puts in front, and showed no week
 * worked and no pay-by at all — on the one screen whose whole subject is money
 * that has already moved. Every one of those was a copy that stopped being
 * updated, not a decision, so there is now one component and no second copy to
 * forget.
 *
 * The right-hand column is deliberately NOT here: that is where the two screens
 * genuinely differ (To pay / Net payable versus Paid / Net paid with a date-paid
 * box), and folding real differences into a shared component is how it would
 * grow flags until it was two components again.
 */
export function PvCardSummary({
	pv,
	agencyPRs,
	latestIssuedMs,
}: {
	pv: PrPaymentVoucher;
	agencyPRs: AgencyManagedPR[];
	/**
	 * Payroll only: mark the newest voucher(s) on the week. Omitted elsewhere —
	 * "latest" is a fact about a queue being worked, and History is a record.
	 */
	latestIssuedMs?: number;
}) {
	const { t } = usePortalLocale();
	const voucherNo = pv.voucherNo?.trim();
	const weekLabel = pvOwnWeekLabel(pv, t);
	const isLatest =
		latestIssuedMs !== undefined &&
		latestIssuedMs > 0 &&
		parsePvIssuedMs(pv.issued) >= latestIssuedMs;

	return (
		<div className="min-w-0">
			{/* The voucher NUMBER leads, and only a voucher that has none falls back
			    to letting the payee name be the heading. Printing the id was never a
			    fallback — a backed voucher's id is a uuid, one unbreakable token that
			    tells the reader nothing and runs past the card. */}
			{voucherNo ? (
				<div className="iz-heading break-words text-base font-bold">
					{voucherNo}
				</div>
			) : null}
			<p
				className={
					voucherNo
						? "iz-tiny iz-muted mt-0.5"
						: "iz-heading break-words text-base font-bold"
				}
			>
				{resolvePvPrLabel(pv, agencyPRs)} · {pv.outlet}
			</p>
			{pv.prIc && (
				<p className="iz-tiny iz-muted2">
					{t.outletSettings.ic} {pv.prIc}
				</p>
			)}
			<p className="iz-tiny iz-muted2 mt-0.5">
				{t.history.cycleLabel}: {pv.cycle}
			</p>
			{/* A backend voucher's own week runs Mon–Sun while the payroll tabs are
			    Sun–Sat, so a tab heading is one day out from the week the voucher
			    actually covers. Print the voucher's range rather than letting any
			    heading speak for it. */}
			{weekLabel && (
				<p className="iz-tiny iz-muted2">
					{t.agencyPv.weekWorked}: {weekLabel}
				</p>
			)}
			<p className="iz-tiny iz-muted2">
				{t.history.issued} {pv.issued} · {t.agencyHome.payBy}{" "}
				{resolvePvPayByDue(pv)}
				{isLatest && (
					<span className="ml-1 text-[var(--iz-violet)]">
						· {t.agencyPv.latest}
					</span>
				)}
			</p>
			<p className="iz-tiny text-[var(--iz-gold-l)] mt-0.5">
				{t.history.sales} {formatRM(getPvSalesTotal(pv))}
			</p>
		</div>
	);
}
