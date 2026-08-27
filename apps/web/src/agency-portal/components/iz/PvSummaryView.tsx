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
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

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
	const { t } = usePortalLocale();
	const isWeekly = Boolean(pv.weekStartIso && weekSummary);
	const weeklyNote =
		isWeekly && weekSummary ? (
			<p className="iz-tiny iz-muted2 px-4 pt-3">
				{fill(t.izPv.weeklyNote, {
					total: formatRM(weekSummary.totals.net),
					days: fill(
						weekSummary.verifiedDayCount === 1
							? t.izPv.verifiedDayOne
							: t.izPv.verifiedDayMany,
						{ n: weekSummary.verifiedDayCount },
					),
					day: weekSummary.issueDayLabel,
				})}
			</p>
		) : null;

	const summaryGrid = (
		<div className="iz-pv-summary-grid">
			<SummaryRow label={t.izPv.payee} value={payee.name} highlight />
			{formatPayeeField(payee.code) && (
				<SummaryRow label={t.izPv.payeeCode} value={payee.code} />
			)}
			{formatPayeeField(payee.ic) && (
				<SummaryRow label={t.izPv.icPassport} value={payee.ic} />
			)}
			{formatPayeeField(payee.phone) && (
				<SummaryRow label={t.izPv.phone} value={payee.phone} />
			)}
			<SummaryRow label={t.izPv.week} value={pv.cycle} highlight />
			<SummaryRow label={t.history.issued} value={pv.issued} />
			<SummaryRow label={t.izPv.dueSignBy} value={pv.due} />
			<SummaryRow label={t.table.outlet} value={pv.outlet} />
			{isWeekly && weekSummary ? (
				<>
					<SummaryRow
						label={t.izPv.weekTotal}
						value={formatRM(weekSummary.totals.net)}
						highlight
					/>
					{/* One whole line, not "Wages" + amount + "Comm" + amount glued:
					    the two amounts sit MID-sentence and Chinese orders the
					    label and its figure differently. */}
					<SummaryRow
						label={t.izPv.breakdown}
						value={fill(t.izPv.breakdownWagesComm, {
							wages: formatRM(weekSummary.totals.wages),
							comm: formatRM(
								weekSummary.totals.drinks +
									weekSummary.totals.tips +
									weekSummary.totals.tables,
							),
						})}
					/>
				</>
			) : (
				<>
					{pv.shiftTime && (
						<SummaryRow label={t.izPv.shift} value={pv.shiftTime} />
					)}
					{pv.timeIn && <SummaryRow label={t.izPv.timeIn} value={pv.timeIn} />}
					{pv.timeOut && (
						<SummaryRow label={t.izPv.timeOut} value={pv.timeOut} />
					)}
				</>
			)}
			{pv.receiptIds && pv.receiptIds.length > 0 && (
				<SummaryRow
					label={t.payroll.receiptScans}
					value={fill(
						isWeekly ? t.izPv.receiptsThisWeek : t.izPv.receiptsOnThisShift,
						{ n: pv.receiptIds.length },
					)}
				/>
			)}
			{!hideSignatureDetails && pv.financeHeadSignedAt && (
				<SummaryRow
					label={t.izPv.financeHead}
					value={`${pv.financeHeadName} · ${pv.financeHeadSignedAt}`}
				/>
			)}
			{!hideSignatureDetails && pv.prSignedAt && (
				<SummaryRow label={t.izPv.prSigned} value={pv.prSignedAt} />
			)}
			{pv.paidAt && <SummaryRow label={t.history.paid} value={pv.paidAt} />}
			{pv.bankRef && <SummaryRow label={t.izPv.bankRef} value={pv.bankRef} />}
		</div>
	);

	const bankBlock = (
		<div className="iz-pv-summary-bank">
			<div className="iz-pv-summary-bank-lbl">{t.izPv.paymentTo}</div>
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
			<div className="iz-pv-summary-table-h">{t.izPv.breakdown}</div>
			<div className="iz-data-table-wrap">
				<table className="iz-data-table">
					<thead>
						<tr>
							<th>#</th>
							<th>{t.history.colDate}</th>
							<th>{t.izPv.description}</th>
							<th>{t.table.outlet}</th>
							<th>{t.izPv.ref}</th>
							<th className="text-right">{t.izPv.amount}</th>
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
							<td colSpan={5}>{t.payroll.subtotal}</td>
							<td className="text-right">{formatRM(getPvSalesTotal(pv))}</td>
						</tr>
						{pv.deduct > 0 && (
							<tr className="iz-data-table-tot">
								<td colSpan={5}>{t.payroll.deductions}</td>
								<td className="text-right text-[var(--iz-red)]">
									-{formatRM(pv.deduct)}
								</td>
							</tr>
						)}
						{!collapseNetDetails && (
							<tr className="iz-data-table-tot">
								<td colSpan={5}>
									<b>{t.payroll.netPayable}</b>
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
								<span className="iz-pv-summary-hero-lbl">
									{t.payroll.netPayable}
								</span>
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
					<div className="iz-pv-summary-hero-lbl">{t.payroll.netPayable}</div>
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
