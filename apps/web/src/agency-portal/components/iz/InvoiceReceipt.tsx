import { formatRM } from "@agency-portal/components/iz/ui";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Printer } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fetchInvoicePaymentDetail } from "@/services/subscription-payment";

/**
 * THE RECEIPT BEHIND A PAID PERIOD — what the payer can actually show someone.
 *
 * Built from the same call the admin's panel uses, scoped to the owner by the
 * server, so the two sides read one record. Every line is a fact from the
 * database: the invoice number the DB minted, the period, the lane, the amount,
 * the settled attempt's method and reference, and who paid whom. Nothing is
 * composed from assumptions — a period marked paid with no attempt behind it
 * says so, rather than inventing a method.
 *
 * Inline under the row rather than a sheet, so it works everywhere the row is
 * rendered — including inside the paid-periods disclosure.
 */
export function InvoiceReceipt({ invoiceId }: { invoiceId: string }) {
	const { t } = usePortalLocale();
	const { logout } = useAuth();
	const { data, isLoading } = useQuery({
		queryKey: ["invoice-payment-detail", invoiceId],
		queryFn: () => fetchInvoicePaymentDetail(invoiceId, logout),
		staleTime: 60_000,
	});

	if (isLoading || !data) {
		return (
			<p className="iz-tiny iz-muted py-2">{t.subscription.loadingCard}</p>
		);
	}

	const { invoice, payments, org } = data;
	const settled = payments.find((p) => p.status === "succeeded") ?? null;
	const methodLabel = settled
		? settled.methodType === "fpx"
			? t.subscription.savedFpxLink
			: settled.methodType === "fpx_mandate"
				? t.subscription.savedFpx
				: settled.methodType === "ewallet"
					? t.subscription.methodEwallet
					: settled.methodType === "manual_transfer"
						? t.subscription.savedTransfer
						: t.subscription.methodCard
		: null;
	const paidOn = settled?.paidAt ?? invoice.paidAt;

	const Row = ({ label, value }: { label: string; value: string }) => (
		<div className="iz-between gap-3 py-1.5">
			<span className="iz-tiny iz-muted">{label}</span>
			<span className="iz-tiny text-right font-semibold">{value}</span>
		</div>
	);

	return (
		<div className="iz-receipt mt-2 rounded-xl border border-[var(--iz-line)] bg-[rgba(255,255,255,0.02)] p-3">
			<div className="iz-between mb-1">
				<p className="iz-sm font-semibold">
					{t.subscription.receiptTitle} · {invoice.invoiceNo}
				</p>
				<button
					type="button"
					className="iz-btn iz-btn-soft !px-2 !py-1"
					onClick={() => window.print()}
					aria-label={t.subscription.receiptPrint}
				>
					<Printer className="h-3.5 w-3.5" />
				</button>
			</div>
			<div className="divide-y divide-[var(--iz-line)]">
				<Row
					label={t.subscription.receiptPeriod}
					value={`${format(parseISO(invoice.periodStart), "d MMM yyyy")} – ${format(parseISO(invoice.periodEnd), "d MMM yyyy")}`}
				/>
				<Row label={t.adminService.planLabel} value={invoice.planName} />
				{/* The arithmetic behind the total, when there is any: plan price,
				    what was deducted and why, or the upgrade difference. */}
				{invoice.kind === "upgrade" && (
					<Row
						label={t.subscription.receiptUpgrade}
						value={invoice.note ?? formatRM(Number(invoice.baseAmount))}
					/>
				)}
				{Number(invoice.creditApplied) > 0 && (
					<>
						<Row
							label={t.subscription.receiptBase}
							value={formatRM(Number(invoice.baseAmount))}
						/>
						<Row
							label={t.subscription.receiptCredit}
							value={`−${formatRM(Number(invoice.creditApplied))}`}
						/>
						{invoice.note && (
							<p className="iz-tiny iz-muted2 py-1">{invoice.note}</p>
						)}
					</>
				)}
				<Row
					label={t.subscription.receiptFrom}
					value={org?.name ?? invoice.subscriberName}
				/>
				<Row label={t.subscription.receiptTo} value="InnocenZ" />
				{paidOn && (
					<Row
						label={t.subscription.receiptPaidOn}
						value={format(parseISO(paidOn), "d MMM yyyy, h:mm a")}
					/>
				)}
				{methodLabel && (
					<Row label={t.subscription.receiptPaidBy} value={methodLabel} />
				)}
				{settled?.reference && (
					<Row
						label={t.subscription.receiptReference}
						value={settled.reference}
					/>
				)}
				<div className="iz-between gap-3 pt-2">
					<span className="iz-sm font-semibold">
						{t.subscription.receiptTotal}
					</span>
					<span className="font-sora text-base font-bold text-[var(--iz-green)]">
						{formatRM(Number(settled?.amount ?? invoice.amount))}
					</span>
				</div>
			</div>
			{!settled && (
				<p className="iz-tiny iz-muted2 mt-2">
					{t.subscription.receiptNoPayment}
				</p>
			)}
		</div>
	);
}
