import { formatRM } from "@agency-portal/components/iz/ui";
import {
	getPvNetTotal,
	getPvSalesTotal,
	type PrPaymentVoucher,
} from "@agency-portal/lib/pr-demo";
import type { WeeklyPaymentSummary } from "@agency-portal/lib/pr-weekly-payment";
import {
	formatPayeeField,
	PV_TEMPLATE_ISSUER,
	type PvPayeeProfile,
} from "@agency-portal/lib/pv-template";
import { ChevronDown } from "lucide-react";

export function PvSummaryView({
	pv,
	payee,
	weekSummary,
	className,
	collapseNetDetails = false,
	hideSignatureDetails = false,
}: {
	pv: PrPaymentVoucher;
	payee: PvPayeeProfile;
	weekSummary?: WeeklyPaymentSummary | null;
	className?: string;
	collapseNetDetails?: boolean;
	/** Hide Finance Head / PR e-sign rows while a dispute is open */
	hideSignatureDetails?: boolean;
}) {
	const isWeekly = Boolean(pv.weekStartIso && weekSummary);
	const weeklyNote =
		isWeekly && weekSummary ? (
			<p className="iz-tiny iz-muted2 px-4 pt-3">
				Week total {formatRM(weekSummary.totals.net)} ·{" "}
				{weekSummary.verifiedDayCount} verified day
				{weekSummary.verifiedDayCount !== 1 ? "s" : ""} · PV on{" "}
				{weekSummary.issueDayLabel} (Sun)
			</p>
		) : null;

	const summaryGrid = (
		<div className="iz-pv-summary-grid">
			<SummaryRow label="Payee" value={payee.name} highlight />
			{formatPayeeField(payee.code) && (
				<SummaryRow label="Code" value={payee.code} />
			)}
			{formatPayeeField(payee.ic) && (
				<SummaryRow label="IC / Passport" value={payee.ic} />
			)}
			{formatPayeeField(payee.phone) && (
				<SummaryRow label="Phone" value={payee.phone} />
			)}
			<SummaryRow label="Week" value={pv.cycle} highlight />
			<SummaryRow label="Issued" value={pv.issued} />
			<SummaryRow label="Due (sign-by)" value={pv.due} />
			<SummaryRow label="Outlet" value={pv.outlet} />
			{isWeekly && weekSummary ? (
				<>
					<SummaryRow
						label="Week total"
						value={formatRM(weekSummary.totals.net)}
						highlight
					/>
					<SummaryRow
						label="Breakdown"
						value={`Wages ${formatRM(weekSummary.totals.wages)} · Comm ${formatRM(weekSummary.totals.drinks + weekSummary.totals.tips + weekSummary.totals.tables)}`}
					/>
				</>
			) : (
				<>
					{pv.shiftTime && <SummaryRow label="Shift" value={pv.shiftTime} />}
					{pv.timeIn && <SummaryRow label="Time-In" value={pv.timeIn} />}
					{pv.timeOut && <SummaryRow label="Time-Out" value={pv.timeOut} />}
				</>
			)}
			{pv.receiptIds && pv.receiptIds.length > 0 && (
				<SummaryRow
					label="Receipt scans"
					value={
						isWeekly
							? `${pv.receiptIds.length} this week`
							: `${pv.receiptIds.length} on this shift`
					}
				/>
			)}
			{!hideSignatureDetails && pv.financeHeadSignedAt && (
				<SummaryRow
					label="Finance Head"
					value={`${pv.financeHeadName} · ${pv.financeHeadSignedAt}`}
				/>
			)}
			{!hideSignatureDetails && pv.prSignedAt && (
				<SummaryRow label="PR signed" value={pv.prSignedAt} />
			)}
			{pv.paidAt && <SummaryRow label="Paid" value={pv.paidAt} />}
			{pv.bankRef && <SummaryRow label="Bank ref" value={pv.bankRef} />}
		</div>
	);

	const bankBlock = (
		<div className="iz-pv-summary-bank">
			<div className="iz-pv-summary-bank-lbl">Payment to</div>
			<div className="iz-pv-summary-bank-val">
				{[
					PV_TEMPLATE_ISSUER.paymentMethod,
					formatPayeeField(payee.bank),
					formatPayeeField(payee.accountName),
					formatPayeeField(payee.accountNo),
				]
					.filter(Boolean)
					.join(" · ") || "—"}
			</div>
		</div>
	);

	const lineItemsTable = pv.rows.length > 0 && (
		<div className="iz-pv-summary-table-card">
			<div className="iz-pv-summary-table-h">Breakdown</div>
			<div className="iz-data-table-wrap">
				<table className="iz-data-table">
					<thead>
						<tr>
							<th>#</th>
							<th>Date</th>
							<th>Description</th>
							<th>Outlet</th>
							<th>Ref</th>
							<th className="text-right">Amount</th>
						</tr>
					</thead>
					<tbody>
						{pv.rows.map((r) => (
							<tr key={r.i}>
								<td>{r.i}</td>
								<td>
									{r.date}
									<div className="iz-tiny iz-muted2">{r.day}</div>
								</td>
								<td>{r.desc}</td>
								<td>{r.outlet}</td>
								<td>{r.ref}</td>
								<td className="text-right font-semibold text-[var(--iz-gold-l)]">
									{formatRM(r.amt)}
								</td>
							</tr>
						))}
					</tbody>
					<tfoot>
						<tr className="iz-data-table-tot">
							<td colSpan={5}>Subtotal</td>
							<td className="text-right">{formatRM(getPvSalesTotal(pv))}</td>
						</tr>
						{pv.deduct > 0 && (
							<tr className="iz-data-table-tot">
								<td colSpan={5}>Deductions</td>
								<td className="text-right text-[var(--iz-red)]">
									-{formatRM(pv.deduct)}
								</td>
							</tr>
						)}
						{!collapseNetDetails && (
							<tr className="iz-data-table-tot">
								<td colSpan={5}>
									<b>Net payable</b>
								</td>
								<td className="text-right">
									<b className="text-[var(--iz-gold)]">
										{formatRM(getPvNetTotal(pv))}
									</b>
								</td>
							</tr>
						)}
					</tfoot>
				</table>
			</div>
		</div>
	);

	if (collapseNetDetails) {
		return (
			<div className={className}>
				<div className="iz-pv-summary">
					<details className="iz-pv-summary-details">
						<summary className="iz-pv-summary-details-toggle">
							<span className="iz-pv-summary-details-copy">
								<span className="iz-pv-summary-hero-lbl">Net payable</span>
								<span className="iz-pv-summary-hero-amt iz-pv-summary-hero-amt--compact">
									{formatRM(getPvNetTotal(pv))}
								</span>
							</span>
							<ChevronDown className="iz-pv-summary-details-chevron h-4 w-4 shrink-0" />
						</summary>
						<div className="iz-pv-summary-details-body">
							{weeklyNote}
							{summaryGrid}
							{bankBlock}
							{lineItemsTable}
						</div>
					</details>
				</div>
			</div>
		);
	}

	return (
		<div className={className}>
			<div className="iz-pv-summary">
				<div className="iz-pv-summary-hero">
					<div className="iz-pv-summary-hero-lbl">Net payable</div>
					<div className="iz-pv-summary-hero-amt">
						{formatRM(getPvNetTotal(pv))}
					</div>
					{weeklyNote}
				</div>

				{summaryGrid}
				{bankBlock}
			</div>

			{lineItemsTable}
		</div>
	);
}

function SummaryRow({
	label,
	value,
	highlight,
}: {
	label: string;
	value: string;
	highlight?: boolean;
}) {
	return (
		<div className="iz-pv-summary-row">
			<span className="iz-pv-summary-lbl">{label}</span>
			<span className={`iz-pv-summary-val${highlight ? " highlight" : ""}`}>
				{value}
			</span>
		</div>
	);
}
