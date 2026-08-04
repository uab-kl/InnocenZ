import { LabelWithIcon } from "@agency-portal/components/iz/TitleWithIcon";
import {
	formatRM,
	IzCard,
	IzKpiLabel,
	IzPill,
} from "@agency-portal/components/iz/ui";
import { PrWeeklyPaymentGrid } from "@agency-portal/components/pr/PrWeeklyPaymentGrid";
import type { PrPaymentVoucher } from "@agency-portal/lib/pr-demo";
import {
	buildPaymentHistoryRecords,
	type PaymentHistoryRecord,
	paymentHistoryStatusLabel,
	paymentHistoryStatusMeta,
	paymentHistoryStatusPillVariant,
	paymentHistoryWeekSummary,
} from "@agency-portal/lib/pr-payment-history";
import { buildWeeklyPaymentSummary } from "@agency-portal/lib/pr-weekly-payment";
import { cn } from "@agency-portal/lib/utils";
import { Link } from "@tanstack/react-router";
import { ChevronDown, FileText, Sheet } from "lucide-react";
import { useState } from "react";

type PaymentHistStatus = PaymentHistoryRecord["status"] | "";

const STATUS_CHIP_OPTIONS: { value: PaymentHistStatus; label: string }[] = [
	{ value: "", label: "All" },
	{ value: "PAID", label: "Paid" },
	{ value: "SIGNED", label: "Signed" },
];

export function PaymentHistStatusChips({
	value,
	onChange,
	className,
	showLabel = false,
}: {
	value: PaymentHistStatus;
	onChange: (status: PaymentHistStatus) => void;
	className?: string;
	showLabel?: boolean;
}) {
	return (
		<div className={className}>
			{showLabel && (
				<p className="iz-tiny iz-muted2 mb-1.5 font-semibold tracking-wide">
					Status
				</p>
			)}
			<div
				className="iz-payroll-tabs"
				role="group"
				aria-label="Filter by payment status"
			>
				{STATUS_CHIP_OPTIONS.map((opt) => (
					<button
						key={opt.value || "all"}
						type="button"
						className={cn("iz-payroll-tab", value === opt.value && "on")}
						aria-pressed={value === opt.value}
						onClick={() => onChange(opt.value)}
					>
						{opt.label}
					</button>
				))}
			</div>
		</div>
	);
}

function PaymentHistoryCard({
	record,
	pv,
	onDownloadPdf,
	onDownloadCsv,
}: {
	record: PaymentHistoryRecord;
	pv: PrPaymentVoucher;
	onDownloadPdf?: (pv: PrPaymentVoucher) => void;
	onDownloadCsv?: (pv: PrPaymentVoucher) => void;
}) {
	const [open, setOpen] = useState(false);
	const weekSummary = pv.weekStartIso
		? buildWeeklyPaymentSummary({ weekStartIso: pv.weekStartIso, pv })
		: null;
	const synced = weekSummary ? paymentHistoryWeekSummary(pv) : null;
	const statusTone = paymentHistoryStatusPillVariant(record.status);

	return (
		<IzCard
			className={cn("iz-pay-hist-card", `iz-pay-hist-card--${statusTone}`)}
		>
			<button
				type="button"
				className="iz-pay-hist-card__head"
				onClick={() => setOpen((o) => !o)}
			>
				<div className="min-w-0 flex-1 text-left">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-sora text-sm font-bold text-[var(--iz-txt)]">
							{record.weekLabel}
						</span>
						<IzPill variant={statusTone}>
							{paymentHistoryStatusLabel(record.status)}
						</IzPill>
					</div>
					<p className="iz-tiny iz-muted2 mt-0.5">
						{record.pvId} · {record.outlet}
					</p>
					<p className="iz-tiny iz-muted mt-1">
						{record.shiftDays} shift{record.shiftDays !== 1 ? "s" : ""} · Issued{" "}
						{record.issued}
					</p>
					<p
						className={cn(
							"iz-tiny mt-0.5 font-semibold",
							statusTone === "green" && "text-[var(--iz-green)]",
							statusTone === "amber" && "text-[var(--iz-amber)]",
						)}
					>
						{paymentHistoryStatusMeta(record)}
					</p>
				</div>
				<div className="shrink-0 text-right">
					<p className="font-sora text-base font-extrabold text-[var(--iz-gold)]">
						{formatRM(record.net)}
					</p>
					<ChevronDown
						className={`iz-pay-hist-card__chev ml-auto${open ? " open" : ""}`}
					/>
				</div>
			</button>

			<div className="iz-pay-hist-card__metrics">
				<div>
					<LabelWithIcon label="Wages" className="l" />
					<span className="v wages">{formatRM(record.wages)}</span>
				</div>
				<div>
					<LabelWithIcon label="Commission" className="l" />
					<span className="v comm">{formatRM(record.commission)}</span>
				</div>
				{record.earlyWithdrawal > 0 && (
					<div>
						<LabelWithIcon label="Early withdrawal" className="l" />
						<span className="v deduct">
							−{formatRM(record.earlyWithdrawal)}
						</span>
					</div>
				)}
				{record.deductions > 0 && (
					<div>
						<LabelWithIcon label="Other" className="l" />
						<span className="v deduct">−{formatRM(record.deductions)}</span>
					</div>
				)}
			</div>

			{open && (
				<div className="iz-pay-hist-card__body">
					{weekSummary && (
						<div className="mb-3">
							<p className="iz-tiny iz-muted2 mb-2 tracking-wide">
								WEEK BREAKDOWN
							</p>
							<PrWeeklyPaymentGrid summary={weekSummary} large />
						</div>
					)}

					<div className="iz-data-table-wrap">
						<table className="iz-data-table iz-pay-hist-lines">
							<thead>
								<tr>
									<th>Date</th>
									<th>Type</th>
									<th>Outlet</th>
									<th className="text-right">Amount</th>
								</tr>
							</thead>
							<tbody>
								{(synced?.rows ?? pv.rows).map((row) => (
									<tr key={`${row.i}-${row.desc}`}>
										<td>
											{row.date}
											<div className="iz-tiny iz-muted2">{row.day}</div>
										</td>
										<td>{row.desc}</td>
										<td>{row.outlet}</td>
										<td
											className={`text-right font-semibold${
												row.desc.toLowerCase().includes("withdrawal")
													? " text-[var(--iz-red)]"
													: " text-[var(--iz-gold-l)]"
											}`}
										>
											{row.desc.toLowerCase().includes("withdrawal") ? "−" : ""}
											{formatRM(row.amt)}
										</td>
									</tr>
								))}
							</tbody>
							<tfoot>
								<tr className="iz-data-table-tot">
									<td colSpan={3}>Net payable</td>
									<td className="text-right font-bold text-[var(--iz-gold)]">
										{formatRM(record.net)}
									</td>
								</tr>
								{record.bankRef && record.status === "PAID" && (
									<tr>
										<td colSpan={4} className="iz-tiny iz-muted2 pt-1">
											Bank ref: {record.bankRef}
										</td>
									</tr>
								)}
							</tfoot>
						</table>
					</div>

					<div className="iz-pay-hist-card__actions">
						<Link
							to="/host/PaymentVoucher"
							search={{ pvId: record.pvId }}
							className="iz-btn iz-btn-soft iz-btn-sm"
						>
							Open PV
						</Link>
						{onDownloadPdf && record.status === "PAID" && (
							<button
								type="button"
								className="iz-btn iz-btn-ghost iz-btn-sm"
								onClick={() => onDownloadPdf(pv)}
							>
								<FileText className="h-3.5 w-3.5" /> PDF
							</button>
						)}
						{onDownloadCsv && (
							<button
								type="button"
								className="iz-btn iz-btn-ghost iz-btn-sm"
								onClick={() => onDownloadCsv(pv)}
							>
								<Sheet className="h-3.5 w-3.5" /> Excel
							</button>
						)}
					</div>
				</div>
			)}
		</IzCard>
	);
}

export function PrPaymentHistoryPanel({
	vouchers,
	onDownloadPdf,
	onDownloadCsv,
	hideHeader = false,
	statusFilter = "",
	onStatusFilterChange,
}: {
	vouchers: PrPaymentVoucher[];
	onDownloadPdf?: (pv: PrPaymentVoucher) => void;
	onDownloadCsv?: (pv: PrPaymentVoucher) => void;
	hideHeader?: boolean;
	statusFilter?: PaymentHistStatus;
	onStatusFilterChange?: (status: PaymentHistStatus) => void;
}) {
	const records = buildPaymentHistoryRecords(vouchers);
	const pvById = Object.fromEntries(vouchers.map((p) => [p.id, p]));
	const paidRecords = records.filter((r) => r.status === "PAID");
	const signedRecords = records.filter((r) => r.status === "SIGNED");
	const totalPaid = paidRecords.reduce((s, r) => s + r.net, 0);
	const totalSigned = signedRecords.reduce((s, r) => s + r.net, 0);
	const totalShifts = records.reduce((s, r) => s + r.shiftDays, 0);
	const totalNet = totalPaid + totalSigned;

	const netLabel =
		statusFilter === "PAID"
			? "Paid"
			: statusFilter === "SIGNED"
				? "Signed"
				: "Total net";
	const netAmount =
		statusFilter === "PAID"
			? totalPaid
			: statusFilter === "SIGNED"
				? totalSigned
				: totalNet;
	const netTone =
		statusFilter === "PAID"
			? "text-[var(--iz-green)]"
			: statusFilter === "SIGNED"
				? "text-[var(--iz-amber)]"
				: "text-[var(--iz-gold-l)]";

	return (
		<div className={hideHeader ? "" : "mt-4"}>
			{!hideHeader && (
				<div className="iz-pay-hist-hero">
					<div>
						<p className="iz-pay-hist-hero__title">Payment history</p>
					</div>
				</div>
			)}

			{onStatusFilterChange && (
				<PaymentHistStatusChips
					className={hideHeader ? "mb-2.5" : "mt-3"}
					value={statusFilter}
					onChange={onStatusFilterChange}
				/>
			)}

			{records.length > 0 && (
				<>
					<div
						className={cn(
							"iz-grid3",
							hideHeader && !onStatusFilterChange ? "mt-0" : "mt-2.5",
						)}
					>
						<div className="iz-stat-tile">
							<div className="n">{records.length}</div>
							<IzKpiLabel>Weeks</IzKpiLabel>
						</div>
						<div className="iz-stat-tile">
							<div className="n">{totalShifts}</div>
							<IzKpiLabel>Shifts</IzKpiLabel>
						</div>
						<div className="iz-stat-tile">
							<div className={cn("n", netTone)}>{formatRM(netAmount)}</div>
							<IzKpiLabel>{netLabel}</IzKpiLabel>
						</div>
					</div>
					{!statusFilter && paidRecords.length + signedRecords.length > 0 && (
						<p className="iz-tiny iz-muted2 mt-2 text-center">
							{paidRecords.length > 0 && (
								<span className="font-semibold text-[var(--iz-green)]">
									{paidRecords.length} paid · {formatRM(totalPaid)}
								</span>
							)}
							{paidRecords.length > 0 && signedRecords.length > 0 && (
								<span className="mx-1.5 text-[var(--iz-muted)]">·</span>
							)}
							{signedRecords.length > 0 && (
								<span className="font-semibold text-[var(--iz-amber)]">
									{signedRecords.length} signed · {formatRM(totalSigned)}
								</span>
							)}
						</p>
					)}
				</>
			)}

			{records.length === 0 && !hideHeader ? (
				<IzCard flat className="mt-4 px-4 py-8 text-center">
					<p className="text-sm font-semibold">No payments yet</p>
					<Link to="/host/PaymentVoucher" className="iz-btn iz-btn-soft mt-3">
						Open Payment
					</Link>
				</IzCard>
			) : records.length > 0 ? (
				<div className="iz-pay-hist-list mt-3">
					{records.map((record) => (
						<PaymentHistoryCard
							key={record.pvId}
							record={record}
							pv={pvById[record.pvId]}
							onDownloadPdf={onDownloadPdf}
							onDownloadCsv={onDownloadCsv}
						/>
					))}
				</div>
			) : null}
		</div>
	);
}
